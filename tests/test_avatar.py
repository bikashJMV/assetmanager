"""Live integration — profile picture (employee_avatars) round-trip via real auth.

PUT (base64) -> GET (matches) -> DELETE -> GET 404, plus 50 KB + mime guards.
Skips cleanly when server / authNexus / creds are unavailable.
"""
from __future__ import annotations

import base64

import httpx
import pytest

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]

_PNG = base64.b64encode(
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
).decode()


def _cleanup(api: httpx.Client, token: str) -> None:
    api.request("DELETE", "/api/v1/employees/me/avatar", headers=bearer(token))


def test_avatar_put_get_delete_roundtrip(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    try:
        r = api.put("/api/v1/employees/me/avatar", headers=bearer(token),
                    json={"image_base64": _PNG, "mime_type": "image/png"})
        assert r.status_code == 200, f"put failed: {r.status_code} {r.text[:200]}"

        g = api.get("/api/v1/employees/me/avatar", headers=bearer(token))
        assert g.status_code == 200
        data = g.json()["data"]
        assert data["mime_type"] == "image/png"
        assert data["image_base64"] == _PNG

        d = api.request("DELETE", "/api/v1/employees/me/avatar", headers=bearer(token))
        assert d.status_code == 200
        # No avatar is a normal empty state, not an error: 200 with data:null.
        after = api.get("/api/v1/employees/me/avatar", headers=bearer(token))
        assert after.status_code == 200
        assert after.json()["data"] is None
    finally:
        _cleanup(api, token)


def test_avatar_over_50kb_rejected(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    big = base64.b64encode(base64.b64decode(_PNG) + b"\x00" * (50 * 1024 + 1)).decode()
    r = api.put("/api/v1/employees/me/avatar", headers=bearer(token),
                json={"image_base64": big, "mime_type": "image/png"})
    assert r.status_code == 413, f"expected 413, got {r.status_code}"
    _cleanup(api, token)


def test_avatar_mime_mismatch_rejected(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    # png bytes declared as jpeg
    r = api.put("/api/v1/employees/me/avatar", headers=bearer(token),
                json={"image_base64": _PNG, "mime_type": "image/jpeg"})
    assert r.status_code == 400, f"expected 400, got {r.status_code}"
    _cleanup(api, token)


def test_avatar_requires_auth(api: httpx.Client) -> None:
    assert api.get("/api/v1/employees/me/avatar").status_code == 401
