import base64
import hashlib
import hmac
import json
import time

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from core.auth import require_backend_api_key, _resolve_request_role
from core.middleware import EnvelopeMiddleware, RequestIdMiddleware
from core.settings import settings
from core.errors import custom_http_exception_handler, generic_exception_handler
from core.deps import get_db
from routers import assets, logs, health, assignments, employees, analysis

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
    )

    # Exception Handlers
    app.add_exception_handler(HTTPException, custom_http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)

    # Register Routers
    app.include_router(health.router)
    protected_dependencies = [Depends(require_backend_api_key)]
    app.include_router(assets.router, dependencies=protected_dependencies)
    app.include_router(logs.router, dependencies=protected_dependencies)
    # Assignments / employees: authenticated via Supabase JWT (require_manage_platform_access
    # on routes). Requiring BACKEND_API_KEY here breaks browser flows — the client sends
    # Bearer <session JWT>, not the backend API key.
    app.include_router(assignments.router)
    app.include_router(employees.router)
    # Role-based auth inside the router; do not require BACKEND_API_KEY for browser usage.
    app.include_router(analysis.router)
    
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

    @app.post("/telemetry/ingest-token", tags=["Telemetry"])
    def issue_telemetry_ingest_token(
        role: str = Depends(_resolve_request_role),
        authorization: str | None = Header(default=None),
        db=Depends(get_db),
    ):
        if not settings.TELEMETRY_INGEST_TOKEN_SECRET.strip():
            raise HTTPException(status_code=503, detail="Telemetry ingest token secret is not configured.")
        if not authorization or not authorization.strip().lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token.")

        jwt_token = authorization.strip()[7:].strip()
        if not jwt_token:
            raise HTTPException(status_code=401, detail="Missing bearer token.")

        try:
            user_response = db.auth.get_user(jwt_token)
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid bearer token.") from exc

        auth_user = getattr(user_response, "user", None)
        auth_user_id = getattr(auth_user, "id", None)
        if not auth_user_id:
            raise HTTPException(status_code=401, detail="Unable to resolve authenticated user.")

        allowed_sources = ["client_engagement", "client_data"]
        if role == "it_ops":
            allowed_sources.append("telemetry_internal")

        now = int(time.time())
        payload = {
            "aud": "telemetry_ingest",
            "sub": str(auth_user_id),
            "environment": settings.TELEMETRY_ENV,
            "allowed_sources": allowed_sources,
            "iat": now,
            "exp": now + max(settings.TELEMETRY_TOKEN_TTL_SECONDS, 60),
        }
        payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
        payload_b64 = base64.urlsafe_b64encode(payload_json).decode("utf-8").rstrip("=")
        signature = hmac.new(
            settings.TELEMETRY_INGEST_TOKEN_SECRET.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        token = f"{payload_b64}.{signature}"
        return {"token": token, "expires_in": max(settings.TELEMETRY_TOKEN_TTL_SECONDS, 60)}

    return app

app = create_app()
