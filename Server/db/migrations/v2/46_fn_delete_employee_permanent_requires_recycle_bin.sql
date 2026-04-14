-- 46_fn_delete_employee_permanent_requires_recycle_bin.sql
-- Permanent employee delete is only allowed after a soft-delete (open Recycle Bin row).
-- Prevents bypassing the bin workflow from clients or scripts.
set search_path = public;

create or replace function fn_delete_employee_permanent(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_target employees%rowtype;
  v_count int;
  v_in_bin boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Not authenticated');
  end if;

  if not fn_is_admin_or_it_ops() then
    return jsonb_build_object('ok', false, 'message', 'Admin or IT Ops role required');
  end if;

  select e.id into v_actor_id
  from employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
  limit 1;

  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'message', 'Actor employee profile not found');
  end if;

  select * into v_target from employees where id = p_employee_id;
  if v_target.id is null then
    return jsonb_build_object('ok', false, 'message', 'Employee not found');
  end if;

  if v_target.id = v_actor_id then
    return jsonb_build_object('ok', false, 'message', 'You cannot delete your own profile');
  end if;

  select exists (
    select 1
    from recycle_bin_entries r
    where r.entity_type = 'employee'
      and r.entity_id = p_employee_id
      and r.restored_at is null
  ) into v_in_bin;

  if not coalesce(v_in_bin, false) then
    return jsonb_build_object(
      'ok', false,
      'message',
      'Employee must be in the Recycle Bin before permanent delete. Soft-delete from All Employees first, then purge from the Recycle Bin.'
    );
  end if;

  if coalesce(v_target.is_active, false)
     and lower(coalesce(v_target.role, 'employee')) = 'it_ops' then
    select count(*)::int into v_count
    from employees
    where role = 'it_ops' and is_active = true;

    if v_count <= 1 then
      return jsonb_build_object('ok', false, 'message', 'Cannot delete the last active IT Ops user');
    end if;
  end if;

  if coalesce(v_target.is_active, false)
     and lower(coalesce(v_target.role, 'employee')) = 'admin' then
    select count(*)::int into v_count
    from employees
    where role = 'admin' and is_active = true;

    if v_count <= 1 then
      return jsonb_build_object('ok', false, 'message', 'Cannot delete the last active admin');
    end if;
  end if;

  select count(*)::int into v_count
  from asset_assignments aa
  where aa.employee_id = p_employee_id
    and aa.returned_at is null;

  if v_count > 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Employee has open asset assignments; return or reassign those assets before permanent delete.'
    );
  end if;

  delete from role_audit_log
  where target_employee_id = p_employee_id
     or actor_employee_id = p_employee_id;

  delete from admin_audit_log
  where admin_id = p_employee_id
     or target_user_id = p_employee_id;

  delete from asset_assignments
  where employee_id = p_employee_id;

  delete from recycle_bin_entries
  where deleted_by_employee_id = p_employee_id
     or (entity_type = 'employee' and entity_id = p_employee_id);

  update asset_logs
  set actor_employee_id = null
  where actor_employee_id = p_employee_id;

  update assets
  set deleted_by_employee_id = null
  where deleted_by_employee_id = p_employee_id;

  delete from employees
  where id = p_employee_id;

  return jsonb_build_object('ok', true, 'message', 'Employee permanently deleted');
end;
$$;

revoke all on function fn_delete_employee_permanent(uuid) from public;
grant execute on function fn_delete_employee_permanent(uuid) to authenticated, service_role;
