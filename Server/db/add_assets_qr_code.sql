-- Add qr_code to public.assets (required by AssetWriteRepository.create_asset in the FastAPI app).
-- Run on your self-hosted AMS database if you see: column "qr_code" of relation "assets" does not exist
--
-- Safe to re-run: IF NOT EXISTS

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS qr_code text;

COMMENT ON COLUMN public.assets.qr_code IS
  'Optional stored QR payload / reference; app may pass null on create.';
