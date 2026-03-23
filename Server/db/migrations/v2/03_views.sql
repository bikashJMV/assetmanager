-- 03_views.sql
-- Read models for AMS V2

set search_path = public;

create or replace view v_asset_current_assignment as
select distinct on (aa.asset_id)
  aa.asset_id,
  aa.id as assignment_id,
  aa.employee_id,
  aa.assigned_at,
  aa.returned_at,
  aa.source,
  aa.notes
from asset_assignments aa
where aa.returned_at is null
order by aa.asset_id, aa.assigned_at desc, aa.created_at desc;

create or replace view v_asset_inventory as
select
  a.id,
  a.asset_tag,
  a.serial_number,
  a.model,
  a.status,
  a.purchase_date,
  a.warranty_expiry,
  a.custom_fields,
  a.metadata as asset_metadata,
  c.id as category_id,
  c.slug as category_slug,
  c.name as category_name,
  m.id as manufacturer_id,
  m.name as manufacturer_name,
  l.id as location_id,
  l.code as location_code,
  l.name as location_name,
  ca.assignment_id,
  ca.assigned_at,
  e.id as current_employee_id,
  e.employee_code as current_employee_code,
  e.name as current_employee_name,
  e.email as current_employee_email,
  e.is_active as current_employee_is_active,
  d.name as current_employee_department,
  a.created_at,
  a.updated_at
from assets a
join asset_categories c on c.id = a.category_id
left join manufacturers m on m.id = a.manufacturer_id
left join locations l on l.id = a.location_id
left join v_asset_current_assignment ca on ca.asset_id = a.id
left join employees e on e.id = ca.employee_id
left join departments d on d.id = e.department_id;

create or replace view v_assignment_anomalies as
select
  a.id as asset_id,
  a.asset_tag,
  count(*) filter (where aa.returned_at is null) as open_assignment_count,
  bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false))) as inactive_employee_holds_asset
from assets a
left join asset_assignments aa on aa.asset_id = a.id
left join employees e on e.id = aa.employee_id
group by a.id, a.asset_tag
having count(*) filter (where aa.returned_at is null) > 1
    or bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false)));

-- Public scan contract for QR pages.
-- Returns a compact payload for one asset tag and avoids exposing full table access to anon users.
create or replace function fn_public_scan_asset(p_asset_tag text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(scan_row)
  from (
    select
      vi.asset_tag,
      vi.category_name as category,
      vi.manufacturer_name as manufacturer,
      vi.model,
      vi.status,
      vi.location_name as location,
      vi.current_employee_name as holder,
      case
        when vi.current_employee_id is null then 'N/A'
        when vi.current_employee_is_active then 'ERP Active'
        else 'ERP Inactive'
      end as holder_erp_status,
      coalesce(vi.custom_fields, '{}'::jsonb) as custom_fields
    from v_asset_inventory vi
    where vi.asset_tag = trim(coalesce(p_asset_tag, ''))
    limit 1
  ) scan_row;
$$;
