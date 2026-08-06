from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Optional
from repositories.db import pool, fetchrow_dict, fetch_dicts
from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from core.api_response import error_response, success_response
from core.authnexus import EmployeeContext
from core.authz import require_authenticated, require_privileged
from core.settings import settings
from repositories.asset_detail_repository import AssetDetailRepository
from repositories.asset_repository import AssetRepository
from repositories.errors import NotFoundError, ValidationError
from schemas.asset import AssetCreate, AssetQrLabelsExportRequest, AssetUpdate
from services.asset_service import asset_service
from services.asset_csv_export_service import asset_csv_export_service
from services.qr_label_pdf_service import qr_label_pdf_service
from services.audit_trail_pdf_service import AuditTrailPdfAssetHeader, audit_trail_pdf_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/assets", tags=["Assets (v1)"])

_PUBLIC_ASSIGNED_FIELDS: tuple[str, ...] = (
    "asset_tag",
    "category_name",
    "category_slug",
    "current_employee_name",
    "current_employee_business_id",
    "current_employee_department",
)

_PUBLIC_UNASSIGNED_FIELDS: tuple[str, ...] = (
    "asset_tag",
    "category_name",
    "category_slug",
    "status",
)

_PRIVILEGED_ROLES = {"admin", "it_ops"}


def _pick(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {k: row.get(k) for k in fields}


def _calculate_changes(old: dict[str, Any], new: dict[str, Any]) -> list[dict[str, Any]]:
    changes = []
    ignore = {
        "updated_at", "created_at", "id", 
        "category_id", "manufacturer_id", "location_id",
        "created_by_employee_id", "updated_by", "deleted_by_employee_id",
        "deleted_at", "is_deleted"
    }

    def _add_change(field: str, label: str, old_val: Any, new_val: Any):
        if old_val != new_val:
            changes.append({
                "field": field,
                "label": label,
                "before": old_val,
                "after": new_val
            })

    for k, v in new.items():
        if k in ignore:
            continue
            
        old_v = old.get(k)
        
        if k in ("custom_fields", "metadata"):
            old_dict = old_v if isinstance(old_v, dict) else {}
            new_dict = v if isinstance(v, dict) else {}
            all_keys = set(old_dict.keys()).union(set(new_dict.keys()))
            for sub_k in all_keys:
                _add_change(
                    field=f"{k}.{sub_k}",
                    label=sub_k.replace('_', ' ').title() if k == "metadata" else f"{k.replace('_', ' ').title()}: {sub_k.replace('_', ' ').title()}",
                    old_val=old_dict.get(sub_k),
                    new_val=new_dict.get(sub_k)
                )
        else:
            _add_change(
                field=k,
                label=k.replace('_', ' ').title(),
                old_val=old_v,
                new_val=v
            )

    return changes


def _is_unassigned(row: dict[str, Any]) -> bool:
    return row.get("current_employee_id") is None


def _is_assigned_to(row: dict[str, Any], employee_uuid: str) -> bool:
    current = row.get("current_employee_id")
    return current is not None and str(current) == str(employee_uuid)


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

@router.get("/next-tag")
async def get_next_asset_tag(
    category_slug: str = Query(..., min_length=1),
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Preview the next asset tag for a category ('JMV-{alias}-#####') without consuming it.
    Method/Route: GET /api/v1/assets/next-tag?category_slug=laptop
    Response: 200 Guideline envelope `{data: string}`; Errors: 404/500 envelope.
    Notes: Privileged only. Preview only — does not increment the counter.
    """
    try:
        tag = await AssetRepository.peek_next_asset_tag(category_slug)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Next asset tag generated successfully.",
                data=tag,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to generate next tag.", code="INTERNAL_ERROR", details=str(exc))


@router.post("")
async def create_asset(
    body: AssetCreate,
    request: Request,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Create a new asset with audit logging and entity resolution.
    Method/Route: POST /api/v1/assets
    Response: 201 Guideline envelope `{data: asset}`; Errors: 400/500 envelope.
    Notes: Privileged only.
    """
    t0 = time.perf_counter()
    try:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        payload = body.model_dump()
        qr_reservation_id = payload.pop("qr_reservation_id", None)
        asset = await asset_service.create_asset(
            payload=payload,
            actor=employee,
            ip_address=ip_address,
            user_agent=user_agent,
            qr_reservation_id=qr_reservation_id,
        )

        logger.info(
            "[timing] asset.create tag=%s from_reservation=%s took %.1fms",
            asset.get("asset_tag"), bool(qr_reservation_id), (time.perf_counter() - t0) * 1000,
        )
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=success_response(
                message="Asset created successfully.",
                data=asset,
                status_code=201,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to create asset.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/bulk")
async def bulk_insert_assets(
    rows: list[AssetCreate],
    request: Request,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Bulk insert assets.
    Method/Route: POST /api/v1/assets/bulk
    Request: Body `[{asset_tag, category_slug, ...}]`.
    Response: 200 envelope `{data:{inserted}}`; Errors: 400/500 envelope.
    Notes: Privileged only.
    """
    try:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        count = await asset_service.bulk_insert_assets(
            rows=[r.model_dump() for r in rows],
            actor=employee,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message=f"Successfully processed {count} assets.",
                data={"inserted": count},
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Bulk import failed.", code="INTERNAL_ERROR", details=str(exc))


@router.patch("/{asset_tag}/status")
async def update_asset_status(
    asset_tag: str,
    body: dict[str, Any],
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Update asset status (lifecycle transition).
    Method/Route: PATCH /api/v1/assets/{asset_tag}/status
    Request: Body `{status, notes?, source?}`.
    Response: 200 envelope `{data:<asset>}`; Errors: 404/500 envelope.
    Notes: Privileged only.
    """
    try:
        new_status = body.get("status")
        if not new_status:
            return _json_error(400, message="status is required", code="VALIDATION_ERROR")

        notes = body.get("notes")
        source = body.get("source", "runtime")

        from repositories.asset_write_repository import AssetWriteRepository
        from services.audit_service import AssetEventType, audit_service

        result = await AssetWriteRepository.update_status(
            asset_tag=asset_tag,
            new_status=new_status,
            updated_by_employee_id=employee.id,
        )
        old_asset = result["old"]
        new_asset = result["new"]
        changes = _calculate_changes(old_asset, new_asset)

        # Log to audit trail
        await audit_service.write_asset_event(
            asset_id=new_asset["id"],
            event_type=AssetEventType.ASSET_UPDATED,
            actor=employee,
            payload={
                "op": "asset.update_status", 
                "new_status": new_status, 
                "source": source,
                "changes": changes
            },
        )
        await audit_service.write_asset_log(
            asset_id=new_asset["id"],
            actor=employee,
            note=f"Status changed to {new_status}. {('Notes: ' + notes) if notes else ''}".strip(),
            metadata={"op": "asset.update_status", "source": source},
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset status updated successfully.",
                data=new_asset,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except Exception as exc:
        return _json_error(500, message="Failed to update asset status.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/public-scan/{asset_tag}")
async def public_scan_asset(
    asset_tag: str,
    request: Request,
) -> JSONResponse:
    """
    Purpose: Return basic asset info for anonymous QR scanning.
    Method/Route: GET /api/v1/assets/public-scan/{asset_tag}
    Response: 200 Guideline envelope `{data:PublicScanAsset}`; Errors: 404/500 envelope.
    Notes: PUBLIC endpoint (no auth).
    """
    try:
        from repositories.asset_repository import AssetRepository
        asset = await AssetRepository.get_public_scan(asset_tag)
        if not asset:
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")

        # Optional: log the scan event (anonymous) — placeholder for a future scan_logs table.

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset scanned successfully.",
                data=asset,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to scan asset.", code="INTERNAL_ERROR", details=str(exc))


@router.put("/{id}")
async def update_asset(
    id: str,
    body: AssetUpdate,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Update an existing asset.
    Method/Route: PUT /api/v1/assets/{id}
    Request: Body with updatable fields.
    Response: 200 envelope `{data:<asset>}`; Errors: 400/404/500 envelope.
    Notes: Privileged only.
    """
    try:
        from repositories.asset_write_repository import AssetWriteRepository
        from services.audit_service import AssetEventType, audit_service

        payload = body.model_dump(exclude_unset=True)
        result = await AssetWriteRepository.update_asset(
            asset_id=id,
            payload=payload,
            updated_by_employee_id=employee.id,
        )
        old_asset = result["old"]
        new_asset = result["new"]
        changes = _calculate_changes(old_asset, new_asset)

        # Only record an audit entry when something actually changed (no no-op logs).
        if changes:
            await audit_service.write_asset_event(
                asset_id=id,
                event_type=AssetEventType.ASSET_UPDATED,
                actor=employee,
                payload={
                    "op": "asset.update",
                    "fields": [c["field"] for c in changes],
                    "changes": changes,
                },
            )
            await audit_service.write_asset_log(
                asset_id=id,
                actor=employee,
                note=f"Asset details updated ({', '.join(c['label'] for c in changes)}).",
                metadata={"op": "asset.update", "fields": [c["field"] for c in changes]},
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset updated successfully.",
                data=new_asset,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to update asset.", code="INTERNAL_ERROR", details=str(exc))

@router.patch("/tag/{asset_tag}")
async def update_asset_by_tag(
    asset_tag: str,
    body: AssetUpdate,
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Update an existing asset by its tag.
    Method/Route: PATCH /api/v1/assets/tag/{asset_tag}
    Request: Body with updatable fields.
    Response: 200 envelope `{data:<asset>}`; Errors: 400/404/500 envelope.
    Notes: Privileged only.
    """
    try:
        from repositories.asset_write_repository import AssetWriteRepository
        from services.audit_service import AssetEventType, audit_service

        payload = body.model_dump(exclude_unset=True)
        result = await AssetWriteRepository.update_asset(
            asset_tag=asset_tag,
            payload=payload,
            updated_by_employee_id=employee.id,
        )
        old_asset = result["old"]
        new_asset = result["new"]
        changes = _calculate_changes(old_asset, new_asset)

        # Only record an audit entry when something actually changed (no no-op logs).
        if changes:
            await audit_service.write_asset_event(
                asset_id=new_asset["id"],
                event_type=AssetEventType.ASSET_UPDATED,
                actor=employee,
                payload={
                    "op": "asset.update_by_tag",
                    "fields": [c["field"] for c in changes],
                    "changes": changes,
                },
            )
            await audit_service.write_asset_log(
                asset_id=new_asset["id"],
                actor=employee,
                note=f"Asset details updated ({', '.join(c['label'] for c in changes)}).",
                metadata={"op": "asset.update_by_tag", "fields": [c["field"] for c in changes]},
            )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset updated successfully.",
                data=new_asset,
                status_code=200,
            ),
        )
    except NotFoundError as exc:
        return _json_error(404, message=str(exc), code="NOT_FOUND")
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to update asset by tag.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/{asset_tag}/logs")
async def get_asset_logs(
    asset_tag: str,
    _: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Fetch all logs/audit trail for a specific asset.
    Method/Route: GET /api/v1/assets/{asset_tag}/logs
    Response: 200 Guideline envelope `{data:[{id, note, created_at, ...}]}`.
    Notes: Authenticated.
    """
    try:
        async with pool().acquire() as conn:
            asset = await fetchrow_dict(conn, "select id from assets where asset_tag = $1", asset_tag)
            if not asset:
                return _json_error(404, message="Asset not found", code="NOT_FOUND")
            
            rows = await fetch_dicts(conn, "select * from asset_logs where asset_id = $1 order by created_at desc", asset["id"])
            
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset logs retrieved.",
                data=rows,
                status_code=200,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve asset logs.", code="INTERNAL_ERROR", details=str(exc))

@router.post("/{asset_tag}/logs")
async def create_asset_log(
    asset_tag: str,
    body: dict[str, Any],
    actor: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Create a manual log entry for an asset.
    Method/Route: POST /api/v1/assets/{asset_tag}/logs
    Request: Body `{note}`.
    Response: 201 envelope `{data:<log>}`.
    Notes: Authenticated.
    """
    try:
        note = body.get("note")
        if not note:
            return _json_error(400, message="Note is required", code="VALIDATION_ERROR")

        async with pool().acquire() as conn:
            asset = await fetchrow_dict(conn, "select id from assets where asset_tag = $1", asset_tag)
            if not asset:
                return _json_error(404, message="Asset not found", code="NOT_FOUND")
            
            asset_id = asset["id"]
            
            # Replicate createLogForAsset logic
            # In a real app, we might generate QR here if needed, but usually logs just need notes.
            row = await fetchrow_dict(conn, """
                insert into asset_logs (asset_id, note, created_at)
                values ($1, $2, now())
                returning id, note, created_at
            """, asset_id, note)
            
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=success_response(
                message="Asset log created.",
                data=row,
                status_code=201,
            ),
        )
    except Exception as exc:
        return _json_error(500, message="Failed to create asset log.", code="INTERNAL_ERROR", details=str(exc))

@router.get("")
async def list_assets(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    category: Optional[str] = Query(default=None),
    exclude_category_slugs: list[str] = Query(default=[]),
    department: Optional[str] = Query(default=None),
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: List assets from `v_asset_inventory` (role-scoped).
    Method/Route: GET /api/v1/assets
    Request: Query `page`, `limit`, `search`, `status`, `category`, `department`.
    Response: 200 Guideline envelope `{data:{items,page,limit,count,total}}`; Errors: 400/500 envelope.
    Notes: Requires auth (`require_authenticated`); `employee` role is scoped to their current assignments only.
    """
    try:
        employee_id_scope = employee.id if employee.role == "employee" else None
        rows, page_meta, total = await AssetRepository.list_inventory(
            page=page,
            limit=limit,
            search=search,
            status=status_filter,
            category_slug=category,
            exclude_category_slugs=exclude_category_slugs,
            department=department,
            employee_id=employee_id_scope,
        )

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Assets retrieved successfully.",
                data={
                    "items": rows,
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
        return _json_error(500, message="Failed to retrieve assets.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/scan/{ref}")
async def scan_asset(ref: str, request: Request) -> JSONResponse:
    """
    Purpose: QR scan lookup with optional auth; returns public-safe fields or redirect signals.
    Method/Route: GET /api/v1/assets/scan/{ref}
    Request: Path `ref` (asset_tag or UUID).
    Response: 200 envelope (either `{redirect:...}` or limited asset fields); Errors: 400/404/500 envelope.
    Notes: If signed-in and privileged, returns `{redirect:true}` to drive frontend navigation.
    """
    try:
        row = await AssetRepository.get_inventory_by_ref(ref)
        # ─────────────────────────────────────────────────────────────
        # NEW BRANCH: Reserved-but-not-logged QR tag (Path A)
        # ─────────────────────────────────────────────────────────────
        if not row:
            from repositories.qr_repository import QrRepository
            reservation = await QrRepository.get_reservation_by_tag(ref)
            
            if reservation and reservation["status"] == "reserved":
                signed_in: Optional[EmployeeContext] = getattr(request.state, "employee", None)
                
                if signed_in and signed_in.role in _PRIVILEGED_ROLES:
                    return JSONResponse(
                        status_code=200,
                        content=success_response(
                            message="Reserved QR tag ready to log.",
                            data={
                                "kind": "ready_to_log",
                                "asset_tag": ref,
                                "qr_reservation_id": str(reservation["id"]),
                                "batch_code": reservation["batch_code"],
                            },
                            status_code=200,
                        ),
                    )
                
                if signed_in and signed_in.role == "employee":
                    return JSONResponse(
                        status_code=200,
                        content=success_response(
                            message="Admin access required to log this asset.",
                            data={"kind": "admin_required", "asset_tag": ref},
                            status_code=200,
                        ),
                    )
                
                # Unauthenticated
                return JSONResponse(
                    status_code=200,
                    content=success_response(
                        message="Please sign in to log this asset.",
                        data={"kind": "reserved", "asset_tag": ref},
                        status_code=200,
                    ),
                )
            
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")


        signed_in: Optional[EmployeeContext] = getattr(request.state, "employee", None)

        # --- Signed in ---
        if signed_in:
            if signed_in.role in _PRIVILEGED_ROLES:
                return JSONResponse(
                    status_code=200,
                    content=success_response(
                        message="Redirect to asset detail.",
                        data={"redirect": True, "asset_tag": row.get("asset_tag")},
                        status_code=200,
                    ),
                )

            if signed_in.role == "employee":
                if _is_assigned_to(row, signed_in.id):
                    return JSONResponse(
                        status_code=200,
                        content=success_response(
                            message="Redirect to asset detail (view only).",
                            data={"redirect": True, "asset_tag": row.get("asset_tag"), "view_only": True},
                            status_code=200,
                        ),
                    )

                if not _is_unassigned(row):
                    return JSONResponse(
                        status_code=200,
                        content=success_response(
                            message="Asset is assigned to another employee.",
                            data=_pick(row, _PUBLIC_ASSIGNED_FIELDS),
                            status_code=200,
                        ),
                    )

                return JSONResponse(
                    status_code=200,
                    content=success_response(
                        message="Asset is not currently assigned.",
                        data=_pick(row, _PUBLIC_UNASSIGNED_FIELDS),
                        status_code=200,
                    ),
                )

        # --- Not signed in ---
        if not _is_unassigned(row):
            return JSONResponse(
                status_code=200,
                content=success_response(
                    message="Asset is currently assigned.",
                    data=_pick(row, _PUBLIC_ASSIGNED_FIELDS),
                    status_code=200,
                ),
            )

        return JSONResponse(
            status_code=200,
            content=success_response(
                message="Asset is not currently assigned.",
                data=_pick(row, _PUBLIC_UNASSIGNED_FIELDS),
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to process scan.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/export.csv")
async def export_assets_csv(
    employee: EmployeeContext = Depends(require_privileged),
) -> Response:
    """
    Purpose: Export all asset inventory rows as a CSV file.
    Method/Route: GET /api/v1/assets/export.csv
    Request: None.
    Response: 200 `text/csv` with `Content-Disposition` attachment.
    Notes: Admin or IT Ops (`require_privileged`); streams results for efficiency.
    """
    _ = employee
    if not settings.ASSET_EXPORT_ENABLED:
        return _json_error(503, message="Asset export is disabled.", code="SERVICE_UNAVAILABLE")
    from datetime import datetime, timezone

    filename = f"assets_{datetime.now(timezone.utc).date().isoformat()}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    return StreamingResponse(
        asset_csv_export_service.stream_inventory_csv(prefetch=2000),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )


# Columns to include in the XLSX/JSON export (no internal UUIDs or system blobs).
_XLSX_EXPORT_COLUMNS = (
    "asset_tag",
    "category_name",
    "manufacturer_name",
    "model",
    "serial_number",
    "status",
    "location_name",
    "purchase_date",
    "warranty_expiry",
    "current_employee_name",
    "current_employee_business_id",
    "current_employee_department",
    "current_employee_is_active",
    "custom_fields",
)


@router.get("/export.json")
async def export_assets_json(
    employee: EmployeeContext = Depends(require_privileged),
) -> JSONResponse:
    """
    Purpose: Export curated asset rows as JSON for client-side XLSX generation.
    Method/Route: GET /api/v1/assets/export.json
    Request: None.
    Response: 200 Guideline envelope `{data: [{asset_tag, category_name, ...}]}`.
    Notes: Admin or IT Ops (`require_privileged`); guarded by ASSET_EXPORT_ENABLED.
    """
    _ = employee
    if not settings.ASSET_EXPORT_ENABLED:
        return _json_error(503, message="Asset export is disabled.", code="SERVICE_UNAVAILABLE")

    async with pool().acquire() as conn:
        cols_sql = ", ".join(f'"{c}"' for c in _XLSX_EXPORT_COLUMNS)
        rows = await fetch_dicts(
            conn,
            f"SELECT {cols_sql} FROM v_asset_inventory ORDER BY asset_tag ASC",
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content=success_response(
            message="Asset export retrieved successfully.",
            data=rows,
            status_code=200,
        ),
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{ref}")
async def get_asset(
    ref: str,
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Fetch a single asset inventory row (role-scoped).
    Method/Route: GET /api/v1/assets/{ref}
    Request: Path `ref` (asset_tag or UUID).
    Response: 200 envelope `{data:<v_asset_inventory row>}`; Errors: 400/403/404/500 envelope.
    Notes: Requires auth (`require_authenticated`); `employee` role can only access assets assigned to them.
    """
    try:
        row = await AssetRepository.get_inventory_by_ref(ref)
        if not row:
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")

        if employee.role == "employee" and not _is_assigned_to(row, employee.id):
            return _json_error(403, message="You do not have access to this asset.", code="FORBIDDEN")

        return JSONResponse(
            status_code=200,
            content=success_response(
                message="Asset retrieved successfully.",
                data=row,
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve asset.", code="INTERNAL_ERROR", details=str(exc))


@router.post("/qr-labels/export")
async def export_asset_qr_labels(
    payload: AssetQrLabelsExportRequest,
    employee: EmployeeContext = Depends(require_privileged),
) -> Response:
    """
    Purpose: Generate a printable PDF of QR labels for a list of asset tags.
    Method/Route: POST /api/v1/assets/qr-labels/export
    Request: JSON body `{asset_tags:[string]}`.
    Response: 200 `application/pdf` with `Content-Disposition`; may include `X-Export-Empty: 1`.
    Notes: Privileged only (`require_privileged`); returns an "empty notice" PDF when input set is empty or no tags exist.
    """
    _ = employee
    requested_tags = []
    seen: set[str] = set()
    for raw in payload.asset_tags or []:
        tag = str(raw or "").strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        requested_tags.append(tag)

    empty_notice_headers = {
        "Content-Disposition": f'inline; filename="{qr_label_pdf_service.file_name}"',
        "Cache-Control": "no-store",
        "X-Export-Empty": "1",
        "X-Exported-Asset-Count": "0",
    }

    if not requested_tags:
        pdf_bytes = await run_in_threadpool(
            qr_label_pdf_service.build_empty_notice_pdf,
            "No assets to export",
            "There are no assets with tags in the current view. Adjust filters or add assets, then try again.",
        )
        return Response(content=pdf_bytes, media_type="application/pdf", headers=empty_notice_headers)

    printable_tags = await AssetRepository.list_existing_asset_tags_in_order(requested_tags)
    if not printable_tags:
        pdf_bytes = await run_in_threadpool(
            qr_label_pdf_service.build_empty_notice_pdf,
            "No printable labels",
            "None of the requested assets could be found in the directory, or they cannot be printed.",
        )
        return Response(content=pdf_bytes, media_type="application/pdf", headers=empty_notice_headers)

    pdf_bytes = await run_in_threadpool(qr_label_pdf_service.build_pdf, printable_tags)
    headers = {
        "Content-Disposition": f'inline; filename="{qr_label_pdf_service.file_name}"',
        "Cache-Control": "no-store",
        "X-Exported-Asset-Count": str(len(printable_tags)),
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/{ref}/audit-trail/export")
async def export_asset_audit_trail_pdf(
    ref: str,
    limit: int | None = None,
    employee: EmployeeContext = Depends(require_privileged),
) -> Response:
    """
    Purpose: Export the asset audit trail (lifecycle log) as a readable PDF (tabular).
    Method/Route: GET /api/v1/assets/{ref}/audit-trail/export?limit=100
    Response: 200 `application/pdf` with `Content-Disposition`; Errors: 400/403/404/500 envelope.
    Notes: Privileged only (`require_privileged`).
    """
    try:
        row = await AssetDetailRepository.get_asset_inventory_by_ref(ref)
        if not row:
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")

        if employee.role == "employee" and not _is_assigned_to(row, employee.id):
            return _json_error(403, message="You do not have access to this asset.", code="FORBIDDEN")

        asset_id = str(row.get("id") or "")
        if not asset_id:
            return _json_error(500, message="Asset record is missing an id.", code="INTERNAL_ERROR")

        try:
            resolved_limit = 100 if limit is None else int(limit)
        except Exception:
            return _json_error(400, message="limit must be an integer", code="VALIDATION_ERROR")
        lifecycle_events, _is_capped = await AssetDetailRepository.list_events(asset_id=asset_id, limit=resolved_limit)

        asset_name = " ".join(
            [
                str(row.get("manufacturer_name") or "").strip(),
                str(row.get("model") or "").strip(),
            ]
        ).strip() or "-"
        asset_tag = str(row.get("asset_tag") or "").strip() or "-"
        category = str(row.get("category_name") or "").strip() or "-"

        created_by = " · ".join(
            [
                part
                for part in [
                    str(getattr(employee, "name", "") or "").strip() or None,
                    str(getattr(employee, "employee_id", "") or "").strip() or None,
                ]
                if part
            ]
        ) or "—"
        generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

        pdf_bytes = await run_in_threadpool(
            audit_trail_pdf_service.build_pdf,
            header=AuditTrailPdfAssetHeader(
                asset_name=asset_name,
                asset_tag=asset_tag,
                category=category,
                created_by=created_by,
                generated_at=generated_at,
            ),
            lifecycle_events=lifecycle_events,
        )

        safe_tag = asset_tag.replace("/", "-").replace("\\", "-")
        file_name = f'Audit Trail - {safe_tag}.pdf'
        headers = {
            "Content-Disposition": f'inline; filename="{file_name}"',
            "Cache-Control": "no-store",
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to export audit trail PDF.", code="INTERNAL_ERROR", details=str(exc))


@router.get("/{ref}/detail")
async def get_asset_detail(
    ref: str,
    employee: EmployeeContext = Depends(require_authenticated),
) -> JSONResponse:
    """
    Purpose: Fetch asset detail bundle (inventory + components + assignments + lifecycle events + audit actor display).
    Method/Route: GET /api/v1/assets/{ref}/detail
    Request: Path `ref` (asset_tag or UUID).
    Response: 200 envelope `{data:{asset,assignments,components,lifecycle_events,lifecycle_is_capped,audit_actors}}`; Errors: 400/403/404/500 envelope.
    Notes: Requires auth; `employee` role can only access assets assigned to them.
    """
    try:
        row = await AssetDetailRepository.get_asset_inventory_by_ref(ref)
        if not row:
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")

        if employee.role == "employee" and not _is_assigned_to(row, employee.id):
            return _json_error(403, message="You do not have access to this asset.", code="FORBIDDEN")

        asset_id = str(row.get("id") or "")
        if not asset_id:
            return _json_error(500, message="Asset record is missing an id.", code="INTERNAL_ERROR")

        components, assignments = await _gather_asset_detail_parts(asset_id)
        lifecycle_events, lifecycle_is_capped = await AssetDetailRepository.list_events(asset_id=asset_id)

        created_event = next((e for e in lifecycle_events if str(e.get("event_type") or "") in {"asset_created", "bulk_imported"}), None)
        update_event = next(
            (
                e
                for e in lifecycle_events
                if str(e.get("event_type") or "") in {"asset_updated", "asset_deleted", "asset_restored"}
            ),
            created_event,
        )

        created_by = str(row.get("created_by") or "") or None
        updated_by = str(row.get("updated_by") or "") or None

        created_emp = await AssetDetailRepository.get_employee_display_by_auth_user_id(created_by or "")
        updated_emp = await AssetDetailRepository.get_employee_display_by_auth_user_id(updated_by or "")

        def build_actor_display(auth_user_id: str | None, emp: dict[str, Any] | None, fallback_event: dict[str, Any] | None):
            resolved_auth = auth_user_id or (fallback_event.get("actor_id") if fallback_event else None)
            resolved_name = (emp or {}).get("name") if emp else None
            resolved_emp_id = (emp or {}).get("employee_id") if emp else None
            if not resolved_name and not resolved_emp_id and fallback_event:
                resolved_name = fallback_event.get("actor_name")
                resolved_emp_id = fallback_event.get("actor_employee_id")
            if not resolved_auth and not resolved_name and not resolved_emp_id:
                return None
            return {"auth_user_id": resolved_auth, "name": resolved_name, "employee_id": resolved_emp_id}

        audit_actors = {
            "created_by": build_actor_display(created_by, created_emp, created_event),
            "updated_by": build_actor_display(updated_by, updated_emp, update_event),
        }

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=success_response(
                message="Asset detail retrieved successfully.",
                data={
                    "asset": row,
                    "assignments": assignments,
                    "components": components,
                    "lifecycle_events": lifecycle_events,
                    "lifecycle_is_capped": lifecycle_is_capped,
                    "audit_actors": audit_actors,
                },
                status_code=200,
            ),
        )
    except ValidationError as exc:
        return _json_error(400, message=str(exc), code="VALIDATION_ERROR")
    except Exception as exc:
        return _json_error(500, message="Failed to retrieve asset detail.", code="INTERNAL_ERROR", details=str(exc))


async def _gather_asset_detail_parts(asset_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    components = await AssetDetailRepository.list_components(asset_id=asset_id)
    assignments = await AssetDetailRepository.list_assignments(asset_id=asset_id)
    return components, assignments


@router.post(
    "/{ref}/history/pdf",
    summary="Export asset assignment history as PDF",
)
async def export_asset_history_pdf(
    ref: str,
    employee: EmployeeContext = Depends(require_privileged),
):
    from services.asset_history_pdf_service import asset_history_pdf_service
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    
    try:
        row = await AssetDetailRepository.get_asset_inventory_by_ref(ref)
        if not row:
            return _json_error(404, message="Asset not found.", code="NOT_FOUND")
            
        asset_id = str(row.get("id") or "")
        if not asset_id:
            return _json_error(500, message="Asset record is missing an id.", code="INTERNAL_ERROR")
            
        components, assignments = await _gather_asset_detail_parts(asset_id)
        if not assignments:
            return _json_error(422, message="No assignment history to export", code="UNPROCESSABLE_ENTITY")
            
        lifecycle_events, lifecycle_is_capped = await AssetDetailRepository.list_events(asset_id=asset_id)
        
        pdf_bytes = await run_in_threadpool(
            asset_history_pdf_service.build_pdf, row, assignments, lifecycle_events
        )
        
        asset_tag = row.get("asset_tag") or "asset"
        filename = f"{asset_tag}-history.pdf"
        
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as exc:
        return _json_error(500, message="Failed to export history PDF.", code="INTERNAL_ERROR", details=str(exc))
