-- 52_bff_actor_uid_assign_return.sql
-- Assign/return from the Python BFF use the service-role Supabase client, so auth.uid() is NULL
-- in Postgres. Accept optional p_actor_auth_uid (verified JWT sub from BFF) and use it for
-- actor_snapshot; fall back to auth.uid() for direct browser RPC calls.

set search_path = public;

drop function if exists fn_assign_asset(text, text, timestamptz, text, text);
drop function if exists fn_return_asset(text, timestamptz, text, text);

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_return_asset
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_return_asset(
  p_asset_tag text,
  p_returned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null,
  p_actor_auth_uid uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := coalesce(p_actor_auth_uid, auth.uid());
  v_asset_id uuid;
  v_assignment_id uuid;
  v_employee_id uuid;
  v_employee_code text;
  v_employee_name text;
  v_session_emp uuid;
  v_actor_snap jsonb;
begin
  select e.id into v_session_emp
  from employees e
  where e.auth_user_id = v_auth_uid
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_for_event_payload(v_auth_uid, v_session_emp);

  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
  end if;

  select aa.id, aa.employee_id, e.employee_id, e.name
  into v_assignment_id, v_employee_id, v_employee_code, v_employee_name
  from asset_assignments aa
  left join employees e on e.id = aa.employee_id
  where aa.asset_id = v_asset_id
    and aa.returned_at is null
  order by aa.assigned_at desc, aa.created_at desc
  limit 1;

  if v_assignment_id is null then
    return jsonb_build_object(
      'ok', false,
      'asset_id', v_asset_id,
      'asset_tag', p_asset_tag,
      'message', 'No open assignment found to return'
    );
  end if;

  update asset_assignments
  set returned_at = coalesce(p_returned_at, now()),
      source = coalesce(p_source, source),
      notes = coalesce(
        case
          when p_notes is null or btrim(p_notes) = '' then notes
          when notes is null or btrim(notes) = '' then p_notes
          else notes || E'\n' || p_notes
        end,
        notes
      ),
      updated_at = now()
  where id = v_assignment_id;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'unassigned'::asset_event_type,
    case
      when v_actor_snap is not null then
        jsonb_build_object(
          'assignment_id', v_assignment_id,
          'employee_id', v_employee_id,
          'employee_code', v_employee_code,
          'employee_name', v_employee_name,
          'asset_tag', p_asset_tag
        ) || jsonb_build_object('actor_snapshot', v_actor_snap)
      else
        jsonb_build_object(
          'assignment_id', v_assignment_id,
          'employee_id', v_employee_id,
          'employee_code', v_employee_code,
          'employee_name', v_employee_name,
          'asset_tag', p_asset_tag
        )
    end,
    null,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'asset_id', v_asset_id,
    'asset_tag', p_asset_tag,
    'status', 'in_stock',
    'message', 'Asset returned successfully'
  );
end;
$$;

alter function fn_return_asset(text, timestamptz, text, text, uuid) security invoker;

revoke all on function fn_return_asset(text, timestamptz, text, text, uuid) from public;
grant execute on function fn_return_asset(text, timestamptz, text, text, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_assign_asset
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_assign_asset(
  p_asset_tag text,
  p_employee_id text,
  p_assigned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null,
  p_actor_auth_uid uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := coalesce(p_actor_auth_uid, auth.uid());
  v_asset_id uuid;
  v_employee_id uuid;
  v_assignment_id uuid;
  v_emp_active boolean;
  v_code_norm text := upper(trim(coalesce(p_employee_id, '')));
  v_at timestamptz := coalesce(p_assigned_at, now());
  v_session_emp uuid;
  v_actor_snap jsonb;
begin
  select e.id into v_session_emp
  from employees e
  where e.auth_user_id = v_auth_uid
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_for_event_payload(v_auth_uid, v_session_emp);

  if v_code_norm = '' then
    return jsonb_build_object(
      'ok',
      false,
      'message',
      'Employee ID is required'
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
    coalesce(is_active, false) into v_employee_id,
      v_emp_active
  from employees
  where upper(trim(employee_id)) = v_code_norm;
  if v_employee_id is null then return jsonb_build_object(
    'ok',
    false,
    'message',
    format('Employee not found: %s', v_code_norm)
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
    'employee_id_code',
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
    case
      when v_actor_snap is not null then
        jsonb_build_object(
          'assignment_id',
          v_assignment_id,
          'employee_id',
          v_code_norm,
          'asset_tag',
          p_asset_tag
        ) || jsonb_build_object('actor_snapshot', v_actor_snap)
      else
        jsonb_build_object(
          'assignment_id',
          v_assignment_id,
          'employee_id',
          v_code_norm,
          'asset_tag',
          p_asset_tag
        )
    end,
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
    'employee_id_code',
    v_code_norm,
    'status',
    'assigned',
    'message',
    'Asset assigned successfully'
  );
end;
$$;

alter function fn_assign_asset(text, text, timestamptz, text, text, uuid) security invoker;

revoke all on function fn_assign_asset(text, text, timestamptz, text, text, uuid) from public;
grant execute on function fn_assign_asset(text, text, timestamptz, text, text, uuid) to authenticated, service_role;

select jsonb_build_object(
  'migration', '52_bff_actor_uid_assign_return',
  'status', 'applied'
) as result;
