import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from core.auth import require_manage_platform_access
from core.deps import get_db
from core.errors import handle_supabase_error
from schemas.log import AssetLogCreate, AssetLogOut
from services.qr_service import qr_service

router = APIRouter(prefix="/logs", tags=["Logs"])


def _pick_single_relation(value: Any) -> Optional[dict[str, Any]]:
    if isinstance(value, list):
        value = value[0] if value else None
    return value if isinstance(value, dict) else None


def _normalize_log_row(row: dict[str, Any]) -> dict[str, Any]:
    asset_relation = _pick_single_relation(row.get("asset"))
    actor_relation = _pick_single_relation(row.get("actor"))
    metadata = row.get("metadata")

    return {
        "id": row.get("id"),
        "asset_id": row.get("asset_id"),
        "asset_tag": (asset_relation or {}).get("asset_tag"),
        "note": row.get("note"),
        "metadata": metadata if isinstance(metadata, dict) else {},
        "actor_employee_id": row.get("actor_employee_id"),
        "actor_employee_code": (actor_relation or {}).get("employee_code"),
        "actor_employee_name": (actor_relation or {}).get("name"),
        "qr_code": row.get("qr_code"),
        "created_at": row.get("created_at"),
    }


def _resolve_asset_identity(db, asset_ref: str) -> Optional[dict[str, str]]:
    normalized_ref = asset_ref.strip()
    if not normalized_ref:
        return None

    by_tag = db.table("assets").select("id,asset_tag").eq("asset_tag", normalized_ref).limit(1).execute()
    if by_tag.data:
        return {
            "id": by_tag.data[0]["id"],
            "asset_tag": by_tag.data[0].get("asset_tag") or by_tag.data[0]["id"],
        }

    try:
        uuid.UUID(normalized_ref)
    except ValueError:
        return None

    by_id = db.table("assets").select("id,asset_tag").eq("id", normalized_ref).limit(1).execute()
    if not by_id.data:
        return None
    return {
        "id": by_id.data[0]["id"],
        "asset_tag": by_id.data[0].get("asset_tag") or by_id.data[0]["id"],
    }


def _resolve_employee_id(db, employee_code: Optional[str]) -> Optional[str]:
    if not employee_code or not employee_code.strip():
        return None
    normalized_code = employee_code.strip()

    response = (
        db.table("employees")
        .select("id")
        .eq("employee_code", normalized_code)
        .limit(1)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail=f"Employee {normalized_code} not found")
    return response.data[0]["id"]


def _select_logs(db):
    return db.table("asset_logs").select(
        "id,asset_id,actor_employee_id,note,qr_code,metadata,created_at,"
        "asset:assets(asset_tag),actor:employees(employee_code,name)"
    )


@router.get("", response_model=List[AssetLogOut])
def get_logs(db=Depends(get_db)):
    """Fetch the 50 most recent asset log entries."""
    try:
        response = _select_logs(db).order("created_at", desc=True).limit(50).execute()
        return [_normalize_log_row(row) for row in (response.data or [])]
    except Exception as e:
        handle_supabase_error(e)


@router.get("/{asset_ref}", response_model=AssetLogOut)
def get_logs_for_asset(asset_ref: str, db=Depends(get_db)):
    """Fetch the most recent log (with QR) for a specific asset tag or UUID."""
    try:
        asset = _resolve_asset_identity(db, asset_ref)
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset {asset_ref} not found")

        response = (
            _select_logs(db)
            .eq("asset_id", asset["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail=f"No logs found for asset {asset_ref}")
        return _normalize_log_row(response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)


@router.post("", response_model=AssetLogOut, status_code=status.HTTP_201_CREATED)
def create_log(log_data: AssetLogCreate, db=Depends(get_db), _=Depends(require_manage_platform_access)):
    """Create a new log entry and generate a QR code."""
    try:
        asset_ref = log_data.resolved_asset_ref()
        asset = _resolve_asset_identity(db, asset_ref)
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset {asset_ref} not found")

        actor_employee_id = _resolve_employee_id(db, log_data.actor_employee_code)
        qr_data_uri = qr_service.generate_asset_qr(asset["asset_tag"])

        log_entry = {
            "asset_id": asset["id"],
            "actor_employee_id": actor_employee_id,
            "note": log_data.note,
            "qr_code": qr_data_uri,
            "metadata": log_data.metadata or {},
        }

        response = (
            db.table("asset_logs")
            .insert(log_entry)
            .select(
                "id,asset_id,actor_employee_id,note,qr_code,metadata,created_at,"
                "asset:assets(asset_tag),actor:employees(employee_code,name)"
            )
            .execute()
        )

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create log entry")

        return _normalize_log_row(response.data[0])
    except HTTPException:
        raise
    except Exception as e:
        handle_supabase_error(e)
