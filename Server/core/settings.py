import os
from dataclasses import dataclass, field
from typing import List
from dotenv import load_dotenv

# Load .env file
load_dotenv()


def _parse_origins(raw: str) -> List[str]:
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin and origin.strip()]

@dataclass
class Settings:
    """
    Application settings for AMS Server.
    Loads from .env file or environment variables.
    Using dataclass + load_dotenv for maximum environment compatibility (KISS).
    """
    # Supabase service-role key is required for trusted server operations (QR generation, admin endpoints).
    SUPABASE_URL: str = field(default_factory=lambda: os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", "")))
    SUPABASE_KEY: str = field(default_factory=lambda: os.getenv("SUPABASE_KEY", os.getenv("VITE_SUPABASE_KEY", "")))
    # FRONTEND_URL: Used for QR code generation (public SPA origin). Default matches deployed client.
    FRONTEND_URL: str = field(
        default_factory=lambda: os.getenv(
            "FRONTEND_URL",
            os.getenv("VITE_FRONTEND_URL", "https://web-assetmanager.vercel.app"),
        )
    )

    # ALLOWED_ORIGINS: Comma-separated list of allowed origins for CORS.
    ALLOWED_ORIGINS: List[str] = field(
        default_factory=lambda: _parse_origins(
            os.getenv("ALLOWED_ORIGINS", os.getenv("VITE_ALLOWED_ORIGINS", ""))
        )
    )

    # Optional shared secret for backend API access when server is public.
    BACKEND_API_KEY: str = field(default_factory=lambda: os.getenv("BACKEND_API_KEY", os.getenv("VITE_BACKEND_API_KEY", "")))

    # Server-only secret for POST /internal/bootstrap-role (promote employee by email). Empty = route disabled (503).
    ROLE_BOOTSTRAP_SECRET: str = field(
        default_factory=lambda: os.getenv("ROLE_BOOTSTRAP_SECRET", "").strip(),
    )

    # ENVIRONMENT: local | production
    ENV: str = field(default_factory=lambda: os.getenv("ENV", os.getenv("VITE_ENV", "local")))

    # ── Internal telemetry toggle ─────────────────────────────────────────────
    # Set TELEMETRY_ENABLED=true to forward server API call logs to TelemetryServer.
    # When false, middleware logs locally only — no network calls to TelemetryServer.
    TELEMETRY_ENABLED: bool = field(
        default_factory=lambda: os.getenv("TELEMETRY_ENABLED", "false").strip().lower() == "true"
    )
    # Shared static secret for server-to-server ingest. Must match
    # TELEMETRY_INGEST_SERVER_TOKEN on the TelemetryServer side.
    TELEMETRY_INGEST_SERVER_TOKEN: str = field(
        default_factory=lambda: os.getenv("TELEMETRY_INGEST_SERVER_TOKEN", "").strip()
    )

    # TelemetryServer (telemetry ingestion/query backend) integration
    # - Keep TELEMETRY_ITOPS_QUERY_KEY_NEW on the server only (never expose to browser).
    TELEMETRY_SERVER_BASE_URL: str = field(
        default_factory=lambda: os.getenv(
            "TELEMETRY_SERVER_BASE_URL",
            os.getenv("VITE_TELEMETRY_SERVER_BASE_URL", "http://localhost:8010"),
        ).rstrip("/"),
    )
    TELEMETRY_ITOPS_QUERY_KEY_NEW: str = field(
        default_factory=lambda: os.getenv(
            "TELEMETRY_ITOPS_QUERY_KEY_NEW",
            os.getenv("VITE_TELEMETRY_ITOPS_QUERY_KEY_NEW", ""),
        ).strip(),
    )
    TELEMETRY_INGEST_TOKEN_SECRET: str = field(
        default_factory=lambda: os.getenv(
            "TELEMETRY_INGEST_TOKEN_SECRET",
            os.getenv("VITE_TELEMETRY_INGEST_TOKEN_SECRET", ""),
        )
    )
    TELEMETRY_TOKEN_TTL_SECONDS: int = field(
        default_factory=lambda: int(os.getenv("TELEMETRY_TOKEN_TTL_SECONDS", "600"))
    )
    TELEMETRY_ENV: str = field(
        default_factory=lambda: os.getenv("TELEMETRY_ENV", os.getenv("VITE_TELEMETRY_ENV", "local")).strip().lower()
    )

    # ── Notification / Email microservice ────────────────────────────────────
    # EMAIL_SERVICE_URL: Full base URL of the running email microservice.
    #   e.g. https://email-notification-ams.vercel.app  (or http://localhost:8000 locally)
    EMAIL_SERVICE_URL: str = field(
        default_factory=lambda: os.getenv("EMAIL_SERVICE_URL", "").rstrip("/")
    )
    # BACKEND_API_KEY_EMAIL_NOTIFICATION: X-API-Key header value accepted by the email service.
    # EMAIL_SERVICE_API_KEY remains as a temporary fallback during rollout.
    BACKEND_API_KEY_EMAIL_NOTIFICATION: str = field(
        default_factory=lambda: os.getenv(
            "BACKEND_API_KEY_EMAIL_NOTIFICATION",
            os.getenv("EMAIL_SERVICE_API_KEY", ""),
        )
    )
    # NOTIFICATIONS_ENABLED: Set to "true" to dispatch real emails. anything else → silent no-op.
    NOTIFICATIONS_ENABLED: bool = field(
        default_factory=lambda: os.getenv("NOTIFICATIONS_ENABLED", "false").strip().lower() == "true"
    )

    def __post_init__(self):
        # Basic validation
        if not self.SUPABASE_URL or not self.SUPABASE_KEY:
            print("WARNING: SUPABASE_URL or SUPABASE_KEY is missing. Database calls will fail.")
        if not self.SUPABASE_URL or not self.SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set.")


        if not self.FRONTEND_URL.startswith("http"):
            print(f"WARNING: FRONTEND_URL '{self.FRONTEND_URL}' might be invalid. It should start with http:// or https://")

        if self.ENV.strip().lower() == "production" and not self.BACKEND_API_KEY.strip():
            print("WARNING: BACKEND_API_KEY is empty in production. Public API access is not restricted.")

        legacy_email_api_key = os.getenv("EMAIL_SERVICE_API_KEY", "").strip()
        preferred_email_api_key = os.getenv("BACKEND_API_KEY_EMAIL_NOTIFICATION", "").strip()
        if legacy_email_api_key and not preferred_email_api_key:
            print(
                "WARNING: EMAIL_SERVICE_API_KEY is deprecated. "
                "Use BACKEND_API_KEY_EMAIL_NOTIFICATION instead."
            )

# Global settings instance
settings = Settings()
