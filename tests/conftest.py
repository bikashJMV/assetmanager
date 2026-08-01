"""Shared fixtures for live auth/e2e tests (root /tests).

These tests exercise the REAL auth path from Notes/auth.implementation.md:
    authNexus /api/login  ->  BFF /api/auth/set-session (HttpOnly cookie)
    ->  BFF /api/auth/refresh (access token + rotated cookie)  ->  Bearer API calls

Credentials come from Server/.env (AUTHNEXUS_ADMIN_USER / AUTHNEXUS_ADMIN_PASSWORD) or
environment overrides — never hardcoded here.

Requires: the AMS server running locally (default http://localhost:11100) and network
access to auth.rokkalabs.com. Tests skip cleanly when either is unavailable.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import dotenv_values
except ImportError:  # pragma: no cover
    dotenv_values = None


def _env() -> dict:
    merged: dict = {}
    if dotenv_values is not None:
        for f in (REPO_ROOT / ".env", REPO_ROOT / "Server" / ".env"):
            if f.exists():
                merged.update({k: v for k, v in dotenv_values(f).items() if v})
    merged.update(os.environ)
    return merged


ENV = _env()

AUTH_BASE = (ENV.get("AUTH_AUTHORITY") or "https://auth.rokkalabs.com").rstrip("/")
ORG_ID = ENV.get("AUTHNEXUS_ORG_ID", "")
PROJECT_ID = ENV.get("AUTH_PROJECT_ID") or ENV.get("VITE_PROJECT_ID", "")
SERVER = (ENV.get("AMS_TEST_SERVER") or "http://localhost:11100").rstrip("/")

ADMIN_USER = ENV.get("AUTHNEXUS_ADMIN_USER", "")
ADMIN_PASSWORD = ENV.get("AUTHNEXUS_ADMIN_PASSWORD", "")
EMPLOYEE_USER = ENV.get("AMS_EMPLOYEE_USER", "EMP-001")
EMPLOYEE_PASSWORD = ENV.get("AMS_EMPLOYEE_PASSWORD", ADMIN_PASSWORD)

REFRESH_COOKIE = "nexus_refresh_token"


def jwt_payload(token: str) -> dict:
    """Decode a JWT payload WITHOUT verification — for claim inspection only."""
    part = token.split(".")[1]
    part += "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(part))


def _server_up() -> bool:
    try:
        return httpx.get(f"{SERVER}/api/health", timeout=5.0).status_code == 200
    except Exception:
        return False


def _authnexus_up() -> bool:
    try:
        return httpx.get(f"{AUTH_BASE}/api/v1/auth/jwks", timeout=10.0).status_code == 200
    except Exception:
        return False


requires_server = pytest.mark.skipif(not _server_up(), reason=f"AMS server not reachable at {SERVER}")
requires_authnexus = pytest.mark.skipif(not _authnexus_up(), reason="authNexus not reachable")
requires_creds = pytest.mark.skipif(
    not (ADMIN_USER and ADMIN_PASSWORD), reason="AUTHNEXUS_ADMIN_USER/PASSWORD not configured"
)


def authnexus_login(client: httpx.Client, username: str, password: str) -> httpx.Response:
    """Step 1 of the raw authNexus contract — credential login, returns refresh_token.
    authNexus rate-limits bursts of logins (429): a full suite run performs several,
    so back off and retry instead of erroring the fixture."""
    import time

    r = client.post(
        f"{AUTH_BASE}/api/login",
        json={"username": username, "password": password, "org_id": ORG_ID, "project_id": PROJECT_ID},
    )
    for delay in (20, 40):
        if r.status_code != 429:
            break
        time.sleep(delay)
        r = client.post(
            f"{AUTH_BASE}/api/login",
            json={"username": username, "password": password, "org_id": ORG_ID, "project_id": PROJECT_ID},
        )
    return r


def bff_session(client: httpx.Client, username: str, password: str) -> dict:
    """Full project login path. Returns {access_token, claims, refresh_response}."""
    r1 = authnexus_login(client, username, password)
    assert r1.status_code == 200, f"authNexus login failed for {username}: {r1.status_code}"
    refresh1 = r1.json().get("refresh_token")
    assert refresh1, f"no refresh_token from authNexus login: {list(r1.json().keys())}"

    r2 = client.post(f"{SERVER}/api/auth/set-session", json={"refresh_token": refresh1})
    assert r2.status_code == 200, f"set-session failed: {r2.status_code} {r2.text[:200]}"

    r3 = client.post(f"{SERVER}/api/auth/refresh")
    assert r3.status_code == 200, f"BFF refresh failed: {r3.status_code} {r3.text[:200]}"
    token = r3.json().get("access_token")
    assert token, "BFF refresh returned no access_token"
    return {"access_token": token, "claims": jwt_payload(token), "refresh_response": r3}


@pytest.fixture(scope="session")
def admin_session() -> dict:
    with httpx.Client(timeout=30.0) as c:
        s = bff_session(c, ADMIN_USER, ADMIN_PASSWORD)
        yield s


@pytest.fixture(scope="session")
def employee_session() -> dict:
    with httpx.Client(timeout=30.0) as c:
        s = bff_session(c, EMPLOYEE_USER, EMPLOYEE_PASSWORD)
        yield s


@pytest.fixture()
def api() -> httpx.Client:
    with httpx.Client(base_url=SERVER, timeout=30.0) as c:
        yield c


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
