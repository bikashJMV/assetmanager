from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, AsyncIterator
from uuid import UUID

from repositories.db import pool


def _stringify_csv_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID,)):
        return str(value)
    if isinstance(value, (Decimal,)):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def _csv_line(values: list[str]) -> str:
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(values)
    return buf.getvalue()


def _quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


class AssetCsvExportService:
    """
    Stream all asset inventory rows as CSV efficiently.

    - Reads from v_asset_inventory (canonical view used across the API).
    - Uses asyncpg server-side cursor (requires a transaction) to avoid loading everything in memory.
    """

    @staticmethod
    async def stream_inventory_csv(*, prefetch: int = 1000) -> AsyncIterator[str]:
        async with pool().acquire() as conn:
            # Determine stable column order from information_schema (works for views too).
            cols = await conn.fetch(
                """
                select column_name
                  from information_schema.columns
                 where table_schema='public'
                   and table_name='v_asset_inventory'
                 order by ordinal_position asc
                """
            )
            columns = [str(r["column_name"]) for r in cols if r and r.get("column_name")]

            if not columns:
                # Fallback: still return a valid CSV file with no data.
                yield ""
                return

            yield _csv_line(columns)

            select_cols = ", ".join(_quote_ident(c) for c in columns)
            query = f"select {select_cols} from v_asset_inventory order by updated_at desc"

            async with conn.transaction():
                async for record in conn.cursor(query, prefetch=prefetch):
                    row = dict(record)
                    values = [_stringify_csv_value(row.get(c)) for c in columns]
                    yield _csv_line(values)


asset_csv_export_service = AssetCsvExportService()

