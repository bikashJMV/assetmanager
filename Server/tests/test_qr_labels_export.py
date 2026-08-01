"""QR label PDF export, including empty-state notice PDF.

Run with: python -m pytest tests/test_qr_labels_export.py -v
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from core.authnexus import EmployeeContext
from core.authz import require_privileged
from main import app


@pytest.fixture
def export_client():
    admin = EmployeeContext(
        id="00000000-0000-0000-0000-000000000001",
        employee_id="TEST-ADMIN",
        name="Test Admin",
        department=None,
        role="admin",
        sub="test-sub",
        is_active=True,
    )
    app.dependency_overrides[require_privileged] = lambda: admin
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_empty_asset_tags_returns_notice_pdf(export_client: TestClient):
    response = export_client.post("/api/v1/assets/qr-labels/export", json={"asset_tags": []})
    assert response.status_code == 200
    assert "application/pdf" in (response.headers.get("content-type") or "")
    assert response.headers.get("X-Export-Empty") == "1"
    assert response.headers.get("X-Exported-Asset-Count") == "0"
    assert len(response.content) > 200
    assert response.content[:4] == b"%PDF"


@patch(
    "routers.api_v1_assets.AssetRepository.list_existing_asset_tags_in_order",
    new_callable=AsyncMock,
    return_value=[],
)
def test_only_missing_tags_returns_notice_pdf(_mock_list: AsyncMock, export_client: TestClient):
    response = export_client.post(
        "/api/v1/assets/qr-labels/export",
        json={"asset_tags": ["NO-SUCH-TAG-XYZ"]},
    )
    assert response.status_code == 200
    assert "application/pdf" in (response.headers.get("content-type") or "")
    assert response.headers.get("X-Export-Empty") == "1"
    assert len(response.content) > 200
    assert response.content[:4] == b"%PDF"
