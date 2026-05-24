from __future__ import annotations

import logging
from typing import Optional

from fastapi import status
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request

from core.api_response import error_response
from core.authnexus import EmployeeContext, resolve_employee_for_sub, verify_bearer_token
from core.settings import settings

logger = logging.getLogger(__name__)


_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/docs",
    "/redoc",
    "/openapi.json",
    "/health",
    "/api/health",
    "/metrics",
    "/",
)

_EXEMPT_PATHS: set[str] = {
    "/api/auth/refresh",
    "/api/auth/set-session",
}


def _should_skip(path: str) -> bool:
    if path in {"/", "/favicon.ico"} or path in _EXEMPT_PATHS:
        return True
    return any(path == p or path.startswith(p + "/") for p in _EXEMPT_PREFIXES)


def _is_api_path(path: str) -> bool:
    return path.startswith("/api/")


class AuthMiddleware(BaseHTTPMiddleware):
    """
    AuthNexus/Zitadel JWT middleware.

    Behavior:
    - Always runs (to attach request.state.employee when a Bearer token is present).
    - If Authorization header is missing, request continues with employee=None.
    - If Authorization is present but invalid, returns 401.
    - If token is valid but employee is not provisioned/active, returns 403.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not settings.AUTH_ENABLED or _should_skip(request.url.path):
            request.state.employee = None
            return await call_next(request)

        authorization = (request.headers.get("authorization") or "").strip()
        if not authorization or not authorization.lower().startswith("bearer "):
            request.state.employee = None
            return await call_next(request)

        token = authorization[7:].strip()
        if not token:
            return self._error(
                request,
                status_code=status.HTTP_401_UNAUTHORIZED,
                message="Missing bearer token.",
                error_code="MISSING_BEARER_TOKEN",
            )

        try:
            payload = verify_bearer_token(token)
        except Exception as exc:
            logger.warning("auth_failed", extra={"path": request.url.path, "reason": str(exc)})
            return self._error(
                request,
                status_code=status.HTTP_401_UNAUTHORIZED,
                message="Invalid or expired bearer token.",
                error_code="INVALID_BEARER_TOKEN",
                details=str(exc),
            )

        sub = str(payload.get("sub") or "").strip()
        email = _extract_email(payload)
        preferred_username = _extract_preferred_username(payload)
        if not sub:
            return self._error(
                request,
                status_code=status.HTTP_401_UNAUTHORIZED,
                message="Unable to resolve authenticated user.",
                error_code="MISSING_SUB",
            )

        jwt_role = _extract_role(payload)

        try:
            employee: EmployeeContext = await resolve_employee_for_sub(
                sub=sub,
                jwt_role=jwt_role,
            )
        except PermissionError as exc:
            return self._error(
                request,
                status_code=status.HTTP_403_FORBIDDEN,
                message=str(exc) or "Active employee profile required.",
                error_code="EMPLOYEE_NOT_ALLOWED",
                details=str(exc),
            )
        except Exception as exc:
            logger.error("employee_resolution_failed: %s", str(exc), exc_info=True)
            return self._error(
                request,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                message="Unable to verify employee profile.",
                error_code="EMPLOYEE_RESOLUTION_FAILED",
                details=str(exc),
            )

        request.state.employee = employee
        return await call_next(request)

    @staticmethod
    def _error(
        request: Request,
        *,
        status_code: int,
        message: str,
        error_code: str,
        details: Optional[str] = None,
    ) -> JSONResponse:
        if _is_api_path(request.url.path):
            return JSONResponse(
                status_code=status_code,
                content=error_response(
                    status_code=status_code,
                    message=message,
                    error_code=error_code,
                    details=details or message,
                    data=None,
                ),
            )

        return JSONResponse(status_code=status_code, content={"detail": message})


def _extract_email(payload: dict) -> Optional[str]:
    for key in ("email", "preferred_username", "upn"):
        raw = payload.get(key)
        if isinstance(raw, str) and raw.strip() and "@" in raw:
            return raw.strip()
    return None


def _extract_preferred_username(payload: dict) -> Optional[str]:
    """`preferred_username` (e.g. JMV10728) is matched to `employees.employee_id`."""
    raw = payload.get("preferred_username")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def _extract_role(payload: dict) -> Optional[str]:
    """Extract role from nexus_projects[].roles[] for the configured project."""
    projects = payload.get("nexus_projects")
    if not isinstance(projects, list):
        return None
    project_id = settings.AUTH_PROJECT_ID
    for project in projects:
        if not isinstance(project, dict):
            continue
        if str(project.get("id") or "").strip() == project_id:
            roles = project.get("roles")
            if isinstance(roles, list) and roles:
                return str(roles[0]).strip().lower()
    return None
