-- A cap on the photos a household keeps in each bucket (security review S-10).
--
-- The upload policies (20261102130000_household.sql) check a file's path and
-- folder but not how many files there are. Anyone with an account and the
-- publishable key could upload thousands of files of 1.5 MB to their own
-- folder, straight through the Storage API, and fill the free tier's 1 GB so
-- that no household could save a photo. Now an upload is refused (42501, the
-- Storage API's 403) once the household's members have the bucket's cap of
-- files in their folders:
--
--   pantry-photo  100 (placePhotoHouseholdCap): one latest photo per place and
--                 location, at most 10 boenden x 3 = 30, plus files a sweep has
--                 not taken yet.
--   thing-photo   300 (thingPhotoHouseholdCap): the cards of Förråd, 1-3 per
--                 place; a thorough inventory of two boenden is 100-250.
--
-- A household with more files than its cap keeps them all: only a new upload
-- is refused, until files are removed. Reading and removing are unchanged.
-- Like the migrations before it, this one can run again (docs/drift.md).
--
-- Two checks, since the Storage API checks the policy in a transaction (or
-- savepoint) it rolls back, and saves the row afterwards as its own superuser,
-- where no policy applies:
--
-- 1. The buckets' size and types, where a bucket has none.
-- 2. photo_household_cap(bucket): the caps, in one place.
-- 3. photo_room_in_my_household(bucket) in the insert policies: an upload past
--    the cap is refused before its bytes are stored. Uploads that run at the
--    same time can each see room here.
-- 4. The trigger photo_cap_guard on storage.objects: when the row of an upload
--    made with a user's session (Storage sets `owner` from the token; the
--    service role's uploads have none) is saved, it takes a lock per household
--    and bucket and counts again, in a statement of its own, so it sees every
--    upload committed while it waited. That makes the cap exact. Where the
--    migration role may not make a trigger on storage.objects (hosted Supabase
--    may take that right away), the trigger is left out with a warning and
--    the policy alone holds the cap, give or take the uploads that run at the
--    same time.

-- 1. The buckets ----------------------------------------------------------------
-- Both were made with 1.5 MB (maxImageBytes) and JPEG or PNG
-- (20261026200517_pantry_photo_hardening.sql, 20261031140000_things.sql); a
-- bucket that has lost them gets them back, one that has its own is left alone.
update storage.buckets
set file_size_limit = 1572864
where id in ('pantry-photo', 'thing-photo') and file_size_limit is null;

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png']
where id in ('pantry-photo', 'thing-photo') and (allowed_mime_types is null or cardinality(allowed_mime_types) = 0);

-- 2. The caps -------------------------------------------------------------------
create or replace function public.photo_household_cap(bucket text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case bucket when 'pantry-photo' then 100 when 'thing-photo' then 300 else 0 end;
$$;

revoke all on function public.photo_household_cap(text) from public, anon, authenticated, service_role;

-- The files of household `hid` in `bucket`: those in its members' folders now
-- (a photo's path starts with its taker's id). A file in the folder of someone
-- who has left is not counted; it is bounded by what they uploaded while a member.
create or replace function public.photo_household_count(hid uuid, bucket text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects as o
  join public.household_member as m on m.household_id = hid and left(o.name, 37) = m.user_id::text || '/'
  where o.bucket_id = bucket;
$$;

revoke all on function public.photo_household_count(uuid, text) from public, anon, authenticated, service_role;

-- 3. Room in the caller's household, for the policies and for the app ----------
create or replace function public.photo_room_in_my_household(bucket text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as hid)
  select coalesce(
    me.hid is not null and public.photo_household_count(me.hid, bucket) < public.photo_household_cap(bucket),
    false
  )
  from me;
$$;

revoke all on function public.photo_room_in_my_household(text) from public, anon, authenticated, service_role;
grant execute on function public.photo_room_in_my_household(text) to authenticated;

-- The same path and folder rules as 20261102130000_household.sql, and room.
drop policy if exists pantry_photo_insert on storage.objects;
create policy pantry_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pantry-photo'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(kyl|frys|skafferi)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    and public.photo_folder_in_my_household(bucket_id, name)
    and public.photo_room_in_my_household(bucket_id)
  );

drop policy if exists thing_photo_insert on storage.objects;
create policy thing_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'thing-photo'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    and public.photo_folder_in_my_household(bucket_id, name)
    and public.photo_room_in_my_household(bucket_id)
  );

-- 4. The exact cap when the row is saved ----------------------------------------
-- Plpgsql and volatile, so the count after the lock is a statement of its own
-- with a fresh snapshot (read committed). Only the buckets with a cap, and only
-- rows with an owner who is in a household.
create or replace function public.photo_cap_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cap integer := public.photo_household_cap(new.bucket_id);
  hid uuid;
begin
  if cap = 0 or new.owner is null then
    return new;
  end if;
  select m.household_id into hid from public.household_member as m where m.user_id = new.owner;
  if hid is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('photo_cap:' || new.bucket_id || ':' || hid::text));
  if public.photo_household_count(hid, new.bucket_id) >= cap then
    raise exception 'new row violates row-level security policy: the household has its photo cap'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.photo_cap_guard() from public, anon, authenticated, service_role;

do $$
begin
  drop trigger if exists photo_cap_guard on storage.objects;
  create trigger photo_cap_guard
    before insert on storage.objects
    for each row execute function public.photo_cap_guard();
exception
  when insufficient_privilege then
    raise warning 'photo_cap_guard is not made (%): the insert policies alone hold the photo caps', sqlerrm;
end;
$$;
