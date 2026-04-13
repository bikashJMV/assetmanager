-- 43_fix_fn_return_asset_employee_id.sql
-- Fix fn_return_asset to use employees.employee_id after migration 23
-- renamed employees.employee_code -> employees.employee_id.
-- Preserve the existing JSON payload key "employee_code" for compatibility.

set search_path = public;

create or replace function fn_return_asset(
  p_asset_tag text,
  p_returned_at timestamptz default now(),
  p_source text default 'runtime',
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_assignment_id uuid;
  v_employee_id uuid;
  v_employee_code text;
  v_employee_name text;
begin
  select id into v_asset_id
  from assets
  where asset_tag = p_asset_tag
    and coalesce(is_deleted, false) = false;

  if v_asset_id is null then
    return jsonb_build_object('ok', false, 'message', format('Asset not found: %s', p_asset_tag));
  end if;

  select aa.id, aa.employee_id, e.employee_id, e.name
  into v_assignment_id, v_employee_id, v_employee_code, v_employee_name
  from asset_assignments aa
  left join employees e on e.id = aa.employee_id
  where aa.asset_id = v_asset_id
    and aa.returned_at is null
  order by aa.assigned_at desc, aa.created_at desc
  limit 1;

  if v_assignment_id is null then
    return jsonb_build_object(
      'ok', false,
      'asset_id', v_asset_id,
      'asset_tag', p_asset_tag,
      'message', 'No open assignment found to return'
    );
  end if;

  update asset_assignments
  set returned_at = coalesce(p_returned_at, now()),
      source = coalesce(p_source, source),
      notes = coalesce(
        case
          when p_notes is null or btrim(p_notes) = '' then notes
          when notes is null or btrim(notes) = '' then p_notes
          else notes || E'\n' || p_notes
        end,
        notes
      ),
      updated_at = now()
  where id = v_assignment_id;

  perform fn_internal_record_asset_event(
    v_asset_id,
    'unassigned'::asset_event_type,
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'employee_id', v_employee_id,
      'employee_code', v_employee_code,
      'employee_name', v_employee_name,
      'asset_tag', p_asset_tag
    ),
    null,
    null
  );

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'asset_id', v_asset_id,
    'asset_tag', p_asset_tag,
    'status', 'in_stock',
    'message', 'Asset returned successfully'
  );
end;
$$;

revoke all on function fn_return_asset(text, timestamptz, text, text) from public;
grant execute on function fn_return_asset(text, timestamptz, text, text) to authenticated, service_role;
