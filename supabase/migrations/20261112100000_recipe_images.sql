-- Recipe pictures in the app's own storage (AD-15 changed for recipe images,
-- the same way AD-26 changed it for the photos of Förråd; docs/beslutslogg.md).
--
-- Until now recipe.image_url was only an address on another site, loaded by
-- the browser from there. The server now fetches the picture once, when a
-- recipe is saved, makes a full size (longest side 1 200 px) and a thumbnail
-- (400 px) and keeps both in a private bucket, so the picture stays when the
-- other site changes or removes it. image_url stays as it was (the
-- recipe's source, and the fallback while a picture is not stored). Nothing
-- of the recipe's text changes.
--
-- This migration only adds (AD-5): a column, a bucket, policies, functions and
-- a trigger. It works with the code before it, and like the migrations before
-- it, it can run again (docs/drift.md).
--
-- 1. recipe.image_path: the folder of the household's stored files of the
--    recipe, <household id>/<recipe id>, with the files `full` and `thumb`
--    in it. The check ties the path to the row's own household and id, so a
--    recipe can never point at another household's files.
-- 2. The bucket recipe-images: private, 1.5 MB, JPEG and WebP (the app makes
--    WebP).
-- 3. The policies: a household's members read and remove the files under
--    <household id>/ and add `full` and `thumb` under a recipe of their own
--    household. Nobody changes a file in place (there is no update policy):
--    to replace one, remove it and add it again.
-- 4. The cap, as in 20261111130000_photo_caps.sql: at most
--    recipe_image_household_cap() files (800: 400 recipes with a full size
--    and a thumbnail each) per household. The insert policy refuses an upload
--    at the cap before its bytes are stored; the trigger
--    recipe_image_cap_guard on storage.objects counts again under a lock when
--    the row of an upload made with a user's session is saved, which makes
--    the cap exact when uploads run at the same time (where the migration
--    role may not make a trigger on storage.objects, the trigger is left out
--    with a warning and the policy alone holds the cap).
-- 5. Clean-up: a file is never deleted with SQL (storage.protect_delete()),
--    so deleting a recipe removes its files with the Storage API in the code;
--    recipe_image_orphans() finds the files that no recipe points at
--    (a recipe removed with its household, a cut-off save), and the code
--    removes them with the Storage API.

-- 1. The column ------------------------------------------------------------------
alter table public.recipe add column if not exists image_path text;

alter table public.recipe drop constraint if exists recipe_image_path_check;
alter table public.recipe
  add constraint recipe_image_path_check
  check (image_path is null or image_path = household_id::text || '/' || id::text);

-- 2. The bucket ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 1572864, array['image/jpeg', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 1572864, allowed_mime_types = array['image/jpeg', 'image/webp'];

-- 3. The cap and the helpers -------------------------------------------------------
create or replace function public.recipe_image_household_cap()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 800;
$$;

revoke all on function public.recipe_image_household_cap() from public, anon, authenticated, service_role;

-- The files of household `hid` in the bucket: those under its folder.
create or replace function public.recipe_image_count(hid uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from storage.objects as o
  where o.bucket_id = 'recipe-images' and left(o.name, 37) = hid::text || '/';
$$;

revoke all on function public.recipe_image_count(uuid) from public, anon, authenticated, service_role;

-- Room for one more file in the caller's household, for the policy and the app.
create or replace function public.recipe_image_room_in_my_household()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as hid)
  select coalesce(
    me.hid is not null and public.recipe_image_count(me.hid) < public.recipe_image_household_cap(),
    false
  )
  from me;
$$;

revoke all on function public.recipe_image_room_in_my_household() from public, anon, authenticated, service_role;
grant execute on function public.recipe_image_room_in_my_household() to authenticated;

-- True when the file is under the caller's household and under a recipe of that household.
create or replace function public.recipe_image_folder_in_my_household(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as household_id),
  parts as (
    select (storage.foldername(object_name))[1] as folder, (storage.foldername(object_name))[2] as recipe
  )
  select coalesce(
    (select me.household_id from me) is not null
    and exists (
      select 1 from public.recipe as r, me, parts
      where r.household_id = me.household_id
        and me.household_id::text = parts.folder
        and r.id::text = parts.recipe
    ),
    false
  );
$$;

revoke all on function public.recipe_image_folder_in_my_household(text) from public, anon, authenticated, service_role;
grant execute on function public.recipe_image_folder_in_my_household(text) to authenticated;

-- 4. The policies ------------------------------------------------------------------
drop policy if exists recipe_images_select on storage.objects;
create policy recipe_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );

drop policy if exists recipe_images_insert on storage.objects;
create policy recipe_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(full|thumb)$'
    and public.recipe_image_folder_in_my_household(name)
    and public.recipe_image_room_in_my_household()
  );

drop policy if exists recipe_images_delete on storage.objects;
create policy recipe_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = (select public.my_household_id())::text
  );

-- 5. The exact cap when the row is saved ---------------------------------------------
create or replace function public.recipe_image_cap_guard()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if new.bucket_id <> 'recipe-images' or new.owner is null then
    return new;
  end if;
  select m.household_id into hid from public.household_member as m where m.user_id = new.owner;
  if hid is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('recipe_image_cap:' || hid::text));
  if public.recipe_image_count(hid) >= public.recipe_image_household_cap() then
    raise exception 'new row violates row-level security policy: the household has its recipe image cap'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.recipe_image_cap_guard() from public, anon, authenticated, service_role;

do $$
begin
  drop trigger if exists recipe_image_cap_guard on storage.objects;
  create trigger recipe_image_cap_guard
    before insert on storage.objects
    for each row execute function public.recipe_image_cap_guard();
exception
  when insufficient_privilege then
    raise warning 'recipe_image_cap_guard is not made (%): the insert policy alone holds the recipe image cap', sqlerrm;
end;
$$;

-- 6. Files that no recipe points at ----------------------------------------------------
-- The names of at most 100 files under the caller's household folder whose recipe is gone
-- or does not point at the folder, uploaded more than `min_age` ago (so a save that is still
-- under way is never taken), oldest first. Security invoker: storage.objects and recipe are
-- read through the caller's policies and RLS. It only reads; the code removes the files with
-- the Storage API.
create or replace function public.recipe_image_orphans(min_age interval)
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
    and object.bucket_id = 'recipe-images'
    and (storage.foldername(object.name))[1] = (select public.my_household_id())::text
    and object.created_at < now() - min_age
    and not exists (
      select 1
      from public.recipe as r
      where r.image_path = (storage.foldername(object.name))[1] || '/' || (storage.foldername(object.name))[2]
    )
  order by object.created_at, object.name
  limit 100;
$$;

revoke all on function public.recipe_image_orphans(interval) from public, anon, authenticated, service_role;
grant execute on function public.recipe_image_orphans(interval) to authenticated;
