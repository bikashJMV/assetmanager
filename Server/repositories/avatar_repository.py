from __future__ import annotations

from typing import Any, Optional

from repositories.db import pool


class AvatarRepository:
    """Persistence for employee_avatars (one row per employee; raw bytes in bytea)."""

    @staticmethod
    async def get(employee_id: str) -> Optional[dict[str, Any]]:
        async with pool().acquire() as conn:
            row = await conn.fetchrow(
                "select image_data, mime_type, byte_size, updated_at "
                "from employee_avatars where employee_id = $1::uuid",
                employee_id,
            )
            return dict(row) if row else None

    @staticmethod
    async def upsert(*, employee_id: str, image_data: bytes, mime_type: str, byte_size: int) -> None:
        async with pool().acquire() as conn:
            await conn.execute(
                """
                insert into employee_avatars (employee_id, image_data, mime_type, byte_size, updated_at)
                values ($1::uuid, $2, $3, $4, now())
                on conflict (employee_id) do update
                   set image_data = excluded.image_data,
                       mime_type  = excluded.mime_type,
                       byte_size  = excluded.byte_size,
                       updated_at = now()
                """,
                employee_id,
                image_data,
                mime_type,
                byte_size,
            )

    @staticmethod
    async def delete(employee_id: str) -> bool:
        async with pool().acquire() as conn:
            result = await conn.execute(
                "delete from employee_avatars where employee_id = $1::uuid",
                employee_id,
            )
        return bool(result != "DELETE 0")
