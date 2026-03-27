-- 12_employee_code_standardization.sql
-- Standardize employee codes to EMP0001 format and backfill existing rows.
set search_path = public;

create sequence if not exists employee_code_seq start with 1 increment by 1;

create or replace function fn_next_employee_code()
returns text
language plpgsql
as $$
declare
  next_num bigint;
begin
  next_num := nextval('employee_code_seq');
  return format('EMP%s', lpad(next_num::text, 4, '0'));
end;
$$;

-- Backfill all employees into deterministic EMP0001 style based on created_at/id order.
with ordered as (
  select
    e.id,
    row_number() over (order by e.created_at asc, e.id asc) as rn
  from employees e
)
update employees e
set employee_code = format('EMP%s', lpad(ordered.rn::text, 4, '0')),
    updated_at = now()
from ordered
where e.id = ordered.id;

-- Sync sequence to highest assigned numeric value.
select setval(
  'employee_code_seq',
  greatest(
    coalesce(
      (
        select max(
          nullif(regexp_replace(employee_code, '[^0-9]', '', 'g'), '')::bigint
        )
        from employees
        where employee_code ~ '^EMP[0-9]+$'
      ),
      0
    ),
    0
  ) + 1,
  false
);
