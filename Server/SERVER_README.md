# AMS Server Reference

[FastAPI backend for the Asset Management System, backed by Supabase (PostgreSQL + Auth + RPC + RLS)](https://assetmanager-backend.vercel.app)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Dependencies](#dependencies)
4. [Environment Variables](#environment-variables)
5. [Running Locally](#running-locally)
6. [Entry Points](#entry-points)
7. [Core Layer (`core/`)](#core-layer-core)
   - [settings.py](#settingspy)
   - [supabase.py](#supabasepy)
   - [deps.py](#depspy)
   - [auth.py](#authpy)
   - [errors.py](#errorspy)
8. [Routers (`routers/`)](#routers-routers)
   - [health.py](#healthpy)
   - [assets.py](#assetspy)
   - [employees.py](#employeespy)
   - [logs.py](#logspy)
   - [assignments.py](#assignmentspy)
9. [Schemas (`schemas/`)](#schemas-schemas)
   - [asset.py](#assetpy)
   - [employee.py](#employeepy)
   - [log.py](#logpy)
   - [assignment.py](#assignmentpy)
10. [Services (`services/`)](#services-services)
    - [qr_service.py](#qr_servicepy)
11. [API Reference](#api-reference)
12. [Authentication & Route Protection](#authentication--route-protection)
13. [Error Handling](#error-handling)
14. [Database (`db/`)](#database-db)
15. [Vercel Deployment](#vercel-deployment)
16. [Frontend Integration Note](#frontend-integration-note)
17. [Known Issues / Deployment Checklist](#known-issues--deployment-checklist)

---

## Architecture Overview

```
Client (Vite React)
    │
    ├──► Supabase (direct: Auth, RLS, RPC)          ← primary runtime path
    │
    └──► FastAPI Server (optional: QR gen, admin API)
              │
              └──► Supabase (via service-role key)
```

- The **FastAPI server** uses Supabase's **service-role key** — it bypasses RLS and is trusted.
- The **client** uses Supabase's **anon key** and relies on RLS policies for data access control.
- Admin privilege in both paths is stored in `employees.metadata.role = 'admin'` for the `auth_user_id` tied to the signed-in user.

---

## Project Structure

```
Server/
├── app.py                      # Legacy compat entrypoint — re-exports main.app
├── main.py                     # FastAPI app factory (create_app), CORS, routers
├── requirements.txt            # Python dependencies
├── vercel.json                 # Vercel serverless config
├── .env                        # Local environment variables (gitignored)
├── .env.example                # Template for env vars
│
├── core/
│   ├── settings.py             # App settings dataclass, loads .env
│   ├── supabase.py             # Supabase client singleton
│   ├── deps.py                 # FastAPI dependency: get_db()
│   ├── auth.py                 # Optional API key protection
│   └── errors.py               # HTTP + Supabase error handling
│
├── routers/
│   ├── __init__.py
│   ├── health.py               # GET /health
│   ├── assets.py               # CRUD + scan for assets
│   ├── employees.py            # CRUD for employees
│   ├── logs.py                 # Asset log read/write with QR
│   └── assignments.py          # Assign/return assets via DB RPC
│
├── schemas/
│   ├── asset.py                # Pydantic models: AssetCreate, AssetUpdate, AssetOut
│   ├── employee.py             # Pydantic models: EmployeeCreate, EmployeeUpdate, EmployeeOut
│   ├── log.py                  # Pydantic models: AssetLogCreate, AssetLogOut
│   └── assignment.py           # Pydantic models: AssignAssetRequest, ReturnAssetRequest, AssignmentRPCResult
│
├── services/
│   └── qr_service.py           # QR code generation as base64 PNG
│
├── db/
│   └── migrations/
│       └── v2/
│           ├── 01_tables.sql
│           ├── 02_functions.sql
│           ├── 03_views.sql
│           ├── 04_rls_policies.sql
│           ├── 05_storage_realtime_auth.sql
│           ├── 06_seed.sql
│           ├── 07_admin_audit.sql
│           ├── README.md
│           └── STAGING_RUNBOOK.md
│
└── scripts/
    └── import_v2_from_sheet.py # Standalone data import script (NOT a Vercel route)
```

---

## Dependencies

Defined in `requirements.txt`:

| Package | Purpose |
|---|---|
| `fastapi[standard]` | Web framework + Uvicorn bundled |
| `supabase` | Supabase Python client (PostgREST + Auth) |
| `pydantic` | Request/response validation models |
| `python-dotenv` | Load `.env` file into `os.environ` |
| `qrcode[pil]` | QR code image generation (PIL backend) |
| `openpyxl` | Excel I/O for the import script only |

---

## Environment Variables

Copy `.env.example` to `.env` for local use. Never commit `.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | ✅ Yes | `""` | Your Supabase project URL |
| `SUPABASE_KEY` | ✅ Yes | `""` | Supabase **service-role** key (bypasses RLS — keep secret) |
| `FRONTEND_URL` | ✅ In prod | `http://localhost:5173` | Base URL of the deployed frontend. Used by QR code generator |
| `ALLOWED_ORIGINS` | ✅ In prod | `http://localhost:5173,http://localhost:3000` | Comma-separated list of CORS origins |
| `ENV` | Recommended | `local` | `local` or `production`. Controls error detail verbosity and API key enforcement |
| `BACKEND_API_KEY` | Recommended in prod | `""` | Shared secret to protect all routes except `/` and `/health`. Empty = open access |
| `PORT` | Optional | `8000` | Port for local Uvicorn (not used by Vercel) |

> **⚠️ Production critical:** If `FRONTEND_URL` is not set in Vercel, server-generated QR codes will embed `http://localhost:5173/...` in the QR image — making them broken. Always set this before deploying.

---

## Running Locally

```bash
cd Server
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Interactive API docs available at:
- `http://localhost:8000/docs` (Swagger UI)
- `http://localhost:8000/redoc` (ReDoc)

---

## Entry Points

### `main.py` — Canonical app factory

```
create_app() → FastAPI
```

- Adds `CORSMiddleware` using `settings.ALLOWED_ORIGINS`
- Registers custom exception handlers (`HTTPException`, `Exception`)
- Includes all routers with `require_backend_api_key` as a shared dependency on protected routes
- Exposes a root-level `/scan/{asset_ref}` shortcut for QR navigation (also protected)
- Exposes `GET /` → `{"message": "AMS API V2 is running", "env": "local|production"}`

### `app.py` — Legacy compatibility shim

```python
from main import app  # noqa: F401
```

Re-exports `main.app` so Vercel and older `uvicorn app:app` commands still work.

---

## Core Layer (`core/`)

### `settings.py`

Loads all config from environment variables using Python `dataclass` + `load_dotenv()`.

**Class:** `Settings`

| Field | Type | Source |
|---|---|---|
| `SUPABASE_URL` | `str` | `os.getenv("SUPABASE_URL", "")` |
| `SUPABASE_KEY` | `str` | `os.getenv("SUPABASE_KEY", "")` |
| `FRONTEND_URL` | `str` | `os.getenv("FRONTEND_URL", "http://localhost:5173")` |
| `ALLOWED_ORIGINS` | `List[str]` | `os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")` parsed by `_parse_origins()` |
| `BACKEND_API_KEY` | `str` | `os.getenv("BACKEND_API_KEY", "")` |
| `ENV` | `str` | `os.getenv("ENV", "local")` |

**`__post_init__` validations:**
- Prints `WARNING` if `SUPABASE_URL` or `SUPABASE_KEY` is missing
- Prints `WARNING` if `FRONTEND_URL` doesn't start with `http`
- Falls back to `[FRONTEND_URL, "http://localhost:3000"]` if `ALLOWED_ORIGINS` parses to empty
- Prints `WARNING` if `ENV=production` and `BACKEND_API_KEY` is empty

**Helper:** `_parse_origins(raw: str) → List[str]` — splits comma-separated string, strips whitespace and trailing slashes.

**Global singleton:** `settings = Settings()` — imported throughout the app.

---

### `supabase.py`

```python
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
```

Creates a single Supabase client using the service-role key. This client bypasses all RLS policies. It is initialized at module import time (i.e., at cold-start on Vercel).

---

### `deps.py`

```python
def get_db() → Client
```

FastAPI `Depends`-compatible dependency that returns the global `supabase` client. Exists as an injection point for easier mocking in tests.

Used in every router via `db=Depends(get_db)`.

---

### `auth.py`

```python
def require_backend_api_key(x_api_key, authorization)
```

Optional route guard. Behavior:

- If `BACKEND_API_KEY` is **empty** → returns immediately (open access).
- If `BACKEND_API_KEY` is **set** → checks either:
  - Header `x-api-key: <key>`, **or**
  - Header `Authorization: Bearer <key>`
- On failure → `HTTP 401 Unauthorized`.

Applied to all routes except `GET /` and `GET /health` via `main.py`'s `protected_dependencies`.

---

### `errors.py`

Two FastAPI exception handlers registered in `main.py`:

| Handler | Trigger | Behavior |
|---|---|---|
| `custom_http_exception_handler` | `HTTPException` | Returns `{"detail": ...}` with the original status code |
| `generic_exception_handler` | Any other `Exception` | Logs the error; returns `500`. In `local` ENV, returns the raw error message; in `production`, returns `"An internal server error occurred."` |

**`handle_supabase_error(e)`** — utility called inside router `except` blocks. Maps Supabase/PostgREST error codes to HTTP status codes:

| Condition | HTTP |
|---|---|
| `mapped_status` in `{400, 401, 403, 404, 409, 422, 429}` | That status |
| Postgres `23505` / `"duplicate key"` | `409 Conflict` |
| Postgres `23503`, `23514`, `22P02` / FK / invalid input | `400 Bad Request` |
| PostgREST `PGRST116` / `"not found"` | `404 Not Found` |
| Anything else | `500 Internal Server Error` |

Error detail is only exposed verbatim in `local`/`dev`/`development`/`test` environments. Production returns generic messages.

---

## Routers (`routers/`)

All protected routers use `db=Depends(get_db)` and `_=Depends(require_backend_api_key)` (the latter applied at app factory level).

---

### `health.py`

**Prefix:** `/health` | **Tag:** `System`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Runs a `SELECT * LIMIT 1` on `assets` to verify Supabase connectivity. Returns `{"api": "running", "database": "connected" \| "error: connection failed"}`. Not protected by API key. |

---

### `assets.py`

**Prefix:** `/assets` | **Tag:** `Assets`

#### Internal helpers

| Helper | Purpose |
|---|---|
| `sanitize_search(query)` | Strips `,()"%` for safe Supabase `or_()` filters |
| `slugify(value)` | Lowercases and replaces non-alphanumeric with `-` |
| `titleize_slug(slug)` | Converts `laptop-mac` → `Laptop Mac` |
| `normalize_location_code(value)` | Uppercases and replaces non-alphanumeric with `-` |
| `normalize_asset_row(row, latest_qr_code)` | Normalizes a raw `v_asset_inventory` row to `AssetOut` shape |
| `parse_asset_status(raw, required_non_empty)` | Validates against `VALID_ASSET_STATUSES` |
| `resolve_category_id(db, slug, name)` | Upserts into `asset_categories`, returns `id` |
| `resolve_manufacturer_id(db, name)` | Upserts into `manufacturers`, returns `id` |
| `resolve_location_id(db, code, name)` | Upserts into `locations`, returns `id` |
| `resolve_asset_inventory_row(db, asset_ref)` | Looks up by `asset_tag` first, then by UUID |
| `get_latest_asset_qr(db, asset_id)` | Gets the most recent `qr_code` from `asset_logs` for an asset |
| `next_asset_tag(db)` | Calls `fn_next_asset_tag()` RPC to auto-generate the next tag |

**Valid asset statuses:** `in_stock`, `assigned`, `in_repair`, `retired`, `lost`, `disposed`

#### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/assets` | List all assets from `v_asset_inventory`. Supports `search`, `department`, `type` (category slug), `status`, `start_date`, `end_date` query params |
| `POST` | `/assets` | Create asset. Auto-generates `asset_tag` via `fn_next_asset_tag()` if not provided. Generates QR via `qr_service`. Calls `fn_create_asset_with_log` RPC |
| `GET` | `/assets/{asset_ref}` | Fetch single asset by `asset_tag` or UUID. Resolves and attaches `latest_qr_code` from `asset_logs` |
| `PUT` | `/assets/{asset_ref}` | Partial update. Only fields explicitly provided in body are written. Resolves category/manufacturer/location IDs from names |
| `GET` | `/assets/scan/{asset_ref}` | Alias for `GET /assets/{asset_ref}` — used for QR redirect targets |
| `GET` | `/scan/{asset_ref}` | Root-level alias (defined in `main.py`) — for direct QR navigation compat |

---

### `employees.py`

**Prefix:** `/employees` | **Tag:** `Employees`

#### Internal helpers

| Helper | Purpose |
|---|---|
| `sanitize_search(query)` | Strips `,()"` for Supabase `or_()` filters |
| `normalize_role_input(raw)` | Validates and normalizes to `'admin'` or `'employee'` |
| `normalize_employee_row(row)` | Flattens joined `department:departments(name)` and resolves role from `metadata.role` |
| `resolve_department_id(db, name)` | Upserts into `departments`, returns `id` |

#### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/employees` | List employees. Supports `search` (code/name/email ilike) and `is_active` filter. Joins `departments` table |
| `GET` | `/employees/by-email` | Look up a single employee by exact email. Returns `404` if not found |
| `GET` | `/employees/{employee_code}` | Fetch single employee by `employee_code`. Returns `404` if not found |
| `POST` | `/employees` | Create or upsert employee (conflict on `employee_code`). Accepts `department_id` or `department_name` (auto-resolved). Stores `role` inside `metadata.role` |
| `PUT` | `/employees/{employee_code}` | Partial update. Merges `metadata` instead of replacing (preserves other metadata keys). Resolves `department_name` → `department_id` if provided |

---

### `logs.py`

**Prefix:** `/logs` | **Tag:** `Logs`

#### Internal helpers

| Helper | Purpose |
|---|---|
| `_pick_single_relation(value)` | Normalizes Supabase joined relation that may be a list or dict |
| `_normalize_log_row(row)` | Flattens joined `asset` and `actor` relations |
| `_resolve_asset_identity(db, ref)` | Looks up `assets` by `asset_tag` first, then UUID |
| `_resolve_employee_id(db, code)` | Looks up `employees.id` by `employee_code`, raises `404` if missing |
| `_select_logs(db)` | Common select builder including joined `asset` tag and `actor` employee fields |

#### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/logs` | Returns the 50 most recent log entries across all assets, ordered by `created_at DESC` |
| `GET` | `/logs/{asset_ref}` | Returns the single most recent log (including `qr_code`) for a specific asset |
| `POST` | `/logs` | Create a new log entry for an asset. Generates a fresh QR code via `qr_service`. Accepts `asset_ref`, `asset_tag`, or `asset_id` (first non-empty wins). Optional `actor_employee_code` |

---

### `assignments.py`

**Prefix:** `/assignments` | **Tag:** `Assignments`

Business logic is **entirely in Supabase RPC functions** (`fn_assign_asset`, `fn_return_asset`). The router only validates inputs and forwards to the DB.

#### Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/assignments/assign` | `AssignAssetRequest` | Calls `fn_assign_asset` RPC. Returns `AssignmentRPCResult`. RPC handles: active check, duplicate check, status update, log creation |
| `POST` | `/assignments/return` | `ReturnAssetRequest` | Calls `fn_return_asset` RPC. Returns `AssignmentRPCResult`. RPC handles: active check, status revert, log creation |

Both endpoints return `HTTP 400` if the RPC returns `ok: false`, with the RPC's `message` as the error detail.

---

## Schemas (`schemas/`)

### `asset.py`

| Class | Used for | Key fields |
|---|---|---|
| `AssetBase` | Base (internal) | All asset fields including current assignment info and `latest_qr_code` |
| `AssetCreate` | `POST /assets` body | `category_slug` required; `asset_tag` optional (auto-generated if omitted) |
| `AssetUpdate` | `PUT /assets/{ref}` body | All optional; only provided fields are patched |
| `AssetOut` | All response bodies | Extends `AssetBase` + `id` (UUID), `created_at`, `updated_at` |

---

### `employee.py`

| Class | Used for | Key fields |
|---|---|---|
| `EmployeeBase` | Base | `employee_code` (required), `name` (required), `email`, `department_id`, `department_name`, `is_active`, `role` (`admin`\|`employee`), `metadata` |
| `EmployeeCreate` | `POST /employees` body | Inherits `EmployeeBase` |
| `EmployeeUpdate` | `PUT /employees/{code}` body | All optional; metadata is **merged** not replaced |
| `EmployeeOut` | All response bodies | `id` (UUID), all employee fields, `created_at`, `updated_at` |

Role is stored in `employees.metadata.role` in the database. `EmployeeOut.role` is derived from `metadata.role` at normalize time.

---

### `log.py`

| Class | Used for | Key fields |
|---|---|---|
| `AssetLogBase` | Base | `asset_id`, `asset_tag`, `note`, `metadata` |
| `AssetLogCreate` | `POST /logs` body | Accepts any one of `asset_ref`, `asset_tag`, or `asset_id`. Validated by `@model_validator`. `actor_employee_code` optional |
| `AssetLogOut` | All response bodies | `id`, `asset_id`, `asset_tag`, `actor_employee_id`, `actor_employee_code`, `actor_employee_name`, `qr_code`, `created_at` |

`AssetLogCreate.resolved_asset_ref()` returns the first non-empty value from `asset_ref → asset_tag → asset_id`.

---

### `assignment.py`

| Class | Used for | Key fields |
|---|---|---|
| `AssignAssetRequest` | `POST /assignments/assign` | `asset_tag` (required), `employee_code` (required), `assigned_at` (optional), `notes`, `source` (default `"runtime"`) |
| `ReturnAssetRequest` | `POST /assignments/return` | `asset_tag` (required), `returned_at` (optional), `notes`, `source` (default `"runtime"`) |
| `AssignmentRPCResult` | Both assignment response bodies | `ok`, `assignment_id`, `asset_id`, `asset_tag`, `employee_id`, `employee_code`, `status`, `message`, `metadata` |

---

## Services (`services/`)

### `qr_service.py`

**Class:** `QRService` | **Singleton:** `qr_service = QRService()`

```python
QRService.generate_asset_qr(asset_id: str) → str
```

- Builds URL: `{settings.FRONTEND_URL}/scan/{asset_id}`
- Generates a QR code image (version 1, box_size=10, border=4, black on white)
- Returns a `data:image/png;base64,...` string for inline embedding or DB storage
- Used by `routers/assets.py` (on create) and `routers/logs.py` (on log create)

> **⚠️ Production note:** `FRONTEND_URL` must be set to the deployed client URL or QR codes will contain `http://localhost:5173/scan/...`.

---

## API Reference

### Protected Endpoints (require `x-api-key` or `Authorization: Bearer` if `BACKEND_API_KEY` is set)

```
GET    /assets                     — List assets (filters: search, department, type, status, start_date, end_date)
POST   /assets                     — Create asset
GET    /assets/{asset_ref}         — Get asset by asset_tag or UUID
PUT    /assets/{asset_ref}         — Update asset
GET    /assets/scan/{asset_ref}    — QR scan alias for GET /assets/{asset_ref}
GET    /scan/{asset_ref}           — Root-level QR alias
GET    /logs                       — List 50 most recent logs
GET    /logs/{asset_ref}           — Latest log for an asset
POST   /logs                       — Create log entry
GET    /employees                  — List employees (filters: search, is_active)
GET    /employees/by-email         — Get employee by email
GET    /employees/{employee_code}  — Get employee by code
POST   /employees                  — Create/upsert employee
PUT    /employees/{employee_code}  — Update employee
POST   /assignments/assign         — Assign asset to employee
POST   /assignments/return         — Return asset from employee
```

### Unprotected Endpoints

```
GET    /          — {"message": "AMS API V2 is running", "env": "..."}
GET    /health    — {"api": "running", "database": "connected|error: ..."}
```

---

## Authentication & Route Protection

Two layers:

1. **`BACKEND_API_KEY`** (server-level, optional):
   - If set, all routes except `/` and `/health` require the key via `x-api-key` header or `Authorization: Bearer` header.
   - If unset, all routes are publicly accessible. This is acceptable for private/internal networks, but risky for internet-facing deployments.

2. **Supabase RLS** (DB-level):
   - The server uses the **service-role key** which bypasses RLS entirely.
   - RLS is enforced only for the client (anon key path).
   - Admin authorization in the server is implicit — any caller that passes the `BACKEND_API_KEY` check is trusted to perform any operation.

---

## Error Handling

| Scenario | Response |
|---|---|
| `HTTPException` raised in router | Returns `{"detail": "..."}` with original status code |
| Supabase duplicate key (`23505`) | `409 Conflict` — `"Resource already exists."` |
| Supabase FK / invalid input (`23503`, `23514`, `22P02`) | `400 Bad Request` |
| Supabase not found (`PGRST116`) | `404 Not Found` |
| Any other unhandled exception | `500 Internal Server Error` |
| `ENV=local/dev/test` | Raw error message is exposed |
| `ENV=production` | Generic `"Database operation failed."` or `"An internal server error occurred."` |

---

## Database (`db/`)

All SQL migrations are in `db/migrations/v2/`. Run in order on a fresh Supabase project.

| File | Contents |
|---|---|
| `01_tables.sql` | Creates all tables: `employees`, `departments`, `asset_categories`, `manufacturers`, `locations`, `assets`, `asset_assignments`, `asset_logs`, `asset_components`, `custom_field_definitions` |
| `02_functions.sql` | All Supabase RPC functions: `fn_next_asset_tag`, `fn_create_asset_with_log`, `fn_assign_asset`, `fn_return_asset`, `fn_public_scan_asset`, `fn_is_admin`, `fn_claim_employee_auth_link`, `fn_set_employee_admin_status` |
| `03_views.sql` | `v_asset_inventory` — denormalized view joining assets, categories, manufacturers, locations, active assignments, and current employee info |
| `04_rls_policies.sql` | Row-level security policies for all tables; admin vs employee vs anon access |
| `05_storage_realtime_auth.sql` | Supabase Storage bucket config + Realtime publication setup + Auth hooks |
| `06_seed.sql` | Initial seed data (departments, categories, etc.) |
| `07_admin_audit.sql` | Admin role audit log table and trigger |

> If V2 tables were already applied, only re-run `03_views.sql` and `04_rls_policies.sql` to pick up the latest `fn_public_scan_asset` RPC and updated admin RLS policies.

See `db/migrations/v2/README.md` and `STAGING_RUNBOOK.md` for detailed migration instructions and rollback steps.

---

## Vercel deployment

- **Root directory:** `Server/` (this Python project).
- **Entry:** `vercel.json` wires the serverless handler; local dev uses `uvicorn main:app` as documented above.

### Production checklist (Vercel env)

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_KEY` | Service-role key only on the server; never expose in the browser. |
| `FRONTEND_URL` | Full origin of the deployed client, **no trailing slash** (e.g. `https://ourassets.vercel.app`). Used inside QR images; if wrong, scans point at localhost. |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins; must include the same client origin (e.g. `https://ourassets.vercel.app`). |
| `ENV` | Set to `production` for generic error messages and stricter API-key expectations. |
| `BACKEND_API_KEY` | Set a strong secret in production so only callers with `x-api-key` or `Authorization: Bearer` can hit protected routes. |

### API base URL for callers

The backend **base URL** is the deployment origin only (e.g. `https://assetmanager-backend.vercel.app`). OpenAPI/Swagger lives at `{base}/docs` and ReDoc at `{base}/redoc` — those paths are for humans in a browser, not a substitute for the API root.

---

## Frontend integration note

The React client talks to Supabase directly for almost all runtime operations. The FastAPI server is used for admin-style HTTP APIs and for QR generation when assets or logs are created through that API. For QR payloads to open the correct SPA route, `FRONTEND_URL` on the server must match the deployed client.

---

## Known issues / deployment checklist

- [ ] `FRONTEND_URL` and `ALLOWED_ORIGINS` match production client origin.
- [ ] `BACKEND_API_KEY` set when the API is exposed on the public internet.
- [ ] Supabase Auth redirect URLs include the production client origin.
- [ ] Migrations applied in order on the target Supabase project (`db/migrations/v2/`).

---
