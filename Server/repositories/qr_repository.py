from __future__ import annotations

from typing import Any, Optional
import uuid

from repositories.db import pool, fetchrow_dict, fetch_dicts, normalize_page_params
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
    async def list_unused_reservations(page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
        """Reservations generated but never linked to an asset (status='reserved'), FIFO oldest-first."""
        p = normalize_page_params(page, limit)
        where = "r.status = 'reserved' AND r.consumed_by_asset_id IS NULL"
        async with pool().acquire() as conn:
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM qr_tag_reservations r WHERE {where}"
            )
            rows = await fetch_dicts(
                conn,
                f"""
                SELECT r.id::text AS reservation_id,
                       r.asset_tag,
                       r.created_at AS reserved_at,
                       b.batch_code,
                       b.created_at AS batch_created_at
                  FROM qr_tag_reservations r
                  JOIN qr_batches b ON b.id = r.batch_id
                 WHERE {where}
                 ORDER BY r.created_at ASC, r.asset_tag ASC
                 OFFSET $1 LIMIT $2
                """,
                p.offset,
                p.limit,
            )
            return rows, int(total)

    @staticmethod
    async def list_all_unused_tags(cap: int = 2000) -> list[str]:
        """All unused (reserved, never-linked) asset tags, FIFO. Capped for a sane PDF size."""
        async with pool().acquire() as conn:
            rows = await conn.fetch(
                "SELECT asset_tag FROM qr_tag_reservations "
                "WHERE status = 'reserved' AND consumed_by_asset_id IS NULL "
                "ORDER BY created_at ASC, asset_tag ASC LIMIT $1",
                cap,
            )
        return [str(r["asset_tag"]) for r in rows]

    @staticmethod
    async def count_unused_reservations() -> int:
        """Cheap count of unused (reserved, never-linked) QR reservations for the UI badge."""
        async with pool().acquire() as conn:
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM qr_tag_reservations "
                "WHERE status = 'reserved' AND consumed_by_asset_id IS NULL"
            )
            return int(total)

    @staticmethod
    async def list_reservations_for_batch(batch_id: str) -> list[dict[str, Any]]:
        """Reservations in batch."""
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                "SELECT * FROM qr_tag_reservations WHERE batch_id = $1::uuid ORDER BY asset_tag ASC",
                batch_id,
            )

    @staticmethod
    async def get_reservation_by_tag(asset_tag: str) -> Optional[dict[str, Any]]:
        """Used by scan endpoint (Step 4). Joins with batch_code."""
        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                """
                SELECT r.*, b.batch_code 
                FROM qr_tag_reservations r
                JOIN qr_batches b ON r.batch_id = b.id
                WHERE r.asset_tag = $1
                """,
                asset_tag,
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
                        select id, batch_id, asset_tag, status, consumed_by_asset_id,
                               consumed_at, created_at
                          from qr_tag_reservations
                         where batch_id = $1::uuid
                         order by asset_tag asc
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

                # Reserve N tags atomically via sequence. QR batches are category-agnostic
                # (category is chosen when the sticker is later logged), so reserved tags use the
                # generic 'JMV-GEN-#####' pool; nextval starts at 1 so an all-zero tag is impossible.
                tag_rows = await fetch_dicts(
                    conn,
                    """
                    select 'JMV-GEN-' || lpad(nextval('asset_tag_seq')::text, 5, '0') as tag
                      from generate_series(1, $1)
                    """,
                    count,
                )
                tags = [r["tag"] for r in tag_rows]
                start_tag = tags[0]
                end_tag = tags[-1]

                # Insert batch row with status='generated' (matches DB CHECK constraint)
                batch = await fetchrow_dict(
                    conn,
                    """
                    insert into qr_batches
                        (idempotency_key, batch_code, requested_count,
                         start_tag, end_tag, status,
                         created_by_employee_id, completed_at)
                    values ($1, $2, $3, $4, $5, 'generated', $6::uuid, now())
                    returning *
                    """,
                    key,
                    batch_code,
                    count,
                    start_tag,
                    end_tag,
                    str(created_by_employee_id),
                )

                # Bulk insert reservations with status='reserved' (correct for reservations table)
                await conn.execute(
                    """
                    insert into qr_tag_reservations (batch_id, asset_tag, status)
                    select $1::uuid, unnest($2::text[]), 'reserved'
                    """,
                    str(batch["id"]),
                    tags,
                )

                # Re-fetch reservations
                reservations = await fetch_dicts(
                    conn,
                    """
                    select id, batch_id, asset_tag, status, consumed_by_asset_id,
                           consumed_at, created_at
                      from qr_tag_reservations
                     where batch_id = $1::uuid
                     order by asset_tag asc
                    """,
                    str(batch["id"]),
                )
                batch["reservations"] = reservations
                return batch


    @staticmethod
    async def consume_reservation_in_tx(
        *,
        conn: Any,
        reservation_id: str | uuid.UUID,
    ) -> dict[str, Any]:
        """
        Atomically claim a reservation (status: reserved → consumed) within an existing TX.
        
        Does NOT set consumed_by_asset_id — caller must update it separately
        after the asset is inserted (so we have the real asset id).
        
        Race-safe: WHERE status='reserved' guarantees only one caller wins.
        Throws NotFoundError if reservation missing or already consumed.
        """
        row = await fetchrow_dict(
            conn,
            """
            update qr_tag_reservations
               set status = 'consumed',
                   consumed_at = now()
             where id = $1::uuid
               and status = 'reserved'
         returning id, batch_id, asset_tag, status, consumed_at
            """,
            str(reservation_id),
        )
        if not row:
            raise NotFoundError(
                f"Reservation {reservation_id} not found or already consumed"
            )
        return row

