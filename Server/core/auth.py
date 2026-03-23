from fastapi import Header, HTTPException, status

from core.settings import settings


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

