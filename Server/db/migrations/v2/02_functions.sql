-- 02_functions.sql
-- Database functions and triggers for AMS V2

set search_path = public;

create sequence if not exists asset_tag_seq start with 1 increment by 1;

create or replace function fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function fn_normalize_location_code(input_code text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(trim(coalesce(input_code, ''))), '[^A-Z0-9]+', '-', 'g'), '');
$$;

create or replace function fn_next_asset_tag()
returns text
language plpgsql
as $$
declare
  next_num bigint;
begin
  next_num := nextval('asset_tag_seq');
  return format('AST-%s', lpad(next_num::text, 5, '0'));
end;
$$;

create or replace function fn_assets_set_asset_tag()
returns trigger
language plpgsql
as $$
begin
  if new.asset_tag is null or trim(new.asset_tag) = '' then
    new.asset_tag := fn_next_asset_tag();
  end if;
  return new;
end;
$$;

create or replace function fn_validate_global_serial_uniqueness()
returns trigger
language plpgsql
as $$
declare
  serial_key text;
  exists_in_assets boolean;
  exists_in_components boolean;
begin
  serial_key := nullif(lower(trim(new.serial_number)), '');

  if serial_key is null then
    return new;
  end if;

  if tg_table_name = 'assets' then
    select exists(
      select 1
      from asset_components c
      where lower(trim(c.serial_number)) = serial_key
    ) into exists_in_components;

    if exists_in_components then
      raise exception 'Serial % already exists in asset_components', new.serial_number;
    end if;
  end if;

  if tg_table_name = 'asset_components' then
    select exists(
      select 1
      from assets a
      where lower(trim(a.serial_number)) = serial_key
    ) into exists_in_assets;

    if exists_in_assets then
      raise exception 'Serial % already exists in assets', new.serial_number;
    end if;
  end if;

  return new;
end;
$$;

create or replace function fn_sync_asset_status_from_assignments(p_asset_id uuid)
returns void
language plpgsql
as $$
begin
  update assets a
  set status = case
    when exists (
      select 1
      from asset_assignments aa
      where aa.asset_id = p_asset_id
        and aa.returned_at is null
    ) then 'assigned'::asset_status
    else 'in_stock'::asset_status
  end,
  updated_at = now()
  where a.id = p_asset_id;
end;
$$;

create or replace function fn_after_asset_assignment_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform fn_sync_asset_status_from_assignments(old.asset_id);
    return old;
  end if;

  perform fn_sync_asset_status_from_assignments(new.asset_id);

  if tg_op = 'UPDATE' and old.asset_id <> new.asset_id then
    perform fn_sync_asset_status_from_assignments(old.asset_id);
  end if;

  return new;
end;
$$;

create or replace function fn_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_name text;
  generated_employee_code text;
  allowed_domain text;
  email_domain text;
begin
  if new.email is null then
    return new;
  end if;

  allowed_domain := nullif(current_setting('app.allowed_email_domain', true), '');
  if allowed_domain is not null then
    email_domain := split_part(lower(new.email), '@', 2);
    if email_domain is distinct from lower(allowed_domain) then
      raise exception 'Email domain % is not allowed', email_domain;
    end if;
  end if;

  update employees e
  set auth_user_id = new.id,
      updated_at = now()
  where lower(e.email::text) = lower(new.email)
    and e.auth_user_id is null;

  if found then
    return new;
  end if;

  resolved_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  generated_employee_code := 'AUTO-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));

  insert into employees (
    employee_code,
    name,
    email,
    auth_user_id,
    is_active,
    metadata
  ) values (
    generated_employee_code,
    resolved_name,
    new.email,
    new.id,
    true,
    jsonb_build_object('source', 'auth', 'auto_created', true)
  )
  on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        updated_at = now();

  return new;
end;
$$;

create or replace function fn_claim_employee_auth_link()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_email text;
  v_employee_id uuid;
  v_existing_auth_user_id uuid;
  v_linked boolean := false;
begin
  v_auth_user_id := auth.uid();
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  if v_auth_user_id is null then
    return jsonb_build_object('ok', false, 'message', 'Not authenticated');
  end if;

  if v_email = '' then
    return jsonb_build_object('ok', false, 'message', 'Authenticated email missing');
  end if;

  select e.id, e.auth_user_id
  into v_employee_id, v_existing_auth_user_id
  from employees e
  where lower(e.email::text) = v_email
  limit 1;

  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'message', format('No employee profile found for %s', v_email));
  end if;

  if v_existing_auth_user_id is not null and v_existing_auth_user_id <> v_auth_user_id then
    return jsonb_build_object('ok', false, 'message', 'Employee profile is already linked to another auth user');
  end if;

  if v_existing_auth_user_id is distinct from v_auth_user_id then
    update employees
    set auth_user_id = v_auth_user_id,
        updated_at = now()
    where id = v_employee_id;

    v_linked := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'employee_id', v_employee_id,
    'linked', v_linked,
    'message', case when v_linked then 'Employee profile linked to current auth user' else 'Employee profile already linked' end
  );
end;
$$;

create or replace function fn_assign_asset(
  p_asset_tag text,
  p_employee_code text,
  p_assigned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_employee_id uuid;
  v_assignment_id uuid;
begin
  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
  end if;

  select id into v_employee_id
  from employees
  where employee_code = p_employee_code;

  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'message', format('Employee not found: %s', p_employee_code));
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
      'employee_code', p_employee_code,
      'status', 'assigned'
    );
  end if;

  update asset_assignments
  set returned_at = p_assigned_at,
      notes = coalesce(notes, '') || case when coalesce(notes, '') = '' then '' else E'\n' end || 'Auto-closed by reassignment',
      updated_at = now()
  where asset_id = v_asset_id
    and returned_at is null;

  insert into asset_assignments (asset_id, employee_id, assigned_at, returned_at, source, notes)
  values (v_asset_id, v_employee_id, p_assigned_at, null, coalesce(p_source, 'runtime'), p_notes)
  returning id into v_assignment_id;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'asset_id', v_asset_id,
    'asset_tag', p_asset_tag,
    'employee_id', v_employee_id,
    'employee_code', p_employee_code,
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
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_assignment_id uuid;
begin
  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
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
  where asset_id = v_asset_id
    and returned_at is null
  returning id into v_assignment_id;

  if v_assignment_id is null then
    return jsonb_build_object(
      'ok', false,
      'asset_id', v_asset_id,
      'asset_tag', p_asset_tag,
      'message', 'No open assignment found to return'
    );
  end if;

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

create or replace function fn_create_asset_with_log(
  p_asset_tag text default null,
  p_category_slug text default null,
  p_category_name text default null,
  p_manufacturer_name text default null,
  p_model text default null,
  p_serial_number text default null,
  p_location_code text default null,
  p_location_name text default null,
  p_status asset_status default null,
  p_purchase_date date default null,
  p_warranty_expiry date default null,
  p_custom_fields jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_log_note text default 'Auto-generated on asset creation',
  p_qr_code text default null,
  p_actor_employee_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_asset_tag text;
  v_category_slug text;
  v_category_name text;
  v_category_id uuid;
  v_manufacturer_name text;
  v_manufacturer_id uuid;
  v_location_code text;
  v_location_name text;
  v_location_id uuid;
  v_actor_employee_id uuid;
  v_log_id uuid;
begin
  v_category_slug := nullif(regexp_replace(lower(trim(coalesce(p_category_slug, ''))), '[^a-z0-9]+', '-', 'g'), '');
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

  select id into v_category_id
  from asset_categories
  where slug = v_category_slug;

  if v_category_id is null then
    return jsonb_build_object('ok', false, 'message', format('Category resolve failed: %s', v_category_slug));
  end if;

  v_manufacturer_name := nullif(trim(coalesce(p_manufacturer_name, '')), '');
  if v_manufacturer_name is not null then
    insert into manufacturers (name)
    values (v_manufacturer_name)
    on conflict (name) do nothing;

    select id into v_manufacturer_id
    from manufacturers
    where name = v_manufacturer_name;
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
    on conflict (code) do update
      set name = excluded.name,
          updated_at = now();

    select id into v_location_id
    from locations
    where code = v_location_code;
  end if;

  if nullif(trim(coalesce(p_actor_employee_code, '')), '') is not null then
    select id into v_actor_employee_id
    from employees
    where employee_code = trim(p_actor_employee_code);
  end if;

  v_asset_tag := nullif(trim(coalesce(p_asset_tag, '')), '');
  if v_asset_tag is null then
    v_asset_tag := fn_next_asset_tag();
  end if;

  insert into assets (
    asset_tag,
    category_id,
    manufacturer_id,
    model,
    serial_number,
    location_id,
    custom_fields,
    status,
    purchase_date,
    warranty_expiry,
    metadata
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

  insert into asset_logs (
    asset_id,
    actor_employee_id,
    note,
    qr_code,
    metadata
  ) values (
    v_asset_id,
    v_actor_employee_id,
    nullif(trim(coalesce(p_log_note, '')), ''),
    p_qr_code,
    jsonb_build_object('source', 'runtime_create')
  )
  returning id into v_log_id;

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'asset_tag', v_asset_tag,
    'log_id', v_log_id,
    'status', coalesce(p_status::text, 'in_stock'),
    'message', 'Asset created successfully'
  );
end;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments',
    'manufacturers',
    'locations',
    'asset_categories',
    'employees',
    'assets',
    'custom_field_definitions',
    'asset_components',
    'asset_assignments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = format('trg_%s_set_updated_at', t)
    ) THEN
      EXECUTE format('create trigger trg_%s_set_updated_at before update on %I for each row execute function fn_set_updated_at();', t, t);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assets_set_asset_tag') THEN
    CREATE TRIGGER trg_assets_set_asset_tag
    BEFORE INSERT ON assets
    FOR EACH ROW
    EXECUTE FUNCTION fn_assets_set_asset_tag();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assets_validate_global_serial') THEN
    CREATE TRIGGER trg_assets_validate_global_serial
    BEFORE INSERT OR UPDATE OF serial_number ON assets
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_global_serial_uniqueness();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_components_validate_global_serial') THEN
    CREATE TRIGGER trg_components_validate_global_serial
    BEFORE INSERT OR UPDATE OF serial_number ON asset_components
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_global_serial_uniqueness();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_asset_assignments_status_sync') THEN
    CREATE TRIGGER trg_asset_assignments_status_sync
    AFTER INSERT OR UPDATE OR DELETE ON asset_assignments
    FOR EACH ROW
    EXECUTE FUNCTION fn_after_asset_assignment_change();
  END IF;
END $$;

-- Sync the sequence with existing data if migrations are re-applied.
select setval(
  'asset_tag_seq',
  greatest(
    coalesce((select max(nullif(regexp_replace(asset_tag, '[^0-9]', '', 'g'), '')::bigint) from assets), 0),
    0
  ) + 1,
  false
);
