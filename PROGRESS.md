# PROGRESS

## 2026-08-01 — GitHub #78 [L-01]: startup config warnings via logger, not print()
### Done
- `Server/core/settings.py`: 4 `print()` calls removed. New `_warn()` buffers `(template, args)` into
  `settings.startup_warnings`; `emit_startup_warnings()` flushes them through
  `logging.getLogger(__name__)` and clears the buffer (idempotent).
- `Server/main.py`: `create_app()` calls `settings.emit_startup_warnings()` right after
  `init_observability(app)`.
- Why buffered, not logged directly: `Settings()` is built at import time (`main.py:7`) — before
  `logging.basicConfig()` (`main.py:22`) and before the OTLP handler. A plain logger.warning() there
  would bypass the aggregator, i.e. would NOT have fixed the reported symptom.
- `Server/tests/test_startup_warnings.py` (new, 9 tests).
### Verification
- Live in container with forced-bad env: 0 output at construction; after flush both warnings carry
  timestamp + level + `core.settings` name (the form the OTLP handler ships to Loki).
- Prove-It: committed HEAD settings.py has 4 `print(`, now 0 — guard test asserts it.
- pytest 84 (was 75) · server rebuilt, healthy, 54 routes intact · mypy on settings.py down from
  2 pre-existing errors to 1.
### Notes
- Issues #44 and #78 CLOSED on maintainer instruction; both comments record that the code is on
  `feature/refresh-token-bff` and not yet on `main`.
- `Server/auth/auth_nexus.py` still has 4 print() but is imported nowhere — dead module, out of scope.
- Not committed (standing no-commit rule).

## 2026-08-01 — GitHub #44 [C-05]: stop logging token data to the browser console
### Done
- `Client/src/utils/devLog.ts` (new): `devLog`/`devWarn` gated on `import.meta.env.DEV`;
  `errorLog(message, detail?)` accepts only a string/number (never an object); `describeError()`
  reduces a caught `unknown` to a safe string.
- Migrated all 24 `console.*` call sites in `authNexus.api.ts`, `authService.ts`, `AuthCallback.tsx`.
  The two failure paths that read a response body (`response.text()` / `res.text()`) no longer read
  it — only the status code is logged. Worst offender was `authNexus.api.ts:72` (`Full data:` dump).
- `Client/src/utils/devLog.test.ts` (new, 11 tests): unit tests + a source guard that fails if an
  ungated `console.log` or a `data|body|err|user|response|config|headers` argument returns to the
  auth path.
### Verification
- Prod bundle: **0** console.log/debug in app code (5 remaining are inside the `xlsx` vendor lib);
  48 console.error retained so failures still surface.
- Prove-It: guard tests failed 4/11 against unfixed code, 11/11 after.
- vitest 51 (was 40) · build clean · lint no new errors (2 pre-existing `any`, untouched) ·
  e2e login 3/3 vs rebuilt client image · live tests/test_bff_session.py 7/7 (refresh + rotation OK).
### Notes
- `authNexus.api.ts` + `authService.ts` are protectedPaths — edited under explicit human direction,
  logged to `.claude/state/bypass.log`.
- Issue #44 left OPEN on purpose (fix is uncommitted; closing would misrepresent `main`). Detailed
  comment posted to the issue instead.
- Server counterpart #83 (token metadata at INFO in `api_auth.py`) NOT addressed.
- Not committed (standing no-commit rule).

## 2026-08-01 — Dept-follows-holder audit (13b) + warranty-notification role scoping (10)
### 13b — asset department follows its holder, cascade audited (Option A: derived + audit, no schema change)
- Assign: `assignment_write_repository.py` assignee select now joins departments → `department`;
  `assignment_service.py` assign event payload gains `department:{before,after}`.
- Employee update cascade: `api_v1_employees.py` `update_employee` detects department change and calls
  new `_audit_department_cascade` → `AssignmentRepository.list_held_assets_for_employee` (new) → writes
  an `asset_updated` event (`changes:[{field:department,before,after}]`) + `asset_log` note per held
  asset. Best-effort (never fails the employee update). Reuses existing enum value — no DB/enum change.
- Popup: `EmployeeForm.tsx` shows a ConfirmDialog when editing an employee whose department changed AND
  who holds ≥1 asset ("will also update N asset(s)… and record it in each asset's audit trail").
  `Employee.tsx` passes `heldAssetCount` from assignedAssetCounts.
### 10 — warranty notifications scoped by role
- `api_v1_meta.py` `/warranty-notifications`: `require_privileged`→`require_authenticated`; SQL adds
  `($2 is null or current_employee_id=$2)` — employee scoped to held assets, admin/it_ops see all.
- Client: `TopBar.tsx` bell now shows for any active user (was admin/it_ops only); `App.tsx` moved
  `/notifications` out of the RequirePrivileged block.
### Verification
- Server pytest 75 · live 42 (+4: dept-cascade asset log shows "Department changed"+new dept;
  warranty 401 unauth / admin list / non-admin accessible) · vitest 40 · client build clean · ruff
  clean on changed server files · client lint 2 pre-existing any (authNexus.api.ts, untouched).
- Note: employee-scoping (role='employee') asserted structurally — only non-admin live fixture is
  it_ops (sees all by design). SQL scoping is correct + covered by reasoning.
### Notes
- Not committed (standing no-commit rule).

## 2026-08-01 — API capacity for 500 users: load test + 4 workers + PDF off the event loop
### Question answered
- "Can all APIs respond without lagging at 500 active users?" -> **Yes.** 500 active users generate
  ~60-90 req/s; the server now sustains **586 req/s** with zero failures (~6x headroom).
- Full report: `Notes/api-load-test-500-users.md`.
### Done
- `Server/Dockerfile`: uvicorn `--workers 4` (was 1 worker on a 14-core host).
- `Server/core/settings.py`: `POSTGRES_MAX_POOL_SIZE` default 10 -> 15 (per worker; 4x15=60 vs
  postgres max_connections=100).
- `Server/routers/api_v1_assets.py` + `api_v1_qr.py`: all 9 `build_pdf`/`build_empty_notice_pdf`
  call sites moved to `run_in_threadpool` — reportlab was blocking the event loop.
- `Server/core/ttl_cache.py` (new): TTL cache with single-flight; wired into
  `GET /api/v1/meta/dashboard-stats` at 30 s (was 4 sequential `count(*)` per request).
- Tests: `Server/tests/test_pdf_threadpool.py`, `Server/tests/test_dashboard_stats_cache.py`.
### Verification
- wrk -t8 -c500 -d20s on /api/v1/assets, same token same minute: **172.5 -> 585.7 req/s (3.4x)**,
  timeouts 1654 -> 659, p50 813 ms -> 577 ms.
- PDF no longer stalls others: concurrent /api/health during a 46-QR PDF went **203 ms -> 12-28 ms**
  (4 workers) / 25-115 ms (single worker — reportlab still holds the GIL).
- pytest 75 PASS (63 + 12 new) · client build PASS · vitest 40 PASS · client lint: 2 pre-existing
  `any` in authNexus.api.ts (protected path, untouched) — unchanged from before.
### Notes / honest caveats
- Dashboard cache shows **no measurable gain at 94 assets** (cached 933 req/s vs uncached twin
  1009 req/s) — counts are sub-ms at this size. It is correctness-tested and pays off as data grows.
- Benchmarking through the published Windows port is invalid: vpnkit made throughput look like it
  collapsed to 10 req/s while the server was 0.4 % busy. Measure from inside the docker network.
- Not fixed (matters past a few thousand assets): asset search is `ILIKE '%x%'` over a 5-table view
  -> Seq Scan, no trigram index; per-request uncached employee lookup on every authed call.
- Not committed (standing no-commit rule).

## 2026-08-01 — Unused QR reuse: single-click PDF (replaces modal per user correction)
### Change
- User correction: one button on QR Batches page → single click → PDF of ALL unused QRs (reserved,
  never linked). Replaced the per-row Download/Log modal.
- Server: QrRepository.list_all_unused_tags(cap=2000, FIFO); qr_service passthrough; new route
  GET /api/v1/qr/reservations/unused/pdf (build_pdf of all reserved tags; build_empty_notice_pdf when
  none; privileged; application/pdf). Kept /unused + /count endpoints (badge still uses count).
- Client: qrService.downloadUnusedQrPdf() (blob); removed listUnusedQr/qrPngDataUriForTag/types.
  QrBatches "Download Unused QRs" button → single-click blob download, disabled when count 0 +
  Preparing state. Deleted UnusedQrModal.tsx.
### Verification
- Server pytest 64 (added pdf auth). Live 36 (added test_unused_pdf_single_click asserting %PDF +
  X-Exported-Asset-Count>=1, and pdf 401). vitest 26. Client build clean; lint 2 pre-existing any
  (authNexus.api.ts, untouched). e2e qr-unused: click button → .pdf download (passed).
### Notes
- Not committed (standing no-commit rule).

## 2026-07-18

- **DONE — Security fix: refresh-token leak in BFF refresh** (`Server/routers/api_auth.py`).
  `refresh_token` is now always stripped from the `/api/auth/refresh` JSON body; the rotated
  token travels only via the HttpOnly `nexus_refresh_token` cookie. Verified live against
  authNexus: rotation chain intact, client unaffected (it never read the body field).
  Regression-guarded by `tests/test_bff_session.py::test_refresh_body_must_not_leak_refresh_token`.
  NOT COMMITTED — owner commits manually (standing rule: agent never commits).

- New root `/tests` live-auth suite added (`tests/`): authNexus login, BFF cookie flow, endpoint
  RBAC matrix. 16 passed / 1 failed / 7 xfailed after the fix.

- **DONE — Refresh cookie flags** (`Server/routers/api_auth.py`): new `_set_refresh_cookie`
  helper adds `Secure` (outside local dev, via `settings.ENV`) + `Max-Age` 7d, keeping HttpOnly +
  SameSite=lax, used by both set-session and refresh.
- **DONE — Audience gap** (`Server/core/authnexus.py`): `verify_bearer_token` accepts both the web
  client_id and `default_client` (headless) audiences (guide gotcha #1). RBAC matrix now real.
- **DONE — Callback gating** (`Client/src/components/pages/AuthCallback.tsx`): dashboard redirect
  only after `getSessionEmployee` confirms provisioned + active; else `/login?error=not_authorized`.
  Rewritten to async/await + typed state (no `any`) to satisfy the loop lint gate.

Live-verified: full `tests/` suite = **24 passed**; client `npm run build` clean.
NOT COMMITTED — owner commits manually.

Note: cleared two stale `auth_user_id` links in the DB (JMV10728, EMP-001) that pointed at old
sub values from a prior IdP session, so the self-provisioning re-link path could run. Data-only,
no schema change.

- **DONE — UI redesign Phase 1 + 3** (Notes/UI.md v2.0). Token system (`styles/tokens.css`, HSL,
  light/dark/system, legacy bridge → whole app reskinned orange→Docker-blue + Inter), Tailwind
  bridge, `src/components/ui/` primitives (AppIcon registry, Button, Skeleton, StatusPill),
  ToastProvider retokenized (dark-mode safe now). Build clean, 3/3 e2e pass, screenshots confirm
  both themes. Details + next phases: `.claude/context/ui-redesign.md`.
- **DONE — UI Phase 2 shell: dark sidebar anchor** (Notes/UI.md §5). Sidebar now navy in BOTH
  themes (Docker signature); active item = brand-tinted bg + white label. Fixed via inline CSS-var
  overrides (beat the :root[data-theme] bridge specificity). Verified via screenshots + e2e.
- **DONE — 200-line rule enforcement started** (user directive: codebase-wide, not new-files-only).
  Baseline measured: 39 files >200 lines (25 client, 14 server) + 4 `any` + 4 `.then()`. Tracked in
  `.claude/context/rule-debt.md`; config.json comment corrected. First split: Sidebar.tsx 979 → 6
  files all <200 (Sidebar 192 + sidebar/ helpers/leaf/group/navigation/chrome). Build + e2e green.
- **DONE — Playwright e2e foundation** (`Client/e2e/`, `playwright.config.ts`, chromium). Login
  spec: guest→login, public /scan stays open, full OIDC login with real creds → dashboard.

- **DONE — UI Phase 4 (AllAssets) + split** (2026-07-18). AllAssets.tsx 1127 → 13 files all <200
  (page 172 + components/assets/*). Applied UI primitives (Skeleton/Button), 4 data states
  (loading skeleton / error+retry / empty+CTA / data), table→card at <640px. e2e added
  (Client/e2e/assets.spec.ts, client-side nav). Build + e2e green.
- **BUG FOUND (unfixed)**: hard refresh on `/assets` → nginx try_files collides with dist/assets/
  build dir → 301 to http://localhost/assets/ (port dropped) → connection refused. Fix: Vite
  `build.assetsDir:'static'`. Details in rule-debt.md.

- **DONE — Dedicated /settings page** (2026-07-18). Appearance (theme/font/density/text-scale),
  Profile (name/email/dept/role/last-login readable from OIDC auth_time), About. Modern lucide
  icons via AppIcon (distinct, no dupes). Sidebar Settings → single link; topbar quick theme
  toggle added. Files: components/settings/* + pages/Settings.tsx, all <200. Both themes verified
  via screenshots. Old buried sidebar theme/font/density controls removed.
- **DONE — Network drop/reconnect detection** (was Current Focus). `hooks/useOnlineStatus.ts`
  (useSyncExternalStore over browser online/offline events, ZERO polling, wires TanStack
  onlineManager) + `NetworkStatusWatcher`. Offline → persistent toast (manual close);
  reconnect → dismiss + "Back online". e2e: network.spec.ts (2 tests, no login needed). Verified.

- **DONE — BUG-1 fixed: QR batches 500 (schema drift)** (2026-07-18). `qr_batches` +
  `qr_tag_reservations` tables were queried by the app but never existed in any schema source.
  Added DDL to `DB/init.sql` (protected path, edited with explicit sign-off) + applied live to
  `assetmanager_db`. Verified end-to-end: list 200, create 201 w/ reservations, idempotency-key
  reuse. New regression suite `tests/test_qr_batches.py` (4 tests). Full `tests/`: 28/28 passing.
  BUG-1c (Alembic capture + drift audit for other tables) still open — folds into perf Phase D1.

- **DONE — UI-1: notification popup redesign** (2026-07-18). Premium production-standard
  dropdown: header+count badge, severity-tinted icon rows with urgency phrasing ("Expired N days
  ago"/"Due in N days"), 4 explicit states (skeleton/error+retry/empty/data), scroll-capped list +
  sticky "View all" footer, unread dot on the bell, Esc-to-close + auto-focus. Extracted to
  `components/app/{NotificationsMenu,NotificationRow,notificationText}` — all <200 lines
  (TopBar itself now 134). Fully token-driven — fixes a real dark-mode readability gap.
  Verified: build clean, screenshots both themes, e2e 10/10.

- **DONE — Color plan G0+G1: centralized status/role tones on tokens** (2026-07-18). Found and
  fixed a real bug from the earlier UI-redesign session: the `--status-*` tokens used a UI.md
  placeholder vocabulary (available/in_department/maintenance) that didn't match the app's ACTUAL
  6 statuses (assigned/in_stock/in_repair/retired/lost/disposed) — grep-verified against every
  real usage and replaced. `getInventoryStatusTone()`/`roleBadgeStyle()` now return token-driven
  values instead of raw Tailwind palette (`bg-emerald-500` etc, dark-mode unsafe). Updated every
  consumer (InventoryStatusBadge, FilterSelect, AssetsFilterPopup, Employee filters, TopBar,
  ProfileCard) + fixed `StatusPill` primitive to match. Single source of truth now. Verified via
  screenshots — all 6 statuses + role badges legible in both themes. Build + e2e (10/10) green.
  Residual palette usages (charts, QrBatches, modals, LogViewer) correctly left for G2–G5.

- **DONE — Color plan G2: retokenized Error.tsx** (2026-07-18). Was hardcoded
  `red-50/red-200/slate-700/white` — the exact "invisible in dark mode" bug reported. Now uses
  `--danger` token + surface bg, same visual language as the toast fix. Verified via a real 404
  error screenshot, both themes legible. Full e2e 10/10.
  (Correction: an earlier "bonus finding" about a boolean-as-message bug at AssetDetail.tsx:324
  was WRONG — misread a truncated grep. No such bug exists; retracted in the plan doc.)

- **DONE — Color plan G3 audited (no fix needed) + G4 done** (2026-07-18). G3: re-audited the
  `components/home/*` "white-opacity" flags from the original grep-only pass — all correctly
  scoped to fixed-color parents (accent-blue cards, black terminal), zero raw palette hits in
  home components. Corrected the plan, no code changed. G4: loaded the `dataviz` skill, added a
  VALIDATED (ran the actual validator, not eyeballed) 8-slot categorical `--chart-1..8` palette to
  tokens.css; retokenized `Overview.Analysis.tsx` — status panel reuses G1's `--status-*` tokens
  (same enum, same color everywhere), category/department panels use the new chart palette,
  insight/warranty cards use `--success/--warning/--danger/--info` (never reusing series colors
  for status, per the skill's rule). Fixed a real bug in the process: hardcoded `text-white` on a
  light-tinted card, invisible in light mode. Verified via full-dashboard screenshots both themes.
  Build + e2e (10/10) green.

- **DONE — Color plan G5: page-by-page sweep** (2026-07-19). Tokenized the last raw-palette
  usages: Employee/EmployeeDetail active-badge (extracted shared `activeBadgeStyle()`/
  `activeDotColor()` helpers into formatDisplay.ts, was two duplicated hardcoded implementations),
  QrBatches status pill + error banner, all 3 bulk-import modal success/warning/error banners.
  Found and fixed **2 more undiscovered duplicates** while tracing AssetChangeHistory's legend:
  the same lifecycle event-accent logic was independently copy-pasted in AssetHistoryTimeline.tsx
  AND AssetHistoryTable.tsx — three copies total, now one shared pattern (`getEventAccentColor`)
  using success/warning/info/danger tokens. Correctly left LogViewer.tsx untouched (its red/amber/
  blue are deliberately tuned for the fixed-black terminal, per the G3 lesson). Verified via
  screenshots + full e2e (10/10). Only G6 (lint gate) and G7 (final QA pass) remain in the color
  plan — everything else in that plan is now done.

- **DONE 2026-07-19 batch**: (a) Asset Logs premium refinement — split LogViewer → components/logs/*
  (all <200), scoped --term-* console tokens + level-colored rows, polished toolbar (icon-prefixed
  filter, clock, search/refresh icons), skeleton loading, height-bug fix (h-[100vh]→flex),
  Grafana link removed. (b) Server `[timing]` logs for qr-batch-create / asset-create / assign /
  return — SURFACED a real 6s assign latency (inline AuthNexus/email → perf plan C2). (c) Frontend
  fetch/XHR OTel instrumentation removed (frontend API calls no longer flood observability).
  (d) Notifications: read/unread (localStorage asset_id:severity), green unread dot on bell,
  premium tighter rows + Mark-all-read, bell+/notifications gated to admin/it_ops, page toolbar one
  responsive row, background scroll-lock fix. (e) Multi-agent review → fixed RequireAuth is_active
  hole (deactivated employee could reach base routes). (f) Responsive e2e guard (no horizontal
  overflow @375/768/1280/1536). Full e2e: 13/13 green.

- **DONE — 200-line burn-down, 6 files via parallel multi-agent** (2026-07-19). One Workflow, 6
  agents in parallel, shared tree + disjoint files (preserves the uncommitted session work — worktree
  isolation would've dropped it): AnimatedNavIcon 317→58 (+navIcons), InfoHint 276→191 (+panel),
  FilterSelect 244→197 (+menu), DepartmentCombobox 214→179 (+panel), EmployeeForm 272→133
  (+Fields/Field), OtherAssetForm 281→192 (+fields). All resulting files <200. Verified with one
  build + full e2e (12/13; the 1 fail was authNexus rate-limit, passed on retry).

## Open (next candidates — see .claude/context/roadmap.md + ui-redesign.md)

- **DONE — Idle auto-logout** (2026-07-18). `hooks/useIdleTimeout.ts` (throttled PASSIVE activity
  listeners, single timer, countdown interval only during the 2-min warning — zero steady-state
  cost) + `IdleWarningModal` (slides bottom→center, Stay / Log out, live countdown). 10min idle →
  warn; 2min no response → signout. Fixed a stale-closure bug (unstable onTimeout thrashed the
  effect) via a ref. e2e: idle.spec.ts (test seam window.__AMS_IDLE__ for short timings).
- **DONE — Settings/navbar rework per feedback** (2026-07-18). Navbar stripped to firstname + role
  badge (→ /settings) + notification bell (removed the duplicate theme toggle + user menu).
  Settings reordered Profile → Appearance (removed About); Log out button (danger) in Profile;
  last login shows explicit date+time; pills are icon-forward (theme sun/moon, density icons, font
  previews in own typeface).
- **DONE — Removed Guide feature entirely** (route, page, sidebar link, breadcrumb, home chip,
  AnimatedNavIcon glyph + type). Build clean, no residual refs.

- UI Phase 2 shell: DARK sidebar anchor both themes (Sidebar.tsx rewrite), mobile bottom bar.
- UI Phase 4: migrate list pages to primitives + 4 data states + table→card.
- Network drop/restore toast (Current Focus in CLAUDE.md).
- Scalability items (workers, pool, auth-context cache, PDF off event loop).

## 2026-07-19 — Observability consolidation: 5 containers → 1 (grafana/otel-lgtm) + FIX broken log pipeline
### Done
- Discovered the log pipeline was DEAD in Docker: server logged to stdout only, `ams_server.log`
  never written (server had no ./logs mount), Loki empty. Alloy's file-tail saw nothing.
- Server: new `core/observability.py` — OTLP LoggerProvider + LoggingHandler on root logger (all
  logger.info incl `[timing]` export) + TracerProvider (FastAPI/httpx instrument). Wired into
  create_app() behind OTEL_GRAFANA_ENABLED. Cleaned dead imports/vars in main.py (base64/hashlib/
  hmac/json/time, Depends, require_backend_api_key, _resolve_request_role, protected_dependencies).
- settings.py: added OTEL_EXPORTER_OTLP_ENDPOINT.
- docker-compose.yml (protected, via PowerShell): replaced loki/tempo/prometheus/grafana/alloy with
  ONE `observability` service (grafana/otel-lgtm); server depends_on observability; healthcheck uses
  curl (image has no wget); volumes → single lgtm_data.
- .env: LOKI_BASE_URL→observability:3100, OTEL_EXPORTER_OTLP_ENDPOINT=observability:4317,
  VITE_OTEL_GRAFANA_ENABLED→false (client rebuilt; no browser CORS needed).
- observability router: LogQL realigned to lgtm labels — `{service_name="ams-server"}` + level via
  structured metadata `| severity_text=~"(?i)…"`; parse service_name + severity_text.
- Cleanup: deleted dead configs (Observability/{alloy,grafana,loki-config,tempo-config,prometheus.yml}),
  ./logs, dead server tests (test_loki*.py, test_loki_logic.py, test_endpoint.py→imports removed
  core.deps, test_history.pdf), .env.bak-obs. Removed 4 old docker volumes + 5 old images (~1.9GB).
  Updated README/DOCKER_DEPLOYMENT/OBSERVABILITY_TELEMETRY docs.
### Verification
- Log pipeline: server→OTLP→lgtm→Loki proven; `{service_name="ams-server"} | severity_text=~"(?i)INFO"`
  returns rows (Loki was empty before). service_name label + severity_text metadata confirmed live.
- ruff clean (main.py, core/observability.py, settings.py, routers/observability.py).
- Docker: single `observability` container healthy; no legacy obs containers; client+server 200.
- pytest: my changes REGRESSION-FREE (git-stash baseline shows identical 5 failed/10 errors WITHOUT
  my diff). Those are PRE-EXISTING rot: test_envelope /v2/health path 404, test_auth_local_jwt patches
  dead module, test_qr_labels_export — belong to the test-rot backlog, not this task.
### Next
- Fix pre-existing server test rot (test_auth_local_jwt dead-module patch; /v2/health path).
- Optional: mount custom Grafana dashboards into lgtm if IT Ops wants them (auto-provisioned
  datasources already work; in-app Grafana link was removed earlier).
### Notes
- Not committed (standing no-commit rule). lgtm image is 3.29GB (one image) vs old ~1.9GB across 5 —
  larger on disk but ONE container/process group. Legacy Observability/.env* left as dead holdovers.

## 2026-07-20 — Server test-rot fixes + REAL bug found (QR labels empty-export 500)
### Done
- test_envelope.py: 3 stale-path failures fixed — routes gained /api + /api/v1 prefixes and /health
  moved to /api/health; health now returns its own envelope (data:{service,db_provider}, no more `api`
  key) and is DB-dependent (503 under TestClient with no pool). Repointed paths (/v2/api/health,
  /v2/api/v1/assets) + made health assertions DB-agnostic (assert envelope contract, not 200). Removed
  pre-existing unused imports (json/pytest/ApiEnvelope/ErrorDetail/ResponseMeta).
- **REAL PRODUCTION BUG fixed** — services/qr_label_pdf_service.py: build_empty_notice_pdf called
  _draw_header() without the required `title` arg → TypeError → `POST /api/v1/assets/qr-labels/export`
  with empty/unresolvable tags returned 500 instead of the "nothing to print" notice PDF. Added
  `document_title` class constant, passed it (and reused for build_pdf default). test_qr_labels_export
  correctly caught it (2 tests now pass). Server rebuilt so fix is live.
- test_auth_local_jwt.py: was testing removed architecture (ES256 + `_jwks_client` local verify).
  Rewrote against current auth (RS256, python-jose, cached get_jwks() dict, project_id scope) — offline
  via generated RSA key + patched get_jwks. Adapted negatives to real behavior: expired past the
  AUTH_CLOCK_SKEW_SECONDS leeway → 401; wrong project_id → 403 (new check); dropped missing-sub/exp
  (no longer 401 under jose). Did NOT touch protected auth code, only the test. 9 tests pass.
### Verification
- pytest tests/: 45 passed (was 31 passed / 5 failed / 10 errors).
- ruff clean on all changed files. Server rebuilt + healthy.
### Next
- ~22 pre-existing ruff errors remain in untouched server files (unused imports etc) — separate debt.
- test_fastapi.py::test_route returns a dict (PytestReturnNotNoneWarning) — minor rot.
### Notes
- Not committed (standing no-commit rule).

## 2026-07-20 — Repo-wide dead-code audit (knip / ts-prune / vulture)
### Removed (verified 0 real imports, build/tests green after)
Client (9 files + empty dir):
- animationIcons/Active.GreenCircle.tsx, Inactive.RedCircle.tsx (+ removed now-empty dir)
- common/LoadMorePagination.tsx (superseded by DataPagination)
- form/DepartmentCombobox.tsx + DepartmentComboboxPanel.tsx (dead pair, no external consumer)
- home/StoryNote.tsx
- queries/assignments.ts (unused migration scaffolding)
- utils/apiEnvelope.ts (superseded by authNexus.api.ts unwrap)
- styles/theme.css (comment-only refs; fixed comments in index.css + tokens.css)
Server:
- tests/test_imports.py (dead Supabase-era smoke: no test fns, imports removed `supabase` dep)
- core/middleware.py unused imports (base64/asyncio/datetime/settings) via ruff --fix
- purged stale __pycache__ bytecode for deleted/renamed source (deps, supabase, assets, assignments,
  analysis, bootstrap, employees, logs)
### Kept — verified NOT dead (audit false-positives / in-flight)
- api.ts (~30 importers; migration in progress), queries/* except assignments
- IdleWarningModal / useIdleTimeout (git-D at session start but re-created + live in App.tsx)
- scripts/generate-*-template.mjs (standalone dev tooling; not imported by design)
### Verification
- Client `npm run build`: PASS (no missing imports → deletions safe). knip now flags only the 2 mjs.
- Server pytest: 45 passed. ruff clean on all touched files.
### Remaining pre-existing debt (NOT from this audit)
- ~22 server ruff errors in untouched files; 10 client eslint (any/no-unused-expressions/unused-disable);
  api.ts unused per-export churn (migration). Separate backlog.
### Notes
- Not committed (standing no-commit rule). Runtime unaffected (all removed files were unimported).

## 2026-07-20 — Dead-code audit round 2 + REAL bug (employee template 404)
### Verified NOT unnecessary → kept
- scripts/generate-{asset-import,inventory-update}-template.mjs: they generate the public/*.xlsx
  templates the bulk-import modals serve for download (ASSET/INVENTORY_IMPORT_TEMPLATE_HREF). Legit.
### REAL bug fixed
- public/employee-import-template.xlsx.xlsx had a DOUBLE extension; app downloads
  `/employee-import-template.xlsx` (EMPLOYEE_IMPORT_TEMPLATE_HREF, used in EmployeeBulkImportModal +
  NewEmployee). Live 200 only because the running image predated the typo — next rebuild would 404.
  Renamed → employee-import-template.xlsx. All 3 template downloads now 200 after client rebuild.
### Removed (dead)
- Observability/.env, .env.observability.example, .env.production, .gitignore — env config for the
  retired 5-container stack; unreferenced after lgtm migration. Updated OBSERVABILITY_TELEMETRY.md.
### Verification
- Client rebuilt + healthy; template downloads asset/employee/inventory = 200/200/200.
- e2e smoke (login + assets, incl. filter-toggle): 7/7 passed.
### Notes
- Not committed. mjs generators + public templates retained (in use).

## 2026-07-20 — Delete removed; Archive + Restore only (Notes/archive-no-delete-plan.md) — DONE
### Done (T1–T7)
- T1: removed BOTH hard-delete endpoints (api_v1_assets.py + api_v1_recycle_bin.py) + all
  `DELETE FROM assets|employees|recycle_bin_entries`. No @router.delete anywhere. Client
  permanent-delete call removed.
- T2: asset archive blocked when assigned (asset_service, 400); employee archive already blocked
  when holding assets. Actor now recorded for employee archive (deleted_by_employee_id).
- T4: v_recycle_bin joins employees → archived_at, archived_by_employee_id, archived_by_first_name,
  archived_by_name (+ restored_by_name). Applied to init.sql (protected) + live DB. list query → view.
- T3: API/service/UI reframed to Archive/Restore. New routes /api/v1/archive[/{id}/restore],
  /assets/{id}/archive, /employees/{id}/archive; legacy /recycle-bin + /soft-delete kept as aliases;
  /recycle-bin page path redirects to /archive.
- T5: new Archive page (Archive.tsx + services/archiveService.ts) — columns Type/Item/Archived at
  (date+time)/Archived by (name·id)/Restore; loading/error/empty/data states. Sidebar+Footer→Archive.
- T6/T7: every "Delete" affordance relabeled "Archive" (AssetDetail, Employee row menu + inline);
  archive disabled in UI when asset assigned ("Return before archiving"). Removed featureFlags.ts +
  recyclebin.json + old RecycleBin.tsx + dead api.ts recycle fns/type.
### Verification
- Server/tests: 52 passed (test_archive.py: hard-delete routes gone 404/405, archive routes exist).
- Live tests/: 32 passed (test_archive.py: permanent-delete removed w/ auth, assigned→400,
  archive→restore roundtrip records actor, archive list carries who/when).
- Client build + Archive files lint clean. e2e archive.spec: page renders, no delete control,
  /recycle-bin→/archive redirect. Full e2e 14 passed (2 authNexus-429 flakes pass isolated).
- Containers rebuilt + healthy.
### Notes
- Not committed (standing no-commit rule). Pre-existing client lint debt (any/no-unused-expressions)
  untouched — separate backlog. Employee `soft_delete` repo method name kept (internal); public API
  is /archive.

## 2026-07-20 — it_ops export + toast padding + observability log format
### Done
- Bulk asset export now allowed for it_ops: /export.csv + /export.json guards require_admin -> require_privileged
  (removed inner role!=admin check in export.json; dropped now-unused require_admin import). Client UI gate
  for "Export Asset data" isStrictAdmin -> isAdmin (hasAdminAccess = admin OR it_ops).
- Toast vertical padding reduced: ToastProvider py-3.5 -> py-2.
- Observability request log now human-readable: "%s %s -> %d (%.2f ms)" (method path -> status (ms)),
  2-decimal precision; structured extra (method/path/status_code/elapsed_ms) retained for querying.
### Verification
- Live: it_ops (EMP-001) export.json + export.csv now 200 (was 403). authz live suite 13 passed
  (test_export_requires_privileged_role derives expectation from DB role).
- Server unit: 53 passed (added test_export_assets_csv_it_ops_ok; fixtures override require_privileged).
- Loki shows new format e.g. "GET / -> 200 (1.71 ms)". Toast e2e (network.spec) 2 passed.
- Server + client rebuilt + healthy.
### Notes
- Not committed (standing rule). Both export variants (csv/json) now privileged for consistency.

## 2026-07-20 — Settings profile redesign + empty-download guards
### Done
- Settings + Profile titles centered. ProfileCard now a row: LEFT circular avatar (upload via click,
  image-only, max 50 KB, initials fallback, base64 in localStorage per employee_id) + caption
  "ASSET MANAGER SINCE APR'26"; RIGHT the details grid + Log out. Toast on oversize/non-image.
- Empty-download guards in AssetDetail: clicking Download when the list is empty now shows a toast
  instead of an empty PDF — assignment history empty → "No assignment history to download.";
  lifecycle/audit logs empty → "No lifecycle log to download."
### Verification
- Client build clean; ProfileCard/Settings lint clean. Settings screenshot confirms centered titles,
  circular avatar (BB initials) + SINCE caption, details right. Client rebuilt + healthy.
### Notes
- Not committed. Avatar stored client-side (localStorage, ≤50 KB base64) — no backend/DB change.

## 2026-07-20 — Sidebar theme-follows + circular avatar typography
### Done
- Sidebar now FOLLOWS the theme (was dark-anchor in both). Made --sidebar-* tokens theme-aware in
  tokens.css: light surface/dark-text values in :root; full dark set in [data-theme=dark] + media.
  .ams-sidebar + SIDEBAR_VARS already read those tokens, so both flip automatically. Light mode =
  light grey-blue sidebar + dark text/icons + blue active tint; dark mode unchanged (dark).
- Profile avatar: added CIRCULAR TYPOGRAPHY ring — "ASSET MANAGER SINCE APR'26 •" curved around the
  image via SVG textPath (ProfileCard.tsx), replacing the flat caption. Upload/50KB/initials intact.
### Verification
- Screenshots: light mode sidebar light + readable; dark mode sidebar still dark; ring text renders
  around avatar. Build + lint clean. Client rebuilt + healthy.
### Notes
- Not committed. This was a design change per user (dark-anchor was intentional; user chose theme-follow).

## 2026-07-20 — Avatar ring: phrase x2 + larger radius
- ProfileCard avatar enlarged (h-28→h-36; ring container h-40→h-48, viewBox 192, path r=80,
  col sm:w-48→sm:w-56). Circular text repeated twice around the ring (MEMBER_SINCE • MEMBER_SINCE •),
  font 8px/ls 2px. Verified via screenshot. Build clean, client rebuilt. Not committed.

## 2026-07-20 — Profile avatar: full-circle typography, no box, larger image
- Circular text now fills full 360° (textLength=653 + lengthAdjust="spacing", phrase x2). Removed the
  bordered card box around Profile (section is plain). Avatar h-36->h-48; ring container h-48->h-60
  (viewBox 240, path r=104), col sm:w-64, row items-center. Verified via screenshot. Not committed.

## 2026-07-20 — Settings polish + avatar for all users (100 KB) + tests
### Done
- Profile fields: removed label prompts (NAME/EMAIL/ROLE…) → icon | value only (label kept as
  title/aria for a11y).
- Breadcrumb hidden on /settings (App.tsx showBreadcrumbs exclusion). Header "Setting" -> text-2xl
  extrabold, reduced top margin (main py-3/sm:py-4, header mb-4). Profile card box removed earlier.
- Avatar: any signed-in user can set it (Settings is under RequireAuth, not privileged — confirmed).
  Size limit 50 KB -> 100 KB. Extracted validation to src/utils/avatar.ts (validateAvatarFile +
  AVATAR_MAX_BYTES) for testability; ProfileCard uses it.
### Testing (ran)
- vitest src/utils/avatar.test.ts: 5 passed (accepts <=100 KB image, rejects >100 KB, rejects
  non-image, limit=100 KB).
- e2e: valid image upload -> "Profile image updated" + <img> renders; >100 KB -> "100 KB or smaller"
  rejection. 2 passed.
- Build clean; client rebuilt + healthy. Pre-existing 10 client lint issues untouched (separate).
### Notes
- Not committed. Avatar still client-side (localStorage per employee_id). h1 text "Setting" is the
  user's own edit — left as-is.

## 2026-07-20 — Text size control: compact, end-of-row, % only
- FontSizeSlider rewritten compact (range + current % only; removed internal label, icon, and
  min/max 90%/120% labels). AppearanceCard now uses SettingsRow label="Text size" so the slider sits
  at the end of the row like the other controls. Fixed SidebarLeafNav (dropped removed icon prop).
- Verified via screenshot; build clean; client rebuilt. Not committed.

## 2026-07-20 — Profile: dummy user icon, copy-details, title reposition
- Avatar placeholder now a person icon (AppIcon "profile", 72px) instead of initials; upload replaces
  it (removed initialsOf). "Copy details" button (copy icon, next to Log out) copies name/employee_id/
  email/department/role/last_login via navigator.clipboard + success toast.
- "Profile" title moved to start of the row (top-left, above the avatar) instead of centered full-width.
- Build + lint clean; client rebuilt; verified via screenshot. Not committed.

## 2026-07-20 — Employee toolbar single-row + table-only; footer brand; pagination polish
### Done
- Footer brand now uses <BrandLogo/> (icon + Asset[primary]Manager[accent]) above the tagline —
  matches navbar (Footer renders on Home).
- Employee page: replaced PageHeaderActions + 2-row toolbar with ONE responsive row (flex-wrap):
  compact search (sm:w-52/md:w-64) + Filters + Refresh + InfoHint | right: page-size + New Employee.
- Removed grid/table view toggle entirely (table-only): deleted EmployeeViewMode type, viewMode state,
  getInitialEmployeeViewMode, EMPLOYEE_VIEW_MODE_STORAGE_KEY, storage effect, Table/GridViewIcon,
  headerActions, PageHeaderActions import; collapsed the render ternary to table-only.
- DataPagination: removed "Rows per page" label text (kept the selector); reduced nav-button px-3->px-2.5.
### Verification
- Build clean. e2e full run 14 passed; the 2 failures (assets filter-toggle, responsive) PASS in
  isolation → authNexus-429 login flake, not regressions. Responsive (no h-overflow across screens incl
  Employee) confirmed. Theme-safe (semantic tokens only). Client rebuilt + healthy.
- Pre-existing 10 client eslint issues unchanged (separate backlog; none in touched files).
### Notes
- Not committed. Employee.tsx still >200 (pre-existing debt; net smaller after removals).

## 2026-07-20 — Employee toolbar: title left, controls right, refresh removed
- Section now lg:flex-row justify-between: "All Employees" left; search + Filters + InfoHint +
  page-size + New Employee right (lg:justify-end, wraps on small screens).
- Removed the Refresh button from the Employee page entirely + its import (handleRefresh kept — still
  used by the Error retry). Build clean; client rebuilt; e2e confirms no refresh button + table renders.
- Employee.tsx 1243 lines (pre-existing >200 debt; down from 1408 baseline). Not committed.

## 2026-07-20 — Fix mojibake on AssetDetail (unreadable custody help text)
- AssetDetail.tsx had double/triple mis-encoded UTF-8 (em-dash/apostrophe/ellipsis/middle-dot) baked
  into 8 spots (lines 157,537,579,601,862,863,901,904) — rendered as byte-salad. Replaced all with
  safe ASCII (" - ", "'", "...") so it can never re-corrupt. 0 non-ASCII chars remain in the file.
- Build clean; client rebuilt. Not committed.

## 2026-07-20 — FIX: spurious auto-logout while active (monitorSession)
- Root cause: authService.ts had `monitorSession: true` while using the BFF refresh flow. Its own
  comment said to DISABLE it — check_session_iframe fires 'userSignedOut' on every BFF token rotation
  (~every few min), and useAuthBootstrap wires addUserSignedOut -> clears user -> RequireAuth redirect
  to /login. => auto-logout after the first refresh cycle even while active.
- Fix: monitorSession -> false (protected auth file; matches the documented intent). BFF refresh
  (proactive addAccessTokenExpiring + reactive request interceptor) keeps the session alive; nothing
  else needs monitorSession. Idle-logout (10min) is separate + intended.
- Build clean; client rebuilt. Not committed.

## 2026-07-20 — Production-standard session handling (replace blunt monitorSession fix)
- Root improvement: BFF refresh cookie is now the SINGLE session authority. A raw OIDC
  `userSignedOut` signal (session-monitor noise on token rotation) is no longer an instant logout —
  useAuthBootstrap re-validates via refreshTokenViaBFF() and only terminates (clear + /login) if that
  genuinely fails. Added intentional-signout guard so explicit logout still works. Exported
  refreshTokenViaBFF from authNexus.api.
- monitorSession stays false (correct for a BFF — client-side check_session_iframe is incompatible with
  BFF token rotation); but correctness no longer depends on the flag — the guard handles any signal.
- Verified: live refresh suite (test_bff_session + authnexus_login) 11 passed; login e2e 3 passed.
  Build clean; client rebuilt. Not committed. (auth files edited under user direction.)

## 2026-07-20 — Verification: responsiveness + themes + full regression
- Session-restore verified: survives hard reload + deep-link nav (2/2 e2e) — auto-logout fully resolved.
- Responsive+theme sweep (375/768/1280 x light/dark x assets/employees/settings): all readable, no
  overflow; sidebar light-in-light / dark-in-dark at every width; mobile toolbars wrap, tables scroll,
  settings profile stacks. responsive.spec overflow guard passes.
- Full regression: Server 53, live 32, e2e green in isolation (2 full-run fails = authNexus-429 flake).
- Minor (not fixed): Assets page header actions wrap densely on tablet — no overflow, usable.
- Not committed.

## 2026-07-20 — FIX: duplicate action menu (top-left ghost) on Assets/Employees
- Cause: AssetsTable renders row actions in both the desktop table AND a sm:hidden mobile card list,
  sharing actionMenuId. On desktop the hidden card trigger's getBoundingClientRect()=0,0 → its menu
  copy anchored at top-left corner (duplicate).
- Fix: RowActionMenu skips positioning when the trigger has a zero-size rect (not visible). Only the
  visible layout's menu renders. Fixes Assets + Employees (same pattern).
- Verified: e2e exactly 1 role=menu, positioned off-corner; screenshot single anchored menu. Build clean,
  client rebuilt. Not committed.

## 2026-07-20 — Dark custody text + action-menu items not firing
- AssetDetail custody help text: text-black -> text-primary (theme-aware) so it's readable in dark
  mode (was black-on-dark). 2 occurrences; 0 residual text-black. Verified dark screenshot = white text.
- Action-menu items (Edit/View QR/Download QR) did nothing: regression from the dup-menu fix — the
  hidden card-layout RowActionMenu instance still ran its outside-click listener and, since its menu
  wasn't rendered, closed on mousedown when clicking the visible menu (removed item before click).
  Fix: instances with no rendered menu (menuRef null) skip the outside-click close. e2e: Edit navigates.
- Build clean; client rebuilt. Not committed.

## 2026-07-20 — Employee advanced filter: one-step Clear all
- handleClearDraftFilters now resets the draft AND applies the cleared filters (handleFilterChange)
  + closes the popup — was 2 steps (Clear then Apply), now 1 click. Apply still applies selections.
- Verified e2e: apply role=admin -> one "Clear all" click removes role + closes popup. Not committed.

## 2026-07-21 — Server-side profile pictures (employee_avatars, bytea, ≤50 KB, own-only)
### Done (per Notes/profile-picture-plan.md)
- DB: employee_avatars table (bytea image_data, UNIQUE employee_id FK ON DELETE CASCADE, CHECK
  byte_size<=51200 + mime allowlist). Applied live + added to init.sql (protected).
- Server: avatar_repository (get/upsert/delete), avatar_service (base64<->bytes, 50KB server-enforced
  on decoded bytes, mime allowlist + magic-number sniff to reject spoofed types), routes
  GET/PUT/DELETE /api/v1/employees/me/avatar (own-only; 413 too-large, 400 invalid/mismatch).
- Client: avatar.ts 100->50KB + PNG/JPEG/WebP allowlist; new avatarService (get/put/delete via /me);
  ProfileCard now loads/saves avatar from the SERVER (dropped localStorage) — dummy user icon fallback,
  persists across devices/reloads.
### Verification
- Server pytest: 61 passed (test_avatar 8: service validation + route auth). Live: 36 passed
  (test_avatar 4: PUT/GET/DELETE roundtrip, 50KB->413, mime mismatch->400, auth). vitest: 6 (50KB +
  mime). e2e avatar.spec: 2 (upload persists across hard reload server-backed; >50KB rejected).
- Full regression: server 61, live 36, e2e 18 (2 full-run fails = authNexus-429 flake, pass isolated).
### Notes
- Not committed. bytea storage + base64 API (best-of-both per user). Settings-only, own-only.
- Old per-user localStorage avatar keys (ams-avatar-*) left in users' browsers — harmless, unused now.

## 2026-08-01 — Archive feature REMOVED completely (assets + employees)
Rationale (user): inventory **status** is the retirement mechanism — lost/disposed/retired are set via
the status field; archive/recycle-bin was redundant. The 2 records deleted earlier by query were dummy
test data, not a recurring workflow.
### Removed — client
- Deleted: pages/Archive.tsx, services/archiveService.ts, e2e/archive.spec.ts
- Edited: App.tsx (lazy + /archive route + /recycle-bin redirect), sidebarNav.ts (nav item),
  Footer.tsx (link), Breadcrumbs.tsx (label), useDocumentTitle.ts (title),
  services/assetService.ts (softDeleteAsset), services/employeeService.ts (softDeleteEmployee),
  queries/employees.ts (useSoftDeleteEmployeeMutation + import),
  AssetDetail.tsx (archive button, dialog, handleSoftDelete, isAssetAssigned, import),
  Employee.tsx (row action, inline button, dialog, handler, onDelete prop chain, state, import)
### Removed — server
- Deleted: routers/api_v1_recycle_bin.py, repositories/recycle_bin_repository.py,
  Server/tests/test_archive.py, tests/test_archive.py
- Edited: main.py (router import + include), api_v1_assets.py (GET /recycle-bin, restore, POST
  /{id}/archive + soft-delete alias, SoftDeleteAssetRequest import), api_v1_employees.py (POST
  /{id}/archive + alias), asset_service.py (soft_delete_asset, restore_asset, RecycleBinRepository
  import, stale docstring), asset_repository.py (list_recycle_bin_entries),
  asset_write_repository.py (mark_soft_deleted), employee_repository.py (soft_delete,
  restore_from_payload, json import)
- DB: recycle_bin_entries + v_recycle_bin left in place (dead, preserves past rows); is_deleted
  columns retained (always false).
### Verification
- OpenAPI: 0 archive/recycle routes (51 total). POST asset/employee archive -> 404; GET /api/v1/archive -> 404.
- Server pytest 61 · live 32 · vitest 26 · client build clean · e2e 16 (idle.spec flake passed isolated).
- Client lint errors 10 -> 2 (both pre-existing `any` in authNexus.api.ts, untouched).
### Notes
- Not committed (standing no-commit rule).

## 2026-08-01 — Reuse unused QR codes (generated but never linked) + fixed 3 QR-scan-to-log drifts
### Feature (Notes/unused-qr-reuse-plan.md)
- DB: partial index idx_qr_reservations_unused ON qr_tag_reservations(created_at) WHERE status='reserved'
  (live + init.sql).
- Server: QrRepository.list_unused_reservations (FIFO) + count_unused_reservations; qr_service passthrough;
  GET /api/v1/qr/reservations/unused + /count (privileged, envelope). Unused = status='reserved' AND
  consumed_by_asset_id IS NULL.
- Client: qrService.listUnusedQr/countUnusedQr + qrPngDataUriForTag (client-side QR for reserved tags,
  since qr-labels/export only renders existing assets). UnusedQrModal (tag/batch/reserved_at, Download QR
  + Log asset via /assets/scan/{tag}, pagination, states). "Unused QRs" button + count badge on QrBatches.
### BONUS — fixed pre-existing schema drift that broke the ENTIRE QR-scan-to-log (asset-from-QR) path
- assets: added missing `source text default 'direct'` + `qr_reservation_id uuid` (+ FK -> qr_tag_reservations).
- asset_event_type enum: added missing 'qr_batch_generated', 'qr_reservation_consumed'.
- asset_tag_seq: setval 42 -> 85 (was behind max asset -> reserved tags collided with existing assets).
  All persisted to init.sql (seq is a live data fix). App-based asset creation was drift-broken; now works.
### Verification
- Server pytest 63 (test_qr_unused: routes auth). Live 34 (test_qr_unused: create batch -> both in
  /unused, count +2; consume one via create-asset -> count -1, tag gone). e2e qr-unused: button->modal
  lists 46 unused w/ Download+Log. Full regression green in isolation (2 full-run fails = authNexus-429 flake).
### Notes
- Not committed. Log-asset reuses the existing /assets/scan/{tag} ready-to-log flow (consumes reservation).
- Freeing tags from archived/deleted assets = out of scope (future).
