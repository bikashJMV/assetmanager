from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import asyncpg

from core.settings import settings
from models.schemas import TelemetryEvent

logger = logging.getLogger("telemetry.storage")


def _delete_rowcount(status: str) -> int:
    parts = status.split()
    if len(parts) >= 2 and parts[0] == "DELETE":
        try:
            return int(parts[1])
        except ValueError:
            return 0
    return 0


@dataclass
class Storage:
    _pool: asyncpg.Pool | None = None

    def _fq(self, table: str) -> str:
        s = settings.DATABASE_SCHEMA.replace('"', "")
        t = table.replace('"', "")
        return f'"{s}"."{t}"'

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Storage pool is not attached; check application lifespan.")
        return self._pool

    async def attach_pool(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        await self._verify_schema()
        logger.info("storage.pool.attached schema=%s", settings.DATABASE_SCHEMA)

    async def detach_pool(self) -> None:
        self._pool = None

    async def _verify_schema(self) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            # Ensures table exists (empty table is OK).
            await conn.execute(f"SELECT 1 FROM {self._fq('telemetry_ingest_keys')} WHERE false")
        logger.info("storage.schema.ok")

    async def init(self) -> None:
        """Compatibility: schema is created via SQL migration; pool must already be attached."""
        if self._pool is None:
            raise RuntimeError("attach_pool must be called before init")
        logger.info("storage.init.done")

    async def audit_access(
        self,
        endpoint: str,
        environment: str | None,
        query_window: str,
        result_size: int,
        actor: str = "it_ops_api_key",
    ) -> None:
        pool = self._require_pool()
        t = self._fq("telemetry_access_audit")
        sql = f"""
            INSERT INTO {t} (actor, endpoint, environment, query_window, result_size, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        """
        async with pool.acquire() as conn:
            await conn.execute(
                sql,
                actor,
                endpoint,
                environment,
                query_window,
                result_size,
                datetime.now(timezone.utc),
            )

    async def reserve_event_key(self, source: str, event_id: str) -> bool:
        pool = self._require_pool()
        t = self._fq("telemetry_ingest_keys")
        sql = f"""
            INSERT INTO {t} (source, event_id, first_seen_at)
            VALUES ($1, $2, $3::timestamptz)
            ON CONFLICT (source, event_id) DO NOTHING
            RETURNING source
        """
        async with pool.acquire() as conn:
            row = await conn.fetchrow(sql, source, event_id, datetime.now(timezone.utc))
        reserved = row is not None
        logger.debug("storage.reserve source=%s event_id=%s reserved=%s", source, event_id, reserved)
        return reserved

    async def release_event_key(self, source: str, event_id: str) -> None:
        pool = self._require_pool()
        t = self._fq("telemetry_ingest_keys")
        async with pool.acquire() as conn:
            await conn.execute(f"DELETE FROM {t} WHERE source = $1 AND event_id = $2", source, event_id)
        logger.debug("storage.release source=%s event_id=%s", source, event_id)

    async def insert_event(self, event: TelemetryEvent) -> bool:
        pool = self._require_pool()
        meta: dict[str, Any] = dict(event.metadata) if isinstance(event.metadata, dict) else json.loads(json.dumps(event.metadata))
        created = event.created_at if event.created_at.tzinfo else event.created_at.replace(tzinfo=timezone.utc)

        async with pool.acquire() as conn:
            if event.source in ("server_api", "client_data"):
                table = "telemetry_events_success" if event.success is True else "telemetry_events_error"
                t = self._fq(table)
                await conn.execute(
                    f"""
                    INSERT INTO {t}(
                      source, event_id, event_name, event_domain, route_pattern, method, status_code, duration_ms,
                      error_category, operation_name, table_or_rpc, actor_role, session_id, request_id, trace_id,
                      environment, priority, sample_rate, metadata, created_at
                    ) VALUES (
                      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::timestamptz
                    )
                    """,
                    event.source,
                    event.event_id,
                    event.event_name,
                    event.event_domain,
                    event.route_pattern,
                    event.method,
                    event.status_code,
                    event.duration_ms,
                    event.error_category,
                    event.operation_name,
                    event.table_or_rpc,
                    event.actor_role,
                    event.session_id,
                    event.request_id,
                    event.trace_id,
                    event.environment,
                    event.priority,
                    float(event.sample_rate),
                    meta,
                    created,
                )
            else:
                t = self._fq("telemetry_events_general")
                await conn.execute(
                    f"""
                    INSERT INTO {t}(
                      source, event_id, event_name, event_domain, route_pattern, operation_name, table_or_rpc,
                      actor_role, session_id, request_id, trace_id, environment, priority, sample_rate, metadata, created_at
                    ) VALUES (
                      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                      $15::jsonb,$16::timestamptz
                    )
                    """,
                    event.source,
                    event.event_id,
                    event.event_name,
                    event.event_domain,
                    event.route_pattern,
                    event.operation_name,
                    event.table_or_rpc,
                    event.actor_role,
                    event.session_id,
                    event.request_id,
                    event.trace_id,
                    event.environment,
                    event.priority,
                    float(event.sample_rate),
                    meta,
                    created,
                )
        logger.debug("storage.insert.ok source=%s event_id=%s", event.source, event.event_id)
        return True

    async def insert_dead_letter(
        self,
        stage: str,
        reason: str,
        payload: str,
        source: str | None,
        event_id: str | None,
        schema_version: int | None,
    ) -> None:
        pool = self._require_pool()
        t = self._fq("telemetry_dead_letter")
        async with pool.acquire() as conn:
            await conn.execute(
                f"""
                INSERT INTO {t} (received_at, failure_stage, failure_reason, source, event_id, schema_version, sanitized_payload)
                VALUES ($1::timestamptz, $2, $3, $4, $5, $6, $7)
                """,
                datetime.now(timezone.utc),
                stage,
                reason,
                source,
                event_id,
                schema_version,
                payload,
            )
        logger.warning("storage.dlq.insert stage=%s source=%s event_id=%s", stage, source, event_id)

    async def overview(self, window_hours: int, env: str | None = None) -> dict[str, Any]:
        pool = self._require_pool()
        tes, tee = self._fq("telemetry_events_success"), self._fq("telemetry_events_error")
        if env:
            where_env_s = " AND environment = $2 "
            where_env_e = " AND environment = $2 "
            args_s: list[Any] = [window_hours, env]
            args_e: list[Any] = [window_hours, env]
            args_p95: list[Any] = [window_hours, env]
        else:
            where_env_s = ""
            where_env_e = ""
            args_s = [window_hours]
            args_e = [window_hours]
            args_p95 = [window_hours]

        sql_count_s = f"""
            SELECT count(*)::bigint FROM {tes}
            WHERE created_at >= (now() - $1::int * interval '1 hour'){where_env_s}
        """
        sql_count_e = f"""
            SELECT count(*)::bigint FROM {tee}
            WHERE created_at >= (now() - $1::int * interval '1 hour'){where_env_e}
        """
        sql_p95 = f"""
            SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)
            FROM {tes}
            WHERE duration_ms IS NOT NULL
              AND created_at >= (now() - $1::int * interval '1 hour'){where_env_s}
        """

        async with pool.acquire() as conn:
            success = await conn.fetchval(sql_count_s, *args_s)
            errors = await conn.fetchval(sql_count_e, *args_e)
            p95 = await conn.fetchval(sql_p95, *args_p95)

        return {"success_count": int(success or 0), "error_count": int(errors or 0), "p95_duration_ms": p95}

    async def cleanup_retention(self) -> dict[str, int]:
        pool = self._require_pool()
        tes = self._fq("telemetry_events_success")
        tee = self._fq("telemetry_events_error")
        teg = self._fq("telemetry_events_general")
        tik = self._fq("telemetry_ingest_keys")

        async with pool.acquire() as conn:
            async with conn.transaction():
                st1 = await conn.execute(
                    f"DELETE FROM {tes} WHERE created_at < now() - $1::int * interval '1 day'",
                    settings.RETAIN_SUCCESS_DAYS,
                )
                st2 = await conn.execute(
                    f"DELETE FROM {tee} WHERE created_at < now() - $1::int * interval '1 day'",
                    settings.RETAIN_ERROR_DAYS,
                )
                st3 = await conn.execute(
                    f"DELETE FROM {tik} WHERE first_seen_at < now() - $1::int * interval '1 hour'",
                    settings.RETAIN_KEYS_HOURS,
                )
                st4 = await conn.execute(
                    f"DELETE FROM {teg} WHERE created_at < now() - $1::int * interval '1 day'",
                    settings.RETAIN_GENERAL_DAYS,
                )

        result = {
            "success_deleted": _delete_rowcount(st1),
            "error_deleted": _delete_rowcount(st2),
            "keys_deleted": _delete_rowcount(st3),
            "general_deleted": _delete_rowcount(st4),
        }
        logger.info("storage.retention.cleanup %s", result)
        return result

    async def db_health(self) -> bool:
        try:
            pool = self._require_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            return True
        except Exception:
            logger.exception("storage.db_health.fail")
            return False

    def _serialize_row(self, row: asyncpg.Record) -> dict[str, Any]:
        d = dict(row)
        ca = d.get("created_at")
        if isinstance(ca, datetime):
            d["created_at"] = ca.isoformat()
        md = d.get("metadata")
        if md is not None and not isinstance(md, (dict, list)):
            d["metadata"] = md
        return d

    async def get_events(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        pool = self._require_pool()
        tes, tee, teg = (
            self._fq("telemetry_events_success"),
            self._fq("telemetry_events_error"),
            self._fq("telemetry_events_general"),
        )
        sql = f"""
            SELECT * FROM (
                SELECT
                    'success'::text AS table_source, id, source, event_id, event_name, event_domain, route_pattern,
                    method, status_code, duration_ms, error_category, operation_name, table_or_rpc, actor_role,
                    session_id, request_id, trace_id, environment, priority, sample_rate, metadata, created_at
                FROM {tes}
                UNION ALL
                SELECT
                    'error'::text AS table_source, id, source, event_id, event_name, event_domain, route_pattern,
                    method, status_code, duration_ms, error_category, operation_name, table_or_rpc, actor_role,
                    session_id, request_id, trace_id, environment, priority, sample_rate, metadata, created_at
                FROM {tee}
                UNION ALL
                SELECT
                    'general'::text AS table_source, id, source, event_id, event_name, event_domain, route_pattern,
                    NULL::text AS method, NULL::int AS status_code, NULL::int AS duration_ms, NULL::text AS error_category,
                    operation_name, table_or_rpc, actor_role, session_id, request_id, trace_id, environment, priority,
                    sample_rate, metadata, created_at
                FROM {teg}
            ) AS u
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, limit, offset)
        return [self._serialize_row(r) for r in rows]


storage = Storage()
