# AMS Client

[React 19 + Vite 7 + TypeScript frontend for the Asset Manager](https://web-assetmanager.vercel.app)
---

## Latest updates (current implementation)

- **Employee / ERP split:** `EmployeeRecord` carries both `is_active` and `erp_active`. The Employees page filters both dimensions; **default filters** are employment **Active** and ERP **Inactive**. **New employee** form defaults to the same (`is_active: true`, `erp_active: false`). Asset inventory exposes `current_employee_is_active` and `current_employee_erp_active`; list filters and holder badges use ERP where labeled “ERP”.
- Added protected `Notifications` page (`/notifications`) with:
  - role-aware warranty alerts from DB RPC
  - date range filtering
  - incremental loading (`15 + Load more`)
  - one-time welcome prompt support for new users
- Added real `Recycle Bin` page (`/recycle-bin`) backed by DB RPC (list + restore).
- Added soft-delete actions for assets and employees (admin/IT Ops only), now routed through a shared confirmation dialog component.
- Added shared refresh logic hook: `src/hooks/useRefreshableLoader.ts`.

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
10. [Supabase Client (`supabaseClient.ts`)](#supabase-client-supabaseclientts)
11. [Pages (`components/pages/`)](#pages-componentspages)
    - [Home](#home)
    - [AllAssets](#allassets)
    - [AssetDetail](#assetdetail)
    - [NewAsset](#newasset)
    - [Employee](#employee)
    - [NewEmployee](#newemployee)
    - [ScanPage](#scanpage)
    - [Notifications](#notifications)
    - [RecycleBin](#recyclebin)
12. [Common Components (`components/common/`)](#common-components-componentscommon)
    - [Sidebar](#sidebar)
    - [Error](#error)
    - [Loader](#loader)
    - [Guide](#guide)
    - [PageNotFound](#pagenotfound)
    - [RefreshButton](#refreshbutton)
    - [AnimatedNavIcon](#animatednavicon)
    - [ConfirmDialog](#confirmdialog)
    - [sidebarNav.ts](#sidebarnav-ts)
13. [Form Components (`components/form/`)](#form-components-componentsform)
    - [AssetForm](#assetform)
    - [EmployeeForm](#employeeform)
14. [Utilities (`utils/`)](#utilities-utils)
    - [errors.ts](#errorsts)
    - [formatDisplay.ts](#formatdisplayts)
15. [Hooks (`hooks/`)](#hooks-hooks)
    - [useRefreshableLoader.ts](#userefreshableloaderts)
16. [Styles (`styles/`)](#styles-styles)
    - [theme.css](#themecss)
    - [global.css](#globalcss)
17. [Privileged access](#privileged-access)
18. [QR Code Behavior](#qr-code-behavior)
19. [Realtime & Dashboard Stats](#realtime--dashboard-stats)
20. [Vercel Deployment](#vercel-deployment)
21. [Known Issues & Notes](#known-issues--notes)

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
```

- The SPA **does not use `fetch` to the FastAPI base URL** for normal screens: lists, detail, assign/return, and auth all go through Supabase (anon key + RLS + RPC). The FastAPI server still matters for server-side QR embedding and for any tooling that uses the HTTP API.
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
    ├── supabaseClient.ts           # Supabase client singleton
    │
    ├── components/
    │   ├── pages/
    │   │   ├── Home.tsx            # Dashboard landing page
    │   │   ├── AllAssets.tsx       # Asset list with filters and QR modal
    │   │   ├── AssetDetail.tsx     # Asset detail, edit, assign/return
    │   │   ├── NewAsset.tsx        # Create asset (requires privileged access)
    │   │   ├── Employee.tsx        # Employee list, passport, admin toggle
    │   │   ├── NewEmployee.tsx     # Create employee (requires privileged access)
    │   │   └── ScanPage.tsx        # Public QR scan page
    │   │
    │   ├── common/
    │   │   ├── Sidebar.tsx         # Nav, theme/density/font settings, auth
    │   │   ├── sidebarNav.ts       # Nav section/item definitions
    │   │   ├── AnimatedNavIcon.tsx # Animated SVG nav icons
    │   │   ├── Error.tsx           # Reusable error display card
    │   │   ├── Footer.tsx          # Site footer (layout)
    │   │   ├── Loader.tsx          # Full-screen loading indicator
    │   │   ├── Guide.tsx           # Public usage guide (non-technical copy)
    │   │   ├── PageNotFound.tsx    # 404 page
    │   │   └── RefreshButton.tsx   # Accessible refresh button
    │   │
    │   └── form/
    │       ├── AssetForm.tsx       # Create/edit asset form (modal or panel)
    │       └── EmployeeForm.tsx    # Create/edit employee form
    │
    ├── utils/
    │   ├── errors.ts               # getUserFacingMessage, logDevError, etc.
    │   └── formatDisplay.ts        # Null/empty/string display normalizer
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
| `VITE_PUBLIC_APP_ORIGIN` | ❌ No | **QR scan links:** full site origin with scheme, no trailing slash (e.g. `https://web-assetmanager.vercel.app` or `http://192.168.1.10:5173`). If unset, QR URLs use `window.location.origin` (fine for production; **localhost** is wrong for another device). See [Running Locally](#running-locally). |
| `VITE_API_URL` | ❌ Unused | Reserved for future FastAPI calls from the browser; not read anywhere today |

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

### `src/index.css`

- Imports `./styles/theme.css` and `./styles/global.css`.

---

## Routing & Auth (`App.tsx`)

### Component tree

```
App
└── BrowserRouter
    └── AppRoutes
        ├── Sidebar (shown when path is not public `/scan/*`; signed-out users still see shell; login page included)
        └── Routes
            ├── /                   → <Home isAuthenticated={...} /> (public)
            ├── /dashboard/home     → same Home (public alias)
            ├── /scan/:id           → <ScanPage /> (public QR landing)
            ├── /guide              → <Guide /> (public)
            ├── /login              → <SignInScreen /> or redirect if session
            │
            └── <RequireAuth>       (guards all below)
                ├── /assets/scan    → <ScanPage protectedRoute />
                ├── /assets/scan/:id → <ScanPage protectedRoute />
                ├── /assets         → <AllAssets />
                ├── /assets/new     → <NewAsset />
                ├── /assets/:id     → <AssetDetail />
                ├── /404            → <PageNotFound />
                ├── /employee       → <Employee />
                └── /employee/new   → <NewEmployee />
```

### Auth state machine

| Phase | State | UI |
|---|---|---|
| Loading | `authLoading=true` | `<AuthLoadingScreen>` ("Checking session...") |
| Unauthenticated | `session=null` | Public routes (e.g. `/`, `/guide`) with sidebar; `/login` shows `<SignInScreen>`; protected paths redirect to `/login` |
| Authenticated | `session` set | Same layout; `<RequireAuth>` children render on protected routes |

**Session lifecycle:**
1. On mount: `getSession()` called asynchronously.
2. `onAuthStateChange()` subscription keeps `session` in sync for the lifetime of the component.
3. Cleanup: `unsubscribe()` + `mounted` flag prevent state updates after unmount.

### `RequireAuth`

- While `authLoading` is true → shows loading screen.
- If no `session` → `<Navigate to="/login" state={{ from: location }} replace />`.
- Stores `from` location in router state so `SignInScreen` can redirect back after login via `getReturnPathFromState()`.

### `SignInScreen`

- Calls `signInWithGoogle()` on button click (OAuth redirect flow).
- Shows loading state while redirect is pending.
- Displays `authError` or local `message` on failure.
- Domain checks are enforced in Supabase settings, not in client code.

### Internal helpers

| Helper | Purpose |
|---|---|
| `getReturnPathFromState(state)` | Extracts `pathname+search+hash` from router state. Returns `/` if none or if it resolves to `/login` |
| `AuthLoadingScreen` | Minimal centered "Checking session..." indicator |
| `SignInScreen` | Google OAuth button + error display |

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
| `AssetFilters` | `search`, `status`, `category_slug`, `hideHeldByInactive` (omit rows where assigned holder has `erp_active` false), `current_employee_id` |
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
| `onAuthStateChange(callback)` | Subscribes to auth changes; returns unsubscribe fn |
| `signInWithGoogle()` | Triggers Google OAuth redirect; redirects back to `window.location.origin` |
| `signOut()` | Signs out current session |

### Employee/access functions

| Function | Description |
|---|---|
| `getSessionEmployee(user?)` | Fetches the current user's employee profile. Primary lookup by `auth_user_id`, fallback by email. Returns `null` if no match |
| `hasActiveAdminAccess()` | RPC `fn_is_admin_or_it_ops` + profile hint + optional `fn_claim_employee_auth_link()` |
| `listEmployees(filters?)` | Lists employees with search, `is_active`, `erp_active`, department, and role filters. Resolves department by name when provided |
| `listDepartments()` | Returns distinct department names from active departments |
| `upsertEmployee(input)` | Upsert by `employee_code`; does not set privileged roles via metadata (use role RPC) |
| `setEmployeeAdminStatus(target, makeAdmin)` | Admin grant/revoke path; server RPC enforces rules |
| `setEmployeeRole(target, role)` | IT Ops only → `fn_set_employee_role` |
| `getCurrentEmployeeAssets()` | Returns `{ sessionEmployee, assets[] }` for the current user |
| `getDashboardStats()` | Returns `{ totalAssets, assignedAssets, inStockAssets, activeEmployees, totalEmployees }` |
| `subscribeDashboardRealtime(callback)` | Subscribes to INSERT/UPDATE on `assets` and `employees` Realtime channels; calls `callback` on any event. Returns unsubscribe fn |

### Asset functions

| Function | Description |
|---|---|
| `getAssets(filters?)` | Reads `v_asset_inventory`. Supports search, status, category, employee scope, `hideHeldByInactive` (holder ERP inactive) |
| `getAsset(assetTag)` | Reads single row from `v_asset_inventory` by `asset_tag` |
| `getAssetDetail(assetTag)` | Returns `AssetDetailRecord` with full `assignments` + `components` arrays |
| `createAsset(payload)` | Asserts admin. Auto-generates `asset_tag` via `fn_next_asset_tag()` if omitted. Generates client-side QR. Calls `fn_create_asset_with_log` RPC |
| `updateAsset(assetTag, payload)` | Asserts admin. Partial patch of `assets` table. Resolves foreign keys (category, manufacturer, location) from names |
| `listCategories()` | Reads `asset_categories` ordered by name |
| `getCustomFieldDefinitions(categorySlug)` | Reads `custom_field_definitions` for a category |
| `assignAsset(payload)` | Calls `fn_assign_asset` RPC |
| `returnAsset(payload)` | Calls `fn_return_asset` RPC |
| `getPublicScanAsset(ref)` | Calls `fn_public_scan_asset` RPC (anon-accessible). Returns minimal asset info for QR scan page |
| `getQrDataUriForAssetTag(assetTag)` | Gets latest `asset_logs.qr_code` for the asset. Falls back to generating a client-side QR via `qrcode` package if none stored |
| `buildAssetQrDataUri(assetTag)` | Internal. Always generates client-side QR code (used during createAsset) |

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

**Route:** `/` | **Auth:** Public

- Accepts `isAuthenticated: boolean` prop from `App.tsx`.
- When authenticated: calls `getDashboardStats()` and subscribes to `subscribeDashboardRealtime()` for live counter updates.
- When unauthenticated: shows `stats = null` (zeros), text "Sign in to see live counts."
- Never calls stats or realtime when unauthenticated.
- Sections: hero with CTA links → stats grid (5 counters) → "How It Works" 3-step cards → `Footer` at the bottom.

**Stat cards:** Total Assets, Assigned, In Stock, ERP Active employees, Total Employees.

---

### AllAssets

**Route:** `/assets` | **Auth:** Protected

**Features:**
- Reads `v_asset_inventory` via `getAssets()`.
- **Debounced search** (300ms) across `asset_tag`, `serial_number`, `model`, `manufacturer_name`, `location_name`, `current_employee_name`, `current_employee_code`, `category_name`.
- **Filters:** inventory status (dropdown), category slug (dropdown), "Hide assets held by ERP-inactive employees" (checkbox).
- **Admin vs employee scope:** non-admins only see their own assigned assets (scoped by `current_employee_id`). Admins see all.
- **Race condition protection:** `requestIdRef` ensures stale responses from concurrent fetches are ignored.
- **QR modal:** "View QR" (privileged) calls `getQrDataUriForAssetTag()`, modal backdrop.
- Clicking a row navigates to `/assets/{asset_tag}`.
- "Edit" navigates to asset detail when privileged.

**State:**
- `isAdmin`, `scopeEmployeeId`, `accessResolved` gate whether to fetch and how to scope.
- `categories` for category filter dropdown.

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
- If allowed: renders `<AssetForm variant="panel" prefill={{ status: 'in_stock', category_slug: 'laptop' }}>`. On close/success: navigates to `/assets`.

---

### Employee

**Route:** `/employee` | **Auth:** Protected

**Features:**
- Lists all employees in a card grid via `listEmployees()`.
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
- If allowed: renders `<EmployeeForm onSubmit={handleCreate}>`. On success: navigates to `/employee`.
- `handleCreate` calls `upsertEmployee()` then navigates. Errors bubble up to `EmployeeForm`.

---

### ScanPage

**Route:** `/scan/:id` | **Auth:** Public (no login required)

- Calls `getPublicScanAsset(id)` using Supabase RPC `fn_public_scan_asset` (granted to `anon`). RPC returns **basic fields only**: tag, category, manufacturer, model, inventory `status` (see migration `17_fn_public_scan_minimal.sql`).
- **Public** (`/scan/:id`): heading + **Current status** badge + category; short note to sign in for full details. **Authenticated** (`protectedRoute`, e.g. `/assets/scan/:id`): full passport via `scanAsset` — location, holder, ERP label, custom fields.
- Error handling: "404" heading if not found, generic "Error" otherwise.
- No sidebar is rendered on this page.

---

## Common Components (`components/common/`)

### Sidebar

**File:** `Sidebar.tsx`

Navigation + settings. Rendered for all routes except public QR prefix `/scan/*`. When signed in, loads profile once (shared `getSessionEmployee` + `hasActiveAdminAccess` in one effect): nav privileges, optional “First name | Role” strip above **Settings** (hidden on desktop while collapsed), and mobile drawer. Clears profile on sign-out or fetch error (`logDevError` only). Settings panel unchanged.

**Layout variants:**
- **Desktop (≥sm):** Fixed-width sidebar (`292px` expanded, `54px` collapsed). Toggled by collapse button.
- **Mobile (<sm):** Hidden; "Menu" button (top-left fixed) opens a slide-in drawer overlay.

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

Defines the navigation structure as typed data:

```typescript
sidebarSections: SidebarNavSection[] = [
  { id: 'overview',   items: [{ id: 'home', label: 'Home', to: '/', icon: 'home' }] },
  { id: 'assets',     items: [
      { id: 'all-assets', label: 'All Assets', to: '/assets', icon: 'boxes', matchPrefix: true },
      { id: 'scan-asset', label: 'Scan Asset', to: '/assets/scan', icon: 'scan', matchPrefix: true },
      { id: 'new-asset', label: '+ New Asset', to: '/assets/new', icon: 'plus', tone: 'accent' },
    ] },
  { id: 'employees',  items: [{ id: 'all-employees', ... }, { id: 'new-employee', tone: 'accent', ... }] },
]
```

Icon names: `'home' | 'boxes' | 'users' | 'plus' | 'scan'` — rendered by `AnimatedNavIcon`.

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

SVG icon component keyed by icon name (`home`, `boxes`, `users`, `plus`, `scan`, `settings`, `guide`, `logout`, `sun`, `moon`, `list-chevrons-up-down`). Animated on parent `.nav-item` hover via CSS transitions defined in `global.css`.

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

```typescript
formatDisplay(value: unknown): string
```

- Returns `'-'` for `null`, `undefined`, or empty/whitespace strings.
- Returns `String(value)` for all other types.
- Used universally across all pages and scan page for consistent null display.

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

`subscribeDashboardRealtime(callback)`:
- Creates two Supabase Realtime channels: `dashboard-assets` and `dashboard-employees`.
- Listens for `INSERT` and `UPDATE` events on the `assets` and `employees` tables respectively.
- Calls `callback()` on any event, which triggers `getDashboardStats()` to re-fetch counters.
- Returns an unsubscribe function that removes both channels.
- Used by `Home.tsx` only when `isAuthenticated = true`.

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
