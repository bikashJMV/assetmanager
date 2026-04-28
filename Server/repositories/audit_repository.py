from __future__ import annotations

from typing import Any, Optional

import asyncpg

from repositories.db import pool
from repositories.errors import ValidationError


class AuditRepository:
    @staticmethod
    async def insert_asset_log(
        *,
        asset_id: str,
        actor_employee_id: Optional[str],
        note: Optional[str],
        qr_code: Optional[str],
        metadata: dict[str, Any],
        conn: asyncpg.Connection | None = None,
    ) -> None:
        if not (asset_id or "").strip():
            raise ValidationError("asset_id is required")

        if conn is None:
            async with pool().acquire() as borrowed:
                await borrowed.execute(
                    """
                    insert into asset_logs(asset_id, actor_employee_id, note, qr_code, metadata)
                    values($1::uuid, $2::uuid, $3, $4, $5::jsonb)
                    """,
                    asset_id,
                    actor_employee_id,
                    (note or "").strip() or None,
                    (qr_code or "").strip() or None,
                    metadata or {},
                )
            return

        await conn.execute(
            """
            insert into asset_logs(asset_id, actor_employee_id, note, qr_code, metadata)
            values($1::uuid, $2::uuid, $3, $4, $5::jsonb)
            """,
            asset_id,
            actor_employee_id,
            (note or "").strip() or None,
            (qr_code or "").strip() or None,
            metadata or {},
        )

    @staticmethod
    async def insert_asset_event(
        *,
        asset_id: str,
        event_type: str,
        actor_id: Optional[str],
        payload: dict[str, Any],
        ip_address: Optional[str],
        user_agent: Optional[str],
        conn: asyncpg.Connection | None = None,
    ) -> None:
        if not (asset_id or "").strip():
            raise ValidationError("asset_id is required")
        if not (event_type or "").strip():
            raise ValidationError("event_type is required")

        if conn is None:
            async with pool().acquire() as borrowed:
                await borrowed.execute(
                    """
                    insert into asset_events(asset_id, event_type, actor_id, payload, ip_address, user_agent)
                    values($1::uuid, $2::asset_event_type, $3, $4::jsonb, $5::inet, $6)
                    """,
                    asset_id,
                    event_type,
                    (actor_id or "").strip() or None,
                    payload or {},
                    (ip_address or "").strip() or None,
                    (user_agent or "").strip() or None,
                )
            return

        await conn.execute(
            """
            insert into asset_events(asset_id, event_type, actor_id, payload, ip_address, user_agent)
            values($1::uuid, $2::asset_event_type, $3, $4::jsonb, $5::inet, $6)
            """,
            asset_id,
            event_type,
            (actor_id or "").strip() or None,
            payload or {},
            (ip_address or "").strip() or None,
            (user_agent or "").strip() or None,
        )
