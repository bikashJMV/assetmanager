"""Live — unused QR (generated but never linked) list/count lifecycle.

Create batch(2) -> both appear in /unused, count +2 -> create an asset consuming one
-> count -1, that tag gone, the other still listed.
"""
from __future__ import annotations

import uuid

import httpx
import pytest

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]

_UNUSED = "/api/v1/qr/reservations/unused"
_COUNT = "/api/v1/qr/reservations/unused/count"
_PDF = "/api/v1/qr/reservations/unused/pdf"


def _count(api: httpx.Client, token: str) -> int:
    return api.get(_COUNT, headers=bearer(token)).json()["data"]["count"]


def _unused_tags(api: httpx.Client, token: str) -> set[str]:
    r = api.get(f"{_UNUSED}?page=1&limit=200", headers=bearer(token))
    assert r.status_code == 200, r.text[:200]
    return {i["asset_tag"] for i in r.json()["data"]["items"]}


def test_unused_qr_lifecycle(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    c0 = _count(api, token)

    # create a batch of 2
    r = api.post(
        "/api/v1/qr/batches",
        headers={**bearer(token), "Idempotency-Key": f"pytest-unused-{uuid.uuid4()}"},
        json={"count": 2},
    )
    assert r.status_code == 201, r.text[:200]
    reservations = r.json()["data"]["reservations"]
    assert len(reservations) == 2
    tag0, tag1 = reservations[0]["asset_tag"], reservations[1]["asset_tag"]
    rid0 = reservations[0]["id"]

    # count +2 and both tags listed with the expected shape
    assert _count(api, token) == c0 + 2
    listed = api.get(f"{_UNUSED}?page=1&limit=200", headers=bearer(token)).json()["data"]["items"]
    by_tag = {i["asset_tag"]: i for i in listed}
    assert tag0 in by_tag and tag1 in by_tag
    for key in ("reservation_id", "batch_code", "reserved_at", "batch_created_at"):
        assert key in by_tag[tag0]

    # consume one by creating an asset against its reservation
    cr = api.post(
        "/api/v1/assets",
        headers=bearer(token),
        json={"qr_reservation_id": rid0, "category_slug": "laptop", "serial_number": f"SN-{uuid.uuid4().hex[:8]}"},
    )
    assert cr.status_code == 201, f"create failed: {cr.status_code} {cr.text[:200]}"

    # count -1; tag0 gone from unused; tag1 still there
    assert _count(api, token) == c0 + 1
    remaining = _unused_tags(api, token)
    assert tag0 not in remaining
    assert tag1 in remaining


def test_unused_list_shape(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    body = api.get(f"{_UNUSED}?page=1&limit=5", headers=bearer(token)).json()["data"]
    for key in ("items", "page", "limit", "count", "total"):
        assert key in body


def test_unused_pdf_single_click(api: httpx.Client, admin_session: dict) -> None:
    """One request returns a printable PDF of all unused QRs (or an empty-notice PDF)."""
    token = admin_session["access_token"]

    # ensure at least one unused QR exists
    api.post(
        "/api/v1/qr/batches",
        headers={**bearer(token), "Idempotency-Key": f"pytest-unused-pdf-{uuid.uuid4()}"},
        json={"count": 1},
    )

    r = api.get(_PDF, headers=bearer(token))
    assert r.status_code == 200, r.text[:200]
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
    assert int(r.headers.get("x-exported-asset-count", "0")) >= 1


def test_unused_pdf_requires_auth(api: httpx.Client) -> None:
    assert api.get(_PDF).status_code == 401
