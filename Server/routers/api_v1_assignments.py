from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_privileged
from repositories.errors import ConflictError, NotFoundError, ValidationError
from schemas.assignment import AssignAssetRequest, ReturnAssetRequest, AssignValidateRequest
from services.assignment_service import assignment_service
from repositories.assignment_write_repository import AssignmentWriteRepository
from repositories.db import pool

router = APIRouter(prefix="/api/v1/assignments", tags=["Assignments (v1)"])


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


@router.post("/assign/validate")
async def validate_assignment(
    payload: AssignValidateRequest,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Validate department matching for an asset assignment.
    Method/Route: POST /api/v1/assignments/assign/validate
    Request: JSON body `AssignValidateRequest` (`asset_tag`, `employee_id`(business_employee_id)).
    Response: 200 envelope `{data:{case, asset_dept_name, employee_dept_name}}`.
    Notes: Privileged only.
    """
    try:
        async with pool().acquire() as conn:
            result = await AssignmentWriteRepository.validate_assignment_dept(
                conn,
                asset_tag=payload.asset_tag,
                business_employee_id=payload.employee_id
            )
        
        asset_dept_id = result.get("asset_dept_id")
        employee_dept_id = result.get("employee_dept_id")
        
        case = "match"
        if asset_dept_id is None:
            case = "no_dept"
        elif asset_dept_id != employee_dept_id:
            case = "mismatch"
            
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Assignment validation complete.",
                data={
                    "case": case,
                    "asset_dept_name": result.get("asset_dept_name"),
                    "employee_dept_name": result.get("employee_dept_name"),
                },
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except Exception as exc:
        return _json_error(500, message="Validation failed.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/assign")
async def assign_asset(
    payload: AssignAssetRequest,
    request: Request,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Assign (or reassign) an asset to an employee (Postgres-first write flow).
    Method/Route: POST /api/v1/assignments/assign
    Request: JSON body `AssignAssetRequest` (`asset_tag`, `employee_id`(employee code), optional `assigned_at`, `notes`, `source`).
    Response: 200 envelope `{data:{ok,assignment_id,asset_id,asset_tag,id,employee_id,status,message}}`; Errors: 400/404/409/500 envelope.
    Notes: Privileged only (`require_privileged`); idempotent when assigning to the current holder.
    """
    try:
        request_id = getattr(request.state, "request_id", None)
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        result = await assignment_service.assign_asset(
            asset_tag=payload.asset_tag,
            business_employee_id=payload.employee_id,
            assigned_at=payload.assigned_at,
            notes=payload.notes,
            source=payload.source,
            actor=employee,
            force_dept_move=payload.force_dept_move,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset assigned successfully.",
                data=result,
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ConflictError as exc:
        return _json_error(409, message=str(exc), code="CONFLICT")
    except Exception as exc:
        return _json_error(500, message="Failed to assign asset.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/return")
async def return_asset(
    payload: ReturnAssetRequest,
    request: Request,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Return (unassign) an asset from its current holder (Postgres-first write flow).
    Method/Route: POST /api/v1/assignments/return
    Request: JSON body `ReturnAssetRequest` (`asset_tag`, optional `returned_at`, `notes`, `source`).
    Response: 200 envelope `{data:{ok,assignment_id,asset_id,asset_tag,status,message}}`; Errors: 400/404/409/500 envelope.
    Notes: Privileged only (`require_privileged`).
    """
    try:
        request_id = getattr(request.state, "request_id", None)
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        result = await assignment_service.return_asset(
            asset_tag=payload.asset_tag,
            returned_at=payload.returned_at,
            notes=payload.notes,
            source=payload.source,
            actor=employee,
            request_id=request_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset returned successfully.",
                data=result,
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ConflictError as exc:
        return _json_error(409, message=str(exc), code="CONFLICT")
    except Exception as exc:
        return _json_error(500, message="Failed to return asset.", code="INTERNAL_ERROR", details=str(exc))
