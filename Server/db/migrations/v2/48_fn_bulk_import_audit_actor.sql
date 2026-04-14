-- 48_fn_bulk_import_audit_actor.sql
-- Bulk Excel import: attribute asset_created lifecycle + asset_logs to the signed-in importer.
-- 1) fn_bulk_insert_assets passes employees.employee_id for auth.uid() once per RPC.
-- 2) fn_create_asset_with_log embeds actor_snapshot when actor resolves (matches fn_asset_event_actor_snapshot shape).
-- 3) fn_internal_record_asset_event keeps explicit actor_snapshot when actor_id is set (JWT snapshot can be empty in SECURITY DEFINER chains).

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- fn_internal_record_asset_event
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_snap    jsonb;
  v_actor   uuid;
begin
  if p_asset_id is null then
    return;
  end if;

  if (v_payload ? 'schema_version') = false then
    v_payload := v_payload || jsonb_build_object('schema_version', 1);
  end if;

  if (v_payload ? 'actor_snapshot')
     and jsonb_typeof(v_payload->'actor_snapshot') = 'object'
     and (
       nullif(trim(coalesce(v_payload->'actor_snapshot'->>'actor_id', '')), '') is not null
       or nullif(trim(coalesce(v_payload->'actor_snapshot'->>'actor_employee_id', '')), '') is not null
     ) then
    v_snap := v_payload->'actor_snapshot';
  else
    v_snap := fn_asset_event_actor_snapshot();
    v_payload := v_payload || jsonb_build_object('actor_snapshot', v_snap);
  end if;

  if (v_payload->'actor_snapshot') is distinct from v_snap then
    v_payload := (v_payload - 'actor_snapshot') || jsonb_build_object('actor_snapshot', v_snap);
  end if;

  v_actor := coalesce(
    auth.uid(),
    nullif(trim(coalesce(v_snap->>'actor_id', '')), '')::uuid
  );

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
    v_actor,
    v_payload,
    p_ip_address,
    nullif(trim(coalesce(p_user_agent, '')), '')
  );
end;
$$;

revoke all on function fn_internal_record_asset_event(uuid, asset_event_type, jsonb, inet, text)
from public;

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
  v_actor_auth_uid     uuid;
  v_actor_emp_id_text  text;
  v_actor_name         text;
  v_actor_dept         text;
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

  if v_actor_employee_id is not null then
    select e.auth_user_id, e.employee_id, e.name, e.department
    into v_actor_auth_uid, v_actor_emp_id_text, v_actor_name, v_actor_dept
    from employees e
    where e.id = v_actor_employee_id;

    v_actor_snapshot := jsonb_build_object(
      'actor_id',             v_actor_auth_uid,
      'actor_employee_id',    v_actor_employee_id,
      'actor_employee_code',  v_actor_emp_id_text,
      'actor_name',           v_actor_name,
      'actor_department_name', v_actor_dept
    );
  end if;

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
  if v_actor_employee_id is not null then
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
-- fn_bulk_insert_assets
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_bulk_insert_assets(p_rows jsonb)
returns table (payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  el                       jsonb;
  v_result                 jsonb;
  v_inserted               int  := 0;
  v_max                    int  := 500;
  v_status                 text;
  v_importer_employee_id   text;
begin
  if auth.uid() is null then
    return query select jsonb_build_object('ok', false, 'message', 'Not authenticated');
    return;
  end if;

  if not fn_is_admin_or_it_ops() then
    return query select jsonb_build_object('ok', false, 'message', 'Admin or IT Ops role required');
    return;
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return query select jsonb_build_object('ok', false, 'message', 'Expected a JSON array of asset rows');
    return;
  end if;

  if jsonb_array_length(p_rows) = 0 then
    return query select jsonb_build_object('ok', false, 'message', 'No rows to import');
    return;
  end if;

  if jsonb_array_length(p_rows) > v_max then
    return query select jsonb_build_object(
      'ok',      false,
      'message', format('Too many rows (%s). Maximum is %s.', jsonb_array_length(p_rows), v_max)
    );
    return;
  end if;

  select e.employee_id into v_importer_employee_id
  from employees e
  where e.auth_user_id = auth.uid()
  order by e.updated_at desc
  limit 1;

  for el in select jsonb_array_elements(p_rows)
  loop
    v_status := coalesce(nullif(trim(coalesce(el->>'status', '')), ''), 'in_stock');

    v_result := fn_create_asset_with_log(
      p_asset_tag           := null,
      p_category_slug       := nullif(trim(coalesce(el->>'category_slug',       '')), ''),
      p_category_name       := nullif(trim(coalesce(el->>'category_name',       '')), ''),
      p_manufacturer_name   := nullif(trim(coalesce(el->>'manufacturer_name',   '')), ''),
      p_model               := nullif(trim(coalesce(el->>'model',               '')), ''),
      p_serial_number       := nullif(trim(coalesce(el->>'serial_number',       '')), ''),
      p_location_code       := nullif(trim(coalesce(el->>'location_code',       '')), ''),
      p_location_name       := nullif(trim(coalesce(el->>'location_name',       '')), ''),
      p_status              := v_status::asset_status,
      p_purchase_date       := case
                                 when nullif(trim(coalesce(el->>'purchase_date', '')), '') is not null
                                 then (el->>'purchase_date')::date
                                 else null
                               end,
      p_warranty_expiry     := case
                                 when nullif(trim(coalesce(el->>'warranty_expiry', '')), '') is not null
                                 then (el->>'warranty_expiry')::date
                                 else null
                               end,
      p_custom_fields       := coalesce(el->'custom_fields', '{}'::jsonb),
      p_metadata            := coalesce(el->'metadata',      '{}'::jsonb),
      p_log_note            := 'Bulk import',
      p_qr_code             := null,
      p_actor_employee_code := v_importer_employee_id
    );

    if not coalesce((v_result->>'ok')::boolean, false) then
      raise exception 'Row % failed: %',
        v_inserted + 1,
        coalesce(v_result->>'message', 'Unknown error');
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return query
  select jsonb_build_object('ok', true, 'inserted', v_inserted);
end;
$$;

revoke all on function fn_bulk_insert_assets(jsonb) from public;
grant execute on function fn_bulk_insert_assets(jsonb) to authenticated, service_role;
