-- fn_next_asset_tag: matches logic in Server/repositories/asset_repository.py (get_next_asset_tag).
--
-- Self-hosted Postgres: there is no managed platform applying schema for you — run this script on
-- your own AMS database (pgAdmin Query Tool, psql, or your migration runner) when triggers/defaults
-- call fn_next_asset_tag() and you see: function fn_next_asset_tag() does not exist.
--
-- Safe to re-run: CREATE OR REPLACE

CREATE OR REPLACE FUNCTION public.fn_next_asset_tag()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  last_tag text;
  part text;
  n bigint;
BEGIN
  SELECT a.asset_tag INTO last_tag
  FROM public.assets a
  WHERE a.asset_tag ~ '^AST-[0-9]+$'
  ORDER BY a.asset_tag DESC
  LIMIT 1;

  IF last_tag IS NULL THEN
    RETURN 'AST-00001';
  END IF;

  part := split_part(last_tag, '-', 2);
  IF part = '' OR part !~ '^[0-9]+$' THEN
    RETURN 'AST-00001';
  END IF;

  n := part::bigint + 1;
  RETURN 'AST-' || lpad(n::text, 5, '0');
END;
$$;

COMMENT ON FUNCTION public.fn_next_asset_tag() IS
  'Next AST-##### tag; same rules as App AssetRepository.get_next_asset_tag (non-deleted rows, ^AST-[0-9]+$).';
