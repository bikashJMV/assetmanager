-- 26_session_lookup_rpc.sql
-- Security definer RPC for session employee lookup.
-- Bypasses RLS so email fallback works even when auth_user_id is not yet linked.
-- Auto-provisions a new employee record on first OAuth sign-in when no row matches.
--
-- Prerequisite: run 25_restore_rbac_columns.sql first (employees.auth_user_id + employees.role).

set search_path = public;

create or replace function fn_get_session_employee(
  p_auth_uid uuid,
  p_email text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_new_id uuid;
  v_employee_id text;
  v_name text;
begin
  -- 1. Primary: lookup by auth_user_id
  select id, employee_id, name, email, is_active, role, department, auth_user_id
  into v_row
  from employees
  where auth_user_id = p_auth_uid
  limit 1;

  -- 2. Fallback: lookup by email
  if v_row is null and p_email is not null and trim(p_email) <> '' then
    select id, employee_id, name, email, is_active, role, department, auth_user_id
    into v_row
    from employees
    where lower(email) = lower(trim(p_email))
    limit 1;

    -- Auto-link auth_user_id on first email match
    if v_row is not null and v_row.auth_user_id is null then
      update employees
      set auth_user_id = p_auth_uid,
          updated_at = now()
      where id = v_row.id;
    end if;
  end if;

  -- 3. Auto-provision: create new employee from sign-in data
  if v_row is null and p_email is not null and trim(p_email) <> '' then
    v_name := coalesce(nullif(trim(p_display_name), ''), split_part(trim(p_email), '@', 1));
    v_employee_id := 'EMP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    begin
      insert into employees (employee_id, name, email, role, is_active, auth_user_id, department)
      values (
        v_employee_id,
        v_name,
        lower(trim(p_email)),
        'employee',
        true,
        p_auth_uid,
        'Unassigned'
      )
      returning id into v_new_id;
    exception
      when unique_violation then
        -- Race: another request created the row or unique email/auth_user_id
        select id, employee_id, name, email, is_active, role, department, auth_user_id
        into v_row
        from employees
        where auth_user_id = p_auth_uid
           or lower(email) = lower(trim(p_email))
        limit 1;
        if v_row is null then
          raise;
        end if;
    end;

    if v_row is null and v_new_id is not null then
      select id, employee_id, name, email, is_active, role, department, auth_user_id
      into v_row
      from employees
      where id = v_new_id;
    end if;
  end if;

  if v_row is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'employee_id', v_row.employee_id,
    'name', v_row.name,
    'email', v_row.email,
    'is_active', v_row.is_active,
    'role', v_row.role,
    'department', v_row.department
  );
end;
$$;

revoke all on function fn_get_session_employee(uuid, text, text) from public;
grant execute on function fn_get_session_employee(uuid, text, text) to authenticated, service_role;

