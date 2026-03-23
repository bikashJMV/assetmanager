-- 01_tables.sql
-- Core normalized schema for AMS V2

create extension if not exists pgcrypto;
create extension if not exists citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
    CREATE TYPE asset_status AS ENUM ('in_stock', 'assigned', 'in_repair', 'retired', 'lost', 'disposed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'custom_field_data_type') THEN
    CREATE TYPE custom_field_data_type AS ENUM ('text', 'number', 'boolean', 'date', 'select', 'json');
  END IF;
END $$;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_departments_name unique (name)
);

create table if not exists manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_manufacturers_name unique (name)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  address text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_locations_code unique (code)
);

create table if not exists asset_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_asset_categories_slug unique (slug),
  constraint uq_asset_categories_name unique (name)
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null,
  name text not null,
  email citext,
  department_id uuid references departments(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_employees_employee_code unique (employee_code),
  constraint uq_employees_email unique (email),
  constraint uq_employees_auth_user_id unique (auth_user_id)
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text,
  category_id uuid not null references asset_categories(id),
  manufacturer_id uuid references manufacturers(id) on delete set null,
  model text,
  serial_number text,
  location_id uuid references locations(id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  status asset_status not null default 'in_stock',
  purchase_date date,
  warranty_expiry date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_assets_asset_tag unique (asset_tag),
  constraint uq_assets_serial_number unique (serial_number)
);

create index if not exists ix_assets_category_id on assets(category_id);
create index if not exists ix_assets_location_id on assets(location_id);
create index if not exists ix_assets_status on assets(status);
create index if not exists ix_assets_custom_fields_gin on assets using gin(custom_fields);

create table if not exists custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references asset_categories(id) on delete cascade,
  field_key text not null,
  label text not null,
  data_type custom_field_data_type not null default 'text',
  is_required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_custom_field_definitions_category_field unique (category_id, field_key)
);

create index if not exists ix_custom_field_definitions_category_id on custom_field_definitions(category_id);

create table if not exists asset_components (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  component_type text not null,
  manufacturer_id uuid references manufacturers(id) on delete set null,
  model text,
  serial_number text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_asset_components_serial_number unique (serial_number),
  constraint ck_asset_components_component_type check (
    component_type in ('ssd', 'hdd', 'screen', 'ram', 'battery', 'sim', 'networking', 'other')
  )
);

create index if not exists ix_asset_components_asset_id on asset_components(asset_id);
create index if not exists ix_asset_components_type on asset_components(component_type);

create table if not exists asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  source text not null default 'import',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_asset_assignments_dates check (returned_at is null or returned_at >= assigned_at)
);

create unique index if not exists ux_asset_assignments_one_open
  on asset_assignments(asset_id)
  where returned_at is null;

create index if not exists ix_asset_assignments_employee_id on asset_assignments(employee_id);
create index if not exists ix_asset_assignments_assigned_at on asset_assignments(assigned_at desc);

create table if not exists asset_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  actor_employee_id uuid references employees(id) on delete set null,
  note text,
  qr_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_asset_logs_asset_id on asset_logs(asset_id);
create index if not exists ix_asset_logs_created_at on asset_logs(created_at desc);
