from typing import Literal

from fastapi import Depends, Header, HTTPException, status
from supabase import Client

from core.settings import settings
from core.deps import get_db


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


def _resolve_request_role(
    authorization: str | None = Header(default=None),
    db: Client = Depends(get_db),
) -> Literal['employee', 'admin', 'it_ops']:
    if not authorization or not authorization.strip().lower().startswith('bearer '):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token.')

    jwt_token = authorization.strip()[7:].strip()
    if not jwt_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Missing bearer token.')

    try:
        user_response = db.auth.get_user(jwt_token)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid bearer token.') from exc

    auth_user = getattr(user_response, 'user', None)
    auth_user_id = getattr(auth_user, 'id', None)
    if not auth_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Unable to resolve authenticated user.')

    employee = (
        db.table('employees')
        .select('role,is_active')
        .eq('auth_user_id', auth_user_id)
        .limit(1)
        .maybe_single()
        .execute()
    )
    data = employee.data or {}
    if not data or not data.get('is_active'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Active employee profile required.')

    role = str(data.get('role') or 'employee').strip().lower()
    if role not in {'employee', 'admin', 'it_ops'}:
        role = 'employee'
    return role  # type: ignore[return-value]


def require_manage_platform_access(role: Literal['employee', 'admin', 'it_ops'] = Depends(_resolve_request_role)):
    if role not in {'admin', 'it_ops'}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin or IT Ops role required.')


def require_it_ops_access(role: Literal['employee', 'admin', 'it_ops'] = Depends(_resolve_request_role)):
    if role != 'it_ops':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='IT Ops role required.')

