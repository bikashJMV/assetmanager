from __future__ import annotations

import datetime
from typing import Any, Optional
import uuid
import asyncpg

from repositories.db import pool, fetchrow_dict, fetch_dicts, Page, normalize_page_params
from repositories.errors import NotFoundError, ValidationError


class QrRepository:
    """
    DB layer for qr_batches and qr_tag_reservations.
    Async with asyncpg. Idempotent. Atomic.
    """

    @staticmethod
    async def get_batch_by_idempotency_key(key: str) -> Optional[dict[str, Any]]:
        """Lookup for idempotency check."""
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                "SELECT * FROM qr_batches WHERE idempotency_key = $1",
                key,
            )

    @staticmethod
    async def get_batch_by_id(batch_id: str) -> Optional[dict[str, Any]]:
        """Fetch single batch."""
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                "SELECT * FROM qr_batches WHERE id = $1::uuid",
                batch_id,
            )

    @staticmethod
    async def list_batches(page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
        """Paginated list of batches."""
        p = normalize_page_params(page, limit)
        async with pool().acquire() as conn:
            total = await conn.fetchval("SELECT COUNT(*) FROM qr_batches")
            rows = await fetch_dicts(
                conn,
                "SELECT * FROM qr_batches ORDER BY created_at DESC OFFSET $1 LIMIT $2",
                p.offset,
                p.limit,
            )
            return rows, total

    @staticmethod
    async def list_reservations_for_batch(batch_id: str) -> list[dict[str, Any]]:
        """Reservations in batch."""
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                "SELECT * FROM qr_tag_reservations WHERE batch_id = $1::uuid ORDER BY created_at ASC",
                batch_id,
            )

    @staticmethod
    async def get_reservation_by_id(reservation_id: str) -> Optional[dict[str, Any]]:
        """Used by create_asset (Step 4)."""
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                "SELECT * FROM qr_tag_reservations WHERE id = $1::uuid",
                reservation_id,
            )

    @staticmethod
    async def get_reservation_by_uuid_for_scan(reservation_id: str) -> Optional[dict[str, Any]]:
        """Used by scan endpoint when ref is a UUID. Joins batch_code."""
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                """
                SELECT r.id, r.batch_id, r.asset_tag, r.status,
                       r.asset_id, r.linked_at, r.created_at,
                       b.batch_code
                  FROM qr_tag_reservations r
                  JOIN qr_batches b ON r.batch_id = b.id
                 WHERE r.id = $1::uuid
                """,
                reservation_id,
            )

    @staticmethod
    async def create_batch_atomic(
        *,
        idempotency_key: str,
        count: int,
        created_by_employee_id: str | uuid.UUID,
    ) -> dict[str, Any]:
        if count <= 0 or count > 1000:
            raise ValidationError("count must be between 1 and 1000")

        key = idempotency_key.strip()
        if not key:
            raise ValidationError("idempotency_key is required")

        async with pool().acquire() as conn:
            async with conn.transaction():
                # Idempotency check
                existing = await fetchrow_dict(
                    conn,
                    "select * from qr_batches where idempotency_key = $1 for update",
                    key,
                )
                if existing:
                    reservations = await fetch_dicts(
                        conn,
                        """
                        select id, batch_id, asset_tag, status, asset_id,
                               linked_at, created_at
                          from qr_tag_reservations
                         where batch_id = $1::uuid
                         order by created_at asc
                        """,
                        str(existing["id"]),
                    )
                    existing["reservations"] = reservations
                    return existing

                # Generate batch_code
                batch_seq = await conn.fetchval(
                    "select count(*)::bigint + 1 from qr_batches"
                )
                from datetime import datetime
                batch_code = f"QR-{datetime.utcnow().year}-{int(batch_seq):04d}"

                # Insert batch row
                batch = await fetchrow_dict(
                    conn,
                    """
                    insert into qr_batches
                        (idempotency_key, batch_code, requested_count,
                         status, created_by_employee_id, completed_at)
                    values ($1, $2, $3, 'generated', $4::uuid, now())
                    returning *
                    """,
                    key,
                    batch_code,
                    count,
                    str(created_by_employee_id),
                )

                # Bulk insert N unlinked reservations (no asset_tag yet)
                await conn.execute(
                    """
                    insert into qr_tag_reservations (batch_id, status)
                    select $1::uuid, 'unlinked'
                    from generate_series(1, $2)
                    """,
                    str(batch["id"]),
                    count,
                )

                # Re-fetch reservations
                reservations = await fetch_dicts(
                    conn,
                    """
                    select id, batch_id, asset_tag, status, asset_id,
                           linked_at, created_at
                      from qr_tag_reservations
                     where batch_id = $1::uuid
                     order by created_at asc
                    """,
                    str(batch["id"]),
                )
                batch["reservations"] = reservations
                return batch


    @staticmethod
    async def link_reservation_in_tx(
        *,
        conn: Any,
        reservation_id: str | uuid.UUID,
        asset_tag: str,
        asset_id: str | uuid.UUID,
    ) -> dict[str, Any]:
        """
        Atomically link a reservation to an asset (status: unlinked → linked).
        Writes asset_tag and asset_id onto the reservation row within an existing TX.
        Race-safe: WHERE status='unlinked' ensures only one caller wins.
        Throws NotFoundError if reservation missing or already linked.
        """
        row = await fetchrow_dict(
            conn,
            """
            update qr_tag_reservations
               set status    = 'linked',
                   asset_tag = $2,
                   asset_id  = $3::uuid,
                   linked_at = now()
             where id = $1::uuid
               and status = 'unlinked'
         returning id, batch_id, asset_tag, status, asset_id, linked_at
            """,
            str(reservation_id),
            asset_tag,
            str(asset_id),
        )
        if not row:
            raise NotFoundError(
                f"Reservation {reservation_id} not found or already linked"
            )
        return row

