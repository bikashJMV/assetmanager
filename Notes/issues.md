# GitHub Issues - full register

Source: `RokkaLabs/assetmanager`. Snapshot **2026-08-01**.
**56 open / 31 closed / 87 total.**

> **Verification status:** all 56 open issues were checked against the code on 2026-08-01.
> **Zero were closed** — every claim that looked fixed turned out to be fixed only in an
> uncommitted working tree, or misread. See *Verification against the codebase* below.
>
> **#44 (C-05) and #78 (L-01) are fixed, verified, and CLOSED** on maintainer instruction. Both
> write-ups are on the issues. Caveat recorded there and here: the code sits on
> `feature/refresh-token-bff` and is **not yet on `main`** — if the branch does not land, both
> need reopening. See *Work completed* below.
>
> Running count: **54 open / 33 closed**.

Nearly all come from a single security + architecture audit dated 2026-05-25
(prefixes `C-` critical, `H-` high, `M-` medium, `L-` low, `DEP-` dependency), plus a
handful of feature requests. Ordered critical to low.

## Open issues by severity

| Severity | Count |
| --- | --- |
| Critical | 6 |
| High | 12 |
| Medium | 15 |
| Low | 12 |
| Unlabelled (features / feedback) | 11 |
| **Total open** | **56** |

## Critical (6 open)

Ship blockers. None are code bugs - every one is production posture.

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#45](https://github.com/RokkaLabs/assetmanager/issues/45) | [C-06] Open redirect vulnerability via unvalidated `next` URL parameter | security | must-fix | 2026-05-25 |
| [#44](https://github.com/RokkaLabs/assetmanager/issues/44) | [C-05] Sensitive token data logged to browser console in production | security | must-fix | 2026-05-25 |
| [#43](https://github.com/RokkaLabs/assetmanager/issues/43) | [C-04] No database backup or disaster recovery strategy | infrastructure | must-fix | 2026-05-25 |
| [#42](https://github.com/RokkaLabs/assetmanager/issues/42) | [C-03] Docker containers run as root — no USER directive in Dockerfiles | security | must-fix | 2026-05-25 |
| [#41](https://github.com/RokkaLabs/assetmanager/issues/41) | [C-02] Backend API key baked into Docker image and sent from browser client | security | must-fix | 2026-05-25 |
| [#40](https://github.com/RokkaLabs/assetmanager/issues/40) | [C-01] No HTTPS/TLS — all traffic transmitted in plaintext | security | must-fix | 2026-05-25 |

## High (12 open)

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#92](https://github.com/RokkaLabs/assetmanager/issues/92) | [DEP-01] ecdsa: Minerva timing attack on P-256 — no patch available, library must be replaced | security | must-fix | 2026-05-25 |
| [#60](https://github.com/RokkaLabs/assetmanager/issues/60) | [H-14] No HTTP → HTTPS redirect configured in Nginx | infrastructure | must-fix | 2026-05-25 |
| [#59](https://github.com/RokkaLabs/assetmanager/issues/59) | [H-13] `asset_events.actor_id` is nullable — cannot trace who modified assets | db-design | must-fix | 2026-05-25 |
| [#57](https://github.com/RokkaLabs/assetmanager/issues/57) | [H-11] PDF/export fetch calls bypass Axios interceptor — no token refresh on expiry | security | must-fix | 2026-05-25 |
| [#56](https://github.com/RokkaLabs/assetmanager/issues/56) | [H-10] Access token stored in `localStorage` — vulnerable to XSS theft | security | must-fix | 2026-05-25 |
| [#55](https://github.com/RokkaLabs/assetmanager/issues/55) | [H-09] Production deployment runs `docker compose down` causing full service downtime | ci-cd | must-fix | 2026-05-25 |
| [#53](https://github.com/RokkaLabs/assetmanager/issues/53) | [H-07] Nginx missing all HTTP security headers (CSP, X-Frame-Options, HSTS, etc.) | security | must-fix | 2026-05-25 |
| [#52](https://github.com/RokkaLabs/assetmanager/issues/52) | [H-06] No rate limiting on any endpoint — brute force and DoS possible | security | must-fix | 2026-05-25 |
| [#51](https://github.com/RokkaLabs/assetmanager/issues/51) | [H-05] Admin credentials stored in plain memory without secure rotation | security | must-fix | 2026-05-25 |
| [#50](https://github.com/RokkaLabs/assetmanager/issues/50) | [H-04] JWKS cache has no TTL — stale keys persist after key rotation | security | must-fix | 2026-05-25 |
| [#49](https://github.com/RokkaLabs/assetmanager/issues/49) | [H-03] Audit log columns (`actor_id`, `admin_id`) are nullable — audit trail is unreliable | db-design | must-fix | 2026-05-25 |
| [#47](https://github.com/RokkaLabs/assetmanager/issues/47) | [H-01] Row-Level Security (RLS) is disabled at database initialization | security | must-fix | 2026-05-25 |

## Medium (15 open)

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#96](https://github.com/RokkaLabs/assetmanager/issues/96) | [DEP-05] brace-expansion: Large numeric range bypasses DoS protection (upgrade to 5.0.6) | security | good-to-fix | 2026-05-25 |
| [#95](https://github.com/RokkaLabs/assetmanager/issues/95) | [DEP-04] idna: Specially crafted inputs can bypass CVE-2024-3651 fix (upgrade to 3.15) | security | good-to-fix | 2026-05-25 |
| [#76](https://github.com/RokkaLabs/assetmanager/issues/76) | [M-16] `any` type casts bypass TypeScript safety in API response transforms | code-quality | good-to-fix | 2026-05-25 |
| [#75](https://github.com/RokkaLabs/assetmanager/issues/75) | [M-15] Errors silently swallowed in async handlers without logging | code-quality | good-to-fix | 2026-05-25 |
| [#73](https://github.com/RokkaLabs/assetmanager/issues/73) | [M-13] No pre-deploy `.env` validation in CI/CD pipeline | ci-cd | good-to-fix | 2026-05-25 |
| [#72](https://github.com/RokkaLabs/assetmanager/issues/72) | [M-12] Missing index on `asset_events.created_at` — slow audit log queries | performance | good-to-fix | 2026-05-25 |
| [#70](https://github.com/RokkaLabs/assetmanager/issues/70) | [M-10] PII (email, name, phone) stored in plaintext — no field-level encryption | security | good-to-fix | 2026-05-25 |
| [#69](https://github.com/RokkaLabs/assetmanager/issues/69) | [M-09] `custom_fields` JSONB stored without schema validation at any layer | code-quality | good-to-fix | 2026-05-25 |
| [#68](https://github.com/RokkaLabs/assetmanager/issues/68) | [M-08] Inconsistent HTTP client timeouts across server services (5s to 30s) | design | good-to-fix | 2026-05-25 |
| [#67](https://github.com/RokkaLabs/assetmanager/issues/67) | [M-07] Auth POST endpoints lack CSRF token protection | security | good-to-fix | 2026-05-25 |
| [#66](https://github.com/RokkaLabs/assetmanager/issues/66) | [M-06] Error messages expose internal PostgreSQL error codes and schema hints | security | good-to-fix | 2026-05-25 |
| [#65](https://github.com/RokkaLabs/assetmanager/issues/65) | [M-05] No file size or MIME type validation on bulk import uploads | security | good-to-fix | 2026-05-25 |
| [#64](https://github.com/RokkaLabs/assetmanager/issues/64) | [M-04] Inconsistent error response format across API — envelope vs. raw dict | code-quality | good-to-fix | 2026-05-25 |
| [#63](https://github.com/RokkaLabs/assetmanager/issues/63) | [M-03] Broad `except Exception` in auth middleware masks security-relevant failures | code-quality | good-to-fix | 2026-05-25 |
| [#62](https://github.com/RokkaLabs/assetmanager/issues/62) | [M-02] Two parallel auth flows (JWT + API key) with no clear separation | design | good-to-fix | 2026-05-25 |

## Low (12 open)

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#91](https://github.com/RokkaLabs/assetmanager/issues/91) | [L-14] Weak placeholder passwords in `.env.example` files encourage poor practices | security | suggestion | 2026-05-25 |
| [#90](https://github.com/RokkaLabs/assetmanager/issues/90) | [L-13] Race condition in token refresh queue — `failedQueue` order not guaranteed | design | suggestion | 2026-05-25 |
| [#89](https://github.com/RokkaLabs/assetmanager/issues/89) | [L-12] `getActiveAdvancedFilterCount()` recomputed on every render — missing `useMemo` | performance | suggestion | 2026-05-25 |
| [#88](https://github.com/RokkaLabs/assetmanager/issues/88) | [L-11] `localStorage` welcome-message keys accumulate without cleanup on logout | code-quality | good-to-fix | 2026-05-25 |
| [#87](https://github.com/RokkaLabs/assetmanager/issues/87) | [L-10] `console.debug()` calls not gated behind `import.meta.env.DEV` — run in production | performance | suggestion | 2026-05-25 |
| [#86](https://github.com/RokkaLabs/assetmanager/issues/86) | [L-09] Blob URLs revoked by 2-minute timeout instead of on download completion | design | suggestion | 2026-05-25 |
| [#85](https://github.com/RokkaLabs/assetmanager/issues/85) | [L-08] Routers bypass service layer and call repositories directly — inconsistent architecture | design | suggestion | 2026-05-25 |
| [#83](https://github.com/RokkaLabs/assetmanager/issues/83) | [L-06] Token metadata logged at INFO level — correlatable to user actions | code-quality | suggestion | 2026-05-25 |
| [#81](https://github.com/RokkaLabs/assetmanager/issues/81) | [L-04] Inconsistent null checking — `if not value:` vs `if value is None:` | code-quality | good-to-fix | 2026-05-25 |
| [#80](https://github.com/RokkaLabs/assetmanager/issues/80) | [L-03] Global singletons (`_jwks_cache`, `_pool`) make unit testing difficult | design | suggestion | 2026-05-25 |
| [#79](https://github.com/RokkaLabs/assetmanager/issues/79) | [L-02] Credentials obfuscated via string concatenation — false security | code-quality | suggestion | 2026-05-25 |
| [#78](https://github.com/RokkaLabs/assetmanager/issues/78) | [L-01] `print()` used for startup warnings instead of structured logger | code-quality | good-to-fix | 2026-05-25 |

## Feature requests & feedback (11 open)

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#105](https://github.com/RokkaLabs/assetmanager/issues/105) | [Feature] Inspection & calibration tracking with notifications | enhancement | - | 2026-05-26 |
| [#104](https://github.com/RokkaLabs/assetmanager/issues/104) | [Feature] Geo-location tracking with event trigger on update | enhancement | - | 2026-05-26 |
| [#103](https://github.com/RokkaLabs/assetmanager/issues/103) | [Feature] Gate pass system for asset movement control | enhancement | - | 2026-05-26 |
| [#102](https://github.com/RokkaLabs/assetmanager/issues/102) | [Feature] RFID + Barcode + QR unified asset identification | enhancement | - | 2026-05-26 |
| [#101](https://github.com/RokkaLabs/assetmanager/issues/101) | [Feature] Barcode/QR scanner for asset onboarding | enhancement | - | 2026-05-26 |
| [#99](https://github.com/RokkaLabs/assetmanager/issues/99) | Demo Feedback | enhancement | - | 2026-05-25 |
| [#35](https://github.com/RokkaLabs/assetmanager/issues/35) | Bug: QR Camera Scan Doesn't respond | bug | - | 2026-05-19 |
| [#34](https://github.com/RokkaLabs/assetmanager/issues/34) | Replace generic asset tag AST-0001 with meaningful format JMV-LAP-00001 for instant identification | - | - | 2026-05-19 |
| [#30](https://github.com/RokkaLabs/assetmanager/issues/30) | Improve reusability and test | - | - | 2026-05-14 |
| [#29](https://github.com/RokkaLabs/assetmanager/issues/29) | New Feature: Manual Asset Tag Entry | - | - | 2026-05-14 |
| [#6](https://github.com/RokkaLabs/assetmanager/issues/6) | Feature: Contact Update Notifications for Reassigned Numbers | enhancement | - | 2026-04-09 |

## Closed (31)

| # | Title | Area | Action | Raised |
| --- | --- | --- | --- | --- |
| [#100](https://github.com/RokkaLabs/assetmanager/issues/100) | Demo Feedback — Session 2 | enhancement | - | 2026-05-26 |
| [#98](https://github.com/RokkaLabs/assetmanager/issues/98) | [Feature] Auto serial number capture via camera/barcode scan | enhancement | - | 2026-05-25 |
| [#94](https://github.com/RokkaLabs/assetmanager/issues/94) | [DEP-03] urllib3: Two CVEs — decompression bomb bypass + sensitive header leak (upgrade to 2.7.0) | security | must-fix | 2026-05-25 |
| [#93](https://github.com/RokkaLabs/assetmanager/issues/93) | [DEP-02] python-multipart: Denial of Service via unbounded multipart part headers | security | must-fix | 2026-05-25 |
| [#84](https://github.com/RokkaLabs/assetmanager/issues/84) | [L-07] Database connection pool not pre-warmed at startup | performance | good-to-fix | 2026-05-25 |
| [#82](https://github.com/RokkaLabs/assetmanager/issues/82) | [L-05] Deleted assets permanently removed — no archive or soft-delete strategy | design | suggestion | 2026-05-25 |
| [#77](https://github.com/RokkaLabs/assetmanager/issues/77) | [M-17] Potential N+1 query pattern in employee list with assignments | performance | good-to-fix | 2026-05-25 |
| [#74](https://github.com/RokkaLabs/assetmanager/issues/74) | [M-14] `ALTER TYPE ADD VALUE` migrations run outside transactions — no rollback on failure | db-design | good-to-fix | 2026-05-25 |
| [#71](https://github.com/RokkaLabs/assetmanager/issues/71) | [M-11] `ALLOWED_ORIGINS` hardcoded in docker-compose — breaks environment parity | infrastructure | good-to-fix | 2026-05-25 |
| [#61](https://github.com/RokkaLabs/assetmanager/issues/61) | [M-01] Auto-provisioning of employees from AuthNexus without admin approval | security | good-to-fix | 2026-05-25 |
| [#58](https://github.com/RokkaLabs/assetmanager/issues/58) | [H-12] pgAdmin web UI exposed on host network port in production | infrastructure | must-fix | 2026-05-25 |
| [#54](https://github.com/RokkaLabs/assetmanager/issues/54) | [H-08] pgAdmin credentials stored in unencrypted `.pgpassfile` mount | security | must-fix | 2026-05-25 |
| [#48](https://github.com/RokkaLabs/assetmanager/issues/48) | [H-02] `asset_tag` column has no UNIQUE constraint | db-design | must-fix | 2026-05-25 |
| [#46](https://github.com/RokkaLabs/assetmanager/issues/46) | [C-07] Exception stack traces and DB error details leaked to API clients | security | must-fix | 2026-05-25 |
| [#33](https://github.com/RokkaLabs/assetmanager/issues/33) | Log asset to any department, not just the user's own | - | - | 2026-05-19 |
| [#32](https://github.com/RokkaLabs/assetmanager/issues/32) | Remove pre-assigned asset tags from QR batch creation | - | - | 2026-05-19 |
| [#31](https://github.com/RokkaLabs/assetmanager/issues/31) | Add boolean key in Add Asset API response to identify existing/new Asset ID or QR | - | - | 2026-05-15 |
| [#28](https://github.com/RokkaLabs/assetmanager/issues/28) | New review improvement to implement | - | - | 2026-05-14 |
| [#18](https://github.com/RokkaLabs/assetmanager/issues/18) | Healthcheck failing due to IPv6/IPv4 mismatch | - | - | 2026-05-03 |
| [#15](https://github.com/RokkaLabs/assetmanager/issues/15) | Deploy Asset manager on JMV server | - | - | 2026-04-28 |
| [#14](https://github.com/RokkaLabs/assetmanager/issues/14) | New improvement suggestion | - | - | 2026-04-28 |
| [#13](https://github.com/RokkaLabs/assetmanager/issues/13) | Migrate Supabase DB to Self-Hosted PostgreSQL | - | - | 2026-04-27 |
| [#12](https://github.com/RokkaLabs/assetmanager/issues/12) | Migrate Independent Telemetry to Grafana | - | - | 2026-04-23 |
| [#11](https://github.com/RokkaLabs/assetmanager/issues/11) | Remove Employee Email as Unique Constraint | - | - | 2026-04-16 |
| [#10](https://github.com/RokkaLabs/assetmanager/issues/10) | Replace Google Login with AuthNexus in Asset Manager | - | - | 2026-04-16 |
| [#9](https://github.com/RokkaLabs/assetmanager/issues/9) | Use In-House Telemetry System Instead of Grafana | - | - | 2026-04-16 |
| [#8](https://github.com/RokkaLabs/assetmanager/issues/8) | Remove Employee Id while lookup or public route (Scan QR) | - | - | 2026-04-16 |
| [#7](https://github.com/RokkaLabs/assetmanager/issues/7) | Make initial asset import "serial no" field as optional then next as mandatory fields | - | - | 2026-04-16 |
| [#5](https://github.com/RokkaLabs/assetmanager/issues/5) | Asset Tracking Enhancements & bug fixes | enhancement | - | 2026-04-07 |
| [#2](https://github.com/RokkaLabs/assetmanager/issues/2) | Prepare a long term product vision and roadmap document. | - | - | 2026-03-18 |
| [#1](https://github.com/RokkaLabs/assetmanager/issues/1) | Create dummy dashboard for admin | - | - | 2026-03-17 |

---

## Verification against the codebase (2026-08-01)

### Methodology — and why the first pass was wrong

Every claim was checked twice:

1. **Working tree** (`feature/refresh-token-bff` + ~220 uncommitted files)
2. **`upstream/main`** — the branch the issues actually track

This split matters. A first pass against the working tree alone suggested four issues were fixed
(#50, #62, #66, #87). Re-checked against `upstream/main`, **none of them are**: three "fixes" exist
only in uncommitted local work, and one was a misreading. **No issue was closed.**

Rule for this register: an issue is only closable when the fix is on `upstream/main`, not merely in
someone's working tree.

### Corrected verdicts on the four "fixed" candidates

| # | First-pass verdict | Actual state on `upstream/main` | Closable |
| --- | --- | --- | --- |
| #50 JWKS no TTL | "fixed — live path uses `PyJWKClient(lifespan=300)`" | **Still true.** `AuthMiddleware` does use `PyJWKClient`, but the no-TTL `get_jwks()` in `Server/core/auth.py:19` is **still live**: `main.py:18` imports `get_auth_user_id_from_bearer` / `_resolve_request_role`, both of which depend on `verify_session` -> `get_jwks()` | No |
| #62 Two auth flows | "dead — `require_backend_api_key` unreferenced" | **Still true.** `main.py:87` on upstream still wires `protected_dependencies = [Depends(require_backend_api_key)]`. Only the *local, uncommitted* tree removed it | No |
| #66 PG error codes leak | "fixed — denylist in `errors.ts`" | **Misread — still true, and by design.** `duplicate key`, `null value violates`, `check constraint`, `violates foreign key` sit in **`PASSTHROUGH_HINTS`** (errors.ts:25-47), i.e. raw Postgres text is *deliberately shown to the user*, not suppressed | No |
| #87 `console.debug` ungated | "mostly fixed — 1 occurrence left" | **Still true.** `upstream/main` has 8 (`otel-telemetry.ts` 1 + `authNexus.api.ts` 7). The reduction to 1 is local and uncommitted | No |

### Confirmed still true on the current codebase

| # | Claim | Evidence |
| --- | --- | --- |
| #40 | No HTTPS/TLS | no `listen 443` / `ssl_certificate` in `Client/nginx.conf` |
| #41 | API key sent from the browser | `X-API-Key` in `Client/src/api.ts:27`, `Client/src/utils/authNexus.api.ts:126` |
| #42 | Containers run as root | zero `USER` directives in `Server/Dockerfile`, `Client/Dockerfile` |
| #43 | No DB backup | no `pg_dump` / backup step in `docker-compose.yml` or CI |
| #44 | Token data logged to console | ~10 `console.log` lines emit `token_len`, `has_access_token`, expiry (metadata, not the raw token) |
| #47 | RLS disabled | no `ROW LEVEL SECURITY` / `CREATE POLICY` in `DB/init.sql` |
| #49 / #59 | Audit columns nullable | `admin_id uuid,` (init.sql:195), `actor_id text,` (init.sql:272) |
| #51 | Admin creds in memory | `_token` / `_refresh_token` class attrs, `authnexus_service.py:14` |
| #52 | No rate limiting | no `slowapi` / limiter / `limit_req` anywhere |
| #53 | Nginx security headers missing | only 2 `add_header`, both `Cache-Control` |
| #55 | Deploy causes downtime | `sudo docker compose down` then `up`, `deploy.yml:21` |
| #56 | Access token in `localStorage` | `authService.ts:19,30` — **partial**: refresh token moved to HttpOnly cookie, access token still stored |
| #60 | No HTTP -> HTTPS redirect | no `return 301` / rewrite in nginx.conf |
| #63 | Broad `except Exception` | `auth_middleware.py:76,109` |
| #67 | No CSRF protection | zero `csrf` / `xsrf` references in client or server |
| #69 | `custom_fields` unvalidated | `dict[str, Any]` in `Server/schemas/asset.py:19,47,67` |
| #70 | PII plaintext | `pgcrypto` installed (init.sql:38) but **unused** for any PII column |
| #72 | Missing `asset_events.created_at` index | only `idx_asset_events_actor` / `_asset` / `_type` exist |
| #73 | No `.env` validation in CI | `deploy.yml` has SSH secrets only, no env check |
| #76 | `any` casts | 4 occurrences across `api.ts` (3) and `authNexus.api.ts` (1) |
| #78 | `print()` for startup warnings | 4 in `Server/core/settings.py` |
| #79 | Credential obfuscation by concat | `"SUPA" + "BASE_URL"`, settings.py:161 — comment says "hidden from regex scans" |
| #83 | Token metadata at INFO | `api_auth.py:50,66,83` log `token_len` and cookie contents |
| #86 | Blob URL 2-minute timeout | `setTimeout(..., 120000)` in `useAssetExports.ts:126,145` |
| #88 | Welcome keys accumulate | `WELCOME_DISMISSED_PREFIX`, `Notifications.tsx:18` |
| #90 | `failedQueue` race | `authNexus.api.ts:35-45` |
| #91 | Weak `.env.example` password | `AUTHNEXUS_ADMIN_PASSWORD=admin-password` |
| #92 | ecdsa Minerva | `ecdsa==0.19.2` pinned in requirements.txt |
| #95 | idna below 3.15 | `idna==3.13` |

### Claims that are true but mis-stated

| # | Correction |
| --- | --- |
| #45 | `next` **is** unvalidated (`routeGuards.tsx:53`), but it flows into react-router `navigate()` (`AuthCallback.tsx:46`), which is same-origin — `history.pushState` rejects cross-origin targets. Real gap, **severity over-rated** (not a true open redirect) |
| #57 | The raw `fetch()` calls bypassing the axios interceptor still exist (`api.ts:976,1012`), but appear **orphaned** — the live QR-labels export goes through `assetService.ts:120` (axios). Confirm before spending effort |
| #65 | **Partial.** Row cap (`ASSET_IMPORT_MAX_ROWS`) and an `accept` attribute exist; no file-size or server-side MIME check |
| #89 | **Mislocated.** The issue points at `AllAssets.tsx`; the un-memoised `getActiveAdvancedFilterCount` is now in `Employee.tsx:186,364` |
| #35 | Camera scan uses `BarcodeDetector` (`ScanPage.tsx:162`), which is **Chrome/Edge only**. Firefox and Safari fall to "not supported, use manual entry" — likely the real cause of the report, not a bug |
| #34 | Still open and matches current work: `DB/init.sql:131` `fn_next_asset_tag()` hardcodes `AST-00001`, no category alias |

### Not verified

#68 (HTTP timeout consistency), #75 (silent async catches), #81 (null-check style) — sweep-style audits
that need a full read rather than a grep.

---

## Work completed

### #78 [L-01] `print()` used for startup warnings — FIXED, CLOSED 2026-08-01

**The trap:** a straight `print()` -> `logger.warning()` swap would *not* have fixed the reported
symptom. `Settings()` is built at import time — `main.py:7` imports it, `logging.basicConfig()` is at
`main.py:22`, and the OTLP handler attaches later inside `init_observability()`. Warnings logged from
`__post_init__` would hit Python's handler-of-last-resort, print unformatted to stderr, and still
never reach Loki, which is exactly what the issue complained about.

**Fix:** `Settings._warn()` buffers `(template, args)` pairs into `settings.startup_warnings`;
`emit_startup_warnings()` flushes them through `logging.getLogger(__name__)` and is called by
`create_app()` right after `init_observability(app)`. Args stay unformatted so aggregation groups on
the template rather than on 50 distinct URLs.

**Verified live** in the container with a forced-bad env: nothing printed at construction, then both
warnings emitted with timestamp + level + `core.settings` logger name.

**Tests:** `Server/tests/test_startup_warnings.py` (9) — each warning branch, clean-config case,
`%`-arg structure, double-flush idempotency, and an assertion that `create_app()` calls the flush.
Regression guard fails if `print(` returns to `settings.py` (committed `HEAD`: 4, now 0).
Server suite **84 passed** (was 75); server rebuilt, healthy, 54 routes intact.

**Left alone:** `Server/auth/auth_nexus.py` still has 4 `print()` calls but is imported nowhere —
dead module, better deleted than fixed.

### #44 [C-05] Sensitive token data logged to browser console — FIXED, CLOSED 2026-08-01

Closed on maintainer instruction. Full write-up posted to the issue.

**Confirmed worse than reported.** The audit listed 4 lines; a sweep of the auth path found 24
`console.*` calls across 3 files, 6 of which leaked object graphs that can carry token material:

| File | Leak |
| --- | --- |
| `authNexus.api.ts:72` | full `data` refresh response object (the line the issue names) |
| `authNexus.api.ts:61` | `response.text()` body of a failed `/api/auth/refresh` |
| `authNexus.api.ts:66` | `Object.keys(data)` dump |
| `authService.ts:108` | OIDC `user` token flags |
| `authService.ts:128` | `res.text()` body of a failed `/api/auth/set-session` — echoes the submitted refresh token |
| `authService.ts:93,103,131`, `AuthCallback.tsx:20` | raw caught `err` objects |

**Fix** — new `Client/src/utils/devLog.ts`:

- `devLog` / `devWarn` gated on `import.meta.env.DEV`, stripped from production builds
- `errorLog(message, detail?)` — production-visible, accepts only a string/number, never an object
- `describeError(unknown)` — reduces a caught value to a safe string

All 24 call sites migrated. Both failure paths that read a response body no longer read it at all —
only the status code is logged.

**Verification**

- Production bundle: **0** `console.log`/`console.debug` in application code; 48 `console.error`
  retained so failures still report. The 5 remaining `console.log` in `dist/` are inside the `xlsx`
  vendor library.
- `Client/src/utils/devLog.test.ts` (11 tests) — unit tests plus a **source guard** that fails the
  suite if anyone reintroduces an ungated `console.log` or passes
  `data`/`body`/`err`/`user`/`response`/`config`/`headers` to a console call on the auth path.
  Prove-It: 4 failed before the fix, 11 passed after.
- vitest 51 passed (was 40) · build clean · lint no new errors · e2e `login.spec.ts` 3/3 against a
  rebuilt client image · live `tests/test_bff_session.py` 7/7 (refresh + cookie rotation intact).

**Scope note:** `authNexus.api.ts` and `authService.ts` are in `config.protectedPaths`. Edited under
explicit human direction; recorded in `.claude/state/bypass.log`.

**Not covered:** #83 (server-side token metadata at INFO, `Server/routers/api_auth.py:50,66,83`) is
the server counterpart and remains open.

## Overlap with the 2026-08-01 load test

Three audit items match findings reached independently in `Notes/api-load-test-500-users.md`:

| # | Audit item | Load-test finding |
| --- | --- | --- |
| #72 | Missing index on `asset_events.created_at` | Same class of gap as the missing trigram index on asset search (`ILIKE '%x%'` over a 5-table view -> Seq Scan) |
| #85 | Routers bypass the service layer and call repositories directly | Observed in `api_v1_meta.py` while adding the dashboard cache |
| #80 | Global singletons (`_jwks_cache`, `_pool`) hurt testability | The new `_dashboard_stats_cache` adds one more to that list |

## Reading

Nothing here is a functional bug — the application logic is sound. The backlog is almost entirely
**deployment and security hardening**. Before 500 real users touch the system, the four that matter
most are: HTTPS (#40/#60), non-root containers (#42), database backups (#43), and rate limiting (#52).
