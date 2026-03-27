from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.auth import require_backend_api_key
from core.settings import settings
from core.errors import custom_http_exception_handler, generic_exception_handler
from core.deps import get_db
from routers import assets, logs, health, assignments, employees

def create_app() -> FastAPI:
    app = FastAPI(
        title="Asset Manager API",
        description="Modular FastAPI backend for AMS following SOLID, DRY, and KISS principles.",
        version="2.0.0"
    )

    # CORS Setup
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
    app.include_router(assignments.router, dependencies=protected_dependencies)
    app.include_router(employees.router, dependencies=protected_dependencies)
    
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

    return app

app = create_app()
