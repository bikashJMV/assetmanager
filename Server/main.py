import base64
import hashlib
import hmac
import json
import logging
import time

# Configure application-level logging before uvicorn starts.
# Without this, Python root logger defaults to WARNING and all
# logger.info / logger.warning calls in app code are silently suppressed.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.auth import require_backend_api_key, _resolve_request_role, get_auth_user_id_from_bearer
from core.auth_middleware import AuthMiddleware
from core.middleware import EnvelopeMiddleware, RequestIdMiddleware
from core.settings import settings
from core.errors import custom_http_exception_handler, generic_exception_handler
from routers.api_v1_assets import router as api_v1_assets_router
from routers.api_v1_employees import router as api_v1_employees_router
from routers.api_v1_assignments import router as api_v1_assignments_router
from routers.api_v1_meta import router as api_v1_meta_router
from routers.api_v1_authz import router as api_v1_authz_router
from routers.api_v1_recycle_bin import router as api_v1_recycle_bin_router
from routers.api_auth import router as api_auth_router
from routers.api_v1_qr import router as api_v1_qr_router
from routers import health
from prometheus_fastapi_instrumentator import Instrumentator
from core.postgres import init_pg_pool, close_pg_pool

def create_app() -> FastAPI:
    app = FastAPI(
        title="Asset Manager API",
        description="Modular FastAPI backend for AMS following SOLID, DRY, and KISS principles.",
        version="2.0.0"
    )

    # Middleware stack (last added = outermost = runs first)
    # Execution order: CORS → Envelope → Auth → RequestId → route handler
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(AuthMiddleware)
    app.add_middleware(EnvelopeMiddleware)
    _cors_origins = list(settings.ALLOWED_ORIGINS)
    if "http://localhost:11000" not in _cors_origins:
        _cors_origins.append("http://localhost:11000")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "Accept-Language",
            "X-API-Key",
            "X-Request-ID",
            "X-Request-Id",
            "X-Response-Envelope",
            "DNT",
            "If-None-Match",
            "Range",
            "If-Modified-Since",
            "Cache-Control",
            "Pragma",
        ],
        expose_headers=["Content-Disposition", "X-Export-Empty", "X-Exported-Asset-Count"],
    )

    # Exception Handlers
    app.add_exception_handler(HTTPException, custom_http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Register Routers

    app.include_router(health.api_router)
    app.include_router(api_v1_assets_router)
    app.include_router(api_v1_recycle_bin_router)
    app.include_router(api_v1_employees_router)
    app.include_router(api_v1_assignments_router)
    app.include_router(api_v1_meta_router)
    app.include_router(api_v1_authz_router)
    app.include_router(api_auth_router)
    app.include_router(api_v1_qr_router)
    protected_dependencies = [Depends(require_backend_api_key)]

    # ── Observability ──
    from routers import observability
    app.include_router(observability.router)

    @app.get("/", tags=["System"])
    def root():
        """
        Purpose: Root liveness endpoint.
        Method/Route: GET /
        Request: None
        Response: 200 JSON `{message, env}`.
        Notes: Public; does not hit the database.
        """
        return {"message": "AMS API is running", "env": settings.ENV}


    # Prometheus metrics endpoint (non-invasive; does not affect existing routes)
    if settings.OTEL_GRAFANA_ENABLED:
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    @app.on_event("startup")
    async def _startup():
        await init_pg_pool()
        from core.migrations import run_database_migrations
        await run_database_migrations()

    @app.on_event("shutdown")
    async def _shutdown():
        await close_pg_pool()

    return app

app = create_app()
