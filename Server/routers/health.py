from fastapi import APIRouter, status

from core.api_response import success_response, error_response
from core.postgres import get_pg_pool

api_router = APIRouter(tags=["System"])

@api_router.get("/api/health", status_code=status.HTTP_200_OK)
async def api_health_check():
    """
    Purpose: Canonical server health endpoint (Guideline response envelope).
    Method/Route: GET /api/health
    Request: None
    Response: 200 envelope via `success_response`; Errors: 503 envelope via `error_response` when Postgres is down.
    """
    try:
        pool = get_pg_pool()
        async with pool.acquire() as conn:
            await conn.execute("select 1;")
        return success_response(
            message="AMS server is running",
            data={"service": "ams-server", "db_provider": "postgres"},
            status_code=200,
        )
    except Exception as exc:
        return error_response(
            status_code=503,
            message="Database connection failed",
            error_code="DB_CONNECTION_FAILED",
            details=str(exc),
            data=None,
        )
