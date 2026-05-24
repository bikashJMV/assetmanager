from __future__ import annotations

from dataclasses import asdict
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated, require_privileged
from core.roles import VALID_ROLES
from repositories.db import pool
from repositories.employee_repository import EmployeeRepository
from repositories.errors import ConflictError, NotFoundError, ValidationError
from services.authnexus_service import AuthNexusClient

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


def _parse_an_profile(an_profile: dict, *, fallback_row) -> tuple[str, str | None, str]:
    """
    Parse a flat AuthNexus GET /api/admin/users/{id} response.
    Returns (name, email, employee_id/username).
    Falls back to local row values if AN fields are absent.
    """
    first_name = (an_profile.get("firstName") or "").strip()
    last_name  = (an_profile.get("lastName")  or "").strip()
    name       = f"{first_name} {last_name}".strip() or fallback_row.name

    email      = an_profile.get("email") or fallback_row.email
    username   = an_profile.get("userName") or an_profile.get("username") or fallback_row.employee_id

    return name, email, username


# ── request schemas ───────────────────────────────────────────────────────────

class EmployeeUpsertBody(BaseModel):
    employee_id: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = "employee"

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
        if v.strip().lower() not in VALID_ROLES:
            raise ValueError("role must be employee, admin, or it_ops")
        return v.strip().lower()


class DepartmentChangeBody(BaseModel):
    department: Optional[str] = None


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
    department: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: List active employees (directory) from AuthNexus/ZITADEL project assignments.
    Method/Route: GET /api/v1/employees
    Request: Query `page`, `limit`, `search`, `department`, `role`.
    Response: 200 envelope `{data:{items,page,limit,count,total}}`; Errors: 400/500 envelope.
    Notes: Privileged only (admin/it_ops).
    """
    try:
        # Step 1: an_users = await AuthNexusClient.list_project_assignments()
        logger.info("[list_employees] Step 1: Fetching project assignments from AuthNexus")
        an_users = await AuthNexusClient.list_project_assignments()
        
        # Step 2: local_rows = await EmployeeRepository.get_local_data_by_auth_ids( [u["userId"] for u in an_users] )
        auth_ids = [u["userId"] for u in an_users if u.get("userId")]
        logger.info(f"[list_employees] Step 2: Fetching local database info for {len(auth_ids)} auth IDs")
        local_data_map = await EmployeeRepository.get_local_data_by_auth_ids(auth_ids)

        # Step 3: Merge for each AN user
        merged = []
        for user in an_users:
            auth_user_id = user.get("userId")
            if not auth_user_id:
                continue

            local_info = local_data_map.get(auth_user_id)
            if not local_info or not local_info.get("id"):
                # Auto-provision: AN user exists but has no local row yet
                try:
                    first = user.get("firstName") or ""
                    last  = user.get("lastName") or ""
                    uname = user.get("userName") or auth_user_id
                    full_name = f"{first} {last}".strip() or uname
                    role_keys_ap = user.get("roleKeys") or []
                    raw_role_ap  = role_keys_ap[0].strip().lower() if role_keys_ap else ""
                    ap_role = raw_role_ap if raw_role_ap in VALID_ROLES else "employee"
                    new_emp = await EmployeeRepository.create(
                        auth_user_id=auth_user_id,
                        employee_id=uname,
                        name=full_name,
                        email=user.get("email"),
                        role=ap_role,
                        department_name=None,
                    )
                    local_info = {"id": new_emp.id, "department": None, "assigned_asset_count": 0}
                except Exception as exc:
                    logger.warning(f"[list_employees] Could not auto-provision {auth_user_id}: {exc}")
                    continue

            # Identity from AN
            first_name = user.get("firstName") or ""
            last_name = user.get("lastName") or ""
            name = f"{first_name} {last_name}".strip() or user.get("userName") or "Unnamed User"
            email = user.get("email")
            role_keys = user.get("roleKeys") or []
            an_role = role_keys[0] if role_keys else "employee"

            # Department and asset count from local DB
            local_id = local_info.get("id")
            dept = local_info.get("department")
            asset_count = local_info.get("assigned_asset_count") or 0

            merged.append({
                "id": local_id,
                "employee_id": user.get("userName") or "",
                "name": name,
                "email": email,
                "auth_user_id": auth_user_id,
                "department": dept,
                "role": an_role,
                "assigned_asset_count": asset_count
            })

        # Step 4: Apply in-memory filters (search, department, role)
        filtered = []
        search_query = (search or "").strip().lower()
        dept_filter = (department or "").strip().lower()
        role_filter = (role or "").strip().lower()

        for item in merged:
            # 1. Search filter
            if search_query:
                emp_id = item["employee_id"].lower()
                name_val = item["name"].lower()
                email_val = (item["email"] or "").lower()
                if search_query not in emp_id and search_query not in name_val and search_query not in email_val:
                    continue

            # 2. Department filter
            if dept_filter:
                item_dept = (item["department"] or "").lower()
                if dept_filter != item_dept:
                    continue

            # 3. Role filter
            if role_filter:
                item_role = item["role"].lower()
                if role_filter != item_role:
                    continue

            filtered.append(item)

        # Sort alphabetically by name (case-insensitive)
        filtered.sort(key=lambda x: x["name"].lower())

        # Step 5: Paginate the merged result
        total = len(filtered)
        start = (page - 1) * limit
        end = start + limit
        paginated_items = filtered[start:end]

        logger.info(f"[list_employees] SUCCESS: Returning {len(paginated_items)} of {total} employees (page={page}, limit={limit})")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employees retrieved successfully.",
                data={
                    "items": paginated_items,
                    "page": page,
                    "limit": limit,
                    "count": len(paginated_items),
                    "total": total,
                },
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        logger.error(f"[list_employees] FAILED: {exc}", exc_info=True)
        return _json_error(500, message="Failed to retrieve employees.", code="INTERNAL_ERROR", details=str(exc))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeUpsertBody,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Create a new employee record.
    Method/Route: POST /api/v1/employees
    Request: Body `{employee_id, name, email?, department?, role?}`.
    Response: 201 envelope `{data:<employee>}`; Errors: 400/409/500/502 envelope.
    Notes: Privileged only (admin/it_ops).
    """
    # Parse names for identity provisioning
    parts = body.name.strip().split(" ", 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else "."

    # Step 1: Provision user in AuthNexus
    logger.info(f"[create_employee] Step 1: Creating AuthNexus user for username={body.employee_id}")
    auth_user_id = await AuthNexusClient.create_user(
        username=body.employee_id,
        first_name=first_name,
        last_name=last_name,
        email=body.email,
        initial_password="User@1234",
    )
    if not auth_user_id:
        logger.error(f"[create_employee] Step 1 FAILED: AuthNexus user creation returned None for {body.employee_id}")
        return _json_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Failed to provision user in identity provider.",
            code="IDENTITY_PROVISIONING_FAILED"
        )

    # Step 2: Assign roles in AuthNexus
    logger.info(f"[create_employee] Step 2: Assigning role {body.role} to AuthNexus user {auth_user_id}")
    role_assigned = await AuthNexusClient.assign_to_project(
        user_id=auth_user_id,
        role_keys=[body.role or "employee"]
    )
    if not role_assigned:
        logger.error(f"[create_employee] Step 2 FAILED: Role assignment failed for user {auth_user_id}. Executing compensating transaction (delete user)...")
        # Compensating transaction
        await AuthNexusClient.delete_user(auth_user_id)
        return _json_error(
            status.HTTP_502_BAD_GATEWAY,
            message="Failed to assign roles in identity provider. User creation rolled back.",
            code="IDENTITY_ROLE_ASSIGNMENT_FAILED"
        )

    # Step 3: Insert into local database
    logger.info(f"[create_employee] Step 3: Creating local employee record for {body.employee_id} (auth_user_id={auth_user_id})")
    try:
        row = await EmployeeRepository.create(
            auth_user_id=auth_user_id,
            employee_id=body.employee_id,
            name=body.name,
            email=body.email,
            department_name=body.department,
            role=body.role or "employee",
        )
    except Exception as exc:
        logger.error(f"[create_employee] Step 3 FAILED: Local database write failed: {exc}. Executing compensating transaction (delete user)...")
        # Compensating transaction
        await AuthNexusClient.delete_user(auth_user_id)
        if isinstance(exc, ConflictError):
            return _json_error(409, message=str(exc), code="CONFLICT")
        if isinstance(exc, ValidationError):
            return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
        return _json_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Failed to save local employee record. User creation rolled back.",
            code="INTERNAL_ERROR",
            details=str(exc)
        )

    logger.info(f"[create_employee] SUCCESS: Employee {body.employee_id} created successfully with ID {row.id}")
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=success_response(
            message="Employee created successfully.",
            data=_employee_payload(row),
            status_code=201,
        ),
    )


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
        # Try finding by local primary key UUID first
        local = await EmployeeRepository.get_by_id(id)
        if not local:
            # Try finding by auth_user_id (ZITADEL ID)
            local = await EmployeeRepository.get_by_auth_user_id(id)

        # Authorization boundary — checked before any AN calls
        if local and employee.role == "employee" and str(local.id) != str(employee.id):
            return _json_error(403, message="You do not have access to this profile.", code="FORBIDDEN")

        an_assignments = None
        if not local:
            if employee.role == "employee":
                return _json_error(404, message="Employee not found.", code="NOT_FOUND")

            # If not in local DB, check if they exist in AuthNexus
            an_profile = await AuthNexusClient.get_user(id)
            if not an_profile:
                return _json_error(404, message="Employee not found.", code="NOT_FOUND")
            
            # Auto-provision local employee row
            logger.info(f"[get_employee] Auto-provisioning local employee row for auth_user_id={id}")
            
            username = (an_profile.get("userName") or an_profile.get("username") or "").strip()
            first_name = (an_profile.get("firstName") or "").strip()
            last_name = (an_profile.get("lastName") or "").strip()
            name = f"{first_name} {last_name}".strip() or username or "Unnamed User"
            email = an_profile.get("email")
            
            # Fetch roles from ZITADEL project assignments to assign correctly
            # We'll default to "employee" if no assignments found
            role = "employee"
            an_assignments = await AuthNexusClient.list_project_assignments()
            for assignment in an_assignments:
                if assignment.get("userId") == id:
                    role_keys = assignment.get("roleKeys") or []
                    if role_keys:
                        role = role_keys[0]
                    break

            try:
                local = await EmployeeRepository.create(
                    auth_user_id=id,
                    employee_id=username,
                    name=name,
                    email=email,
                    department_name=None,
                    role=role,
                )
            except Exception as e:
                logger.error(f"[get_employee] Auto-provisioning failed for {id}: {e}")
                return _json_error(500, message="Failed to auto-provision local employee record.", code="AUTO_PROVISION_FAILED")

        # Now we have a local row. Fetch/refresh live profile from AuthNexus
        an_profile = await AuthNexusClient.get_user(local.auth_user_id)
        if not an_profile:
            logger.warning(f"[get_employee] Live AuthNexus profile not found for auth_user_id={local.auth_user_id}. Returning local record.")
            # Return local row data as fallback
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=success_response(
                    message="Employee retrieved successfully.",
                    data=_employee_payload(local),
                    status_code=200,
                ),
            )

        # Merge live AuthNexus data
        name, email, username = _parse_an_profile(an_profile, fallback_row=local)
        
        # Merge roles from project assignments
        role = local.role
        if an_assignments is None:
            an_assignments = await AuthNexusClient.list_project_assignments()
        for assignment in an_assignments:
            if assignment.get("userId") == local.auth_user_id:
                role_keys = assignment.get("roleKeys") or []
                if role_keys:
                    role = role_keys[0]
                break

        # Re-fetch portfolio / local asset count
        portfolio = await EmployeeRepository.get_portfolio(employee_id=local.id)
        assigned_asset_count = portfolio.get("total_assigned_assets") or 0

        merged_data = {
            "id": local.id,
            "employee_id": username,
            "name": name,
            "email": email,
            "auth_user_id": local.auth_user_id,
            "department": local.department,
            "role": role,
            "assigned_asset_count": assigned_asset_count,
        }

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee retrieved successfully.",
                data=merged_data,
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        logger.error(f"[get_employee] FAILED: {exc}", exc_info=True)
        return _json_error(500, message="Failed to retrieve employee.", code="INTERNAL_ERROR", details=str(exc))


@router.put("/{id}")
async def update_employee(
    id: str,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Deprecated. Employee updates must be done via specific PATCH endpoints.
    """
    return _json_error(
        status.HTTP_405_METHOD_NOT_ALLOWED,
        message="PUT /employees/{id} is deprecated. Use PATCH /role or PATCH /department instead.",
        code="METHOD_NOT_ALLOWED"
    )


@router.patch("/{id}/department")
async def change_employee_department(
    id: str,
    body: DepartmentChangeBody,
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Change an employee's department.
    Method/Route: PATCH /api/v1/employees/{id}/department
    Request: Path `id`; Body `{department}`.
    Response: 200 envelope `{data:<employee>}`; Errors: 400/404/500 envelope.
    Notes: Privileged only.
    """
    try:
        # Step 1: SELECT employee FROM employees WHERE id = {id}
        local = await EmployeeRepository.get_by_id(id)
        if not local:
            return _json_error(404, message="Employee not found.", code="NOT_FOUND")

        # Step 2: Update local employee department
        logger.info(f"[change_employee_department] Step 2: Updating department to '{body.department}' for {id}")
        row = await EmployeeRepository.update_department(employee_id=id, department_name=body.department)

        # Merge live AuthNexus details for consistency with GET /employees/{id}
        an_profile = await AuthNexusClient.get_user(row.auth_user_id) if row.auth_user_id else None
        
        name = row.name
        email = row.email
        role = row.role
        username = row.employee_id
        
        if an_profile:
            name, email, username = _parse_an_profile(an_profile, fallback_row=row)

        portfolio = await EmployeeRepository.get_portfolio(employee_id=row.id)
        assigned_asset_count = portfolio.get("total_assigned_assets") or 0

        merged_data = {
            "id": row.id,
            "employee_id": username,
            "name": name,
            "email": email,
            "auth_user_id": row.auth_user_id,
            "department": row.department,
            "role": role,
            "assigned_asset_count": assigned_asset_count,
        }

        logger.info(f"[change_employee_department] SUCCESS: Department updated successfully for {row.employee_id}")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Employee department updated successfully.",
                data=merged_data,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        logger.error(f"[change_employee_department] FAILED: {exc}", exc_info=True)
        return _json_error(500, message="Failed to update employee department.", code="INTERNAL_ERROR", details=str(exc))


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
    Response: 200 envelope `{data:<employee>}`; Errors: 400/403/404/500/502 envelope.
    Notes: Privileged only; it_ops can set any role; admin cannot promote to it_ops.
    """
    try:
        if body.role == "it_ops" and actor.role != "it_ops":
            return _json_error(403, message="Only IT Ops can assign the it_ops role.", code="FORBIDDEN")

        # Step 1: SELECT auth_user_id FROM employees WHERE id = {id}
        local = await EmployeeRepository.get_by_id(id)
        if not local:
            return _json_error(404, message="Employee not found.", code="NOT_FOUND")

        auth_user_id = local.auth_user_id
        if not auth_user_id:
            return _json_error(
                status.HTTP_400_BAD_REQUEST,
                message="Employee record does not have a linked AuthNexus user ID.",
                code="NO_LINKED_AUTH_USER_ID"
            )

        # Step 2: AuthNexusClient.assign_to_project(auth_user_id, [new_role])
        logger.info(f"[change_employee_role] Step 2: Assigning role {body.role} to AuthNexus user {auth_user_id}")
        role_assigned = await AuthNexusClient.assign_to_project(
            user_id=auth_user_id,
            role_keys=[body.role]
        )
        if not role_assigned:
            logger.error(f"[change_employee_role] Step 2 FAILED: Role assignment failed for user {auth_user_id}")
            return _json_error(
                status.HTTP_502_BAD_GATEWAY,
                message="Failed to update role in identity provider. Local database unchanged.",
                code="IDENTITY_ROLE_UPDATE_FAILED"
            )

        # Step 3: UPDATE employees SET role = new_role WHERE id = {id}
        logger.info(f"[change_employee_role] Step 3: Updating local employee role in database")
        row = await EmployeeRepository.update_role(employee_id=id, role=body.role)

        logger.info(f"[change_employee_role] SUCCESS: Role updated successfully for {row.employee_id}")
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

