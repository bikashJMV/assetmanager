from __future__ import annotations

import asyncpg  # type: ignore[import-untyped]  # asyncpg ships no stubs / py.typed marker
import json

from core.settings import settings  # type: ignore[import-not-found]  # resolved at runtime; per-file mypy lacks the package root

_pool: asyncpg.Pool | None = None


def _build_dsn() -> str:
    if settings.DATABASE_URL.strip():
        return str(settings.DATABASE_URL.strip())

    user = settings.POSTGRES_USER.strip()
    password = settings.POSTGRES_PASSWORD
    host = settings.POSTGRES_HOST.strip()
    port = settings.POSTGRES_PORT
    db = settings.POSTGRES_DB.strip()
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )


async def init_pg_pool() -> None:
    global _pool
    if _pool is not None:
        return

    _pool = await asyncpg.create_pool(
        dsn=_build_dsn(),
        min_size=settings.POSTGRES_MIN_POOL_SIZE,
        max_size=settings.POSTGRES_MAX_POOL_SIZE,
        command_timeout=settings.POSTGRES_COMMAND_TIMEOUT_SECONDS,
        init=_init_connection,
    )


async def close_pg_pool() -> None:
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None


def get_pg_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Postgres pool not initialized.")
    return _pool

