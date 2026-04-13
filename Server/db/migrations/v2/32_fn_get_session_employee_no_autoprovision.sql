-- 32_fn_get_session_employee_no_autoprovision.sql
-- Stop auto-creating employees on OAuth sign-in. Deleted or unknown users get no row (client signs out).
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
begin
  select id, employee_id, name, email, is_active, role, department, auth_user_id
  into v_row
  from employees
  where auth_user_id = p_auth_uid
  limit 1;

  if v_row is null and p_email is not null and trim(p_email) <> '' then
    select id, employee_id, name, email, is_active, role, department, auth_user_id
    into v_row
    from employees
    where lower(email) = lower(trim(p_email))
    limit 1;

    if v_row is not null and v_row.auth_user_id is null then
      update employees
      set auth_user_id = p_auth_uid,
          updated_at = now()
      where id = v_row.id;
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
