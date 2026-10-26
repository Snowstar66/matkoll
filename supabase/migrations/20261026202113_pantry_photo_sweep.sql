-- The sweep of the latest photos (Story 10.3, FR-39, NFR-11, AD-4, AD-26):
-- finds the signed-in user's files in the bucket pantry-photo that no row of
-- pantry_photo points at, so the code can remove them with the Storage API.
-- Such a file is left when a place or a user is deleted (the cascade takes
-- only the rows), when the file a new photo replaced could not be removed,
-- or when a save was cut off between its upload and its row. Owned by the
-- pantry module (AD-1). This migration only adds, and works with the code
-- before it (AD-5); it can run again on a restore (docs/drift.md).
--
-- It only reads: a file is never deleted with SQL (storage.protect_delete()),
-- the code removes it with the Storage API, as the session user (AD-26).

-- The names (paths) of at most 100 of the signed-in user's files in the
-- bucket that have no row in pantry_photo and were uploaded more than
-- `min_age` ago, oldest first. The sweep passes 10 minutes, so a file whose
-- save is still under way (uploaded, its row not yet written) is never
-- taken. A `min_age` that is null or negative gives nothing.
--
-- Security invoker: storage.objects and pantry_photo are read through the
-- caller's policies and RLS, and the folder is checked here too, so only the
-- caller's own files and rows count. With the service role, auth.uid() is
-- null and nothing is returned.
create or replace function public.pantry_photo_orphans(min_age interval)
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select object.name
  from storage.objects as object
  where min_age is not null
    and min_age >= interval '0'
    and object.bucket_id = 'pantry-photo'
    and (storage.foldername(object.name))[1] = (select auth.uid())::text
    and object.created_at < now() - min_age
    and not exists (
      select 1
      from public.pantry_photo as photo
      where photo.object_path = object.name
    )
  order by object.created_at, object.name
  limit 100;
$$;

-- Runs as the caller (security invoker), so the caller needs execute; never
-- public or anon.
revoke all on function public.pantry_photo_orphans(interval) from public, anon, authenticated, service_role;
grant execute on function public.pantry_photo_orphans(interval) to authenticated, service_role;
