from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import asyncpg
from asyncpg.exceptions import UniqueViolationError

from repositories.db import fetchrow_dict
from repositories.errors import ConflictError, NotFoundError, ValidationError


class AssignmentWriteRepository:
    @staticmethod
    async def get_asset_inventory_row_by_tag(conn: asyncpg.Connection, asset_tag: str) -> dict[str, Any]:
        tag = (asset_tag or "").strip()
        if not tag:
            raise ValidationError("asset_tag is required")

        row = await fetchrow_dict(
            conn,
            """
            select id::text as asset_id,
                   asset_tag,
                   status::text as status,
                   assignment_id::text as assignment_id,
                   current_employee_id::text as current_employee_id,
                   current_employee_business_id,
                   current_employee_name,
                   current_employee_email::text as current_employee_email,
                   category_name,
                   model
              from v_asset_inventory
             where asset_tag = $1
             limit 1
            """,
            tag,
        )
        if not row:
            raise NotFoundError("Asset not found")
        return dict(row)

    @staticmethod
    async def get_employee_by_business_employee_id(
        conn: asyncpg.Connection, business_employee_id: str
    ) -> dict[str, Any]:
        code = (business_employee_id or "").strip().upper()
        if not code:
            raise ValidationError("employee_id is required")

        row = await fetchrow_dict(
            conn,
            """
            select e.id::text as id,
                   e.employee_id,
                   e.name,
                   e.email::text as email,
                   coalesce(e.role, 'employee') as role,
                   coalesce(e.is_active, true) as is_active
              from employees e
             where upper(trim(e.employee_id)) = $1
               and coalesce(e.is_deleted, false) = false
             limit 1
            """,
            code,
        )
        if not row:
            raise NotFoundError("Employee not found")
        resolved = dict(row)
        if not bool(resolved.get("is_active", True)):
            raise ValidationError("Employee is not active")
        return resolved

    @staticmethod
    async def lock_asset_row(conn: asyncpg.Connection, asset_id: str) -> None:
        await conn.execute("select 1 from assets where id=$1::uuid for update", asset_id)

    @staticmethod
    async def close_open_assignment(
        conn: asyncpg.Connection,
        *,
        asset_id: str,
        returned_at: datetime,
        source: Optional[str],
        note_append: str,
    ) -> None:
        await conn.execute(
            """
            update asset_assignments
               set returned_at = $2,
                   source = coalesce($3, source),
                   notes = case
                     when notes is null or btrim(notes) = '' then $4
                     else notes || E'\n' || $4
                   end,
                   updated_at = now()
             where asset_id = $1::uuid
               and returned_at is null
            """,
            asset_id,
            returned_at,
            (source or "").strip() or None,
            (note_append or "").strip(),
        )
        # Update asset status to in_stock
        await conn.execute("update assets set status='in_stock', updated_at=now() where id=$1::uuid", asset_id)

    @staticmethod
    async def return_open_assignment(
        conn: asyncpg.Connection,
        *,
        asset_id: str,
        returned_at: datetime,
        source: Optional[str],
        notes: Optional[str],
    ) -> Optional[str]:
        """
        Close the current open assignment for an asset.

        Mirrors the note merge semantics from `fn_return_asset`:
        - If `notes` is blank: keep existing notes unchanged.
        - If existing notes are blank: set to `notes`.
        - Else: append `\n` + `notes`.
        """
        resolved_notes = (notes or "").strip() or None
        assignment_id = await conn.fetchval(
            """
            update asset_assignments
               set returned_at = coalesce($2, now()),
                   source = coalesce($3, source),
                   notes = coalesce(
                     case
                       when $4::text is null or btrim($4::text) = '' then notes
                       when notes is null or btrim(notes) = '' then $4::text
                       else notes || E'\n' || $4::text
                     end,
                     notes
                   ),
                   updated_at = now()
             where asset_id = $1::uuid
               and returned_at is null
             returning id::text
            """,
            asset_id,
            returned_at,
            (source or "").strip() or None,
            resolved_notes,
        )
        if assignment_id:
            # Update asset status to in_stock
            await conn.execute("update assets set status='in_stock', updated_at=now() where id=$1::uuid", asset_id)
            return str(assignment_id)
        return None

    @staticmethod
    async def insert_assignment(
        conn: asyncpg.Connection,
        *,
        asset_id: str,
        employee_id: str,
        assigned_at: datetime,
        source: str,
        notes: Optional[str],
    ) -> str:
        try:
            assignment_id = await conn.fetchval(
                """
                insert into asset_assignments(asset_id, employee_id, assigned_at, returned_at, source, notes)
                values($1::uuid, $2::uuid, $3, null, $4, $5)
                returning id::text
                """,
                asset_id,
                employee_id,
                assigned_at,
                (source or "").strip() or "runtime",
                (notes or "").strip() or None,
            )
            if assignment_id:
                # Update asset status to assigned
                await conn.execute("update assets set status='assigned', updated_at=now() where id=$1::uuid", asset_id)
        except UniqueViolationError as exc:
            raise ConflictError("Asset is already assigned (concurrent update)") from exc

        if not assignment_id:
            raise ConflictError("Unable to create assignment")
        return str(assignment_id)
