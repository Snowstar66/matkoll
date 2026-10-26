-- The latest photo of each place (Story 10.1, FR-37, NFR-11, AD-4, AD-5,
-- AD-15, AD-20, AD-26): a private Storage bucket for the photos, the policies
-- that keep each user to their own folder in it, the table with one row per
-- place, location and user, and the function that swaps a location's row.
-- Owned by the pantry module (AD-1): only src/features/pantry reads and
-- writes them. This migration only adds, and works with the code before it
-- (AD-5).
--
-- The bucket and the policies live in the schema `storage`, which a dump of
-- the database leaves out, so a restore runs this migration again
-- (docs/drift.md, Story 10.3). Both are written so that it can run again:
-- the bucket with `on conflict do nothing`, the policies dropped first.
--
-- A file is never deleted with SQL: Supabase stops it
-- (storage.protect_delete()), and the file would stay. The code removes
-- files with the Storage API, as the session user (AD-26).

-- 1. The bucket: private, at most maxImageBytes (1.5 MB), JPEG or PNG only.
-- No public URL and no signed URL is ever made for it (AD-26).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pantry-photo', 'pantry-photo', false, 1572864, '{image/jpeg,image/png}')
on conflict (id) do nothing;

-- 2. The policies on storage.objects (AD-4, AD-26): a signed-in user may
-- read, upload and remove files in the bucket only under the folder named by
-- their own id (<user_id>/<site_id>/<location>/<photo_id>.<jpg|png>). No
-- update (a photo is never overwritten: each one gets a new path), and
-- nothing for anon.
drop policy if exists pantry_photo_select on storage.objects;
create policy pantry_photo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'pantry-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists pantry_photo_insert on storage.objects;
create policy pantry_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pantry-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists pantry_photo_delete on storage.objects;
create policy pantry_photo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pantry-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. The table (AD-4, AD-26): one photo per user, place and location.
create table public.pantry_photo (
  -- The photo's id, the same as in its path; chosen by the server.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  site_id uuid not null,
  location text not null,
  -- The file in the bucket pantry-photo.
  object_path text not null,
  media_type text not null,
  -- The size in pixels from the file's header: at most maxPlacePhotoSide
  -- (2048) with imageSideTolerance (16).
  width integer not null,
  height integer not null,
  -- When the photo was taken (when its analysis started), at most a day
  -- before it was saved (clampTakenAt).
  taken_at timestamptz not null,
  -- The AI's items in reading order (readingSchema): item n is reading[n - 1].
  reading jsonb not null,
  -- The points from Story 6.6 ({ n, x, y } in thousandths), or null before
  -- they have come or when the lookup failed.
  points jsonb,
  created_at timestamptz not null default now(),
  constraint pantry_photo_location_check check (location in ('Kyl', 'Frys', 'Skafferi')),
  constraint pantry_photo_media_type_check check (media_type in ('image/jpeg', 'image/png')),
  constraint pantry_photo_size_check check (width between 1 and 2064 and height between 1 and 2064),
  constraint pantry_photo_reading_check check (
    jsonb_typeof(reading) = 'array' and jsonb_array_length(reading) <= 25
  ),
  constraint pantry_photo_points_check check (
    points is null or (jsonb_typeof(points) = 'array' and jsonb_array_length(points) <= 25)
  ),
  -- The path is the row's own: under its user's folder, its place, its
  -- location (placePhotoFolder) and its id, so a row never points at a file
  -- of another user, place or photo.
  constraint pantry_photo_object_path_check check (
    object_path = user_id::text || '/' || site_id::text || '/'
      || case location when 'Kyl' then 'kyl' when 'Frys' then 'frys' when 'Skafferi' then 'skafferi' end
      || '/' || id::text
      || case media_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end
  ),
  constraint pantry_photo_object_path_key unique (object_path),
  -- One photo per place and location; the index also serves the foreign key's lookups.
  constraint pantry_photo_user_id_site_id_location_key unique (user_id, site_id, location),
  -- The photo belongs to its place's aggregate (AD-20): a deleted place takes
  -- its rows with it. Its files are removed by the code (Story 10.3).
  constraint pantry_photo_site_fkey foreign key (site_id, user_id)
    references public.pantry_site (id, user_id) on delete cascade
);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.pantry_photo enable row level security;

create policy pantry_photo_own_rows on public.pantry_photo
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4).
revoke all on table public.pantry_photo from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.pantry_photo to authenticated, service_role;

-- 4. Swaps the photo of the signed-in user's place `site` and location
-- `place` for a new one, whose file is already uploaded, and returns the path
-- of the photo it replaced, or null (AD-26). Takes pantry_lock(), so two
-- photos of one place saved at once follow each other and the later one
-- stays. A place that is not the caller's, or is gone, raises MK410 (as
-- pantry_target_site does) and nothing is written. The caller removes the
-- returned file with the Storage API. The parameters have their own names,
-- so they never clash with the table's columns.
create function public.save_pantry_photo(
  site uuid,
  place text,
  photo_id uuid,
  photo_path text,
  photo_type text,
  photo_width integer,
  photo_height integer,
  photo_taken_at timestamptz,
  photo_reading jsonb,
  photo_points jsonb default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  previous text;
begin
  if caller is null then
    raise exception 'save_pantry_photo needs a signed-in user' using errcode = '42501';
  end if;
  if site is null then
    raise exception 'save_pantry_photo needs a place' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  if not exists (
    select 1
    from public.pantry_site as own
    where own.id = site
      and own.user_id = caller
  ) then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  delete from public.pantry_photo as old
  where old.user_id = caller
    and old.site_id = site
    and old.location = place
  returning old.object_path into previous;

  insert into public.pantry_photo (
    id, site_id, location, object_path, media_type, width, height, taken_at, reading, points
  )
  values (
    photo_id, site, place, photo_path, photo_type, photo_width, photo_height, photo_taken_at, photo_reading, photo_points
  );

  return previous;
end;
$$;

-- Runs as the caller (security invoker), so the caller needs execute; never
-- public or anon.
revoke all on function public.save_pantry_photo(uuid, text, uuid, text, text, integer, integer, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_pantry_photo(uuid, text, uuid, text, text, integer, integer, timestamptz, jsonb, jsonb)
  to authenticated, service_role;
