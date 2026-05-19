from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, Optional

import jwt
from jwt import PyJWKClient, PyJWKClientConnectionError
from jwt.exceptions import InvalidTokenError

from core.settings import settings
from repositories.employee_repository import EmployeeRepository
from services.authnexus_service import AuthNexusClient
from core.roles import Role, VALID_ROLES

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmployeeContext:
    id: str
    employee_id: str
    name: str
    department: str | None
    role: Role
    sub: str


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
    if role not in VALID_ROLES:
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
) -> EmployeeContext:
    """
    Resolve the employee record for an authenticated user.

    1) Direct lookup — employees.auth_user_id == sub (always hits post-backfill)
    2) Auto-provision fallback — if user is authenticated in AN but not yet in local DB,
       fetch live AN profile and create a local employee row.
    """
    norm_sub = _norm(sub)
    if not norm_sub:
        raise PermissionError("Missing subject identifier.")

    # Step 1: Direct lookup
    emp = await EmployeeRepository.get_by_auth_user_id(norm_sub)
    if emp:
        return EmployeeContext(
            id=emp.id,
            employee_id=emp.employee_id,
            name=emp.name,
            department=emp.department,
            role=_normalize_role(emp.role),
            sub=norm_sub,
        )

    # Step 2: Auto-provision fallback
    logger.info(f"Employee {norm_sub} not found locally. Fetching profile from AuthNexus to auto-provision...")
    an_profile = await AuthNexusClient.get_user(norm_sub)
    if not an_profile:
        raise PermissionError("Employee profile not provisioned in AuthNexus.")

    # Extract user details from AN profile
    username = str(an_profile.get("userName") or "").strip()
    if not username:
        raise PermissionError("AuthNexus user profile is missing a username.")

    first_name = str(an_profile.get("firstName") or "").strip()
    last_name = str(an_profile.get("lastName") or "").strip()
    name = f"{first_name} {last_name}".strip() or username

    email = an_profile.get("email")
    role_keys = an_profile.get("roleKeys") or ["employee"]
    role = role_keys[0] if role_keys else "employee"

    logger.info(f"Auto-provisioning employee locally: username={username}, name={name}, email={email}")
    
    try:
        new_emp = await EmployeeRepository.create(
            auth_user_id=norm_sub,
            employee_id=username,
            name=name,
            email=email,
            role=role,
            department_name=None,
        )
    except Exception as exc:
        logger.error(f"Failed to auto-provision employee local row for {norm_sub}: {exc}", exc_info=True)
        raise PermissionError("Local provisioning failed.") from exc

    return EmployeeContext(
        id=new_emp.id,
        employee_id=new_emp.employee_id,
        name=new_emp.name,
        department=None,
        role=_normalize_role(new_emp.role),
        sub=norm_sub,
    )
