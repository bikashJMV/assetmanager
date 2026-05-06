import logging

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse

from core.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Auth"])

REFRESH_COOKIE_NAME = "nexus_refresh_token"
DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 900


@router.post("/api/auth/refresh")
async def refresh_token(request: Request) -> JSONResponse:
    """
    Purpose: Refresh AuthNexus access token from the HttpOnly refresh cookie.
    Method/Route: POST /api/auth/refresh
    Request: Browser sends `nexus_refresh_token` cookie.
    Response: AuthNexus refresh response with top-level access token fields.
    Notes: BFF bridge because frontend JavaScript cannot read HttpOnly cookies.
    """
    refresh_cookie = (request.cookies.get(REFRESH_COOKIE_NAME) or "").strip()
    if not refresh_cookie:
        logger.warning("[auth/refresh] Missing %s cookie.", REFRESH_COOKIE_NAME)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token.",
        )

    if not settings.AUTH_AUTHORITY:
        logger.error("[auth/refresh] AUTH_AUTHORITY is not configured.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth server is not configured.",
        )

    refresh_url = f"{settings.AUTH_AUTHORITY}/api/auth/refresh"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_response = await client.post(
                refresh_url,
                json={REFRESH_COOKIE_NAME: refresh_cookie},
                cookies={REFRESH_COOKIE_NAME: refresh_cookie},
            )
    except httpx.HTTPError as exc:
        logger.error("[auth/refresh] AuthNexus refresh request failed: %s", str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Auth server unreachable.",
        ) from exc

    if auth_response.status_code != status.HTTP_200_OK:
        logger.warning(
            "[auth/refresh] AuthNexus returned %s during refresh.",
            auth_response.status_code,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh failed.",
        )

    try:
        data = auth_response.json()
    except ValueError as exc:
        logger.error("[auth/refresh] AuthNexus returned invalid JSON.")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid auth server response.",
        ) from exc

    if "expires_in" not in data:
        data["expires_in"] = DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS

    response = JSONResponse(content=data)
    rotated_refresh_cookie = auth_response.cookies.get(REFRESH_COOKIE_NAME)
    if rotated_refresh_cookie:
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=rotated_refresh_cookie,
            httponly=True,
            samesite="lax",
            path="/",
        )

    return response
