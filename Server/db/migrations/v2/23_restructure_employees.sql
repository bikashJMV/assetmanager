-- 23_restructure_employees.sql
-- Restructure employees table: rename employee_code to employee_id,
-- drop department_id, auth_user_id, role, erp_active, metadata,
-- is_deleted, deleted_at, deleted_by_employee_id, and add plain-text department column.
set search_path = public;

-- Step 1: Add new plain-text department column
alter table employees add column if not exists department text;

-- Step 2: Populate department from departments table using department_id
update employees
set department = d.name
from departments d
where employees.department_id = d.id;

-- Step 3: Rename employee_code to employee_id
alter table employees rename column employee_code to employee_id;

-- Step 4: Drop dependent views before dropping department_id
drop view if exists v_asset_inventory cascade;
drop view if exists v_assignment_anomalies cascade;

-- Step 5: Drop department_id foreign key column
alter table employees drop column if exists department_id cascade;

-- Step 6: Drop auth_user_id column
alter table employees drop column if exists auth_user_id cascade;

-- Step 7: Drop role column and its constraint
alter table employees drop constraint if exists ck_employees_role;
alter table employees drop column if exists role cascade;

-- Step 8: Drop erp_active column
alter table employees drop column if exists erp_active cascade;

-- Step 9: Drop metadata column
alter table employees drop column if exists metadata cascade;

-- Step 10: Drop soft-delete columns
alter table employees drop column if exists is_deleted cascade;
alter table employees drop column if exists deleted_at cascade;
alter table employees drop column if exists deleted_by_employee_id cascade;

-- Drop departments table (no longer needed)
DROP TABLE IF EXISTS departments CASCADE;

-- Step 11: Drop index on role (if exists)
drop index if exists ix_employees_role;

-- Step 12: Drop index on is_deleted (if exists)
drop index if exists ix_employees_is_deleted;

-- Step 13: Drop trigger that syncs role with metadata (if exists)
drop trigger if exists trg_employees_sync_role_metadata on employees;

-- Step 14: Recreate views with new schema

-- Update v_asset_inventory view
create or replace view v_asset_inventory as
select
  a.id,
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
  e.employee_id as current_employee_code,
  e.name as current_employee_name,
  e.email as current_employee_email,
  e.is_active as current_employee_is_active,
  e.department as current_employee_department,
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
where coalesce(a.is_deleted, false) = false;

-- Update v_assignment_anomalies view (remove erp_active references)
create or replace view v_assignment_anomalies as
select
  a.id as asset_id,
  a.asset_tag,
  count(*) filter (where aa.returned_at is null) as open_assignment_count,
  bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false))) as inactive_employee_holds_asset
from assets a
left join asset_assignments aa on aa.asset_id = a.id
left join employees e on e.id = aa.employee_id
group by a.id, a.asset_tag
having count(*) filter (where aa.returned_at is null) > 1
  or bool_or((aa.returned_at is null) and (not coalesce(e.is_active, false)));

-- Step 15: Update fn_public_scan_asset function (remove erp_active)
create or replace function fn_public_scan_asset(p_asset_tag text, p_user_agent text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(scan_row)
  from (
    select
      vi.asset_tag,
      vi.category_name as category,
      vi.manufacturer_name as manufacturer,
      vi.model,
      vi.status,
      vi.location_name as location,
      vi.current_employee_name as holder,
      coalesce(vi.custom_fields, '{}'::jsonb) as custom_fields
    from v_asset_inventory vi
    where vi.asset_tag = trim(coalesce(p_asset_tag, ''))
    limit 1
  ) scan_row;
$$;

-- Step 16: Update fn_assign_asset function (rename employee_code to employee_id in references)
DROP FUNCTION IF EXISTS fn_assign_asset(text,text,timestamptz,text,text);
create or replace function fn_assign_asset(
    p_asset_tag text,
    p_employee_id text,
    p_assigned_at timestamptz default now(),
    p_source text default 'runtime',
    p_notes text default null
  ) returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  v_asset_id uuid;
  v_employee_id uuid;
  v_assignment_id uuid;
  v_emp_active boolean;
  v_code_norm text := upper(trim(coalesce(p_employee_id, '')));
  v_at timestamptz := coalesce(p_assigned_at, now());
begin
  if v_code_norm = '' then
    return jsonb_build_object(
      'ok',
      false,
      'message',
      'Employee ID is required'
    );
  end if;
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
    coalesce(is_active, false) into v_employee_id,
      v_emp_active
  from employees
  where upper(trim(employee_id)) = v_code_norm;
  if v_employee_id is null then return jsonb_build_object(
    'ok',
    false,
    'message',
    format('Employee not found: %s', v_code_norm)
  );
  end if;
  if not v_emp_active then return jsonb_build_object(
    'ok',
    false,
    'message',
    'Employee is not active'
  );
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
    'employee_id_code',
    v_code_norm,
    'status',
    'assigned'
  );
  end if;
  update asset_assignments
  set returned_at = v_at,
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
    v_at,
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
      'employee_id',
      v_code_norm,
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
    'employee_id_code',
    v_code_norm,
    'status',
    'assigned',
    'message',
    'Asset assigned successfully'
  );
end;
$$;

-- Step 17: Update fn_list_recycle_bin_entries (rename employee_code to employee_id)
create or replace function fn_list_recycle_bin_entries()
returns table (
  entry_id uuid,
  entity_type text,
  entity_id uuid,
  label text,
  payload jsonb,
  deleted_at timestamptz,
  deleted_by_employee_id uuid,
  deleted_by_employee_code text,
  deleted_by_employee_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id as entry_id,
    r.entity_type,
    r.entity_id,
    r.label,
    r.payload,
    r.deleted_at,
    r.deleted_by_employee_id,
    e.employee_id as deleted_by_employee_code,
    e.name as deleted_by_employee_name
  from recycle_bin_entries r
  left join employees e on e.id = r.deleted_by_employee_id
  where r.restored_at is null
    and fn_is_admin_or_it_ops()
  order by r.deleted_at desc;
$$;

-- Step 18: Update fn_soft_delete_employee (rename employee_code to employee_id)
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
  where e.id = (
    select id from auth.users where id = auth.uid()
  )
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

-- Step 19: Update fn_restore_recycle_bin_entry (remove soft-delete column references)
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
  where e.id = (
    select id from auth.users where id = auth.uid()
  )
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

-- Step 20: Update fn_current_employee_role (remove auth_user_id reference)
create or replace function fn_current_employee_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'employee';
$$;

-- Step 21: Update fn_set_employee_role (remove auth_user_id reference)
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

  return jsonb_build_object('ok', false, 'message', 'Role-based access control has been removed');
end;
$$;

-- Step 22: Add comment on new department column
comment on column employees.department is 'Plain-text department name (replaces department_id foreign key)';

-- Step 23: Add comment on renamed employee_id column
comment on column employees.employee_id is 'Employee identifier (renamed from employee_code)';

-- Clear all employee data
DELETE FROM employees;
