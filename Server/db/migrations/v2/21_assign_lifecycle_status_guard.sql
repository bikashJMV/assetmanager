-- 21_assign_lifecycle_status_guard.sql
-- Reject assignment when the asset's inventory status is not assignable.
-- Only assets with status 'in_stock' or 'assigned' (reassignment) may be assigned.
-- Whitelist approach: any future status added to the enum is blocked by default.

create or replace function fn_assign_asset(
  p_asset_tag text,
  p_employee_code text,
  p_assigned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_asset_status text;
  v_employee_id uuid;
  v_assignment_id uuid;
  v_emp_active boolean;
  v_emp_deleted boolean;
  v_emp_name text;
  v_code_norm text := upper(trim(coalesce(p_employee_code, '')));
  v_at timestamptz := coalesce(p_assigned_at, now());
begin
  if v_code_norm = '' then
    return jsonb_build_object('ok', false, 'message', 'Employee code is required');
  end if;

  select id, status::text
  into v_asset_id, v_asset_status
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
  end if;

  if v_asset_status not in ('in_stock', 'assigned') then
    return jsonb_build_object(
      'ok', false,
      'message', format(
        'Cannot assign — this asset is currently marked as "%s". Please update its inventory status to "In Stock" before assigning.',
        replace(v_asset_status, '_', ' ')
      ),
      'asset_id', v_asset_id,
      'asset_tag', p_asset_tag,
      'current_status', v_asset_status
    );
  end if;

  select id, coalesce(is_active, false), coalesce(is_deleted, false), name
  into v_employee_id, v_emp_active, v_emp_deleted, v_emp_name
  from employees
  where upper(trim(employee_code)) = v_code_norm;

  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'message', format('Employee not found: %s', v_code_norm));
  end if;
  if v_emp_deleted then
    return jsonb_build_object('ok', false, 'message', 'Employee record is not available');
  end if;
  if not v_emp_active then
    return jsonb_build_object('ok', false, 'message', 'Employee is not active');
  end if;

  if exists (
    select 1
    from asset_assignments aa
    where aa.asset_id = v_asset_id
      and aa.returned_at is null
      and aa.employee_id = v_employee_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'message', format('Asset already assigned to %s', coalesce(nullif(trim(v_emp_name), ''), v_code_norm)),
      'asset_id', v_asset_id,
      'asset_tag', p_asset_tag,
      'employee_id', v_employee_id,
      'employee_code', v_code_norm,
      'status', 'assigned'
    );
  end if;

  update asset_assignments
  set returned_at = v_at,
      notes = coalesce(notes, '') || case when coalesce(notes, '') = '' then '' else E'\n' end || 'Auto-closed by reassignment',
      updated_at = now()
  where asset_id = v_asset_id
    and returned_at is null;

  insert into asset_assignments (asset_id, employee_id, assigned_at, returned_at, source, notes)
  values (v_asset_id, v_employee_id, v_at, null, coalesce(p_source, 'runtime'), p_notes)
  returning id into v_assignment_id;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'assigned'::asset_event_type,
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'employee_id', v_employee_id,
      'employee_code', v_code_norm,
      'employee_name', v_emp_name,
      'asset_tag', p_asset_tag
    ),
    null,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'asset_id', v_asset_id,
    'asset_tag', p_asset_tag,
    'employee_id', v_employee_id,
    'employee_code', v_code_norm,
    'status', 'assigned',
    'message', 'Asset assigned successfully'
  );
end;
$$;
