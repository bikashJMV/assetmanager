-- 11_soft_delete_recycle_bin.sql
-- Soft-delete for employees/assets with centralized recycle-bin records.
set search_path = public;

alter table assets add column if not exists is_deleted boolean not null default false;
alter table assets add column if not exists deleted_at timestamptz;
alter table assets add column if not exists deleted_by_employee_id uuid references employees(id) on delete set null;

alter table employees add column if not exists is_deleted boolean not null default false;
alter table employees add column if not exists deleted_at timestamptz;
alter table employees add column if not exists deleted_by_employee_id uuid references employees(id) on delete set null;

create index if not exists ix_assets_is_deleted on assets(is_deleted);
create index if not exists ix_employees_is_deleted on employees(is_deleted);

create table if not exists recycle_bin_entries (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('asset', 'employee')),
  entity_id uuid not null,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  deleted_by_employee_id uuid not null references employees(id) on delete restrict,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by_employee_id uuid references employees(id) on delete set null
);

create index if not exists ix_recycle_bin_deleted_at on recycle_bin_entries(deleted_at desc);
create index if not exists ix_recycle_bin_open on recycle_bin_entries(restored_at) where restored_at is null;
create index if not exists ix_recycle_bin_entity on recycle_bin_entries(entity_type, entity_id);

create or replace function fn_soft_delete_asset(
  p_asset_id uuid,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_asset assets%rowtype;
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
    and coalesce(e.is_deleted, false) = false
  limit 1;

  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'message', 'Actor employee profile not found');
  end if;

  select * into v_asset
  from assets a
  where a.id = p_asset_id
  for update;

  if v_asset.id is null then
    return jsonb_build_object('ok', false, 'message', 'Asset not found');
  end if;

  if coalesce(v_asset.is_deleted, false) then
    return jsonb_build_object('ok', true, 'message', 'Asset already deleted');
  end if;

  update asset_assignments
  set returned_at = coalesce(returned_at, now()),
      notes = coalesce(notes, '') || case when coalesce(notes, '') = '' then '' else E'\n' end || 'Auto-returned by soft delete',
      updated_at = now()
  where asset_id = v_asset.id
    and returned_at is null;

  update assets
  set is_deleted = true,
      deleted_at = now(),
      deleted_by_employee_id = v_actor_id,
      status = 'disposed',
      updated_at = now()
  where id = v_asset.id;

  insert into recycle_bin_entries (
    entity_type,
    entity_id,
    label,
    payload,
    deleted_by_employee_id
  ) values (
    'asset',
    v_asset.id,
    coalesce(v_asset.asset_tag, 'Asset'),
    jsonb_build_object(
      'asset_tag', v_asset.asset_tag,
      'model', v_asset.model,
      'serial_number', v_asset.serial_number,
      'note', nullif(trim(coalesce(p_note, '')), '')
    ),
    v_actor_id
  )
  returning id into v_entry_id;

  return jsonb_build_object('ok', true, 'entry_id', v_entry_id, 'message', 'Asset moved to recycle bin');
end;
$$;

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
    and coalesce(e.is_deleted, false) = false
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

  if coalesce(v_employee.is_deleted, false) then
    return jsonb_build_object('ok', true, 'message', 'Employee already deleted');
  end if;

  if v_employee.id = v_actor_id then
    return jsonb_build_object('ok', false, 'message', 'You cannot delete your own profile');
  end if;

  update employees
  set is_deleted = true,
      is_active = false,
      deleted_at = now(),
      deleted_by_employee_id = v_actor_id,
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
    coalesce(v_employee.employee_code, 'Employee'),
    jsonb_build_object(
      'employee_code', v_employee.employee_code,
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
    and coalesce(e.is_deleted, false) = false
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
    set is_deleted = false,
        deleted_at = null,
        deleted_by_employee_id = null,
        is_active = true,
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
    e.employee_code as deleted_by_employee_code,
    e.name as deleted_by_employee_name
  from recycle_bin_entries r
  left join employees e on e.id = r.deleted_by_employee_id
  where r.restored_at is null
    and fn_is_admin_or_it_ops()
  order by r.deleted_at desc;
$$;

revoke all on function fn_soft_delete_asset(uuid, text) from public;
revoke all on function fn_soft_delete_employee(uuid, text) from public;
revoke all on function fn_restore_recycle_bin_entry(uuid) from public;
revoke all on function fn_list_recycle_bin_entries() from public;
grant execute on function fn_soft_delete_asset(uuid, text) to authenticated, service_role;
grant execute on function fn_soft_delete_employee(uuid, text) to authenticated, service_role;
grant execute on function fn_restore_recycle_bin_entry(uuid) to authenticated, service_role;
grant execute on function fn_list_recycle_bin_entries() to authenticated, service_role;
