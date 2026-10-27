-- The sweep of the latest photos after review (Story 10.3, FR-39, AD-4,
-- AD-26): 20261026202113_pantry_photo_sweep.sql is applied, so the change
-- comes here. This migration only adds, and works with the code before it
-- (AD-5); it can run again on a restore (docs/drift.md).
--
-- A photo's row is deleted only when its file is gone, so no row ever points
-- at a missing file, and only when it is still the row the sweep read: the
-- same id, and still taken before the cutoff. A row replaced in the meantime
-- (a new photo of the place has a new id) stays. The files themselves are
-- removed with the Storage API first, never with SQL
-- (storage.protect_delete()).

-- Deletes the signed-in user's photo rows `photo_ids` (at most 100) that
-- were taken before `taken_before` and whose file is no longer in the bucket
-- pantry-photo: removed by the sweep just now, or gone already. Returns the
-- ids it deleted. A row whose file is still there (its removal failed) stays,
-- and the next sweep tries again.
--
-- Security invoker: pantry_photo is deleted through the caller's RLS, and
-- storage.objects is read through the caller's policy (the caller's own
-- folder, where every row's file is: pantry_photo_object_path_check). The
-- user is checked here too, so the service role (auth.uid() null) deletes
-- nothing.
create or replace function public.delete_expired_pantry_photos(photo_ids uuid[], taken_before timestamptz)
returns setof uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.pantry_photo as photo
  where cardinality(photo_ids) <= 100
    and photo.id = any (photo_ids)
    and photo.user_id = (select auth.uid())
    and photo.taken_at < taken_before
    and not exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'pantry-photo'
        and object.name = photo.object_path
    )
  returning photo.id;
$$;

-- Runs as the caller (security invoker), so the caller needs execute; never
-- public or anon.
revoke all on function public.delete_expired_pantry_photos(uuid[], timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.delete_expired_pantry_photos(uuid[], timestamptz) to authenticated, service_role;
