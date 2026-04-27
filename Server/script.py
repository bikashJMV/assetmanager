import asyncio
from dotenv import load_dotenv
load_dotenv()
from core.settings import settings
import asyncpg

async def main():
    conn = await asyncpg.connect(settings.DATABASE_URL)
    rows = await conn.fetch("SELECT unnest(enum_range(NULL::asset_event_type))")
    print([r[0] for r in rows])
    await conn.close()

asyncio.run(main())
