-- 24_asset_mandatory_fields.sql
-- Enforce asset_tag, serial_number, and category as mandatory fields.
-- Remove networking category/template entirely.
-- Executed: 2025-04-12

-- Step A: Remove networking assets and category
DELETE FROM asset_assignments WHERE asset_id IN (
  SELECT a.id FROM assets a JOIN asset_categories c ON a.category_id = c.id WHERE c.slug = 'networking'
);
DELETE FROM asset_events WHERE asset_id IN (
  SELECT a.id FROM assets a JOIN asset_categories c ON a.category_id = c.id WHERE c.slug = 'networking'
);
DELETE FROM recycle_bin_entries WHERE entity_type = 'asset' AND entity_id IN (
  SELECT a.id FROM assets a JOIN asset_categories c ON a.category_id = c.id WHERE c.slug = 'networking'
);
DELETE FROM assets WHERE category_id IN (
  SELECT id FROM asset_categories WHERE slug = 'networking'
);
DELETE FROM asset_categories WHERE slug = 'networking';

-- Step B: Backfill NULLs with unique values
UPDATE assets SET serial_number = concat('UNSET-', LEFT(id::text, 8)) WHERE serial_number IS NULL;
UPDATE assets SET asset_tag = concat('AST-', LEFT(id::text, 8)) WHERE asset_tag IS NULL;

-- Step C: Add NOT NULL constraints
ALTER TABLE assets ALTER COLUMN serial_number SET NOT NULL;
ALTER TABLE assets ALTER COLUMN asset_tag SET NOT NULL;
-- category_id is already NOT NULL
