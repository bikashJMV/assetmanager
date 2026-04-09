# AMS Database Migrations

This folder is the source of truth for the main Asset Manager database.

Apply the files in this exact order:

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
13. `13_asset_audit_and_events.sql`
14. `14_fn_assign_employee_code_normalize.sql`
15. `15_fn_assign_assigned_at_coalesce.sql`
16. `16_employee_erp_active.sql`
17. `17_fn_public_scan_minimal.sql`
18. `18_asset_event_audit_diffs.sql`
19. `19_assign_same_employee_error.sql`
20. `20_fn_set_asset_lifecycle_status.sql`
21. `21_assign_lifecycle_status_guard.sql`

## Important invariants

- Canonical role is `employees.role`.
- `it_ops` is the highest role.
- `employees.is_active` and `employees.erp_active` serve different purposes.
- Asset status must not be derived from ERP status.
- Runtime assign/return flows must use `fn_assign_asset` and `fn_return_asset`.
- `fn_assign_asset` only allows assignment when `assets.status` is `in_stock` or `assigned` (whitelist). Assets in `lost`, `disposed`, `retired`, or `in_repair` must have their status changed first.
- Lifecycle status changes (in_stock, in_repair, retired, lost, disposed) must use `fn_set_asset_lifecycle_status` — it auto-closes open assignments and records proper audit events.
- Public QR scan must stay minimal and uses `fn_public_scan_asset`.
- Soft delete and recycle-bin behavior are part of the schema contract.

## Notes

- The scripts are intended to be idempotent and safe to re-run.
- `16_employee_erp_active.sql` appends new columns when replacing `v_asset_inventory`; changing view column order incorrectly can break `CREATE OR REPLACE VIEW`.
- `17_fn_public_scan_minimal.sql` keeps anonymous scan payloads minimal and restores `qr_scanned` lifecycle logging.
- `18_asset_event_audit_diffs.sql` adds richer audit payloads, actor snapshots, field-level diffs, and explicit delete/restore event types.
- `19_assign_same_employee_error.sql` turns same-holder assignment attempts into a validation error instead of a success-style no-op.
- `20_fn_set_asset_lifecycle_status.sql` adds a controlled RPC for lifecycle status transitions. Auto-closes open assignments, records per-assignment `unassigned` events, and logs an `asset_updated` event with before/after status diff.
- `21_assign_lifecycle_status_guard.sql` adds a whitelist-based status guard to `fn_assign_asset`. Only `in_stock` and `assigned` assets can be assigned; all other statuses are rejected with a clear message.

## Re-run guidance

If your database was already created and you are syncing to the current repo state, re-run the changed migration files in sequence rather than inventing ad hoc SQL patches. In practice that usually means re-running the later files after `03_views.sql`, depending on what changed in your branch.

## Import helper

Use the spreadsheet import utility from `Server/`:

```powershell
python scripts/import_v2_from_sheet.py --file "C:\path\to\your-sheet.xlsx" --sheet "Sheet1"
```

Validation only:

```powershell
python scripts/import_v2_from_sheet.py --file "C:\path\to\your-sheet.xlsx" --validate-only
```

## Staging rollout

Use [`STAGING_RUNBOOK.md`](./STAGING_RUNBOOK.md) for staging execution and rollback sequencing.
