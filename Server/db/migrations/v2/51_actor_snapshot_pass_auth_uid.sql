-- 51_actor_snapshot_pass_auth_uid.sql
-- Migration 50 used auth.uid() INSIDE fn_actor_snapshot_for_event_payload (SECURITY DEFINER).
-- In Supabase, auth.uid() is often NULL inside nested SECURITY DEFINER helpers, so minimal
-- snapshots were never built and assign/return still showed "System / public".
-- Fix: pass the caller's uid captured at the outer RPC (assign/return/create/lifecycle).

set search_path = public;

drop function if exists fn_actor_snapshot_for_event_payload(uuid);

-- p_auth_uid: capture once in outer RPC via auth.uid(); p_session_employee_pk: employees.id for full snapshot.
create or replace function fn_actor_snapshot_for_event_payload(
  p_auth_uid uuid,
  p_session_employee_pk uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    fn_actor_snapshot_from_employee_pk(p_session_employee_pk),
    case
      when p_auth_uid is not null then
        jsonb_build_object(
          'actor_id', p_auth_uid,
          'actor_employee_id', null,
          'actor_employee_code', null,
          'actor_name', null,
          'actor_department_name', null
        )
      else null
    end
  );
end;
$$;

revoke all on function fn_actor_snapshot_for_event_payload(uuid, uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_create_asset_with_log
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_create_asset_with_log(
  p_asset_tag           text        default null,
  p_category_slug       text        default null,
  p_category_name       text        default null,
  p_manufacturer_name   text        default null,
  p_model               text        default null,
  p_serial_number       text        default null,
  p_location_code       text        default null,
  p_location_name       text        default null,
  p_status              asset_status default null,
  p_purchase_date       date        default null,
  p_warranty_expiry     date        default null,
  p_custom_fields       jsonb       default '{}'::jsonb,
  p_metadata            jsonb       default '{}'::jsonb,
  p_log_note            text        default 'Auto-generated on asset creation',
  p_qr_code             text        default null,
  p_actor_employee_code text        default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid           uuid := auth.uid();
  v_asset_id           uuid;
  v_asset_tag          text;
  v_category_slug      text;
  v_category_name      text;
  v_category_id        uuid;
  v_manufacturer_name  text;
  v_manufacturer_id    uuid;
  v_location_code      text;
  v_location_name      text;
  v_location_id        uuid;
  v_actor_employee_id  uuid;
  v_actor_snapshot     jsonb;
  v_event_payload      jsonb;
  v_log_id             uuid;
begin
  v_category_slug := nullif(
    regexp_replace(lower(trim(coalesce(p_category_slug, ''))), '[^a-z0-9]+', '-', 'g'),
    ''
  );
  if v_category_slug is null then
    return jsonb_build_object('ok', false, 'message', 'category_slug is required');
  end if;

  v_category_name := nullif(trim(coalesce(p_category_name, '')), '');
  if v_category_name is null then
    v_category_name := initcap(replace(v_category_slug, '-', ' '));
  end if;

  insert into asset_categories (slug, name)
  values (v_category_slug, v_category_name)
  on conflict (slug) do nothing;

  select id into v_category_id from asset_categories where slug = v_category_slug;
  if v_category_id is null then
    return jsonb_build_object('ok', false, 'message', format('Category resolve failed: %s', v_category_slug));
  end if;

  v_manufacturer_name := nullif(trim(coalesce(p_manufacturer_name, '')), '');
  if v_manufacturer_name is not null then
    insert into manufacturers (name) values (v_manufacturer_name) on conflict (name) do nothing;
    select id into v_manufacturer_id from manufacturers where name = v_manufacturer_name;
  end if;

  v_location_code := fn_normalize_location_code(p_location_code);
  if v_location_code is null then
    v_location_code := fn_normalize_location_code(p_location_name);
  end if;
  v_location_name := nullif(trim(coalesce(p_location_name, '')), '');
  if v_location_name is null then
    v_location_name := coalesce(v_location_code, 'Unknown');
  end if;
  if v_location_code is not null then
    insert into locations (code, name)
    values (v_location_code, v_location_name)
    on conflict (code) do update set name = excluded.name, updated_at = now();
    select id into v_location_id from locations where code = v_location_code;
  end if;

  if nullif(trim(coalesce(p_actor_employee_code, '')), '') is not null then
    select id into v_actor_employee_id
    from employees
    where employee_id = trim(p_actor_employee_code);
  end if;

  v_actor_snapshot := fn_actor_snapshot_for_event_payload(v_auth_uid, v_actor_employee_id);

  v_asset_tag := fn_next_asset_tag();

  insert into assets (
    asset_tag, category_id, manufacturer_id, model, serial_number,
    location_id, custom_fields, status, purchase_date, warranty_expiry, metadata
  ) values (
    v_asset_tag,
    v_category_id,
    v_manufacturer_id,
    nullif(trim(coalesce(p_model, '')), ''),
    nullif(trim(coalesce(p_serial_number, '')), ''),
    v_location_id,
    coalesce(p_custom_fields, '{}'::jsonb),
    coalesce(p_status, 'in_stock'::asset_status),
    p_purchase_date,
    p_warranty_expiry,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id, asset_tag into v_asset_id, v_asset_tag;

  v_event_payload := jsonb_build_object('asset_tag', v_asset_tag, 'category_slug', v_category_slug);
  if v_actor_snapshot is not null then
    v_event_payload := v_event_payload || jsonb_build_object('actor_snapshot', v_actor_snapshot);
  end if;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'asset_created'::asset_event_type,
    v_event_payload,
    null,
    null
  );

  insert into asset_logs (asset_id, actor_employee_id, note, qr_code, metadata)
  values (
    v_asset_id,
    v_actor_employee_id,
    nullif(trim(coalesce(p_log_note, '')), ''),
    p_qr_code,
    jsonb_build_object('source', 'runtime_create')
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'ok',        true,
    'asset_id',  v_asset_id,
    'asset_tag', v_asset_tag,
    'log_id',    v_log_id
  );
end;
$$;

revoke all on function fn_create_asset_with_log(text,text,text,text,text,text,text,text,asset_status,date,date,jsonb,jsonb,text,text,text) from public;
grant execute on function fn_create_asset_with_log(text,text,text,text,text,text,text,text,asset_status,date,date,jsonb,jsonb,text,text,text) to authenticated, service_role;

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
  v_auth_uid     uuid := auth.uid();
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
  where e.auth_user_id = v_auth_uid
  order by e.updated_at desc
  limit 1;

  v_actor_snap := fn_actor_snapshot_for_event_payload(v_auth_uid, v_session_emp);

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
  v_auth_uid uuid := auth.uid();
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
  v_auth_uid uuid := auth.uid();
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

revoke all on function fn_assign_asset(text, text, timestamptz, text, text) from public;
grant execute on function fn_assign_asset(text, text, timestamptz, text, text) to authenticated, service_role;

-- One row so SQL editors / runners that coerce to a single JSON result do not report "0 rows".
select jsonb_build_object(
  'migration', '51_actor_snapshot_pass_auth_uid',
  'status', 'applied'
) as result;
