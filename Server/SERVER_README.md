# AMS Server

FastAPI 0.136 backend for the Asset Manager System. The application factory is in `main.py` (`app = create_app()`); `app.py` re-exports `from main import app` for compatibility with older `uvicorn app:app` invocations.

All client-facing API routes are versioned under **`/api/v1/*`**, plus **`GET /api/health`** and **`GET /observability/logs`** (not under `/api/v1`).

## What this service does

- Serves a versioned JSON REST API via FastAPI routers in `routers/`.
- Manages an **asyncpg** connection pool (`core/postgres.py`): `init_pg_pool()` / `close_pg_pool()` are called from `main.py` startup/shutdown events. All repositories acquire connections via `repositories/db.py`.
- When **`AUTH_ENABLED=true`**, the `AuthMiddleware` stack validates RS256 JWTs from authNexus (JWKS), resolves the employee record, and attaches an `EmployeeContext` to `request.state.employee` (`core/auth_middleware.py`, `core/authnexus.py`).
- Enforces role-based access: `require_authenticated` (any signed-in employee), `require_privileged` (admin or it_ops), `require_it_ops` (it_ops only) — all in `core/authz.py`.
- Writes append-only audit trails to `asset_logs` and `asset_events` tables via `services/audit_service.py`.
- Generates QR code PNGs (`services/qr_service.py`) and print-ready QR label PDFs via ReportLab (`services/qr_label_pdf_service.py`).
- Sends fire-and-forget email events to an external microservice via `services/notifications/` when `NOTIFICATIONS_ENABLED=true`.
- Proxies Loki log queries at `GET /observability/logs` (IT Ops only) via `httpx`.
- Exposes Prometheus metrics at `GET /metrics` when `OTEL_GRAFANA_ENABLED=true`.

## Folder structure

```
Server/
├── main.py                  # App factory: middleware, routers, CORS, exception handlers
├── app.py                   # Legacy re-export of main.app
├── requirements.txt         # Pinned Python dependencies
├── Dockerfile               # Production container image
├── vercel.json              # Vercel deployment config (if used)
├── launch-otel-server.ps1   # PowerShell helper to start server with OTel
│
├── core/                    # Cross-cutting infrastructure
│   ├── settings.py          # Settings dataclass; loads .env via python-dotenv
│   ├── postgres.py          # asyncpg pool init/close/get; JSON codec registration
│   ├── auth.py              # Legacy JWT helpers (verify_session, require_role, get_auth_user_id_from_bearer)
│   ├── auth_middleware.py   # AuthMiddleware: validates Bearer token, resolves EmployeeContext
│   ├── authnexus.py         # verify_bearer_token (PyJWT + JWKS), resolve_employee_for_sub
│   ├── authz.py             # FastAPI dependencies: require_authenticated, require_privileged, require_it_ops
│   ├── api_response.py      # success_response / error_response dict helpers
│   ├── errors.py            # custom_http_exception_handler, generic_exception_handler
│   ├── middleware.py        # RequestIdMiddleware (x-request-id, timing log), EnvelopeMiddleware
│   └── asset_db_types.py    # Date field coercion helpers for asset payloads
│
├── routers/                 # HTTP route handlers (one file per resource)
│   ├── health.py            # GET /api/health
│   ├── api_v1_assets.py     # /api/v1/assets — CRUD, assign, return, scan, QR, bulk, logs
│   ├── api_v1_employees.py  # /api/v1/employees — CRUD, role change, portfolio, bulk
│   ├── api_v1_assignments.py# /api/v1/assignments — assign / return (dedicated router)
│   ├── api_v1_meta.py       # /api/v1/meta — categories, departments, dashboard stats, warranty
│   ├── api_v1_authz.py      # /api/v1/authz — admin/itops access checks
│   ├── api_v1_recycle_bin.py# /api/v1/recycle-bin — list, restore, permanent delete
│   └── observability.py     # GET /observability/logs — Loki proxy (IT Ops only)
│
├── schemas/                 # Pydantic request/response models
│   ├── asset.py             # AssetCreate, AssetUpdate, AssetQrLabelsExportRequest
│   ├── asset_admin.py       # SoftDeleteAssetRequest
│   ├── assignment.py        # AssignAssetRequest, ReturnAssetRequest
│   ├── employee.py          # Employee schemas
│   ├── envelope.py          # success_envelope / error_envelope (legacy middleware)
│   ├── log.py               # Log entry schema
│   └── analysis.py          # Analysis/overview schemas
│
├── repositories/            # Async SQL data access (asyncpg)
│   ├── db.py                # pool(), fetchrow_dict(), fetch_dicts(), pagination helpers
│   ├── asset_repository.py  # Read queries: list_inventory, get_inventory_by_ref, public scan, next tag
│   ├── asset_write_repository.py  # Write queries: create, update, soft delete, restore, status update
│   ├── asset_detail_repository.py # Asset detail with assignments, components, events
│   ├── assignment_repository.py   # Assignment read queries
│   ├── assignment_write_repository.py # Transactional assign/return with row locking
│   ├── employee_repository.py     # Employee CRUD, portfolio, bulk upsert, auth linking
│   ├── meta_repository.py         # Categories, departments, manufacturer/location resolution
│   ├── audit_repository.py        # Insert asset_logs and asset_events rows
│   ├── recycle_bin_repository.py  # Recycle bin CRUD
│   └── errors.py                  # NotFoundError, ValidationError, ConflictError
│
├── services/                # Business logic layer (see services/README.md)
│   ├── asset_service.py     # Create, soft delete, restore, bulk insert, assign/return delegation
│   ├── assignment_service.py# Transactional assign/return with email notifications
│   ├── audit_service.py     # AuditService: write_asset_log, write_asset_event
│   ├── hooks.py             # ServiceHooks no-op facade (on_asset_assigned, etc.)
│   ├── qr_service.py        # QR PNG bytes and base64 data URIs
│   ├── qr_label_pdf_service.py # ReportLab PDF of QR label sheets
│   └── notifications/       # Email adapter + orchestrator (see notifications/README.md)
│
├── scripts/                 # One-off utility scripts (not part of the server runtime)
│   ├── import_v2_from_sheet.py    # Import assets from a spreadsheet
│   ├── pg_seed_dummy.py           # Seed dummy assets/employees for local dev
│   └── smoke_api_v1_assignments.py# Smoke test the assignments API
│
└── tests/                   # pytest test suite
    ├── test_asset_db_types.py     # Date coercion unit tests
    ├── test_auth_local_jwt.py     # JWT verification unit tests
    ├── test_envelope.py           # Envelope schema unit tests
    └── test_qr_labels_export.py   # QR PDF generation tests
```

## API endpoints

All routes return the standard envelope: `{status, status_code, message, timestamp, data}` for success; `{..., error: {code, details}}` for errors.

### System

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | Public | Liveness check — returns `{message, env}` |
| GET | `/api/health` | Public | Health check including Postgres `SELECT 1` |
| GET | `/metrics` | Public | Prometheus metrics (only if `OTEL_GRAFANA_ENABLED=true`) |

### Assets — `/api/v1/assets`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/assets` | Authenticated | List assets from `v_asset_inventory`; `employee` role scoped to own assignments |
| POST | `/api/v1/assets` | Privileged | Create a new asset |
| POST | `/api/v1/assets/bulk` | Privileged | Bulk insert assets |
| GET | `/api/v1/assets/next-tag` | Privileged | Generate next `AST-#####` tag |
| GET | `/api/v1/assets/public-scan/{asset_tag}` | Public | Anonymous QR scan — returns limited fields |
| GET | `/api/v1/assets/scan/{ref}` | Optional auth | QR scan with optional auth; returns redirect signal for privileged users |
| PUT | `/api/v1/assets/{id}` | Privileged | Update asset by UUID |
| PATCH | `/api/v1/assets/tag/{asset_tag}` | Privileged | Update asset by tag |
| PATCH | `/api/v1/assets/{asset_tag}/status` | Privileged | Update asset lifecycle status |
| GET | `/api/v1/assets/{asset_tag}/logs` | Authenticated | Fetch audit log entries for an asset |
| POST | `/api/v1/assets/{asset_tag}/logs` | Authenticated | Create a manual log entry |
| POST | `/api/v1/assets/assign` | Privileged | Assign asset to employee |
| POST | `/api/v1/assets/return` | Privileged | Return asset from employee |
| POST | `/api/v1/assets/{id}/soft-delete` | Privileged | Soft-delete asset (moves to Recycle Bin) |

### Assignments — `/api/v1/assignments`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/assignments/assign` | Privileged | Assign (or reassign) asset — transactional, idempotent |
| POST | `/api/v1/assignments/return` | Privileged | Return asset — transactional |

### Employees — `/api/v1/employees`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/employees/me` | Authenticated | Session employee profile |
| GET | `/api/v1/employees` | Privileged | List employees with filters + pagination |
| POST | `/api/v1/employees` | Privileged | Create employee |
| POST | `/api/v1/employees/bulk` | Privileged | Bulk upsert employees |
| GET | `/api/v1/employees/by-email` | Authenticated | Lookup employee by email |
| POST | `/api/v1/employees/check-codes` | Privileged | Check which business IDs already exist |
| POST | `/api/v1/employees/check-emails` | Privileged | Check which emails already exist |
| POST | `/api/v1/employees/asset-counts` | Privileged | Get assigned asset counts for a list of employee UUIDs |
| GET | `/api/v1/employees/{id}` | Authenticated | Get employee by UUID (employee role: own profile only) |
| PUT | `/api/v1/employees/{id}` | Privileged | Update employee |
| PATCH | `/api/v1/employees/{id}/role` | Privileged | Change employee role |
| POST | `/api/v1/employees/{id}/soft-delete` | Privileged | Soft-delete employee (moves to Recycle Bin) |
| GET | `/api/v1/employees/{id}/portfolio` | Authenticated | Employee profile + currently assigned assets |

### Meta — `/api/v1/meta`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/meta/categories` | Authenticated | List asset categories |
| GET | `/api/v1/meta/categories/{slug}/fields` | Authenticated | Custom field definitions for a category |
| GET | `/api/v1/meta/departments` | Authenticated | List department names |
| GET | `/api/v1/meta/dashboard-stats` | Authenticated | Total/assigned/in-stock assets + employee counts |
| GET | `/api/v1/meta/public-dashboard` | Public | Anonymous dashboard summary with category breakdown |
| GET | `/api/v1/meta/overview-analysis` | Privileged | Status/category breakdown + top employee load |
| GET | `/api/v1/meta/warranty-notifications` | Privileged | Assets with expiring warranties (from `v_warranty_notifications`) |
| GET | `/api/v1/meta/welcome-notification` | Authenticated | System welcome notification (currently static) |

### AuthZ — `/api/v1/authz`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/authz/admin` | Authenticated | Returns `{allowed, role}` — true if admin or it_ops |
| GET | `/api/v1/authz/itops` | Authenticated | Returns `{allowed, role}` — true if it_ops |

### Recycle Bin — `/api/v1/recycle-bin`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/recycle-bin` | Privileged | List all soft-deleted entries |
| POST | `/api/v1/recycle-bin/{entry_id}/restore` | Privileged | Restore asset or employee |
| DELETE | `/api/v1/recycle-bin/{entry_id}` | Privileged | Permanently delete (hard delete, transactional) |

### Observability

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/observability/logs` | IT Ops only | Query Loki logs with filters; supports pagination via `cursor` |

**OpenAPI docs** (when server is running): `http://localhost:8000/docs` and `http://localhost:8000/redoc`.

## Environment variables

Create `Server/.env` from `Server/.env.example`. All values are read in `core/settings.py`.

### Database

Use either `DATABASE_URL` (full DSN) **or** the individual `POSTGRES_*` vars. If `DATABASE_URL` is empty, all five `POSTGRES_*` fields are required (validated in `Settings.__post_init__`).

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `""` | Full asyncpg DSN (overrides individual vars) |
| `POSTGRES_HOST` | `localhost` | DB host |
| `POSTGRES_PORT` | `5432` | DB port |
| `POSTGRES_DB` | — | Database name |
| `POSTGRES_USER` | — | DB user |
| `POSTGRES_PASSWORD` | — | DB password |
| `POSTGRES_MIN_POOL_SIZE` | `1` | asyncpg pool min connections |
| `POSTGRES_MAX_POOL_SIZE` | `10` | asyncpg pool max connections |
| `POSTGRES_COMMAND_TIMEOUT_SECONDS` | `10` | Per-query timeout |

### Auth (authNexus / OIDC)

| Variable | Required | Description |
| --- | --- | --- |
| `AUTH_ENABLED` | No (default `false`) | Enable JWT validation |
| `AUTH_JWKS_URL` | When `AUTH_ENABLED=true` | JWKS endpoint for RS256 key fetch |
| `AUTH_PROJECT_ID` | When `AUTH_ENABLED=true` | JWT project scope claim value |
| `AUTH_ISSUER` | No | JWT issuer for validation |
| `AUTH_AUDIENCE` | No | JWT audience for validation |
| `AUTH_PROJECT_ID_CLAIM` | No (default `project_id`) | JWT claim name for project ID |
| `AUTH_CLOCK_SKEW_SECONDS` | No (default `30`) | Leeway for JWT expiry checks |
| `AUTH_AUTHORITY` | No | Used by legacy `core/auth.py` helpers |

### Server and integrations

| Variable | Default | Description |
| --- | --- | --- |
| `ENV` | `local` | Environment label (`local`, `production`) |
| `FRONTEND_URL` | — | SPA origin embedded in QR code PDFs |
| `ALLOWED_ORIGINS` | `""` | Comma-separated CORS origins |
| `BACKEND_API_KEY` | `""` | Optional `X-API-Key` guard for public deployments |
| `OTEL_GRAFANA_ENABLED` | `false` | Expose `/metrics` for Prometheus |
| `LOKI_BASE_URL` | `http://localhost:3100` | Loki base URL for log proxy |
| `NOTIFICATIONS_ENABLED` | `false` | Enable email microservice calls |
| `EMAIL_SERVICE_URL` | `""` | Email microservice base URL |
| `BACKEND_API_KEY_EMAIL_NOTIFICATION` | `""` | `X-API-Key` for email service (`EMAIL_SERVICE_API_KEY` is a deprecated fallback) |
| `ROLE_BOOTSTRAP_SECRET` | `""` | Secret for a potential role bootstrap endpoint — no router currently uses it |

## Local development

```bash
cd Server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Useful URLs after startup:

- `http://localhost:8000/docs` — Swagger UI
- `http://localhost:8000/redoc` — ReDoc
- `http://localhost:8000/api/health` — health check (includes DB ping)
- `http://localhost:8000/metrics` — Prometheus (if `OTEL_GRAFANA_ENABLED=true`)

### Seed dummy data

```bash
cd Server
python scripts/pg_seed_dummy.py --assets 30
```

### Run tests

```bash
cd Server
pytest tests/
```

## Middleware stack

Middleware is added in `main.py` in reverse execution order (last added = outermost = runs first):

```
CORS → EnvelopeMiddleware → AuthMiddleware → RequestIdMiddleware → route handler
```

- **CORS:** reads `settings.ALLOWED_ORIGINS`; always includes `http://localhost:11000`.
- **EnvelopeMiddleware:** wraps responses only for `/v2/*` paths or when `X-Response-Envelope: true` is sent. Standard `/api/v1/*` responses are **not** wrapped by this middleware — handlers call `success_response` / `error_response` directly.
- **AuthMiddleware:** validates Bearer token and attaches `EmployeeContext` to `request.state.employee`. Exempt paths: `/docs`, `/redoc`, `/openapi.json`, `/health`, `/api/health`, `/metrics`, `/`.
- **RequestIdMiddleware:** attaches `x-request-id` to every response and logs `request_completed` with method, path, status, and elapsed ms.

## Response envelope format

```json
{
  "status": "success",
  "status_code": 200,
  "message": "Assets retrieved successfully.",
  "timestamp": "2026-05-03T10:00:00+00:00",
  "data": { ... }
}
```

Error responses add an `error` object:

```json
{
  "status": "error",
  "status_code": 404,
  "message": "Asset not found.",
  "timestamp": "...",
  "data": null,
  "error": { "code": "NOT_FOUND", "details": "Asset not found." }
}
```

## Known TODOs / limitations

- `ROLE_BOOTSTRAP_SECRET` is configured in `settings.py` and `core/auth.py` but no router currently registers a route that uses it. The comment references a potential `POST /internal/bootstrap-role` endpoint.
- `Server/app/` directory exists but is empty.
- Several test files at the root of `Server/` (`test_endpoint.py`, `test_loki.py`, etc.) are ad-hoc scripts, not part of the `tests/` pytest suite.
- `EnvelopeMiddleware` legacy `/v2` path rewriting is present but no `/v2` routes are registered.

## Related

- [`../README.md`](../README.md) — project overview and setup order
- [`../Client/CLIENT_README.md`](../Client/CLIENT_README.md) — frontend documentation
- [`services/README.md`](./services/README.md) — service layer
