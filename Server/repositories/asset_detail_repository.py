from __future__ import annotations

from typing import Any, Optional

from repositories.db import fetch_dicts, fetchrow_dict, pool
from repositories.errors import ValidationError

_DETAIL_EVENT_LIMIT = 100


def _normalize_ref(asset_ref: str) -> str:
    ref = (asset_ref or "").strip()
    if not ref:
        raise ValidationError("asset_ref is required")
    return ref


def _snapshot_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float, bool)):
        return str(value)
    return str(value).strip() or None


def _parse_actor_snapshot(payload: Any) -> dict[str, Any] | None:
    if not payload or not isinstance(payload, dict):
        return None
    raw = payload.get("actor_snapshot")
    if not raw or not isinstance(raw, dict):
        return None

    return {
        "actor_id": _snapshot_string(raw.get("actor_id") or raw.get("actor_sub")),
        "actor_employee_id": _snapshot_string(raw.get("actor_employee_id")),
        "actor_name": _snapshot_string(raw.get("actor_name")),
        "actor_department_name": _snapshot_string(raw.get("actor_department_name") or raw.get("actor_department")),
    }


class AssetDetailRepository:
    """
    Asset detail read model for the SPA.
    Returns a bundle matching the client's `AssetDetailRecord` expectations.
    """

    @staticmethod
    async def get_asset_inventory_by_ref(asset_ref: str) -> Optional[dict[str, Any]]:
        ref = _normalize_ref(asset_ref)

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where asset_tag=$1 limit 1",
                ref,
            )
            if row:
                return row

            row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where id::text=$1 limit 1",
                ref,
            )
            return row

    @staticmethod
    async def list_components(*, asset_id: str) -> list[dict[str, Any]]:
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                """
                select ac.id::text as id,
                       ac.component_type,
                       ac.model,
                       ac.serial_number,
                       ac.metadata,
                       m.name as manufacturer_name
                  from asset_components ac
                  left join manufacturers m on m.id = ac.manufacturer_id
                 where ac.asset_id = $1::uuid
                 order by ac.created_at desc
                """,
                asset_id,
            )

    @staticmethod
    async def list_assignments(*, asset_id: str) -> list[dict[str, Any]]:
        async with pool().acquire() as conn:
            rows = await fetch_dicts(
                conn,
                """
                select aa.id::text as id,
                       aa.assigned_at,
                       aa.returned_at,
                       aa.source,
                       aa.notes,
                       e.id::text as employee_uuid,
                       e.employee_id,
                       e.name as employee_name,
                       coalesce(e.is_active, true) as employee_is_active,
                       d.name as employee_department,
                       coalesce(e.role, 'employee') as employee_role
                  from asset_assignments aa
                  join employees e on e.id = aa.employee_id
                  left join departments d on d.id = e.department_id
                 where aa.asset_id = $1::uuid
                 order by aa.assigned_at desc
                """,
                asset_id,
            )

        assignments: list[dict[str, Any]] = []
        for r in rows:
            assignments.append(
                {
                    "id": r.get("id"),
                    "assigned_at": r.get("assigned_at"),
                    "returned_at": r.get("returned_at"),
                    "source": r.get("source"),
                    "notes": r.get("notes"),
                    "employee": {
                        "id": r.get("employee_uuid"),
                        "employee_id": r.get("employee_id"),
                        "name": r.get("employee_name"),
                        "is_active": bool(r.get("employee_is_active", True)),
                        "department": r.get("employee_department"),
                        "role": r.get("employee_role"),
                    }
                    if r.get("employee_uuid")
                    else None,
                }
            )
        return assignments

    @staticmethod
    async def list_events(*, asset_id: str, limit: int = _DETAIL_EVENT_LIMIT) -> tuple[list[dict[str, Any]], bool]:
        resolved_limit = max(1, min(int(limit or _DETAIL_EVENT_LIMIT), _DETAIL_EVENT_LIMIT))
        async with pool().acquire() as conn:
            rows = await fetch_dicts(
                conn,
                """
                select id::text as id,
                       event_type::text as event_type,
                       actor_id::text as actor_id,
                       payload,
                       created_at
                  from asset_events
                 where asset_id = $1::uuid
                 order by created_at desc
                 limit $2
                """,
                asset_id,
                resolved_limit,
            )

        is_capped = len(rows) >= resolved_limit
        events: list[dict[str, Any]] = []
        for r in rows:
            payload = r.get("payload") if isinstance(r.get("payload"), dict) else {}
            snapshot = _parse_actor_snapshot(payload)
            events.append(
                {
                    "id": r.get("id"),
                    "event_type": r.get("event_type"),
                    "actor_id": (snapshot or {}).get("actor_id") or r.get("actor_id"),
                    "actor_employee_id": (snapshot or {}).get("actor_employee_id"),
                    "actor_name": (snapshot or {}).get("actor_name"),
                    "actor_department_name": (snapshot or {}).get("actor_department_name"),
                    "payload": payload,
                    "created_at": r.get("created_at"),
                }
            )

        return events, is_capped

    @staticmethod
    async def get_employee_display_by_auth_user_id(auth_user_id: str) -> Optional[dict[str, Any]]:
        normalized = (auth_user_id or "").strip()
        if not normalized:
            return None

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select e.name,
                       e.employee_id
                  from employees e
                 where e.auth_user_id::text = $1
                 limit 1
                """,
                normalized,
            )
            if not row:
                return None
            name = str(row.get("name") or "").strip() or None
            employee_id = str(row.get("employee_id") or "").strip() or None
            if not name and not employee_id:
                return None
            return {"name": name, "employee_id": employee_id}

