# AMS Server

FastAPI backend for trusted Asset Manager operations.

This service is important, but it is not the primary runtime data path. The browser still talks directly to Supabase for most application behavior.

## What this service does

- Exposes HTTP endpoints for assets, employees, logs, assignments, health, and analysis
- Uses the Supabase service-role key for trusted server-side access
- Orchestrates automated events and proxies payloads to the Email Notification Microservice
- Generates server-side QR payload images
- Issues short-lived telemetry ingest tokens for browser telemetry
- Proxies IT Ops analysis requests to `TelemetryServer/`

## Entry points

- `main.py` - canonical FastAPI app
- `app.py` - compatibility re-export of `main.app`

## Project map

- `core/` - settings, auth, dependency wiring, error handling, Supabase client
- `routers/` - FastAPI route modules
- `schemas/` - request and response models
- `services/` - QR generation
- `db/migrations/v2/` - canonical AMS SQL migrations
- `scripts/import_v2_from_sheet.py` - spreadsheet import utility

## Routers

- `health.py`
- `assets.py`
- `logs.py`
- `assignments.py`
- `employees.py`
- `analysis.py`

## Environment variables

Create `Server/.env` (start from `Server/.env.example`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase service-role key |
| `FRONTEND_URL` | Strongly recommended | Origin used in server-generated QR links |
| `ALLOWED_ORIGINS` | Recommended | Comma-separated CORS allowlist |
| `BACKEND_API_KEY` | Recommended in production | Optional shared key for protected routes |
| `EMAIL_SERVICE_URL` | For notifications | Base URL of the email notification microservice |
| `BACKEND_API_KEY_EMAIL_NOTIFICATION` | For notifications | Purpose-specific `X-API-Key` used when this server calls the email notification microservice |
| `ENV` | No | Runtime mode such as `local` or `production` |
| `TELEMETRY_SERVER_BASE_URL` | For `/analysis` | Base URL of `TelemetryServer/` |
| `TELEMETRY_ITOPS_QUERY_KEY_NEW` | For `/analysis` | Shared key used when this server calls `TelemetryServer/telemetry/overview/events` |
| `TELEMETRY_INGEST_TOKEN_SECRET` | For browser telemetry | HMAC secret used to sign ingest tokens |
| `TELEMETRY_TOKEN_TTL_SECONDS` | No | Browser ingest token TTL; handler enforces a minimum of 60 seconds |
| `TELEMETRY_ENV` | For browser telemetry | Environment claim embedded in signed ingest tokens |

## Local development

```bash
cd Server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Useful URLs:

- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`
- `http://localhost:8000/health`

## Notification secret naming

- Keep `BACKEND_API_KEY` reserved for protecting this server's public backend routes.
- Use `BACKEND_API_KEY_EMAIL_NOTIFICATION` for the separate email notification microservice secret.
- `EMAIL_SERVICE_API_KEY` is still accepted temporarily as a legacy fallback during migration, but new environments should use `BACKEND_API_KEY_EMAIL_NOTIFICATION`.

## Python dependencies

- `fastapi[standard]`
- `supabase`
- `pydantic`
- `python-dotenv`
- `qrcode[pil]`
- `openpyxl`
- `httpx`

## Route summary

### Public

- `GET /`
- `GET /health`
- `POST /telemetry/ingest-token` with `Authorization: Bearer <Supabase access token>`

### Protected by backend API key when configured

- `/assets/*`
- `/logs/*`
- `/assignments/*`
- `/employees/*`
- root-level `GET /scan/{asset_ref}`

### Role-protected inside routers

- Asset, employee, log, and assignment write routes require a valid bearer token with the appropriate employee role.
- `GET /analysis` requires an IT Ops bearer token and then calls `TelemetryServer/` server-to-server.

## API response envelope (v2)

All routes support an optional **standardized response envelope**. The envelope is transparent — v1 callers are not affected.

### How to opt in

| Method | Example |
| --- | --- |
| **Path prefix** | `GET /v2/assets` instead of `GET /assets` |
| **Request header** | `X-Response-Envelope: true` on any existing route |

### Envelope shape

**Success**

```json
{
  "status_code": 200,
  "status": true,
  "message": "Request successful.",
  "data": { /* original route response */ },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO-8601",
    "count": 3
  }
}
```

**Error**

```json
{
  "status_code": 400,
  "status": false,
  "message": "Human-readable message",
  "data": null,
  "error": { "code": "BAD_REQUEST", "detail": "..." },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO-8601",
    "count": 0
  }
}
```

### `meta.count` rules

| Scenario | `count` value |
| --- | --- |
| `data` is a list | Length of the list |
| `data` is a single object | `1` |
| `data` is `null` (error or empty) | `0` |

### Request tracing

Every response includes an `x-request-id` header. Pass your own via `X-Request-Id` to propagate a trace ID through logs and response metadata.

### Contract tests

```bash
python -m pytest tests/test_envelope.py -v
```

## Behavior notes

- This server bypasses RLS because it uses the Supabase service-role key.
- `FRONTEND_URL` matters for QR correctness. In current code, the default falls back to `https://web-assetmanager.vercel.app` if you do not override it.
- Assignment business logic still belongs to database RPCs.
- The root-level `/scan/{asset_ref}` route exists for QR compatibility and delegates to the asset router.

## Database

AMS SQL lives in `db/migrations/v2/`.

- Start with [`db/migrations/v2/README.md`](./db/migrations/v2/README.md) for the full ordered migration list. For the **employee Recycle Bin** workflow, apply at least **`45_recycle_bin_grants_v_employee_directory.sql`**, **`47_recycle_bin_entries_rls_and_idempotent_soft_delete_employee.sql`** (RLS `SELECT` policy + idempotent soft-delete; fixes “binned users still on All Employees” when RLS is on), and **`46_fn_delete_employee_permanent_requires_recycle_bin.sql`** (permanent delete only when an open bin row exists).
- Use [`db/migrations/v2/STAGING_RUNBOOK.md`](./db/migrations/v2/STAGING_RUNBOOK.md) for staged rollout work

## Related docs

- [`../README.md`](../README.md)
- [`./db/migrations/v2/README.md`](./db/migrations/v2/README.md)
- [`../TelemetryServer/TELEMETRY_SERVER_README.md`](../TelemetryServer/TELEMETRY_SERVER_README.md)
