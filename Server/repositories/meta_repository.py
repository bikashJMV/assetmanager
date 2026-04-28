from __future__ import annotations

from typing import Any, Optional

from repositories.db import fetch_dicts, fetchrow_dict, pool

_MANUFACTURERS_TABLE = "manufacturers"


class MetaRepository:
    """
    Read-only "meta" lookups (Postgres-first).
    Keeps routers thin and avoids duplicating SQL across endpoints.
    """

    @staticmethod
    async def list_categories() -> list[dict[str, Any]]:
        sql = "select id::text as id, slug, name from asset_categories order by name asc"
        async with pool().acquire() as conn:
            return await fetch_dicts(conn, sql)

    @staticmethod
    async def list_departments() -> list[str]:
        """Return distinct department names ordered alphabetically."""
        sql = "select name from departments where name is not null order by name asc"
        async with pool().acquire() as conn:
            rows = await fetch_dicts(conn, sql)
        return [str(r["name"]) for r in rows if r.get("name")]

    @staticmethod
    async def resolve_category(slug: str, name: Optional[str] = None) -> str:
        """Resolve category ID by slug, creating it if it doesn't exist."""
        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                "select id from asset_categories where slug = $1",
                slug
            )
            if row:
                return str(row["id"])
            
            # Create it
            row = await fetchrow_dict(
                conn,
                "insert into asset_categories (slug, name) values ($1, $2) returning id",
                slug, name or slug.replace("-", " ").title()
            )
            return str(row["id"])

    @staticmethod
    async def resolve_manufacturer(name: str) -> str:
        """Resolve manufacturer ID by name, creating it if it doesn't exist."""
        if not name or not str(name).strip():
            raise ValueError("Manufacturer name is required")
        name = str(name).strip()
        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                f"select id from {_MANUFACTURERS_TABLE} where lower(name) = lower($1)",
                name
            )
            if row:
                return str(row["id"])

            row = await fetchrow_dict(
                conn,
                f"insert into {_MANUFACTURERS_TABLE} (name) values ($1) returning id",
                name
            )
            return str(row["id"])

    @staticmethod
    async def resolve_location(code: Optional[str] = None, name: Optional[str] = None) -> Optional[str]:
        """Resolve location ID by code or name, creating it if it doesn't exist. Returns None if nothing provided."""
        code_clean = str(code).strip().upper() if code else None
        name_clean = str(name).strip() if name else None

        # Nothing provided — no-op
        if not code_clean and not name_clean:
            return None

        async with pool().acquire() as conn:
            # Try by code first (exact), then by name
            if code_clean:
                row = await fetchrow_dict(
                    conn,
                    "select id from locations where upper(code) = $1",
                    code_clean
                )
                if row:
                    return str(row["id"])
            elif name_clean:
                row = await fetchrow_dict(
                    conn,
                    "select id from locations where lower(name) = lower($1)",
                    name_clean
                )
                if row:
                    return str(row["id"])

            # Create — use code if available, else derive from name
            insert_code = code_clean or name_clean[:20].upper().replace(" ", "_")
            insert_name = name_clean or code_clean
            row = await fetchrow_dict(
                conn,
                "insert into locations (code, name) values ($1, $2) on conflict (code) do update set name=excluded.name returning id",
                insert_code, insert_name
            )
            return str(row["id"])
