-- 14_fn_assign_employee_code_normalize.sql
-- Match employee by trimmed, case-insensitive code so EMP0010 == emp0010.
set search_path = public;

create or replace function fn_assign_asset(
    p_asset_tag text,
    p_employee_code text,
    p_assigned_at timestamptz default now(),
    p_source text default 'runtime',
    p_notes text default null
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_asset_id uuid;
v_employee_id uuid;
v_assignment_id uuid;
v_emp_active boolean;
v_emp_deleted boolean;
v_code_norm text := upper(trim(coalesce(p_employee_code, '')));
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
if not v_emp_active then return jsonb_build_object('ok', false, 'message', 'Employee is inactive');
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
set returned_at = p_assigned_at,
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
    p_assigned_at,
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
