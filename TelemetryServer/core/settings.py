import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    ENV: str = os.getenv("TELEMETRY_ENV", "local")
    # Dedicated Supabase Postgres (service role connection string, server-side only).
    DATABASE_URL: str = os.getenv("TELEMETRY_DATABASE_URL", "").strip()
    DATABASE_SCHEMA: str = os.getenv("TELEMETRY_DATABASE_SCHEMA", "telemetry").strip() or "telemetry"
    DB_POOL_MIN_SIZE: int = _int("TELEMETRY_DB_POOL_MIN_SIZE", 1)
    DB_POOL_MAX_SIZE: int = _int("TELEMETRY_DB_POOL_MAX_SIZE", 10)
    # Use TLS for Supabase; set TELEMETRY_DB_SSL=false only for local Postgres without SSL.
    DB_SSL: bool = _bool_env("TELEMETRY_DB_SSL", True)

    QUEUE_MAX_SIZE: int = _int("TELEMETRY_QUEUE_MAX_SIZE", 2000)
    QUEUE_WORKERS: int = _int("TELEMETRY_QUEUE_WORKERS", 2)
    EVENT_MAX_BATCH: int = _int("TELEMETRY_EVENT_MAX_BATCH", 100)
    EVENT_MAX_BYTES: int = _int("TELEMETRY_EVENT_MAX_BYTES", 16384)
    INGEST_MAX_BATCH_BYTES: int = _int("TELEMETRY_INGEST_MAX_BATCH_BYTES", 1048576)

    INGEST_SERVER_TOKEN: str = os.getenv("TELEMETRY_INGEST_SERVER_TOKEN", "")
    INGEST_TOKEN_SECRET: str = os.getenv("TELEMETRY_INGEST_TOKEN_SECRET", "")
    ITOPS_QUERY_KEY: str = os.getenv("TELEMETRY_ITOPS_QUERY_KEY", "")

    SAMPLE_SERVER_SUCCESS: float = _float("TELEMETRY_SAMPLE_SERVER_SUCCESS", 0.25)
    SAMPLE_CLIENT_DATA_SUCCESS: float = _float("TELEMETRY_SAMPLE_CLIENT_DATA_SUCCESS", 0.20)
    SAMPLE_CLIENT_ENGAGEMENT: float = _float("TELEMETRY_SAMPLE_CLIENT_ENGAGEMENT", 0.10)

    CRITICAL_SERVER_ROUTES: list[str] = None  # type: ignore[assignment]
    CRITICAL_CLIENT_OPERATIONS: list[str] = None  # type: ignore[assignment]

    RATE_LIMIT_PER_MINUTE: int = _int("TELEMETRY_RATE_LIMIT_PER_MINUTE", 600)
    RATE_LIMIT_BURST: int = _int("TELEMETRY_RATE_LIMIT_BURST", 200)

    RETAIN_SUCCESS_DAYS: int = _int("TELEMETRY_RETAIN_SUCCESS_DAYS", 30)
    RETAIN_ERROR_DAYS: int = _int("TELEMETRY_RETAIN_ERROR_DAYS", 60)
    RETAIN_KEYS_HOURS: int = _int("TELEMETRY_RETAIN_KEYS_HOURS", 72)
    RETAIN_GENERAL_DAYS: int = _int("TELEMETRY_RETAIN_GENERAL_DAYS", 30)
    LOG_LEVEL: str = os.getenv("TELEMETRY_LOG_LEVEL", "INFO").upper()
    ALLOWED_ORIGINS: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if not self.DATABASE_URL:
            raise ValueError("TELEMETRY_DATABASE_URL is required (Supabase Postgres connection string).")
        if self.DB_POOL_MIN_SIZE < 1:
            self.DB_POOL_MIN_SIZE = 1
        if self.DB_POOL_MAX_SIZE < self.DB_POOL_MIN_SIZE:
            self.DB_POOL_MAX_SIZE = self.DB_POOL_MIN_SIZE

        self.CRITICAL_SERVER_ROUTES = _list(
            "TELEMETRY_CRITICAL_SERVER_ROUTES",
            "/assets,/assets/:id,/employee,/analysis",
        )
        self.CRITICAL_CLIENT_OPERATIONS = _list(
            "TELEMETRY_CRITICAL_CLIENT_OPERATIONS",
            "fn_assign_asset,fn_return_asset,fn_set_employee_role,fn_public_scan_asset",
        )
        self.ALLOWED_ORIGINS = _list(
            "TELEMETRY_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        )


settings = Settings()
