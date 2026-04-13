-- 33_scoped_views_employee_role.sql
-- Enforce RBAC on the two main read views so employees only see their own data.
--
-- HOW:  Add security_invoker = true to v_employee_directory and v_asset_inventory.
--       With security_invoker the view runs as the caller (authenticated PostgREST user)
--       so the existing table-level RLS policies apply automatically:
--
--         employees_self_read    → employees see only their own row
--         employees_admin_all    → admin / IT Ops see all rows
--         assets_authenticated_read → employees see only their assigned assets;
--                                     admin / IT Ops see all assets
--
--       Security-definer RPCs (fn_public_scan_asset, fn_get_session_employee, etc.)
--       call these views as the postgres superuser, which bypasses RLS, so they
--       continue to work without any changes.
--
-- No API endpoint, view name, or column name is changed.
--
set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  v_employee_directory
--     Employees → only their own row (employees_self_read policy)
--     Admin / IT Ops → all active directory rows (employees_admin_all policy)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view v_employee_directory
with (security_invoker = true)
as
select
  e.id,
  e.employee_id,
  e.name,
  e.email,
  e.is_active,
  e.role,
  e.department
from employees e
where not exists (
  select 1
  from recycle_bin_entries r
  where r.entity_type = 'employee'
    and r.entity_id    = e.id
    and r.restored_at  is null
);

comment on view v_employee_directory is
  'Active employee directory (excludes Recycle Bin entries). '
  'security_invoker=true: RLS on employees applies per caller role.';

grant select on v_employee_directory to authenticated;
grant select on v_employee_directory to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  v_asset_inventory
--     Employees → only assets with an open assignment to them (assets_authenticated_read)
--     Admin / IT Ops → all non-deleted assets
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view v_asset_inventory
with (security_invoker = true)
as
select
  a.id,
  a.asset_tag,
  a.serial_number,
  a.model,
  a.status,
  a.purchase_date,
  a.warranty_expiry,
  a.custom_fields,
  a.metadata                  as asset_metadata,
  c.id                        as category_id,
  c.slug                      as category_slug,
  c.name                      as category_name,
  m.id                        as manufacturer_id,
  m.name                      as manufacturer_name,
  l.id                        as location_id,
  l.code                      as location_code,
  l.name                      as location_name,
  ca.assignment_id,
  ca.assigned_at,
  e.id                        as current_employee_id,
  e.employee_id               as current_employee_code,
  e.name                      as current_employee_name,
  e.email                     as current_employee_email,
  e.is_active                 as current_employee_is_active,
  e.department                as current_employee_department,
  a.created_at,
  a.updated_at,
  a.created_by,
  a.updated_by
from assets a
join  asset_categories c          on c.id = a.category_id
left join manufacturers m         on m.id = a.manufacturer_id
left join locations l             on l.id = a.location_id
left join v_asset_current_assignment ca on ca.asset_id = a.id
left join employees e             on e.id = ca.employee_id
where coalesce(a.is_deleted, false) = false;

comment on view v_asset_inventory is
  'Full asset inventory with current assignment details. '
  'security_invoker=true: assets_authenticated_read RLS scopes employees to their own assignments.';

grant select on v_asset_inventory to authenticated;
grant select on v_asset_inventory to service_role;
