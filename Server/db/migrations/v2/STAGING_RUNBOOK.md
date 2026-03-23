# V2 Backend Staging Runbook

This runbook executes Step 2 (backend runtime + import pipeline) in staging first.

## 1) Pre-flight

- Confirm project is **staging Supabase project** (not prod).
- Confirm you have a backup/export snapshot before bulk load.
- Confirm migration files exist in:
  - `db/migrations/v2/01_tables.sql`
  - `db/migrations/v2/02_functions.sql`
  - `db/migrations/v2/03_views.sql`
  - `db/migrations/v2/04_rls_policies.sql`
  - `db/migrations/v2/05_storage_realtime_auth.sql`
  - `db/migrations/v2/06_seed.sql`

## 2) Apply migrations in order (Supabase SQL Editor)

Run each file in its own SQL Editor execution, in exact order:

1. `01_tables.sql`
2. `02_functions.sql`
3. `03_views.sql`
4. `04_rls_policies.sql`
5. `05_storage_realtime_auth.sql`
6. `06_seed.sql`

If staging already had an older V2 rollout, re-run at least:

- `03_views.sql` (adds/refreshes `fn_public_scan_asset`)
- `04_rls_policies.sql` (admin RLS and RPC security mode updates)

If your org requires Google domain restriction, run:

```sql
alter database postgres set app.allowed_email_domain = 'yourcompany.com';
```

## 3) Runtime RPC smoke tests

### 3.1 Seed one employee and one asset for test

```sql
insert into departments(name) values ('Staging QA')
on conflict (name) do nothing;

insert into employees(employee_code, name, is_active)
values ('EMP-STAGE-001', 'Staging User', true)
on conflict (employee_code) do update set name = excluded.name, is_active = excluded.is_active;

insert into asset_categories(slug, name)
values ('laptop', 'Laptop')
on conflict (slug) do nothing;

insert into assets(asset_tag, category_id, model)
select 'AST-STAGE-001', c.id, 'QA Model'
from asset_categories c
where c.slug = 'laptop'
on conflict (asset_tag) do nothing;
```

### 3.2 Assign via RPC

```sql
select fn_assign_asset(
  p_asset_tag => 'AST-STAGE-001',
  p_employee_code => 'EMP-STAGE-001',
  p_assigned_at => now(),
  p_source => 'runtime',
  p_notes => 'staging smoke assign'
);
```

Expected: `ok=true`, status `assigned`.

### 3.3 Return via RPC

```sql
select fn_return_asset(
  p_asset_tag => 'AST-STAGE-001',
  p_returned_at => now(),
  p_source => 'runtime',
  p_notes => 'staging smoke return'
);
```

Expected: `ok=true`, status `in_stock`.

### 3.4 Verify status-source-of-truth

```sql
select asset_tag, status from assets where asset_tag = 'AST-STAGE-001';
select id, asset_id, employee_id, assigned_at, returned_at
from asset_assignments
where asset_id = (select id from assets where asset_tag = 'AST-STAGE-001')
order by assigned_at desc;
```

Expectation:
- `assets.status` changes only by assignment state.
- There is at most one open assignment (`returned_at is null`) per asset.

## 4) Import dry run then write run

### Dry run (no writes)

```bash
python scripts/import_v2_from_sheet.py --file "C:\path\sheet.xlsx" --sheet "Sheet1" --validate-only --report-file "C:\path\import_report_dryrun.json"
```

### Actual import

```bash
python scripts/import_v2_from_sheet.py --file "C:\path\sheet.xlsx" --sheet "Sheet1" --report-file "C:\path\import_report_live.json"
```

## 5) Post-import checks

Use importer report + SQL checks:

```sql
-- Duplicate open assignments should be zero rows
select * from v_assignment_anomalies;

-- Inactive employees holding open assignments
select *
from v_asset_inventory
where assignment_id is not null
  and current_employee_is_active = false;
```

## 6) API smoke tests (FastAPI)

After deploying backend code:

- `POST /assignments/assign`
- `POST /assignments/return`

Sample body:

```json
{
  "asset_tag": "AST-STAGE-001",
  "employee_code": "EMP-STAGE-001",
  "source": "runtime",
  "notes": "api smoke"
}
```

## 7) Cutover guardrail

- For day-to-day operations, assignment changes must only use:
  - `fn_assign_asset`
  - `fn_return_asset`
- Importer is bootstrap/refresh only.
- Do not map ERP Status to `assets.status`.
