-- 41_fix_v_asset_inventory_employee_id.sql
--
-- Root cause: v_asset_inventory (security_invoker=true) computes current_employee_id
-- as `e.id` from a LEFT JOIN on employees.  With security_invoker the
-- employees_self_read RLS policy (`auth_user_id = auth.uid()`) applies to that
-- JOIN, so for non-admin callers the joined employee row is filtered out and
-- e.id is NULL — even for assets that ARE assigned to the calling employee.
-- The filter `.eq('current_employee_id', id)` then returns 0 rows.
--
-- Fix: source current_employee_id from ca.employee_id (asset_assignments join)
-- instead of e.id.  asset_assignments has using(true) so this is never blocked.
-- The e.* columns (name, email, is_active, department) are still from the LEFT
-- JOIN and remain NULL for non-admin callers viewing other employees' data —
-- that is the intended behaviour.

set search_path = public;

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
  -- Use ca.employee_id (from asset_assignments, using(true)) instead of e.id
  -- so this column is never NULLed by the employees RLS on the LEFT JOIN.
  ca.employee_id              as current_employee_id,
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
join  asset_categories c              on c.id = a.category_id
left join manufacturers m             on m.id = a.manufacturer_id
left join locations l                 on l.id = a.location_id
left join v_asset_current_assignment ca on ca.asset_id = a.id
left join employees e                 on e.id = ca.employee_id
where coalesce(a.is_deleted, false) = false;

comment on view v_asset_inventory is
  'Full asset inventory with current assignment details. '
  'security_invoker=true: assets_authenticated_read RLS scopes employees to their own assignments. '
  'current_employee_id sourced from ca.employee_id (asset_assignments) to avoid RLS nulling the JOIN.';

grant select on v_asset_inventory to authenticated;
grant select on v_asset_inventory to service_role;
