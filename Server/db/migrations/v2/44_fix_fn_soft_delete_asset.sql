-- 44_fix_fn_soft_delete_asset.sql
-- Fixes fn_soft_delete_asset to remove the reference to e.is_deleted, which was dropped from the employees table.
set search_path = public;

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
