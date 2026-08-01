"""Live — JMV-{ALIAS}-##### asset tag nomenclature (replaces global AST-#####).

- Direct create is per-category: laptop -> JMV-LAP-#####, desktop -> JMV-DES-#####.
- Sequence is per-category and monotonic; an all-zero sequence is impossible.
- A manually supplied all-zero tag is rejected.
- /next-tag previews without consuming. QR batches use the generic JMV-GEN-##### pool.
"""
from __future__ import annotations

import re
import uuid

import httpx

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]


def _create(api: httpx.Client, token: str, slug: str, **extra) -> httpx.Response:
    body = {"category_slug": slug, "serial_number": f"SN-{uuid.uuid4().hex[:10]}", **extra}
    return api.post("/api/v1/assets", headers=bearer(token), json=body)


def test_laptop_tag_is_jmv_lap(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    r = _create(api, token, "laptop")
    assert r.status_code == 201, r.text[:200]
    tag = r.json()["data"]["asset_tag"]
    assert re.fullmatch(r"JMV-LAP-\d{5}", tag), tag
    assert not tag.endswith("-00000")


def test_per_category_sequences_are_independent_and_monotonic(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    lap1 = _create(api, token, "laptop").json()["data"]["asset_tag"]
    lap2 = _create(api, token, "laptop").json()["data"]["asset_tag"]
    des1 = _create(api, token, "desktop").json()["data"]["asset_tag"]
    assert re.fullmatch(r"JMV-LAP-\d{5}", lap1) and re.fullmatch(r"JMV-LAP-\d{5}", lap2)
    assert re.fullmatch(r"JMV-DES-\d{5}", des1)
    assert int(lap2.split("-")[-1]) == int(lap1.split("-")[-1]) + 1


def test_manual_all_zero_tag_rejected(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    r = _create(api, token, "laptop", asset_tag="JMV-LAP-00000")
    assert r.status_code == 400, r.text[:200]


def test_next_tag_preview_does_not_consume(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    a = api.get("/api/v1/assets/next-tag?category_slug=laptop", headers=bearer(token))
    b = api.get("/api/v1/assets/next-tag?category_slug=laptop", headers=bearer(token))
    assert a.status_code == 200 and b.status_code == 200, (a.text[:150], b.text[:150])
    ta, tb = a.json()["data"], b.json()["data"]
    assert re.fullmatch(r"JMV-LAP-\d{5}", ta), ta
    assert ta == tb  # preview must not increment the counter


def test_qr_batch_uses_generic_pool(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]
    r = api.post(
        "/api/v1/qr/batches",
        headers={**bearer(token), "Idempotency-Key": f"pytest-tag-{uuid.uuid4()}"},
        json={"count": 2},
    )
    assert r.status_code == 201, r.text[:200]
    tags = [res["asset_tag"] for res in r.json()["data"]["reservations"]]
    assert all(re.fullmatch(r"JMV-GEN-\d{5}", t) for t in tags), tags
