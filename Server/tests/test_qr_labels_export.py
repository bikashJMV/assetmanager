"""QR label PDF export, including empty-state notice PDF.

Run with: python -m pytest tests/test_qr_labels_export.py -v
"""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from core.auth import require_manage_platform_access
from core.deps import get_db
from main import app


def _mock_get_db_no_rows():
    mock_db = MagicMock()
    mock_response = MagicMock()
    mock_response.data = []
    mock_db.table().select().eq().in_().execute.return_value = mock_response
    return mock_db


@pytest.fixture
def export_client():
    app.dependency_overrides[get_db] = _mock_get_db_no_rows
    app.dependency_overrides[require_manage_platform_access] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_empty_asset_tags_returns_notice_pdf(export_client: TestClient):
    response = export_client.post("/assets/qr-labels/export", json={"asset_tags": []})
    assert response.status_code == 200
    assert "application/pdf" in (response.headers.get("content-type") or "")
    assert response.headers.get("X-Export-Empty") == "1"
    assert response.headers.get("X-Exported-Asset-Count") == "0"
    assert len(response.content) > 200
    assert response.content[:4] == b"%PDF"


def test_only_missing_tags_returns_notice_pdf(export_client: TestClient):
    response = export_client.post("/assets/qr-labels/export", json={"asset_tags": ["NO-SUCH-TAG-XYZ"]})
    assert response.status_code == 200
    assert "application/pdf" in (response.headers.get("content-type") or "")
    assert response.headers.get("X-Export-Empty") == "1"
    assert len(response.content) > 200
    assert response.content[:4] == b"%PDF"
