from __future__ import annotations

import argparse
import os
import random
import string
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import asyncpg
from dotenv import load_dotenv


SERVER_DIR = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    env_path = SERVER_DIR / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()


def _env(key: str, default: str | None = None) -> str:
    value = os.getenv(key)
    if value is None:
        return default or ""
    return str(value)


def _build_dsn() -> str:
    database_url = _env("DATABASE_URL").strip()
    if database_url:
        return database_url

    user = _env("POSTGRES_USER").strip()
    password = _env("POSTGRES_PASSWORD")
    host = _env("POSTGRES_HOST", "localhost").strip()
    port = _env("POSTGRES_PORT", "5432").strip()
    db = _env("POSTGRES_DB").strip()
    if not (user and password and host and port and db):
        missing = [k for k in ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT"] if not _env(k).strip()]
        raise SystemExit(f"Missing Postgres env vars: {', '.join(missing)}")

    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _random_serial(prefix: str, length: int) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return prefix + "-" + "".join(random.choice(alphabet) for _ in range(length))


def _asset_tag(n: int) -> str:
    return f"AST-{n:05d}"


@dataclass(frozen=True)
class DummyEmployee:
    employee_id: str
    name: str
    email: str
    role: str
    department: str
    auth_user_id: str
    is_active: bool = True
    erp_active: bool = True


DEPARTMENT_SEED: list[str] = [
    "IT",
    "HR",
    "Finance",
    "Engineering",
    "Operations",
    "Sales",
    "Marketing",
]

CATEGORY_SEED: list[tuple[str, str]] = [
    ("laptop", "Laptop"),
    ("desktop", "Desktop"),
    ("monitor", "Monitor"),
    ("printer", "Printer"),
    ("pen-drive", "Pen Drive"),
    ("other", "Other"),
]

ASSET_STATUSES: list[str] = [
    "in_stock",
    "assigned",
    "in_repair",
    "retired",
    "lost",
    "disposed",
]

DUMMY_EMPLOYEES: list[DummyEmployee] = [
    DummyEmployee(
        employee_id="EMP-0001",
        name="Demo Employee",
        email="demo.employee@example.com",
        role="employee",
        department="Engineering",
        auth_user_id="dummy-sub-emp-0001",
    ),
    DummyEmployee(
        employee_id="ADM-0001",
        name="Demo Admin",
        email="demo.admin@example.com",
        role="admin",
        department="IT",
        auth_user_id="dummy-sub-adm-0001",
    ),
    DummyEmployee(
        employee_id="OPS-0001",
        name="Demo IT Ops",
        email="demo.itops@example.com",
        role="it_ops",
        department="IT",
        auth_user_id="dummy-sub-ops-0001",
    ),
]


async def _ensure_department(conn: asyncpg.Connection, *, name: str) -> str:
    row = await conn.fetchrow("select id from departments where name=$1 limit 1", name)
    if row:
        return str(row["id"])
    inserted = await conn.fetchrow(
        "insert into departments(name) values($1) returning id",
        name,
    )
    return str(inserted["id"])


async def _ensure_category(conn: asyncpg.Connection, *, slug: str, name: str) -> str:
    row = await conn.fetchrow("select id from asset_categories where slug=$1 limit 1", slug)
    if row:
        return str(row["id"])
    inserted = await conn.fetchrow(
        "insert into asset_categories(slug,name) values($1,$2) returning id",
        slug,
        name,
    )
    return str(inserted["id"])


async def _ensure_employee(
    conn: asyncpg.Connection,
    *,
    employee: DummyEmployee,
    department_id: str,
) -> str:
    row = await conn.fetchrow(
        "select id from employees where employee_id=$1 limit 1",
        employee.employee_id,
    )
    if row:
        await conn.execute(
            """
            update employees
               set name=$2,
                   email=$3,
                   department_id=$4,
                   auth_user_id=$5,
                   role=$6,
                   is_active=$7,
                   erp_active=$8,
                   updated_at=now()
             where employee_id=$1
            """,
            employee.employee_id,
            employee.name,
            employee.email,
            department_id,
            employee.auth_user_id,
            employee.role,
            employee.is_active,
            employee.erp_active,
        )
        return str(row["id"])

    inserted = await conn.fetchrow(
        """
        insert into employees(employee_id,name,email,department_id,auth_user_id,role,is_active,erp_active,metadata)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        returning id
        """,
        employee.employee_id,
        employee.name,
        employee.email,
        department_id,
        employee.auth_user_id,
        employee.role,
        employee.is_active,
        employee.erp_active,
        {"seed": "dummy"},
    )
    return str(inserted["id"])


async def _ensure_asset(
    conn: asyncpg.Connection,
    *,
    asset_tag: str,
    serial_number: str,
    category_id: str,
    status: str,
    model: str,
) -> str:
    row = await conn.fetchrow("select id from assets where asset_tag=$1 limit 1", asset_tag)
    if row:
        await conn.execute(
            """
            update assets
               set serial_number=$2,
                   category_id=$3,
                   status=$4,
                   model=$5,
                   is_deleted=false,
                   deleted_at=null,
                   updated_at=now()
             where asset_tag=$1
            """,
            asset_tag,
            serial_number,
            category_id,
            status,
            model,
        )
        return str(row["id"])

    inserted = await conn.fetchrow(
        """
        insert into assets(asset_tag,serial_number,category_id,status,model,custom_fields,metadata,is_deleted)
        values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,false)
        returning id
        """,
        asset_tag,
        serial_number,
        category_id,
        status,
        model,
        {},
        {"seed": "dummy"},
    )
    return str(inserted["id"])


async def _has_open_assignment(conn: asyncpg.Connection, *, asset_id: str) -> bool:
    row = await conn.fetchrow(
        "select 1 from asset_assignments where asset_id=$1 and returned_at is null limit 1",
        asset_id,
    )
    return row is not None


async def _ensure_open_assignment(
    conn: asyncpg.Connection,
    *,
    asset_id: str,
    employee_id: str,
    assigned_at: datetime,
    actor_employee_id: Optional[str],
) -> None:
    if await _has_open_assignment(conn, asset_id=asset_id):
        return

    await conn.execute(
        """
        insert into asset_assignments(asset_id,employee_id,assigned_at,source,notes,metadata)
        values($1,$2,$3,$4,$5,$6::jsonb)
        """,
        asset_id,
        employee_id,
        assigned_at,
        "seed",
        "Dummy assignment",
        {"seed": "dummy"},
    )
    await conn.execute("update assets set status='assigned', updated_at=now() where id=$1", asset_id)
    if actor_employee_id:
        await conn.execute(
            """
            insert into asset_logs(asset_id,actor_employee_id,note,metadata)
            values($1,$2,$3,$4::jsonb)
            """,
            asset_id,
            actor_employee_id,
            "Asset assigned (dummy seed).",
            {"seed": "dummy"},
        )


async def _seed_reference_data(conn: asyncpg.Connection) -> tuple[dict[str, str], dict[str, str]]:
    department_ids: dict[str, str] = {}
    for name in DEPARTMENT_SEED:
        department_ids[name] = await _ensure_department(conn, name=name)

    category_ids: dict[str, str] = {}
    for slug, name in CATEGORY_SEED:
        category_ids[slug] = await _ensure_category(conn, slug=slug, name=name)

    return department_ids, category_ids


async def seed_dummy_data(*, assets_count: int) -> None:
    dsn = _build_dsn()
    pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            department_ids, category_ids = await _seed_reference_data(conn)

            employee_ids: dict[str, str] = {}
            for emp in DUMMY_EMPLOYEES:
                dept_id = department_ids.get(emp.department) or await _ensure_department(conn, name=emp.department)
                employee_ids[emp.employee_id] = await _ensure_employee(
                    conn,
                    employee=emp,
                    department_id=dept_id,
                )

            tags: list[str] = []
            for i in range(1, assets_count + 1):
                tags.append(_asset_tag(i))

            for idx, tag in enumerate(tags, start=1):
                category_slug, _ = CATEGORY_SEED[(idx - 1) % len(CATEGORY_SEED)]
                category_id = category_ids[category_slug]
                serial = _random_serial("SN", 10)
                status = ASSET_STATUSES[(idx - 1) % len(ASSET_STATUSES)]
                model = f"Model-{(idx - 1) % 7 + 1}"
                asset_id = await _ensure_asset(
                    conn,
                    asset_tag=tag,
                    serial_number=serial,
                    category_id=category_id,
                    status=status,
                    model=model,
                )

                # Create some open assignments (about 30% of assets).
                if idx % 3 == 0:
                    holder_code = "EMP-0001" if idx % 2 == 0 else "ADM-0001"
                    assigned_at = _now() - timedelta(days=min(30, idx))
                    await _ensure_open_assignment(
                        conn,
                        asset_id=asset_id,
                        employee_id=employee_ids[holder_code],
                        assigned_at=assigned_at,
                        actor_employee_id=employee_ids.get("OPS-0001"),
                    )
    finally:
        await pool.close()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed dummy data into AMS Postgres schema.")
    parser.add_argument("--assets", type=int, default=30, help="Number of assets to seed (default: 30)")
    return parser.parse_args()


if __name__ == "__main__":
    _load_env()
    args = _parse_args()
    if args.assets < 1:
        raise SystemExit("--assets must be >= 1")

    random.seed(2026)
    import asyncio

    asyncio.run(seed_dummy_data(assets_count=args.assets))
    print(f"Seeded dummy data: employees={len(DUMMY_EMPLOYEES)}, assets={args.assets}")

