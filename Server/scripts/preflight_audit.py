import asyncio
import sys
import os

# Add parent directory to path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.settings import settings
import asyncpg

async def run_audit():
    print("--- Phase 0: Pre-flight Audit Queries ---")
    print(f"Connecting to database: {settings.POSTGRES_DB} on {settings.POSTGRES_HOST}...")
    
    # Establish connection
    try:
        user = settings.POSTGRES_USER.strip()
        password = settings.POSTGRES_PASSWORD
        host = settings.POSTGRES_HOST.strip()
        port = settings.POSTGRES_PORT
        db = settings.POSTGRES_DB.strip()
        dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}"
        
        conn = await asyncpg.connect(dsn=dsn)
        print("Database connection successful!\n")
    except Exception as e:
        print(f"FAILED to connect to database: {e}")
        return

    # 1. Count employees with no auth_user_id
    try:
        unlinked_count = await conn.fetchval(
            "SELECT count(*) FROM employees WHERE auth_user_id IS NULL;"
        )
        print(f"1. Count of employees with no auth_user_id: {unlinked_count}")
    except Exception as e:
        print(f"Query 1 failed: {e}")

    # 2. Count employees where both IDs are null
    try:
        fully_orphaned = await conn.fetchval(
            "SELECT count(*) FROM employees WHERE auth_user_id IS NULL AND employee_id IS NULL;"
        )
        print(f"2. Count of fully orphaned rows (both IDs null): {fully_orphaned}")
    except Exception as e:
        print(f"Query 2 failed: {e}")

    # 3. Full list of unlinked employees
    try:
        rows = await conn.fetch(
            "SELECT id, employee_id, email, name, auth_user_id, is_active, created_at "
            "FROM employees WHERE auth_user_id IS NULL ORDER BY created_at DESC;"
        )
        print(f"\n3. List of unlinked employees ({len(rows)} found):")
        for r in rows:
            print(f" - ID: {r['id']}, EmpID: {r['employee_id']}, Email: {r['email']}, Name: {r['name']}, Active: {r['is_active']}, Created: {r['created_at']}")
    except Exception as e:
        print(f"Query 3 failed: {e}")

    # 4. Check for email uniqueness
    try:
        dups = await conn.fetch(
            "SELECT email, count(*) AS dup_count "
            "FROM employees WHERE email IS NOT NULL "
            "GROUP BY email HAVING count(*) > 1;"
        )
        print(f"\n4. Duplicate emails check ({len(dups)} duplicates found):")
        for d in dups:
            print(f" - Email: {d['email']}, Count: {d['dup_count']}")
    except Exception as e:
        print(f"Query 4 failed: {e}")

    await conn.close()
    print("\nDatabase queries finished.")

    # Try to test AuthNexus login
    print("\n--- Testing AuthNexus Integration ---")
    from services.authnexus_service import AuthNexusClient
    print(f"Authority: {settings.AUTH_AUTHORITY}")
    print(f"Admin User: {settings.AUTHNEXUS_ADMIN_USER}")
    print(f"Org ID: {settings.AUTHNEXUS_ORG_ID}")
    
    try:
        token = await AuthNexusClient._get_token()
        if token:
            print("AuthNexus Login SUCCESSFUL! Token obtained.")
        else:
            print("AuthNexus Login FAILED (returned None). Please check credentials in .env.")
    except Exception as e:
        print(f"AuthNexus Login Error: {e}")

if __name__ == "__main__":
    asyncio.run(run_audit())
