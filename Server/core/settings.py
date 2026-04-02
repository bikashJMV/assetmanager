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

    # ENVIRONMENT: local | production
    ENV: str = field(default_factory=lambda: os.getenv("ENV", os.getenv("VITE_ENV", "local")))

    # TelemetryServer (telemetry ingestion/query backend) integration
    # - Keep TELEMETRY_ITOPS_QUERY_KEY on the server only (never expose to browser).
    TELEMETRY_SERVER_BASE_URL: str = field(
        default_factory=lambda: os.getenv(
            "TELEMETRY_SERVER_BASE_URL",
            os.getenv("VITE_TELEMETRY_SERVER_BASE_URL", "http://localhost:8010"),
        ).rstrip("/"),
    )
    TELEMETRY_ITOPS_QUERY_KEY: str = field(
        default_factory=lambda: os.getenv(
            "TELEMETRY_ITOPS_QUERY_KEY",
            os.getenv("VITE_TELEMETRY_ITOPS_QUERY_KEY", ""),
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

# Global settings instance
settings = Settings()
