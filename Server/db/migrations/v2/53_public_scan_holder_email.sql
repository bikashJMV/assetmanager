-- 53_public_scan_holder_email.sql
--
-- Extend the public scan payload with holder_email while keeping existing
-- fields for backward compatibility.

set search_path = public;

create or replace function fn_public_scan_asset(p_asset_tag text, p_user_agent text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_asset_pk             uuid;
  v_asset_tag            text;
  v_status               text;
  v_is_assigned          boolean;
  v_holder_name          text;
  v_holder_employee_code text;
  v_holder_department    text;
  v_holder_email         text;
  v_category_name        text;
begin
  select
    vi.id,
    vi.asset_tag,
    vi.status::text,
    (vi.assignment_id is not null) as is_assigned,
    vi.current_employee_name,
    vi.current_employee_code,
    vi.current_employee_department,
    vi.current_employee_email,
    vi.category_name
  into
    v_asset_pk,
    v_asset_tag,
    v_status,
    v_is_assigned,
    v_holder_name,
    v_holder_employee_code,
    v_holder_department,
    v_holder_email,
    v_category_name
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
      'asset_tag',            v_asset_tag,
      'category_name',        v_category_name,
      'status',               v_status,
      'is_assigned',          v_is_assigned,
      'holder_name',          case when v_is_assigned then v_holder_name else null end,
      'holder_employee_code', case when v_is_assigned then v_holder_employee_code else null end,
      'holder_department',    case when v_is_assigned then v_holder_department else null end,
      'holder_email',         case when v_is_assigned then v_holder_email else null end
    )
  );
end;
$$;

revoke all on function fn_public_scan_asset(text, text) from public;
grant execute on function fn_public_scan_asset(text, text) to anon, authenticated, service_role;
