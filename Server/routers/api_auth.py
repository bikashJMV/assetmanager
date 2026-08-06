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
REFRESH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60


def _set_refresh_cookie(response: JSONResponse, token: str) -> None:
    """Single place for refresh-cookie attributes: HttpOnly always; Secure outside
    local development (plain-HTTP localhost would drop a Secure cookie); Max-Age so
    the session survives browser restarts (7 days, per the integration guide)."""
    secure = (settings.ENV or "").strip().lower() not in {"local", "dev", "development"}
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        secure=secure,
        max_age=REFRESH_COOKIE_MAX_AGE_SECONDS,
    )


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
    _set_refresh_cookie(response, token)
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

    refresh_url = f"{settings.AUTH_AUTHORITY}/api/auth/refresh"
    logger.info("[auth/refresh] STEP 2 — calling AuthNexus: POST %s", refresh_url)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            auth_response = await client.post(
                refresh_url,
                json={REFRESH_COOKIE_NAME: refresh_cookie},
                cookies={REFRESH_COOKIE_NAME: refresh_cookie},
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

    # AuthNexus may return the rotated refresh token BOTH as a cookie and in the body.
    # Always strip it from the body so it never reaches the browser as readable JS;
    # the rotated value travels only via the HttpOnly cookie below.
    body_refresh_token = data.pop("refresh_token", None)
    new_refresh_token = auth_response.cookies.get(REFRESH_COOKIE_NAME) or body_refresh_token

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
        _set_refresh_cookie(response, new_refresh_token)

    logger.info(
        "[auth/refresh] DONE — returning access_token to frontend. expires_in=%s",
        data.get("expires_in"),
    )
    return response
