-- 22_public_scan_holder_details.sql
-- Public QR: expose a tightly-scoped anonymous payload with holder details only for assigned assets.
-- Keeps qr_scanned event logging intact and preserves the same function signature.
set search_path = public;

create or replace function fn_public_scan_asset(p_asset_tag text, p_user_agent text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_asset_pk uuid;
  v_asset_tag text;
  v_status text;
  v_is_assigned boolean;
  v_holder_name text;
  v_holder_employee_code text;
  v_holder_department text;
  v_asset_name text;
begin
  select
    vi.id,
    vi.asset_tag,
    vi.status::text,
    (vi.assignment_id is not null) as is_assigned,
    vi.current_employee_name,
    vi.current_employee_code,
    vi.current_employee_department,
    coalesce(
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(trim(coalesce(vi.manufacturer_name, '')), ''),
            nullif(trim(coalesce(vi.model, '')), '')
          )
        ),
        ''
      ),
      nullif(trim(coalesce(vi.model, '')), ''),
      nullif(trim(coalesce(vi.category_name, '')), ''),
      nullif(trim(coalesce(vi.asset_tag, '')), '')
    )
  into
    v_asset_pk,
    v_asset_tag,
    v_status,
    v_is_assigned,
    v_holder_name,
    v_holder_employee_code,
    v_holder_department,
    v_asset_name
  from v_asset_inventory vi
  where vi.asset_tag = trim(coalesce(p_asset_tag, ''))
  limit 1;

  if v_asset_tag is null then
    return null;
  end if;

  perform fn_internal_record_asset_event(
    v_asset_pk,
    'qr_scanned'::asset_event_type,
    jsonb_build_object('asset_tag', v_asset_tag),
    null,
    p_user_agent
  );

  return jsonb_strip_nulls(
    jsonb_build_object(
      'asset_name', v_asset_name,
      'asset_tag', v_asset_tag,
      'status', v_status,
      'is_assigned', v_is_assigned,
      'holder_name', case when v_is_assigned then v_holder_name else null end,
      'holder_employee_code', case when v_is_assigned then v_holder_employee_code else null end,
      'holder_department', case when v_is_assigned then v_holder_department else null end
    )
  );
end;
$$;

revoke all on function fn_public_scan_asset(text, text) from public;
grant execute on function fn_public_scan_asset(text, text) to anon, authenticated, service_role;
