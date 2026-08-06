from __future__ import annotations

from dataclasses import asdict
import logging
import asyncio
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated, require_privileged
from repositories.db import pool
from repositories.assignment_repository import AssignmentRepository
from repositories.employee_repository import EmployeeRepository
from repositories.errors import ConflictError, NotFoundError, ValidationError
from services.audit_service import AssetEventType, audit_service
from services.authnexus_service import AuthNexusClient
from services.avatar_service import avatar_service, AvatarTooLargeError

logger = logging.getLogger(__name__)

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


class AvatarUploadBody(BaseModel):
    image_base64: str
    mime_type: str


@router.get("/me/avatar")
async def get_my_avatar(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Return the caller's own profile image (base64).
    Method/Route: GET /api/v1/employees/me/avatar
    Response: 200 envelope `{data:{image_base64, mime_type, updated_at}}`, or 200 with `data:null`
        when no image is set; 500 on error.
    Notes: Authenticated; own record only. "No avatar" is a normal empty state, not an error — it
        answers 200/`data:null` so a fresh profile does not surface as a 404 failure in logs/devtools.
    """
    try:
        data = await avatar_service.get(employee.id)
        if not data:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=success_response(message="No profile image set.", data=None, status_code=200),
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(message="Profile image retrieved.", data=data, status_code=200),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve profile image.", code="INTERNAL_ERROR", details=str(exc))


@router.put("/me/avatar")
async def set_my_avatar(
    body: AvatarUploadBody,
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Upsert the caller's own profile image.
    Method/Route: PUT /api/v1/employees/me/avatar
    Request: `{image_base64, mime_type}`; server enforces <=50 KB (decoded) + PNG/JPEG/WebP.
    Response: 200 envelope `{data:{byte_size}}`; 413 too large; 400 invalid/unsupported; 500 on error.
    Notes: Authenticated; own record only.
    """
    try:
        size = await avatar_service.set(employee.id, body.image_base64, body.mime_type)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(message="Profile image updated.", data={"byte_size": size}, status_code=200),
        )
    except AvatarTooLargeError as exc:
        return _json_error(413, message=str(exc), code="PAYLOAD_TOO_LARGE")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to update profile image.", code="INTERNAL_ERROR", details=str(exc))


@router.delete("/me/avatar")
async def delete_my_avatar(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Remove the caller's own profile image.
    Method/Route: DELETE /api/v1/employees/me/avatar
    Response: 200 envelope; 500 on error. Notes: Authenticated; own record only.
    """
    try:
        await avatar_service.delete(employee.id)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(message="Profile image removed.", data=None, status_code=200),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to remove profile image.", code="INTERNAL_ERROR", details=str(exc))


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


async def _sync_employee_to_auth_nexus(
    employee_row: Any, 
    *,
    name_changed: bool = False,
    role_changed: bool = False,
    is_create: bool = False
):
    """
    Selective best-effort sync to AuthNexus.
    Only calls APIs for fields that actually changed.
    """
    logger.debug(f"[AuthNexus Sync] Starting sync for {employee_row.employee_id} (create={is_create}, name={name_changed}, role={role_changed})")
    try:
        auth_user_id = employee_row.auth_user_id
        
        # Step 1: Provision if missing
        if not auth_user_id:
            parts = employee_row.name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else "."
            
            auth_user_id = await AuthNexusClient.create_user(
                username=employee_row.employee_id,
                email=employee_row.email,
                first_name=first_name,
                last_name=last_name
            )
            
            if auth_user_id:
                await EmployeeRepository.link_auth_user_id(
                    employee_id=employee_row.id, 
                    sub=auth_user_id
                )
                # If we just created them, we must sync the role too
                role_changed = True
            else:
                logger.warning(f"[AuthNexus Sync] User {employee_row.employee_id} not created in AuthNexus.")
                return

        # Step 2: Sync Name if changed
        if name_changed and not is_create:
            parts = employee_row.name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else "."
            await AuthNexusClient.update_user_profile(auth_user_id, first_name, last_name)

        # Step 3: Sync Role if changed
        if role_changed or is_create:
            await AuthNexusClient.assign_roles(auth_user_id, [employee_row.role])
            
    except Exception as e:
        logger.warning(f"[AuthNexus Sync] Failed for {employee_row.employee_id}: {e}")

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
        
        # Best-effort sync (inline for debugging visibility)
        await _sync_employee_to_auth_nexus(row, is_create=True)
        # Re-read so the response reflects the linked auth_user_id (the sync links it AFTER
        # the upsert, so the original `row` still has auth_user_id=None).
        row = await EmployeeRepository.get_by_id(row.id) or row

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


async def _audit_department_cascade(
    *,
    actor: EmployeeContext,
    employee_row_id: str,
    employee_name: str,
    before: Optional[str],
    after: Optional[str],
) -> None:
    """Log the department change on every asset the employee currently holds (best-effort).

    Asset department is derived from its holder, so the value already updates; this records the
    change in each asset's audit trail. Failure here must not fail the employee update.
    """
    try:
        held = await AssignmentRepository.list_held_assets_for_employee(employee_row_id)
        for asset in held:
            asset_id = asset["asset_id"]
            await audit_service.write_asset_event(
                asset_id=asset_id,
                event_type=AssetEventType.ASSET_UPDATED,
                actor=actor,
                payload={
                    "asset_tag": asset.get("asset_tag"),
                    "changes": [
                        {"field": "department", "label": "Department", "before": before, "after": after}
                    ],
                    "reason": "holder_department_changed",
                    "employee_row_id": employee_row_id,
                    "employee_name": employee_name,
                },
            )
            await audit_service.write_asset_log(
                asset_id=asset_id,
                actor=actor,
                note=f"Department changed to {after or '—'} (holder {employee_name}'s department updated).",
                metadata={"op": "employee.department_cascade", "before": before, "after": after},
            )
    except Exception:
        logger.warning("Department cascade audit failed for employee %s", employee_row_id, exc_info=True)


@router.put("/{id}")
async def update_employee(
    id: str,
    body: EmployeeUpsertBody,
    actor: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Update an existing employee record.
    Method/Route: PUT /api/v1/employees/{id}
    Request: Path `id`; Body `{employee_id, name, email?, department?, role?, is_active?}`.
    Response: 200 envelope `{data:<employee>}`; Errors: 400/404/409/500 envelope.
    Notes: Privileged only (admin/it_ops). A department change cascades to every asset the
           employee currently holds (department follows the holder) and is recorded per asset in
           the audit trail.
    """
    try:
        # Fetch old state to detect changes
        old_row = await EmployeeRepository.get_by_id(id)

        row = await EmployeeRepository.upsert(
            record_id=id,
            employee_id=body.employee_id,
            name=body.name,
            email=body.email,
            department_name=body.department,
            role=body.role or "employee",
            is_active=body.is_active if body.is_active is not None else True,
        )

        # Detect changes for selective sync
        name_changed = False
        role_changed = False
        department_changed = False
        if old_row:
            name_changed = (old_row.name != row.name)
            role_changed = (old_row.role != row.role)
            department_changed = (old_row.department != row.department)

        # Department follows the holder: record the cascade on each held asset's audit trail.
        if department_changed:
            await _audit_department_cascade(
                actor=actor,
                employee_row_id=id,
                employee_name=row.name,
                before=old_row.department if old_row else None,
                after=row.department,
            )

        # Best-effort sync
        if name_changed or role_changed or not row.auth_user_id:
            await _sync_employee_to_auth_nexus(row, name_changed=name_changed, role_changed=role_changed)

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

        # Best-effort sync (role definitely changed)
        await _sync_employee_to_auth_nexus(row, role_changed=True)

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


async def _bulk_sync_to_auth_nexus(rows: list[Any]):
    """
    Concurrent best-effort sync for bulk imports.
    1. Provision users in parallel.
    2. Link IDs.
    3. Bulk assign roles in groups.
    """
    try:
        # Step 1: Provision users who don't have auth_user_id
        to_provision = [r for r in rows if not r.auth_user_id]
        
        async def _prov(r):
            parts = r.name.split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else "."
            uid = await AuthNexusClient.create_user(
                username=r.employee_id,
                email=r.email,
                first_name=first_name,
                last_name=last_name
            )
            if uid:
                await EmployeeRepository.link_auth_user_id(employee_id=r.id, sub=uid)
                return uid
            return None

        if to_provision:
            # Process sequentially to avoid overwhelming the IDP and causing ReadTimeouts
            for r in to_provision:
                await _prov(r)
                await asyncio.sleep(0.5)  # Small delay between requests

        
        # Step 2: Re-fetch or use updated IDs for role assignment
        # We'll just re-fetch the latest state to be sure
        updated_rows = []
        for r in rows:
            latest = await EmployeeRepository.get_by_id(r.id)
            if latest and latest.auth_user_id:
                updated_rows.append(latest)
        
        # Step 3: Group by role for bulk assignment
        role_map: dict[str, list[str]] = {}
        for r in updated_rows:
            role_map.setdefault(r.role, []).append(r.auth_user_id)
        
        for role, uids in role_map.items():
            if uids:
                await AuthNexusClient.bulk_assign_roles(uids, [role])
                
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Bulk AuthNexus sync failed: {e}")

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
        inserted_rows = await EmployeeRepository.bulk_upsert(rows)
        
        # Best-effort background sync
        asyncio.create_task(_bulk_sync_to_auth_nexus(inserted_rows))

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message=f"Successfully processed {len(inserted_rows)} employees.",
                data={"inserted": len(inserted_rows)},
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
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

