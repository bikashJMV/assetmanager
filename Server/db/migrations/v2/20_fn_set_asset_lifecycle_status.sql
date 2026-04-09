-- 20_fn_set_asset_lifecycle_status.sql
-- Controlled lifecycle status transitions for assets.
-- Handles auto-closing open assignments and audit event recording.
-- Rejects 'assigned' status (must go through fn_assign_asset).

set search_path = public;

create or replace function fn_set_asset_lifecycle_status(
  p_asset_tag text,
  p_new_status text,
  p_source text default 'bulk_update',
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_old_status text;
  v_new_status asset_status;
  v_closed_count int := 0;
  v_tag text := trim(coalesce(p_asset_tag, ''));
  rec record;
begin
  if nullif(v_tag, '') is null then
    return jsonb_build_object('ok', false, 'message', 'Asset tag is required');
  end if;

  if nullif(trim(coalesce(p_new_status, '')), '') is null then
    return jsonb_build_object('ok', false, 'message', 'New status is required');
  end if;

  if lower(trim(p_new_status)) = 'assigned' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Use fn_assign_asset to assign assets. Direct status change to "assigned" is not allowed.'
    );
  end if;

  begin
    v_new_status := lower(trim(p_new_status))::asset_status;
  exception when invalid_text_representation then
    return jsonb_build_object(
      'ok', false,
      'message', format('Invalid status: %s. Allowed: in_stock, in_repair, retired, lost, disposed.', p_new_status)
    );
  end;

  select id, status::text
  into v_asset_id, v_old_status
  from assets
  where asset_tag = v_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', v_tag));
  end if;

  if v_old_status = v_new_status::text then
    return jsonb_build_object(
      'ok', true,
      'asset_id', v_asset_id,
      'asset_tag', v_tag,
      'status', v_old_status,
      'message', format('Asset is already %s', v_old_status)
    );
  end if;

  for rec in
    select aa.id as assignment_id, aa.employee_id, e.employee_code, e.name as employee_name
    from asset_assignments aa
    left join employees e on e.id = aa.employee_id
    where aa.asset_id = v_asset_id
      and aa.returned_at is null
  loop
    update asset_assignments
    set returned_at = now(),
        notes = coalesce(notes, '') ||
          case when coalesce(notes, '') = '' then '' else E'\n' end ||
          format('Auto-closed: status changed to %s', v_new_status::text),
        updated_at = now()
    where id = rec.assignment_id;

    perform fn_internal_record_asset_event(
      v_asset_id,
      'unassigned'::asset_event_type,
      jsonb_build_object(
        'assignment_id', rec.assignment_id,
        'employee_id', rec.employee_id,
        'employee_code', rec.employee_code,
        'employee_name', rec.employee_name,
        'asset_tag', v_tag,
        'reason', format('Auto-closed: lifecycle status changed to %s', v_new_status::text)
      ),
      null,
      null
    );

    v_closed_count := v_closed_count + 1;
  end loop;

  update assets
  set status = v_new_status,
      updated_at = now()
  where id = v_asset_id;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'asset_updated'::asset_event_type,
    jsonb_build_object(
      'asset_tag', v_tag,
      'schema_version', 1,
      'source', coalesce(p_source, 'bulk_update'),
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'changes', jsonb_build_array(
        jsonb_build_object(
          'field', 'status',
          'label', 'Inventory Status',
          'before', to_jsonb(v_old_status),
          'after', to_jsonb(v_new_status::text)
        )
      ),
      'auto_closed_assignments', v_closed_count
    ),
    null,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'asset_id', v_asset_id,
    'asset_tag', v_tag,
    'old_status', v_old_status,
    'status', v_new_status::text,
    'auto_closed_assignments', v_closed_count,
    'message', format('Status changed from %s to %s', v_old_status, v_new_status::text)
  );
end;
$$;

revoke all on function fn_set_asset_lifecycle_status(text, text, text, text) from public;
grant execute on function fn_set_asset_lifecycle_status(text, text, text, text) to authenticated, service_role;
