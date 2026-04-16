import hmac
from typing import Literal

import jwt
from jwt import PyJWKClient, PyJWKClientConnectionError
from jwt.exceptions import InvalidTokenError

from fastapi import Depends, Header, HTTPException, status
from supabase import Client

from core.settings import settings
from core.deps import get_db  # used by _resolve_request_role via Depends

# Fetches Supabase's RS256 public keys once and caches them.
# Re-fetches automatically only when a token presents an unknown key ID.
# The JWKS endpoint is public — no credentials required.
_jwks_client = PyJWKClient(
    f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json",
    cache_keys=True,
    max_cached_keys=16,
)


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


def get_auth_user_id_from_bearer(
    authorization: str | None = Header(default=None),
) -> str:
    """
    Extracts and locally verifies the Supabase JWT from Authorization: Bearer <token>.

    Uses RS256 local verification via Supabase's JWKS endpoint — public key is fetched
    once at first use and cached. No network round-trip to Supabase per request.
    Returns the JWT `sub` claim, which equals auth.users.id.

    Trade-off: revoked tokens remain valid until expiry (Supabase default: 1 hour).
    Mitigation: set JWT expiry to ≤15 min in Supabase Dashboard → Authentication → Settings.
    For high-sensitivity operations, use a separate dependency that calls db.auth.get_user().
    """
    if not authorization or not authorization.strip().lower().startswith('bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token.')

    jwt_token = authorization.strip()[7:].strip()
    if not jwt_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token.')

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(jwt_token)
    except PyJWKClientConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Unable to fetch token signing key.',
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid bearer token.') from exc

    try:
        payload = jwt.decode(
            jwt_token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            audience="authenticated",
            options={"require": ["sub", "exp"]},
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired bearer token.',
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Unable to resolve authenticated user.')

    return str(user_id)


def _resolve_request_role(
    auth_user_id: str = Depends(get_auth_user_id_from_bearer),
    db: Client = Depends(get_db),
) -> Literal['employee', 'admin', 'it_ops']:
    try:
        res = (
            db.table('employees')
            .select('role,is_active')
            .eq('auth_user_id', auth_user_id)
            .limit(1)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='Unable to verify employee profile.',
        ) from exc

    if res is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Active employee profile required.',
        )

    raw = getattr(res, 'data', None)
    if raw is None:
        data: dict = {}
    elif isinstance(raw, dict):
        data = raw
    elif isinstance(raw, list) and raw and isinstance(raw[0], dict):
        data = raw[0]
    else:
        data = {}

    if not data or not data.get('is_active'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Active employee profile required.')

    role = str(data.get('role') or 'employee').strip().lower()
    if role not in {'employee', 'admin', 'it_ops'}:
        role = 'employee'
    return role  # type: ignore[return-value]


def require_manage_platform_access(role: Literal['employee', 'admin', 'it_ops'] = Depends(_resolve_request_role)):
    if role not in {'admin', 'it_ops'}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin or IT Ops role required.')


def require_admin_or_it_ops_access(
    role: Literal['employee', 'admin', 'it_ops'] = Depends(_resolve_request_role)
):
    if role not in {'admin', 'it_ops'}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin or IT Ops role required.')


def require_it_ops_access(role: Literal['employee', 'admin', 'it_ops'] = Depends(_resolve_request_role)):
    if role != 'it_ops':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='IT Ops role required.')

