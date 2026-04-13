-- 36_seed_category_changes.sql
-- Removes sim + networking categories (if no assets use them).
-- Adds mouse, keyboard, wifi-dongle with optional custom field definitions.
-- Sets ALL custom_field_definitions.is_required = false (all template fields optional from now on).

set search_path = public;

-- ─── Remove old categories ────────────────────────────────────────────────────
-- Drop definitions first (no FK on assets → custom_field_definitions)
delete from custom_field_definitions
where category_id in (
  select id from asset_categories where slug in ('sim', 'networking')
);

-- Remove the categories themselves only when no assets reference them
delete from asset_categories
where slug in ('sim', 'networking')
  and id not in (
    select category_id from assets where category_id is not null
  );

-- ─── Add new categories ───────────────────────────────────────────────────────
insert into asset_categories (slug, name, description) values
  ('mouse',       'Mouse',        'Input devices — pointing'),
  ('keyboard',    'Keyboard',     'Input devices — keyboards'),
  ('wifi-dongle', 'Wi-Fi Dongle', 'USB Wi-Fi adapters')
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      updated_at  = now();

-- ─── Custom field definitions for new categories ──────────────────────────────
with defs as (
  select *
  from (values
    ('mouse',       'connectivity', 'Connectivity', 'text', false, 10, '[]'::jsonb),
    ('mouse',       'interface',    'Interface',    'text', false, 20, '[]'::jsonb),

    ('keyboard',    'layout',       'Layout',       'text', false, 10, '[]'::jsonb),
    ('keyboard',    'connectivity', 'Connectivity', 'text', false, 20, '[]'::jsonb),
    ('keyboard',    'interface',    'Interface',    'text', false, 30, '[]'::jsonb),

    ('wifi-dongle', 'standard',     'Standard',     'text', false, 10, '[]'::jsonb),
    ('wifi-dongle', 'usb_type',     'USB Type',     'text', false, 20, '[]'::jsonb)
  ) as x(slug, field_key, label, data_type, is_required, sort_order, options)
)
insert into custom_field_definitions (
  category_id, field_key, label, data_type, is_required, sort_order, options
)
select
  c.id,
  d.field_key,
  d.label,
  d.data_type::custom_field_data_type,
  d.is_required,
  d.sort_order,
  d.options
from defs d
join asset_categories c on c.slug = d.slug
on conflict (category_id, field_key) do update
  set label       = excluded.label,
      data_type   = excluded.data_type,
      is_required = excluded.is_required,
      sort_order  = excluded.sort_order,
      options     = excluded.options,
      updated_at  = now();

-- ─── All template fields are now optional ─────────────────────────────────────
update custom_field_definitions
set is_required = false, updated_at = now()
where is_required = true;
