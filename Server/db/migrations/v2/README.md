# AMS Database Migrations

Apply in this exact order:

1. `01_tables.sql`
2. `02_functions.sql`
3. `03_views.sql`
4. `04_rls_policies.sql`
5. `05_storage_realtime_auth.sql`
6. `06_seed.sql`
7. `07_admin_audit.sql`
8. `08_it_ops_rbac.sql`
9. `09_warranty_notifications.sql`
10. `10_user_welcome_notification.sql`
11. `11_soft_delete_recycle_bin.sql`
12. `12_employee_code_standardization.sql`

## Notes

- All scripts are idempotent and safe to re-run.
- If you already applied these migrations once, re-run `03_views.sql`, `04_rls_policies.sql`, `07_admin_audit.sql`, `08_it_ops_rbac.sql`, `09_warranty_notifications.sql`, `10_user_welcome_notification.sql`, `11_soft_delete_recycle_bin.sql`, and `12_employee_code_standardization.sql` after pulling latest changes.
- Seed uses conflict-safe inserts/upserts.
- Asset status is derived from assignment state via DB trigger.
- `ERP Status` maps to `employees.is_active` only.
- `ERP Status` must never be used to set `assets.status`.
- Runtime assign/return must use DB RPCs: `fn_assign_asset` and `fn_return_asset`.
- Public QR scan uses RPC `fn_public_scan_asset` (granted to `anon`).
- Privileged runtime access uses `employees.role` (and keeps `metadata.role` in sync via trigger after `08_it_ops_rbac.sql`).

## Auth Domain Restriction

`fn_handle_new_auth_user` enforces optional email-domain checks via Postgres setting `app.allowed_email_domain`.

Example (set once per database):

```sql
alter database postgres set app.allowed_email_domain = 'yourcompany.com';
```

Leave unset to disable domain filtering.

## Rollback Order

If you need to revert, roll back in reverse dependency order:

1. Drop auth trigger / publication additions / storage policies and bucket changes from `05_storage_realtime_auth.sql`
2. Drop RLS policies from `04_rls_policies.sql`
3. Drop views from `03_views.sql`
4. Drop triggers/functions/sequence from `02_functions.sql`
5. Drop base tables/types from `01_tables.sql`

## Import

Use:

```powershell
python scripts/import_v2_from_sheet.py --file "C:\path\to\your-sheet.xlsx" --sheet "Sheet1"
```

Validation-only mode:

```powershell
python scripts/import_v2_from_sheet.py --file "C:\path\to\your-sheet.xlsx" --validate-only
```

The script prints a JSON report with:

- Sheet-vs-DB counts
- Assignment integrity checks
- Inactive employees with open assignments
- Warnings and row-level errors

## Staging Execution

Use the full staging rollout checklist in:

- `db/migrations/v2/STAGING_RUNBOOK.md`
