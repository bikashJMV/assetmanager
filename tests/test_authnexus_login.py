"""Step 1 of the authNexus contract (Notes/auth.implementation.md §1-2):
credential login against auth.rokkalabs.com."""
from __future__ import annotations

import httpx
import pytest

from conftest import (
    ADMIN_PASSWORD,
    ADMIN_USER,
    EMPLOYEE_PASSWORD,
    EMPLOYEE_USER,
    PROJECT_ID,
    authnexus_login,
    requires_authnexus,
    requires_creds,
)

pytestmark = [requires_authnexus, requires_creds]


@pytest.mark.parametrize(
    "username,password",
    [(ADMIN_USER, ADMIN_PASSWORD), (EMPLOYEE_USER, EMPLOYEE_PASSWORD)],
    ids=["admin", "employee"],
)
def test_valid_credentials_return_refresh_token(username: str, password: str) -> None:
    with httpx.Client(timeout=30.0) as c:
        r = authnexus_login(c, username, password)
    assert r.status_code == 200
    assert r.json().get("refresh_token"), "login response must include refresh_token"


def test_wrong_password_rejected() -> None:
    with httpx.Client(timeout=30.0) as c:
        r = authnexus_login(c, ADMIN_USER, "definitely-wrong-password-42")
    assert r.status_code in (400, 401, 403), f"wrong password must not succeed, got {r.status_code}"


def test_project_id_configured() -> None:
    assert PROJECT_ID, "AUTH_PROJECT_ID must be set — project-scope check is OUR job (guide gotcha #3)"
