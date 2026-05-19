from __future__ import annotations

from typing import Any, Optional

from repositories.db import Page, fetch_dicts, fetchrow_dict, normalize_page_params, pool
from repositories.errors import ValidationError


class AssetRepository:
    """
    Read-only asset access via canonical views.
    (Write operations belong in services later; keep repos dumb.)
    """

    @staticmethod
    async def list_inventory(
        *,
        page: int | None = None,
        limit: int | None = None,
        search: str | None = None,
        department: str | None = None,
        status: str | None = None,
        category_slug: str | None = None,
        exclude_category_slugs: list[str] | None = None,
        employee_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], Page, int]:
        p = normalize_page_params(page, limit)

        where: list[str] = []
        args: list[Any] = []

        def add_raw(condition_sql: str, *values: Any) -> None:
            idx_start = len(args) + 1
            args.extend(values)
            rendered = condition_sql
            for i in range(len(values)):
                rendered = rendered.replace("?", f"${idx_start + i}", 1)
            where.append(rendered)

        if search and search.strip():
            escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            s = f"%{escaped}%"
            add_raw(
                "("
                "asset_tag ilike ? escape '\\' or serial_number ilike ? escape '\\' "
                "or model ilike ? escape '\\' or manufacturer_name ilike ? escape '\\' "
                "or location_name ilike ? escape '\\' or current_employee_name ilike ? escape '\\' "
                "or current_employee_business_id ilike ? escape '\\' or category_name ilike ? escape '\\'"
                ")",
                s,
                s,
                s,
                s,
                s,
                s,
                s,
                s,
            )

        if department and department.strip():
            add_raw("current_employee_department = ?", department.strip())
        if status and status.strip():
            add_raw("status = ?", status.strip().lower())
        if category_slug and category_slug.strip():
            add_raw("category_slug = ?", category_slug.strip().lower())
        if exclude_category_slugs:
            slugs = [str(s).strip().lower() for s in exclude_category_slugs if str(s).strip()]
            if slugs:
                placeholders = ",".join(["?"] * len(slugs))
                add_raw(f"category_slug not in ({placeholders})", *slugs)
        if employee_id and employee_id.strip():
            # v_asset_inventory.current_employee_id is uuid; compare via text for simplicity.
            add_raw("current_employee_id::text = ?", employee_id.strip())

        where_sql = " and ".join(where) if where else "1=1"
        args.append(p.offset)
        args.append(p.limit)
        offset_param = f"${len(args) - 1}"
        limit_param = f"${len(args)}"
        sql = (
            "select * from v_asset_inventory "
            f"where {where_sql} "
            f"order by updated_at desc "
            f"offset {offset_param} limit {limit_param}"
        )
        count_sql = f"select count(*)::bigint from v_asset_inventory where {where_sql}"

        async with pool().acquire() as conn:
            total = int(await conn.fetchval(count_sql, *args[:-2]))
            rows = await fetch_dicts(conn, sql, *args)
        return rows, p, total

    @staticmethod
    async def get_inventory_by_ref(asset_ref: str) -> Optional[dict[str, Any]]:
        ref = (asset_ref or "").strip()
        if not ref:
            raise ValidationError("asset_ref is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where asset_tag=$1 limit 1",
                ref,
            )
            if row:
                return row

            # Fallback: treat as UUID
            row = await fetchrow_dict(
                conn,
                "select * from v_asset_inventory where id::text=$1 limit 1",
                ref,
            )
            return row

    @staticmethod
    async def list_existing_asset_tags_in_order(asset_tags: list[str]) -> list[str]:
        tags = [str(t).strip() for t in asset_tags if str(t).strip()]
        if not tags:
            return []

        async with pool().acquire() as conn:
            rows = await conn.fetch(
                "select asset_tag from assets where coalesce(is_deleted,false)=false and asset_tag = any($1::text[]) order by asset_tag asc",
                tags,
            )
        return [str(r["asset_tag"]).strip() for r in rows if r and r["asset_tag"]]
    @staticmethod
    async def list_recycle_bin_entries() -> list[dict[str, Any]]:
        async with pool().acquire() as conn:
            return await fetch_dicts(
                conn,
                "select * from recycle_bin_entries where restored_at is null order by deleted_at desc"
            )
    @staticmethod
    async def get_next_asset_tag_atomic(conn: Any | None = None) -> str:
        """
        Generate the next sequential asset tag atomically via Postgres sequence.
        
        Race-safe: handles unlimited concurrent callers without collision.
        Optionally accepts an existing connection for inclusion in a transaction
        (used by bulk QR generation to keep tag reservation in same TX).
        
        Returns: 'AST-{n:05d}' format (e.g. 'AST-00042')
        """
        query = "select 'AST-' || lpad(nextval('asset_tag_seq')::text, 5, '0') as tag"
        
        if conn is not None:
            return await conn.fetchval(query)
        
        async with pool().acquire() as c:
            return await c.fetchval(query)

    @staticmethod
    async def get_next_asset_tag() -> str:
        """
        Generate the next sequential asset tag (e.g. AST-00042).
        
        Backward-compatible wrapper around atomic sequence-based generation.
        All existing call sites (asset_service.create_asset, /next-tag endpoint)
        continue to work without modification.
        """
        return await AssetRepository.get_next_asset_tag_atomic()

    @staticmethod
    async def get_public_scan(asset_tag: str) -> Optional[dict[str, Any]]:
        """Return limited public info for scanning."""
        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select category_name,
                       asset_tag,
                       status,
                       (current_employee_id is not null) as is_assigned,
                       current_employee_name as holder_name,
                       current_employee_department as holder_department,
                       current_employee_business_id as holder_employee_business_id
                  from v_asset_inventory
                 where asset_tag = $1
                 limit 1
                """,
                asset_tag.strip()
            )
            return row
