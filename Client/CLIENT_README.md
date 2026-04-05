# AMS Client

[React 19 + Vite 7 + TypeScript frontend for the Asset Manager](https://web-assetmanager.vercel.app)
---

## Latest updates (current implementation)

- **Home & auth UX:** Marketing-style home (`HomeHero`, `OverviewKpisBox`, `AssignReturnBox`, `ShipAnythingBox`, `ActBeforeItBreaksBox`, `RightAccessBox`, `QuickFactsRow`) plus **`ParticleIntroLoader`** after sign-in. OAuth sets a short-lived `sessionStorage` marker (`signInWithGoogle`); `App.tsx` consumes it on `INITIAL_SESSION` / `SIGNED_IN` via `takePendingPostSignInIntro()` (JSON payload + TTL, in-memory bootstrap memo for React 18 Strict Mode). `/login` success uses `Navigate` **`state.showPostSignInIntro`**. `resetPostSignInIntroBootstrapClaim()` runs after the intro finishes or on sign-out.
- **`getPublicDashboardSummary()`:** Anonymous-friendly summary for the signed-out home preview (category breakdown strip); authenticated home does not depend on live counter RPCs for that card.
- **All Assets:** Paginated list via **`getAssetsPage`** (offset/limit, `PAGE_SIZE` 50), debounced search, **FilterPopup** + **FilterSelect** for inventory status and category, ERP-inactive holder checkbox, **LoadMorePagination**, row **action menu** (view, QR view/regenerate when admin/IT Ops, soft delete with **ConfirmDialog**), **`InventoryStatusBadge`** / `getInventoryStatusTone` for list (and detail/scan where used). Optional **FilterPopup** pattern replaces a single crowded filter bar.
- **Layout shell:** `App.tsx` wraps the app with **`ToastProvider`**; main content column is `flex-1 min-w-0 w-full overflow-x-hidden overflow-y-auto` so footers and full-width sections behave beside **`Sidebar`** (`w-[230px]` expanded, `w-[60px]` collapsed on `sm+`).
- **Engineering telemetry (opt-in):** `src/telemetry.ts` buffers engagement-style events in memory + `localStorage`, flushes on a ~30s timer (and on batch size / high priority), and uses `navigator.sendBeacon` on tab close. Ingest requires `VITE_TELEMETRY_ENABLED=true` plus URLs for the TelemetryServer ingest endpoint and the **main** FastAPI `POST /telemetry/ingest-token` (so the browser never calls `telemetry/ingest-token` on the Vite host by mistake). Metadata keys matching a denylist are redacted before send.
- **Employee / ERP split:** `EmployeeRecord` carries both `is_active` and `erp_active`. The Employees page filters both dimensions; **default filters** are employment **Active** and ERP **Inactive**. **New employee** form defaults to the same (`is_active: true`, `erp_active: false`). Asset inventory exposes `current_employee_is_active` and `current_employee_erp_active`; list filters and holder badges use ERP where labeled “ERP”.
- **`Notifications`** (`/notifications`): warranty alerts, date range, incremental loading, welcome prompt (TopBar still links here; sidebar link may be commented in `sidebarNav.ts`).
- **`Recycle Bin`** (`/recycle-bin`): list + restore RPCs; toast feedback.
- **Soft delete** for assets (and employees from their flows): confirmation dialog + `softDeleteAssetById` / `softDeleteEmployeeById`.
- **Asset bulk import:** **`/assets/new`** — `InfoHint` + **Bulk import** opens `AssetBulkImportModal`. Parser `utils/assetBulkImport.ts` (`parseAssetImportMatrix` with `fixedCategorySlug`); template `/asset-import-template.xlsx` (`ASSET_IMPORT_TEMPLATE_HREF`). Regenerate headers file: `node scripts/generate-asset-import-template.mjs` from `Client/`.
- **Shared:** `useRefreshableLoader`, **InfoHint** + JSON hints (e.g. assets page), **Breadcrumbs**, **ScrollTopButton**, **IconActionButton**, **formatEnumLabel** / **formatDateTime** in `formatDisplay.ts`.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Dependencies](#dependencies)
4. [Environment Variables](#environment-variables)
5. [Running Locally](#running-locally)
6. [Build & Scripts](#build--scripts)
7. [Entry Point & App Bootstrap](#entry-point--app-bootstrap)
8. [Routing & Auth (`App.tsx`)](#routing--auth-apptsx)
9. [API Layer (`api.ts`)](#api-layer-apits)
10. [Client telemetry (`telemetry.ts`)](#client-telemetry-telemetryts)
11. [Supabase Client (`supabaseClient.ts`)](#supabase-client-supabaseclientts)
12. [Pages (`components/pages/`)](#pages-componentspages)
    - [Home](#home)
    - [AllAssets](#allassets)
    - [AssetDetail](#assetdetail)
    - [NewAsset](#newasset)
    - [Employee](#employee)
    - [NewEmployee](#newemployee)
    - [ScanPage](#scanpage)
    - [Analysis](#analysis)
    - [Notifications](#notifications)
    - [RecycleBin](#recyclebin)
13. [Common Components (`components/common/`)](#common-components-componentscommon)
    - [Sidebar](#sidebar)
    - [Footer](#footer)
    - [ParticleIntroLoader](#particleintroloader)
    - [InventoryStatusBadge](#inventorystatusbadge)
    - [ToastProvider](#toastprovider)
    - [FilterPopup / FilterSelect / LoadMorePagination](#filterpopup-filterselect-loadmorepagination)
    - [Breadcrumbs, ScrollTopButton, InfoHint, IconActionButton](#other-common-ui)
    - [Error](#error)
    - [Loader](#loader)
    - [Guide](#guide)
    - [PageNotFound](#pagenotfound)
    - [RefreshButton](#refreshbutton)
    - [AnimatedNavIcon](#animatednavicon)
    - [ConfirmDialog](#confirmdialog)
    - [sidebarNav.ts](#sidebarnav-ts)
14. [Form Components (`components/form/`)](#form-components-componentsform)
    - [AssetForm](#assetform)
    - [EmployeeForm](#employeeform)
    - [Bulk import (Excel)](#bulk-import-excel)
15. [Utilities (`utils/`)](#utilities-utils)
    - [errors.ts](#errorsts)
    - [formatDisplay.ts](#formatdisplayts) (`formatDisplay`, `formatEnumLabel`, `formatDateTime`)
16. [Hooks (`hooks/`)](#hooks-hooks)
    - [useRefreshableLoader.ts](#userefreshableloaderts)
17. [Styles (`styles/`)](#styles-styles)
    - [theme.css](#themecss)
    - [global.css](#globalcss)
18. [Privileged access](#privileged-access)
19. [QR Code Behavior](#qr-code-behavior)
20. [Realtime & Dashboard Stats](#realtime--dashboard-stats)
21. [Vercel Deployment](#vercel-deployment)
22. [Known Issues & Notes](#known-issues--notes)

---

## Architecture Overview

```
Browser
  │
  ├─► Supabase (anon key, RLS-enforced)   ← all data reads/writes
  │     ├─ Auth (Google OAuth)
  │     ├─ Tables (employees, assets, assignments, etc.)
  │     ├─ Views (v_asset_inventory)
  │     └─ RPC (fn_public_scan_asset, fn_assign_asset, fn_return_asset, fn_is_admin_or_it_ops, fn_set_employee_role, etc.)
  │
  └─► FastAPI Server (optional at runtime)
        └─ Used when integrations call the REST API; QR in DB may be produced server-side with `FRONTEND_URL`
        └─ Issues short-lived telemetry ingest tokens (`POST /telemetry/ingest-token`) when telemetry is enabled
  │
  └─► Telemetry Server (optional)
        └─ Receives batched browser events with `X-Telemetry-Ingest-Token` (separate origin/port in dev)
```

- The SPA **does not use `fetch` to the FastAPI base URL** for normal screens: lists, detail, assign/return, and auth all go through Supabase (anon key + RLS + RPC). The FastAPI server still matters for server-side QR embedding, optional **telemetry token** issuance, and any tooling that uses the HTTP API.
- Privileged UI actions use `hasActiveAdminAccess()` (RPC `fn_is_admin_or_it_ops`, aligned with `employees.role`). IT Ops-only flows use `setEmployeeRole` → `fn_set_employee_role`.

---

## Project Structure

```
Client/
├── index.html                      # HTML root; mounts #root
├── vite.config.ts                  # Vite config (React plugin only)
├── vercel.json                     # Rewrites all paths to index.html
├── package.json                    # Dependencies and scripts
├── tailwind.config.js              # Tailwind config
├── postcss.config.js               # PostCSS config for Tailwind
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
├── .env                            # Local secrets (gitignore this)
├── .env.example                    # Template for env vars
│
└── src/
    ├── main.tsx                    # React root render, StrictMode
    ├── index.css                   # Global CSS imports
    ├── App.tsx                     # Router, auth state, route tree
    ├── api.ts                      # All Supabase calls, types, helpers
    ├── telemetry.ts              # Opt-in buffered engineering telemetry (local buffer + ingest)
    ├── supabaseClient.ts           # Supabase client singleton
    │
    ├── components/
    │   ├── pages/
    │   │   ├── Home.tsx            # Landing: hero, story sections, footer, particle intro
    │   │   ├── AllAssets.tsx       # Paginated list, advanced filters, row actions, QR/soft delete
    │   │   ├── AssetDetail.tsx     # Detail, edit, assign/return, toasts
    │   │   ├── NewAsset.tsx        # Create asset (privileged)
    │   │   ├── Employee.tsx        # Directory, passport, admin/role controls
    │   │   ├── NewEmployee.tsx     # Create employee (privileged)
    │   │   ├── ScanPage.tsx        # Public / protected QR scan
    │   │   ├── Analysis.tsx        # IT Ops–oriented analysis (gated in page)
    │   │   ├── Notifications.tsx # Warranty alerts + welcome prompt
    │   │   └── RecycleBin.tsx      # Soft-deleted rows + restore
    │   │
    │   ├── common/
    │   │   ├── Sidebar.tsx         # Nav, groups, theme/density/font, mobile drawer
    │   │   ├── sidebarNav.ts       # Typed nav sections (Main / Tools)
    │   │   ├── AnimatedNavIcon.tsx # Animated SVG nav icons
    │   │   ├── ParticleIntroLoader.tsx  # Post–sign-in fullscreen intro
    │   │   ├── InventoryStatusBadge.tsx # Status dot + label tones
    │   │   ├── ToastProvider.tsx   # App-wide toasts (`useToast`)
    │   │   ├── FilterPopup.tsx     # Modal shell for advanced filters
    │   │   ├── FilterSelect.tsx    # Labeled select for filter popups
    │   │   ├── LoadMorePagination.tsx
    │   │   ├── Breadcrumbs.tsx
    │   │   ├── ScrollTopButton.tsx
    │   │   ├── InfoHint.tsx
    │   │   ├── IconActionButton.tsx
    │   │   ├── ConfirmDialog.tsx
    │   │   ├── IdleWarningModal.tsx
    │   │   ├── Error.tsx           # Reusable error display card
    │   │   ├── Footer.tsx          # Site footer (1320px content band)
    │   │   ├── Loader.tsx          # Full-screen loading indicator
    │   │   ├── Guide.tsx           # Public usage guide
    │   │   ├── PageNotFound.tsx    # 404 page
    │   │   └── RefreshButton.tsx   # Accessible refresh button
    │   │
    │   └── form/
    │       ├── AssetForm.tsx       # Create/edit asset form (modal or panel)
    │       ├── AssetBulkImportModal.tsx  # Excel → sequential createAsset (New Asset)
    │       ├── EmployeeBulkImportModal.tsx  # Excel → sequential insertEmployeeNew (New Employee)
    │       ├── OtherAssetForm.tsx # Simplified create path for “Other” category
    │       ├── CategoryPickerGrid.tsx
    │       └── EmployeeForm.tsx    # Create/edit employee form
    │
    ├── utils/
    │   ├── assetBulkImport.ts      # parseAssetImportMatrix, template constants (assets)
    │   ├── employeeBulkImport.ts   # parseEmployeeImportMatrix, template constants (employees)
    │   ├── errors.ts               # getUserFacingMessage, logDevError, etc.
    │   └── formatDisplay.ts        # formatDisplay, formatEnumLabel, formatDateTime
    │
    ├── data/                       # Static JSON hints (e.g. assetInfoHint.json)
    │
    └── styles/
        ├── theme.css               # CSS custom property tokens (light/dark/system)
        └── global.css              # Base layout, Tailwind utilities, nav-item styles
```

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` | ^19.0.0 | UI framework |
| `react-dom` | ^19.0.0 | DOM rendering |
| `react-router-dom` | ^7.1.1 | Client-side routing (`BrowserRouter`) |
| `@supabase/supabase-js` | ^2.99.3 | Supabase client (Auth, PostgREST, RPC, Realtime) |
| `qrcode` | ^1.5.4 | Client-side QR code fallback generation |

### Dev

| Package | Purpose |
|---|---|
| `vite` ^7 | Build tool and dev server |
| `@vitejs/plugin-react` | Vite React plugin (babel + HMR) |
| `typescript` ~5.6 | TypeScript |
| `tailwindcss` ^3.4 | Utility CSS framework |
| `eslint` + plugins | Linting with react-hooks and react-refresh |

---

## Environment Variables

All Vite env vars must be prefixed with `VITE_` to be available in browser code via `import.meta.env`.

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anon (public) key |
| `VITE_PUBLIC_APP_ORIGIN` | ❌ No | **QR scan links:** overrides the built-in production origin. **Production builds** default to `https://web-assetmanager.vercel.app` (see `PRODUCTION_QR_APP_ORIGIN` in `api.ts`). **Dev** defaults to `window.location.origin`; set to `http://192.168.x.x:5173` for phone-on-LAN testing. Forks should change the constant or set this var. |
| `VITE_TRUST_STORED_ASSET_QR` | ❌ No | If `true`, the “View QR” path may reuse `asset_logs.qr_code` even when it points at the wrong host. **Do not set in production** unless you know every stored QR is correct. Default behavior: production and dev-with-`VITE_PUBLIC_APP_ORIGIN` **regenerate** the PNG so scans match the current origin. |
| `VITE_TELEMETRY_ENABLED` | ❌ No | If `true`, `telemetry.ts` runs: buffered events flush to `VITE_TELEMETRY_INGEST_URL`. Default off if unset. |
| `VITE_TELEMETRY_INGEST_URL` | When telemetry on | Full URL to TelemetryServer batch ingest (e.g. `http://localhost:8010/telemetry/events`). |
| `VITE_TELEMETRY_TOKEN_URL` | When telemetry on | Full URL to **main** FastAPI `POST /telemetry/ingest-token` (e.g. `http://localhost:8000/telemetry/ingest-token`). **Do not** leave this as a relative path in dev unless you add a Vite proxy; otherwise the browser will call the Vite origin and get 404. |
| `VITE_API_URL` | ❌ Unused | Reserved for future FastAPI calls from the browser; not read by `telemetry.ts` (that module uses `VITE_TELEMETRY_TOKEN_URL` instead). |

**`supabaseClient.ts` throws immediately** (`throw new Error(...)`) at module load time if either required variable is missing — this is intentional fail-fast behavior.

For Vercel deployment, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the **Client Vercel project** dashboard. The local `.env` file is NOT used during Vercel builds.

**Production example:** `VITE_SUPABASE_*` values come from the same Supabase project as the server’s `SUPABASE_URL` / service key. The deployed app URL (e.g. `https://web-assetmanager.vercel.app`) must be allowed in Supabase Auth → URL configuration (site URL + redirect URLs).

---

## Running Locally

```bash
cd Client
npm install
npm run dev
```

App starts at `http://localhost:5173` (and on your LAN IP—`vite.config.ts` sets `server.host: true`).

### QR codes and other devices

Asset QR codes point at `{origin}/scan/{tag}`. That origin defaults to whatever URL you opened in the browser. On a laptop that is often `http://localhost:5173`, which **does not work on a phone** (the phone’s “localhost” is the phone, not your PC).

**Fix:** In `.env`, set `VITE_PUBLIC_APP_ORIGIN` to a URL your phone can open—typically your machine’s LAN address and Vite port, e.g. `http://192.168.1.10:5173`. Restart `npm run dev`, create or regenerate the asset QR, and scan again. Use the **same** Supabase project from that URL (already true if both devices use the internet).

**Production:** Leave `VITE_PUBLIC_APP_ORIGIN` unset so deployed builds use the real site origin. Align the server’s `FRONTEND_URL` with that origin for server-generated QRs (`Server` `qr_service.py`).

---

## Build & Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Dev server with HMR |
| `build` | `tsc -b && vite build` | TypeScript compile + production bundle to `dist/` |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `eslint .` | Lint all source files |

---

## Entry Point & App Bootstrap

### `index.html`

- Sets `lang="en"`, `charset="UTF-8"`, viewport meta.
- Loads `/src/main.tsx` as an ES module.
- Root element: `<div id="root">`.

### `src/main.tsx`

- Renders `<App />` inside `StrictMode` into `#root`.
- Imports `./index.css`.

### `src/App.tsx` (bootstrap)

- Wraps `<BrowserRouter>` with **`ToastProvider`** so `useToast()` is available under all routes.

### `src/index.css`

- Imports `./styles/theme.css` and `./styles/global.css`.

---

## Routing & Auth (`App.tsx`)

### Component tree

```
App
└── ToastProvider
    └── BrowserRouter
        └── AppRoutes
            ├── TopBar (non–public scan)
            ├── flex row: Sidebar (non–public scan) | main scroll column (`flex-1 min-w-0 overflow-x-hidden overflow-y-auto`)
            └── Routes (inside scroll column)
                ├── /                   → <Home ... /> (public; passes intro props from auth state)
                ├── /dashboard/home     → same Home (public alias)
                ├── /scan/:id           → <ScanPage /> (public QR landing)
                ├── /guide              → <Guide /> (public)
                ├── /login              → <SignInScreen /> or <Navigate /> if session
                │
                └── <RequireAuth>       (guards all below)
                    ├── /assets/scan    → <ScanPage protectedRoute />
                    ├── /assets/scan/:id → <ScanPage protectedRoute />
                    ├── /assets         → <AllAssets />
                    ├── /assets/new     → <NewAsset />
                    ├── /assets/:id     → <AssetDetail />
                    ├── /404            → <PageNotFound />
                    ├── /employee       → <Employee />
                    ├── /employee/new   → <NewEmployee />
                    ├── /analysis       → <Analysis />
                    ├── /notifications  → <Notifications />
                    └── /recycle-bin    → <RecycleBin />
```

### Auth state machine

| Phase | State | UI |
|---|---|---|
| Loading | `authLoading=true` | `<AuthLoadingScreen>` ("Checking session...") |
| Unauthenticated | `session=null` | Public routes (e.g. `/`, `/guide`) with sidebar; `/login` shows `<SignInScreen>`; protected paths redirect to `/login?next=<encoded-return-url>` |
| Authenticated | `session` set | Same layout; `<RequireAuth>` children render on protected routes |

**Session lifecycle:**
1. On mount: `getSession()` called asynchronously.
2. `onAuthStateChange((session, event))` keeps `session` in sync; on `INITIAL_SESSION` / `SIGNED_IN` with a pending OAuth marker, sets **`showIntroAfterSignIn`** so `<Home>` can run **`ParticleIntroLoader`** once (see `takePendingPostSignInIntro` in `api.ts`). On `SIGNED_OUT`, clears intro bootstrap state.
3. Cleanup: `unsubscribe()` + `mounted` flag prevent state updates after unmount.

**Post-sign-in intro:** Email/password-style return from `/login` uses `<Navigate to={loginReturnPath} replace state={{ showPostSignInIntro: true }} />` (`loginReturnPath` from `?next=` or `/`). Google OAuth returns to `signInWithGoogle(nextPath)`’s `redirectTo` (default `/`); the sessionStorage marker drives the same intro flag in `App`.

### `RequireAuth`

- While `authLoading` is true → shows loading screen.
- If no `session` → `<Navigate to={/login?next=...} replace />` where `next` is the current path + search + hash (encoded).

### `SignInScreen`

- Calls `signInWithGoogle(nextPath)` on button click; `nextPath` comes from `?next=` when present and safe, else `/` (OAuth `redirectTo` is `origin + nextPath`).
- Shows loading state while redirect is pending.
- Displays `authError` or local `message` on failure.
- Domain checks are enforced in Supabase settings, not in client code.

### Internal helpers

| Helper | Purpose |
|---|---|
| `AuthLoadingScreen` | Minimal centered "Checking session..." indicator |
| `SignInScreen` | Google OAuth button + error display |
| `loginReturnPath` (in `AppRoutes`) | From `next` query param when it starts with `/`, else `/` |

---

## API Layer (`api.ts`)

`api.ts` is the sole interface between the UI and Supabase. All Supabase calls are here — no component imports `supabase` directly.

### Types exported

| Type | Description |
|---|---|
| `SessionEmployee` | Signed-in user's employee profile |
| `EmployeeRecord` | Full employee row including department and role |
| `EmployeeListFilters` | `search`, `is_active`, `erp_active` (each optional or `'all'`), `department`, `role` |
| `EmployeeRole` | `'employee' \| 'admin' \| 'it_ops'` |
| `CategoryRecord` | `id`, `slug`, `name` |
| `CustomFieldDefinition` | Schema for per-category dynamic fields |
| `AssetInventoryRecord` | Denormalized view row from `v_asset_inventory` |
| `AssetAssignmentRecord` | Assignment row with embedded employee info |
| `AssetComponentRecord` | Component row with manufacturer name |
| `AssetDetailRecord` | `{ asset, assignments, components }` |
| `AssetFilters` | `search`, `status` (inventory status slug), `category_slug`, `hideHeldByInactive`, `current_employee_id`, optional `exclude_category_slugs` |
| `AssignAssetPayload` | `asset_tag`, `employee_code`, `assigned_at?`, `notes?` |
| `ReturnAssetPayload` | `asset_tag`, `returned_at?`, `notes?` |
| `AssetWriteInput` | All asset fields for create/update |
| `EmployeeUpsertInput` | All employee fields for create/update |

### Internal helpers (not exported)

| Helper | Purpose |
|---|---|
| `toCategoryNameFromSlug(slug)` | `"laptop-mac"` → `"Laptop Mac"` |
| `normalizeLocationCode(value)` | Trim, uppercase, replace non-alphanumeric with `-` |
| `extractRpcScalarString(data, keys)` | Extracts a string from RPC's flexible return types |
| `extractRpcScalarBoolean(data, keys)` | Same for booleans |
| `normalizeRole(metadata, directRole?)` | Derives role from `employees.role` or metadata |
| `normalizeEmployeeRoleInput(value)` | Validates and normalizes role string |
| `normalizeEmployeeRow(row)` | Flattens joined `department:departments(name)` and resolves role |
| `ensureNoSupabaseError(error, fallback)` | Throws `Error` if Supabase error is truthy |
| `isMissingRpcError(error, functionName)` | Detects `PGRST202` / "could not find the function" |

### Auth functions

| Function | Description |
|---|---|
| `getSession()` | Returns current `Session \| null` |
| `onAuthStateChange(callback)` | `(session, event) => void` — subscribes to Supabase auth events (`INITIAL_SESSION`, `SIGNED_IN`, …); returns unsubscribe |
| `signInWithGoogle(nextPath?)` | Sets pending post-sign-in intro marker in `sessionStorage`, then OAuth redirect; `redirectTo` is `origin +` normalized path (default `/`) |
| `takePendingPostSignInIntro()` | Reads + clears marker; returns whether to show OAuth-driven intro (JSON + TTL); memoized per page load for Strict Mode |
| `resetPostSignInIntroBootstrapClaim()` | Clears intro memo (after animation or sign-out) |
| `signOut()` | Clears intro state + signs out |

### Employee/access functions

| Function | Description |
|---|---|
| `getSessionEmployee(user?)` | Fetches the current user's employee profile. Primary lookup by `auth_user_id`, fallback by email. Returns `null` if no match |
| `hasActiveAdminAccess()` | RPC `fn_is_admin_or_it_ops` + profile hint + optional `fn_claim_employee_auth_link()` |
| `hasActiveItOpsAccess()` | IT Ops gate for Analysis and role tooling |
| `listEmployees(filters?)` | Full employee list (unpaged) |
| `listEmployeesPage(filters?, options?)` | Paginated employees (`offset` / `limit`, total count) |
| `listDepartments()` | Distinct department names |
| `upsertEmployee(input)` | Upsert by `employee_code`; privileged roles via RPC |
| `setEmployeeAdminStatus(target, makeAdmin)` | Admin grant/revoke |
| `setEmployeeRole(target, role)` | IT Ops → `fn_set_employee_role` |
| `getCurrentEmployeeAssets()` | Passport assets for current user |
| `softDeleteEmployeeById` | Soft delete + note (privileged) |
| `listWarrantyNotifications` / `getWelcomeNotification` | Notifications page RPCs |
| `listRecycleBinEntries` / `restoreRecycleBinEntry` | Recycle Bin |

### Asset functions

| Function | Description |
|---|---|
| `getAssets(filters?)` | Reads `v_asset_inventory` (full list — prefer `getAssetsPage` for large tables) |
| `getAssetsPage(filters?, options?)` | Paginated `v_asset_inventory` read (`offset` / `limit`; returns `{ rows, total }`) |
| `getAsset(assetTag)` | Single row from `v_asset_inventory` by `asset_tag` |
| `getAssetDetail(assetTag)` | `AssetDetailRecord` with `assignments` + `components` |
| `createAsset(payload)` | Admin/IT Ops. Auto `asset_tag`, client QR, `fn_create_asset_with_log` |
| `updateAsset(assetTag, payload)` | Admin/IT Ops patch + FK resolution |
| `listCategories()` | `asset_categories` ordered by name |
| `getCustomFieldDefinitions(categorySlug)` | Dynamic field schema |
| `assignAsset` / `returnAsset` | Assignment RPCs |
| `getPublicScanAsset(ref)` | `fn_public_scan_asset` (anon, minimal fields) |
| `getQrDataUriForAssetTag` | Latest stored QR or client fallback |
| `regenerateQrDataUriForAssetTag` | Writes fresh client QR to logs (privileged) |
| `softDeleteAssetById` | Soft delete + audit note (privileged) |
| `buildAssetQrDataUri` | Internal always-generate QR helper |

### Dashboard / misc

| Function | Description |
|---|---|
| `getPublicDashboardSummary()` | RPC-backed public summary for signed-out home preview |
| `getDashboardStats()` | Live counters (still exported; not wired on current Home) |
| `subscribeDashboardRealtime(cb)` | Realtime refresh hook (still exported; no current consumer) |

---

## Client telemetry (`telemetry.ts`)

- **Purpose:** Non-blocking engineering telemetry (e.g. route views, future client operation timings) with offline-friendly buffering. Does not replace Supabase RLS or business audit logs.
- **Activation:** `VITE_TELEMETRY_ENABLED=true` and valid `VITE_TELEMETRY_INGEST_URL` / `VITE_TELEMETRY_TOKEN_URL`.
- **Flow:** On flush, obtains a short-lived signed token via `POST` to the token URL with `Authorization: Bearer <Supabase access_token>`. Sends batches to ingest with `X-Telemetry-Ingest-Token` and `Content-Type: application/json`.
- **Privacy:** Denylist-based redaction on `metadata` keys; buffer persisted under `localStorage` key `ams.telemetry.buffer.v1` (events only — no raw console dumps).
- **Lifecycle:** `startTelemetryBuffer()` is invoked from `App.tsx` on mount; route changes enqueue `route_viewed` with `priority: 'LOW'`.
- **Reference:** Server-side contract and ops runbook — [`TelemetryServer/TELEMETRY_SERVER_README.md`](../TelemetryServer/TELEMETRY_SERVER_README.md).

---

## Supabase Client (`supabaseClient.ts`)

```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
```

- Uses **anon key** — subject to all RLS policies.
- `detectSessionInUrl: true` handles Supabase OAuth redirect token parsing.
- Throws at module load time if env vars are missing (intentional fail-fast).

---

## Pages (`components/pages/`)

### Home

**Route:** `/` or `/dashboard/home` | **Auth:** Public shell; props from `App` for auth and intro.

- **Props:** `isAuthenticated`, `userId`, `wantPostSignInIntro`, `onPostSignInIntroConsumed`.
- **Post–sign-in:** `ParticleIntroLoader` fullscreen animation when `postSignInIntro` is true (router `state.showPostSignInIntro` or `wantPostSignInIntro` from OAuth flow); on complete, clears router state and notifies `App`.
- **Signed-out:** `getPublicDashboardSummary()` drives the **category breakdown** teaser inside `OverviewKpisBox` (no live counts).
- **Signed-in:** same story-style sections; KPI card is narrative (no `getDashboardStats` on this page today).
- **Layout:** `HomeHero` → content band (`max-w-[1100px]`) with `OverviewKpisBox`, assignment/shipping/alerts/access story cards, `QuickFactsRow` → **`Footer`** (aligned `max-w-[1320px]` band like hero).

---

### AllAssets

**Route:** `/assets` | **Auth:** Protected

**Data:** `getAssetsPage` with page size 50, `totalAssets` for “load more”.

**Features:**
- **Debounced search** (300ms) across tag, serial, model, manufacturer, location, holder name/code, category.
- **Advanced filters** (`FilterPopup`): inventory status, category, “Hide ERP-inactive employees”. Active filter count badge on toolbar.
- **`InventoryStatusBadge`** + tone helper for list status column; ERP chip styling where applicable.
- **Admin / IT Ops vs employee:** non-privileged users scoped by `current_employee_id`; race-safe `requestIdRef`.
- **Row actions:** icon menu (outside click to close) — open detail, view/regenerate QR (`regenerateQrDataUriForAssetTag` when permitted), soft delete with **`ConfirmDialog`**.
- **QR modal** via `getQrDataUriForAssetTag`.
- **`InfoHint`** can surface copy from `src/data/assetInfoHint.json`.
- Row click → `/assets/{asset_tag}`.

---

### AssetDetail

**Route:** `/assets/:id` | **Auth:** Protected

**Sections:**
1. **Header bar** — asset tag, category badge, "Edit Asset" when privileged.
2. **Hero card** — inventory status badge, holder ERP status badge, title (manufacturer + model), location.
3. **Assign / Return panel** — employee code input, optional notes, Assign and Return buttons. Disabled for non-admins. Calls `assignAsset()` / `returnAsset()` RPC. Return button disabled if no open assignment.
4. **Assignment Summary** — current holder name/code, assigned_at, open assignment flag.
5. **Inventory Details** — asset_tag, category, manufacturer, model, serial, location, status, purchase_date, warranty_expiry.
6. **Custom Fields** — all key/value pairs from `asset.custom_fields`.
7. **Components** — table of `asset_components` (type, manufacturer, model, serial, metadata).
8. **Assignment History** — table of all `asset_assignments` with employee name, code, ERP active badge, assigned_at, returned_at, source.

**Edit flow:** `showEdit` state renders `<AssetForm>` as a modal overlay. On success, refreshes asset detail.

**Internal helpers:**
- `openAssignment` — derived via `useMemo` from `assignments` where `returned_at === null`.
- `Section`, `Info`, `AssignmentRow` — internal layout components.

---

### NewAsset

**Route:** `/assets/new` | **Auth:** Protected (`hasActiveAdminAccess`)

- `accessState`: `'loading'` → `'allowed'` or `'denied'`.
- If denied: "Admin Access Required" and back.
- If allowed: header row with **`InfoHint`** (bulk-import copy + sample download) and **Bulk import** button; **category picker** (`CategoryPickerGrid`); then either **`AssetForm`** (standard categories) or **`OtherAssetForm`** (“Other” path). Single-create **on success:** navigates to `/assets/:tag` or `/assets` (unchanged).

**Bulk import (standard categories only):**

- Rendered only when `isBulkImportAllowedCategorySlug(effectiveSlug)` — slugs: `laptop`, `desktop`, `sim`, `pen-drive`, `monitor`, `networking`. Disabled for **Other** and for any slug outside that set.
- **`AssetBulkImportModal`** calls `parseAssetImportMatrix(matrix, { fixedCategorySlug })` so every row uses the **category selected on the page (Mode B)**. The spreadsheet must **not** include a **`category_slug`** column (headers normalize like employee import: lowercased, spaces → underscores — so avoid a column titled e.g. “Category slug”).
- Workbook: **`xlsx`** reads a sheet named **`Import`** (case-insensitive match) if present, else the **first** sheet (`AssetBulkImportModal.pickSheetName`).
- **Preflight:** duplicate **(category + non-empty `serial_number`)** within the file fails the entire parse (no `createAsset` calls).
- **After parse:** sequential **`createAsset`** (same API as `AssetForm`); **`assertActiveAdminAccess`** per call. **`metadata`** on each create includes `source: 'bulk_import'`, `template_version` (`ASSET_IMPORT_TEMPLATE_VERSION` in `assetBulkImport.ts`), and optional `notes` from a `notes` column.
- **Cancel:** closing the dialog (`open` false) or changing the category chip (`effectiveSlug` → `useEffect` clears `bulkImportOpen`) sets a cancel ref so the loop stops; partial rows may already exist.
- **Template:** `public/asset-import-template.xlsx` — regenerate via `node scripts/generate-asset-import-template.mjs`. **Readme** sheet is human-only; parser uses **Import** only.

Parser rules (see `Client/src/utils/assetBulkImport.ts`): strict header allowlist (core columns + union of `field_key` values aligned with `Server/db/migrations/v2/06_seed.sql`); forbidden columns include `employee_code`, `assign`, `assigned_to`, `assignment`, `holder`, `holder_name`; max **`ASSET_IMPORT_MAX_ROWS`** (500) data rows; status must be a valid `asset_status` or blank (`in_stock` default). **Other / custom categories** are not supported in bulk (use the form).

---

### Employee

**Route:** `/employee` | **Auth:** Protected

**Features:**
- Lists employees via **`listEmployeesPage`** with load-more style pagination.
- **Debounced search** (300ms) across `employee_code`, `name`, `email`.
- **Filters:** Employment status (`all` / active / inactive), ERP status (`all` / active / inactive), department (select from `listDepartments()`), role (`all` / `employee` / `admin` / `it_ops`). Initial load uses **employment active** and **ERP inactive**; switch either to `All` to widen the list.
- **Filter-to-API mapping:** `toApiFilters()` translates UI filter state (`EmployeeFiltersInput`) to API filter shape (`EmployeeListFilters`).
- **Employee Passport** — top section shows the signed-in user's own currently assigned assets from `getCurrentEmployeeAssets()`. Includes ERP-inactive note if applicable.
- **Privileged mode:** add/edit employees; "Make Admin" / "Revoke Admin" (`setEmployeeAdminStatus`); IT Ops can set role to IT Ops (`setEmployeeRole`) — admins cannot assign IT Ops.
- **Admin toggle flow:** confirm → RPC → refresh. Self-revoke admin is blocked in UI.
- **Edit flow:** `editEmployee` opens `<EmployeeForm>` in a modal.
- **Access warning:** profile role disagrees with `fn_is_admin_or_it_ops` (e.g. migration or RLS mismatch).
- `successMessage` after save or role changes.

---

### NewEmployee

**Route:** `/employee/new` | **Auth:** Protected (same privileged gate as `NewAsset`)

- Same gate pattern as `NewAsset`.
- If allowed: **`InfoHint`** + **Bulk import** open **`EmployeeBulkImportModal`**; below that, `<EmployeeForm onSubmit={handleCreate}>`. Single-create **on success:** navigates to `/employee`.
- `handleCreate` calls `upsertEmployee()` then navigates. Errors bubble up to `EmployeeForm`.
- **Bulk import:** `parseEmployeeImportMatrix` in **`utils/employeeBulkImport.ts`**; first sheet only in **`EmployeeBulkImportModal`**; sample `public/employee-import-template.xlsx` (`EMPLOYEE_IMPORT_TEMPLATE_HREF`). New rows only (duplicate / recycle-bin checks); sequential **`insertEmployeeNew`**. See modal + util source for caps and column rules.

---

### ScanPage

**Route:** `/scan/:id` | **Auth:** Public (no login required)

- Calls `getPublicScanAsset(id)` using Supabase RPC `fn_public_scan_asset` (granted to `anon`). RPC returns **basic fields only**: tag, category, manufacturer, model, inventory `status` (see migration `17_fn_public_scan_minimal.sql`).
- **Public** (`/scan/:id`): heading + **Current status** badge + category; short note to sign in for full details. **Authenticated** (`protectedRoute`, e.g. `/assets/scan/:id`): full passport via `scanAsset` — location, holder, ERP label, custom fields.
- Error handling: "404" heading if not found, generic "Error" otherwise.
- **Layout:** `App` hides the sidebar/top chrome only for **public** `/scan/*`; protected scan uses the normal authenticated shell.

---

### Analysis

**Route:** `/analysis` | **Auth:** Protected (page-level `hasActiveItOpsAccess`; non–IT Ops see access denied).

- IT Ops telemetry / event exploration UI (reads session + gated content). Sidebar: **Tools → Analysis**.

---

### Notifications

**Route:** `/notifications` | **Auth:** Protected

- Warranty notifications (`listWarrantyNotifications`), optional welcome (`getWelcomeNotification`), date range, incremental load. TopBar bell menu links here; dedicated sidebar link may be commented out in `sidebarNav.ts`.

---

### Recycle Bin

**Route:** `/recycle-bin` | **Auth:** Protected (manage visibility in nav)

- `listRecycleBinEntries` + `restoreRecycleBinEntry`; toast feedback via `useToast`.

---

## Common Components (`components/common/`)

### Sidebar

**File:** `Sidebar.tsx`

Navigation + settings. Rendered for all routes except public QR prefix `/scan/*`. When signed in, loads profile once (shared `getSessionEmployee` + `hasActiveAdminAccess` in one effect): nav privileges, optional “First name | Role” strip above **Settings** (hidden on desktop while collapsed), and mobile drawer. Clears profile on sign-out or fetch error (`logDevError` only). Settings panel unchanged.

**Layout variants:**
- **Desktop (≥sm):** Rail `w-[230px]` expanded, `w-[60px]` collapsed; collapse toggles width. Sticky column with `top` offset under `TopBar`.
- **Mobile (<sm):** Rail hidden; fixed **Menu** button opens a slide-in drawer (`w-[20rem]` panel).

**Features:**

| Feature | Detail |
|---|---|
| Theme toggle | `dark` / `light`, synced to `localStorage['ams-theme']`, applied as `[data-theme]` on `<html>` |
| Density | Values `compact` / `normal` / `large` / `spacious` (labels **Tight / Usual / Big / Airy**), `localStorage['ams-density']`, `[data-density]` on `<html>` |
| Font | `claude / clean / mono / serif`, stored in `localStorage['ams-font']`, applied as `[data-font]` on `<html>` |
| Settings panel | Popover above footer button; click-outside closes it |
| Privileged nav | `new-asset` / `new-employee` hidden unless `hasActiveAdminAccess()` (admin or IT Ops) |
| Logout | Calls `signOut()`, navigates to `/` |
| Guide link | Navigates to `/guide` |

**Internal components:**
- `BrandMark` — AMS logo badge (compact and full variants).
- `SidebarLink` — single nav item with active state detection and icon.
- `SidebarSections` — renders nav sections from `sidebarSections`, filtering non-admin items.
- `SettingsPanel` — theme/density/font controls, guide, logout.

**Active link logic:** `isItemActive(item, pathname, search)`:
- Prevents `/assets/new` being "active" on `all-assets` and vice versa.
- Supports `matchPrefix` (matches `/assets`, `/assets/AST-001`, etc.).
- Supports query param matching for URL-based filter nav.

---

### sidebarNav.ts

Typed **`sidebarSections`**: **Main** ( Home; **Assets** group — All Assets, Scan QR, New Asset; **Employees** group — Employees, New Employee ) and **Tools** ( Analysis, Recycle Bin, theme toggle, Guide, **Text Layout** density group, **Text Font** group ). Items support `visibility: 'always' | 'authenticated' | 'manage'` and optional **`matchPrefix`**. The Notifications link may be commented out while TopBar still exposes `/notifications`.

`AnimatedNavIcon` includes icons such as `home`, `boxes`, `users`, `plus`, `scan`, `chart-column`, `trash`, `guide`, `settings`, `text-layout`, `text-font`, etc.

---

### Footer

**File:** `Footer.tsx`

- Site title + copyright row inside **`mx-auto max-w-[1320px]`** with the same horizontal padding as `HomeHero`, so the footer aligns with the marketing band.

---

### ParticleIntroLoader

Full-screen canvas animation shown from **`Home`** after sign-in; **`onComplete`** clears intro state. Minimum visible duration and resize/touch behavior are implemented for small viewports.

---

### InventoryStatusBadge

Renders inventory **status** with a colored dot and tint; exports **`getInventoryStatusTone`** for tables and filters that need matching colors.

---

### ToastProvider

Wraps the app in `App.tsx`. **`useToast()`** from pages/forms shows transient success/error messages (e.g. asset create, recycle restore).

---

### FilterPopup / FilterSelect / LoadMorePagination

Reusable patterns for **AllAssets** (and similar): modal filter shell with apply/clear, labeled selects, and “load more” chunk loading.

---

### Other common UI

- **Breadcrumbs** — route context under `TopBar`.
- **ScrollTopButton** — floating scroll-to-top in the main column.
- **InfoHint** — contextual help trigger.
- **IconActionButton** — compact icon actions (e.g. row menus).
- **IdleWarningModal** + **`useIdleTimeout`** — session idle warning / auto sign-out.

---

### Error

Reusable error display component:

```typescript
<Error
  title="Could not load asset"
  message={error}
  onRetry={() => refresh()}
  onDismiss={() => setError('')}
  debugDetail={errorDebug}      // Only shown in DEV mode
  fullScreen={false}            // Default: true (full screen centered card)
/>
```

- `debugDetail` is rendered in a `<pre>` block only when `import.meta.env.DEV` is true.
- `fullScreen=false` renders inline (useful inside list pages).

---

### Loader

```tsx
<Loader />
```

Full-screen centered "Loading..." text indicator. Used by `AssetDetail` while fetching.

---

### Guide

**Route:** `/guide` (public; no login required)

Short, non-technical walkthrough for end users: signing in, finding assets, scanning QR codes, and who to contact for access issues. Tone avoids implementation jargon (no RPC/RLS detail in the primary copy).

---

### RefreshButton

```tsx
<RefreshButton onClick={handleRefresh} loading={loading} label="Refresh" />
```

Button with `aria-label`, shows `loading` state via `disabled`.

---

### PageNotFound

Simple "404 – Page not found" display. Navigated to from the catch-all `*` route when a session exists.

---

### AnimatedNavIcon

SVG icon component keyed by `IconName` (includes `home`, `boxes`, `users`, `plus`, `scan`, `chart-column`, `trash`, `guide`, `settings`, `text-layout`, `text-font`, `bell`, refresh/history icons, etc.). Hover/focus motion is driven from parent `.nav-item` rules in `global.css`.

---

## Form Components (`components/form/`)

### AssetForm

**Props:**
```typescript
{
  prefill?: Partial<AssetWriteInput>
  onClose: () => void
  onSuccess: (result: unknown) => void
  variant?: 'modal' | 'panel'   // default: 'modal'
}
```

**Variants:**
- `modal` — renders inside a `fixed inset-0` backdrop overlay.
- `panel` — renders inline in the page (used by `NewAsset`).

**Form sections:**
1. **Core Details** — asset_tag (disabled on edit), category (select from DB), manufacturer, model, serial, location_code, location_name, purchase_date, warranty_expiry, inventory status.
2. **Dynamic Fields** — loaded from `getCustomFieldDefinitions(category_slug)` per selected category. Each field renders appropriate input type (`text`, `number`, `date`, `boolean` select, `select` with options).
3. **Notes** — stored in `metadata.notes`.

**Behavior:**
- Detects create vs edit from `prefill.asset_tag`.
- Category change triggers fresh `getCustomFieldDefinitions()` fetch.
- Required dynamic fields are validated before submit.
- On create: calls `createAsset()`. On edit: calls `updateAsset()`.
- Custom field values are typed via `coerceValue(raw, dataType)` (handles `number`, `boolean`, `json`, `text`).
- Asset tag is locked (disabled) when editing.

**Internal helpers:**
- `Field` — labeled text/date input.
- `DynamicField` — renders per-field schema with correct input type.
- `coerceValue(value, dataType)` — converts string form value to typed value for API.

---

### OtherAssetForm / CategoryPickerGrid

Used by **`NewAsset`**: pick a category tile or **Other**, then either standard **`AssetForm`** or **`OtherAssetForm`** for the alternate create path.

---

### EmployeeForm

**Props:**
```typescript
{
  prefill?: Partial<EmployeeUpsertInput>
  onClose: () => void
  onSubmit: (employee: EmployeeUpsertInput) => Promise<void> | void
}
```

**Fields:** employee_code (disabled on edit), name, email, department, role (`employee` / `admin` / `it_ops`), **Employee status** (employment / account, gates assignment), **ERP status** (entitlement; drives holder ERP labels and asset filters). **Defaults on create:** employment active, ERP inactive (`prefill` overrides when editing).

**Required fields:** `employee_code`, `name`, `department`.

**Behavior:**
- Validates required fields before submit.
- `employee_code` is disabled when editing (immutable identifier).
- Calls `onSubmit` prop; caller (page) handles the API call and navigation.
- Error is caught if `onSubmit` throws, displayed inline.

---

### Bulk import (Excel)

| Surface | Modal | Parser / constants | API used per row | Public template |
|--------|--------|-------------------|------------------|-------------------|
| **New Employee** | `EmployeeBulkImportModal.tsx` | `employeeBulkImport.ts` (`parseEmployeeImportMatrix`, `EMPLOYEE_IMPORT_MAX_ROWS`, `EMPLOYEE_IMPORT_TEMPLATE_HREF`) | `insertEmployeeNew` | `/employee-import-template.xlsx` |
| **New Asset** | `AssetBulkImportModal.tsx` | `assetBulkImport.ts` (`parseAssetImportMatrix`, `ASSET_IMPORT_MAX_ROWS`, `ASSET_IMPORT_TEMPLATE_HREF`, `ASSET_IMPORT_TEMPLATE_VERSION`) | `createAsset` | `/asset-import-template.xlsx` |

Shared behavior: **`xlsx`** for parsing; **`useToast`** + capped inline error lists; **`mountedRef`** (employees) / **`mountedRef`** + **`cancelledRef`** tied to dialog `open` (assets) for safe teardown.

**Mode note (assets only):** the UI always passes **`fixedCategorySlug`**, which matches **`ParseAssetImportOptions.fixedCategorySlug`** in code. A file parsed **without** `fixedCategorySlug` would require a **`category_slug`** column (**Mode A**); that path exists in `parseAssetImportMatrix` but is **not** wired from the New Asset page.

---

## Utilities (`utils/`)

### errors.ts

| Export | Description |
|---|---|
| `getUserFacingMessage(error, fallback?)` | Maps raw errors to safe user-facing strings. Handles: network errors, 401/JWT/session errors, "not found", RLS violations, specific business-logic messages (admin access, self-revoke, etc.). Returns `fallback` for unknown errors |
| `getErrorDebugDetail(error)` | In DEV only (`import.meta.env.DEV`): returns `"ErrorName: message"` string for debug display |
| `logDevError(context, error)` | In DEV only: logs `[context] error` to `console.error` |
| `DEFAULT_USER_MESSAGE` | `'Something went wrong. Please try again.'` |

**Business-logic messages that pass through verbatim:**
- "active admin employee record" / "active admin access is required"
- "already linked to another auth user"
- "cannot revoke admin from the last active admin user"
- "you cannot change your own admin privileges"
- "only admins can change admin privileges"

---

### formatDisplay.ts

- **`formatDisplay(value)`** — `'-'` for null/empty; otherwise stringifies.
- **`formatEnumLabel(value)`** — human labels from `snake_case` or kebab flags (e.g. `in_stock` → `In Stock`).
- **`formatDateTime(value)`** — locale medium date + short time for ISO timestamps.

Used across lists, detail, and scan pages for consistent display.

---

### employeeBulkImport.ts

- **`parseEmployeeImportMatrix(matrix)`** — header row + data rows; required headers `employee_code`, `name`, `department`; optional `email`, `is_active`, `erp_active` (boolean parsing shared with assets via **`parseBooleanCell`**).
- **`EMPLOYEE_IMPORT_TEMPLATE_HREF`**, **`EMPLOYEE_IMPORT_MAX_ROWS`** — used by `NewEmployee` + `EmployeeBulkImportModal`.

### assetBulkImport.ts

- **`parseAssetImportMatrix(matrix, { fixedCategorySlug? })`** — when `fixedCategorySlug` is set (New Asset UI), rejects any **`category_slug`** column; validates allowlisted category slugs, core + custom fields per `06_seed.sql`, duplicate serial preflight, row cap.
- **`ASSET_IMPORT_TEMPLATE_HREF`** (`/asset-import-template.xlsx`), **`ASSET_IMPORT_TEMPLATE_VERSION`** (embedded in create `metadata`), **`ASSET_IMPORT_MAX_ROWS`**, **`ASSET_IMPORT_CORE_COLUMNS`**, **`getExpectedHeadersModeA` / `getExpectedHeadersModeB`**, **`isBulkImportAllowedCategorySlug`**.

---

## Styles (`styles/`)

### theme.css

CSS custom property tokens for the design system:

| Token | Light value | Dark value |
|---|---|---|
| `--bg` | `#ffffff` | `#000000` |
| `--surface` | `rgba(0,0,0,0.02)` | `rgba(255,255,255,0.04)` |
| `--surface-2` | `rgba(0,0,0,0.05)` | `rgba(255,255,255,0.08)` |
| `--surface-3` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.12)` |
| `--text` / `--muted` / `--subtle` | Black scale | White scale |
| `--border` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.12)` |
| `--accent` | `#f97316` (orange) | `#f97316` (same) |
| `--accent-soft` | `rgba(249,115,22,0.28)` | same |
| `--on-accent` | `#000000` | `#000000` |

Theme switching:
- Defaults to `prefers-color-scheme: dark` via `@media`.
- Overridden by `[data-theme='dark']` or `[data-theme='light']` on `<html>`.
- Sidebar writes `document.documentElement.dataset.theme` on toggle.

### global.css

- Imports and configures Tailwind (`@tailwind base/components/utilities`).
- Maps CSS token names to Tailwind utility classes (e.g., `bg-app` → `var(--bg)`, `text-primary` → `var(--text)`).
- Defines density classes applied via `[data-density]` on `<html>` — affects `--spacing`, `--radius`, `--text-base` sizes.
- Defines font stack classes applied via `[data-font]` on `<html>` — `claude`, `clean`, `mono`, `serif`.
- `.nav-item` — base hover transition for sidebar links.
- `.shadow-accent` — box shadow using `var(--accent-shadow)`.
- Form field focus styles via `focus:border-accent focus:ring-2 focus:ring-accent-soft`.

---

## Privileged access

Canonical role is `employees.role` (`employee` | `admin` | `it_ops`). `hasActiveAdminAccess()` uses RPC `fn_is_admin_or_it_ops`, with profile hint and optional `fn_claim_employee_auth_link()`.

**Admin and IT Ops** (that gate): asset CRUD, assign/return, QR, employee create/edit, full asset list, privileged sidebar links.

**Admin only:** grant/revoke admin (`setEmployeeAdminStatus`).

**IT Ops only:** assign IT Ops (`setEmployeeRole` → `fn_set_employee_role`). Admins cannot elevate to IT Ops.

**Employees:** own assignments on AllAssets; Employee page read-only where enforced; no privileged sidebar items.

---

## QR Code Behavior

| Scenario | Behavior |
|---|---|
| Asset created via client | `buildAssetQrDataUri(assetTag)` generates a client-side QR using `qrcode` library. Points to `window.location.origin/scan/{assetTag}`. Stored in `fn_create_asset_with_log` → `asset_logs.qr_code` |
| Asset created via server API | Server generates QR using `{FRONTEND_URL}/scan/{assetTag}` via `qr_service.py`, also stored in `asset_logs.qr_code` |
| "View QR" on AllAssets | Calls `getQrDataUriForAssetTag(assetTag)`: reads latest `asset_logs.qr_code`. Falls back to generating client-side QR if none stored |
| Public scan via QR | `GET /scan/:id` → `fn_public_scan_asset` (anon) → minimal card (tag, category, make/model, **status**); full record requires login |

---

## Realtime & Dashboard Stats

`subscribeDashboardRealtime` and `getDashboardStats` remain in **`api.ts`** for reuse (e.g. future dashboard widgets). The current **Home** page does not subscribe to Realtime; story copy references “realtime” conceptually only.

---

## Vercel Deployment

Deploy the `Client/` folder as a **separate Vercel project** from the server.

### `vercel.json`

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

All paths are rewritten to `index.html` so React Router deep links (e.g. `/assets/AST-00001`) work correctly after a full-page refresh or direct URL access.

### Vercel project settings

| Setting | Value |
|---|---|
| Root directory | `Client` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

### Environment variables to set in Vercel dashboard

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
# Optional canonical origin for QR payloads if previews use a non-production hostname:
# VITE_PUBLIC_APP_ORIGIN=https://<your-production-domain>
```

### Production reference (this deployment)

| Item | Value |
| --- | --- |
| Client | `https://web-assetmanager.vercel.app` |
| Server (API root, not `/docs`) | `https://assetmanager-backend.vercel.app` |

Ensure the server Vercel project sets `FRONTEND_URL` and `ALLOWED_ORIGINS` to the client origin above so CORS and server-generated QR links stay correct.

---
