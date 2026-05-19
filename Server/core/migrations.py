# Server/core/migrations.py
import logging
from core.postgres import get_pg_pool

logger = logging.getLogger("migrations")

MIGRATION_001_ADD_ALIAS_CODE = """
-- Add columns if they do not exist
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS alias_code VARCHAR(3);
ALTER TABLE asset_categories ADD COLUMN IF NOT EXISTS last_used_number INT NOT NULL DEFAULT 0;

-- Seed known categories (only if alias_code is NULL to keep it idempotent)
UPDATE asset_categories SET alias_code = 'LAP' WHERE slug = 'laptop' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'DES' WHERE slug = 'desktop' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'WKS' WHERE slug = 'workstation' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'SRV' WHERE slug = 'server' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'TAB' WHERE slug = 'tablet' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'PHN' WHERE slug = 'mobile_phone' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'MON' WHERE slug = 'monitor' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'KBD' WHERE slug = 'keyboard' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'MSE' WHERE slug = 'mouse' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'WBC' WHERE slug = 'webcam' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'HDS' WHERE slug = 'headset' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'SPK' WHERE slug = 'speaker' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'MIC' WHERE slug = 'microphone' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'STV' WHERE slug = 'smart_tv' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'PRT' WHERE slug = 'printer' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'SCN' WHERE slug = 'scanner' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'MCH' WHERE slug = 'machinery' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'CBN' WHERE slug = 'cabinet' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'TLS' WHERE slug = 'tools' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'PSU' WHERE slug = 'power_supply' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'WLD' WHERE slug = 'welding' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'CMP' WHERE slug = 'compressor' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'CHR' WHERE slug = 'chair' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'DSK' WHERE slug = 'desk' AND alias_code IS NULL;
UPDATE asset_categories SET alias_code = 'TBL' WHERE slug = 'table' AND alias_code IS NULL;

-- Insert OTH fallback category sentinel if missing
INSERT INTO asset_categories (name, slug, alias_code, is_active, last_used_number)
VALUES ('Other', 'other', 'OTH', true, 0)
ON CONFLICT (slug) DO UPDATE SET alias_code = 'OTH';

-- Ensure all NULL records (any custom unmapped categories) fallback to OTH
UPDATE asset_categories SET alias_code = 'OTH' WHERE alias_code IS NULL;

-- Enforce NOT NULL constraint
ALTER TABLE asset_categories ALTER COLUMN alias_code SET NOT NULL;
"""

MIGRATION_002_REPLACE_TAG_FUNCTION = """
-- Rename old sequence function to legacy if it exists and has no parameters
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_next_asset_tag'
      AND pg_get_function_arguments(oid) IN ('', 'void')
  ) THEN
    ALTER FUNCTION fn_next_asset_tag() RENAME TO fn_next_asset_tag_legacy;
  END IF;
END;
$$;

-- Create alias-based generation function (atomic, no loop — app layer retries on UniqueViolationError)
CREATE OR REPLACE FUNCTION fn_next_asset_tag(p_alias VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_next_num INT;
BEGIN
  UPDATE asset_categories
     SET last_used_number = last_used_number + 1
   WHERE UPPER(alias_code) = UPPER(p_alias)
  RETURNING last_used_number INTO v_next_num;

  IF v_next_num IS NULL THEN
    RAISE EXCEPTION 'Unknown alias_code: %', p_alias;
  END IF;

  RETURN 'JMV-' || UPPER(p_alias) || '-' || LTRIM(TO_CHAR(v_next_num, '00000'));
END;
$$ LANGUAGE plpgsql;

-- Create alias-based read-only preview function
CREATE OR REPLACE FUNCTION fn_peek_next_asset_tag(p_alias VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_next_num INT;
  v_tag VARCHAR;
  v_exists BOOLEAN;
BEGIN
  -- Read-only preview
  SELECT last_used_number + 1 INTO v_next_num
    FROM asset_categories
   WHERE UPPER(alias_code) = UPPER(p_alias);

  IF v_next_num IS NULL THEN
    p_alias := 'OTH';
    SELECT last_used_number + 1 INTO v_next_num
      FROM asset_categories
     WHERE UPPER(alias_code) = 'OTH';
  END IF;

  v_tag := 'JMV-' || UPPER(p_alias) || '-' || LTRIM(TO_CHAR(v_next_num, '00000'));

  -- Loop to preview the next truly available unused slot
  LOOP
    SELECT EXISTS(SELECT 1 FROM assets WHERE asset_tag = v_tag) INTO v_exists;
    IF NOT v_exists THEN
      EXIT;
    END IF;

    v_next_num := v_next_num + 1;
    v_tag := 'JMV-' || UPPER(p_alias) || '-' || LTRIM(TO_CHAR(v_next_num, '00000'));
  END LOOP;

  RETURN v_tag;
END;
$$ LANGUAGE plpgsql;
"""

MIGRATION_003_QR_TABLES = """
-- Create qr_batches table if not exists
CREATE TABLE IF NOT EXISTS qr_batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code            VARCHAR(20) UNIQUE NOT NULL,
  alias_code            VARCHAR(3) NOT NULL,
  idempotency_key       VARCHAR(100) UNIQUE,
  requested_count       INT NOT NULL,
  start_tag             VARCHAR(13),
  end_tag               VARCHAR(13),
  status                VARCHAR(20) DEFAULT 'generated',
  created_by_employee_id UUID REFERENCES employees(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  metadata              JSONB
);

-- Create qr_tag_reservations table if not exists
CREATE TABLE IF NOT EXISTS qr_tag_reservations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id              UUID NOT NULL REFERENCES qr_batches(id) ON DELETE CASCADE,
  asset_tag             VARCHAR(13) UNIQUE NOT NULL,
  status                VARCHAR(20) DEFAULT 'reserved',
  consumed_by_asset_id  UUID REFERENCES assets(id) ON DELETE SET NULL,
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qr_reservations_asset_tag ON qr_tag_reservations(asset_tag);
CREATE INDEX IF NOT EXISTS idx_qr_reservations_status ON qr_tag_reservations(status);

-- Add columns to assets table if they do not exist
ALTER TABLE assets ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'direct';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS qr_reservation_id UUID REFERENCES qr_tag_reservations(id) ON DELETE SET NULL;
"""

MIGRATION_004_ASSET_DEPARTMENT = """
-- Add nullable department_id to assets table if it doesn't exist
ALTER TABLE assets ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Create asset_department_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS asset_department_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  from_dept_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  to_dept_id    UUID REFERENCES departments(id) ON DELETE SET NULL,
  changed_by    UUID REFERENCES employees(id) ON DELETE SET NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate view v_asset_inventory to join asset's own department directly
DROP VIEW IF EXISTS public.v_asset_inventory;
CREATE VIEW public.v_asset_inventory AS
 SELECT a.id,
    a.asset_tag,
    a.serial_number,
    a.model,
    a.status,
    a.purchase_date,
    a.warranty_expiry,
    a.custom_fields,
    a.metadata,
    a.is_deleted,
    a.created_at,
    a.updated_at,
    a.created_by,
    a.updated_by,
    c.id AS category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    c.alias_code AS category_alias_code,
    m.id AS manufacturer_id,
    m.name AS manufacturer_name,
    l.id AS location_id,
    l.name AS location_name,
    l.code AS location_code,
    aa.id AS assignment_id,
    e.id AS current_employee_id,
    e.employee_id AS current_employee_business_id,
    e.name AS current_employee_name,
    e.email AS current_employee_email,
    aa.assigned_at,
    -- holder department (unchanged)
    d.name AS current_employee_department,
    -- asset direct department
    a.department_id AS asset_department_id,
    ad.name AS asset_department_name,
    a.source,
    a.qr_reservation_id
   FROM public.assets a
     LEFT JOIN public.asset_categories c ON c.id = a.category_id
     LEFT JOIN public.manufacturers m ON m.id = a.manufacturer_id
     LEFT JOIN public.locations l ON l.id = a.location_id
     LEFT JOIN public.departments ad ON ad.id = a.department_id
     LEFT JOIN public.asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
     LEFT JOIN public.employees e ON e.id = aa.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id;
"""

# Migration 005 is split into two parts:
#   MIGRATION_005_ALTER_TYPE  — ALTER TYPE ADD VALUE (must run outside a transaction on PG ≤ 12)
#   MIGRATION_005_QR_UNLINKED — remaining DDL/DML (runs in its own transaction)

MIGRATION_005_ALTER_TYPE = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumlabel = 'asset_dept_auto_updated'
                   AND enumtypid = 'asset_event_type'::regtype) THEN
    ALTER TYPE asset_event_type ADD VALUE 'asset_dept_auto_updated';
  END IF;
END$$;
"""

MIGRATION_005_QR_UNLINKED = """
-- Drop tag-related columns from qr_batches (no longer assigned at batch time)
ALTER TABLE qr_batches DROP COLUMN IF EXISTS alias_code;
ALTER TABLE qr_batches DROP COLUMN IF EXISTS start_tag;
ALTER TABLE qr_batches DROP COLUMN IF EXISTS end_tag;

-- Make asset_tag nullable on qr_tag_reservations (populated only when linked)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name='qr_tag_reservations' AND column_name='asset_tag'
               AND is_nullable = 'NO') THEN
    ALTER TABLE qr_tag_reservations ALTER COLUMN asset_tag DROP NOT NULL;
  END IF;
END$$;
ALTER TABLE qr_tag_reservations DROP CONSTRAINT IF EXISTS qr_tag_reservations_asset_tag_key;

-- Drop old status check constraint, rename values, add new constraint
ALTER TABLE qr_tag_reservations DROP CONSTRAINT IF EXISTS qr_tag_reservations_status_check;
UPDATE qr_tag_reservations SET status = 'unlinked' WHERE status = 'reserved';
UPDATE qr_tag_reservations SET status = 'linked'   WHERE status = 'consumed';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_schema = 'public' AND constraint_name = 'qr_tag_reservations_status_check') THEN
    ALTER TABLE qr_tag_reservations ADD CONSTRAINT qr_tag_reservations_status_check CHECK (status IN ('unlinked', 'linked'));
  END IF;
END$$;

-- Rename consumed_by_asset_id -> asset_id (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name='qr_tag_reservations' AND column_name='consumed_by_asset_id') THEN
    ALTER TABLE qr_tag_reservations RENAME COLUMN consumed_by_asset_id TO asset_id;
  END IF;
END$$;

-- Rename consumed_at -> linked_at (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name='qr_tag_reservations' AND column_name='consumed_at') THEN
    ALTER TABLE qr_tag_reservations RENAME COLUMN consumed_at TO linked_at;
  END IF;
END$$;

-- Rebuild indexes
DROP INDEX IF EXISTS idx_qr_reservations_asset_tag;
DROP INDEX IF EXISTS idx_qr_reservations_status;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_reservations_asset_tag ON qr_tag_reservations(asset_tag) WHERE asset_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_reservations_status ON qr_tag_reservations(status);

-- Recreate v_asset_inventory to ensure assignment_id and assigned_at are present
DROP VIEW IF EXISTS public.v_asset_inventory;
CREATE VIEW public.v_asset_inventory AS
 SELECT a.id,
    a.asset_tag,
    a.serial_number,
    a.model,
    a.status,
    a.purchase_date,
    a.warranty_expiry,
    a.custom_fields,
    a.metadata,
    a.is_deleted,
    a.created_at,
    a.updated_at,
    a.created_by,
    a.updated_by,
    c.id AS category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    c.alias_code AS category_alias_code,
    m.id AS manufacturer_id,
    m.name AS manufacturer_name,
    l.id AS location_id,
    l.name AS location_name,
    l.code AS location_code,
    aa.id AS assignment_id,
    e.id AS current_employee_id,
    e.employee_id AS current_employee_business_id,
    e.name AS current_employee_name,
    e.email AS current_employee_email,
    aa.assigned_at,
    d.name AS current_employee_department,
    a.department_id AS asset_department_id,
    ad.name AS asset_department_name,
    a.source,
    a.qr_reservation_id
   FROM public.assets a
     LEFT JOIN public.asset_categories c ON c.id = a.category_id
     LEFT JOIN public.manufacturers m ON m.id = a.manufacturer_id
     LEFT JOIN public.locations l ON l.id = a.location_id
     LEFT JOIN public.departments ad ON ad.id = a.department_id
     LEFT JOIN public.asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
     LEFT JOIN public.employees e ON e.id = aa.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id;
"""

MIGRATION_008_EVENT_TYPES = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumlabel = 'qr_reservation_linked'
                   AND enumtypid = 'asset_event_type'::regtype) THEN
    ALTER TYPE asset_event_type ADD VALUE 'qr_reservation_linked';
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum
                 WHERE enumlabel = 'asset_assignment_blocked'
                   AND enumtypid = 'asset_event_type'::regtype) THEN
    ALTER TYPE asset_event_type ADD VALUE 'asset_assignment_blocked';
  END IF;
END$$;
"""

MIGRATION_007_ALIAS_CODES = """
-- Fix missing alias codes for slugs that were assigned OTH by migration 001 fallback
UPDATE asset_categories SET alias_code = 'MOB' WHERE slug = 'mobile'    AND alias_code = 'OTH';
UPDATE asset_categories SET alias_code = 'LCK' WHERE slug = 'locker'    AND alias_code = 'OTH';
UPDATE asset_categories SET alias_code = 'PND' WHERE slug = 'pen-drive' AND alias_code = 'OTH';
"""

MIGRATION_006_DROP_COLUMNS = """
-- Migration 006: Drop Deprecated Employee Columns
-- Drop legacy columns is_active and is_deleted from employees table.
-- Update depending views to preserve current_employee_is_active and is_active as virtual constants (true).

-- 1. Drop dependent views first
DROP VIEW IF EXISTS public.v_asset_inventory CASCADE;
DROP VIEW IF EXISTS public.v_employee_directory CASCADE;

-- 2. Drop the deprecated columns
ALTER TABLE public.employees DROP COLUMN IF EXISTS is_active;
ALTER TABLE public.employees DROP COLUMN IF EXISTS is_deleted;

-- 3. Recreate v_asset_inventory — complete definition (M004 columns + M006 virtual is_active)
CREATE OR REPLACE VIEW public.v_asset_inventory AS
 SELECT a.id,
    a.asset_tag,
    a.serial_number,
    a.model,
    a.status,
    a.purchase_date,
    a.warranty_expiry,
    a.custom_fields,
    a.metadata,
    a.is_deleted,
    a.created_at,
    a.updated_at,
    a.created_by,
    a.updated_by,
    c.id AS category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    c.alias_code AS category_alias_code,
    m.id AS manufacturer_id,
    m.name AS manufacturer_name,
    l.id AS location_id,
    l.name AS location_name,
    l.code AS location_code,
    aa.id AS assignment_id,
    e.id AS current_employee_id,
    e.employee_id AS current_employee_business_id,
    e.name AS current_employee_name,
    e.email AS current_employee_email,
    aa.assigned_at,
    true AS current_employee_is_active,
    e.erp_active AS current_employee_erp_active,
    d.name AS current_employee_department,
    a.department_id AS asset_department_id,
    ad.name AS asset_department_name,
    a.source,
    a.qr_reservation_id
   FROM public.assets a
     LEFT JOIN public.asset_categories c ON c.id = a.category_id
     LEFT JOIN public.manufacturers m ON m.id = a.manufacturer_id
     LEFT JOIN public.locations l ON l.id = a.location_id
     LEFT JOIN public.departments ad ON ad.id = a.department_id
     LEFT JOIN public.asset_assignments aa ON aa.asset_id = a.id AND aa.returned_at IS NULL
     LEFT JOIN public.employees e ON e.id = aa.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id
  WHERE a.is_deleted = false;

ALTER TABLE public.v_asset_inventory OWNER TO assetmanager_user;

-- 4. Recreate v_employee_directory with virtual is_active
CREATE OR REPLACE VIEW public.v_employee_directory AS
 SELECT e.id,
    e.employee_id AS employee_code,
    e.name,
    e.email,
    true AS is_active,
    e.erp_active,
    e.role,
    e.auth_user_id,
    d.name AS department
   FROM (public.employees e
     LEFT JOIN public.departments d ON ((e.department_id = d.id)))
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.recycle_bin_entries rbe
          WHERE ((rbe.entity_type = 'employee'::text) AND (rbe.entity_id = e.id) AND (rbe.restored_at IS NULL)))));

ALTER TABLE public.v_employee_directory OWNER TO assetmanager_user;
"""


MIGRATION_009_PEN_TO_OTHER = """
DO $$
DECLARE
  v_pen_id   uuid;
  v_other_id uuid;
BEGIN
  SELECT id INTO v_pen_id   FROM asset_categories WHERE slug = 'pen';
  SELECT id INTO v_other_id FROM asset_categories WHERE slug = 'other';

  -- Only execute the merge when BOTH rows coexist (the problem state).
  -- On every subsequent restart neither condition fires — this block is a no-op.
  IF v_pen_id IS NOT NULL AND v_other_id IS NOT NULL THEN
    -- Move any assets sitting in the old 'other' row into 'pen' (survives the delete below).
    UPDATE assets SET category_id = v_pen_id WHERE category_id = v_other_id;
    -- Clear template fields belonging to old 'other' before its row is removed.
    DELETE FROM custom_field_definitions WHERE category_id = v_other_id;
    -- Remove the duplicate OTH row so fn_next_asset_tag sees exactly one row.
    DELETE FROM asset_categories WHERE id = v_other_id;
    -- Promote 'pen' to be the canonical catch-all 'other'.
    UPDATE asset_categories
       SET name = 'Other', slug = 'other', alias_code = 'OTH', is_active = true
     WHERE id = v_pen_id;
  END IF;

  -- Safety net: if an orphaned 'pen' row still exists (from the old broken migration
  -- that only deactivated it), deactivate it to keep it out of the dropdown.
  UPDATE asset_categories SET is_active = false WHERE slug = 'pen';
END$$;
"""


async def run_database_migrations() -> None:
    logger.info("[MigrationRunner] Checking database migrations...")
    pool = get_pg_pool()
    async with pool.acquire() as conn:
        logger.info("[MigrationRunner] Executing Migration 001: Add & Seed alias_code columns...")
        async with conn.transaction():
            await conn.execute(MIGRATION_001_ADD_ALIAS_CODE)
        logger.info("[MigrationRunner] Migration 001 SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 002: Replace fn_next_asset_tag sequence functions...")
        async with conn.transaction():
            await conn.execute(MIGRATION_002_REPLACE_TAG_FUNCTION)
        logger.info("[MigrationRunner] Migration 002 SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 003: Create QR tables & asset QR columns...")
        async with conn.transaction():
            await conn.execute(MIGRATION_003_QR_TABLES)
        logger.info("[MigrationRunner] Migration 003 SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 004: Add assets.department_id and recreate v_asset_inventory...")
        async with conn.transaction():
            await conn.execute(MIGRATION_004_ASSET_DEPARTMENT)
        logger.info("[MigrationRunner] Migration 004 SUCCESS.")

        # ALTER TYPE ADD VALUE cannot run inside a transaction on PG ≤ 12 — execute without one
        logger.info("[MigrationRunner] Executing Migration 005a: ALTER TYPE asset_event_type ADD VALUE (no transaction)...")
        await conn.execute(MIGRATION_005_ALTER_TYPE)
        logger.info("[MigrationRunner] Migration 005a SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 005b: QR unlinked/linked flow, drop pre-assigned tag columns...")
        async with conn.transaction():
            await conn.execute(MIGRATION_005_QR_UNLINKED)
        logger.info("[MigrationRunner] Migration 005b SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 006: Drop deprecated employee columns...")
        async with conn.transaction():
            await conn.execute(MIGRATION_006_DROP_COLUMNS)
        logger.info("[MigrationRunner] Migration 006 SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 007: Add MOB/LCK/PND alias codes...")
        async with conn.transaction():
            await conn.execute(MIGRATION_007_ALIAS_CODES)
        logger.info("[MigrationRunner] Migration 007 SUCCESS.")

        # ALTER TYPE ADD VALUE — must run outside a transaction on PG ≤ 12
        logger.info("[MigrationRunner] Executing Migration 008: Add qr_reservation_linked / asset_assignment_blocked event types (no transaction)...")
        await conn.execute(MIGRATION_008_EVENT_TYPES)
        logger.info("[MigrationRunner] Migration 008 SUCCESS.")

        logger.info("[MigrationRunner] Executing Migration 009: Move 'pen' assets to 'other', clear 'other' custom fields, deactivate 'pen' category...")
        async with conn.transaction():
            await conn.execute(MIGRATION_009_PEN_TO_OTHER)
        logger.info("[MigrationRunner] Migration 009 SUCCESS.")

    logger.info("[MigrationRunner] All database migrations verified successfully!")
