-- 13_asset_audit_and_events.sql
-- Asset row audit (created_by / updated_by), append-only lifecycle events, assign guardrails, QR scan logging.
set search_path = public;
-- ---------------------------------------------------------------------------
-- Enum + table: immutable-style lifecycle log (no UPDATE/DELETE policies).
-- ---------------------------------------------------------------------------
do $$ begin if not exists (
  select 1
  from pg_type
  where typname = 'asset_event_type'
) then create type asset_event_type as enum (
  'asset_created',
  'asset_updated',
  'assigned',
  'unassigned',
  'qr_scanned'
);
end if;
end $$;
create table if not exists asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  event_type asset_event_type not null,
  actor_id uuid references auth.users(id) on delete
  set null,
    payload jsonb not null default '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz not null default now()
);
create index if not exists ix_asset_events_asset_id_created_at on asset_events(asset_id, created_at desc);
create index if not exists ix_asset_events_event_type on asset_events(event_type);
-- Internal writer: not granted to API roles; used only from SECURITY DEFINER routines.
create or replace function fn_internal_record_asset_event(
    p_asset_id uuid,
    p_event_type asset_event_type,
    p_payload jsonb default '{}'::jsonb,
    p_ip_address inet default null,
    p_user_agent text default null
  ) returns void language plpgsql security definer
set search_path = public as $$ begin if p_asset_id is null then return;
end if;
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
    coalesce(p_payload, '{}'::jsonb),
    p_ip_address,
    nullif(trim(coalesce(p_user_agent, '')), '')
  );
end;
$$;
revoke all on function fn_internal_record_asset_event(uuid, asset_event_type, jsonb, inet, text)
from public;
-- ---------------------------------------------------------------------------
-- assets: who created / last updated (client cannot forge; trigger enforces).
-- ---------------------------------------------------------------------------
alter table assets
add column if not exists created_by uuid references auth.users(id) on delete
set null;
alter table assets
add column if not exists updated_by uuid references auth.users(id) on delete
set null;
create or replace function fn_assets_enforce_audit_columns() returns trigger language plpgsql as $$ begin if tg_op = 'INSERT' then new.created_by := auth.uid();
new.updated_by := auth.uid();
elsif tg_op = 'UPDATE' then new.created_by := old.created_by;
new.updated_by := auth.uid();
end if;
return new;
end;
$$;
do $$ begin if not exists (
  select 1
  from pg_trigger
  where tgname = 'trg_assets_enforce_audit_columns'
) then create trigger trg_assets_enforce_audit_columns before
insert
  or
update on assets for each row execute function fn_assets_enforce_audit_columns();
end if;
end $$;
-- Log meaningful business-field changes (not audit-only churn).
create or replace function fn_assets_after_update_record_event() returns trigger language plpgsql security definer
set search_path = public as $$ begin -- Exclude inventory status: it is driven by assignment RPCs + sync trigger (assigned/unassigned events cover it).
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
      coalesce(old.is_deleted, false),
      old.deleted_at
    ) is distinct
    from row(
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
        coalesce(new.is_deleted, false),
        new.deleted_at
      )
  ) then perform fn_internal_record_asset_event(
    new.id,
    'asset_updated'::asset_event_type,
    jsonb_build_object(
      'asset_tag',
      new.asset_tag,
      'serial_number',
      new.serial_number
    ),
    null,
    null
  );
end if;
return new;
end;
$$;
do $$ begin if not exists (
  select 1
  from pg_trigger
  where tgname = 'trg_assets_after_update_record_event'
) then create trigger trg_assets_after_update_record_event
after
update on assets for each row execute function fn_assets_after_update_record_event();
end if;
end $$;
-- ---------------------------------------------------------------------------
-- RLS: asset_events — read for admin / IT ops only; no client mutations.
-- ---------------------------------------------------------------------------
alter table asset_events enable row level security;
drop policy if exists asset_events_service_all on asset_events;
create policy asset_events_service_all on asset_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists asset_events_admin_it_ops_read on asset_events;
create policy asset_events_admin_it_ops_read on asset_events for
select to authenticated using (fn_is_admin_or_it_ops());
grant select on asset_events to authenticated;
grant all on asset_events to service_role;
-- ---------------------------------------------------------------------------
-- fn_assign_asset: inactive / soft-deleted employee guard + event.
-- ---------------------------------------------------------------------------
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
begin
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
where employee_code = p_employee_code;
if v_employee_id is null then return jsonb_build_object(
  'ok',
  false,
  'message',
  format('Employee not found: %s', p_employee_code)
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
  p_employee_code,
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
    p_employee_code,
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
  p_employee_code,
  'status',
  'assigned',
  'message',
  'Asset assigned successfully'
);
end;
$$;
-- ---------------------------------------------------------------------------
-- fn_return_asset: lifecycle event.
-- ---------------------------------------------------------------------------
create or replace function fn_return_asset(
    p_asset_tag text,
    p_returned_at timestamptz default now(),
    p_source text default 'runtime',
    p_notes text default null
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_asset_id uuid;
v_assignment_id uuid;
begin
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
update asset_assignments
set returned_at = coalesce(p_returned_at, now()),
  source = coalesce(p_source, source),
  notes = coalesce(
    case
      when p_notes is null
      or btrim(p_notes) = '' then notes
      when notes is null
      or btrim(notes) = '' then p_notes
      else notes || E'\n' || p_notes
    end,
    notes
  ),
  updated_at = now()
where asset_id = v_asset_id
  and returned_at is null
returning id into v_assignment_id;
if v_assignment_id is null then return jsonb_build_object(
  'ok',
  false,
  'asset_id',
  v_asset_id,
  'asset_tag',
  p_asset_tag,
  'message',
  'No open assignment found to return'
);
end if;
perform fn_internal_record_asset_event(
  v_asset_id,
  'unassigned'::asset_event_type,
  jsonb_build_object(
    'assignment_id',
    v_assignment_id,
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
  'status',
  'in_stock',
  'message',
  'Asset returned successfully'
);
end;
$$;
-- ---------------------------------------------------------------------------
-- fn_create_asset_with_log: asset_created event after insert.
-- ---------------------------------------------------------------------------
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
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_asset_id uuid;
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
begin v_category_slug := nullif(
  regexp_replace(
    lower(trim(coalesce(p_category_slug, ''))),
    '[^a-z0-9]+',
    '-',
    'g'
  ),
  ''
);
if v_category_slug is null then return jsonb_build_object(
  'ok',
  false,
  'message',
  'category_slug is required'
);
end if;
v_category_name := nullif(trim(coalesce(p_category_name, '')), '');
if v_category_name is null then v_category_name := initcap(replace(v_category_slug, '-', ' '));
end if;
insert into asset_categories (slug, name)
values (v_category_slug, v_category_name) on conflict (slug) do nothing;
select id into v_category_id
from asset_categories
where slug = v_category_slug;
if v_category_id is null then return jsonb_build_object(
  'ok',
  false,
  'message',
  format('Category resolve failed: %s', v_category_slug)
);
end if;
v_manufacturer_name := nullif(trim(coalesce(p_manufacturer_name, '')), '');
if v_manufacturer_name is not null then
insert into manufacturers (name)
values (v_manufacturer_name) on conflict (name) do nothing;
select id into v_manufacturer_id
from manufacturers
where name = v_manufacturer_name;
end if;
v_location_code := fn_normalize_location_code(p_location_code);
if v_location_code is null then v_location_code := fn_normalize_location_code(p_location_name);
end if;
v_location_name := nullif(trim(coalesce(p_location_name, '')), '');
if v_location_name is null then v_location_name := coalesce(v_location_code, 'Unknown');
end if;
if v_location_code is not null then
insert into locations (code, name)
values (v_location_code, v_location_name) on conflict (code) do
update
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
v_asset_tag := fn_next_asset_tag();
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
  )
values (
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
returning id,
  asset_tag into v_asset_id,
  v_asset_tag;
perform fn_internal_record_asset_event(
  v_asset_id,
  'asset_created'::asset_event_type,
  jsonb_build_object(
    'asset_tag',
    v_asset_tag,
    'category_slug',
    v_category_slug
  ),
  null,
  null
);
insert into asset_logs (
    asset_id,
    actor_employee_id,
    note,
    qr_code,
    metadata
  )
values (
    v_asset_id,
    v_actor_employee_id,
    nullif(trim(coalesce(p_log_note, '')), ''),
    p_qr_code,
    jsonb_build_object('source', 'runtime_create')
  )
returning id into v_log_id;
return jsonb_build_object(
  'ok',
  true,
  'asset_id',
  v_asset_id,
  'asset_tag',
  v_asset_tag,
  'log_id',
  v_log_id,
  'status',
  coalesce(p_status::text, 'in_stock'),
  'message',
  'Asset created successfully'
);
end;
$$;
-- ---------------------------------------------------------------------------
-- Public scan: same payload as before + optional user_agent + qr_scanned event.
-- ---------------------------------------------------------------------------
drop function if exists fn_public_scan_asset(text);
create or replace function fn_public_scan_asset(p_asset_tag text, p_user_agent text default null) returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare v_asset_pk uuid;
v_asset_tag text;
v_category text;
v_manufacturer text;
v_model text;
v_status text;
v_location text;
v_holder text;
v_holder_erp text;
v_custom jsonb;
begin
select vi.id,
  vi.asset_tag,
  vi.category_name,
  vi.manufacturer_name,
  vi.model,
  vi.status::text,
  vi.location_name,
  vi.current_employee_name,
  case
    when vi.current_employee_id is null then 'N/A'
    when vi.current_employee_is_active then 'ERP Active'
    else 'ERP Inactive'
  end,
  coalesce(vi.custom_fields, '{}'::jsonb) into v_asset_pk,
  v_asset_tag,
  v_category,
  v_manufacturer,
  v_model,
  v_status,
  v_location,
  v_holder,
  v_holder_erp,
  v_custom
from v_asset_inventory vi
where vi.asset_tag = trim(coalesce(p_asset_tag, ''))
limit 1;
if v_asset_tag is null then return null;
end if;
perform fn_internal_record_asset_event(
  v_asset_pk,
  'qr_scanned'::asset_event_type,
  jsonb_build_object('asset_tag', v_asset_tag),
  null,
  p_user_agent
);
return jsonb_build_object(
  'asset_tag',
  v_asset_tag,
  'category',
  v_category,
  'manufacturer',
  v_manufacturer,
  'model',
  v_model,
  'status',
  v_status,
  'location',
  v_location,
  'holder',
  v_holder,
  'holder_erp_status',
  v_holder_erp,
  'custom_fields',
  v_custom
);
end;
$$;
-- Permissions: new signature (text, text)
revoke all on function fn_public_scan_asset(text, text)
from public;
grant execute on function fn_public_scan_asset(text, text) to anon,
  authenticated,
  service_role;
-- ---------------------------------------------------------------------------
-- Inventory view: surface audit columns for admin UI.
-- ---------------------------------------------------------------------------
create or replace view v_asset_inventory as
select a.id,
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
  a.updated_by
from assets a
  join asset_categories c on c.id = a.category_id
  left join manufacturers m on m.id = a.manufacturer_id
  left join locations l on l.id = a.location_id
  left join v_asset_current_assignment ca on ca.asset_id = a.id
  left join employees e on e.id = ca.employee_id
  left join departments d on d.id = e.department_id
where coalesce(a.is_deleted, false) = false
  and (
    e.id is null
    or coalesce(e.is_deleted, false) = false
  );