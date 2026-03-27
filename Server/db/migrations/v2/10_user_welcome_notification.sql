-- 10_user_welcome_notification.sql
-- Show one welcome notification on first sign-in.
set search_path = public;

create or replace function fn_get_welcome_notification()
returns table (
  show_alert boolean,
  title text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
  v_employee employees%rowtype;
  v_name text;
  v_first_sign_in boolean := false;
begin
  if auth.uid() is null then
    return;
  end if;

  select *
  into v_user
  from auth.users
  where id = auth.uid()
  limit 1;

  if v_user.id is null then
    return;
  end if;

  select *
  into v_employee
  from employees e
  where e.auth_user_id = auth.uid()
  limit 1;

  v_name := nullif(trim(coalesce(v_employee.name, v_user.raw_user_meta_data ->> 'full_name', split_part(coalesce(v_user.email, ''), '@', 1))), '');
  if v_name is null then
    v_name := 'User';
  end if;

  if v_user.last_sign_in_at is null then
    v_first_sign_in := true;
  else
    v_first_sign_in := abs(extract(epoch from (v_user.last_sign_in_at - v_user.created_at))) <= 120;
  end if;

  return query
  select
    v_first_sign_in as show_alert,
    format('Welcome, %s!', v_name) as title,
    'Your account is ready. Start by reviewing notifications, then open assets and employee pages based on your access role.'::text as message;
end;
$$;

revoke all on function fn_get_welcome_notification() from public;
grant execute on function fn_get_welcome_notification() to authenticated, service_role;
