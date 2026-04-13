-- 38_fix_fn_asset_event_actor_snapshot.sql
-- Migration 23 dropped the `departments` table and converted department to a
-- plain-text column on employees.  fn_asset_event_actor_snapshot (migration 18)
-- still joins to the now-deleted `departments` table, causing
-- "relation departments does not exist" on every asset create/update.
-- Fix: replace the join with a direct read of e.department.

set search_path = public;

create or replace function fn_asset_event_actor_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_emp_id     uuid;
  v_code       text;
  v_name       text;
  v_department text;
begin
  if v_uid is null then
    return jsonb_build_object(
      'actor_id',             null,
      'actor_employee_id',    null,
      'actor_employee_code',  null,
      'actor_name',           null,
      'actor_department_name', null
    );
  end if;

  select
    e.id,
    e.employee_id,
    e.name,
    e.department          -- plain-text column (departments table was dropped in migration 23)
  into
    v_emp_id,
    v_code,
    v_name,
    v_department
  from employees e
  where e.auth_user_id = v_uid
  order by e.updated_at desc
  limit 1;

  return jsonb_build_object(
    'actor_id',              v_uid,
    'actor_employee_id',     v_emp_id,
    'actor_employee_code',   v_code,
    'actor_name',            v_name,
    'actor_department_name', v_department
  );
end;
$$;
