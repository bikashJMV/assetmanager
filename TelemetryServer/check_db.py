"""Quick connectivity check against TELEMETRY_DATABASE_URL (asyncpg + SSL like the app)."""

from __future__ import annotations

import asyncio
import os
import sys

import asyncpg
from dotenv import load_dotenv

load_dotenv()


async def main() -> None:
    url = os.getenv("TELEMETRY_DATABASE_URL", "").strip()
    if not url:
        print("TELEMETRY_DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)
    ssl = "require" if os.getenv("TELEMETRY_DB_SSL", "true").strip().lower() not in ("0", "false", "no") else None
    conn = await asyncpg.connect(dsn=url, ssl=ssl)
    try:
        n = await conn.fetchval("SELECT 1")
        print("ok", n)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
