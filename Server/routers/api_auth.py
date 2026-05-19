import logging

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Auth"])

REFRESH_COOKIE_NAME = "nexus_refresh_token"
DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 900


class SetSessionRequest(BaseModel):
    refresh_token: str


@router.post("/api/auth/set-session")
async def set_session(body: SetSessionRequest) -> JSONResponse:
    """
    Called once after OIDC login to plant the refresh token as an HttpOnly cookie.
    The frontend cannot set HttpOnly cookies directly — this BFF endpoint does it.
    """
    token = body.refresh_token.strip()
    if not token:
        logger.warning("[auth/set-session] FAILED — refresh_token body is empty.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh_token.")

    logger.info("[auth/set-session] OK — planting nexus_refresh_token cookie (token_len=%d).", len(token))
    response = JSONResponse(content={"ok": True})

    # Secure flag gated on production environment
    secure_cookie = settings.ENVIRONMENT == "production"

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/api/auth/",
        secure=secure_cookie,
    )
    # Delete any stale broad-path cookie left by older server versions
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")
    return response


@router.post("/api/auth/refresh")
async def refresh_token(request: Request) -> JSONResponse:
    """
    Purpose: Refresh AuthNexus access token from the HttpOnly refresh cookie.
    Method/Route: POST /api/auth/refresh
    Request: Browser sends `nexus_refresh_token` cookie.
    Response: AuthNexus refresh response with top-level access token fields.
    Notes: BFF bridge because frontend JavaScript cannot read HttpOnly cookies.
    """
    all_cookies = list(request.cookies.keys())
    logger.info("[auth/refresh] STEP 1 — cookies in request: %s", all_cookies)

    refresh_cookie = (request.cookies.get(REFRESH_COOKIE_NAME) or "").strip()
    if not refresh_cookie:
        logger.error(
            "[auth/refresh] FAILED STEP 1 — '%s' cookie not found. "
            "All cookies present: %s. "
            "Likely cause: /api/auth/set-session was never called after login, "
            "or the cookie was blocked/expired.",
            REFRESH_COOKIE_NAME,
            all_cookies,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token.",
        )

    logger.info("[auth/refresh] STEP 1 OK — refresh cookie found (token_len=%d).", len(refresh_cookie))

    if not settings.AUTH_AUTHORITY:
        logger.error("[auth/refresh] FAILED STEP 2 — AUTH_AUTHORITY env var is not set.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth server is not configured.",
        )

    refresh_url = f"{settings.AUTH_AUTHORITY}/api/v1/auth/token"
    logger.info("[auth/refresh] STEP 2 — calling AuthNexus: POST %s", refresh_url)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_response = await client.post(
                refresh_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_cookie,
                    "client_id": settings.AUTH_CLIENT_ID,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.TimeoutException as exc:
        logger.error("[auth/refresh] FAILED STEP 2 — AuthNexus timed out: %s", str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Auth server timed out.") from exc
    except httpx.HTTPError as exc:
        logger.error("[auth/refresh] FAILED STEP 2 — AuthNexus unreachable: %s", str(exc))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Auth server unreachable.") from exc

    logger.info("[auth/refresh] STEP 2 OK — AuthNexus status: %s", auth_response.status_code)

    if auth_response.status_code != status.HTTP_200_OK:
        logger.error(
            "[auth/refresh] FAILED STEP 3 — AuthNexus rejected refresh. "
            "status=%s | response_body=%s",
            auth_response.status_code,
            auth_response.text[:1000],
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh failed.",
        )

    try:
        data = auth_response.json()
    except ValueError as exc:
        logger.error(
            "[auth/refresh] FAILED STEP 3 — AuthNexus returned invalid JSON. raw=%s",
            auth_response.text[:500],
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid auth server response.") from exc

    logger.info(
        "[auth/refresh] STEP 3 OK — AuthNexus response keys: %s | has_access_token=%s | has_refresh_token=%s",
        list(data.keys()),
        "access_token" in data,
        "refresh_token" in data,
    )

    if "expires_in" not in data:
        data["expires_in"] = DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS

    logger.info("[auth/refresh] STEP 4 — AuthNexus response cookies: %s", dict(auth_response.cookies))

    # AuthNexus returns the rotated refresh token in the response body (not as a cookie).
    # Extract it before sending the response so it never reaches the browser as readable JS.
    new_refresh_token = (
        auth_response.cookies.get(REFRESH_COOKIE_NAME)
        or data.pop("refresh_token", None)
    )

    if new_refresh_token:
        logger.info("[auth/refresh] STEP 4 OK — rotating nexus_refresh_token cookie (token_len=%d).", len(new_refresh_token))
    else:
        logger.warning(
            "[auth/refresh] STEP 4 WARNING — no rotated refresh token in AuthNexus response. "
            "Cookie will NOT be updated. response_keys=%s",
            list(data.keys()),
        )

    response = JSONResponse(content=data)
    if new_refresh_token:
        secure_cookie = settings.ENVIRONMENT == "production"
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=new_refresh_token,
            httponly=True,
            samesite="lax",
            path="/api/auth/",  # Scope cookie strictly to BFF auth routes
            secure=secure_cookie,
        )

    logger.info(
        "[auth/refresh] DONE — returning access_token to frontend. expires_in=%s",
        data.get("expires_in"),
    )
    return response


@router.post("/api/auth/logout")
async def logout(request: Request) -> JSONResponse:
    """
    Purpose: Revoke session/sign out at AuthNexus and delete refresh cookie.
    Method/Route: POST /api/auth/logout
    """
    refresh_cookie = (request.cookies.get(REFRESH_COOKIE_NAME) or "").strip()
    
    if refresh_cookie and settings.AUTH_AUTHORITY:
        signout_url = f"{settings.AUTH_AUTHORITY}/api/v1/auth/signout"
        logger.info("[auth/logout] Revoking refresh token at AuthNexus: POST %s", signout_url)
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    signout_url,
                    json={REFRESH_COOKIE_NAME: refresh_cookie},
                    cookies={REFRESH_COOKIE_NAME: refresh_cookie},
                )
        except Exception as e:
            logger.warning("[auth/logout] AuthNexus signout call failed (ignoring): %s", e)

    response = JSONResponse(content={"ok": True})
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/api/auth/",
    )
    logger.info("[auth/logout] Successfully deleted local cookie and completed logout flow.")
    return response
