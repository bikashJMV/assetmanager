from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated

router = APIRouter(prefix="/api/v1/authz", tags=["AuthZ (v1)"])


def _json_error(status_code: int, *, message: str, code: str, details: str | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=error_response(
            status_code=status_code,
            message=message,
            error_code=code,
            details=details or message,
            data=None,
        ),
    )


@router.get("/admin")
async def has_admin_access(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Check whether the session has privileged access (admin or IT Ops).
    Method/Route: GET /api/v1/authz/admin
    Request: None.
    Response: 200 envelope `{data:{allowed:boolean,role:string}}`; Errors: 500 envelope.
    Notes: Authenticated (`require_authenticated`); frontend uses this for UI gating only (backend still enforces).
    """
    try:
        allowed = employee.is_active and employee.role in {"admin", "it_ops"}
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="AuthZ check completed.",
                data={"allowed": allowed, "role": employee.role},
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to evaluate access.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/itops")
async def has_it_ops_access(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Check whether the session has IT Ops access.
    Method/Route: GET /api/v1/authz/itops
    Request: None.
    Response: 200 envelope `{data:{allowed:boolean,role:string}}`; Errors: 500 envelope.
    Notes: Authenticated (`require_authenticated`); backend endpoints should still use `require_it_ops` for enforcement.
    """
    try:
        allowed = employee.is_active and employee.role == "it_ops"
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="AuthZ check completed.",
                data={"allowed": allowed, "role": employee.role},
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to evaluate access.", code="INTERNAL_ERROR", details=str(exc))

