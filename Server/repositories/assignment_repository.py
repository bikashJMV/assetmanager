from __future__ import annotations

import datetime
from typing import Any, Optional

from repositories.db import fetchrow_dict, fetch_dicts, pool
from repositories.errors import ValidationError


class AssignmentRepository:
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

    @staticmethod
    async def count_assignments_by_month(from_date: str) -> list[dict[str, Any]]:
        """
        Assignment count per month for exactly 12 months starting from from_date (YYYY-MM).
        Always returns 12 rows — months with no assignments are filled with count=0.
        """
        year, month = from_date.split('-')
        start = datetime.date(int(year), int(month), 1)
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                """
                SELECT
                    TO_CHAR(gs.month, 'YYYY-MM') AS month,
                    COALESCE(a.count, 0)::int    AS count
                FROM GENERATE_SERIES(
                    DATE_TRUNC('month', $1::date),
                    DATE_TRUNC('month', $1::date) + INTERVAL '11 months',
                    INTERVAL '1 month'
                ) AS gs(month)
                LEFT JOIN (
                    SELECT
                        DATE_TRUNC('month', assigned_at) AS month,
                        COUNT(*)::int                    AS count
                    FROM asset_assignments
                    WHERE assigned_at >= DATE_TRUNC('month', $1::date)
                      AND assigned_at <  DATE_TRUNC('month', $1::date) + INTERVAL '12 months'
                    GROUP BY DATE_TRUNC('month', assigned_at)
                ) a ON a.month = gs.month
                ORDER BY gs.month ASC
                """,
                start,
            )

