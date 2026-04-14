import re
import uuid
from datetime import date
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from core.auth import require_manage_platform_access
from core.deps import get_db
from core.errors import handle_supabase_error
from schemas.asset import AssetCreate, AssetOut, AssetQrLabelsExportRequest, AssetUpdate
from services.qr_label_pdf_service import qr_label_pdf_service
from services.qr_service import qr_service

router = APIRouter(prefix="/assets", tags=["Assets"])
browser_router = APIRouter(prefix="/assets", tags=["Assets"])

VALID_ASSET_STATUSES = {"in_stock", "assigned", "in_repair", "retired", "lost", "disposed"}
MAX_QR_LABEL_EXPORT_TAGS = 5000


def sanitize_search(query: str) -> str:
    """Basic sanitization for Supabase or_() filters."""
    return re.sub(r'[,()"%]', '', query).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")


def titleize_slug(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-") if part)


def normalize_location_code(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", value.strip().upper()).strip("-")


def normalize_asset_row(row: dict[str, Any], latest_qr_code: Optional[str] = None) -> dict[str, Any]:
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        metadata = row.get("asset_metadata")

    return {
        "id": row.get("id"),
        "asset_tag": row.get("asset_tag"),
        "category_slug": row.get("category_slug"),
        "category_name": row.get("category_name"),
        "manufacturer_name": row.get("manufacturer_name"),
        "model": row.get("model"),
        "serial_number": row.get("serial_number"),
        "location_code": row.get("location_code"),
        "location_name": row.get("location_name"),
        "status": row.get("status"),
        "purchase_date": row.get("purchase_date"),
        "warranty_expiry": row.get("warranty_expiry"),
        "custom_fields": row.get("custom_fields") if isinstance(row.get("custom_fields"), dict) else {},
        "metadata": metadata if isinstance(metadata, dict) else {},
        "assignment_id": row.get("assignment_id"),
        "assigned_at": row.get("assigned_at"),
        "current_employee_id": row.get("current_employee_id"),
        "current_employee_code": row.get("current_employee_code"),
        "current_employee_name": row.get("current_employee_name"),
        "current_employee_email": row.get("current_employee_email"),
        "current_employee_is_active": row.get("current_employee_is_active"),
        "current_employee_erp_active": row.get("current_employee_erp_active"),
        "current_employee_department": row.get("current_employee_department"),
        "latest_qr_code": latest_qr_code,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def parse_asset_status(raw_status: Optional[str], *, required_non_empty: bool = False) -> Optional[str]:
    if raw_status is None:
        return None
    normalized = raw_status.strip().lower()
    if not normalized:
        if required_non_empty:
            raise HTTPException(status_code=400, detail="status cannot be empty")
        return None
    if normalized not in VALID_ASSET_STATUSES:
        allowed = ", ".join(sorted(VALID_ASSET_STATUSES))
        raise HTTPException(status_code=400, detail=f"Invalid status '{raw_status}'. Allowed: {allowed}")
    return normalized


def resolve_category_id(db, category_slug: str, category_name: Optional[str] = None) -> str:
    slug = slugify(category_slug)
    if not slug:
        raise HTTPException(status_code=400, detail="category_slug is required")

    resolved_name = (category_name or "").strip() or titleize_slug(slug)
    db.table("asset_categories").upsert({"slug": slug, "name": resolved_name}, on_conflict="slug").execute()
    response = db.table("asset_categories").select("id").eq("slug", slug).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to resolve asset category")
    return response.data[0]["id"]


def resolve_manufacturer_id(db, manufacturer_name: Optional[str]) -> Optional[str]:
    if not manufacturer_name:
        return None
    cleaned = manufacturer_name.strip()
    if not cleaned:
        return None

    db.table("manufacturers").upsert({"name": cleaned}, on_conflict="name").execute()
    response = db.table("manufacturers").select("id").eq("name", cleaned).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to resolve manufacturer")
    return response.data[0]["id"]


def resolve_location_id(db, location_code: Optional[str], location_name: Optional[str]) -> Optional[str]:
    code_source = location_code or location_name
    if not code_source:
        return None

    normalized_code = normalize_location_code(code_source)
    if not normalized_code:
        return None

    resolved_name = (location_name or "").strip() or normalized_code
    db.table("locations").upsert(
        {"code": normalized_code, "name": resolved_name},
        on_conflict="code",
    ).execute()
    response = db.table("locations").select("id").eq("code", normalized_code).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to resolve location")
    return response.data[0]["id"]


def resolve_asset_inventory_row(db, asset_ref: str) -> Optional[dict[str, Any]]:
    normalized_ref = asset_ref.strip()
    if not normalized_ref:
        return None

    by_tag = db.table("v_asset_inventory").select("*").eq("asset_tag", normalized_ref).limit(1).execute()
    if by_tag.data:
        return by_tag.data[0]

    try:
        uuid.UUID(normalized_ref)
    except ValueError:
        return None

    by_id = db.table("v_asset_inventory").select("*").eq("id", normalized_ref).limit(1).execute()
    if by_id.data:
        return by_id.data[0]
    return None


def get_latest_asset_qr(db, asset_id: str) -> Optional[str]:
    response = (
        db.table("asset_logs")
        .select("qr_code")
        .eq("asset_id", asset_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    qr_code = response.data[0].get("qr_code")
    return qr_code if isinstance(qr_code, str) and qr_code.strip() else None


def next_asset_tag(db) -> str:
    response = db.rpc("fn_next_asset_tag").execute()
    payload = response.data

    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        value = str(payload.get("fn_next_asset_tag") or payload.get("next_asset_tag") or "").strip()
        if value:
            return value
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            value = first.get("fn_next_asset_tag") or first.get("next_asset_tag")
            if value:
                return str(value).strip()

    raise HTTPException(status_code=500, detail="Unable to generate next asset tag")


def normalize_asset_tag_list(asset_tags: list[str], *, min_count: int = 1) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for raw_tag in asset_tags:
        tag = str(raw_tag or "").strip()
        if not tag or tag in seen:
            continue
        normalized.append(tag)
        seen.add(tag)

    if len(normalized) < min_count:
        raise HTTPException(status_code=400, detail="At least one asset_tag is required.")
    if len(normalized) > MAX_QR_LABEL_EXPORT_TAGS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many asset tags requested ({len(normalized)}). Maximum is {MAX_QR_LABEL_EXPORT_TAGS}.",
        )
    return normalized


def get_existing_asset_tags_in_order(db, requested_tags: list[str]) -> list[str]:
    existing: set[str] = set()
    batch_size = 250

    for start in range(0, len(requested_tags), batch_size):
        batch = requested_tags[start:start + batch_size]
        response = (
            db.table("assets")
            .select("asset_tag")
            .eq("is_deleted", False)
            .in_("asset_tag", batch)
            .execute()
        )
        for row in response.data or []:
            asset_tag = str(row.get("asset_tag") or "").strip()
            if asset_tag:
                existing.add(asset_tag)

    return [asset_tag for asset_tag in requested_tags if asset_tag in existing]


@router.get("", response_model=List[AssetOut])
def get_assets(
    search: Optional[str] = Query(None, description="Search term for assets"),
    department: Optional[str] = Query(None, description="Filter by current holder department"),
    asset_type: Optional[str] = Query(None, alias="type", description="Filter by category slug"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by inventory status"),
    start_date: Optional[date] = Query(None, description="Filter purchase_date from (inclusive)"),
    end_date: Optional[date] = Query(None, description="Filter purchase_date to (inclusive)"),
    db=Depends(get_db),
):
    try:
        query = db.table("v_asset_inventory").select("*").order("updated_at", desc=True)

        if search:
            s = sanitize_search(search)
            if s:
                query = query.or_(
                    f"asset_tag.ilike.%{s}%,serial_number.ilike.%{s}%,model.ilike.%{s}%,"
                    f"manufacturer_name.ilike.%{s}%,location_name.ilike.%{s}%,"
                    f"current_employee_name.ilike.%{s}%,current_employee_code.ilike.%{s}%,"
                    f"category_name.ilike.%{s}%"
                )

        if department:
            query = query.eq("current_employee_department", department.strip())

        if asset_type:
            query = query.eq("category_slug", slugify(asset_type))

        normalized_status = parse_asset_status(status_filter)
        if normalized_status:
            query = query.eq("status", normalized_status)

        if start_date and end_date and start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date cannot be after end_date")
        if start_date:
            query = query.gte("purchase_date", start_date.isoformat())
        if end_date:
            query = query.lte("purchase_date", end_date.isoformat())

        response = query.execute()
        return [normalize_asset_row(row) for row in (response.data or [])]
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(asset: AssetCreate, db=Depends(get_db), _=Depends(require_manage_platform_access)):
    try:
        category_slug = slugify(asset.category_slug)
        if not category_slug:
            raise HTTPException(status_code=400, detail="category_slug is required")

        if (asset.asset_tag or "").strip():
            raise HTTPException(status_code=400, detail="asset_tag is system-generated and cannot be provided by clients")

        serial_number = (asset.serial_number or "").strip()
        if not serial_number:
            raise HTTPException(status_code=400, detail="serial_number is required")

        desired_asset_tag = next_asset_tag(db)
        qr_code = qr_service.generate_asset_qr(desired_asset_tag)

        payload = {
            "p_asset_tag": desired_asset_tag,
            "p_category_slug": category_slug,
            "p_category_name": titleize_slug(category_slug),
            "p_manufacturer_name": (asset.manufacturer_name or "").strip() or None,
            "p_model": (asset.model or "").strip() or None,
            "p_serial_number": serial_number,
            "p_location_code": normalize_location_code(asset.location_code) if asset.location_code else None,
            "p_location_name": (asset.location_name or "").strip() or None,
            "p_status": parse_asset_status(asset.status),
            "p_purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
            "p_warranty_expiry": asset.warranty_expiry.isoformat() if asset.warranty_expiry else None,
            "p_custom_fields": asset.custom_fields or {},
            "p_metadata": asset.metadata or {},
            "p_log_note": "Auto-generated on asset creation",
            "p_qr_code": qr_code,
            "p_actor_employee_code": None,
        }

        response = db.rpc("fn_create_asset_with_log", payload).execute()
        result = response.data
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            raise HTTPException(status_code=500, detail="Unexpected create-asset RPC response")
        if result.get("ok") is not True:
            raise HTTPException(status_code=400, detail=result.get("message", "Failed to create asset"))

        created_tag = str(result.get("asset_tag") or desired_asset_tag).strip()
        return get_asset(created_tag, db)
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.get("/scan/{asset_ref}", response_model=AssetOut)
def scan_asset(asset_ref: str, db=Depends(get_db)):
    """Shortcut for scanning assets via QR."""
    return get_asset(asset_ref, db)


@router.get("/{asset_ref}", response_model=AssetOut)
def get_asset(asset_ref: str, db=Depends(get_db)):
    try:
        row = resolve_asset_inventory_row(db, asset_ref)
        if not row:
            raise HTTPException(status_code=404, detail=f"Asset {asset_ref} not found")

        latest_qr = get_latest_asset_qr(db, str(row["id"]))
        return normalize_asset_row(row, latest_qr)
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.put("/{asset_ref}", response_model=AssetOut)
def update_asset(asset_ref: str, asset: AssetUpdate, db=Depends(get_db), _=Depends(require_manage_platform_access)):
    """Update mutable fields of an existing asset."""
    try:
        existing = resolve_asset_inventory_row(db, asset_ref)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Asset {asset_ref} not found")

        update_data = asset.model_dump(exclude_unset=True, exclude_none=True)
        patch: dict[str, Any] = {}

        if "category_slug" in update_data:
            category_slug = str(update_data["category_slug"]).strip()
            patch["category_id"] = resolve_category_id(db, category_slug, titleize_slug(slugify(category_slug)))

        if "manufacturer_name" in update_data:
            patch["manufacturer_id"] = resolve_manufacturer_id(db, update_data.get("manufacturer_name"))

        if "model" in update_data:
            patch["model"] = str(update_data["model"]).strip() or None

        if "serial_number" in update_data:
            sn = str(update_data["serial_number"]).strip()
            if not sn:
                raise HTTPException(status_code=400, detail="serial_number cannot be empty")
            patch["serial_number"] = sn

        if "location_code" in update_data or "location_name" in update_data:
            patch["location_id"] = resolve_location_id(
                db,
                update_data.get("location_code"),
                update_data.get("location_name"),
            )

        if "status" in update_data:
            status_value = parse_asset_status(update_data.get("status"), required_non_empty=True)
            patch["status"] = status_value

        if "purchase_date" in update_data:
            purchase_date = update_data.get("purchase_date")
            patch["purchase_date"] = purchase_date.isoformat() if purchase_date else None
        if "warranty_expiry" in update_data:
            warranty_expiry = update_data.get("warranty_expiry")
            patch["warranty_expiry"] = warranty_expiry.isoformat() if warranty_expiry else None
        if "custom_fields" in update_data:
            patch["custom_fields"] = update_data.get("custom_fields") or {}
        if "metadata" in update_data:
            patch["metadata"] = update_data.get("metadata") or {}

        if not patch:
            raise HTTPException(status_code=400, detail="No updatable fields provided")

        db.table("assets").update(patch).eq("id", existing["id"]).execute()
        refreshed = resolve_asset_inventory_row(db, existing.get("asset_tag") or str(existing["id"]))
        if not refreshed:
            raise HTTPException(status_code=500, detail="Failed to fetch updated asset")

        latest_qr = get_latest_asset_qr(db, str(existing["id"]))
        return normalize_asset_row(refreshed, latest_qr)
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@browser_router.post("/qr-labels/export")
def export_asset_qr_labels(
    payload: AssetQrLabelsExportRequest,
    db=Depends(get_db),
    _=Depends(require_manage_platform_access),
):
    try:
        requested_tags = normalize_asset_tag_list(payload.asset_tags or [], min_count=0)

        empty_notice_headers = {
            "Content-Disposition": f'inline; filename="{qr_label_pdf_service.file_name}"',
            "Cache-Control": "no-store",
            "X-Export-Empty": "1",
            "X-Exported-Asset-Count": "0",
        }

        if not requested_tags:
            pdf_bytes = qr_label_pdf_service.build_empty_notice_pdf(
                "No assets to export",
                "There are no assets with tags in the current view. Adjust filters or add assets, then try again.",
            )
            return Response(content=pdf_bytes, media_type="application/pdf", headers=empty_notice_headers)

        printable_tags = get_existing_asset_tags_in_order(db, requested_tags)
        if not printable_tags:
            pdf_bytes = qr_label_pdf_service.build_empty_notice_pdf(
                "No printable labels",
                "None of the requested assets could be found in the directory, or they cannot be printed.",
            )
            return Response(content=pdf_bytes, media_type="application/pdf", headers=empty_notice_headers)

        pdf_bytes = qr_label_pdf_service.build_pdf(printable_tags)
        headers = {
            "Content-Disposition": f'inline; filename="{qr_label_pdf_service.file_name}"',
            "Cache-Control": "no-store",
            "X-Exported-Asset-Count": str(len(printable_tags)),
        }
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)
