from __future__ import annotations

from fastapi import APIRouter, Depends, status, Query
from fastapi.responses import JSONResponse

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated, require_privileged
from core.roles import PRIVILEGED_ROLES
from repositories.meta_repository import MetaRepository
from repositories.assignment_repository import AssignmentRepository
from repositories.db import pool, fetch_dicts

router = APIRouter(prefix="/api/v1/meta", tags=["Meta (v1)"])


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


@router.get("/categories")
async def list_categories(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: List asset categories for filters and create flows.
    Method/Route: GET /api/v1/meta/categories
    Request: None.
    Response: 200 Guideline envelope `{data:[{id,slug,name},...]}`; Errors: 500 envelope.
    Notes: Authenticated (`require_authenticated`); same list for all roles.
    """
    _ = employee
    try:
        rows = await MetaRepository.list_categories()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Categories retrieved successfully.",
                data=rows,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve categories.", code="INTERNAL_ERROR", details=str(exc))

@router.get("/categories/{slug}/fields")
async def get_category_fields(
    slug: str,
    _: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Get custom field definitions for a category.
    Method/Route: GET /api/v1/meta/categories/{slug}/fields
    Response: 200 Guideline envelope `{data:[{field_key, label, ...}]}`.
    Notes: Authenticated.
    """
    try:
        async with pool().acquire() as conn:
            rows = await fetch_dicts(conn, """
                select f.*
                  from custom_field_definitions f
                  join asset_categories c on f.category_id = c.id
                 where c.slug = $1
                 order by f.sort_order
            """, slug)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Category fields retrieved.",
                data=rows,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve category fields.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/departments")
async def list_departments(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: List all department names for filters and employee forms.
    Method/Route: GET /api/v1/meta/departments
    Request: None.
    Response: 200 Guideline envelope `{data:["IT","HR",...]}`; Errors: 500 envelope.
    Notes: Authenticated (`require_authenticated`); same list for all roles.
    """
    _ = employee
    try:
        departments = await MetaRepository.list_departments()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Departments retrieved successfully.",
                data=departments,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve departments.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/departments-with-ids")
async def list_departments_with_ids(
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: List departments with IDs for asset department assignment.
    Method/Route: GET /api/v1/meta/departments-with-ids
    Response: 200 envelope `{data:[{id,name},...]}`
    """
    _ = employee
    try:
        departments = await MetaRepository.list_department_objects()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Departments retrieved successfully.",
                data=departments,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve departments.", code="INTERNAL_ERROR", details=str(exc))

@router.get("/warranty-notifications")
async def list_warranty_notifications(
    days_ahead: int = Query(default=30, ge=1, le=365, alias="limit"),
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: List assets with expiring warranties for dashboard alerts.
    Method/Route: GET /api/v1/meta/warranty-notifications
    Response: 200 Guideline envelope `{data:[{asset_tag, warranty_expiry, ...}]}`; Errors: 500 envelope.
    Notes: Authenticated. Employees see only assets currently assigned to them; privileged roles see all.
    """
    try:
        async with pool().acquire() as conn:
            if employee.role not in PRIVILEGED_ROLES:
                rows = await fetch_dicts(conn, """
                    select *
                      from v_warranty_notifications
                     where days_remaining <= $1
                       and current_employee_id = $2
                     order by days_remaining asc
                     limit 100
                """, days_ahead, str(employee.employee_id))
            else:
                rows = await fetch_dicts(conn, """
                    select *
                      from v_warranty_notifications
                     where days_remaining <= $1
                     order by days_remaining asc
                     limit 100
                """, days_ahead)

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Warranty notifications retrieved successfully.",
                data=rows,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve warranty notifications.", code="INTERNAL_ERROR", details=str(exc))
@router.get("/welcome-notification")
async def get_welcome_notification(
    _: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Get the system welcome notification.
    Method/Route: GET /api/v1/meta/welcome-notification
    Response: 200 Guideline envelope `{data:{show_alert, title, message}}`.
    Notes: Authenticated.
    """
    # For now, return a default welcome message or empty.
    # In a real system, this might come from a settings table.
    data = {
        "show_alert": False,
        "title": "Welcome to Asset Manager",
        "message": "Migration to AuthNexus is complete."
    }
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=success_response(
            message="Welcome notification retrieved.",
            data=data,
            status_code=200,
        ),
    )


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    _: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Return high-level metrics for the dashboard.
    Method/Route: GET /api/v1/meta/dashboard-stats
    Response: 200 Guideline envelope `{data:{total_assets, assigned_assets, ...}}`.
    Notes: Authenticated.
    """
    try:
        async with pool().acquire() as conn:
            # Replicate dashboard stats logic
            total_assets = await conn.fetchval("select count(*)::int from assets")
            assigned_assets = await conn.fetchval("select count(*)::int from asset_assignments where returned_at is null")
            
            active_employees = await conn.fetchval("select count(*)::int from employees")
            total_employees = active_employees
            
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Dashboard stats retrieved successfully.",
                data={
                    "totalAssets": total_assets or 0,
                    "assignedAssets": assigned_assets or 0,
                    "inStockAssets": max((total_assets or 0) - (assigned_assets or 0), 0),
                    "activeEmployees": active_employees or 0,
                    "totalEmployees": total_employees or 0,
                },
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve dashboard stats.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/public-dashboard")
async def get_public_dashboard_summary() -> JSONResponse:
    """
    Purpose: Return anonymous metrics for the public landing page.
    Method/Route: GET /api/v1/meta/public-dashboard
    Response: 200 Guideline envelope `{data:{totalAssets, assignedAssets, categories:[]}}`.
    Notes: PUBLIC endpoint (no auth required).
    """
    try:
        async with pool().acquire() as conn:
            total_assets = await conn.fetchval("select count(*)::int from assets")
            assigned_assets = await conn.fetchval("select count(*)::int from asset_assignments where returned_at is null")
            
            # Categories with counts
            rows = await fetch_dicts(conn, """
                select c.name, count(a.id)::int as count
                  from assets a
                  join asset_categories c on a.category_id = c.id
                 group by c.name
                 order by count desc
            """)
            
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Public dashboard summary retrieved.",
                data={
                    "totalAssets": total_assets or 0,
                    "assignedAssets": assigned_assets or 0,
                    "categories": rows
                },
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve public dashboard summary.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/overview-analysis")
async def get_overview_analysis(
    limit: int = Query(default=100, ge=1, le=500),
    _: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Get high-level analysis stats for admin dashboard.
    Method/Route: GET /api/v1/meta/overview-analysis
    Response: 200 Guideline envelope `{data:{totalAssets, assignedAssets, ...}}`.
    Notes: Privileged only.
    """
    try:
        async with pool().acquire() as conn:
            # 1. Status & Category counts from view
            rows = await fetch_dicts(
                conn,
                "select status, category_name, current_employee_id, current_employee_name, current_employee_business_id, current_employee_department from v_asset_inventory",
            )
            
            active_count = await conn.fetchval("select count(*)::int from employees")
            
        # Perform aggregation (mirroring frontend logic for now)
        status_map = {}
        category_map = {}
        employee_load = {}
        
        assigned_assets = 0
        in_stock_assets = 0
        
        for r in rows:
            s = (r["status"] or "unknown").strip()
            c = (r["category_name"] or "Uncategorized").strip()
            
            status_map[s] = status_map.get(s, 0) + 1
            category_map[c] = category_map.get(c, 0) + 1
            
            if s == "assigned": assigned_assets += 1
            if s == "in_stock": in_stock_assets += 1
            
            eid = r["current_employee_id"]
            if eid:
                eid_str = str(eid)
                if eid_str not in employee_load:
                    employee_load[eid_str] = {
                        "employee_id": eid_str,
                        "employee_name": r["current_employee_name"],
                        "display_employee_id": r["current_employee_business_id"],
                        "department": r["current_employee_department"],
                        "assigned_assets": 0
                    }
                employee_load[eid_str]["assigned_assets"] += 1
        
        # Sort and slice
        sorted_load = sorted(employee_load.values(), key=lambda x: x["assigned_assets"], reverse=True)[:limit]
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Overview analysis retrieved.",
                data={
                    "totalAssets": len(rows),
                    "assignedAssets": assigned_assets,
                    "inStockAssets": in_stock_assets,
                    "activeEmployees": active_count,
                    "statusBreakdown": [{"label": k, "count": v} for k, v in status_map.items()],
                    "categoryBreakdown": [{"label": k, "count": v} for k, v in category_map.items()],
                    "employeeLoad": sorted_load
                },
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve overview analysis.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/assignment-activity")
async def get_assignment_activity(
    from_date: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="Start month in YYYY-MM format"),
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Assignment count per month for 12 months starting from from_date.
    Method/Route: GET /api/v1/meta/assignment-activity?from_date=YYYY-MM
    Response: 200 envelope with items [{month: 'YYYY-MM', count: int}]
    Notes: Privileged only.
    """
    try:
        rows = await AssignmentRepository.count_assignments_by_month(from_date)
        return JSONResponse(
            status_code=200,
            content=success_response(
                message="Assignment activity retrieved.",
                data={"items": rows, "from_date": from_date},
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve assignment activity.", code="INTERNAL_ERROR", details=str(exc))
