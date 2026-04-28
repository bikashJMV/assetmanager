from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Optional

from core.asset_db_types import AssetDateCoercionError, normalize_asset_date_fields_inplace
from repositories.db import fetchrow_dict, pool
from repositories.errors import NotFoundError, ValidationError
from repositories.meta_repository import MetaRepository


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AssetWriteRepository:
    @staticmethod
    async def mark_soft_deleted(
        *,
        asset_id: str,
        deleted_by_employee_id: Optional[str],
    ) -> dict[str, Any]:
        if not (asset_id or "").strip():
            raise ValidationError("asset_id is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                update assets
                   set is_deleted=true,
                       deleted_at=$2,
                       deleted_by_employee_id=$3::uuid,
                       updated_at=now()
                 where id=$1::uuid and coalesce(is_deleted,false)=false
                 returning id::text as id, asset_tag, serial_number
                """,
                asset_id,
                _now(),
                deleted_by_employee_id,
            )
            if not row:
                raise NotFoundError("Asset not found or already deleted")
            return row

    @staticmethod
    async def mark_restored(*, asset_id: str, restored_by_employee_id: Optional[str]) -> dict[str, Any]:
        if not (asset_id or "").strip():
            raise ValidationError("asset_id is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                update assets
                   set is_deleted=false,
                       deleted_at=null,
                       deleted_by_employee_id=null,
                       updated_at=now(),
                       updated_by=$2::uuid
                 where id=$1::uuid and coalesce(is_deleted,false)=true
                 returning id::text as id, asset_tag, serial_number
                """,
                asset_id,
                restored_by_employee_id,
            )
            if not row:
                raise NotFoundError("Asset not found or not deleted")
            return row

    @staticmethod
    async def create_asset(
        *,
        asset_tag: Optional[str] = None,
        category_id: str,
        manufacturer_id: Optional[str] = None,
        location_id: Optional[str] = None,
        model: Optional[str] = None,
        serial_number: str,
        status: Optional[str] = None,
        purchase_date: Optional[date] = None,
        warranty_expiry: Optional[date] = None,
        custom_fields: Optional[dict] = None,
        metadata: Optional[dict] = None,
        qr_code: Optional[str] = None,
        created_by_employee_id: Optional[str] = None,
    ) -> dict[str, Any]:
        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                insert into assets (
                    asset_tag, category_id, manufacturer_id, location_id,
                    model, serial_number, status, purchase_date,
                    warranty_expiry, custom_fields, metadata, qr_code,
                    created_by_employee_id, created_at, updated_at
                ) values (
                    $1, $2::uuid, $3::uuid, $4::uuid,
                    $5, $6, $7, $8::date,
                    $9::date, $10::jsonb, $11::jsonb, $12,
                    $13::uuid, now(), now()
                ) returning id::text as id, asset_tag, serial_number
                """,
                asset_tag, category_id, manufacturer_id, location_id,
                model, serial_number, status, purchase_date,
                warranty_expiry, custom_fields or {}, metadata or {}, qr_code,
                created_by_employee_id
            )
            return row
    async def update_status(
        *,
        asset_tag: str,
        new_status: str,
        updated_by_employee_id: str,
    ) -> dict[str, Any]:
        """Update asset status and return old and new rows."""
        async with pool().acquire() as conn:
            # 1. Fetch old state
            old_row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where asset_tag=$1",
                asset_tag,
            )
            if not old_row:
                raise NotFoundError(f"Asset with tag {asset_tag} not found")

            # 2. Update and fetch new state
            await conn.execute(
                """
                update assets
                   set status=$2,
                       updated_at=now()
                 where asset_tag=$1
                """,
                asset_tag,
                new_status,
            )
            new_row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where asset_tag=$1",
                asset_tag,
            )
            return {"old": old_row, "new": new_row}
    async def update_asset(
        *,
        asset_id: Optional[str] = None,
        asset_tag: Optional[str] = None,
        payload: dict[str, Any],
        updated_by_employee_id: str,
    ) -> dict[str, Any]:
        """Update asset and return old and new rows."""
        if not asset_id and not asset_tag:
            raise ValidationError("Either asset_id or asset_tag is required")

        try:
            normalize_asset_date_fields_inplace(payload)
        except AssetDateCoercionError as exc:
            raise ValidationError(str(exc)) from exc

        async with pool().acquire() as conn:
            # 0. Fetch old state
            lookup_field = "id" if asset_id else "asset_tag"
            old_row = await fetchrow_dict(
                conn,
                f"select * from v_asset_inventory where {lookup_field}::text=$1",
                str(asset_id or asset_tag)
            )
            if not old_row:
                raise NotFoundError(f"Asset not found")

            # 1. Resolve meta if strings provided
            if "category_slug" in payload:
                payload["category_id"] = await MetaRepository.resolve_category(payload["category_slug"], payload.get("category_name"))
            if "manufacturer_name" in payload and payload.get("manufacturer_name"):
                payload["manufacturer_id"] = await MetaRepository.resolve_manufacturer(payload["manufacturer_name"])
            if "location_code" in payload or "location_name" in payload:
                resolved = await MetaRepository.resolve_location(
                    code=payload.get("location_code"),
                    name=payload.get("location_name"),
                )
                if resolved:
                    payload["location_id"] = resolved

            set_clauses = []
            args = []
            
            updatable_fields = [
                "asset_tag", "model", "serial_number", "status", 
                "purchase_date", "warranty_expiry", "custom_fields", 
                "metadata", "qr_code", "category_id", "manufacturer_id", "location_id"
            ]
            
            for field in updatable_fields:
                if field in payload:
                    value = payload[field]
                    args.append(value)
                    set_clauses.append(f"{field}=${len(args)}")
            
            if not set_clauses:
                return {"old": old_row, "new": old_row} # No changes
            
            args.append(asset_id or asset_tag)
            lookup_field_sql = "id" if asset_id else "asset_tag"
            sql = f"update assets set {', '.join(set_clauses)}, updated_at=now() where {lookup_field_sql}=${len(args)}"
            
            await conn.execute(sql, *args)
            new_row = await fetchrow_dict(
                conn,
                f"select * from v_asset_inventory where {lookup_field}::text=$1",
                str(asset_id or asset_tag)
            )
            return {"old": old_row, "new": new_row}


    @staticmethod
    async def assign_asset(
        *,
        asset_id: str,
        employee_id: str,
        actor_id: str,
        notes: Optional[str] = None,
        assigned_at: Optional[str] = None,
    ) -> None:
        """Assign asset to employee."""
        async with pool().acquire() as conn:
            async with conn.transaction():
                # 1. Update asset status
                await conn.execute(
                    "update assets set status='assigned', updated_at=now() where id=$1::uuid",
                    asset_id
                )
                # 2. Insert assignment
                await conn.execute(
                    """
                    insert into asset_assignments (asset_id, employee_id, assigned_at, notes, source)
                    values ($1::uuid, $2::uuid, coalesce($3::timestamptz, now()), $4, 'runtime')
                    """,
                    asset_id, employee_id, assigned_at, notes
                )

    @staticmethod
    async def return_asset(
        *,
        asset_id: str,
        actor_id: str,
        notes: Optional[str] = None,
        returned_at: Optional[str] = None,
    ) -> None:
        """Return asset to stock."""
        async with pool().acquire() as conn:
            async with conn.transaction():
                # 1. Update asset status
                await conn.execute(
                    "update assets set status='in_stock', updated_at=now() where id=$1::uuid",
                    asset_id
                )
                # 2. Close assignment
                await conn.execute(
                    """
                    update asset_assignments 
                       set returned_at = coalesce($2::timestamptz, now()), 
                           notes = case when $3 is not null then notes || '\nReturn Note: ' || $3 else notes end
                     where asset_id = $1::uuid and returned_at is null
                    """,
                    asset_id, returned_at, notes
                )
