# Plan — authNexus as employee source of truth (remove creation + archive, add sync)

**Date:** 2026-07-21 · Blast radius: `Notes/remove-employee-creation-blast-radius.md`
**Status:** PLAN — no code written yet.

## Confirmed decisions
| # | Decision |
|---|---|
| 1 | **New employees:** JIT auto-provision on first login **+** a manual "Sync from authNexus" button |
| 2 | **Remove employee creation:** all UI + `POST /api/v1/employees` + `POST /api/v1/employees/bulk` |
| 3 | **Editing:** AMS may edit **department only** (+ role via the existing role action). name/email/employee_id become read-only (owned by authNexus) |
| 4 | **Role ownership:** **AMS owns role.** Sync sets role only when *creating* a row; it never overwrites an existing AMS role (protects EMP-001 = `it_ops`, which does not exist in authNexus) |
| 5 | **Role mapping:** only `admin` / `it_ops` / `employee` are valid. Users whose authNexus role is something else (`project_admin`, …) are cleaned up **on the authNexus side by the owner** — currently **0** such conflicts in AMS, so no destructive query is needed |
| 6 | **The 126 AMS-only employees:** **KEEP.** Sync is **additive/upsert only** — it never deletes or deactivates AMS rows |
| 7 | **Archive:** **remove completely** for **both assets and employees** (confirmed twice) |

### Verified facts this plan relies on
- `GET {AUTH_AUTHORITY}/api/admin/users?page=&limit=` → `{users, total, page, limit}` (admin bearer). **33** org users, **14** in the Asset Manager project.
- Per user: `userId`, `username`, `preferredLoginName`, `loginNames[]`, `state`, `human.profile.{givenName,familyName,displayName}`, `human.email.email`, `nexus_projects[{id,name,roles[]}]`.
- **`userId` == JWT `sub`** (verified against the live admin token) → reliable join key.
- **No `department`** in the JWT or `/oidc/v1/userinfo` or the admin list → department is AMS-local forever (hence decision 3).
- AMS: 132 employees, 6 overlap authNexus, 126 AMS-only (1 holds 4 open assets: `JMV000000`), 8 authNexus users missing from AMS.

---

## Part A — Employee sync (authNexus → AMS)

### A1. authNexus client: list users
`services/authnexus_service.py` → `AuthNexusClient.list_users(page, limit)`
- `GET {AUTH_AUTHORITY}/api/admin/users` with the cached admin bearer (`_get_token`), same 401-retry pattern as `create_user`.
- Paginate until `len(collected) >= total` (guard: max pages, hard cap).

### A2. Mapping + upsert rules (`services/employee_sync_service.py`, new)
Filter: keep only users whose `nexus_projects[].id == settings.AUTH_PROJECT_ID`.

| AMS column | Source | On insert | On update |
|---|---|---|---|
| `auth_user_id` | `userId` | set | set (link if empty) |
| `employee_id` | `username` (fallback `preferredLoginName`) | set | **never** (identity key) |
| `name` | `human.profile.displayName`, else `givenName + familyName`, else `username` | set | update |
| `email` | `human.email.email` | set | update |
| `role` | project roles ∩ {`admin`,`it_ops`,`employee`}; else `employee` | set | **NEVER** (decision 4) |
| `is_active` | `state == 'USER_STATE_ACTIVE'` | set | update |
| `department_id` | — (not available) | `NULL` | **never** (AMS-owned) |

**Match order** (reuse `resolve_employee_for_sub` semantics so JIT + sync agree):
1. `auth_user_id == userId`
2. `upper(employee_id) == upper(username)` → link `auth_user_id`
3. `email` match → link `auth_user_id`
4. none → **INSERT**

**Never** deletes, never deactivates an AMS-only row, never touches `role`/`department`. Runs in one transaction per batch; returns `{created, updated, linked, skipped}`.

### A3. Endpoint + UI
- `POST /api/v1/employees/sync` — `require_privileged` (admin/it_ops). Returns the counts envelope.
- Employees page: **"Sync from authNexus"** button (icon + label) in the right-hand toolbar cluster, admin/it_ops only, with loading state + result toast (`"Synced: 8 created, 6 updated"`), then refresh the list.

### A4. JIT provisioning on first login
`core/authnexus.py` → `resolve_employee_for_sub` (**protected auth file**): after all match attempts fail, instead of `PermissionError`, create the employee row from JWT claims (`sub`, `preferred_username`, `email`, `name` — `name` must be added to the claims the middleware passes through) with `role` from token `nexus_projects` roles ∩ valid, `department = NULL`, `is_active = true`. Then return the fresh `EmployeeContext`.
- Guard: only when `AUTH_PROJECT_ID` is present in the token's `nexus_projects` (already enforced by `verify_bearer_token`).
- Guard: never resurrect an `is_active=false` row — that still raises `PermissionError` ("Account inactive.").

---

## Part B — Remove employee creation

**Delete:** `components/pages/NewEmployee.tsx`, `components/form/EmployeeBulkImportModal.tsx`,
`utils/employeeBulkImport.ts`, `public/employee-import-template.xlsx`.

**Edit:** `App.tsx` (lazy + `/employee/new` route), `hooks/useDocumentTitle.ts:11`,
`sidebar/sidebarNav.helpers.ts:113`, `Employee.tsx` (drop `createEmployee` import, `createDialogOpen`
state, create branch in submit, "New Employee" button, create-dialog JSX),
`services/employeeService.ts` (`createEmployee`), `queries/employees.ts`
(`useCreateEmployeeMutation`), `api.ts` (`insertEmployeeNew`, `bulkInsertEmployees`).

**Server:** remove `POST /api/v1/employees` (275) and `POST /api/v1/employees/bulk` (587) → then
`EmployeeRepository.bulk_upsert` (656) and `_bulk_sync_to_auth_nexus` (533) are dead → remove.
**KEEP** `EmployeeRepository.upsert` (shared with update) and `AuthNexusClient.create_user`
(still used by nothing after this — mark for removal only if you don't want an invite flow later; default: **keep, unused**).

**⚠️ Do NOT delete** `components/form/EmployeeForm.tsx` / `EmployeeFormFields.tsx` — reused by the edit dialog (Part C).

## Part C — Department-only editing
- `PUT /api/v1/employees/{id}`: narrow to accept **`department` only** (ignore/reject `name`, `email`,
  `employee_id`, `is_active`); keep `PATCH /{id}/role` untouched for role + its authNexus push.
- Client edit dialog: render `employee_id`, `name`, `email` as **read-only** (with a hint "managed in
  authNexus"); only Department stays editable. Reuses `EmployeeForm` with a `readOnlyIdentity` flag.

## Part D — Remove Archive completely (assets + employees)
> **Accepted consequence (stated twice):** after this there is **no way to remove or retire an asset**
> from inventory — Delete was already removed earlier. Inventory becomes append-only apart from status
> changes (`retired`/`disposed` remain as *status* values, not removal).

**Client — delete:** `components/pages/Archive.tsx`, `services/archiveService.ts`, `e2e/archive.spec.ts`.
**Client — edit:** `App.tsx` (`/archive` route + `/recycle-bin` redirect + lazy), `sidebarNav.ts`
(Archive nav item), `Footer.tsx` (Archive link), `Breadcrumbs.tsx` (`archive` label),
`AssetDetail.tsx` (Archive button, confirm dialog, `handleSoftDelete`, `navigate('/archive')`),
`Employee.tsx` (Archive row action + confirm dialog + `handleSoftDeleteEmployee`),
`services/assetService.ts` (`softDeleteAsset`), `services/employeeService.ts` (`softDeleteEmployee`).
**Server — delete:** `routers/api_v1_recycle_bin.py` (whole file + its `main.py` include),
`repositories/recycle_bin_repository.py`, archive/restore routes in `api_v1_assets.py`
(`POST /{asset_id}/archive`, `GET /recycle-bin`, restore) and `api_v1_employees.py`
(`POST /{id}/archive` + `/soft-delete` alias), `asset_service.soft_delete_asset` + `restore_asset`,
`EmployeeRepository.soft_delete` + `restore_from_payload`,
`AssetRepository.list_recycle_bin_entries`, `Server/tests/test_archive.py`, `/tests/test_archive.py`.
**DB:** `recycle_bin_entries` + `v_recycle_bin` become unused — **do not drop** (keeps past records);
document as dead. `assets.is_deleted` / `employees.is_deleted` columns stay (always `false`); existing
`is_deleted = false` filters remain harmless.

---

## Testing (must all pass — "no existing feature may break")
**New tests**
- `Server/tests/test_employee_sync.py`: mapping (name/email/role/is_active), role **never** overwritten on update, department untouched, additive-only (AMS-only rows survive), match order (auth_user_id → employee_id → email), invalid roles → `employee`, non-project users filtered out.
- `Server/tests/test_removed_endpoints.py`: `POST /employees` → 404/405, `POST /employees/bulk` → 404/405, all archive routes → 404/405.
- `tests/test_employee_sync.py` (live): admin hits `POST /employees/sync` → counts returned; re-run is idempotent (0 created); non-privileged → 403; **AMS-only employee count unchanged** (guards the 126).
- `Client/e2e/employee-sync.spec.ts`: Sync button visible to admin, click → success toast + list refresh; **no** "New Employee" button, `/employee/new` → redirect/404, no bulk-import entry point; edit dialog shows read-only identity + editable department; **no** Archive nav item / `/archive` route.
- vitest: any changed pure helpers.

**Regression (full suite, every step)**
`Server/tests` (currently **61**), `/tests` live (**36**), `Client/e2e` (**18**), `npm run build`, `npm run lint`, `npx vitest run`.
Known flake to ignore: authNexus **429** on rapid logins — re-run affected spec in isolation.

**Manual smoke:** login as admin (JMV10728) and as it_ops (EMP-001) → confirm **EMP-001 is still `it_ops`** after a sync run (decision 4 regression), assign/return still works, `JMV000000`'s 4 assets untouched.

---

## Rollout order (each step: build + full suite green before the next)
1. **A1+A2+A3** sync service + endpoint + button (additive, safest, immediately useful).
2. **A4** JIT provisioning (protected auth file — needs explicit go).
3. **B** remove creation (UI → endpoints).
4. **C** department-only editing.
5. **D** remove archive completely.
6. Docs: `README.md`, `DOCKER_DEPLOYMENT.md`, `.claude/context/architecture.md`, `employeeInfoHint.json` (reword "add employee"/bulk-import bullets).

Not committed until the human types `approve-ship`.

## Risks
| Risk | Sev | Mitigation |
|---|---|---|
| Sync overwrites AMS role → EMP-001 loses `it_ops` | HIGH | Decision 4 + explicit test + manual smoke |
| Sync deletes/deactivates the 126 AMS-only employees | HIGH | Additive-only by design + live test asserting count unchanged |
| Duplicate employee rows (same person, new row) | MED | 3-step match order shared with `resolve_employee_for_sub` |
| Deleting shared `EmployeeForm` / `EmployeeRepository.upsert` | MED | Flagged; edit-only removal |
| No way to retire an asset after Part D | MED | **Accepted by owner**; `retired`/`disposed` statuses remain |
| JIT touches protected auth path | MED | Separate step, own review, `/security-review` |
| authNexus admin-token dependency for sync | LOW | Sync fails loud with a toast; JIT unaffected |
