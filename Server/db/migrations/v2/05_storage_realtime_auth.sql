-- 05_storage_realtime_auth.sql
-- Storage, realtime publication, and auth trigger wiring for AMS

set search_path = public;

-- Storage bucket for asset documents/images.
insert into storage.buckets (id, name, public)
values ('asset-files', 'asset-files', false)
on conflict (id) do update
  set public = excluded.public;

-- Storage policies

drop policy if exists asset_files_service_all on storage.objects;
create policy asset_files_service_all on storage.objects
for all
using (bucket_id = 'asset-files' and auth.role() = 'service_role')
with check (bucket_id = 'asset-files' and auth.role() = 'service_role');

drop policy if exists asset_files_authenticated_read on storage.objects;
create policy asset_files_authenticated_read on storage.objects
for select to authenticated
using (bucket_id = 'asset-files');

drop policy if exists asset_files_authenticated_insert on storage.objects;
create policy asset_files_authenticated_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'asset-files');

-- Realtime publication setup for key tables.
DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY[
      'employees',
      'assets',
      'asset_components',
      'asset_assignments'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('alter publication supabase_realtime add table public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

-- Auth integration: connect new auth users to employees via fn_handle_new_auth_user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trg
    JOIN pg_class cls ON cls.oid = trg.tgrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE trg.tgname = 'trg_on_auth_user_created'
      AND ns.nspname = 'auth'
      AND cls.relname = 'users'
  ) THEN
    CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_handle_new_auth_user();
  END IF;
END $$;
