from __future__ import annotations

from dataclasses import asdict
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, field_validator

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated, require_privileged
from repositories.db import pool
from repositories.employee_repository import EmployeeRepository
from repositories.errors import ConflictError, NotFoundError, ValidationError

router = APIRouter(prefix="/api/v1/employees", tags=["Employees (v1)"])


# ── helpers ──────────────────────────────────────────────────────────────────

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


def _employee_payload(row) -> dict:
    """Serialize EmployeeRow for JSON (business id in `employee_id`, UUID in `id`)."""
    return asdict(row)


# ── request schemas ───────────────────────────────────────────────────────────

class EmployeeUpsertBody(BaseModel):
    employee_id: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = "employee"
    is_active: Optional[bool] = True

    @field_validator("employee_id", "name")
    @classmethod
    def must_not_be_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v.strip()


class RoleChangeBody(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v.strip().lower() not in {"employee", "admin", "it_ops"}:
            raise ValueError("role must be employee, admin, or it_ops")
        return v.strip().lower()


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/me")
async def get_session_employee(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Return the session employee's own profile.
    Method/Route: GET /api/v1/employees/me
    Request: None (uses JWT sub).
    Response: 200 envelope `{data:<employee>}`; Errors: 404/500 envelope.
    Notes: Authenticated; any role can call this.
    """
    try:
        row = await EmployeeRepository.get_by_id(employee.id)
        if not row:
            return _json_error(404, message="Employee profile not found.", code="NOT_FOUND")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Session employee retrieved successfully.",
                data=_employee_payload(row),
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve session employee.", code="INTERNAL_ERROR", details=str(exc))


@router.get("")
async def list_employees(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default="all", alias="status"),
    department: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: List employees (directory) with filters + pagination.
    Method/Route: GET /api/v1/employees
    Request: Query `page`, `limit`, `search`, `status`(true|false|all), `department`, `role`.
    Response: 200 envelope `{data:{items,page,limit,count,total}}`; Errors: 400/500 envelope.
    Notes: Privileged only (admin/it_ops).
    """
    try:
        rows, page_meta, total = await EmployeeRepository.list_employees(
            page=page,
            limit=limit,
            search=search,
            status=status_filter,
            department=department,
            role=role,
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employees retrieved successfully.",
                data={
                    "items": [_employee_payload(r) for r in rows],
                    "page": page_meta.page,
                    "limit": page_meta.limit,
                    "count": len(rows),
                    "total": total,
                },
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve employees.", code="INTERNAL_ERROR", details=str(exc))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeUpsertBody,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Create a new employee record.
    Method/Route: POST /api/v1/employees
    Request: Body `{employee_id, name, email?, department?, role?, is_active?}`.
    Response: 201 envelope `{data:<employee>}`; Errors: 400/409/500 envelope.
    Notes: Privileged only (admin/it_ops).
    """
    try:
        row = await EmployeeRepository.upsert(
            employee_id=body.employee_id,
            name=body.name,
            email=body.email,
            department_name=body.department,
            role=body.role or "employee",
            is_active=body.is_active if body.is_active is not None else True,
        )
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=success_response(
                message="Employee created successfully.",
                data=_employee_payload(row),
                status_code=201,
            ),
        )
    except ConflictError as exc:
        return _json_error(409, message=str(exc), code="CONFLICT")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to create employee.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/{id}/portfolio")
async def get_employee_portfolio(
    id: str,
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Fetch employee profile + currently assigned assets bundle.
    Method/Route: GET /api/v1/employees/{id}/portfolio
    Request: Path `id` (employee UUID).
    Response: 200 envelope `{data:{employee,assets,total_assigned_assets}}`; Errors: 403/404/500 envelope.
    Notes: Authenticated; employee role can only access own portfolio.
    """
    try:
        if employee.role == "employee" and str(employee.id) != str(id):
            return _json_error(403, message="You do not have access to this profile.", code="FORBIDDEN")

        data = await EmployeeRepository.get_portfolio(employee_id=id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee portfolio retrieved successfully.",
                data=data,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve employee portfolio.", code="INTERNAL_ERROR", details=str(exc))



@router.get("/by-email")
async def get_employee_by_email(
    email: str = Query(...),
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    try:
        row = await EmployeeRepository.get_by_email(email)
        if not row:
            return _json_error(404, message="Employee not found.", code="NOT_FOUND")
            
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee retrieved successfully.",
                data=_employee_payload(row),
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve employee by email.", code="INTERNAL_ERROR", details=str(exc))

@router.get("/{id}")
async def get_employee(
    id: str,
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Fetch a single employee profile by UUID.
    Method/Route: GET /api/v1/employees/{id}
    Request: Path `id` (employee UUID).
    Response: 200 envelope `{data:<employee>}`; Errors: 403/404/500 envelope.
    Notes: Authenticated; employee role can only access own profile.
    """
    try:
        row = await EmployeeRepository.get_by_id(id)
        if not row:
            return _json_error(404, message="Employee not found.", code="NOT_FOUND")

        if employee.role == "employee" and str(row.id) != str(employee.id):
            return _json_error(403, message="You do not have access to this profile.", code="FORBIDDEN")

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee retrieved successfully.",
                data=_employee_payload(row),
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve employee.", code="INTERNAL_ERROR", details=str(exc))


@router.put("/{id}")
async def update_employee(
    id: str,
    body: EmployeeUpsertBody,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Update an existing employee record.
    Method/Route: PUT /api/v1/employees/{id}
    Request: Path `id`; Body `{employee_id, name, email?, department?, role?, is_active?}`.
    Response: 200 envelope `{data:<employee>}`; Errors: 400/404/409/500 envelope.
    Notes: Privileged only (admin/it_ops).
    """
    try:
        row = await EmployeeRepository.upsert(
            record_id=id,
            employee_id=body.employee_id,
            name=body.name,
            email=body.email,
            department_name=body.department,
            role=body.role or "employee",
            is_active=body.is_active if body.is_active is not None else True,
        )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee updated successfully.",
                data=_employee_payload(row),
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ConflictError as exc:
        return _json_error(409, message=str(exc), code="CONFLICT")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to update employee.", code="INTERNAL_ERROR", details=str(exc))


@router.patch("/{id}/role")
async def change_employee_role(
    id: str,
    body: RoleChangeBody,
    actor: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Change an employee's role (employee/admin/it_ops).
    Method/Route: PATCH /api/v1/employees/{id}/role
    Request: Path `id`; Body `{role}`.
    Response: 200 envelope `{data:<employee>}`; Errors: 400/403/404/500 envelope.
    Notes: Privileged only; it_ops can set any role; admin cannot promote to it_ops.
    """
    try:
        if body.role == "it_ops" and actor.role != "it_ops":
            return _json_error(403, message="Only IT Ops can assign the it_ops role.", code="FORBIDDEN")

        row = await EmployeeRepository.update_role(employee_id=id, role=body.role)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee role updated successfully.",
                data=_employee_payload(row),
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to update employee role.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/{id}/soft-delete")
async def soft_delete_employee(
    id: str,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Soft-delete an employee (moves to Recycle Bin, hides from directory).
    Method/Route: POST /api/v1/employees/{id}/soft-delete
    Request: Path `id` (employee UUID).
    Response: 200 envelope `{data:{employee_id,recycle_bin_id}}`; Errors: 400/404/500 envelope.
    Notes: Privileged only; employee must have no open asset assignments.
    """
    try:
        result = await EmployeeRepository.soft_delete(employee_id=id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee moved to Recycle Bin.",
                data=result,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to soft-delete employee.", code="INTERNAL_ERROR", details=str(exc))
@router.post("/bulk")
async def bulk_insert_employees(
    rows: list[dict[str, Any]],
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Bulk upsert employees.
    Method/Route: POST /api/v1/employees/bulk
    Request: Body `[{employee_id, name, email?, department?, role?, is_active?}]`.
    Response: 200 envelope `{data:{inserted}}`; Errors: 400/500 envelope.
    Notes: Privileged only.
    """
    try:
        count = await EmployeeRepository.bulk_upsert(rows)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message=f"Successfully processed {count} employees.",
                data={"inserted": count},
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Bulk import failed.", code="INTERNAL_ERROR", details=str(exc))
@router.post("/check-codes")
async def check_employee_business_ids(
    body: dict[str, Any],
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Check which employee codes already exist in the system.
    Method/Route: POST /api/v1/employees/check-codes
    Request: Body `{codes: [string]}`.
    Response: 200 Guideline envelope `{data:[string]}` (list of existing codes).
    Notes: Privileged only.
    """
    try:
        codes = body.get("codes", [])
        if not codes:
            return JSONResponse(status_code=200, content=success_response(message="No codes provided", data=[], status_code=200))
        
        async with pool().acquire() as conn:
            rows = await conn.fetch(
                "select employee_id from employees where employee_id = any($1::text[])",
                codes
            )
        existing = [str(r["employee_id"]) for r in rows]
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee codes checked.",
                data=existing,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to check employee codes.", code="INTERNAL_ERROR", details=str(exc))

@router.post("/check-emails")
async def check_employee_emails(
    body: dict[str, Any],
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Check which employee emails already exist in the system.
    Method/Route: POST /api/v1/employees/check-emails
    Request: Body `{emails: [string]}`.
    Response: 200 Guideline envelope `{data:[string]}` (list of existing emails).
    Notes: Privileged only.
    """
    try:
        emails = body.get("emails", [])
        if not emails:
            return JSONResponse(status_code=200, content=success_response(message="No emails provided", data=[], status_code=200))
        
        async with pool().acquire() as conn:
            rows = await conn.fetch(
                "select email from employees where email = any($1::text[])",
                emails
            )
        existing = [str(r["email"]) for r in rows if r["email"]]
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee emails checked.",
                data=existing,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to check employee emails.", code="INTERNAL_ERROR", details=str(exc))
@router.post("/asset-counts")
async def get_employee_asset_counts(
    body: dict[str, Any],
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Get counts of assigned assets for multiple employees.
    Method/Route: POST /api/v1/employees/asset-counts
    Request: Body `{ids: [string]}`.
    Response: 200 Guideline envelope `{data:{id: count, ...}}`.
    Notes: Privileged only.
    """
    try:
        ids = body.get("ids", [])
        if not ids:
            return JSONResponse(status_code=200, content=success_response(message="No IDs provided", data={}, status_code=200))
        
        async with pool().acquire() as conn:
            rows = await conn.fetch(
                """
                select current_employee_id::text as employee_id, count(*)::int as count
                  from v_asset_inventory
                 where current_employee_id = any($1::uuid[])
                 group by current_employee_id
                """,
                ids
            )
        counts = {str(r["employee_id"]): r["count"] for r in rows}
        # Ensure all requested IDs are in the response
        result = {id_: counts.get(id_, 0) for id_ in ids}
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee asset counts retrieved.",
                data=result,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve asset counts.", code="INTERNAL_ERROR", details=str(exc))

