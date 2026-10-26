-- The latest photo of each place after review (Story 10.1, AD-4, AD-26):
-- 20261026193324_pantry_photo.sql is applied, so the changes come here. Like
-- it, this migration can run again on a restore (docs/drift.md, Story 10.3).
-- 1. The bucket's settings are set even when it exists already.
-- 2. The upload policy takes only the path of a photo:
--    <user_id>/<site_id>/<kyl|frys|skafferi>/<photo_id>.<jpg|png>.
-- 3. The reading and the points are checked element by element, and every
--    point is for an item of the reading.
-- 4. save_pantry_photo never lets an older photo replace a newer one, and
--    says which of the two it did.
-- 5. set_pantry_photo_points adds points that come after the photo was saved.

-- 1. The bucket: private, at most maxImageBytes (1.5 MB), JPEG or PNG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pantry-photo', 'pantry-photo', false, 1572864, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1572864,
      allowed_mime_types = array['image/jpeg', 'image/png'];

-- 2. An upload must have the exact shape of a photo's path, under the
-- uploader's own id. Reading and removing stay as they are: by the bucket and
-- the user's own folder (20261026193324_pantry_photo.sql).
drop policy if exists pantry_photo_insert on storage.objects;
create policy pantry_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pantry-photo'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(kyl|frys|skafferi)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
  );

-- 3. The reading: a list of at most 25 strings of 1–200 characters
-- (readingSchema). CASE keeps the element checks from running on a value
-- that is not a list.
create function public.pantry_photo_reading_valid(reading jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when reading is null or jsonb_typeof(reading) <> 'array' then false
    when jsonb_array_length(reading) > 25 then false
    else not exists (
      select 1
      from jsonb_array_elements(reading) as element (value)
      where case
        when jsonb_typeof(element.value) <> 'string' then true
        else char_length(element.value #>> '{}') not between 1 and 200
      end
    )
  end;
$$;

-- The points: null, or a list of at most 25 objects { n, x, y }, n a whole
-- number from 1 to the reading's length (at most 25), x and y from 0 to 1000,
-- and at most one point per n (photoPointSchema, Story 6.6).
create function public.pantry_photo_points_valid(points jsonb, reading jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when points is null then true
    when jsonb_typeof(points) <> 'array' or reading is null or jsonb_typeof(reading) <> 'array' then false
    when jsonb_array_length(points) > 25 then false
    else
      not exists (
        select 1
        from jsonb_array_elements(points) as point (value)
        where case
          when jsonb_typeof(point.value) <> 'object' then true
          when jsonb_typeof(point.value -> 'n') is distinct from 'number'
            or jsonb_typeof(point.value -> 'x') is distinct from 'number'
            or jsonb_typeof(point.value -> 'y') is distinct from 'number' then true
          else (point.value ->> 'n')::numeric <> trunc((point.value ->> 'n')::numeric)
            or (point.value ->> 'n')::numeric not between 1 and least(25, jsonb_array_length(reading))
            or (point.value ->> 'x')::numeric not between 0 and 1000
            or (point.value ->> 'y')::numeric not between 0 and 1000
        end
      )
      and (
        select count(distinct point.value -> 'n') = count(*)
        from jsonb_array_elements(points) as point (value)
      )
  end;
$$;

-- The checks call the functions as the writer, so the writers need execute.
revoke all on function public.pantry_photo_reading_valid(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pantry_photo_reading_valid(jsonb) to authenticated, service_role;
revoke all on function public.pantry_photo_points_valid(jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pantry_photo_points_valid(jsonb, jsonb) to authenticated, service_role;

alter table public.pantry_photo drop constraint pantry_photo_reading_check;
alter table public.pantry_photo add constraint pantry_photo_reading_check check (public.pantry_photo_reading_valid(reading));
alter table public.pantry_photo drop constraint pantry_photo_points_check;
alter table public.pantry_photo
  add constraint pantry_photo_points_check check (public.pantry_photo_points_valid(points, reading));

-- 4. save_pantry_photo now says what it did: `saved`, with the path of the
-- photo it replaced or null, or `stale`, when the place and location already
-- have a photo taken later than this one: then nothing is written, and the
-- caller removes the file it uploaded. The return type changes, so the
-- function is dropped and created again (nothing deployed calls it yet).
drop function public.save_pantry_photo(uuid, text, uuid, text, text, integer, integer, timestamptz, jsonb, jsonb);

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
returns table (outcome text, previous_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  stored_taken_at timestamptz;
  replaced text;
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

  select stored.taken_at into stored_taken_at
  from public.pantry_photo as stored
  where stored.user_id = caller
    and stored.site_id = site
    and stored.location = place;
  if found and stored_taken_at > photo_taken_at then
    return query select 'stale'::text, null::text;
    return;
  end if;

  delete from public.pantry_photo as old
  where old.user_id = caller
    and old.site_id = site
    and old.location = place
  returning old.object_path into replaced;

  insert into public.pantry_photo (
    id, site_id, location, object_path, media_type, width, height, taken_at, reading, points
  )
  values (
    photo_id, site, place, photo_path, photo_type, photo_width, photo_height, photo_taken_at, photo_reading, photo_points
  );

  return query select 'saved'::text, replaced;
end;
$$;

revoke all on function public.save_pantry_photo(uuid, text, uuid, text, text, integer, integer, timestamptz, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_pantry_photo(uuid, text, uuid, text, text, integer, integer, timestamptz, jsonb, jsonb)
  to authenticated, service_role;

-- 5. Adds the points to the signed-in user's photo `photo_id` when it has
-- none yet, and only when every point is for an item of its reading; says
-- whether it did. A photo that is gone, replaced, has its points already, or
-- points that do not fit write nothing.
create function public.set_pantry_photo_points(photo_id uuid, photo_points jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_pantry_photo_points needs a signed-in user' using errcode = '42501';
  end if;
  if photo_points is null or jsonb_typeof(photo_points) <> 'array' or jsonb_array_length(photo_points) = 0 then
    return false;
  end if;

  update public.pantry_photo as photo
  set points = photo_points
  where photo.id = photo_id
    and photo.user_id = caller
    and photo.points is null
    and public.pantry_photo_points_valid(photo_points, photo.reading);
  return found;
end;
$$;

revoke all on function public.set_pantry_photo_points(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_photo_points(uuid, jsonb) to authenticated, service_role;
