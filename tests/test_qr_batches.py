"""Regression test for BUG-1 (Notes/ui-and-bugfix-plan.md): GET /api/v1/qr/batches returned
500 "relation qr_batches does not exist" — the qr_batches/qr_tag_reservations tables were
queried by the app but never captured in the schema (DB/init.sql). Fixed 2026-07-18 by adding
the DDL to init.sql and applying it live. These tests prove the endpoints work end-to-end."""
from __future__ import annotations

import uuid

import httpx
import pytest

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]


def test_list_qr_batches_returns_200_not_500(api: httpx.Client, admin_session: dict) -> None:
    r = api.get("/api/v1/qr/batches?page=1&limit=50", headers=bearer(admin_session["access_token"]))
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert body["status"] == "success"
    assert "items" in body["data"]
    assert "total" in body["data"]


def test_create_qr_batch_persists_batch_and_reservations(api: httpx.Client, admin_session: dict) -> None:
    idem_key = f"pytest-{uuid.uuid4()}"
    r = api.post(
        "/api/v1/qr/batches",
        headers={**bearer(admin_session["access_token"]), "Idempotency-Key": idem_key},
        json={"count": 2},
    )
    assert r.status_code == 201, f"create failed: {r.status_code} {r.text[:300]}"
    data = r.json()["data"]
    assert data["idempotency_key"] == idem_key
    assert data["requested_count"] == 2
    assert len(data["reservations"]) == 2
    assert all(res["status"] == "reserved" for res in data["reservations"])

    # list reflects the new batch
    listed = api.get("/api/v1/qr/batches?page=1&limit=50", headers=bearer(admin_session["access_token"]))
    assert listed.status_code == 200
    batch_ids = [b["id"] for b in listed.json()["data"]["items"]]
    assert data["id"] in batch_ids


def test_create_qr_batch_idempotent_on_repeat_key(api: httpx.Client, admin_session: dict) -> None:
    idem_key = f"pytest-idem-{uuid.uuid4()}"
    headers = {**bearer(admin_session["access_token"]), "Idempotency-Key": idem_key}
    r1 = api.post("/api/v1/qr/batches", headers=headers, json={"count": 1})
    r2 = api.post("/api/v1/qr/batches", headers=headers, json={"count": 1})
    assert r1.status_code == 201
    assert r2.status_code in (200, 201)
    assert r1.json()["data"]["id"] == r2.json()["data"]["id"], "same idempotency key must return the same batch"


def test_list_qr_batches_requires_auth(api: httpx.Client) -> None:
    r = api.get("/api/v1/qr/batches?page=1&limit=50")
    assert r.status_code == 401
