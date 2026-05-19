from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg
from asyncpg.exceptions import UniqueViolationError

from repositories.db import Page, fetch_dicts, fetchrow_dict, normalize_page_params, pool
from repositories.errors import ConflictError, NotFoundError, ValidationError
from core.roles import VALID_ROLES

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class EmployeeRow:
    id: str
    employee_id: str
    name: str
    email: Optional[str]
    auth_user_id: Optional[str]
    department: Optional[str]
    role: str
    assigned_asset_count: int = 0


def _to_employee_row(row: dict[str, Any]) -> EmployeeRow:
    return EmployeeRow(
        id=str(row["id"]),
        employee_id=str(row["employee_id"]),
        name=str(row.get("name") or ""),
        email=str(row["email"]) if row.get("email") is not None else None,
        auth_user_id=str(row["auth_user_id"]) if row.get("auth_user_id") is not None else None,
        department=str(row["department"]) if row.get("department") is not None else None,
        role=str(row.get("role") or "employee"),
        assigned_asset_count=int(row.get("assigned_asset_count") or 0),
    )


class EmployeeRepository:
    @staticmethod
    async def get_by_id(employee_id: str) -> Optional[EmployeeRow]:
        """Load employee by primary key UUID (`employees.id`) as string."""
        normalized = (employee_id or "").strip()
        if not normalized:
            raise ValidationError("employee_id is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select e.id::text as id,
                       e.employee_id,
                       e.name,
                       e.email::text as email,
                       e.auth_user_id,
                       d.name as department,
                       coalesce(e.role, 'employee') as role
                  from employees e
                  left join departments d on d.id = e.department_id
                 where e.id::text = $1
                 limit 1
                """,
                normalized,
            )
            return _to_employee_row(row) if row else None

    @staticmethod
    async def get_by_auth_user_id(sub: str) -> Optional[EmployeeRow]:
        normalized = (sub or "").strip()
        if not normalized:
            raise ValidationError("sub is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select e.id::text as id,
                       e.employee_id,
                       e.name,
                       e.email::text as email,
                       e.auth_user_id,
                       d.name as department,
                       coalesce(e.role, 'employee') as role
                  from employees e
                  left join departments d on d.id = e.department_id
                 where e.auth_user_id = $1
                 limit 1
                """,
                normalized,
            )
            return _to_employee_row(row) if row else None

    @staticmethod
    async def get_by_business_employee_id(lookup: str) -> Optional[EmployeeRow]:
        """Resolve by business identifier (`employees.employee_id` text), case-insensitive."""
        code = (lookup or "").strip().upper()
        if not code:
            return None

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select e.id::text as id,
                       e.employee_id,
                       e.name,
                       e.email::text as email,
                       e.auth_user_id,
                       d.name as department,
                       coalesce(e.role, 'employee') as role
                  from employees e
                  left join departments d on d.id = e.department_id
                 where upper(trim(e.employee_id)) = $1
                 limit 1
                """,
                code,
            )
            return _to_employee_row(row) if row else None

    @staticmethod
    async def get_by_email(email: str) -> Optional[EmployeeRow]:
        normalized = (email or "").strip().lower()
        if not normalized:
            raise ValidationError("email is required")

        async with pool().acquire() as conn:
            row = await fetchrow_dict(
                conn,
                """
                select e.id::text as id,
                       e.employee_id,
                       e.name,
                       e.email::text as email,
                       e.auth_user_id,
                       d.name as department,
                       coalesce(e.role, 'employee') as role
                  from employees e
                  left join departments d on d.id = e.department_id
                 where lower(e.email::text) = $1
                 limit 1
                """,
                normalized,
            )
            return _to_employee_row(row) if row else None

    @staticmethod
    async def list_employees(
        *,
        page: int | None = None,
        limit: int | None = None,
        search: str | None = None,
        status: str | None = None,  # true | false | all (or empty)
        department: str | None = None,
        role: str | None = None,  # employee | admin | it_ops
    ) -> tuple[list[EmployeeRow], Page, int]:
        p = normalize_page_params(page, limit)

        where: list[str] = []
        args: list[Any] = []

        def add_raw(condition_sql: str, *values: Any) -> None:
            if not values:
                where.append(condition_sql)
                return

            idx_start = len(args) + 1
            args.extend(values)
            rendered = condition_sql
            for i in range(len(values)):
                rendered = rendered.replace("?", f"${idx_start + i}", 1)
            where.append(rendered)

        if search and search.strip():
            s = f"%{search.strip()}%"
            add_raw(
                "("
                "e.employee_id ilike ? or e.name ilike ? or e.email::text ilike ?"
                ")",
                s,
                s,
                s,
            )

        if department and department.strip():
            add_raw("d.name = ?", department.strip())

        role_normalized = (role or "").strip().lower()
        if role_normalized:
            if role_normalized not in VALID_ROLES:
                raise ValidationError("role must be employee, admin, or it_ops")
            add_raw("coalesce(e.role,'employee') = ?", role_normalized)

        where_sql = " and ".join(where) if where else "1=1"
        sql = (
            "select e.id::text as id, e.employee_id, e.name, e.email::text as email, e.auth_user_id,"
            " d.name as department, coalesce(e.role,'employee') as role,"
            " (select count(*)::int from asset_assignments aa where aa.employee_id = e.id and aa.returned_at is null) as assigned_asset_count"
            " from employees e left join departments d on d.id = e.department_id"
            f" where {where_sql}"
            " order by e.name asc"
            f" offset {p.offset} limit {p.limit}"
        )
        count_sql = (
            "select count(*)::bigint"
            " from employees e left join departments d on d.id = e.department_id"
            f" where {where_sql}"
        )

        async with pool().acquire() as conn:
            total = int(await conn.fetchval(count_sql, *args))
            rows = await fetch_dicts(conn, sql, *args)

        return ([_to_employee_row(r) for r in rows], p, total)

    @staticmethod
    async def link_auth_user_id(*, employee_id: str, sub: str) -> None:
        emp_id = (employee_id or "").strip()
        normalized = (sub or "").strip()
        if not emp_id or not normalized:
            raise ValidationError("employee_id and sub are required")

        async with pool().acquire() as conn:
            try:
                res = await conn.execute(
                    """
                    update employees
                       set auth_user_id=$2,
                           updated_at=now()
                     where id=$1::uuid
                    """,
                    emp_id,
                    normalized,
                )
            except UniqueViolationError as exc:
                raise ConflictError("auth_user_id already linked") from exc

            if not str(res).startswith("UPDATE "):
                raise NotFoundError("employee not found")

    @staticmethod
    async def create(
        *,
        auth_user_id: str,
        employee_id: str,
        name: str,
        email: Optional[str],
        department_name: Optional[str],
        role: str,
        conn: Optional[asyncpg.Connection] = None,
    ) -> EmployeeRow:
        """Insert a new employee record. auth_user_id is required — AN create must precede this."""
        emp_business = (employee_id or "").strip()
        emp_name = (name or "").strip()
        if not auth_user_id:
            raise ValidationError("auth_user_id is required")
        if not emp_business:
            raise ValidationError("employee_id is required")
        if not emp_name:
            raise ValidationError("name is required")

        role_norm = (role or "employee").strip().lower()
        if role_norm not in VALID_ROLES:
            raise ValidationError("role must be employee, admin, or it_ops")

        email_norm = (email or "").strip().lower() or None

        if conn:
            return await EmployeeRepository._create_with_conn(
                conn, auth_user_id, emp_business, emp_name, email_norm, department_name, role_norm
            )

        async with pool().acquire() as conn:
            return await EmployeeRepository._create_with_conn(
                conn, auth_user_id, emp_business, emp_name, email_norm, department_name, role_norm
            )

    @staticmethod
    async def _create_with_conn(
        conn: asyncpg.Connection,
        auth_user_id: str,
        emp_business: str,
        emp_name: str,
        email_norm: Optional[str],
        department_name: Optional[str],
        role_norm: str,
    ) -> EmployeeRow:
        # Resolve department_id if provided
        dept_id: Optional[str] = None
        if department_name and department_name.strip():
            dept_row = await fetchrow_dict(
                conn,
                "select id::text from departments where name=$1 limit 1",
                department_name.strip(),
            )
            if dept_row:
                dept_id = dept_row["id"]
            else:
                # Auto-create department
                new_dept = await fetchrow_dict(
                    conn,
                    "insert into departments(name) values($1) returning id::text as id",
                    department_name.strip(),
                )
                dept_id = new_dept["id"] if new_dept else None

        try:
            # Create new
            row = await fetchrow_dict(
                conn,
                """
                insert into employees(auth_user_id, employee_id, name, email, department_id, role)
                values($1, $2, $3, $4, $5::uuid, $6)
                returning id::text as id, employee_id, name,
                          email::text as email, auth_user_id,
                          department_id::text as department_id,
                          coalesce(role,'employee') as role
                """,
                auth_user_id,
                emp_business,
                emp_name,
                email_norm,
                dept_id,
                role_norm,
            )
            if not row:
                raise RuntimeError("Failed to create employee")
        except UniqueViolationError as exc:
            raise ConflictError("employee_id or email already exists") from exc

        row_id = str(row["id"])
        saved_dict = await fetchrow_dict(
            conn,
            """
            select e.id::text as id,
                   e.employee_id,
                   e.name,
                   e.email::text as email,
                   e.auth_user_id,
                   d.name as department,
                   coalesce(e.role, 'employee') as role
              from employees e
              left join departments d on d.id = e.department_id
             where e.id::text = $1
             limit 1
            """,
            row_id,
        )
        if not saved_dict:
            raise RuntimeError("Failed to retrieve saved employee")
        return _to_employee_row(saved_dict)

    @staticmethod
    async def update_role(*, employee_id: str, role: str) -> EmployeeRow:
        """Change the role of an employee. Returns the updated row."""
        emp_id = (employee_id or "").strip()
        role_norm = (role or "").strip().lower()
        if not emp_id:
            raise ValidationError("employee_id is required")
        if role_norm not in VALID_ROLES:
            raise ValidationError("role must be employee, admin, or it_ops")

        async with pool().acquire() as conn:
            res = await conn.execute(
                "update employees set role=$2, updated_at=now() where id=$1::uuid",
                emp_id,
                role_norm,
            )
            if res.endswith("0"):
                raise NotFoundError("Employee not found")

        saved = await EmployeeRepository.get_by_id(emp_id)
        if not saved:
            raise NotFoundError("Employee not found after update")
        return saved

    @staticmethod
    async def update_department(*, employee_id: str, department_name: Optional[str]) -> EmployeeRow:
        """Update an employee's department by name (resolves and auto-creates if needed)."""
        emp_id = (employee_id or "").strip()
        if not emp_id:
            raise ValidationError("employee_id is required")

        async with pool().acquire() as conn:
            dept_id: Optional[str] = None
            if department_name and department_name.strip():
                dept_row = await fetchrow_dict(
                    conn,
                    "select id::text from departments where name=$1 limit 1",
                    department_name.strip(),
                )
                if dept_row:
                    dept_id = dept_row["id"]
                else:
                    new_dept = await fetchrow_dict(
                        conn,
                        "insert into departments(name) values($1) returning id::text as id",
                        department_name.strip(),
                    )
                    dept_id = new_dept["id"] if new_dept else None

            res = await conn.execute(
                "update employees set department_id=$2::uuid, updated_at=now() where id=$1::uuid",
                emp_id,
                dept_id,
            )
            if res.endswith("0"):
                raise NotFoundError("Employee not found")

        saved = await EmployeeRepository.get_by_id(emp_id)
        if not saved:
            raise NotFoundError("Employee not found after update")
        return saved

    @staticmethod
    async def get_portfolio(*, employee_id: str) -> dict[str, Any]:
        """
        Returns employee profile + currently assigned assets bundle.
        Used by EmployeeDetail page.
        """
        emp_id = (employee_id or "").strip()
        if not emp_id:
            raise ValidationError("employee_id is required")

        async with pool().acquire() as conn:
            emp_row = await fetchrow_dict(
                conn,
                """
                select e.id::text as id, e.employee_id, e.name,
                       e.email::text as email, e.auth_user_id,
                       d.name as department,
                       coalesce(e.role,'employee') as role
                  from employees e
                  left join departments d on d.id = e.department_id
                 where e.id=$1::uuid
                """,
                emp_id,
            )
            if not emp_row:
                raise NotFoundError("Employee not found")

            asset_rows = await fetch_dicts(
                conn,
                """
                select v.id::text as id,
                       v.asset_tag,
                       v.serial_number,
                       v.model,
                       v.status,
                       v.category_name,
                       v.manufacturer_name,
                       v.assigned_at,
                       v.assignment_id::text as assignment_id,
                       (
                         select coalesce(
                           e2.name,
                           ae.payload -> 'actor_snapshot' ->> 'actor_name'
                         )
                           from asset_events ae
                           left join employees e2 on e2.auth_user_id = ae.actor_id
                          where ae.asset_id = v.id::uuid
                            and ae.event_type = 'asset_assigned'
                          order by ae.created_at desc
                          limit 1
                       ) as assigned_by_name
                  from v_asset_inventory v
                 where v.current_employee_id::text = $1
                 order by v.assigned_at desc nulls last
                """,
                emp_id,
            )

        employee_payload = {
            "id": str(emp_row["id"]),
            "employee_id": str(emp_row["employee_id"]),
            "name": str(emp_row["name"]),
            "email": emp_row.get("email"),
            "department": emp_row.get("department"),
            "role": str(emp_row.get("role") or "employee")
        }

        assets_payload = []
        for r in asset_rows:
            assets_payload.append({
                "id": str(r["id"]),
                "asset_tag": r.get("asset_tag"),
                "serial_number": r.get("serial_number"),
                "model": r.get("model"),
                "status": str(r.get("status") or ""),
                "category_name": r.get("category_name"),
                "manufacturer_name": r.get("manufacturer_name"),
                "assigned_at": r["assigned_at"].isoformat() if isinstance(r.get("assigned_at"), datetime) else r.get("assigned_at"),
                "assigned_by_name": r.get("assigned_by_name"),
            })

        return {
            "employee": employee_payload,
            "assets": assets_payload,
            "total_assigned_assets": len(assets_payload),
        }

    @staticmethod
    async def get_local_data_by_auth_ids(auth_ids: list[str]) -> dict[str, dict]:
        """Batch fetch local data for AN-provided user list. Returns dict keyed by auth_user_id."""
        if not auth_ids:
            return {}
        async with pool().acquire() as conn:
            rows = await conn.fetch(
                """
                select e.id::text as id,
                       e.auth_user_id,
                       d.name as department,
                       (select count(*)::int from asset_assignments aa where aa.employee_id = e.id and aa.returned_at is null) as assigned_asset_count
                  from employees e
                  left join departments d on d.id = e.department_id
                 where e.auth_user_id = any($1::text[])
                """,
                auth_ids,
            )
        return {r["auth_user_id"]: dict(r) for r in rows if r.get("auth_user_id")}

    @staticmethod
    async def get_admin_emails() -> list[str]:
        """
        Return emails for all active admins and IT Ops employees.
        Used to populate the CC list in assignment email notifications.
        """
        async with pool().acquire() as conn:
            records = await conn.fetch(
                """
                select email::text as email
                  from employees
                 where role in ('admin', 'it_ops')
                   and email is not null
                """
            )
        return [str(r["email"]).strip() for r in records if r.get("email")]

    @staticmethod
    async def get_email_by_id(employee_uuid: str) -> Optional[str]:
        """
        Fetch just the email address for a given employee UUID.
        Used to resolve the performing admin's email for notifications
        (EmployeeContext does not carry email).
        """
        normalized = (employee_uuid or "").strip()
        if not normalized:
            return None
        async with pool().acquire() as conn:
            val = await conn.fetchval(
                "select email::text from employees where id=$1::uuid",
                normalized,
            )
        return str(val).strip() if val else None


