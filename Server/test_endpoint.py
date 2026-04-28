from fastapi.testclient import TestClient
from main import app
from unittest.mock import patch, MagicMock

# Create a test client
client = TestClient(app)



def mock_resolve_role():
    return "admin"

app.dependency_overrides.update({
    # We also have require_backend_api_key that we should bypass
    # We can just set settings.BACKEND_API_KEY="" but it's easier to mock
})

import core.auth

app.dependency_overrides[core.auth._resolve_request_role] = mock_resolve_role
app.dependency_overrides[core.auth.require_backend_api_key] = lambda: None

response = client.post("/assets/qr-labels/export", json={"asset_tags": ["TAG1"]})
print("STATUS CODE:", response.status_code)
print("HEADERS:", response.headers)
if response.status_code != 200:
    print("BODY:", response.text)
