"""Endpoint auth matrix vs the local AMS server: public / unauthenticated / RBAC.
Bearer-token cases document the KNOWN audience gap (guide gotcha #1)."""
from __future__ import annotations

import httpx
import pytest

from conftest import bearer, requires_authnexus, requires_creds, requires_server

pytestmark = [requires_server]

# Audience gap FIXED 2026-07-18: verify_bearer_token now accepts both the web client_id
# and "default_client" (headless) audiences — the matrix below runs for real.


# ── Public endpoints — no token ───────────────────────────────────────────────

def test_health_public(api: httpx.Client) -> None:
    r = api.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "success"


def test_public_dashboard_no_token(api: httpx.Client) -> None:
    r = api.get("/api/v1/meta/public-dashboard")
    assert r.status_code == 200


# ── Missing / invalid tokens ─────────────────────────────────────────────────

@pytest.mark.parametrize("path", [
    "/api/v1/employees/me",
    "/api/v1/assets?limit=1",
    "/api/v1/employees?limit=1",
])
def test_protected_endpoints_require_token(api: httpx.Client, path: str) -> None:
    r = api.get(path)
    assert r.status_code == 401


def test_garbage_token_rejected(api: httpx.Client) -> None:
    r = api.get("/api/v1/employees/me", headers=bearer("garbage.tok.en"))
    assert r.status_code == 401
    body = r.json()
    assert body["status"] == "error"
    assert body["error"]["code"]


# ── RBAC with real tokens (xfail until the audience gap is fixed) ───────────

@requires_authnexus
@requires_creds
class TestRbacMatrix:
    def test_admin_me(self, api: httpx.Client, admin_session: dict) -> None:
        r = api.get("/api/v1/employees/me", headers=bearer(admin_session["access_token"]))
        assert r.status_code == 200

    def test_admin_can_list_assets(self, api: httpx.Client, admin_session: dict) -> None:
        r = api.get("/api/v1/assets?limit=1", headers=bearer(admin_session["access_token"]))
        assert r.status_code == 200

    def test_admin_authz_check(self, api: httpx.Client, admin_session: dict) -> None:
        r = api.get("/api/v1/authz/admin", headers=bearer(admin_session["access_token"]))
        assert r.status_code == 200

    def test_employee_me(self, api: httpx.Client, employee_session: dict) -> None:
        r = api.get("/api/v1/employees/me", headers=bearer(employee_session["access_token"]))
        assert r.status_code == 200

    def test_export_requires_privileged_role(self, api: httpx.Client, employee_session: dict) -> None:
        """Asset export is allowed for admin OR it_ops (require_privileged), blocked for plain
        employees. EMP-001 is provisioned it_ops in the DB, so it should now succeed."""
        token = employee_session["access_token"]
        role = api.get("/api/v1/authz/admin", headers=bearer(token)).json()["data"]["role"]
        r = api.get("/api/v1/assets/export.json", headers=bearer(token))
        expected = 200 if role in {"admin", "it_ops"} else 403
        assert r.status_code == expected, f"role={role} export={r.status_code}, expected {expected}"

    def test_authz_admin_reports_db_role(self, api: httpx.Client, employee_session: dict) -> None:
        """/api/v1/authz/admin is a UI-gating hint: 200 for any authenticated user, with
        {allowed, role} derived from the DB role (NOT the token claim). EMP-001 carries the
        'employee' claim in the token but is provisioned as it_ops in the employees table."""
        r = api.get("/api/v1/authz/admin", headers=bearer(employee_session["access_token"]))
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["role"] in {"employee", "admin", "it_ops"}
        assert data["allowed"] == (data["role"] in {"admin", "it_ops"})

    def test_token_roles_match_expectation(self, admin_session: dict, employee_session: dict) -> None:
        from conftest import PROJECT_ID

        def role_for(claims: dict) -> str | None:
            for p in claims.get("nexus_projects", []):
                if isinstance(p, dict) and str(p.get("id")) == PROJECT_ID:
                    roles = p.get("roles") or []
                    return roles[0].lower() if roles else None
            return None

        assert role_for(admin_session["claims"]) == "admin"
        assert role_for(employee_session["claims"]) == "employee"
