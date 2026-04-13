-- 28_delete_asset_permanent_rpc.sql
-- Hard-delete a soft-deleted asset and its recycle-bin row (child rows cascade from assets).
set search_path = public;

create or replace function fn_delete_asset_permanent(p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_asset assets%rowtype;
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

  select * into v_asset from assets where id = p_asset_id for update;
  if v_asset.id is null then
    return jsonb_build_object('ok', false, 'message', 'Asset not found');
  end if;

  if not coalesce(v_asset.is_deleted, false) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Asset must be in the Recycle Bin (soft-deleted) before permanent delete.'
    );
  end if;

  delete from recycle_bin_entries
  where entity_type = 'asset'
    and entity_id = p_asset_id
    and restored_at is null;

  delete from assets
  where id = p_asset_id;

  return jsonb_build_object('ok', true, 'message', 'Asset permanently deleted');
end;
$$;

revoke all on function fn_delete_asset_permanent(uuid) from public;
grant execute on function fn_delete_asset_permanent(uuid) to authenticated, service_role;
