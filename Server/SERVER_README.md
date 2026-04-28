# AMS Server

FastAPI application for the Asset Manager System (AMS). The object factory is in `main.py` (`app = create_app()`); `app.py` re-exports `from main import app` for compatibility.

The API version used by the React client is **`/api/v1/*`**, plus **`GET /api/health`**, and **`/observability/*`** (not under `/api/v1`).

## What this service does

- Serves versioned JSON APIs under FastAPI routers in `routers/`.
- Uses **asyncpg** with a process-wide pool: `init_pg_pool()` / `close_pg_pool()` in `core/postgres.py`, invoked from `main.py` startup/shutdown events. Repositories use `repositories.db.pool()`.
- When **`AUTH_ENABLED=true`** (see `core/settings.py`), the **`AuthMiddleware`** stack resolves JWTs (JWKS) and attaches an employee context (`core/authnexus.py`, `core/authz.py`).
- Request IDs and timing: **`RequestIdMiddleware`** and **`EnvelopeMiddleware`** in `core/middleware.py` (`EnvelopeMiddleware` only wraps certain legacy `/v2` paths or `X-Response-Envelope: true` — it does not alter normal `/api/v1/*` JSON).
- **Observability:** `GET /observability/logs` proxies to Loki using `httpx` (`routers/observability.py`); access is restricted by `require_it_ops_access` in `core/auth.py` (role `it_ops` required).
- **Email:** optional fire-and-forget calls to an external service via `services/notifications/` when `NOTIFICATIONS_ENABLED` and related env vars are set.
- **Prometheus:** if `OTEL_GRAFANA_ENABLED=true`, `main.py` registers `prometheus_fastapi_instrumentator` with **`/metrics`**.

## Entry points

- `main.py` — `create_app()`, middleware order, router includes, CORS, exception handlers, Prometheus gate
- `app.py` — re-exports `main.app`
- Uvicorn: `uvicorn main:app` (or `app:app` via `app.py`)

## Project map

| Path | Role |
| --- | --- |
| `core/settings.py` | `Settings` dataclass, env loading, `load_dotenv`, validation in `__post_init__` |
| `core/postgres.py` | DSN from `DATABASE_URL` or `POSTGRES_*`, asyncpg pool |
| `core/middleware.py` | `RequestIdMiddleware`, `EnvelopeMiddleware` |
| `core/auth_middleware.py`, `core/auth.py`, `core/authnexus.py`, `core/authz.py` | JWT, API key, role dependencies |
| `core/api_response.py` | `success_response` / `error_response` dict helpers (envelope fields: `status`, `status_code`, `message`, `timestamp`, `data`, optional `error.code` / `error.details`) |
| `core/errors.py` | HTTP and generic exception handlers |
| `routers/` | HTTP API modules (see table below) |
| `schemas/` | Pydantic models: e.g. `asset.py`, `asset_admin.py`, `assignment.py`, `employee.py`, `envelope.py`, `log.py`, `analysis.py` |
| `repositories/` | Async SQL: `db.py` (pool helper, pagination `DEFAULT_PAGE`/`MAX_LIMIT`/`normalize_page_params`), `asset_repository.py`, `asset_write_repository.py`, `asset_detail_repository.py`, `assignment_repository.py`, `assignment_write_repository.py`, `employee_repository.py`, `meta_repository.py`, `audit_repository.py`, `recycle_bin_repository.py`, `errors.py` |
| `services/` | `asset_service.py`, `assignment_service.py`, `audit_service.py`, `qr_service.py`, `qr_label_pdf_service.py`, `hooks.py`, `services/notifications/` — see `services/README.md` |
| `db/` | Optional one-off SQL (not a full migration runner) |
| `scripts/` | `import_v2_from_sheet.py`, `pg_seed_dummy.py`, `smoke_api_v1_assignments.py` |
| `tests/` | `test_asset_db_types.py`, `test_auth_local_jwt.py`, `test_envelope.py`, `test_qr_labels_export.py` |

## Registered routers and prefixes

Routers are included in `main.py` (order matters for middle stack only; all paths are unique).

| Module file | URL prefix (first segment(s)) | Tags in OpenAPI (from file) |
| --- | --- | --- |
| `routers/health.py` | **`/api/health`** | System |
| `routers/api_v1_assets.py` | **`/api/v1/assets`** | Assets (v1) |
| `routers/api_v1_recycle_bin.py` | **`/api/v1/recycle-bin`** | Recycle Bin (v1) |
| `routers/api_v1_employees.py` | **`/api/v1/employees`** | Employees (v1) |
| `routers/api_v1_assignments.py` | **`/api/v1/assignments`** | Assignments (v1) |
| `routers/api_v1_meta.py` | **`/api/v1/meta`** | Meta (v1) |
| `routers/api_v1_authz.py` | **`/api/v1/authz`** | AuthZ (v1) |
| `routers/observability.py` | **`GET /observability/logs`** (router `prefix="/observability/logs"`, `""` path) | Observability |
| `main.py` (inline) | **`GET /`** — JSON `{"message","env"}`; **`GET /metrics`** — only if `OTEL_GRAFANA_ENABLED` | System |

`routers/observability.py` registers only **`GET /observability/logs`** (see table row above).

**OpenAPI** is the authoritative list: `http://localhost:8000/docs` and `http://localhost:8000/redoc` after the server starts.

## Environment variables

Create `Server/.env` starting from `Server/.env.example`. Values are read in `core/settings.py`.

### Database

Use either:

- **`DATABASE_URL`** (non-empty), or  
- **`POSTGRES_HOST`**, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

If `DATABASE_URL` is empty, `__post_init__` requires the individual `POSTGRES_*` fields to be present.

Optional pool tuning: `POSTGRES_MIN_POOL_SIZE`, `POSTGRES_MAX_POOL_SIZE`, `POSTGRES_COMMAND_TIMEOUT_SECONDS`.

### Auth (JWT / authNexus)

- `AUTH_ENABLED` — default `false` from env
- When `true`, **`AUTH_JWKS_URL`** and **`AUTH_PROJECT_ID`** are required (raises `ValueError` at import time if missing)
- Optional: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_PROJECT_ID_CLAIM` (default `project_id`), `AUTH_CLOCK_SKEW_SECONDS`
- `AUTH_AUTHORITY` — also read where legacy `core/auth.py` checks authority

### Server + integrations

- `ENV` / `VITE_ENV` — string environment label
- `ALLOWED_ORIGINS` (comma-separated) — CORS; `main.py` may add `http://localhost:5174` if not present
- `FRONTEND_URL` and fallback `VITE_FRONTEND_URL` — embedded in server-generated links (e.g. QR in PDFs)
- `OTEL_GRAFANA_ENABLED` — enables **`/metrics`**
- `LOKI_BASE_URL` — Loki base URL for `GET /observability/logs` (e.g. `http://localhost:3100`)
- `EMAIL_SERVICE_URL`, `BACKEND_API_KEY_EMAIL_NOTIFICATION` (fallback `EMAIL_SERVICE_API_KEY` in `get_adapter()`), `NOTIFICATIONS_ENABLED` — see `services/notifications/README.md`
- `BACKEND_API_KEY` — `X-API-Key` for `require_backend_api_key` on selected routes
- `ROLE_BOOTSTRAP_SECRET` — constant-time check in `core/auth.py` function `require_role_bootstrap_secret`. **No router in this repository currently registers a route that uses it**; the comment in `settings.py` references a potential `POST /internal/bootstrap-role`.

## Local development

```bash
cd Server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Useful URLs after startup:

- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`
- `http://localhost:8000/api/health`
- `http://localhost:8000/metrics` (if `OTEL_GRAFANA_ENABLED=true`)

## Postgres quick check

1. Set database env vars.

2. Health (includes DB `SELECT 1` in `routers/health.py`):

```bash
curl http://localhost:8000/api/health
```

3. Optional seed script:

```bash
cd Server
python scripts/pg_seed_dummy.py --assets 30
```

## Response formats

### Guideline-style envelope in route handlers

Many v1 routes return `JSONResponse` built from `core.api_response.success_response` / `error_response` (fields listed in `core/api_response.py`).

### Legacy `EnvelopeMiddleware` (non-`/api/v1` JSON)

`core/middleware.py` documents: envelope applies when the path is rewritten from `/v2/...` or the client sends `X-Response-Envelope: true`. **Standard `/api/v1/*` responses are produced by the handlers themselves, not this middleware.**

## Request tracing

Headers: **`x-request-id`** (from `RequestIdMiddleware`).

## Database scripts in `db/`

| File | Purpose (from in-file or adjacent comments) |
| --- | --- |
| `db/fn_next_asset_tag.sql` | `public.fn_next_asset_tag()` for asset tag generation |
| `db/add_assets_qr_code.sql` | Adds `assets.qr_code` if missing |
| `db/v_warranty_notifications.sql` | Warranty notification view (used with meta/notification features) |

Apply in your DBA process as needed; they do not replace a full schema migration pipeline.

## Related

- [`../README.md`](../README.md)
- [`../Client/CLIENT_README.md`](../Client/CLIENT_README.md)
- [`services/README.md`](./services/README.md)
