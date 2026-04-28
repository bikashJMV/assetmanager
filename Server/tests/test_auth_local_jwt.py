"""
Unit tests for local JWT verification in get_auth_user_id_from_bearer.

Uses a generated RSA key pair — no network calls to AuthNexus.
The JWKS client is patched at module level so tests are fully offline.

Run with: python -m pytest tests/test_auth_local_jwt.py -v
"""
import time
from unittest.mock import MagicMock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

import core.auth as auth_module
from core.auth import get_auth_user_id_from_bearer

_TEST_USER_ID = "a1b2c3d4-0000-0000-0000-000000000001"

# Generate an EC P-256 key pair once for the entire test session (matches AuthNexus ES256).
_private_key = generate_private_key(SECP256R1())
_public_key = _private_key.public_key()
_ALGORITHM = "ES256"


def _mint(sub: str = _TEST_USER_ID, exp_offset: int = 300, **extra) -> str:
    """Mint an ES256 JWT signed with the test private key, mirroring AuthNexus output."""
    payload = {
        "sub": sub,
        "aud": "authenticated",
        "exp": int(time.time()) + exp_offset,
        "role": "authenticated",
        **extra,
    }
    return jwt.encode(payload, _private_key, algorithm=_ALGORITHM)


@pytest.fixture(autouse=True)
def patch_jwks_client(monkeypatch):
    """Replace the module-level JWKS client with one that returns the test public key."""
    mock_signing_key = MagicMock()
    mock_signing_key.key = _public_key
    mock_signing_key.algorithm_name = _ALGORITHM
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    monkeypatch.setattr(auth_module, "_jwks_client", mock_client)


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()

    @app.get("/me")
    def me(user_id: str = Depends(get_auth_user_id_from_bearer)):
        return {"user_id": user_id}

    return TestClient(app, raise_server_exceptions=False)


# ── Happy path ────────────────────────────────────────────────────────────────

def test_valid_token_returns_user_id(client: TestClient):
    token = _mint()
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["user_id"] == _TEST_USER_ID


def test_valid_token_different_user_id(client: TestClient):
    other_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    token = _mint(sub=other_id)
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["user_id"] == other_id


# ── Token errors → 401 ───────────────────────────────────────────────────────

def test_expired_token_returns_401(client: TestClient):
    token = _mint(exp_offset=-10)
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_wrong_key_returns_401(client: TestClient, monkeypatch):
    wrong_key = generate_private_key(SECP256R1())
    # Patch JWKS to return the wrong public key — signature won't match
    mock_signing_key = MagicMock()
    mock_signing_key.key = wrong_key.public_key()
    mock_client = MagicMock()
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    monkeypatch.setattr(auth_module, "_jwks_client", mock_client)

    token = _mint()
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_malformed_token_returns_401(client: TestClient):
    r = client.get("/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


def test_missing_sub_claim_returns_401(client: TestClient):
    token = jwt.encode(
        {"aud": "authenticated", "exp": int(time.time()) + 300},
        _private_key,
        algorithm=_ALGORITHM,
    )
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_missing_exp_claim_returns_401(client: TestClient):
    token = jwt.encode(
        {"sub": _TEST_USER_ID, "aud": "authenticated"},
        _private_key,
        algorithm=_ALGORITHM,
    )
    r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


# ── Missing / malformed Authorization header → 401 ───────────────────────────

def test_no_authorization_header_returns_401(client: TestClient):
    r = client.get("/me")
    assert r.status_code == 401


def test_empty_bearer_returns_401(client: TestClient):
    r = client.get("/me", headers={"Authorization": "Bearer "})
    assert r.status_code == 401


def test_non_bearer_scheme_returns_401(client: TestClient):
    token = _mint()
    r = client.get("/me", headers={"Authorization": f"Basic {token}"})
    assert r.status_code == 401
