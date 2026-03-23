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
    VITE_SUPABASE_URL: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_URL", ""))      
    VITE_SUPABASE_KEY: str = field(default_factory=lambda: os.getenv("VITE_SUPABASE_KEY", ""))
    
    # FRONTEND_URL: Used for QR code generation
    FRONTEND_URL: str = field(default_factory=lambda: os.getenv("VITE_FRONTEND_URL", ""))
    
    # ALLOWED_ORIGINS: Comma-separated list of allowed origins for CORS
    ALLOWED_ORIGINS: List[str] = field(default_factory=lambda: _parse_origins(os.getenv("VITE_ALLOWED_ORIGINS", "")))

    # Optional shared secret for backend API access when server is public.
    BACKEND_API_KEY: str = field(default_factory=lambda: os.getenv("VITE_BACKEND_API_KEY", ""))

    # ENVIRONMENT: local | production
    ENV: str = field(default_factory=lambda: os.getenv("VITE_ENV", ""))

    def __post_init__(self):
        # Basic validation
        if not self.VITE_SUPABASE_URL or not self.VITE_SUPABASE_KEY:
            print("WARNING: VITE_SUPABASE_URL or VITE_SUPABASE_KEY is missing. Database calls will fail.")
        if not self.VITE_SUPABASE_URL or not self.VITE_SUPABASE_KEY:
            raise ValueError("VITE_SUPABASE_URL and VITE_SUPABASE_KEY must be set.")

        if not self.FRONTEND_URL.startswith("http"):
            print(f"WARNING: FRONTEND_URL '{self.FRONTEND_URL}' might be invalid. It should start with http:// or https://")

        if not self.ALLOWED_ORIGINS:
            self.ALLOWED_ORIGINS = [self.FRONTEND_URL.rstrip("/"), os.getenv("VITE_ALLOWED_ORIGINS", "")]

        if self.ENV.strip().lower() == "production" and not os.getenv("VITE_BACKEND_API_KEY", "").strip():
            print("WARNING: BACKEND_API_KEY is empty in production. Public API access is not restricted.")

# Global settings instance
settings = Settings()
