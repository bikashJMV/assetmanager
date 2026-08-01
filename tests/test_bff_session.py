"""BFF cookie flow (Server/routers/api_auth.py): set-session -> refresh -> rotation.
Verifies the HttpOnly refresh-token design from Notes/auth.implementation.md §7 + §15.5."""
from __future__ import annotations

import httpx
import pytest

from conftest import (
    ADMIN_PASSWORD,
    ADMIN_USER,
    PROJECT_ID,
    REFRESH_COOKIE,
    SERVER,
    authnexus_login,
    jwt_payload,
    requires_authnexus,
    requires_creds,
    requires_server,
)

pytestmark = [requires_server, requires_authnexus, requires_creds]


@pytest.fixture(scope="module")
def session_client() -> httpx.Client:
    with httpx.Client(timeout=30.0) as c:
        r1 = authnexus_login(c, ADMIN_USER, ADMIN_PASSWORD)
        assert r1.status_code == 200
        c._step1_refresh = r1.json()["refresh_token"]  # type: ignore[attr-defined]
        yield c


def _local_refresh_cookies(c: httpx.Client) -> list:
    return [ck for ck in c.cookies.jar
            if ck.name == REFRESH_COOKIE and "rokkalabs" not in (ck.domain or "")]


def test_set_session_plants_httponly_cookie(session_client: httpx.Client) -> None:
    r = session_client.post(f"{SERVER}/api/auth/set-session",
                            json={"refresh_token": session_client._step1_refresh})  # type: ignore[attr-defined]
    assert r.status_code == 200
    assert _local_refresh_cookies(session_client), "nexus_refresh_token cookie must be set by BFF"
    set_cookie = r.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower(), "refresh cookie must be HttpOnly"


def test_set_session_empty_token_rejected() -> None:
    with httpx.Client(timeout=10.0) as c:
        r = c.post(f"{SERVER}/api/auth/set-session", json={"refresh_token": "   "})
    assert r.status_code == 400


def test_refresh_returns_access_token_and_rotates_cookie(session_client: httpx.Client) -> None:
    r = session_client.post(f"{SERVER}/api/auth/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body.get("access_token"), "refresh must return access_token"
    assert body.get("expires_in"), "refresh must return expires_in"
    assert REFRESH_COOKIE in r.cookies, "refresh must rotate the HttpOnly cookie"

    claims = jwt_payload(body["access_token"])
    ids = [str(p.get("id")) for p in claims.get("nexus_projects", []) if isinstance(p, dict)]
    assert PROJECT_ID in ids, "access token must be scoped to this project"


def test_refresh_body_must_not_leak_refresh_token(session_client: httpx.Client) -> None:
    """KNOWN BUG (found 2026-07-18): api_auth.py only pops refresh_token from the JSON
    body when authNexus did NOT also send a rotated cookie. authNexus sends BOTH, so the
    rotated refresh token reaches browser-readable JS — defeating the HttpOnly design.
    Fix: always data.pop('refresh_token', None) regardless of the cookie branch."""
    r = session_client.post(f"{SERVER}/api/auth/refresh")
    assert r.status_code == 200
    assert "refresh_token" not in r.json(), (
        "SECURITY: rotated refresh token leaked in JSON body (api_auth.py:133-136)"
    )


def test_second_refresh_after_rotation_works(session_client: httpx.Client) -> None:
    """Rotation chain: refresh with the ROTATED cookie must succeed again."""
    r = session_client.post(f"{SERVER}/api/auth/refresh")
    assert r.status_code == 200
    assert r.json().get("access_token")


def test_refresh_without_cookie_is_401() -> None:
    with httpx.Client(timeout=10.0) as c:
        r = c.post(f"{SERVER}/api/auth/refresh")
    assert r.status_code == 401


def test_refresh_cookie_flags_secure_and_max_age(session_client: httpx.Client) -> None:
    """KNOWN GAP: cookie is set without Secure and without Max-Age (api_auth.py:35-41,
    148-155). Session-only cookie dies on browser close; works over plain HTTP."""
    r = session_client.post(f"{SERVER}/api/auth/refresh")
    set_cookie = r.headers.get("set-cookie", "").lower()
    assert "max-age" in set_cookie or "expires" in set_cookie, (
        "refresh cookie should carry Max-Age (guide §7 uses 7 days)"
    )
