"""Live — department-follows-holder audit (13b) + warranty-notification scoping (10).

13b: assigning an asset records the holder's department; updating a held employee's department
     cascades to their assets' audit trail.
10:  warranty-notifications is now authenticated (not privileged-only); admin/it_ops see all,
     a plain employee is scoped to held assets (scoping asserted structurally — the available
     non-admin fixture is it_ops, which by design sees all).
"""
from __future__ import annotations

import uuid

import httpx
import pytest

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server, requires_authnexus, requires_creds]

_WARR = "/api/v1/meta/warranty-notifications"


def _employees(api: httpx.Client, token: str) -> list[dict]:
    r = api.get("/api/v1/employees?page=1&limit=50", headers=bearer(token))
    assert r.status_code == 200, r.text[:200]
    data = r.json()["data"]
    return data["items"] if isinstance(data, dict) else data


def test_department_cascade_logged_on_asset(api: httpx.Client, admin_session: dict) -> None:
    token = admin_session["access_token"]

    # Strictly the dummy user for any assign/return — never a real employee.
    emp = next((e for e in _employees(api, token) if e.get("employee_id") == "owWorkAdmin"), None)
    if emp is None:
        pytest.skip("owWorkAdmin (assign/return test user) not available")

    # create an asset and assign it to the dummy user
    cr = api.post(
        "/api/v1/assets",
        headers=bearer(token),
        json={"category_slug": "laptop", "serial_number": f"SN-{uuid.uuid4().hex[:10]}"},
    )
    assert cr.status_code == 201, cr.text[:200]
    asset_tag = cr.json()["data"]["asset_tag"]

    asg = api.post(
        "/api/v1/assignments/assign",
        headers=bearer(token),
        json={"asset_tag": asset_tag, "employee_id": emp["employee_id"]},
    )
    assert asg.status_code == 200, asg.text[:200]

    original_department = emp.get("department")
    new_department = f"Audit QA {uuid.uuid4().hex[:6]}"
    try:
        upd = api.put(
            f"/api/v1/employees/{emp['id']}",
            headers=bearer(token),
            json={
                "employee_id": emp["employee_id"],
                "name": emp.get("name") or "Employee",
                "email": emp.get("email"),
                "department": new_department,
                "role": emp.get("role") or "employee",
                "is_active": emp.get("is_active", True),
            },
        )
        assert upd.status_code == 200, upd.text[:200]

        logs = api.get(f"/api/v1/assets/{asset_tag}/logs", headers=bearer(token))
        assert logs.status_code == 200, logs.text[:200]
        notes = " ".join(str(row.get("note") or "") for row in logs.json()["data"])
        assert "Department changed" in notes, notes[:300]
        assert new_department in notes, notes[:300]
    finally:
        # revert department
        api.put(
            f"/api/v1/employees/{emp['id']}",
            headers=bearer(token),
            json={
                "employee_id": emp["employee_id"],
                "name": emp.get("name") or "Employee",
                "email": emp.get("email"),
                "department": original_department,
                "role": emp.get("role") or "employee",
                "is_active": emp.get("is_active", True),
            },
        )


def test_warranty_requires_auth(api: httpx.Client) -> None:
    assert api.get(_WARR).status_code == 401


def test_warranty_admin_sees_list(api: httpx.Client, admin_session: dict) -> None:
    r = api.get(_WARR, headers=bearer(admin_session["access_token"]))
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json()["data"], list)


def test_warranty_accessible_to_non_admin(api: httpx.Client, employee_session: dict) -> None:
    # Previously privileged-only (would 403). Now any authenticated user gets a (scoped) list.
    r = api.get(_WARR, headers=bearer(employee_session["access_token"]))
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json()["data"], list)
