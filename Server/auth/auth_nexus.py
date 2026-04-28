import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Header, HTTPException
from jose import jwt
from jose.exceptions import JWTError

# Load env next to this package (optional)
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

AUTHORITY = os.getenv("VITE_AUTH_AUTHORITY", "http://192.168.1.16:8000").rstrip("/")
JWKS_URL = f"{AUTHORITY}/api/v1/auth/jwks"
ALGORITHM = "RS256"
EXPECTED_PROJECT_ID = os.getenv("VITE_PROJECT_ID")

_jwks_cache = None


async def get_jwks():
    """Fetch and cache JWKS from AuthNexus gateway."""
    global _jwks_cache
    if _jwks_cache is None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(JWKS_URL)
                response.raise_for_status()
                _jwks_cache = response.json()
                print(" ✅ [AUTH] Public Keys fetched from Gateway.")
        except Exception as e:
            print(f" ❌ [AUTH] Failed to fetch JWKS: {e}")
            _jwks_cache = None
    return _jwks_cache


async def verify_session(authorization: str | None = Header(default=None)):
    """Validate AuthNexus JWT (Bearer)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization.split(" ", 1)[1].strip()
    jwks = await get_jwks()

    if not jwks:
        raise HTTPException(status_code=500, detail="Gateway keys unavailable")

    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=[ALGORITHM],
            issuer="authNexus-Gateway",
            options={"verify_aud": False, "leeway": 60},
        )

        project_id = payload.get("project_id")
        if project_id != EXPECTED_PROJECT_ID:
            print(f" ❌ [SECURITY] Project mismatch! {project_id} vs {EXPECTED_PROJECT_ID}")
            raise HTTPException(status_code=403, detail="Not authorized for this project")

        return {
            "user_id": payload.get("sub"),
            "org_id": payload.get("org_id"),
            "roles": payload.get("roles", []),
            "project_id": project_id,
            "username": payload.get("email"),
        }

    except JWTError as e:
        global _jwks_cache
        _jwks_cache = None
        print(f" ❌ [AUTH] Token Validation Failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Session expired or invalid") from e
