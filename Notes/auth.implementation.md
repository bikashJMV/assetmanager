
# authNexus Integration Guide

A complete, copy-paste reference for integrating **authNexus** (the in-house OAuth/RBAC
microservice at `auth.rokkalabs.com`) into any project. All code below is taken verbatim
from the working RokkaAI implementation (FastAPI backend + React/Vite frontend) — adapt
names/paths to your project.

> **Org rule (security.md #9):** never roll your own auth. Every org project authenticates
> via authNexus — no local user/password tables, no second RBAC scheme.

---

## Table of contents

1. [Concepts &amp; terminology](#1-concepts--terminology)
2. [The full flow (diagrams)](#2-the-full-flow)
3. [Backend — dependencies &amp; env vars](#3-backend--dependencies--env-vars)
4. [Backend — settings module](#4-backend--settings-module)
5. [Backend — JWT verification (`authnexus.py`)](#5-backend--jwt-verification)
6. [Backend — auth middleware](#6-backend--auth-middleware)
7. [Backend — BFF login routes (`api/auth.py`)](#7-backend--bff-login-routes)
8. [Backend — CORS proxy routes (`api/nexus_proxy.py`)](#8-backend--cors-proxy-routes)
9. [Backend — wiring it all in `main.py`](#9-backend--wiring-it-all-in-mainpy)
10. [Frontend — AuthContext (React)](#10-frontend--authcontext-react)
11. [Frontend — axios API layer with token refresh](#11-frontend--axios-api-layer)
12. [Frontend — ProtectedRoute &amp; app wiring](#12-frontend--protectedroute--app-wiring)
13. [Frontend — Login page (minimal skeleton)](#13-frontend--login-page)
14. [Role-based access (RBAC)](#14-role-based-access-rbac)
15. [Gotchas &amp; hard-won lessons](#15-gotchas--hard-won-lessons)
16. [Integration checklist](#16-integration-checklist)

---

## 1. Concepts & terminology

| Term                     | Meaning                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **authNexus**      | In-house OAuth/OIDC + RBAC microservice at`https://auth.rokkalabs.com`. Issues RS256 JWTs.                                                                                               |
| **org_id**         | Your organisation's ID in authNexus.                                                                                                                                                       |
| **project_id**     | The ID registered for*your* project. Tokens carry a `nexus_projects` claim; your backend must verify your project_id appears in it.                                                    |
| **client_id**      | The OAuth client ID for your web app (used by the browser/BFF flow).                                                                                                                       |
| **api_client_id**  | A separate client ID for server-to-server (headless) API access.                                                                                                                           |
| **default_client** | Literal string`"default_client"` — the `aud` claim on tokens minted via headless login (see [Gotchas](#15-gotchas--hard-won-lessons)).                                                 |
| **JWKS**           | authNexus publishes its RS256 public keys at`https://auth.rokkalabs.com/api/v1/auth/jwks`. Your backend fetches these to verify token signatures locally — no network call per request. |
| **BFF**            | Backend-for-Frontend. The browser never talks to authNexus directly (CORS blocks it); your backend orchestrates login and proxies the handful of auth endpoints.                           |
| **access_token**   | Short-lived (~15 min,`expires_in` ≈ 900) RS256 JWT. Sent as `Authorization: Bearer <token>` on every API call. Stored in **sessionStorage** (never localStorage).               |
| **refresh_token**  | Long-lived token used to mint new access tokens. Stored in an**HttpOnly cookie** scoped to `/api/v1/auth/` — JavaScript can never read it.                                        |

### authNexus upstream endpoints (the raw contract)

| Endpoint                        | Method                           | Purpose                                                                                                                                                                                |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{BASEURL}/api/login`         | POST (JSON)                      | Step 1 — authenticate credentials. Body:`{username, password, org_id, project_id}`. Returns `{refresh_token, ...}`.                                                               |
| `{BASEURL}/api/v1/auth/token` | POST (**form-urlencoded**) | Step 2 — OIDC token exchange. Body:`grant_type=refresh_token&refresh_token=...&client_id=...`. Returns `{access_token, refresh_token, expires_in}`. Also used for silent refresh. |
| `{BASEURL}/oidc/v1/userinfo`  | GET (Bearer)                     | Step 3 — full user profile including`nexus_projects` + roles.                                                                                                                       |
| `{BASEURL}/api/v1/auth/jwks`  | GET                              | Public keys for RS256 signature verification.                                                                                                                                          |

### Token payload shape (what you verify against)

```json
{
  "sub": "user-uuid",
  "aud": "your_client_id  (or \"default_client\" for headless tokens)",
  "iss": "https://auth.rokkalabs.com",
  "exp": 1750000000,
  "email": "user@example.com",
  "preferred_username": "EMP-001",
  "name": "Full Name",
  "org_id": "...",
  "nexus_projects": [
    { "id": "YOUR_PROJECT_ID", "name": "RokkaAI", "roles": ["Admin"] }
  ]
}
```

---

## 2. The full flow

### Login (BFF orchestrates all 3 steps server-side)

```
Browser                     Your Backend (BFF)                    authNexus
  |                              |                                    |
  |  POST /api/v1/auth/login     |                                    |
  |  {username, password}        |                                    |
  |----------------------------->|                                    |
  |                              |  1. POST /api/login                |
  |                              |     {username, password,           |
  |                              |      org_id, project_id}           |
  |                              |----------------------------------->|
  |                              |            {refresh_token} <-------|
  |                              |                                    |
  |                              |  2. POST /api/v1/auth/token        |
  |                              |     grant_type=refresh_token&...   |
  |                              |     (form-urlencoded!)             |
  |                              |----------------------------------->|
  |                              |  {access_token, refresh_token,     |
  |                              |   expires_in} <--------------------|
  |                              |                                    |
  |                              |  3. GET /oidc/v1/userinfo          |
  |                              |     Bearer access_token            |
  |                              |----------------------------------->|
  |                              |         {profile + roles} <--------|
  |                              |                                    |
  |                              |  4. verify_token(access_token)     |
  |                              |     → confirm project scope        |
  |                              |     (403 if not in this project)   |
  |                              |                                    |
  |  Set-Cookie: nexus_refresh_token (HttpOnly, path=/api/v1/auth/)   |
  |  Body: {access_token, expires_in, user}                           |
  |<-----------------------------|                                    |
  |                              |                                    |
  |  sessionStorage ← access_token; React state ← user                |
```

### Every authenticated API request

```
Browser                          Your Backend
  |                                   |
  |  GET /api/v1/anything             |
  |  Authorization: Bearer <token>    |
  |---------------------------------->|
  |                        AuthMiddleware:
  |                          - path exempt? → pass through
  |                          - verify RS256 sig via cached JWKS
  |                          - check aud ∈ {client_id, default_client}
  |                          - check iss == BASEURL
  |                          - check project_id ∈ nexus_projects
  |                          - request.state.user = payload
  |                          - request.state.role = first role (lowercased)
  |                                   |
  |          200 (or 401 on failure)  |
  |<----------------------------------|
```

### Silent refresh (three triggers, all landing on the same endpoint)

```
Trigger A: request interceptor — token expires in < 60 s  → refresh BEFORE sending
Trigger B: response interceptor — got a 401               → refresh, retry ONCE
Trigger C: background interval — every 10 minutes         → refresh proactively

Browser                          Your Backend                     authNexus
  |  POST /api/v1/auth/refresh       |                                |
  |  Cookie: nexus_refresh_token     |                                |
  |  (withCredentials: true)         |                                |
  |--------------------------------->|                                |
  |                                  |  POST /api/v1/auth/token       |
  |                                  |  grant_type=refresh_token&...  |
  |                                  |------------------------------->|
  |                                  |   {access_token,               |
  |                                  |    refresh_token(rotated)} <---|
  |  Set-Cookie: rotated refresh     |                                |
  |  Body: {access_token, expires_in}|                                |
  |<---------------------------------|                                |
  |                                  |                                |
  |  On refresh failure → clear session → redirect /login             |
```

### Page reload (session restore)

```
1. AUTH_ENABLED=false?           → mock dev user, done.
2. sessionStorage token valid?   → restore immediately, re-fetch userinfo in background.
3. Token missing/expired?        → one silent refresh from the HttpOnly cookie.
   - On /login page?             → skip (first-time visitors have no cookie; call always fails).
4. Refresh failed too?           → isLoading=false, ProtectedRoute redirects to /login.
```

---

## 3. Backend — dependencies & env vars

**Python packages** (add to `requirements.txt` / `pyproject.toml`):

```
fastapi
pydantic-settings
PyJWT[crypto]        # RS256 verification needs the crypto extra (cryptography lib)
httpx                # async client for the BFF → authNexus calls
```

**Environment variables** (`.env.example` template — never commit real values):

```bash
# ── authNexus ─────────────────────────────────────────────────────────────────
AUTHNEXUS_BASEURL=https://auth.rokkalabs.com
AUTHNEXUS_ORG_ID=YOUR_ORG_ID
AUTHNEXUS_PROJECT_ID=YOUR_PROJECT_ID
AUTHNEXUS_CLIENT_ID=YOUR_CLIENT_ID
AUTHNEXUS_API_CLIENT_ID=YOUR_API_CLIENT_ID
AUTHNEXUS_DEFAULT_CLIENT=default_client
AUTH_JWKS_URL=https://auth.rokkalabs.com/api/v1/auth/jwks
AUTH_ENABLED=true          # false = dev mode, all requests pass with a mock user
```

**Frontend env** (`frontend/.env`):

```bash
VITE_PROJECT_ID=YOUR_PROJECT_ID
VITE_AUTH_ENABLED=true     # 'false' = dev mock user, no token flows
```

---

## 4. Backend — settings module

`app/core/config.py` (the authNexus-relevant portion — merge into your settings class):

```python
from dataclasses import dataclass
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True)
class AuthNexusSettings:
    baseurl: str
    org_id: str
    project_id: str
    client_id: str          # web/BFF client
    api_client_id: str      # server-to-server API client
    default_client: str     # "default_client" — aud for headless tokens
    jwks_url: str
    enabled: bool


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="development", alias="APP_ENV")

    # authNexus raw env vars (used to build AuthNexusSettings)
    authnexus_baseurl: str = Field(default="https://auth.rokkalabs.com", alias="AUTHNEXUS_BASEURL")
    authnexus_org_id: str = Field(default="", alias="AUTHNEXUS_ORG_ID")
    authnexus_project_id: str = Field(default="", alias="AUTHNEXUS_PROJECT_ID")
    authnexus_client_id: str = Field(default="", alias="AUTHNEXUS_CLIENT_ID")
    authnexus_api_client_id: str = Field(default="", alias="AUTHNEXUS_API_CLIENT_ID")
    authnexus_default_client: str = Field(default="default_client", alias="AUTHNEXUS_DEFAULT_CLIENT")
    auth_jwks_url: str = Field(default="https://auth.rokkalabs.com/api/v1/auth/jwks", alias="AUTH_JWKS_URL")
    auth_enabled: bool = Field(default=False, alias="AUTH_ENABLED")

    @property
    def authnexus(self) -> AuthNexusSettings:
        return AuthNexusSettings(
            baseurl=self.authnexus_baseurl,
            org_id=self.authnexus_org_id,
            project_id=self.authnexus_project_id,
            client_id=self.authnexus_client_id,
            api_client_id=self.authnexus_api_client_id,
            default_client=self.authnexus_default_client,
            jwks_url=self.auth_jwks_url,
            enabled=self.auth_enabled,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## 5. Backend — JWT verification

`app/core/auth/authnexus.py` — the core verifier. Pure functions, no FastAPI dependency,
so it is reusable from middleware, BFF routes, and tests.

```python
"""
authNexus JWT verification.

Fetches JWKS from auth.rokkalabs.com, verifies RS256 access tokens,
and confirms the token is scoped to this project.

Key gotcha: headless login tokens use aud="default_client", not the client_id.
We accept both as valid audiences.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from functools import lru_cache

import jwt
from jwt import InvalidTokenError, PyJWKClient

from app.core.config import get_settings

logger = logging.getLogger("myapp.auth")


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    settings = get_settings()
    return PyJWKClient(settings.authnexus.jwks_url, cache_keys=True)


def verify_token(token: str) -> dict:
    """
    Verify a Bearer token from authNexus.

    Returns the decoded JWT payload on success.
    Raises jwt.InvalidTokenError on any failure.
    """
    settings = get_settings()
    an = settings.authnexus

    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)

    # Headless login → aud="default_client"
    # OIDC redirect flow → aud=client_id
    # Accept both so either login path works.
    valid_audiences = [an.client_id, an.default_client]

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=[signing_key.algorithm_name],
        audience=valid_audiences,
        issuer=an.baseurl,
        options={"require": ["sub", "exp"]},
        leeway=timedelta(seconds=10),
    )

    # Confirm the token is scoped to THIS project
    nexus_projects = payload.get("nexus_projects", [])
    has_project = any(
        str(p.get("id")) == an.project_id
        for p in nexus_projects
        if isinstance(p, dict)
    )
    if not has_project:
        raise InvalidTokenError(
            f"token does not include required project {an.project_id}"
        )

    return payload


def extract_role(payload: dict) -> str | None:
    """Extract the first role from nexus_projects matching this project."""
    settings = get_settings()
    projects = payload.get("nexus_projects", [])
    for p in projects:
        if isinstance(p, dict) and str(p.get("id")) == settings.authnexus.project_id:
            roles = p.get("roles", [])
            return roles[0].lower() if roles else None
    return None
```

**What each check protects against:**

| Check                                       | Attack blocked                                                   |
| ------------------------------------------- | ---------------------------------------------------------------- |
| RS256 signature via JWKS                    | Forged / tampered tokens                                         |
| `audience` ∈ {client_id, default_client} | Tokens minted for a*different* app                             |
| `issuer` == BASEURL                       | Tokens from a different identity provider                        |
| `exp` required + 10 s leeway              | Expired tokens (leeway absorbs clock skew)                       |
| `nexus_projects` contains your project_id | Valid org users who are**not** members of *your* project |

Don't forget `app/core/auth/__init__.py` (empty file) if the package is new.

---

## 6. Backend — auth middleware

`app/middleware/auth_middleware.py` — runs on **every** request; the exempt lists are the
only way through without a token.

```python
"""
JWT authentication middleware.

Checks Authorization: Bearer <token> on every request.
Exempt paths (login, refresh, proxy routes) pass through without a token.
On success, injects request.state.user = decoded JWT payload.
On failure (missing/invalid token), returns 401.

When AUTH_ENABLED=false (dev mode), all requests pass through unchecked.
"""

from __future__ import annotations

import logging

from jwt import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.auth.authnexus import verify_token, extract_role
from app.core.config import get_settings

logger = logging.getLogger("myapp.auth_middleware")

# These paths are public — they ARE the authentication flow or infrastructure checks.
_EXEMPT_PREFIXES: tuple[str, ...] = (
    # Health + liveness probes (read-only, no sensitive data)
    "/api/health",
    "/api/ping",
    # Auth BFF — login, refresh, logout, set-session do not need a token
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/set-session",
    # authNexus proxy routes — no token yet, these initiate the login
    "/api/login",
    "/api/v1/auth/token",
    "/oidc/v1/userinfo",
    # Static assets served by the SPA mount
    "/assets/",
    "/favicon",
)

# SPA shell paths + any public static files fetched tokenless.
# Exact match only, no prefix, so nothing else is exposed.
_EXEMPT_EXACT: frozenset[str] = frozenset({
    "/", "/login", "/callback",
})


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()

        if not settings.auth_enabled:
            request.state.user = {"sub": "dev-user", "email": "dev@myapp.local"}
            request.state.role = "admin"
            return await call_next(request)

        path = request.url.path
        if any(path.startswith(prefix) for prefix in _EXEMPT_PREFIXES) or path in _EXEMPT_EXACT:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Missing or invalid Authorization header"},
            )

        token = auth_header[7:]
        try:
            payload = verify_token(token)
        except InvalidTokenError as e:
            logger.warning("Token verification failed: %s", str(e))
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Invalid token"},
            )

        request.state.user = payload
        request.state.role = extract_role(payload)
        return await call_next(request)
```

**Exempt-list rules (learned the hard way):**

- **Prefixes** for route families that are the auth flow itself; **exact matches** for the
  SPA shell (`/`, `/login`, `/callback`) and any public JSON files — exact-only so a prefix
  can't accidentally expose neighbours.
- Endpoints that validate their own credential (e.g. an API-key header, or a signed
  one-time download token in a query param because `window.open()` can't send headers)
  get an exemption here and enforce their own check inside the route. Example from RokkaAI:

```python
import re

# Token-authenticated document download — OTP validated by the endpoint itself.
# Browser window.open() / anchor clicks cannot send Authorization headers.
if re.search(r"^/api/v1/documents/[^/]+/download$", path) and request.query_params.get("token"):
    return await call_next(request)
```

- After verification, `request.state.user` (full JWT claims) and `request.state.role`
  are available to every route handler and downstream middleware — no per-route
  decoding needed.

---

## 7. Backend — BFF login routes

`app/api/auth.py` — the browser talks only to these; authNexus is never called from JS
for the login flow.

```python
"""
BFF (Backend-for-Frontend) auth routes.

Orchestrates the 3-step authNexus login server-side so the browser
never touches auth.rokkalabs.com directly (CORS would block it).

Cookie strategy:
  - nexus_refresh_token: HttpOnly, path=/api/v1/auth/, 7-day lifetime
  - access_token: returned in JSON body, stored in sessionStorage by frontend
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Cookie, Request
from fastapi.responses import JSONResponse, Response
from jwt import InvalidTokenError

from app.core.auth.authnexus import verify_token
from app.core.config import get_settings

logger = logging.getLogger("myapp.auth")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_REFRESH_COOKIE = "nexus_refresh_token"
_COOKIE_PATH = "/api/v1/auth/"
_TIMEOUT = 20.0


def _set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    secure = settings.app_env not in ("development", "dev", "local")
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        path=_COOKIE_PATH,
        secure=secure,
        max_age=7 * 24 * 60 * 60,  # 7 days
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path=_COOKIE_PATH)


@router.post("/login")
async def login(request: Request) -> JSONResponse:
    """
    BFF login — runs all 3 authNexus steps server-side.

    Body: { username, password }
    Sets HttpOnly nexus_refresh_token cookie.
    Returns: { access_token, expires_in, user }
    """
    settings = get_settings()
    an = settings.authnexus
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"detail": "Invalid request body"})

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Step 1 — authenticate credentials
            step1 = await client.post(
                f"{an.baseurl}/api/login",
                json={
                    "username": body.get("username"),
                    "password": body.get("password"),
                    "org_id": an.org_id,
                    "project_id": an.project_id,
                },
            )
            if step1.status_code != 200:
                logger.warning("authNexus login step1 failed: %d", step1.status_code)
                return JSONResponse(status_code=401, content={"detail": "Invalid credentials"})

            step1_data = step1.json()
            refresh_token_step1 = step1_data.get("refresh_token")
            if not refresh_token_step1:
                return JSONResponse(status_code=502, content={"detail": "No refresh token from authNexus"})

            # Step 2 — exchange for OIDC tokens
            params = (
                f"grant_type=refresh_token"
                f"&refresh_token={refresh_token_step1}"
                f"&client_id={an.client_id}"
            )
            step2 = await client.post(
                f"{an.baseurl}/api/v1/auth/token",
                content=params,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if step2.status_code != 200:
                logger.warning("authNexus token exchange failed: %d", step2.status_code)
                return JSONResponse(status_code=502, content={"detail": "Token exchange failed"})

            step2_data = step2.json()
            access_token = step2_data.get("access_token")
            refresh_token = step2_data.get("refresh_token", refresh_token_step1)
            expires_in = step2_data.get("expires_in", 900)

            # Step 3 — fetch user profile
            step3 = await client.get(
                f"{an.baseurl}/oidc/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_profile = step3.json() if step3.status_code == 200 else {}
    except httpx.TimeoutException:
        logger.error("authNexus login timed out after %ss", _TIMEOUT)
        return JSONResponse(status_code=504, content={"detail": "Auth service timed out — try again"})
    except httpx.ConnectError as exc:
        logger.error("authNexus unreachable: %s", exc)
        return JSONResponse(status_code=503, content={"detail": "Auth service unreachable"})
    except httpx.HTTPError as exc:
        logger.error("authNexus HTTP error: %s", exc)
        return JSONResponse(status_code=502, content={"detail": "Auth service error"})

    # Gate: confirm the token is scoped to this project before handing it to the frontend.
    # This catches users who exist in authNexus but don't belong to this project.
    try:
        verify_token(access_token)
    except InvalidTokenError as exc:
        logger.warning("Login blocked — token not authorized for this project: %s", exc)
        return JSONResponse(
            status_code=403,
            content={"detail": "Your account is not authorized for this workspace."},
        )

    enriched_profile = {
        **user_profile,
        "login_at": datetime.now(timezone.utc).isoformat(),
    }

    response = JSONResponse(content={
        "access_token": access_token,
        "expires_in": expires_in,
        "user": enriched_profile,
    })
    _set_refresh_cookie(response, refresh_token)
    logger.info("Login success for sub=%s", user_profile.get("sub", "?"))
    return response


@router.post("/refresh")
async def refresh(
    response: Response,
    nexus_refresh_token: str | None = Cookie(default=None, alias=_REFRESH_COOKIE),
) -> dict:
    """
    Silent token refresh — reads HttpOnly cookie, rotates it.
    Called by the frontend interceptor before expiry or on 401.
    """
    if not nexus_refresh_token:
        return JSONResponse(status_code=401, content={"detail": "No refresh token"})

    settings = get_settings()
    an = settings.authnexus

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            upstream = await client.post(
                f"{an.baseurl}/api/v1/auth/token",
                content=(
                    f"grant_type=refresh_token"
                    f"&refresh_token={nexus_refresh_token}"
                    f"&client_id={an.client_id}"
                ),
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError) as exc:
        logger.error("authNexus refresh error: %s", exc)
        return JSONResponse(status_code=503, content={"detail": "Auth service unavailable"})

    if upstream.status_code != 200:
        _clear_refresh_cookie(response)
        return JSONResponse(status_code=401, content={"detail": "Refresh failed"})

    body = upstream.json()
    rotated = body.get("refresh_token")
    if rotated:
        _set_refresh_cookie(response, rotated)

    return {
        "access_token": body.get("access_token"),
        "expires_in": body.get("expires_in", 900),
    }


@router.post("/set-session")
async def set_session(request: Request, response: Response) -> dict:
    """
    Stores a refresh token in the HttpOnly cookie.
    Called by the frontend after it receives a refresh token through another path.
    """
    body = await request.json()
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        return JSONResponse(status_code=400, content={"detail": "refresh_token required"})
    _set_refresh_cookie(response, refresh_token)
    return {"status": "ok"}


@router.post("/logout")
async def logout(response: Response) -> dict:
    """Clears the HttpOnly cookie. Frontend handles sessionStorage cleanup."""
    _clear_refresh_cookie(response)
    return {"status": "logged_out"}


@router.get("/me")
async def me(request: Request) -> dict:
    """Returns the decoded JWT claims for the current user (already verified by middleware)."""
    user = getattr(request.state, "user", None)
    if not user:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    return user
```

**Why the cookie is scoped to `path=/api/v1/auth/`:** the refresh token is only ever
needed by the refresh/logout endpoints. Path-scoping means it is not even *transmitted*
on normal API calls — smaller attack surface than a site-wide cookie.

---

## 8. Backend — CORS proxy routes

`app/api/nexus_proxy.py` — required for the frontend's session-restore call to
`/oidc/v1/userinfo`, and lets any client run the 3-step flow itself without CORS issues.

```python
"""
authNexus proxy routes.

The browser cannot call auth.rokkalabs.com directly due to CORS.
These routes pass the request through to authNexus and return the response as-is.
They are intentionally unauthenticated — they ARE the login flow.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.core.config import get_settings

logger = logging.getLogger("myapp.nexus_proxy")
router = APIRouter(tags=["nexus-proxy"])

_TIMEOUT = 20.0


@router.post("/api/login")
async def proxy_login(request: Request) -> Response:
    """Step 1 of the login flow — authenticates credentials against authNexus."""
    settings = get_settings()
    raw_body = await request.body()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        upstream = await client.post(
            f"{settings.authnexus.baseurl}/api/login",
            content=raw_body,
            headers={"Content-Type": request.headers.get("content-type", "application/json")},
        )
    logger.debug("proxy_login → %d", upstream.status_code)
    return Response(
        status_code=upstream.status_code,
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "application/json"),
    )


@router.post("/api/v1/auth/token")
async def proxy_token(request: Request) -> Response:
    """Step 2 — exchanges refresh token for OIDC access_token + id_token."""
    settings = get_settings()
    raw_body = await request.body()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        upstream = await client.post(
            f"{settings.authnexus.baseurl}/api/v1/auth/token",
            content=raw_body,
            # OIDC standard — must be url-encoded, NOT JSON
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    logger.debug("proxy_token → %d", upstream.status_code)
    return Response(
        status_code=upstream.status_code,
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "application/json"),
    )


@router.get("/oidc/v1/userinfo")
async def proxy_userinfo(request: Request) -> Response:
    """Step 3 — fetches full user profile including nexus_projects + roles."""
    settings = get_settings()
    authorization = request.headers.get("authorization", "")
    headers = {"Authorization": authorization} if authorization else {}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        upstream = await client.get(
            f"{settings.authnexus.baseurl}/oidc/v1/userinfo",
            headers=headers,
        )
    logger.debug("proxy_userinfo → %d", upstream.status_code)
    return Response(
        status_code=upstream.status_code,
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "application/json"),
    )
```

---

## 9. Backend — wiring it all in `main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.nexus_proxy import router as nexus_proxy_router
from app.middleware.auth_middleware import AuthMiddleware

app = FastAPI(title="MyApp")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # your dev frontend origin(s)
    allow_credentials=True,                    # REQUIRED for the HttpOnly cookie
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Starlette middleware is LIFO: add_middleware calls stack in reverse.
# AuthMiddleware must run BEFORE anything that reads request.state.user
# (e.g. a per-user rate limiter) — so add the rate limiter FIRST, auth SECOND.
# app.add_middleware(RateLimiterMiddleware)  # runs after auth — user available
app.add_middleware(AuthMiddleware)           # runs first — populates request.state.user

app.include_router(nexus_proxy_router)   # /api/login, /api/v1/auth/token, /oidc/v1/userinfo
app.include_router(auth_router)          # /api/v1/auth/*
# ... your other routers
```

Using `request.state` inside any route:

```python
from fastapi import Request

@router.get("/api/v1/whoami")
async def whoami(request: Request) -> dict:
    user = request.state.user     # full decoded JWT claims
    role = request.state.role     # e.g. "admin" | "editor" | "viewer" | None
    return {"sub": user["sub"], "role": role}
```

---

## 10. Frontend — AuthContext (React)

Dependencies: `axios`, `react-router-dom`.

`src/context/AuthContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import axios from 'axios'

// ── Types ────────────────────────────────────────────────────────────────────

export interface NexusProject {
  id: string
  name: string
  roles: string[]
}

export interface AuthUser {
  sub: string
  email: string
  preferred_username: string
  name: string
  org_id: string
  project_id: string
  nexus_projects: NexusProject[]
  role: string | null   // extracted from nexus_projects for convenience
  login_at?: string     // ISO timestamp injected by BFF at login
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => string | null
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const TOKEN_KEY      = 'myapp_access_token'
const LOGIN_META_KEY = 'myapp_login_meta'
const PROJECT_ID   = import.meta.env.VITE_PROJECT_ID as string
const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED !== 'false'

// Dev mock user — used when VITE_AUTH_ENABLED=false
const DEV_USER: AuthUser = {
  sub: 'dev-user',
  email: 'dev@myapp.local',
  preferred_username: 'dev',
  name: 'Dev User',
  org_id: '',
  project_id: PROJECT_ID,
  nexus_projects: [],
  role: 'admin',
}

// ── Token helpers ─────────────────────────────────────────────────────────────

function tokenExpiresInSeconds(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return (payload.exp ?? 0) - Math.floor(Date.now() / 1000)
  } catch {
    return 0
  }
}

function extractRole(profile: Record<string, unknown>): string | null {
  const projects = Array.isArray(profile.nexus_projects) ? profile.nexus_projects : []
  const matched = projects.find(
    (p: unknown) => typeof p === 'object' && p !== null && String((p as Record<string, unknown>).id) === PROJECT_ID,
  ) as Record<string, unknown> | undefined
  if (!matched) return null
  const roles = Array.isArray(matched.roles) ? matched.roles : []
  return roles.length ? String(roles[0]).toLowerCase() : null
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthCtx = createContext<AuthContextValue>({
  user: null, accessToken: null, isAuthenticated: false, isLoading: true,
  login: async () => {}, logout: async () => {}, getAccessToken: () => null,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, accessToken: null, isAuthenticated: false, isLoading: true,
  })
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Internal helpers ────────────────────────────────────────────────────────

  const _setSession = useCallback((token: string, profile: Record<string, unknown>) => {
    // Persist login_at when present (BFF injects it at login time only).
    // On subsequent calls (refresh, restore) fall back to the stored value so
    // the display survives page reloads.
    const storedMeta = (() => {
      try { return JSON.parse(sessionStorage.getItem(LOGIN_META_KEY) ?? '{}') } catch { return {} }
    })()
    const login_at = profile.login_at ? String(profile.login_at) : (storedMeta.login_at as string | undefined)
    if (profile.login_at) {
      sessionStorage.setItem(LOGIN_META_KEY, JSON.stringify({ login_at }))
    }

    const user: AuthUser = {
      sub: String(profile.sub ?? ''),
      email: String(profile.email ?? ''),
      preferred_username: String(profile.preferred_username ?? profile.email ?? ''),
      name: String(profile.name ?? ''),
      org_id: String(profile.org_id ?? ''),
      project_id: String(profile.project_id ?? ''),
      nexus_projects: Array.isArray(profile.nexus_projects) ? profile.nexus_projects as NexusProject[] : [],
      role: extractRole(profile),
      login_at,
    }
    sessionStorage.setItem(TOKEN_KEY, token)
    setState({ user, accessToken: token, isAuthenticated: true, isLoading: false })
  }, [])

  const _clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(LOGIN_META_KEY)
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false })
  }, [])

  // ── Silent background refresh (every 10 min) ──────────────────────────────

  const _startRefreshInterval = useCallback(() => {
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current)
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const res = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        const { access_token } = res.data
        if (access_token) {
          sessionStorage.setItem(TOKEN_KEY, access_token)
          setState(prev => ({ ...prev, accessToken: access_token }))
        }
      } catch {
        _clearSession()
        window.location.assign('/login')
      }
    }, 10 * 60 * 1000)
  }, [_clearSession])

  // ── Restore session on page reload ───────────────────────────────────────

  useEffect(() => {
    // Auth disabled — auto-authenticate with dev mock, skip all token flows
    if (!AUTH_ENABLED) {
      setState({ user: DEV_USER, accessToken: 'dev-token', isAuthenticated: true, isLoading: false })
      return
    }
    const stored = sessionStorage.getItem(TOKEN_KEY)
    if (!stored || tokenExpiresInSeconds(stored) < 0) {
      // Token missing or expired — try one silent refresh from cookie.
      // Skip on /login: there's no prior session to restore and the call
      // would always fail for first-time visitors.
      if (window.location.pathname === '/login') {
        setState(s => ({ ...s, isLoading: false }))
        return
      }
      axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        .then(res => {
          const { access_token } = res.data
          if (!access_token) { setState(s => ({ ...s, isLoading: false })); return }
          // Re-fetch user profile with new token
          return axios.get('/oidc/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` },
          }).then(u => { _setSession(access_token, u.data); _startRefreshInterval() })
        })
        .catch(() => setState(s => ({ ...s, isLoading: false })))
      return
    }

    // Valid stored token — restore immediately, then silently refresh user profile.
    // If userinfo fails (network/CORS), keep the session alive — don't clear a
    // valid token just because the profile fetch failed.
    setState(prev => ({ ...prev, accessToken: stored, isAuthenticated: true, isLoading: false }))
    axios.get('/oidc/v1/userinfo', { headers: { Authorization: `Bearer ${stored}` } })
      .then(res => { _setSession(stored, res.data); _startRefreshInterval() })
      .catch(() => { _startRefreshInterval() })
  }, [_setSession, _clearSession, _startRefreshInterval])

  // ── Login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await axios.post('/api/v1/auth/login', { username, password }, { withCredentials: true })
      const { access_token, user } = res.data
      _setSession(access_token, user)
      _startRefreshInterval()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      throw new Error(detail ?? 'Login failed')
    }
  }, [_setSession, _startRefreshInterval])

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await axios.post('/api/v1/auth/logout', {}, { withCredentials: true }).catch(() => {})
    _clearSession()
    window.location.assign('/login')
  }, [_clearSession])

  const getAccessToken = useCallback(() => sessionStorage.getItem(TOKEN_KEY), [])

  return (
    <AuthCtx.Provider value={{ ...state, login, logout, getAccessToken }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
```

---

## 11. Frontend — axios API layer

`src/services/api.ts` — **all** server calls go through this client (org rule: no raw
`fetch`/`axios` inside components). Handles token injection, proactive refresh,
refresh deduplication, and 401-retry.

```ts
import axios from 'axios'

const TOKEN_KEY = 'myapp_access_token'

// ── Token helpers ─────────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

function tokenExpiresInSeconds(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return (payload.exp ?? 0) - Math.floor(Date.now() / 1000)
  } catch {
    return 0
  }
}

// ── Refresh deduplication ─────────────────────────────────────────────────────
// If multiple requests fire concurrently while the token is stale, only one
// refresh call is made. The rest wait in a queue until the new token arrives.

let isRefreshing = false
let waitingQueue: Array<(token: string | null) => void> = []

function enqueueRefreshWaiter(): Promise<string | null> {
  return new Promise(resolve => { waitingQueue.push(resolve) })
}

function flushQueue(token: string | null): void {
  waitingQueue.forEach(resolve => resolve(token))
  waitingQueue = []
}

async function doRefresh(): Promise<string> {
  const res = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
  const newToken: string = res.data.access_token
  if (!newToken) throw new Error('refresh returned no access_token')
  sessionStorage.setItem(TOKEN_KEY, newToken)
  return newToken
}

async function refreshToken(): Promise<string> {
  if (isRefreshing) {
    const token = await enqueueRefreshWaiter()
    if (!token) throw new Error('Token refresh failed')
    return token
  }

  isRefreshing = true
  try {
    const token = await doRefresh()
    flushQueue(token)
    return token
  } catch (err) {
    flushQueue(null)
    sessionStorage.removeItem(TOKEN_KEY)
    window.location.assign('/login')
    throw err
  } finally {
    isRefreshing = false
  }
}

// ── Axios client ──────────────────────────────────────────────────────────────

const client = axios.create({
  baseURL: '/',
  headers: { 'Content-Type': 'application/json' },
  timeout: 600_000,
})

// Request interceptor — inject Bearer token + proactive refresh
client.interceptors.request.use(async (config) => {
  // Inject Bearer token — proactively refresh if < 60 seconds remain
  let token = getStoredToken()
  if (token) {
    if (tokenExpiresInSeconds(token) < 60) {
      try { token = await refreshToken() } catch { return config }
    }
    config.headers['Authorization'] = `Bearer ${token}`
  }

  return config
})

// Response interceptor — react to 401 with one retry after refresh
client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const newToken = await refreshToken()
        original.headers['Authorization'] = `Bearer ${newToken}`
        return client(original)
      } catch {
        return Promise.reject(err)
      }
    }

    const message: string =
      err.response?.data?.detail ?? err.response?.data?.message ?? err.message ?? 'Request failed'
    return Promise.reject(new Error(message))
  },
)

// ── API helpers (assumes the org envelope {status, status_code, message, timestamp, data}) ──

interface ApiResponse<T> {
  status: boolean
  status_code: number
  message: string
  timestamp: string
  data: T
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await client.get<ApiResponse<T>>(url, { params })
  return res.data.data
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await client.post<ApiResponse<T>>(url, body)
  return res.data.data
}

async function del<T>(url: string): Promise<T> {
  const res = await client.delete<ApiResponse<T>>(url)
  return res.data.data
}

async function upload<T>(url: string, formData: FormData): Promise<T> {
  const res = await client.post<ApiResponse<T>>(url, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data.data
}

export const api = { get, post, del, upload }
```

**Vite dev proxy** (`vite.config.ts`) — required so `/api/*` and `/oidc/*` reach the
backend during development:

```ts
export default defineConfig({
  server: {
    proxy: {
      '/api':  { target: 'http://localhost:8010', changeOrigin: true },
      '/oidc': { target: 'http://localhost:8010', changeOrigin: true },
    },
  },
})
```

---

## 12. Frontend — ProtectedRoute & app wiring

`src/components/auth/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  // Show a spinner while restoring session from storage/cookie —
  // rendering <Navigate> here would bounce returning users to /login
  // before the silent refresh has a chance to complete.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
```

`src/App.tsx` (routing skeleton):

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            {/* everything below requires authentication */}
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

---

## 13. Frontend — Login page

Minimal functional skeleton (style it per your design system; the full styled RokkaAI
version lives at `frontend/src/pages/LoginPage.tsx`):

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        id="username" type="text" value={username} autoComplete="username" autoFocus required
        onChange={e => { setUsername(e.target.value); setError(null) }}
      />
      <input
        id="password" type="password" value={password} autoComplete="current-password" required
        onChange={e => { setPassword(e.target.value); setError(null) }}
      />
      {error && <div role="alert">{error}</div>}
      <button type="submit" disabled={!canSubmit}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
```

---

## 14. Role-based access (RBAC)

Roles come from the `nexus_projects` entry matching **your** project_id — first role,
lowercased (e.g. `"Admin"` → `"admin"`).

**Backend** — `request.state.role` is set by the middleware. Guard a route:

```python
from fastapi import HTTPException, Request

ROLES_ADMIN = "admin"

@router.delete("/api/v1/resources/{resource_id}")
async def delete_resource(resource_id: str, request: Request) -> dict:
    if request.state.role != ROLES_ADMIN:
        # 404 not 403 — 403 leaks existence (security.md rule 4)
        raise HTTPException(status_code=404, detail="Not found")
    ...
```

**Frontend** — `user.role` from `useAuth()`. Render only what the role may act on
(no dead blocks for unauthorized roles):

```tsx
const { user } = useAuth()
{user?.role === 'admin' && <AdminPanel />}
```

---

## 15. Gotchas & hard-won lessons

1. **`aud="default_client"` on headless tokens.** Tokens minted via headless login carry
   `aud="default_client"` — not your client_id. Verify against **both** audiences or
   headless/API tokens will always fail with `InvalidAudienceError`.
2. **Step 2 is form-urlencoded, not JSON.** The OIDC token endpoint rejects JSON bodies.
   `Content-Type: application/x-www-form-urlencoded`, body as `k=v&k=v` string.
3. **Project-scope check is YOUR job.** authNexus happily issues tokens to any valid org
   user. Signature/aud/iss checks alone let users from *other* projects in. Always verify
   your `project_id` appears in `nexus_projects` — both in the middleware (every request)
   and at login (return 403 with a friendly "not authorized for this workspace" message
   *before* handing the token to the frontend).
4. **BFF, because CORS.** `auth.rokkalabs.com` does not send CORS headers for your origin.
   Login must be orchestrated server-side; anything the browser needs directly
   (`/oidc/v1/userinfo` on session restore) gets a proxy route.
5. **Refresh token never touches JavaScript.** HttpOnly cookie, `samesite=lax`,
   `secure` outside development, path-scoped to `/api/v1/auth/`. Access token lives in
   **sessionStorage** (tab-scoped, gone on close) — never localStorage.
6. **Deduplicate concurrent refreshes.** Ten components firing requests at once with a
   stale token must trigger exactly one refresh call — the rest wait on a queue.
   authNexus rotates refresh tokens; parallel refreshes race and invalidate each other.
7. **Middleware order (Starlette is LIFO).** `add_middleware` stacks in reverse order of
   calls. Add anything that *reads* `request.state.user` (rate limiter, audit logger)
   **before** you add `AuthMiddleware`, so auth executes first at request time.
8. **`allow_credentials=True` in CORS** — without it the browser silently drops the
   refresh cookie. Frontend must pass `withCredentials: true` on every `/api/v1/auth/*` call.
9. **Skip the restore-refresh on `/login`.** First-time visitors have no cookie; the
   refresh call always 401s and just delays paint. Check `window.location.pathname`.
10. **Don't kill a valid session on a failed userinfo fetch.** On page reload with a valid
    stored token, restore the session immediately and fetch the profile in the background.
    A transient network failure on userinfo must not log the user out.
11. **Exempt list discipline.** Prefix matches only for route families that *are* the auth
    flow; SPA shell paths and public static JSON files are **exact matches**. Every new
    exemption is a security decision — run `/security-review` when the list changes.
12. **10 s clock leeway.** Small clock skew between your server and authNexus otherwise
    causes intermittent `ImmatureSignatureError`/`ExpiredSignatureError` at token edges.
13. **`AUTH_ENABLED=false` dev mode must be symmetric.** Backend injects a mock
    `request.state.user` + `role="admin"`; frontend (`VITE_AUTH_ENABLED=false`) injects a
    matching `DEV_USER` and skips all token flows. One flag forgotten = confusing 401s.
14. **JWKS client is cached** (`lru_cache` + `cache_keys=True`) — key fetch happens once,
    not per request. If authNexus ever rotates its signing keys, restart the service (or
    drop the cache).

---

## 16. Integration checklist

Backend:

- [ ] `pip install PyJWT[crypto] httpx pydantic-settings`
- [ ] Env vars added to `.env` + `.env.example` (§3)
- [ ] `AuthNexusSettings` in the settings module (§4)
- [ ] `app/core/auth/authnexus.py` — `verify_token` + `extract_role` (§5)
- [ ] `app/middleware/auth_middleware.py` with a *minimal* exempt list (§6)
- [ ] `app/api/auth.py` BFF routes: login / refresh / logout / set-session / me (§7)
- [ ] `app/api/nexus_proxy.py` proxy routes (§8)
- [ ] Wired in `main.py`: CORS with `allow_credentials=True`, middleware order, routers (§9)
- [ ] Role guards on privileged routes — 404 not 403 (§14)

Frontend:

- [ ] `VITE_PROJECT_ID` + `VITE_AUTH_ENABLED` in `frontend/.env`
- [ ] `AuthContext.tsx` — login/logout/restore/silent-refresh (§10)
- [ ] `services/api.ts` — single axios client, all calls through it (§11)
- [ ] Vite dev proxy for `/api` + `/oidc` (§11)
- [ ] `ProtectedRoute` wrapping all authenticated routes (§12)
- [ ] Login page with loading + error states (§13)
- [ ] Role-conditional rendering (§14)

Verify:

- [ ] Login with valid credentials → lands in app, cookie set, token in sessionStorage
- [ ] Login with a user from *another* project → 403 "not authorized for this workspace"
- [ ] Wrong password → 401 "Invalid credentials"
- [ ] Page reload while logged in → session restored without re-login
- [ ] Wait past token expiry (~15 min) → requests keep working (silent refresh)
- [ ] Logout → cookie cleared, sessionStorage cleared, redirected to /login
- [ ] Hitting a protected API without a token → 401
- [ ] authNexus down → login returns 503/504 with a friendly message, not a stack trace
- [ ] `/security-review` run on the diff (touches auth + routes — mandatory)
  ![alt text](image.png)
