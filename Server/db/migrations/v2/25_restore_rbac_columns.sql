-- 25_restore_rbac_columns.sql
-- Restore role and auth_user_id columns on employees table.
-- These were dropped in migration 23 but are required by all RBAC functions,
-- RLS policies, and the session-employee linking flow.

set search_path = public;

-- Step 1: Restore auth_user_id (nullable UUID, FK to auth.users)
alter table employees add column if not exists auth_user_id uuid;

-- Step 2: Restore role column with default 'employee'
alter table employees add column if not exists role text not null default 'employee';

-- Step 3: Add check constraint on role
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_employees_role'
  ) then
    alter table employees add constraint ck_employees_role
      check (role in ('employee', 'admin', 'it_ops'));
  end if;
end $$;

-- Step 4: Restore index on role
create index if not exists ix_employees_role on employees(role);

-- Step 5: Recreate fn_current_employee_role (uses auth_user_id + role)
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

-- Step 6: Recreate fn_is_it_ops
create or replace function fn_is_it_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_current_employee_role() = 'it_ops';
$$;

-- Step 7: Recreate fn_is_admin_or_it_ops
create or replace function fn_is_admin_or_it_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_role_rank(fn_current_employee_role()) >= 2;
$$;

-- Step 8: Recreate fn_is_admin
create or replace function fn_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_is_admin_or_it_ops();
$$;

-- Step 9: Recreate fn_set_employee_role
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
    from employees
    where role = 'it_ops' and is_active = true;

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
    'message', format('Role changed from %s to %s', v_target_role, v_resolved_role),
    'old_role', v_target_role,
    'new_role', v_resolved_role
  );
end;
$$;

-- Step 10: Restore RLS policy for self-read on employees
drop policy if exists employees_self_read on employees;
create policy employees_self_read on employees
for select to authenticated
using (auth.uid() = auth_user_id);

-- Step 11: Update v_asset_inventory to include role (if used by views)
-- The view was recreated in migration 23 without erp_active; role is not in that view.
-- No view change needed here.

-- Step 12: Grant permissions
revoke all on function fn_current_employee_role() from public;
revoke all on function fn_is_it_ops() from public;
revoke all on function fn_is_admin_or_it_ops() from public;
revoke all on function fn_is_admin() from public;
grant execute on function fn_current_employee_role() to authenticated, service_role;
grant execute on function fn_is_it_ops() to authenticated, service_role;
grant execute on function fn_is_admin_or_it_ops() to authenticated, service_role;
grant execute on function fn_is_admin() to authenticated, service_role;
