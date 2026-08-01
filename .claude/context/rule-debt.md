# Loop-rule debt across the codebase (baseline 2026-07-18)

The loop rules (`.claude/rules/`) apply everywhere, not just new files. This is the standing
backlog of existing violations. Rule: burn these down incrementally — fix a file's violations
whenever it is touched for feature work, plus dedicated passes. NEVER mass-refactor blindly
(build + e2e must stay green after every file).

## 1. Files > 200 lines

Baseline 39. Split so far: Sidebar, App.tsx, AllAssets, LogViewer (2026-07-18); AnimatedNavIcon
(317→58 +navIcons), InfoHint (276→191 +InfoHintPanel), FilterSelect (244→197 +FilterSelectMenu),
DepartmentCombobox (214→179 +panel), EmployeeForm (272→133 +Fields/Field), OtherAssetForm (281→192
+fields) — the last 6 done in ONE parallel multi-agent workflow (2026-07-19), shared tree + disjoint
files, verified by a single build + e2e. ~28 remaining (Employee 1408, AssetDetail 925,
Overview.Analysis ~760, api_v1_assets 1348, employee_repository 684, api_v1_employees 647, forms,
etc). Big client pages deferred to UI Phase 4 (rewrite-then-split, avoid double work).

### PROD BUG found during AllAssets e2e — FIXED 2026-07-18
Hard nav / refresh on `/assets` → nginx `try_files` matched the physical Vite build dir
`dist/assets/` and 301-redirected to `http://localhost/assets/` (port dropped) → connection
refused. FIXED via `build.assetsDir: 'static'` in vite.config.ts (build output moved off the
`/assets` route). `/assets` now returns 200 on direct load. Regression guard:
Client/e2e/assets.spec.ts "hard navigation ... no longer 301s".

Split priority = size × churn. Extract cohesive pieces into sibling modules; keep public API stable.

### Client (biggest first)
| Lines | File | Split into |
|---|---|---|
| 1417 | components/pages/Employee.tsx | list table, filters, bulk-import wiring, row actions, hooks |
| ~~1127~~ DONE | components/pages/AllAssets.tsx | SPLIT 2026-07-18 → AllAssets.tsx (172) + assets/{allAssetsConfig, useAssetsFilters, useAssetExports, useAssetsListSync, AssetsToolbar, AssetsTable, AssetsRowActions, AssetsFilterPopup, AssetsOverlays, AssetQrModal, assetsHeaderActions, assetsIcons}. All <200. Added UI primitives (Skeleton/Button), 4 data states, table→card mobile. e2e: assets.spec.ts. |
| ~~979~~ DONE | components/common/Sidebar.tsx | SPLIT 2026-07-18 → Sidebar.tsx (192) + sidebar/{sidebarNav.helpers.ts 195, SidebarLeafNav 190, SidebarGroupNav 181, SidebarNavigation 99, sidebarChrome 20}. All <200. Also removed leftover hardcoded orange gradients → tokens. |
| 925  | components/pages/AssetDetail.tsx | header, assignment panel, timeline, PDF/export actions |
| 798  | components/pages/Overview.Analysis.tsx | KPI row, charts, employee-load table |
| 715  | components/form/AssetForm.tsx | field groups, custom-field renderer, submit hook |
| ~~478~~ DONE | App.tsx | SPLIT 2026-07-18 → App.tsx (168) + app/{useAuthBootstrap.ts 102, TopBar.tsx 146, routeGuards.tsx 89}. All <200. |
| 444  | asset/AssetHistoryTimeline.tsx · 443 ScanPage · 441 EmployeeBulkImportModal |
| 376  | InventoryBulkUpdateModal · EmployeeAssignLookup · 363 AssetBulkImportModal |
| 349  | Notifications · 327 AnimatedNavIcon · 317 NewAsset · 280 OtherAssetForm |
| 276  | InfoHint · 272 EmployeeForm · 265 LogViewer · 254 EmployeeDetail |
| 248  | RecycleBin · 243 FilterSelect · 214 DepartmentCombobox · 208 AssetHistoryTable |

### Server (biggest first)
| Lines | File | Split into |
|---|---|---|
| 1348 | routers/api_v1_assets.py | split by concern: assets CRUD, scan, export, qr-labels, recycle-bin, logs |
| 872  | scripts/import_v2_from_sheet.py (one-off script — lower priority) |
| 684  | repositories/employee_repository.py | read vs write vs portfolio queries |
| 647  | routers/api_v1_employees.py | CRUD, bulk, authnexus-sync, checks |
| 403  | services/assignment_service.py · 383 audit_trail_pdf_service · 381 pg_seed_dummy (script) |
| 371  | services/asset_service.py · 319 api_v1_meta · 299 authnexus_service |
| 281  | asset_write_repository · 256 notifications/orchestrator · 221 qr_repository · 204 asset_detail_repository |

## 2. Other rule violations (client, measured)

- `any` usage: 4 files — replace with `unknown` + narrowing or typed models.
- `.then(` chains: 4 files — convert to async/await (banThen).
- Server API envelope: mostly consistent (`core/api_response.py`); audit when touching routers.
- UI four-states (loading/error/empty/data): verify per list page during UI Phase 4.

## Approach (loop-disciplined)

1. One file per iteration. Extract → build → e2e green → next.
2. Prefer extraction that also advances the UI redesign (e.g. Sidebar split can drop nav-items
   onto the new primitives).
3. Don't touch protected auth files without sign-off.
4. Update this table as files drop under 200.
