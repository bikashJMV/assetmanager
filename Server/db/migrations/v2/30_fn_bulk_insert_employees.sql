-- 30_fn_bulk_insert_employees.sql
-- Atomic bulk insert: all rows in one transaction; any failure rolls back every insert.
set search_path = public;

create or replace function fn_bulk_insert_employees(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  el jsonb;
  v_inserted int := 0;
  v_max int := 500;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Not authenticated');
  end if;

  if not fn_is_admin_or_it_ops() then
    return jsonb_build_object('ok', false, 'message', 'Admin or IT Ops role required');
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Expected a JSON array of employee rows');
  end if;

  if jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', false, 'message', 'No rows to import');
  end if;

  if jsonb_array_length(p_rows) > v_max then
    return jsonb_build_object(
      'ok', false,
      'message', format('Too many rows (%s). Maximum is %s.', jsonb_array_length(p_rows), v_max)
    );
  end if;

  for el in select jsonb_array_elements(p_rows)
  loop
    insert into employees (
      employee_id,
      name,
      email,
      department,
      is_active,
      role
    ) values (
      trim(coalesce(el->>'employee_id', '')),
      trim(coalesce(el->>'name', '')),
      nullif(trim(coalesce(el->>'email', '')), ''),
      nullif(trim(coalesce(el->>'department', '')), ''),
      case
        when el->'is_active' is null or jsonb_typeof(el->'is_active') = 'null' then true
        when jsonb_typeof(el->'is_active') = 'boolean' then (el->'is_active')::text in ('true', 't', '1')
        when lower(trim(coalesce(el->>'is_active', ''))) in ('false', '0', 'no', 'n') then false
        when lower(trim(coalesce(el->>'is_active', ''))) in ('true', '1', 'yes', 'y') then true
        else true
      end,
      'employee'
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_inserted);
end;
$$;

revoke all on function fn_bulk_insert_employees(jsonb) from public;
grant execute on function fn_bulk_insert_employees(jsonb) to authenticated, service_role;
