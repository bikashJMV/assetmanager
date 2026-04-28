from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Optional

import jwt
from jwt import PyJWKClient, PyJWKClientConnectionError
from jwt.exceptions import InvalidTokenError

from core.settings import settings
from repositories.employee_repository import EmployeeRepository

logger = logging.getLogger(__name__)

Role = Literal["employee", "admin", "it_ops"]


@dataclass(frozen=True)
class EmployeeContext:
    id: str
    employee_id: str
    name: str
    department: str | None
    role: Role
    sub: str
    is_active: bool


_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            settings.AUTH_JWKS_URL,
            cache_keys=True,
            max_cached_keys=32,
        )
    return _jwks_client


def _normalize_role(raw: Any) -> Role:
    role = str(raw or "employee").strip().lower()
    if role not in {"employee", "admin", "it_ops"}:
        return "employee"
    return role  # type: ignore[return-value]


def verify_bearer_token(token: str) -> dict[str, Any]:
    """
    Verify and decode JWT using configured JWKS.

    Required claims: sub, exp, and AUTH_PROJECT_ID_CLAIM (defaults to project_id).
    Optional: issuer and audience if set via AUTH_ISSUER / AUTH_AUDIENCE.
    """
    if not settings.AUTH_ENABLED:
        raise RuntimeError("AUTH is disabled.")

    if not token or not token.strip():
        raise InvalidTokenError("Missing bearer token.")

    token = token.strip()
    jwks = _get_jwks_client()
    try:
        signing_key = jwks.get_signing_key_from_jwt(token)
    except PyJWKClientConnectionError as exc:
        raise RuntimeError("Unable to fetch token signing key.") from exc

    require_claims = ["sub", "exp", settings.AUTH_PROJECT_ID_CLAIM]

    options = {"require": require_claims, "verify_aud": bool(settings.AUTH_AUDIENCE)}
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=[signing_key.algorithm_name],
        audience=settings.AUTH_AUDIENCE or None,
        issuer=settings.AUTH_ISSUER or None,
        options=options,
        leeway=settings.AUTH_CLOCK_SKEW_SECONDS,
    )

    project_id = str(payload.get(settings.AUTH_PROJECT_ID_CLAIM) or "").strip()
    if project_id != settings.AUTH_PROJECT_ID:
        raise InvalidTokenError("Invalid project context.")

    return payload


def _norm(v: str | None) -> str:
    return (v or "").strip()


def _norm_upper(v: str | None) -> str:
    return (v or "").strip().upper()


async def resolve_employee_for_sub(
    *,
    sub: str,
    email: Optional[str],
    preferred_username: Optional[str] = None,
) -> EmployeeContext:
    """
    Resolve the employee record for an authenticated user.

    1) employees.auth_user_id == sub
    2) employees.employee_id (business id) == preferred_username (e.g. JWT preferred_username)
    3) email match + auto-link auth_user_id=sub when safe
    """
    norm_sub = _norm(sub)
    emp = await EmployeeRepository.get_by_auth_user_id(norm_sub)
    if emp:
        if not emp.is_active:
            raise PermissionError("Account inactive.")
        return EmployeeContext(
            id=emp.id,
            employee_id=emp.employee_id,
            name=emp.name,
            department=emp.department,
            role=_normalize_role(emp.role),
            sub=norm_sub,
            is_active=True,
        )

    p_un = _norm_upper(preferred_username)
    if p_un:
        by_code = await EmployeeRepository.get_by_business_employee_id(p_un)
        if by_code:
            if not by_code.is_active:
                raise PermissionError("Account inactive.")
            existing_auth = (by_code.auth_user_id or "").strip()
            if existing_auth and existing_auth != norm_sub:
                raise PermissionError("Employee already linked to a different auth user.")
            if not existing_auth:
                await EmployeeRepository.link_auth_user_id(employee_id=by_code.id, sub=norm_sub)
            return EmployeeContext(
                id=by_code.id,
                employee_id=by_code.employee_id,
                name=by_code.name,
                department=by_code.department,
                role=_normalize_role(by_code.role),
                sub=norm_sub,
                is_active=True,
            )

    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        raise PermissionError("Employee not provisioned.")

    match = await EmployeeRepository.get_by_email(normalized_email)
    if not match:
        raise PermissionError("Employee not provisioned.")
    if not match.is_active:
        raise PermissionError("Account inactive.")

    existing_auth_user_id = (match.auth_user_id or "").strip()
    if existing_auth_user_id and existing_auth_user_id != norm_sub:
        raise PermissionError("Employee already linked to a different auth user.")

    await EmployeeRepository.link_auth_user_id(employee_id=match.id, sub=norm_sub)

    return EmployeeContext(
        id=match.id,
        employee_id=match.employee_id,
        name=match.name,
        department=match.department,
        role=_normalize_role(match.role),
        sub=norm_sub,
        is_active=True,
    )
