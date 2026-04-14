-- 49_bulk_inventory_audit_actor.sql
-- Inventory bulk update (Excel) calls fn_assign_asset, fn_return_asset, and
-- fn_set_asset_lifecycle_status per row. Merge explicit actor_snapshot built from
-- the session-linked employees row (by PK, no JWT in nested snapshot call) so
-- lifecycle "BY" matches bulk asset import / manual edits.

set search_path = public;

-- Snapshot shape matches fn_asset_event_actor_snapshot / migration 48.
create or replace function fn_actor_snapshot_from_employee_pk(p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth uuid;
  v_code text;
  v_name text;
  v_dept text;
begin
  if p_employee_id is null then
    return null;
  end if;

  select e.auth_user_id, e.employee_id, e.name, e.department
  into v_auth, v_code, v_name, v_dept
  from employees e
  where e.id = p_employee_id;

  return jsonb_build_object(
    'actor_id',              v_auth,
    'actor_employee_id',     p_employee_id,
    'actor_employee_code',   v_code,
    'actor_name',            v_name,
    'actor_department_name', v_dept
  );
end;
$$;

revoke all on function fn_actor_snapshot_from_employee_pk(uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_set_asset_lifecycle_status
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_set_asset_lifecycle_status(
  p_asset_tag  text,
  p_new_status text,
  p_source     text default 'bulk_update',
  p_notes      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id     uuid;
  v_old_status   text;
  v_new_status   asset_status;
  v_closed_count int := 0;
  v_tag          text := trim(coalesce(p_asset_tag, ''));
  v_session_emp  uuid;
  v_actor_snap   jsonb;
  rec            record;
begin
  if nullif(v_tag, '') is null then
    return jsonb_build_object('ok', false, 'message', 'Asset tag is required');
  end if;

  if nullif(trim(coalesce(p_new_status, '')), '') is null then
    return jsonb_build_object('ok', false, 'message', 'New status is required');
  end if;

  if lower(trim(p_new_status)) = 'assigned' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Use fn_assign_asset to assign assets. Direct status change to "assigned" is not allowed.'
    );
  end if;

  begin
    v_new_status := lower(trim(p_new_status))::asset_status;
  exception when invalid_text_representation then
    return jsonb_build_object(
      'ok', false,
      'message', format('Invalid status: %s. Allowed: in_stock, in_repair, retired, lost, disposed.', p_new_status)
    );
  end;

  select e.id into v_session_emp
  from employees e
  where e.auth_user_id = auth.uid()
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_from_employee_pk(v_session_emp);

  select id, status::text
  into v_asset_id, v_old_status
  from assets
  where asset_tag = v_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', v_tag));
  end if;

  if v_old_status = v_new_status::text then
    return jsonb_build_object(
      'ok',      true,
      'asset_id', v_asset_id,
      'asset_tag', v_tag,
      'status',  v_old_status,
      'message', format('Asset is already %s', v_old_status)
    );
  end if;

  for rec in
    select
      aa.id              as assignment_id,
      aa.employee_id,
      e.employee_id      as employee_code,
      e.name             as employee_name
    from asset_assignments aa
    left join employees e on e.id = aa.employee_id
    where aa.asset_id   = v_asset_id
      and aa.returned_at is null
  loop
    update asset_assignments
    set returned_at = now(),
        notes       = coalesce(notes, '') ||
                      case when coalesce(notes, '') = '' then '' else E'\n' end ||
                      format('Auto-closed: status changed to %s', v_new_status::text),
        updated_at  = now()
    where id = rec.assignment_id;

    perform fn_internal_record_asset_event(
      v_asset_id,
      'unassigned'::asset_event_type,
      case
        when v_actor_snap is not null then
          jsonb_build_object(
            'assignment_id',  rec.assignment_id,
            'employee_id',    rec.employee_id,
            'employee_code',  rec.employee_code,
            'employee_name',  rec.employee_name,
            'asset_tag',      v_tag,
            'reason',         format('Auto-closed: lifecycle status changed to %s', v_new_status::text)
          ) || jsonb_build_object('actor_snapshot', v_actor_snap)
        else
          jsonb_build_object(
            'assignment_id',  rec.assignment_id,
            'employee_id',    rec.employee_id,
            'employee_code',  rec.employee_code,
            'employee_name',  rec.employee_name,
            'asset_tag',      v_tag,
            'reason',         format('Auto-closed: lifecycle status changed to %s', v_new_status::text)
          )
      end,
      null,
      null
    );

    v_closed_count := v_closed_count + 1;
  end loop;

  update assets
  set status     = v_new_status,
      updated_at = now()
  where id = v_asset_id;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'asset_updated'::asset_event_type,
    case
      when v_actor_snap is not null then
        jsonb_build_object(
          'asset_tag',               v_tag,
          'schema_version',          1,
          'source',                  coalesce(p_source, 'bulk_update'),
          'notes',                   nullif(trim(coalesce(p_notes, '')), ''),
          'changes',                 jsonb_build_array(
            jsonb_build_object(
              'field',  'status',
              'label',  'Inventory Status',
              'before', to_jsonb(v_old_status),
              'after',  to_jsonb(v_new_status::text)
            )
          ),
          'auto_closed_assignments', v_closed_count
        ) || jsonb_build_object('actor_snapshot', v_actor_snap)
      else
        jsonb_build_object(
          'asset_tag',               v_tag,
          'schema_version',          1,
          'source',                  coalesce(p_source, 'bulk_update'),
          'notes',                   nullif(trim(coalesce(p_notes, '')), ''),
          'changes',                 jsonb_build_array(
            jsonb_build_object(
              'field',  'status',
              'label',  'Inventory Status',
              'before', to_jsonb(v_old_status),
              'after',  to_jsonb(v_new_status::text)
            )
          ),
          'auto_closed_assignments', v_closed_count
        )
    end,
    null,
    null
  );

  return jsonb_build_object(
    'ok',                      true,
    'asset_id',                v_asset_id,
    'asset_tag',               v_tag,
    'old_status',              v_old_status,
    'status',                  v_new_status::text,
    'auto_closed_assignments', v_closed_count,
    'message',                 format('Status changed from %s to %s', v_old_status, v_new_status::text)
  );
end;
$$;

revoke all on function fn_set_asset_lifecycle_status(text, text, text, text) from public;
grant execute on function fn_set_asset_lifecycle_status(text, text, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_return_asset
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_return_asset(
  p_asset_tag text,
  p_returned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
  where e.auth_user_id = auth.uid()
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_from_employee_pk(v_session_emp);

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

revoke all on function fn_return_asset(text, timestamptz, text, text) from public;
grant execute on function fn_return_asset(text, timestamptz, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_assign_asset
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_assign_asset(
  p_asset_tag text,
  p_employee_id text,
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
  where e.auth_user_id = auth.uid()
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_from_employee_pk(v_session_emp);

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

revoke all on function fn_assign_asset(text, text, timestamptz, text, text) from public;
grant execute on function fn_assign_asset(text, text, timestamptz, text, text) to authenticated, service_role;
