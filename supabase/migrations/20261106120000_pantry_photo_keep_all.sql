-- Alla foton för kylen, frysen och skafferiet: a place and location keeps every
-- photo taken within the last 30 days (the sweep already removes older ones),
-- not only the latest. Same table and the same household RLS as before; only
-- the one-row-per-location rule goes, and save_pantry_photo adds a photo
-- instead of replacing the previous one. At most 20 photos are kept per place
-- and location: when a new one makes 21, the oldest row is deleted and its
-- path is returned as previous_path, so the caller removes its file as before.

alter table public.pantry_photo drop constraint pantry_photo_household_id_site_id_location_key;

create index pantry_photo_household_site_location_taken_idx
  on public.pantry_photo (household_id, site_id, location, taken_at desc);

create or replace function public.save_pantry_photo(site uuid, place text, photo_id uuid, photo_path text, photo_type text, photo_width integer, photo_height integer, photo_taken_at timestamptz, photo_reading jsonb, photo_points jsonb DEFAULT NULL::jsonb)
returns table (outcome text, previous_path text)
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  max_kept constant integer := 20;
  oldest_id uuid;
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
      and own.household_id = caller_household
  ) then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  insert into public.pantry_photo (
    id, site_id, location, object_path, media_type, width, height, taken_at, reading, points
  )
  values (
    photo_id, site, place, photo_path, photo_type, photo_width, photo_height, photo_taken_at, photo_reading, photo_points
  );

  -- Over the limit: the oldest photo of this place and location goes.
  select kept.id into oldest_id
  from public.pantry_photo as kept
  where kept.household_id = caller_household
    and kept.site_id = site
    and kept.location = place
  order by kept.taken_at desc, kept.id
  offset max_kept
  limit 1;
  if oldest_id is not null then
    delete from public.pantry_photo as old
    where old.id = oldest_id
    returning old.object_path into replaced;
  end if;

  return query select 'saved'::text, replaced;
end;
$$;
