"""
Unit tests for authNexus RS256 session verification (`core.auth.verify_session` /
`get_auth_user_id_from_bearer`).

Uses a generated RSA key pair and a patched `get_jwks()` — no network calls to AuthNexus,
fully offline. Mirrors the gateway: RS256, JWKS dict, `project_id` scope check.

Run with: python -m pytest tests/test_auth_local_jwt.py -v
"""
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from jose import jwt

import core.auth as auth_module
from core.auth import get_auth_user_id_from_bearer

_TEST_USER_ID = "a1b2c3d4-0000-0000-0000-000000000001"
_PROJECT_ID = auth_module.EXPECTED_PROJECT_ID

# One RSA key pair for the whole session (RS256, matching AuthNexus).
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_private_pem = _private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode()
_public_pem = (
    _private_key.public_key()
    .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    .decode()
)


def _jwks_dict() -> dict:
    from jose import jwk

    return jwk.construct(_public_pem, "RS256").to_dict()


def _mint(sub: str = _TEST_USER_ID, exp_offset: int = 300, project_id: str = _PROJECT_ID, **extra) -> str:
    """Mint an RS256 JWT signed with the test private key, mirroring AuthNexus output."""
    payload = {
        "sub": sub,
        "email": "tester@jmv.co.in",
        "project_id": project_id,
        "roles": ["employee"],
        "exp": int(time.time()) + exp_offset,
        **extra,
    }
    return jwt.encode(payload, _private_pem, algorithm="RS256")


@pytest.fixture(autouse=True)
def patch_jwks(monkeypatch):
    """Serve the test public key via get_jwks() and reset the module cache."""
    jwks = _jwks_dict()

    async def _fake_get_jwks():
        return jwks

    monkeypatch.setattr(auth_module, "get_jwks", _fake_get_jwks)
    monkeypatch.setattr(auth_module, "_jwks_cache", None, raising=False)


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()

    @app.get("/me")
    def me(user_id: str = Depends(get_auth_user_id_from_bearer)):
        return {"user_id": user_id}

    return TestClient(app, raise_server_exceptions=False)


# ── Happy path ────────────────────────────────────────────────────────────────

def test_valid_token_returns_user_id(client: TestClient):
    r = client.get("/me", headers={"Authorization": f"Bearer {_mint()}"})
    assert r.status_code == 200
    assert r.json()["user_id"] == _TEST_USER_ID


def test_valid_token_different_user_id(client: TestClient):
    other_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    r = client.get("/me", headers={"Authorization": f"Bearer {_mint(sub=other_id)}"})
    assert r.status_code == 200
    assert r.json()["user_id"] == other_id


# ── Token errors → 401 ───────────────────────────────────────────────────────

def test_expired_token_returns_401(client: TestClient):
    # Past the clock-skew leeway (AUTH_CLOCK_SKEW_SECONDS) so it is genuinely expired.
    r = client.get("/me", headers={"Authorization": f"Bearer {_mint(exp_offset=-600)}"})
    assert r.status_code == 401


def test_wrong_key_returns_401(client: TestClient, monkeypatch):
    # Sign with a different key than the JWKS serves — signature won't verify.
    wrong_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    wrong_pem = wrong_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    token = jwt.encode(
        {"sub": _TEST_USER_ID, "project_id": _PROJECT_ID, "exp": int(time.time()) + 300},
        wrong_pem,
        algorithm="RS256",
    )
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_malformed_token_returns_401(client: TestClient):
    r = client.get("/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


# ── Scope errors → 403 ───────────────────────────────────────────────────────

def test_wrong_project_id_returns_403(client: TestClient):
    r = client.get("/me", headers={"Authorization": f"Bearer {_mint(project_id='some-other-project')}"})
    assert r.status_code == 403


# ── Missing / malformed Authorization header → 401 ───────────────────────────

def test_no_authorization_header_returns_401(client: TestClient):
    r = client.get("/me")
    assert r.status_code == 401


def test_empty_bearer_returns_401(client: TestClient):
    r = client.get("/me", headers={"Authorization": "Bearer "})
    assert r.status_code == 401


def test_non_bearer_scheme_returns_401(client: TestClient):
    r = client.get("/me", headers={"Authorization": f"Basic {_mint()}"})
    assert r.status_code == 401
