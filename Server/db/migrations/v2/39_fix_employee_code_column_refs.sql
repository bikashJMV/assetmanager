-- 39_fix_employee_code_column_refs.sql
-- Migration 23 renamed employees.employee_code → employees.employee_id.
-- Two functions were missed and still reference the old column name, causing
-- "column e.employee_code does not exist" at runtime:
--
--   1. fn_set_asset_lifecycle_status  (migration 20) — breaks inventory status updates
--   2. fn_create_asset_with_log       (migration 13) — breaks asset creation when an
--                                                       explicit actor code is supplied

set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_set_asset_lifecycle_status
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

  -- auto-close any open assignments when moving to a non-assigned status
  for rec in
    select
      aa.id              as assignment_id,
      aa.employee_id,
      e.employee_id      as employee_code,   -- was e.employee_code (column renamed in migration 23)
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
      jsonb_build_object(
        'assignment_id',  rec.assignment_id,
        'employee_id',    rec.employee_id,
        'employee_code',  rec.employee_code,
        'employee_name',  rec.employee_name,
        'asset_tag',      v_tag,
        'reason',         format('Auto-closed: lifecycle status changed to %s', v_new_status::text)
      ),
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
    ),
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
-- 2. fn_create_asset_with_log
-- ─────────────────────────────────────────────────────────────────────────────
-- Only the actor-lookup line changes (employee_code → employee_id).
-- All other logic is identical to migration 13.
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

  -- actor lookup — use employee_id (renamed from employee_code in migration 23)
  if nullif(trim(coalesce(p_actor_employee_code, '')), '') is not null then
    select id into v_actor_employee_id
    from employees
    where employee_id = trim(p_actor_employee_code);
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

  perform fn_internal_record_asset_event(
    v_asset_id,
    'asset_created'::asset_event_type,
    jsonb_build_object('asset_tag', v_asset_tag, 'category_slug', v_category_slug),
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
