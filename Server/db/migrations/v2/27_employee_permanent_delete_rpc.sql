-- 27_employee_permanent_delete_rpc.sql
-- Permanent employee delete (clears FK-blocking rows) + fix actor lookup in soft-delete/restore (auth_user_id).
set search_path = public;

-- Fix actor resolution: employees.id must never be compared to auth.users.id.
create or replace function fn_soft_delete_employee(
  p_employee_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_employee employees%rowtype;
  v_entry_id uuid;
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

  select * into v_employee
  from employees e
  where e.id = p_employee_id
  for update;

  if v_employee.id is null then
    return jsonb_build_object('ok', false, 'message', 'Employee not found');
  end if;

  if v_employee.id = v_actor_id then
    return jsonb_build_object('ok', false, 'message', 'You cannot delete your own profile');
  end if;

  update employees
  set is_active = false,
      updated_at = now()
  where id = v_employee.id;

  insert into recycle_bin_entries (
    entity_type,
    entity_id,
    label,
    payload,
    deleted_by_employee_id
  ) values (
    'employee',
    v_employee.id,
    coalesce(v_employee.employee_id, 'Employee'),
    jsonb_build_object(
      'employee_id', v_employee.employee_id,
      'name', v_employee.name,
      'email', v_employee.email,
      'note', nullif(trim(coalesce(p_note, '')), '')
    ),
    v_actor_id
  )
  returning id into v_entry_id;

  return jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'message', 'Employee moved to recycle bin');
end;
$$;

create or replace function fn_restore_recycle_bin_entry(
  p_entry_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_entry recycle_bin_entries%rowtype;
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

  select * into v_entry
  from recycle_bin_entries r
  where r.id = p_entry_id
  for update;

  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'message', 'Recycle bin entry not found');
  end if;

  if v_entry.restored_at is not null then
    return jsonb_build_object('ok', true, 'message', 'Entry already restored');
  end if;

  if v_entry.entity_type = 'asset' then
    update assets
    set is_deleted = false,
        deleted_at = null,
        deleted_by_employee_id = null,
        status = case
          when exists (
            select 1 from asset_assignments aa
            where aa.asset_id = assets.id
              and aa.returned_at is null
          ) then 'assigned'::asset_status
          else 'in_stock'::asset_status
        end,
        updated_at = now()
    where id = v_entry.entity_id;
  elsif v_entry.entity_type = 'employee' then
    update employees
    set is_active = true,
        updated_at = now()
    where id = v_entry.entity_id;
  end if;

  update recycle_bin_entries
  set restored_at = now(),
      restored_by_employee_id = v_actor_id
  where id = v_entry.id;

  return jsonb_build_object('ok', true, 'message', 'Entry restored successfully');
end;
$$;

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
