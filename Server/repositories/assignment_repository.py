from __future__ import annotations

from typing import Any, Optional

from repositories.db import fetch_dicts, fetchrow_dict, pool
from repositories.errors import ValidationError


class AssignmentRepository:
    @staticmethod
    async def list_held_assets_for_employee(employee_row_id: str) -> list[dict[str, Any]]:
        """Assets currently held (open assignment) by an employee — for the department-cascade audit."""
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                """
                select a.id::text as asset_id, a.asset_tag
                  from assets a
                  join asset_assignments aa on aa.asset_id = a.id and aa.returned_at is null
                 where aa.employee_id = $1::uuid
                   and coalesce(a.is_deleted, false) = false
                 order by a.asset_tag asc
                """,
                employee_row_id,
            )

    @staticmethod
    async def get_open_assignment_holder_by_asset_tag(asset_tag: str) -> Optional[dict[str, Any]]:
        tag = (asset_tag or "").strip()
        if not tag:
            raise ValidationError("asset_tag is required")

        async with pool().acquire() as conn:
            return await fetchrow_dict(
                conn,
                """
                select e.employee_id,
                       e.name,
                       e.email::text as email,
                       coalesce(e.role, 'employee') as role,
                       a.model as asset_model,
                       a.serial_number
                  from assets a
                  join asset_assignments aa on aa.asset_id = a.id and aa.returned_at is null
                  join employees e on e.id = aa.employee_id
                 where a.asset_tag = $1
                 limit 1
                """,
                tag,
            )

