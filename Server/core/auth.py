import hmac
import httpx
from typing import List, Optional

from jose import jwt, JWTError
from fastapi import Depends, Header, HTTPException, status

from core.settings import settings
from core.roles import Role, PRIVILEGED_ROLES

# authNexus configuration from settings
AUTHORITY = settings.AUTH_AUTHORITY.rstrip("/")
JWKS_URL = f"{AUTHORITY}/api/v1/auth/jwks"
ALGORITHM = "RS256"
EXPECTED_PROJECT_ID = settings.AUTH_PROJECT_ID

_jwks_cache = None

async def get_jwks():
    """Fetches and caches the JWKS from the authNexus gateway."""
    global _jwks_cache
    if _jwks_cache is None:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(JWKS_URL, timeout=10.0)
                r.raise_for_status()
                _jwks_cache = r.json()
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Auth gateway keys unavailable: {str(e)}"
            )
    return _jwks_cache

def require_backend_api_key(
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    """
    Optional API-key protection for public backend deployment.
    If BACKEND_API_KEY is unset, route access remains unchanged.
    """
    expected = settings.BACKEND_API_KEY.strip()
    if not expected:
        return

    if x_api_key and x_api_key.strip() == expected:
        return

    if authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer ") and auth[7:].strip() == expected:
            return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized.",
    )

def require_role_bootstrap_secret(
    x_bootstrap_secret: str | None = Header(default=None, alias="X-Bootstrap-Secret"),
    authorization: str | None = Header(default=None),
):
    """
    Protects role bootstrap endpoint. Compares header to ROLE_BOOTSTRAP_SECRET (constant-time).
    Accepts X-Bootstrap-Secret or Authorization: Bearer <secret>.
    If ROLE_BOOTSTRAP_SECRET is unset, returns 503 (endpoint disabled).
    """
    expected = settings.ROLE_BOOTSTRAP_SECRET
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Role bootstrap is not configured.",
        )

    provided = (x_bootstrap_secret or "").strip()
    if not provided and authorization:
        auth = authorization.strip()
        if auth.lower().startswith("bearer "):
            provided = auth[7:].strip()

    try:
        ok = hmac.compare_digest(
            provided.encode("utf-8"),
            expected.encode("utf-8"),
        )
    except (ValueError, UnicodeEncodeError):
        ok = False

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized.",
        )

async def verify_session(authorization: str = Header(None)) -> dict:
    """
    Validates the authNexus RS256 JWT from the Authorization header.
    Returns a user context dictionary if valid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header"
        )
    
    token = authorization.split(" ")[1]
    jwks = await get_jwks()
    
    try:
        # RS256 verification using the gateway's JWKS
        payload = jwt.decode(
            token, 
            jwks,
            algorithms=[ALGORITHM],
            options={"verify_aud": False, "leeway": settings.AUTH_CLOCK_SKEW_SECONDS}
        )
        
        # Security constraint: project_id must match our environment
        if payload.get("project_id") != EXPECTED_PROJECT_ID:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Project scope mismatch"
            )
            
        return {
            "user_id":    payload.get("sub"),
            "username":   payload.get("email"),
            "org_id":     payload.get("org_id"),
            "roles":      payload.get("roles", []),
            "project_id": payload.get("project_id"),
        }
    except JWTError as e:
        global _jwks_cache
        _jwks_cache = None  # Clear cache on potential key rotation/error
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Session invalid: {str(e)}"
        )

def require_role(*allowed_roles: str):
    """Dependency factory to enforce role-based access control."""
    async def guard(user: dict = Depends(verify_session)):
        user_roles = user.get("roles", [])
        if not any(role in user_roles for role in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permissions"
            )
        return user
    return guard

# Legacy aliases for compatibility with existing routers during transition
def get_auth_user_id_from_bearer(user: dict = Depends(verify_session)) -> str:
    return str(user["user_id"])

def _resolve_request_role(user: dict = Depends(verify_session)) -> Role:
    roles = user.get("roles", [])
    if "admin" in roles:
        return "admin"
    if "it_ops" in roles:
        return "it_ops"
    return "employee"

def require_manage_platform_access(user: dict = Depends(require_role(*PRIVILEGED_ROLES))):
    return user

def require_admin_or_it_ops_access(user: dict = Depends(require_role(*PRIVILEGED_ROLES))):
    return user

def require_it_ops_access(user: dict = Depends(require_role("it_ops"))):
    return user
