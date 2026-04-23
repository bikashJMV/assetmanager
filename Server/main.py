import base64
import hashlib
import hmac
import json
import time

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.auth import require_backend_api_key, _resolve_request_role, get_auth_user_id_from_bearer
from core.middleware import EnvelopeMiddleware, RequestIdMiddleware
from core.settings import settings
from core.errors import custom_http_exception_handler, generic_exception_handler
from core.deps import get_db
from routers import assets, logs, health, assignments, employees, bootstrap
from prometheus_fastapi_instrumentator import Instrumentator

def create_app() -> FastAPI:
    app = FastAPI(
        title="Asset Manager API",
        description="Modular FastAPI backend for AMS following SOLID, DRY, and KISS principles.",
        version="2.0.0"
    )

    # Middleware stack (last added = outermost = runs first)
    # Execution order: CORS → Envelope → RequestId → route handler
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(EnvelopeMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "X-Exported-Asset-Count"],
    )

    # Exception Handlers
    app.add_exception_handler(HTTPException, custom_http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Register Routers
    app.include_router(health.router)
    protected_dependencies = [Depends(require_backend_api_key)]
    app.include_router(assets.router, dependencies=protected_dependencies)
    app.include_router(assets.browser_router)
    app.include_router(logs.router, dependencies=protected_dependencies)
    # Assignments / employees: authenticated via Supabase JWT (require_manage_platform_access
    # on routes). Requiring BACKEND_API_KEY here breaks browser flows — the client sends
    # Bearer <session JWT>, not the backend API key.
    app.include_router(assignments.router)
    app.include_router(employees.router)
    # Break-glass role promotion: X-Bootstrap-Secret + ROLE_BOOTSTRAP_SECRET only (no BACKEND_API_KEY).
    app.include_router(bootstrap.router)

    # ── Observability ──
    from routers import observability
    app.include_router(observability.router)

    # Root-level scan endpoint kept for direct QR navigation compatibility.
    @app.get("/scan/{asset_ref}", tags=["Assets"], response_model=assets.AssetOut)
    def scan_asset_root(
        asset_ref: str,
        db=Depends(get_db),
        _=Depends(require_backend_api_key),
    ):
        """Top-level scan shortcut for QR routes."""
        return assets.get_asset(asset_ref, db)

    @app.get("/", tags=["System"])
    def root():
        return {"message": "AMS API is running", "env": settings.ENV}


    # Prometheus metrics endpoint (non-invasive; does not affect existing routes)
    if settings.OTEL_GRAFANA_ENABLED:
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")

    return app

app = create_app()
