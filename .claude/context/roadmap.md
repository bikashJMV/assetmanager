# Improvement roadmap (backlog — promote ONE item at a time into CLAUDE.md Current Focus)

Goal: scalable to 500 active users, redesigned consistent UI, real e2e coverage. Full analysis
2026-07-18. Each item below should become a `/spec` before implementation.

## 1. Scalability (server) — ranked by impact

1. Multiple uvicorn workers (`Server/Dockerfile` CMD — currently single worker) or replicas.
2. Raise asyncpg pool (`POSTGRES_MAX_POOL_SIZE`, default 10); consider PgBouncer.
3. Cache employee-context lookup in `AuthMiddleware` (short TTL keyed by JWT `sub`) — currently a
   DB query on EVERY request (`core/auth_middleware.py` → `resolve_employee_for_sub`).
4. Move reportlab PDF + PIL QR rendering off the event loop (`run_in_executor` / background task) —
   currently blocks all requests (`services/qr_label_pdf_service`, `audit_trail_pdf_service`,
   `asset_history_pdf_service`, `qr_service`).
5. SQL-side aggregation + short cache for `overview-analysis`, `dashboard-stats`,
   `public-dashboard` (`routers/api_v1_meta.py` — currently full-scan + Python loops).
6. `pg_trgm` GIN indexes for the 8-column `ILIKE '%term%'` search (`repositories/asset_repository.py`).
7. Rate limiting (slowapi or nginx `limit_req`) — especially public `/public-scan`,
   `/public-dashboard`; `429 RATE_LIMITED` already in error map, never enforced.
8. Move AuthNexus IDP sync out of request path (`routers/api_v1_employees.py` create/update/role).
9. Adopt Alembic migrations (prereq for index/schema work).
10. Load test with k6/locust to prove the target (list/detail/dashboard endpoints).

## 2. Scalability (client)

- `useInfiniteQuery` + virtualization (`@tanstack/react-virtual`, already a dep) for AllAssets and
  Employee lists; kill `limit: 1000` convenience fetches.
- Sane global `staleTime` (currently 0 → refetch-heavy).

## 3. UI redesign

- Keep Tailwind + semantic token system. Build primitive set (Button, Input, Select, Card, Table,
  Modal, Badge) on existing tokens; refactor pages onto primitives incrementally.
- Fix `ToastProvider` hardcoded light colors → semantic tokens (dark-mode broken today).
- Pick ONE pagination UX (`DataPagination` vs `LoadMorePagination`).
- Finish api.ts → services/queries migration; delete dead code (`callBack.authNexus.tsx`,
  `User.Signin.tsx` if confirmed unused).

## 4. Network drop/restore toast (Current Focus — see CLAUDE.md)

`useOnlineStatus` hook (`useSyncExternalStore` + online/offline events), persistent offline toast,
"Back online" toast on restore, debounce flapping 2-3s, optional `/api/health` reachability check,
wire TanStack Query `onlineManager` for pause/resume.

## 5. Testing

- Playwright e2e under `Client/e2e/`: auth fixture (storage-state), asset list/search, create asset,
  assign→return, QR scan public+authed, employee CRUD, recycle bin, role gating, silent token
  refresh mid-session, offline/online toast (`context.setOffline`).
- Server: httpx/TestClient integration tests (currently only narrow unit tests).

## 6. BFF/auth edge cases (protected — human pairs on these)

- Add `Secure` + `Max-Age` to refresh cookie; multi-tab refresh race; delete legacy `core/auth.py`;
  wire-or-delete `require_backend_api_key`; consolidate duplicate assign/return routers.

## 7. Hygiene

- `DB/postgres/` live PGDATA committed to repo — gitignore it (human decision, destructive-ish).
- `v_warranty_notifications` emits `gen_random_uuid()` per row per read — unstable notification IDs.
- Correlated subqueries in employee list/portfolio degrade with growth.
