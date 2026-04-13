-- 34_fix_fn_list_warranty_notifications.sql
-- The employees table has no is_deleted column; soft-deletes live in recycle_bin_entries.
-- Replace the invalid `coalesce(e.is_deleted, false) = false` guard with the
-- recycle_bin_entries pattern used everywhere else in the schema.
set search_path = public;

create or replace function fn_list_warranty_notifications(
  p_days integer default 30
)
returns table (
  notification_id text,
  asset_id uuid,
  asset_tag text,
  model text,
  category_name text,
  current_employee_id uuid,
  current_employee_name text,
  warranty_expiry date,
  days_remaining integer,
  severity text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me employees%rowtype;
  v_days integer := greatest(coalesce(p_days, 30), 1);
  v_is_privileged boolean := false;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Lookup the calling employee; exclude anyone in the recycle bin.
  select e.*
  into v_me
  from employees e
  where e.auth_user_id = auth.uid()
    and e.is_active = true
    and not exists (
      select 1
      from recycle_bin_entries r
      where r.entity_type = 'employee'
        and r.entity_id   = e.id
        and r.restored_at is null
    )
  limit 1;

  if v_me.id is null then
    return;
  end if;

  v_is_privileged := lower(coalesce(v_me.role, 'employee')) in ('admin', 'it_ops');

  return query
  select
    concat('warranty:', a.id::text, ':', a.warranty_expiry::text) as notification_id,
    a.id as asset_id,
    a.asset_tag,
    a.model,
    c.name as category_name,
    me.id as current_employee_id,
    me.name as current_employee_name,
    a.warranty_expiry,
    (a.warranty_expiry - current_date)::int as days_remaining,
    case
      when a.warranty_expiry < current_date then 'expired'
      else 'due_soon'
    end as severity,
    case
      when a.warranty_expiry < current_date then
        format('Warranty expired %s day(s) ago.', (current_date - a.warranty_expiry)::int)
      else
        format('Warranty expires in %s day(s).', (a.warranty_expiry - current_date)::int)
    end as message
  from assets a
  left join asset_categories c on c.id = a.category_id
  left join v_asset_inventory inv on inv.id = a.id
  left join employees me on me.id = inv.current_employee_id
  where a.warranty_expiry is not null
    and coalesce(a.is_deleted, false) = false
    and a.warranty_expiry <= current_date + v_days
    and (
      v_is_privileged
      or inv.current_employee_id = v_me.id
    )
  order by a.warranty_expiry asc, a.updated_at desc;
end;
$$;

revoke all on function fn_list_warranty_notifications(integer) from public;
grant execute on function fn_list_warranty_notifications(integer) to authenticated, service_role;
