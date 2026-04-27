from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from repositories.db import fetchrow_dict, pool
from repositories.errors import NotFoundError, ValidationError


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RecycleBinRepository:
    @staticmethod
    async def insert_entry(
        *,
        entity_type: str,
        entity_id: str,
        label: str,
        payload: dict[str, Any],
        deleted_by_employee_id: Optional[str],
    ) -> str:
        if not (entity_type or "").strip():
            raise ValidationError("entity_type is required")
        if not (entity_id or "").strip():
            raise ValidationError("entity_id is required")
        if not (label or "").strip():
            raise ValidationError("label is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                insert into recycle_bin_entries(entity_type, entity_id, label, payload, deleted_at, deleted_by_employee_id)
                values($1, $2::uuid, $3, $4::jsonb, $5, $6::uuid)
                returning id::text as id
                """,
                entity_type.strip(),
                entity_id,
                label.strip(),
                payload or {},
                _now(),
                deleted_by_employee_id,
            )
            if not row:
                raise RuntimeError("Failed to create recycle bin entry")
            return str(row["id"])

    @staticmethod
    async def get_open_entry(*, entity_type: str, entity_id: str) -> Optional[dict[str, Any]]:
        if not (entity_type or "").strip() or not (entity_id or "").strip():
            raise ValidationError("entity_type and entity_id are required")
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                """
                select id::text as id, entity_type, entity_id::text as entity_id
                  from recycle_bin_entries
                 where entity_type=$1 and entity_id=$2::uuid and restored_at is null
                 order by deleted_at desc
                 limit 1
                """,
                entity_type.strip(),
                entity_id,
            )

    @staticmethod
    async def get_entry(entry_id: str) -> Optional[dict[str, Any]]:
        """Fetch a single recycle bin entry by its UUID (open or restored)."""
        eid = (entry_id or "").strip()
        if not eid:
            raise ValidationError("entry_id is required")
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                """
                select id::text as id,
                       entity_type,
                       entity_id::text as entity_id,
                       label,
                       payload,
                       deleted_at,
                       restored_at,
                       deleted_by_employee_id::text as deleted_by_employee_id,
                       restored_by_employee_id::text as restored_by_employee_id
                  from recycle_bin_entries
                 where id = $1::uuid
                """,
                eid,
            )

    @staticmethod
    async def mark_restored(*, recycle_bin_id: str, restored_by_employee_id: Optional[str]) -> None:
        rid = (recycle_bin_id or "").strip()
        if not rid:
            raise ValidationError("recycle_bin_id is required")

        async with pool().acquire() as conn:
            await conn.execute(
                """
                update recycle_bin_entries
                   set restored_at=coalesce(restored_at, $2),
                       restored_by_employee_id=coalesce(restored_by_employee_id, $3::uuid)
                 where id=$1::uuid
                """,
                rid,
                _now(),
                restored_by_employee_id,
            )

