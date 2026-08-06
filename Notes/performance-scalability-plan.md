# Performance & Scalability Plan — AMS

> Goal: comfortably serve **500 active users/day** (≈ 30–80 concurrent at peak, bursts higher).
> Target SLO: **P95 API latency < 500 ms**, **0 errors** at 200 concurrent virtual users (VUs).
>
> Decisions locked (2026-07-18): start with **A1–A3** (capacity + baseline); caching is
> **in-memory per-worker** via `cachetools` (already a dependency) — no Redis for now.
>
> Rules: each task is ONE small loop iteration — change → test → verify → (rollback ready).
> Every task re-runs the k6 baseline so we always have before/after numbers. Auth files are
> protected (`.claude/config.json` `protectedPaths`) → B1 needs explicit human sign-off.
> This is a PLAN ONLY. No code is written until each task is picked up.

---

## Why this matters (measured, from the code audit)

Current ceiling (both real, both cheap to fix):
- **Server runs a single Uvicorn worker** (`Server/Dockerfile` CMD) → one event loop, one core.
- **asyncpg pool max = 10** for the whole process (`core/settings.py` `POSTGRES_MAX_POOL_SIZE`).
- **Auth middleware does a DB query on EVERY request** (`core/auth_middleware.py` →
  `resolve_employee_for_sub`) — no caching.
- **PDF (reportlab) + QR (PIL) render inline on the event loop** → one export stalls all requests.
- **Dashboard/analysis endpoints full-scan + aggregate in Python** (`routers/api_v1_meta.py`).
- **Search = leading-wildcard ILIKE over a 6-table view**, no trigram index.
- **No rate limiting** anywhere; public endpoints uncached.

Around 30–80 concurrent requests, requests serialize on `pool.acquire()` and the single event
loop — that is exactly the peak a 500/day audience produces. Fixing A+B lifts peak capacity from
~tens to several hundred concurrent.

---

## Phase A — Capacity + baseline (config only, zero app-code risk)

### A0. k6 load-test harness (do this FIRST — it measures everything after)
- **Add:** `perf/k6/` — a k6 script (`load.js`) exercising a realistic mix:
  - 60% `GET /api/v1/assets?page..` (list), 20% `GET /api/v1/assets/{ref}/detail`,
    15% `GET /api/v1/meta/dashboard-stats`, 5% `GET /api/v1/meta/public-dashboard`.
  - Auth: pre-mint one access token via the BFF flow (headless login as a seeded test user),
    reuse it across VUs (avoids hammering authNexus / 429).
  - Stages: ramp 0→50→100→200 VUs, hold each 1 min.
- **Add:** `perf/k6/README.md` + `perf/baseline.md` (results table: VUs, P50/P95, error %, RPS).
- **Test/verify:** `k6 run perf/k6/load.js` completes; baseline numbers written to `perf/baseline.md`.
- **Rollback:** delete `perf/` (pure additive, no app impact).
- **Note:** k6 installed locally or run via `grafana/k6` docker image. No app code touched.

### A1. Multiple Uvicorn workers
- **Change:** `Server/Dockerfile` CMD → `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4`
  (or `gunicorn -k uvicorn.workers.UvicornWorker -w 4`). Make worker count an env var
  `WEB_CONCURRENCY` (default 4) so it is tunable per host CPU.
- **Watch-out:** anything relying on single-process in-memory state (the JWKS cache is fine —
  re-fetched per worker; the future auth cache in B1 is per-worker by design). App startup/pool
  lifecycle runs per worker — confirm pool opens cleanly ×4.
- **Test:** `docker compose up -d --build server`; `docker compose logs server` shows 4 workers
  booting, each opening its pool; `/api/health` 200.
- **Verify:** re-run A0 k6 — RPS scales up, P95 drops at 100–200 VUs vs baseline.
- **Rollback:** revert Dockerfile CMD to single worker.

### A2. Right-size the DB pool (+ Postgres max_connections headroom)
- **Change:** env `POSTGRES_MAX_POOL_SIZE=20`, `POSTGRES_MIN_POOL_SIZE=2` (per worker).
  With 4 workers that is up to 88 connections — confirm Postgres `max_connections`
  (default 100) covers it, or lower pool to ~15/worker. Document the math in `perf/baseline.md`.
- **Test:** pool-exhaustion probe — 150 parallel list requests; assert **zero** `pool.acquire`
  timeouts / `command_timeout` errors in logs.
- **Verify:** k6 at 200 VUs shows no connection-wait latency spikes.
- **Rollback:** revert env values.
- **Dependency:** informs whether D3 (PgBouncer) is needed — if we hit Postgres
  `max_connections`, do D3 before scaling workers further.

---

## Phase B — Kill per-request hot spots (small code; biggest latency wins)

### B1. Auth-context cache  ⚠️ PROTECTED FILE — needs human sign-off
- **Change:** in `core/auth_middleware.py`, wrap `resolve_employee_for_sub` in a `cachetools.TTLCache`
  keyed by JWT `sub` (TTL 60 s, maxsize ~2000). Cache the `EmployeeContext`, not the token.
  Per-worker cache (acceptable staleness ≤ 60 s for role/active changes).
- **Edge cases to cover in tests:**
  - Cache hit returns same context without a DB call.
  - Entry expires after TTL → re-queries.
  - A deactivated/role-changed employee is stale for ≤ TTL (documented, acceptable) — OR add an
    explicit cache-bust on employee update/role-change endpoints (preferred; wire in
    `api_v1_employees` update/role paths).
- **Test:** unit test with a fake resolver counting calls: N requests same sub → 1 DB call.
- **Verify:** k6 — per-request DB query count for repeat users drops ~to 0; P95 drop.
- **Rollback:** remove the cache wrapper (pure addition).

### B2. Cache dashboard / analysis / public endpoints
- **Change:** `cachetools.TTLCache` (30–60 s) around `dashboard-stats`, `public-dashboard`,
  `overview-analysis` in `routers/api_v1_meta.py` (or a small `services/cache.py` helper).
  Key by (endpoint + any filter args). Public endpoints get the longest TTL.
- **Test:** call twice within TTL → second served from cache (assert DB not hit / timing);
  after TTL → recomputed. Correctness: cached payload == fresh payload.
- **Verify:** k6 dashboard mix P95 drops sharply; DB load flat under repeated dashboard hits.
- **Rollback:** remove cache wrapper.

### B3. SQL-side aggregation for overview-analysis
- **Change:** replace the Python row-by-row loops in `overview-analysis` (`api_v1_meta.py`) with
  SQL `GROUP BY` aggregations (status counts, category breakdown, employee load).
- **Test:** snapshot the current JSON output for a known dataset; assert the SQL version produces
  identical JSON (add a fixture-based test).
- **Verify:** latency on large dataset drops; `EXPLAIN ANALYZE` shows aggregation in DB.
- **Rollback:** revert to Python aggregation (keep old function until verified).

---

## Phase C — Offload blocking work (free the event loop)

### C1. Move PDF/QR rendering off the event loop
- **Change:** wrap reportlab + PIL calls in `await run_in_executor(...)` (thread pool) in
  `services/qr_label_pdf_service`, `audit_trail_pdf_service`, `asset_history_pdf_service`,
  `qr_service.generate_asset_qr_png_bytes`. Bound the pool (e.g. 2–4 threads) so heavy exports
  don't starve workers.
- **Test:** integration — fire one large PDF export + 20 concurrent list requests; assert list
  P95 stays low (event loop not blocked). Compare against pre-change (list latency spikes today).
- **Verify:** k6 scenario with a background export running.
- **Rollback:** remove the executor wrapper.

### C2. Move AuthNexus IDP sync out of the request path
- **Change:** employee create/update/role-change → schedule `_sync_employee_to_auth_nexus` as a
  background task (`asyncio.create_task` / FastAPI `BackgroundTasks`) instead of inline `await`
  (bulk sync already offloaded). Keep the response fast.
- **Edge case (ties to the create-user finding):** since sync becomes async, the create response
  can't include `auth_user_id` synchronously. Either (a) return `sync_status: "pending"` and let
  the client poll `/employees/{id}`, or (b) keep create inline but move only update/role to
  background. **Also fix the silent-failure gap**: surface a `sync_status`/warning so an admin
  knows if provisioning failed (today it 201s even when the auth account wasn't created).
- **Test:** create returns < 200 ms; a poll shows the account provisioned shortly after; a forced
  sync failure surfaces `sync_status: "failed"` rather than a false success.
- **Verify:** k6 create-employee latency; failure-injection test.
- **Rollback:** revert to inline sync.

---

## Phase D — Database scaling

### D1. Adopt Alembic migrations (prerequisite for D2)
- **Change:** add Alembic, baseline the current schema as the first revision (autogenerate against
  `DB/init.sql` / live DB), wire `alembic upgrade head` into deploy.
- **Test:** on a throwaway DB, `alembic upgrade head` reproduces the current schema; `downgrade`
  works for the baseline.
- **Verify:** schema diff (migrated vs `prod_schema.sql`) is empty.
- **Rollback:** migrations are additive; don't run them in prod until verified on staging.

### D2. Search indexes (pg_trgm GIN)
- **Change:** migration adding `pg_trgm` extension + GIN trigram indexes on the base columns behind
  the asset-search ILIKE (`asset_repository.py` search) — asset_tag, model, manufacturer, holder…
- **Test:** `EXPLAIN ANALYZE` on a search query shows a bitmap/index scan, not seq scan; result set
  identical to pre-index.
- **Verify:** k6 search-heavy scenario P95 drop on a large table.
- **Rollback:** `DROP INDEX` migration.

### D3. PgBouncer (only if A2 shows connection pressure)
- **Change:** add PgBouncer (transaction pooling) to `docker-compose.yml` between app and Postgres;
  point `POSTGRES_HOST` at it. Reduces raw Postgres connection count under many short queries.
- **Test:** connection count on Postgres stays flat while app workers/replicas scale.
- **Verify:** k6 at high VUs — no `too many connections`; latency stable.
- **Rollback:** point app back at Postgres directly.
- **Gate:** skip if A2 shows plenty of `max_connections` headroom.

---

## Phase E — Client performance

### E1. Sane global staleTime
- **Change:** `queryClient` default `staleTime: 30_000` (currently 0 → refetch-heavy); keep
  reference data (categories, departments) longer (5 min).
- **Test:** existing behavior intact; network panel shows fewer refetches on navigation.
- **Verify:** Playwright — navigating between pages doesn't refire settled queries.
- **Rollback:** revert queryClient defaults.

### E2. Infinite + virtualized lists
- **Change:** `useInfiniteQuery` + `@tanstack/react-virtual` (already a dep) on AllAssets and
  Employee lists; remove the `limit: 1000` convenience fetches. (Pairs with the UI Phase-4 rewrite
  of those pages, so we don't touch them twice.)
- **Test:** Playwright — large list scrolls; DOM node count stays roughly constant (virtualized);
  "load more"/scroll fetches next page.
- **Verify:** memory/DOM count flat vs today's accumulate-everything.
- **Rollback:** revert to current pagination.

---

## Phase F — Protection & proof

### F1. Rate limiting
- **Change:** slowapi (app-level) or nginx `limit_req` (edge). Tighter buckets on public
  `/public-scan`, `/public-dashboard`, and `/api/auth/refresh`; looser on authenticated reads.
  (`429 RATE_LIMITED` is already defined in the error map, just never enforced.)
- **Test:** exceed the bucket → 429 with the standard envelope; a normal user stays under and is
  unaffected.
- **Verify:** k6 burst scenario triggers 429s only past threshold.
- **Rollback:** remove limiter middleware / nginx directive.

### F2. Final load test to the target
- **Change:** none — run A0's k6 at **200 VUs sustained** after A–D land.
- **Verify:** **P95 < 500 ms, 0 errors, stable RPS** → the 500-user goal is proven. Record final
  numbers in `perf/baseline.md` next to the pre-change baseline.

---

## Suggested execution order (each = one loop iteration)

```
A0 (k6 baseline)  →  A1 (workers)  →  A2 (pool)            ← capacity, measured
   →  B1 (auth cache*)  →  B2 (dash cache)  →  B3 (SQL agg) ← hot-spot latency
   →  C1 (PDF offload)  →  C2 (IDP async + silent-fail fix) ← free the event loop
   →  D1 (alembic)  →  D2 (trgm index)  →  [D3 pgbouncer?]  ← DB scaling
   →  E1 (staleTime)  →  E2 (infinite+virtual)             ← client
   →  F1 (rate limit)  →  F2 (prove 200 VUs)               ← protect + prove
```
`*` B1 edits a protected auth file → human sign-off required at that step.

**80/20:** A1 + A2 + B1 + C1 deliver most of the gain. Everything else hardens and proves it.

## Cross-cutting testing rules
- Every task re-runs the A0 k6 script and appends before/after to `perf/baseline.md`.
- Server changes: pytest (`tests/` live-auth suite + any new unit/integration tests) stays green.
- Client changes: `npm run build` + Playwright (`Client/e2e/`) stay green.
- Nothing merges without its own verify passing; all steps reversible.
