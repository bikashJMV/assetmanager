-- 16_employee_erp_active.sql
-- Split employment/account flag (is_active) from ERP / platform flag (erp_active).
set search_path = public;

alter table employees
  add column if not exists erp_active boolean not null default true;

comment on column employees.is_active is 'Employee / account active (employment). Independent of ERP.';
comment on column employees.erp_active is 'ERP / AMS entitlement; independent of is_active.';

-- Preserve pre-split semantics for existing rows.
update employees
set erp_active = coalesce(is_active, true);

-- Inventory: expose both dimensions; erp_active column last so OR REPLACE does not shift prior columns.
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
  a.updated_at,
  a.created_by,
  a.updated_by,
  e.erp_active as current_employee_erp_active
from assets a
join asset_categories c on c.id = a.category_id
left join manufacturers m on m.id = a.manufacturer_id
left join locations l on l.id = a.location_id
left join v_asset_current_assignment ca on ca.asset_id = a.id
left join employees e on e.id = ca.employee_id
left join departments d on d.id = e.department_id
where coalesce(a.is_deleted, false) = false
  and (e.id is null or coalesce(e.is_deleted, false) = false);

create or replace view v_assignment_anomalies as
select
  a.id as asset_id,
  a.asset_tag,
  count(*) filter (where aa.returned_at is null) as open_assignment_count,
  bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false))) as inactive_employee_holds_asset,
  bool_or((aa.returned_at is null) and (not coalesce(e.erp_active, false))) as inactive_erp_holds_asset
from assets a
left join asset_assignments aa on aa.asset_id = a.id
left join employees e on e.id = aa.employee_id
group by a.id, a.asset_tag
having count(*) filter (where aa.returned_at is null) > 1
  or bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false)))
  or bool_or((aa.returned_at is null) and (not coalesce(e.erp_active, false)));

create or replace function fn_public_scan_asset(p_asset_tag text, p_user_agent text default null)
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
        when coalesce(vi.current_employee_erp_active, false) then 'ERP Active'
        else 'ERP Inactive'
      end as holder_erp_status,
      coalesce(vi.custom_fields, '{}'::jsonb) as custom_fields
    from v_asset_inventory vi
    where vi.asset_tag = trim(coalesce(p_asset_tag, ''))
    limit 1
  ) scan_row;
$$;

-- Assign only checks employment active (is_active); ERP is display / filters only.
create or replace function fn_assign_asset(
    p_asset_tag text,
    p_employee_code text,
    p_assigned_at timestamptz default now(),
    p_source text default 'runtime',
    p_notes text default null
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_asset_id uuid;
  v_employee_id uuid;
  v_assignment_id uuid;
  v_emp_active boolean;
  v_emp_deleted boolean;
  v_code_norm text := upper(trim(coalesce(p_employee_code, '')));
  v_at timestamptz := coalesce(p_assigned_at, now());
begin
  if v_code_norm = '' then
    return jsonb_build_object(
      'ok',
      false,
      'message',
      'Employee code is required'
    );
  end if;
  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;
  if v_asset_id is null then return jsonb_build_object(
    'ok',
    false,
    'message',
    format('Asset not found: %s', p_asset_tag)
  );
  end if;
  select id,
    coalesce(is_active, false),
    coalesce(is_deleted, false) into v_employee_id,
      v_emp_active,
      v_emp_deleted
  from employees
  where upper(trim(employee_code)) = v_code_norm;
  if v_employee_id is null then return jsonb_build_object(
    'ok',
    false,
    'message',
    format('Employee not found: %s', v_code_norm)
  );
  end if;
  if v_emp_deleted then return jsonb_build_object(
    'ok',
    false,
    'message',
    'Employee record is not available'
  );
  end if;
  if not v_emp_active then return jsonb_build_object(
    'ok',
    false,
    'message',
    'Employee is not active'
  );
  end if;
  if exists (
    select 1
    from asset_assignments aa
    where aa.asset_id = v_asset_id
      and aa.returned_at is null
      and aa.employee_id = v_employee_id
  ) then return jsonb_build_object(
    'ok',
    true,
    'message',
    'Asset already assigned to same employee',
    'asset_id',
    v_asset_id,
    'asset_tag',
    p_asset_tag,
    'employee_id',
    v_employee_id,
    'employee_code',
    v_code_norm,
    'status',
    'assigned'
  );
  end if;
  update asset_assignments
  set returned_at = v_at,
    notes = coalesce(notes, '') || case
      when coalesce(notes, '') = '' then ''
      else E'\n'
    end || 'Auto-closed by reassignment',
    updated_at = now()
  where asset_id = v_asset_id
    and returned_at is null;
  insert into asset_assignments (
    asset_id,
    employee_id,
    assigned_at,
    returned_at,
    source,
    notes
  )
  values (
    v_asset_id,
    v_employee_id,
    v_at,
    null,
    coalesce(p_source, 'runtime'),
    p_notes
  )
  returning id into v_assignment_id;
  perform fn_internal_record_asset_event(
    v_asset_id,
    'assigned'::asset_event_type,
    jsonb_build_object(
      'assignment_id',
      v_assignment_id,
      'employee_code',
      v_code_norm,
      'asset_tag',
      p_asset_tag
    ),
    null,
    null
  );
  return jsonb_build_object(
    'ok',
    true,
    'assignment_id',
    v_assignment_id,
    'asset_id',
    v_asset_id,
    'asset_tag',
    p_asset_tag,
    'employee_id',
    v_employee_id,
    'employee_code',
    v_code_norm,
    'status',
    'assigned',
    'message',
    'Asset assigned successfully'
  );
end;
$$;
