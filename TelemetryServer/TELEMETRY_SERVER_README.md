# Telemetry Server — Full Reference

Independent FastAPI service for ingesting, storing, and querying telemetry for Asset Manager. This document mirrors the current codebase under `TelemetryServer/` line by line for operators and integrators.

---

## 1. Purpose and boundaries

- **In scope:** HTTP ingest of validated events, async persistence via **Supabase Postgres** (schema `telemetry`), deduplication, basic redaction, rate limiting, priority queues, IT Ops–gated query endpoints, health/metrics, manual retention runs, dead-letter queue for failures.
- **Out of scope (not implemented in code yet):** Rollup tables, alert evaluator, versioned `/telemetry/v1/*` paths, JWT-based IT Ops verification, durable disk-backed queue across process restarts, metadata key allowlist per `event_name`.
- **Isolation:** This service does not modify the main `Client/` or `Server/` apps; callers integrate via HTTP and env-configured secrets.

---

## 2. Runtime stack

| Piece | Location | Notes |
|-------|----------|--------|
| ASGI app | `main.py` | FastAPI `app`, lifespan hooks |
| Settings | `core/settings.py` | Env vars, defaults, list parsing in `__post_init__` |
| Auth | `core/auth.py` | Ingest (server token + signed browser token), query (shared secret key) |
| Rate limit | `core/ratelimit.py` | In-memory token bucket per key |
| Redaction | `core/redaction.py` | Metadata sanitization only (not full allowlist) |
| Queue | `core/queue.py` | Three `asyncio` priority queues + workers |
| Schemas | `models/schemas.py` | Pydantic v2, `extra="forbid"` |
| Ingest router | `routers/ingest.py` | Batch + single POST |
| Query router | `routers/query.py` | Overview, alerts stub, health, metrics, retention |
| Storage | `services/storage.py` | `asyncpg` pool, CRUD, overview SQL (`percentile_disc` p95), retention deletes, `audit_access` |
| Metrics | `services/metrics.py` | Thread-locked counters + gauges |
| Deps | `requirements.txt` | `fastapi`, `uvicorn`, `pydantic`, `asyncpg`, `python-dotenv` |

---

## 3. Application lifecycle (`main.py`)

1. **Startup (`lifespan`):**
   - `asyncpg.create_pool(...)` from `TELEMETRY_DATABASE_URL` (TLS `require` when `TELEMETRY_DB_SSL` is true).
   - `await storage.attach_pool(pool)` — verifies `telemetry.telemetry_ingest_keys` exists (run migration SQL first).
   - `await storage.init()` — no DDL; confirms pool attached.
   - Constructs `TelemetryQueue` with `QUEUE_MAX_SIZE`, `QUEUE_WORKERS`, `storage`, `metrics`.
   - `await queue.start()` — spawns `QUEUE_WORKERS` asyncio tasks running `_worker_loop`.
   - `ingest.set_queue(queue)` and `query.set_queue(queue)` — wires global queue references into routers.
2. **Shutdown:** `await queue.stop()` → `storage.detach_pool()` → `await pool.close()`.
3. **Routes mounted:**
   - `ingest.router` at prefix `/telemetry`
   - `query.router` at prefix `/telemetry`
4. **Root:** `GET /` returns `{"service": "telemetry-server", "env": <TELEMETRY_ENV>}`.

---

## 4. Configuration (`core/settings.py`)

All values read from environment at import time. Dataclass `Settings` is instantiated once as `settings`.

| Variable | Default | Meaning |
|----------|---------|---------|
| `TELEMETRY_ENV` | `local` | Logical environment string; compared to browser token `environment` claim when set |
| `TELEMETRY_DATABASE_URL` | _(required)_ | Postgres connection URI (Supabase **service role** / direct; server-side only) |
| `TELEMETRY_DATABASE_SCHEMA` | `telemetry` | Schema name for all telemetry tables |
| `TELEMETRY_DB_POOL_MIN_SIZE` | `1` | Pool min connections |
| `TELEMETRY_DB_POOL_MAX_SIZE` | `10` | Pool max connections |
| `TELEMETRY_DB_SSL` | `true` | Set `false` only for local Postgres without TLS |
| `TELEMETRY_QUEUE_MAX_SIZE` | `2000` | Total capacity split across three internal queues (see queue section) |
| `TELEMETRY_QUEUE_WORKERS` | `2` | Number of concurrent worker coroutines draining the queues |
| `TELEMETRY_EVENT_MAX_BATCH` | `100` | Max events per batch request (enforced in ingest) |
| `TELEMETRY_EVENT_MAX_BYTES` | `16384` | Max JSON size per single event (UTF-8 encoded `json.dumps` of model dump) |
| `TELEMETRY_INGEST_MAX_BATCH_BYTES` | `1048576` | Max size of entire batch JSON body |
| `TELEMETRY_INGEST_SERVER_TOKEN` | `""` | Shared secret for server-to-server ingest header |
| `TELEMETRY_INGEST_TOKEN_SECRET` | `""` | HMAC secret for browser signed tokens |
| `TELEMETRY_ITOPS_QUERY_KEY` | `""` | Shared secret for protected query/retention endpoints |
| `TELEMETRY_SAMPLE_SERVER_SUCCESS` | `0.25` | Probability bucket for sampling `server_api` successes (after bypass rules) |
| `TELEMETRY_SAMPLE_CLIENT_DATA_SUCCESS` | `0.20` | Same for `client_data` successes |
| `TELEMETRY_SAMPLE_CLIENT_ENGAGEMENT` | `0.10` | Same for `client_engagement` / other sampled streams |
| `TELEMETRY_CRITICAL_SERVER_ROUTES` | `/assets,/assets/:id,/employee,/analysis` | Comma-separated; if `event.route_pattern` matches **exactly** one of these, event is never sampled out |
| `TELEMETRY_CRITICAL_CLIENT_OPERATIONS` | `fn_assign_asset,fn_return_asset,...` | Comma-separated `table_or_rpc` values; never sampled out |
| `TELEMETRY_RATE_LIMIT_PER_MINUTE` | `600` | Token bucket refill rate per minute per limiter key |
| `TELEMETRY_RATE_LIMIT_BURST` | `200` | Token bucket capacity |
| `TELEMETRY_RETAIN_SUCCESS_DAYS` | `30` | Rows deleted from `telemetry_events_success` older than this |
| `TELEMETRY_RETAIN_ERROR_DAYS` | `60` | Rows deleted from `telemetry_events_error` |
| `TELEMETRY_RETAIN_KEYS_HOURS` | `72` | Rows deleted from `telemetry_ingest_keys` |
| `TELEMETRY_RETAIN_GENERAL_DAYS` | `30` | Rows deleted from `telemetry_events_general` (engagement / internal) older than this |
| `TELEMETRY_ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins for browser `fetch` / preflight to ingest and query routes |
| `TELEMETRY_LOG_LEVEL` | `INFO` | Python `logging` level name for startup and router logs |

**Security note:** If `TELEMETRY_INGEST_SERVER_TOKEN` or `TELEMETRY_ITOPS_QUERY_KEY` is empty, the corresponding `hmac.compare_digest` branch never succeeds for that method — ingest/query will 401 unless the other auth path works (e.g. browser token for ingest).

---

## 5. Authentication (`core/auth.py`)

### 5.1 Ingest — `require_server_or_browser_ingest_token`

Returns a context dict used by ingest:

- **Server path:** Header `X-Telemetry-Server-Token` must match `TELEMETRY_INGEST_SERVER_TOKEN` (timing-safe). Returns `{"kind": "server", "credential_key": "server"}`.
- **Browser path:** Header `X-Telemetry-Ingest-Token` format: `base64url(payload_json).hex_hmac_sha256` where HMAC is over the **raw base64 payload string** (not decoded bytes), using `TELEMETRY_INGEST_TOKEN_SECRET`.

**Signed payload requirements (browser):**

- `aud` must equal exactly `telemetry_ingest`
- `exp` Unix seconds; must be in the future
- `environment` if present must equal `settings.ENV` (from env var `TELEMETRY_ENV`)
- `allowed_sources` must be a JSON array (e.g. `["client_engagement","client_data"]`); ingest enforces `event.source in allowed_sources` in `ingest.py`
- Other fields: `sub` used as `credential_key` for rate limiting (defaults to string `"browser"` if missing)

Returns `{"kind": "browser", "claims": payload, "credential_key": str(payload.get("sub", "browser"))}`.

### 5.2 Query — `require_itops_query_key`

- Header `X-Telemetry-Query-Key` must match `TELEMETRY_ITOPS_QUERY_KEY` (timing-safe).
- Used by: `GET /telemetry/overview`, `GET /telemetry/overview/events`, `GET /telemetry/alerts`, `POST /telemetry/retention/run`.
- **Not** used by: `GET /telemetry/health`, `GET /telemetry/metrics` (currently public).

---

## 6. Event contract (`models/schemas.py`)

### 6.1 `TelemetryEvent`

- `extra="forbid"` — unknown JSON fields rejected by FastAPI/Pydantic.
- **Sources:** `server_api` | `client_data` | `client_engagement` | `telemetry_internal`
- **Priority:** `HIGH` | `MEDIUM` | `LOW` (default `LOW`)
- **Error categories:** `validation`, `auth`, `forbidden`, `not_found`, `dependency`, `timeout`, `rate_limit`, `server_error`, `unknown`
- **Lengths:** `event_id` 8–128; `event_name` 1–120; etc. per `Field`
- **Numeric bounds:** `schema_version` 1–10; `status_code` 100–599 if set; `duration_ms` 0–600000 if set; `sample_rate` (0,1]
- **Validator:** For `source` in `server_api` or `client_data`, `success` is **required** (bool). For `client_engagement` / `telemetry_internal`, `success` may be omitted.

### 6.2 `IngestBatchRequest`

- `events`: min 1, max 100 items (Pydantic). Ingest router **also** checks `len(events) <= TELEMETRY_EVENT_MAX_BATCH` (redundant if both are 100).

### 6.3 `IngestResponse`

- `accepted`, `deduped`, `dropped`, `queued` — see ingest flow below for exact semantics.

---

## 7. Ingest pipeline (`routers/ingest.py`)

**Endpoints:**

- `POST /telemetry/events` — body `{"events": [TelemetryEvent, ...]}`
- `POST /telemetry/events/single` — body is a single `TelemetryEvent`; if `created_at` missing, set to `datetime.now(timezone.utc)`

**Per-event order of operations:**

1. **Rate limit:** Key `f"{credential_key}:{event.source}"`. If denied → HTTP 429, header `Retry-After: 5`, metric `rate_limit_reject++`.
2. **Browser claims:** If `auth_ctx.kind == "browser"`, require `event.source in claims.allowed_sources` and optional env match → 403 on failure.
3. **Per-event size:** `json.dumps(event.model_dump(mode="json"))` UTF-8 length ≤ `EVENT_MAX_BYTES` → else 413.
4. **Metadata:** Replace with `sanitize_metadata(event.metadata)` from `core/redaction.py`.
5. **Sampling:** If `_should_sample` is false → count as `dropped`, `sampled_out++`, no DB reservation.
6. **Dedup reserve:** `storage.reserve_event_key(source, event_id)` — `INSERT ... ON CONFLICT DO NOTHING` into `telemetry_ingest_keys`. If row existed → `deduped++`, `deduped_pre_queue++`, skip.
7. **Enqueue:** `queue.enqueue(event)`. If false → `dropped++`, `release_event_key`, DLQ row with `failure_stage=queue_overflow`.
8. If enqueued → `queued++`, `accepted++`.

**Sampling logic (`_should_sample`):**

- Always keep: `priority == "HIGH"`, or `success is False`, or route in `CRITICAL_SERVER_ROUTES` (exact string match), or `table_or_rpc` in `CRITICAL_CLIENT_OPERATIONS`.
- Else deterministic hash: SHA-256 of key string, first 8 hex chars → uint / 0xFFFFFFFF compared to stream-specific threshold.

**Response field semantics:**

- `accepted` / `queued` — currently equal in implementation (both increment together for successful enqueue path).
- `deduped` — duplicate `event_id` per `source` after passing sampling.
- `dropped` — sampled out OR queue reject after reservation.

---

## 8. Priority queue (`core/queue.py`)

**Capacity split** from `QUEUE_MAX_SIZE` (integer division, minimum 1 each):

- `low_max = max(int(maxsize * 0.5), 1)`
- `med_max = max(int(maxsize * 0.3), 1)`
- `high_max = max(maxsize - low_max - med_max, 1)`

**Routing:** `HIGH` → high queue, `MEDIUM` → med, else → low.

**Enqueue when target full:**

- `LOW`: reject, `queue_drop_low++`
- `MEDIUM`: try discard one item from **low** queue (`queue_drop_low_for_medium++`); if low empty, `queue_reject_medium++` and reject
- `HIGH`: `queue_reject_high++` and reject

**Workers:** Each runs `_next_event`: poll high → med → low with `get_nowait`; if all empty, sleep 0.01s (busy-poll style).

**Persistence:** `storage.insert_event(event)`; on exception → DLQ `persist`, `persist_fail++`; on success `persist_ok++`, gauge `persist_last_ok_ts` set to asyncio loop time (not wall clock).

**Important:** Queue is **in-memory only**. Process exit drops queued items not yet written.

---

## 9. Redaction (`core/redaction.py`)

- Denied key names (case-insensitive): `authorization`, `auth`, `token`, `cookie`, `email`, `employee_code`, `asset_tag`, `serial_number`, `password`, `raw_ip`, `user_agent` → value replaced with `"[REDACTED]"`.
- Nested dicts recurse max depth 4; deeper → `{"_truncated": true}`.
- Lists truncated to first 50 elements; scalars run email and JWT-like regex substitution.
- This is **not** a full metadata allowlist; clients can still send other keys until a stricter policy is added.

---

## 10. Storage (`services/storage.py`)

**Postgres:** one `asyncpg` pool per process; DSN from `TELEMETRY_DATABASE_URL`. Tables live in schema `TELEMETRY_DATABASE_SCHEMA` (default `telemetry`). **Apply DDL once** from [`db/migrations/001_telemetry_schema.sql`](./db/migrations/001_telemetry_schema.sql) in the telemetry Supabase project.

### 10.1 Tables

| Table | Role |
|-------|------|
| `telemetry_ingest_keys` | PK `(source, event_id)`, `first_seen_at` — idempotency |
| `telemetry_events_success` | `server_api` / `client_data` with `success is True` |
| `telemetry_events_error` | `server_api` / `client_data` with `success is False` |
| `telemetry_events_general` | `client_engagement`, `telemetry_internal` (no HTTP method/status columns in schema) |
| `telemetry_dead_letter` | Failed validation persistence, queue overflow, etc. |
| `telemetry_access_audit` | Rows from `storage.audit_access` on protected query/retention calls |

**Indexes:** On `created_at`, `(environment, created_at)`, `(route_pattern, created_at)` for success/error; `request_id` on success/error. Column types: `timestamptz`, `metadata` as **JSONB**.

### 10.2 `insert_event`

- If `source` in `server_api`, `client_data`: insert into success or error table based on **boolean** `event.success`.
- Else: insert into `telemetry_events_general` with subset of columns (no `method`, `status_code`, `duration_ms`, `error_category` in insert list).

### 10.3 `overview(window_hours, env)`

- Filters: `created_at >= now() - ($1::int * interval '1 hour')`, optional `AND environment = $2`.
- Counts success and error rows; **p95** `duration_ms` on success via `percentile_disc(0.95) WITHIN GROUP (ORDER BY duration_ms)`.

**Window mapping (`routers/query.py`):** `15m` → 1 hour bucket (same as `1h`), `24h` → 24, `7d` → 168 hours.

### 10.4 `cleanup_retention`

- Deletes success rows older than `RETAIN_SUCCESS_DAYS`
- Deletes error rows older than `RETAIN_ERROR_DAYS`
- Deletes general rows older than `RETAIN_GENERAL_DAYS`
- Deletes ingest keys older than `RETAIN_KEYS_HOURS`
- Returns rowcounts (`success_deleted`, `error_deleted`, `keys_deleted`, `general_deleted`). Does not trim `telemetry_dead_letter` or `telemetry_access_audit` here.

### 10.5 `audit_access`

- Inserts one row into `telemetry_access_audit` via the same pool (used by `routers/query.py` after protected reads).

### 10.6 `db_health`

- `SELECT 1` on a pooled connection; returns `False` on failure (health endpoint surfaces `ok: false`).

---

## 11. Query API (`routers/query.py`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| GET | `/telemetry/overview` | `X-Telemetry-Query-Key` | Query params `window` (default `1h`), optional `environment`; audits access |
| GET | `/telemetry/overview/events` | Query key | Paginated raw events (`limit`/`offset`); audits access |
| GET | `/telemetry/alerts` | Query key | Returns `{"active_alerts": []}` placeholder |
| GET | `/telemetry/health` | None | `ok` = DB probe, `env`, `metrics` snapshot, `queue` sizes |
| GET | `/telemetry/metrics` | None | Raw metrics dict |
| POST | `/telemetry/retention/run` | Query key | Runs `cleanup_retention`, returns deleted counts |

Access audit rows use fixed actor string `"it_ops_api_key"` (not the real key).

---

## 12. Metrics (`services/metrics.py`)

- **Counters:** `incr(key, delta=1)` — e.g. `queue_enqueued`, `persist_ok`, `deduped_pre_queue`, `sampled_out`, `rate_limit_reject`, etc.
- **Gauges:** `set_gauge` — `queue_depth_total`, `persist_last_ok_ts`
- **Snapshot:** merges counters and gauges into one dict (values may be int or float)

---

## 13. Browser token signing (integrator contract)

Main backend must produce token:

1. Build payload JSON with at least: `aud`, `exp`, `allowed_sources` (array of strings), optional `environment` (must match `TELEMETRY_ENV` on server), optional `sub` for rate-limit key.
2. Base64url-encode payload **without** padding (or standard padding; decoder adds `===`).
3. `sig = HMAC_SHA256(secret, base64_payload_string).hexdigest()`
4. Token = `base64_payload + "." + sig`

Server verifies signature over the **same** base64 string it received before the dot.

---

## 14. Local development

1. Create a **telemetry** Supabase project (or use a Postgres with TLS). Run `db/migrations/001_telemetry_schema.sql` in the SQL editor.
2. Copy `.env.example` → `.env`; set `TELEMETRY_DATABASE_URL` (and ingest/query secrets).

```powershell
cd TelemetryServer
pip install -r requirements.txt
copy .env.example .env
# Edit .env — required: TELEMETRY_DATABASE_URL, TELEMETRY_* tokens
python check_db.py
uvicorn main:app --reload --host 0.0.0.0 --port 8010
```

- OpenAPI: `http://localhost:8010/docs`
- Health: `GET http://localhost:8010/telemetry/health`

---

## 15. Deployment on Vercel

### 15.1 Critical serverless constraints

- **Postgres is durable** — data lives in Supabase, not on the Vercel instance disk. Tune `TELEMETRY_DB_POOL_MAX_SIZE`: each warm serverless instance holds up to that many DB connections; too many instances can exhaust Supabase connection limits (prefer **session pooler** / limits documented by Supabase).
- **In-memory queue:** Workers and queues exist **per warm instance** only. Cold starts reset metrics and queues. **Do not rely** on cross-request queue durability.
- **Cron in repo `vercel.json`:** The file may reference `"path": "/cron/archive"` — that route **does not exist** in this TelemetryServer codebase. Remove the cron entry, implement a handler, or call `POST /telemetry/retention/run` from an external scheduler with `X-Telemetry-Query-Key`.

### 15.2 `vercel.json` vs project layout

Current [vercel.json](vercel.json) points at the root ASGI module:

```json
{
  "version": 2,
  "builds": [{ "src": "/main.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "/main.py" }]
}
```

If deployment fails, confirm the Vercel project **root directory** is `TelemetryServer/` and that `@vercel/python` resolves `main:app` from `main.py`. Alternative: add `api/main.py` with `from main import app` and route `dest` to that file (some teams prefer an `api/` entry).

### 15.3 Environment variables on Vercel

In the Vercel project dashboard → Settings → Environment Variables, set at least:

- `TELEMETRY_DATABASE_URL` — Supabase Postgres URI (service role / direct connection string)
- `TELEMETRY_ENV` — e.g. `production` (must match signed token `environment` when tokens enforce it)
- `TELEMETRY_INGEST_SERVER_TOKEN` — strong random string
- `TELEMETRY_INGEST_TOKEN_SECRET` — strong random secret (same as main app uses to sign browser tokens)
- `TELEMETRY_ITOPS_QUERY_KEY` — strong random string for query/retention
- Optional: `TELEMETRY_DATABASE_SCHEMA`, pool sizes, `TELEMETRY_DB_SSL`, queue sizes, sampling, rate limits, retention days

**Python version:** Match `@vercel/python` supported runtime; pin in `package.json` or Vercel project settings if required.

### 15.4 CORS

- `main.py` registers `CORSMiddleware` with `allow_origins=settings.ALLOWED_ORIGINS` (env `TELEMETRY_ALLOWED_ORIGINS`). **Production:** add your real client origin(s); dev defaults include `http://localhost:5173` and `127.0.0.1:5173`. Without a matching origin, browser preflight (`OPTIONS`) can fail before ingest runs.
- Alternative architecture: proxy ingest through the main API using `X-Telemetry-Server-Token` so the telemetry host is never browser-exposed (optional hardening).

### 15.5 Production hardening checklist (Vercel)

- [ ] Confirm `vercel.json` matches repo layout; remove or implement `/cron/archive` (or external retention cron)
- [ ] Supabase migrations applied; connection limits understood (pool max × concurrent instances)
- [ ] Restrict `/telemetry/metrics` and `/telemetry/health` if they leak operational data (e.g. IP allowlist, or auth)
- [ ] Rotate `TELEMETRY_*` secrets periodically
- [ ] Schedule retention via external cron hitting `POST /telemetry/retention/run` with query key over HTTPS

---

## 16. File map (quick reference)

```
TelemetryServer/
├── main.py                 # FastAPI app, lifespan, pool + route mount
├── requirements.txt
├── .env.example
├── check_db.py             # Quick SELECT 1 against TELEMETRY_DATABASE_URL
├── vercel.json
├── TELEMETRY_SERVER_README.md
├── db/migrations/
│   └── 001_telemetry_schema.sql
├── core/
│   ├── settings.py
│   ├── auth.py
│   ├── queue.py
│   ├── ratelimit.py
│   └── redaction.py
├── models/
│   └── schemas.py
├── routers/
│   ├── __init__.py
│   ├── ingest.py
│   └── query.py
└── services/
    ├── storage.py
    └── metrics.py
```

---

## 17. Known limitations (honest)

- No rollup tables; `overview` scans raw success/error tables.
- No alert engine; `/telemetry/alerts` is empty.
- IT Ops auth is shared secret only, not Supabase JWT + role.
- `telemetry_events_general` not included in `overview` counts.
- `GET /telemetry/metrics` unauthenticated.
- Vercel serverless + in-memory queue: queued-but-not-flushed events still lost on cold/instance recycle (Postgres rows are durable once written).

This README reflects the code as of the last update to `TelemetryServer/`. If behavior changes, update this file in the same PR.
