-- 18_asset_event_audit_diffs.sql
-- Audit-grade lifecycle payloads: immutable actor snapshot, field-level before/after diffs,
-- and explicit delete/restore event types.
set search_path = public;

do $$
begin
  begin
    alter type asset_event_type add value if not exists 'asset_deleted';
  exception when duplicate_object then
    null;
  end;
  begin
    alter type asset_event_type add value if not exists 'asset_restored';
  exception when duplicate_object then
    null;
  end;
end $$;

create or replace function fn_asset_event_actor_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp_id uuid;
  v_code text;
  v_name text;
  v_department text;
begin
  if v_uid is null then
    return jsonb_build_object(
      'actor_id', null,
      'actor_employee_id', null,
      'actor_employee_code', null,
      'actor_name', null,
      'actor_department_name', null
    );
  end if;

  select
    e.id,
    e.employee_code,
    e.name,
    d.name
  into
    v_emp_id,
    v_code,
    v_name,
    v_department
  from employees e
  left join departments d on d.id = e.department_id
  where e.auth_user_id = v_uid
  order by e.updated_at desc
  limit 1;

  return jsonb_build_object(
    'actor_id', v_uid,
    'actor_employee_id', v_emp_id,
    'actor_employee_code', v_code,
    'actor_name', v_name,
    'actor_department_name', v_department
  );
end;
$$;

create or replace function fn_asset_diff_append(
  p_changes jsonb,
  p_field text,
  p_label text,
  p_before jsonb,
  p_after jsonb
)
returns jsonb
language sql
immutable
as $$
  select case
    when p_before is not distinct from p_after then p_changes
    else p_changes || jsonb_build_array(
      jsonb_build_object(
        'field', p_field,
        'label', p_label,
        'before', p_before,
        'after', p_after
      )
    )
  end
$$;

create or replace function fn_asset_build_update_changes(old_row assets, new_row assets)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  v_old_category_name text;
  v_new_category_name text;
  v_old_manufacturer_name text;
  v_new_manufacturer_name text;
  v_old_location_code text;
  v_old_location_name text;
  v_new_location_code text;
  v_new_location_name text;
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
begin
  select c.name into v_old_category_name from asset_categories c where c.id = old_row.category_id;
  select c.name into v_new_category_name from asset_categories c where c.id = new_row.category_id;
  select m.name into v_old_manufacturer_name from manufacturers m where m.id = old_row.manufacturer_id;
  select m.name into v_new_manufacturer_name from manufacturers m where m.id = new_row.manufacturer_id;
  select l.code, l.name into v_old_location_code, v_old_location_name from locations l where l.id = old_row.location_id;
  select l.code, l.name into v_new_location_code, v_new_location_name from locations l where l.id = new_row.location_id;

  v_changes := fn_asset_diff_append(
    v_changes,
    'asset_tag',
    'Asset Tag',
    to_jsonb(old_row.asset_tag),
    to_jsonb(new_row.asset_tag)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'model',
    'Model',
    to_jsonb(old_row.model),
    to_jsonb(new_row.model)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'serial_number',
    'Serial Number',
    to_jsonb(old_row.serial_number),
    to_jsonb(new_row.serial_number)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'purchase_date',
    'Purchase Date',
    to_jsonb(old_row.purchase_date),
    to_jsonb(new_row.purchase_date)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'warranty_expiry',
    'Warranty Expiry',
    to_jsonb(old_row.warranty_expiry),
    to_jsonb(new_row.warranty_expiry)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'category',
    'Category',
    jsonb_build_object('id', old_row.category_id, 'name', v_old_category_name),
    jsonb_build_object('id', new_row.category_id, 'name', v_new_category_name)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'manufacturer',
    'Manufacturer',
    jsonb_build_object('id', old_row.manufacturer_id, 'name', v_old_manufacturer_name),
    jsonb_build_object('id', new_row.manufacturer_id, 'name', v_new_manufacturer_name)
  );
  v_changes := fn_asset_diff_append(
    v_changes,
    'location',
    'Location',
    jsonb_build_object('id', old_row.location_id, 'code', v_old_location_code, 'name', v_old_location_name),
    jsonb_build_object('id', new_row.location_id, 'code', v_new_location_code, 'name', v_new_location_name)
  );

  for v_key in
    select key
    from (
      select jsonb_object_keys(coalesce(old_row.custom_fields, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(new_row.custom_fields, '{}'::jsonb)) as key
    ) s
    order by key
  loop
    v_old_value := coalesce(old_row.custom_fields, '{}'::jsonb) -> v_key;
    v_new_value := coalesce(new_row.custom_fields, '{}'::jsonb) -> v_key;
    v_changes := fn_asset_diff_append(
      v_changes,
      format('custom_fields.%s', v_key),
      format('Custom Field: %s', v_key),
      v_old_value,
      v_new_value
    );
  end loop;

  for v_key in
    select key
    from (
      select jsonb_object_keys(coalesce(old_row.metadata, '{}'::jsonb)) as key
      union
      select jsonb_object_keys(coalesce(new_row.metadata, '{}'::jsonb)) as key
    ) s
    order by key
  loop
    v_old_value := coalesce(old_row.metadata, '{}'::jsonb) -> v_key;
    v_new_value := coalesce(new_row.metadata, '{}'::jsonb) -> v_key;
    v_changes := fn_asset_diff_append(
      v_changes,
      format('metadata.%s', v_key),
      format('Metadata: %s', v_key),
      v_old_value,
      v_new_value
    );
  end loop;

  return v_changes;
end;
$$;

create or replace function fn_internal_record_asset_event(
  p_asset_id uuid,
  p_event_type asset_event_type,
  p_payload jsonb default '{}'::jsonb,
  p_ip_address inet default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_asset_id is null then
    return;
  end if;

  if (v_payload ? 'schema_version') = false then
    v_payload := v_payload || jsonb_build_object('schema_version', 1);
  end if;
  v_payload := v_payload || jsonb_build_object('actor_snapshot', fn_asset_event_actor_snapshot());

  insert into asset_events (
    asset_id,
    event_type,
    actor_id,
    payload,
    ip_address,
    user_agent
  )
  values (
    p_asset_id,
    p_event_type,
    auth.uid(),
    v_payload,
    p_ip_address,
    nullif(trim(coalesce(p_user_agent, '')), '')
  );
end;
$$;

revoke all on function fn_internal_record_asset_event(uuid, asset_event_type, jsonb, inet, text)
from public;

create or replace function fn_assets_after_update_record_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes jsonb;
  v_old_deleted boolean := coalesce(old.is_deleted, false);
  v_new_deleted boolean := coalesce(new.is_deleted, false);
begin
  -- Exclude inventory status: assignment flows already track that through lifecycle events.
  if (
    row(
      old.category_id,
      old.manufacturer_id,
      old.model,
      old.serial_number,
      old.location_id,
      old.custom_fields,
      old.purchase_date,
      old.warranty_expiry,
      old.metadata,
      old.asset_tag,
      v_old_deleted,
      old.deleted_at
    ) is distinct from row(
      new.category_id,
      new.manufacturer_id,
      new.model,
      new.serial_number,
      new.location_id,
      new.custom_fields,
      new.purchase_date,
      new.warranty_expiry,
      new.metadata,
      new.asset_tag,
      v_new_deleted,
      new.deleted_at
    )
  ) then
    if (v_old_deleted = false and v_new_deleted = true) then
      perform fn_internal_record_asset_event(
        new.id,
        'asset_deleted'::asset_event_type,
        jsonb_build_object(
          'asset_tag', new.asset_tag,
          'deleted_at', new.deleted_at
        ),
        null,
        null
      );
    elsif (v_old_deleted = true and v_new_deleted = false) then
      perform fn_internal_record_asset_event(
        new.id,
        'asset_restored'::asset_event_type,
        jsonb_build_object(
          'asset_tag', new.asset_tag
        ),
        null,
        null
      );
    else
      v_changes := fn_asset_build_update_changes(old, new);
      perform fn_internal_record_asset_event(
        new.id,
        'asset_updated'::asset_event_type,
        jsonb_build_object(
          'asset_tag', new.asset_tag,
          'schema_version', 1,
          'changes', v_changes
        ),
        null,
        null
      );
    end if;
  end if;
  return new;
end;
$$;

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

  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
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
      'ok', true,
      'message', 'Asset already assigned to same employee',
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
begin
  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
  end if;

  select aa.id, aa.employee_id, e.employee_code, e.name
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
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'employee_id', v_employee_id,
      'employee_code', v_employee_code,
      'employee_name', v_employee_name,
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
    'status', 'in_stock',
    'message', 'Asset returned successfully'
  );
end;
$$;
