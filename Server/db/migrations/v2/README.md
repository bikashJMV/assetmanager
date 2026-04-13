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
22. `22_public_scan_holder_details.sql`
23. `23_restructure_employees.sql`
24. `24_asset_mandatory_fields.sql`
25. `25_restore_rbac_columns.sql`
26. `26_session_lookup_rpc.sql`
27. `27_employee_permanent_delete_rpc.sql`
28. `28_delete_asset_permanent_rpc.sql`
29. `29_employee_directory_view.sql`
30. `30_fn_bulk_insert_employees.sql`
31. `31_fn_bulk_insert_employees_setof.sql`
32. `32_fn_get_session_employee_no_autoprovision.sql`
33. `33_scoped_views_employee_role.sql`
34. `34_fix_fn_list_warranty_notifications.sql`
35. `35_fn_public_scan_add_category.sql`
36. `36_seed_category_changes.sql`
37. `37_fn_bulk_insert_assets.sql`
38. `38_fix_fn_asset_event_actor_snapshot.sql`
39. `39_fix_employee_code_column_refs.sql`
40. `40_fix_assets_rls_employee_scope.sql`
41. `41_fix_v_asset_inventory_employee_id.sql`
42. `42_fix_v_asset_inventory_current_employee_id.sql`
43. `43_fix_assets_rls_remove_circular_dependency.sql`
44. `43_fix_fn_return_asset_employee_id.sql`
45. `44_fix_fn_soft_delete_asset.sql`
46. `45_recycle_bin_grants_v_employee_directory.sql`

## Important invariants

- As of migration 24, `asset_tag`, `serial_number`, and `category_id` are mandatory for all assets. All other fields are optional.
- The `networking` category/template has been removed from the schema, seed data, and all client/server logic.
- Canonical role is `employees.role`.
- `it_ops` is the highest role.
- `employees.is_active` and `employees.erp_active` serve different purposes.
- Asset status must not be derived from ERP status.
- Runtime assign/return flows must use `fn_assign_asset` and `fn_return_asset`.
- `fn_assign_asset` only allows assignment when `assets.status` is `in_stock` or `assigned` (whitelist). Assets in `lost`, `disposed`, `retired`, or `in_repair` must have their status changed first.
- Lifecycle status changes (in_stock, in_repair, retired, lost, disposed) must use `fn_set_asset_lifecycle_status` — it auto-closes open assignments and records proper audit events.
- Public QR scan uses `fn_public_scan_asset` and must stay tightly scoped to the documented anonymous payload.
- Soft delete and recycle-bin behavior are part of the schema contract.
- `v_employee_directory` lists employees who do **not** have an **open** Recycle Bin row (`recycle_bin_entries` with `entity_type = 'employee'` and `restored_at is null`). With `security_invoker = true` (migration 33), callers must be able to `SELECT` from `recycle_bin_entries` for that exclusion to work; migration **45** grants that.
- After **45**, soft-deleted employees disappear from the directory view and from client flows that read it (e.g. `getEmployeeById`).

## Notes

- The scripts are intended to be idempotent and safe to re-run.
- `16_employee_erp_active.sql` appends new columns when replacing `v_asset_inventory`; changing view column order incorrectly can break `CREATE OR REPLACE VIEW`.
- `17_fn_public_scan_minimal.sql` keeps anonymous scan payloads minimal and restores `qr_scanned` lifecycle logging.
- `18_asset_event_audit_diffs.sql` adds richer audit payloads, actor snapshots, field-level diffs, and explicit delete/restore event types.
- `19_assign_same_employee_error.sql` turns same-holder assignment attempts into a validation error instead of a success-style no-op.
- `20_fn_set_asset_lifecycle_status.sql` adds a controlled RPC for lifecycle status transitions. Auto-closes open assignments, records per-assignment `unassigned` events, and logs an `asset_updated` event with before/after status diff.
- `21_assign_lifecycle_status_guard.sql` adds a whitelist-based status guard to `fn_assign_asset`. Only `in_stock` and `assigned` assets can be assigned; all other statuses are rejected with a clear message.
- `22_public_scan_holder_details.sql` updates the anonymous QR contract to expose only:
- assigned assets: `asset_name`, `holder_name`, `holder_employee_code`, `holder_department`
- unassigned assets: `asset_name`, `status`, `asset_tag`
- `22_public_scan_holder_details.sql` keeps `qr_scanned` lifecycle logging and the same RPC signature.
- `33_scoped_views_employee_role.sql` sets `security_invoker = true` on `v_employee_directory` (and `v_asset_inventory`) so employee-scoped RLS applies; pair it with **45** so the Recycle Bin subquery is visible to authenticated users.
- `45_recycle_bin_grants_v_employee_directory.sql` grants `SELECT` on `public.recycle_bin_entries` to `authenticated` and `service_role`, and recreates `v_employee_directory`. Apply on any database that was missing those grants or soft-deleted rows still appeared in the employee list.

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
