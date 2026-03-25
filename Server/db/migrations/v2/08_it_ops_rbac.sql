-- 08_it_ops_rbac.sql
-- Canonical role hierarchy and privileged role workflow.
set search_path = public;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'role'
  ) then
    alter table employees add column role text;
  end if;
end $$;

update employees
set role = case
  when lower(coalesce(metadata ->> 'role', 'employee')) = 'admin' then 'admin'
  when lower(coalesce(metadata ->> 'role', 'employee')) = 'it_ops' then 'it_ops'
  else 'employee'
end
where role is null;

alter table employees alter column role set default 'employee';
alter table employees alter column role set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_employees_role'
  ) then
    alter table employees add constraint ck_employees_role check (role in ('employee', 'admin', 'it_ops'));
  end if;
end $$;

create index if not exists ix_employees_role on employees(role);

create or replace function fn_sync_employee_role_metadata()
returns trigger
language plpgsql
as $$
declare
  v_role text;
begin
  v_role := lower(coalesce(new.role, 'employee'));
  if v_role not in ('employee', 'admin', 'it_ops') then
    raise exception 'Invalid employee role: %', new.role;
  end if;

  new.role := v_role;
  new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{role}', to_jsonb(v_role), true);
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_employees_sync_role_metadata') then
    create trigger trg_employees_sync_role_metadata
    before insert or update of role, metadata on employees
    for each row
    execute function fn_sync_employee_role_metadata();
  end if;
end $$;

create or replace function fn_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_role, 'employee'))
    when 'it_ops' then 3
    when 'admin' then 2
    else 1
  end;
$$;

create or replace function fn_current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.role
      from employees e
      where e.auth_user_id = auth.uid()
        and e.is_active = true
      limit 1
    ),
    'employee'
  );
$$;

create or replace function fn_is_it_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_current_employee_role() = 'it_ops';
$$;

create or replace function fn_is_admin_or_it_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_role_rank(fn_current_employee_role()) >= 2;
$$;

create or replace function fn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_is_admin_or_it_ops();
$$;

revoke all on function fn_role_rank(text) from public;
revoke all on function fn_current_employee_role() from public;
revoke all on function fn_is_it_ops() from public;
revoke all on function fn_is_admin_or_it_ops() from public;
revoke all on function fn_is_admin() from public;
grant execute on function fn_role_rank(text) to authenticated, service_role;
grant execute on function fn_current_employee_role() to authenticated, service_role;
grant execute on function fn_is_it_ops() to authenticated, service_role;
grant execute on function fn_is_admin_or_it_ops() to authenticated, service_role;
grant execute on function fn_is_admin() to authenticated, service_role;

do $$ begin if not exists (
  select 1
  from pg_type
  where typname = 'role_audit_action'
) then create type role_audit_action as enum ('SET_ROLE');
end if;
end $$;

create table if not exists role_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_employee_id uuid not null references employees(id) on delete restrict,
  target_employee_id uuid not null references employees(id) on delete restrict,
  old_role text not null,
  new_role text not null,
  action role_audit_action not null default 'SET_ROLE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ck_role_audit_old_role check (old_role in ('employee', 'admin', 'it_ops')),
  constraint ck_role_audit_new_role check (new_role in ('employee', 'admin', 'it_ops'))
);

create index if not exists ix_role_audit_log_actor_employee_id on role_audit_log(actor_employee_id);
create index if not exists ix_role_audit_log_target_employee_id on role_audit_log(target_employee_id);
create index if not exists ix_role_audit_log_created_at on role_audit_log(created_at desc);

create or replace function fn_set_employee_role(
  p_target_employee_id uuid,
  p_new_role text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_employee_id uuid;
  v_actor_role text;
  v_target_role text;
  v_target_is_active boolean;
  v_resolved_role text := lower(coalesce(p_new_role, 'employee'));
  v_active_it_ops_count integer := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Not authenticated');
  end if;

  if v_resolved_role not in ('employee', 'admin', 'it_ops') then
    return jsonb_build_object('ok', false, 'message', 'Role must be employee, admin, or it_ops');
  end if;

  select e.id, e.role
  into v_actor_employee_id, v_actor_role
  from employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
  limit 1;

  if v_actor_employee_id is null then
    return jsonb_build_object('ok', false, 'message', 'Actor employee profile not found');
  end if;

  v_actor_role := lower(coalesce(v_actor_role, 'employee'));
  if v_actor_role not in ('admin', 'it_ops') then
    return jsonb_build_object('ok', false, 'message', 'Admin or IT Ops role required');
  end if;

  select e.role, e.is_active
  into v_target_role, v_target_is_active
  from employees e
  where e.id = p_target_employee_id
  for update;

  if v_target_role is null then
    return jsonb_build_object('ok', false, 'message', 'Target employee not found');
  end if;
  v_target_role := lower(v_target_role);

  -- Admin can manage only admin <-> employee transitions and cannot touch IT Ops users.
  if v_actor_role = 'admin' then
    if v_target_role = 'it_ops' then
      return jsonb_build_object('ok', false, 'message', 'Admins cannot modify IT Ops users');
    end if;
    if v_resolved_role not in ('employee', 'admin') then
      return jsonb_build_object('ok', false, 'message', 'Admins cannot assign IT Ops role');
    end if;
  end if;

  if v_actor_employee_id = p_target_employee_id and v_target_role = 'it_ops' and v_resolved_role <> 'it_ops' then
    return jsonb_build_object('ok', false, 'message', 'You cannot downgrade your own IT Ops role');
  end if;

  if v_target_role = v_resolved_role then
    return jsonb_build_object('ok', true, 'message', 'No role change needed', 'role', v_resolved_role);
  end if;

  if v_target_role = 'it_ops'
     and v_resolved_role <> 'it_ops'
     and coalesce(v_target_is_active, false) then
    select count(*)
    into v_active_it_ops_count
    from employees e
    where e.is_active = true
      and e.role = 'it_ops';

    if v_active_it_ops_count <= 1 then
      return jsonb_build_object('ok', false, 'message', 'Cannot remove the last active IT Ops user');
    end if;
  end if;

  update employees
  set role = v_resolved_role,
      updated_at = now()
  where id = p_target_employee_id;

  insert into role_audit_log (actor_employee_id, target_employee_id, old_role, new_role, metadata)
  values (
    v_actor_employee_id,
    p_target_employee_id,
    v_target_role,
    v_resolved_role,
    jsonb_build_object('source', 'fn_set_employee_role', 'by_auth_uid', auth.uid()) || coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Role updated successfully',
    'role', v_resolved_role
  );
end;
$$;

revoke all on function fn_set_employee_role(uuid, text, jsonb) from public;
grant execute on function fn_set_employee_role(uuid, text, jsonb) to authenticated, service_role;

alter table role_audit_log enable row level security;
drop policy if exists role_audit_log_service_all on role_audit_log;
create policy role_audit_log_service_all on role_audit_log
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
drop policy if exists role_audit_log_it_ops_read on role_audit_log;
create policy role_audit_log_it_ops_read on role_audit_log
for select to authenticated
using (fn_is_it_ops());

-- Keep legacy RPC for compatibility; route through canonical function.
create or replace function fn_set_employee_admin_status(
  p_target_employee_id uuid,
  p_is_admin boolean,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select fn_set_employee_role(
    p_target_employee_id,
    case when p_is_admin then 'admin' else 'employee' end,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('legacy_function', 'fn_set_employee_admin_status')
  );
$$;

revoke all on function fn_set_employee_admin_status(uuid, boolean, jsonb) from public;
grant execute on function fn_set_employee_admin_status(uuid, boolean, jsonb) to authenticated, service_role;

-- Employee scoped reads.
drop policy if exists assets_authenticated_read on assets;
create policy assets_authenticated_read on assets
for select to authenticated
using (
  fn_is_admin_or_it_ops()
  or exists (
    select 1
    from asset_assignments aa
    join employees me on me.id = aa.employee_id
    where aa.asset_id = assets.id
      and aa.returned_at is null
      and me.auth_user_id = auth.uid()
      and me.is_active = true
  )
);

drop policy if exists asset_components_authenticated_read on asset_components;
create policy asset_components_authenticated_read on asset_components
for select to authenticated
using (
  fn_is_admin_or_it_ops()
  or exists (
    select 1
    from asset_assignments aa
    join employees me on me.id = aa.employee_id
    where aa.asset_id = asset_components.asset_id
      and aa.returned_at is null
      and me.auth_user_id = auth.uid()
      and me.is_active = true
  )
);

drop policy if exists asset_assignments_authenticated_read on asset_assignments;
create policy asset_assignments_authenticated_read on asset_assignments
for select to authenticated
using (
  fn_is_admin_or_it_ops()
  or exists (
    select 1
    from employees me
    where me.id = asset_assignments.employee_id
      and me.auth_user_id = auth.uid()
      and me.is_active = true
  )
);

drop policy if exists asset_logs_authenticated_read on asset_logs;
create policy asset_logs_authenticated_read on asset_logs
for select to authenticated
using (
  fn_is_admin_or_it_ops()
  or exists (
    select 1
    from asset_assignments aa
    join employees me on me.id = aa.employee_id
    where aa.asset_id = asset_logs.asset_id
      and aa.returned_at is null
      and me.auth_user_id = auth.uid()
      and me.is_active = true
  )
);

drop policy if exists departments_admin_all on departments;
create policy departments_admin_all on departments
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists manufacturers_admin_all on manufacturers;
create policy manufacturers_admin_all on manufacturers
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists locations_admin_all on locations;
create policy locations_admin_all on locations
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists asset_categories_admin_all on asset_categories;
create policy asset_categories_admin_all on asset_categories
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists employees_admin_all on employees;
create policy employees_admin_all on employees
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists assets_admin_all on assets;
create policy assets_admin_all on assets
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists custom_field_definitions_admin_all on custom_field_definitions;
create policy custom_field_definitions_admin_all on custom_field_definitions
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists asset_components_admin_all on asset_components;
create policy asset_components_admin_all on asset_components
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists asset_assignments_admin_all on asset_assignments;
create policy asset_assignments_admin_all on asset_assignments
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists asset_logs_admin_all on asset_logs;
create policy asset_logs_admin_all on asset_logs
for all to authenticated
using (fn_is_admin_or_it_ops())
with check (fn_is_admin_or_it_ops());

drop policy if exists admin_audit_log_admin_read on admin_audit_log;
create policy admin_audit_log_admin_read on admin_audit_log
for select to authenticated
using (fn_is_it_ops());

-- Bootstrap seed (safe no-op if already exists):
-- set local app.bootstrap_it_ops_email = 'ops@example.com';
do $$
declare
  v_bootstrap_email text := nullif(current_setting('app.bootstrap_it_ops_email', true), '');
begin
  if v_bootstrap_email is not null then
    update employees
    set role = 'it_ops',
        is_active = true,
        updated_at = now()
    where lower(email::text) = lower(v_bootstrap_email);
  end if;
end $$;
