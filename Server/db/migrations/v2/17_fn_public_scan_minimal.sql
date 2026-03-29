-- 17_fn_public_scan_minimal.sql
-- Public QR: return only basic identity + inventory status (no holder, location, ERP, custom_fields).
-- Restores plpgsql + qr_scanned event (migration 16 had replaced the function with a SQL-only body).
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
  v_category text;
  v_manufacturer text;
  v_model text;
  v_status text;
begin
  select
    vi.id,
    vi.asset_tag,
    vi.category_name,
    vi.manufacturer_name,
    vi.model,
    vi.status::text
  into
    v_asset_pk,
    v_asset_tag,
    v_category,
    v_manufacturer,
    v_model,
    v_status
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

  return jsonb_build_object(
    'asset_tag', v_asset_tag,
    'category', v_category,
    'manufacturer', v_manufacturer,
    'model', v_model,
    'status', v_status
  );
end;
$$;
