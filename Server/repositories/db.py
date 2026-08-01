from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import asyncpg  # type: ignore[import-untyped]  # asyncpg ships no stubs / py.typed marker

from core.postgres import get_pg_pool


DEFAULT_PAGE = 1
DEFAULT_LIMIT = 50
MAX_LIMIT = 200


@dataclass(frozen=True)
class Page:
    page: int
    limit: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


def normalize_page_params(page: int | None, limit: int | None) -> Page:
    resolved_page = DEFAULT_PAGE if page is None else int(page)
    resolved_limit = DEFAULT_LIMIT if limit is None else int(limit)

    if resolved_page < 1:
        resolved_page = DEFAULT_PAGE
    if resolved_limit < 1:
        resolved_limit = DEFAULT_LIMIT
    if resolved_limit > MAX_LIMIT:
        resolved_limit = MAX_LIMIT

    return Page(page=resolved_page, limit=resolved_limit)


def _json_safe(value: object) -> object:
    """Recursively coerce non-JSON-serializable types returned by asyncpg."""
    if isinstance(value, (uuid.UUID,)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


async def fetchrow_dict(conn: asyncpg.Connection, query: str, *args: Any) -> dict[str, Any] | None:
    row = await conn.fetchrow(query, *args)
    if row is None:
        return None
    return {k: _json_safe(v) for k, v in dict(row).items()}


async def fetch_dicts(conn: asyncpg.Connection, query: str, *args: Any) -> list[dict[str, Any]]:
    rows = await conn.fetch(query, *args)
    return [{k: _json_safe(v) for k, v in dict(r).items()} for r in rows]


def pool() -> asyncpg.Pool:
    return get_pg_pool()

