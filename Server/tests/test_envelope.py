"""Contract tests for the API response envelope.

Run with:  python -m pytest tests/test_envelope.py -v
"""
from fastapi.testclient import TestClient

from main import app
from schemas.envelope import error_envelope, success_envelope


# ───────── Unit tests for envelope builders ─────────


class TestSuccessEnvelope:
    def test_single_object(self):
        env = success_envelope({"id": 1}, request_id="r1")
        assert env["status_code"] == 200
        assert env["status"] is True
        assert env["data"] == {"id": 1}
        assert env["meta"]["count"] == 1
        assert env["meta"]["request_id"] == "r1"
        assert "error" not in env

    def test_list_data(self):
        env = success_envelope([1, 2, 3], request_id="r2")
        assert env["meta"]["count"] == 3
        assert env["data"] == [1, 2, 3]

    def test_empty_list(self):
        env = success_envelope([], request_id="r3")
        assert env["meta"]["count"] == 0
        assert env["data"] == []

    def test_none_data(self):
        env = success_envelope(None, request_id="r4")
        assert env["meta"]["count"] == 0

    def test_custom_status_code(self):
        env = success_envelope({}, status_code=201, request_id="r5")
        assert env["status_code"] == 201

    def test_pagination_fields(self):
        env = success_envelope(
            [1],
            total=100,
            page=2,
            page_size=10,
            request_id="r6",
        )
        assert env["meta"]["total"] == 100
        assert env["meta"]["page"] == 2
        assert env["meta"]["page_size"] == 10

    def test_timestamp_present(self):
        env = success_envelope({}, request_id="r7")
        assert "timestamp" in env["meta"]
        assert isinstance(env["meta"]["timestamp"], str)


class TestErrorEnvelope:
    def test_basic_error(self):
        env = error_envelope(
            status_code=400,
            message="Bad request",
            error_code="BAD_REQUEST",
            request_id="e1",
        )
        assert env["status_code"] == 400
        assert env["status"] is False
        assert env["message"] == "Bad request"
        assert env["error"]["code"] == "BAD_REQUEST"
        assert env["error"]["detail"] == "Bad request"
        assert env["meta"]["count"] == 0

    def test_custom_detail(self):
        env = error_envelope(
            status_code=404,
            message="Not found",
            detail="Asset ABC not found in inventory.",
            error_code="NOT_FOUND",
            request_id="e2",
        )
        assert env["error"]["detail"] == "Asset ABC not found in inventory."

    def test_data_is_none(self):
        env = error_envelope(
            status_code=500,
            message="boom",
            request_id="e3",
        )
        assert env.get("data") is None


# ───────── Integration tests via TestClient ─────────

client = TestClient(app)


class TestV1Unchanged:
    """v1 routes must return raw (non-enveloped) JSON."""

    def test_root_raw(self):
        r = client.get("/")
        body = r.json()
        assert "status_code" not in body
        assert "meta" not in body
        assert body["message"] == "AMS API is running"

    def test_health_raw(self):
        # /api/health returns its own envelope (via success_response/error_response).
        # Under TestClient the pg pool is not connected, so status may be 200 or 503;
        # either way the envelope contract holds.
        r = client.get("/api/health")
        body = r.json()
        assert body["status_code"] in (200, 503)
        assert set(("status", "status_code", "message", "data")) <= body.keys()


class TestV2Envelope:
    """v2 prefix must wrap responses in the standard envelope."""

    def test_root_enveloped(self):
        r = client.get("/v2/")
        body = r.json()
        assert body["status_code"] == 200
        assert body["status"] is True
        assert body["meta"]["count"] == 1
        assert body["data"]["message"] == "AMS API is running"

    def test_health_enveloped(self):
        # /v2 wraps the (already-enveloped) /api/health payload in the outer envelope.
        # DB state is irrelevant here — assert the outer wrapping contract.
        r = client.get("/v2/api/health")
        body = r.json()
        assert body["status_code"] == r.status_code
        assert "meta" in body and body["meta"]["request_id"]
        # data carries the inner /api/health envelope
        assert isinstance(body["data"], dict) and "status_code" in body["data"]


class TestHeaderOptIn:
    """X-Response-Envelope header triggers wrapping on v1 paths."""

    def test_header_envelope(self):
        r = client.get("/", headers={"X-Response-Envelope": "true"})
        body = r.json()
        assert body["status_code"] == 200
        assert body["meta"]["request_id"]

    def test_header_false_no_envelope(self):
        r = client.get("/", headers={"X-Response-Envelope": "false"})
        body = r.json()
        assert "status_code" not in body


class TestErrorEnvelopeIntegration:
    """Errors on v2 routes return the error envelope shape."""

    def test_401_envelope(self):
        r = client.get("/v2/api/v1/assets")
        assert r.status_code == 401
        body = r.json()
        assert body["status"] is False
        assert body["error"]["code"] == "UNAUTHORIZED"
        assert body["meta"]["count"] == 0

    def test_404_envelope(self):
        r = client.get("/v2/health/nonexistent")
        assert r.status_code == 404
        body = r.json()
        assert body["status"] is False
        assert body["error"]["code"] == "NOT_FOUND"


class TestRequestIdPropagation:
    """request_id flows through middleware into envelope and response header."""

    def test_auto_generated(self):
        r = client.get("/v2/")
        body = r.json()
        assert body["meta"]["request_id"]
        assert r.headers.get("x-request-id") == body["meta"]["request_id"]

    def test_client_provided(self):
        r = client.get("/v2/", headers={"X-Request-Id": "my-trace-id"})
        body = r.json()
        assert body["meta"]["request_id"] == "my-trace-id"
        assert r.headers.get("x-request-id") == "my-trace-id"
