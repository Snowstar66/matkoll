-- Prylar (Epic 18, Stories 18.1 and 18.2, NFR-11, AD-4, AD-5, AD-15, AD-26,
-- AD-28): places with names of their own (a room and an optional part, in a
-- pantry_site), the photos of those places, and the things an AI job read
-- from a photo. Owned by the things module (AD-1): only src/features/things
-- reads and writes them. Things never touch food: nothing here refers to the
-- catalog, the pantry's items, the shopping list or a recipe. This migration
-- only adds, and works with the code before it (AD-5): the one change to an
-- existing table is that ai_job accepts a fourth kind, which the code before
-- it never writes.
--
-- The photos live in a private Storage bucket, thing-photo, one folder per
-- account, written so that it can run again (docs/drift.md): the bucket with
-- `on conflict do nothing`, the policies dropped first. A file is never
-- deleted with SQL; the code removes files with the Storage API as the
-- session user (AD-26).

-- 1. The bucket: private, at most 1.5 MB, JPEG or PNG only (the same as pantry-photo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thing-photo', 'thing-photo', false, 1572864, '{image/jpeg,image/png}')
on conflict (id) do nothing;

drop policy if exists thing_photo_select on storage.objects;
create policy thing_photo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'thing-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists thing_photo_insert on storage.objects;
create policy thing_photo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'thing-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists thing_photo_delete on storage.objects;
create policy thing_photo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'thing-photo' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2. A place: a room and an optional part ("Skräpförrådet", "Översta hyllan"),
-- in one of the user's pantry_site rows (their boende).
create table public.thing_place (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  site_id uuid not null,
  room text not null,
  part text,
  -- The names as the code normalises them (normalizePlaceName): one place is
  -- never made twice with another spelling. `part_key` is '' without a part.
  room_key text not null,
  part_key text not null default '',
  created_at timestamptz not null default now(),
  constraint thing_place_room_check check (char_length(room) between 1 and 40),
  constraint thing_place_part_check check (part is null or char_length(part) between 1 and 40),
  constraint thing_place_keys_check check (
    char_length(room_key) between 1 and 160 and char_length(part_key) <= 160 and (part is null) = (part_key = '')
  ),
  -- The row's key with its user, so a child row can never point at another user's place.
  constraint thing_place_id_user_id_key unique (id, user_id),
  constraint thing_place_user_id_site_id_room_key_part_key_key unique (user_id, site_id, room_key, part_key),
  -- A deleted boende takes its places with it (AD-20); their files are removed by the code.
  constraint thing_place_site_fkey foreign key (site_id, user_id)
    references public.pantry_site (id, user_id) on delete cascade
);

alter table public.thing_place enable row level security;

create policy thing_place_own_rows on public.thing_place
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.thing_place from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.thing_place to authenticated, service_role;

-- 3. A card (a photo of a place) and how its reading went.
create table public.thing_photo (
  -- The photo's id, the same as in its path; chosen by the server.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  place_id uuid not null,
  -- The file in the bucket thing-photo.
  object_path text not null,
  media_type text not null,
  width integer not null,
  height integer not null,
  taken_at timestamptz not null,
  -- reading: the AI job is on it; done: the things are saved; failed: the job did not go (the card stays, "Försök igen").
  status text not null default 'reading',
  error_code text,
  -- What the model said about what is not visible (closed boxes and bags), and how many such containers.
  unseen_note text,
  unseen_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint thing_photo_media_type_check check (media_type in ('image/jpeg', 'image/png')),
  constraint thing_photo_size_check check (width between 1 and 2064 and height between 1 and 2064),
  constraint thing_photo_status_check check (status in ('reading', 'done', 'failed')),
  constraint thing_photo_error_code_check check (
    (status = 'failed') = (error_code is not null) and (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,62}$')
  ),
  constraint thing_photo_unseen_check check (
    unseen_count between 0 and 99 and (unseen_note is null or char_length(unseen_note) between 1 and 300)
  ),
  -- The path is the row's own: under its user's folder and its place, with its id.
  constraint thing_photo_object_path_check check (
    object_path = user_id::text || '/' || place_id::text || '/' || id::text
      || case media_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end
  ),
  constraint thing_photo_object_path_key unique (object_path),
  constraint thing_photo_id_user_id_key unique (id, user_id),
  constraint thing_photo_place_fkey foreign key (place_id, user_id)
    references public.thing_place (id, user_id) on delete cascade
);

alter table public.thing_photo enable row level security;

create policy thing_photo_own_rows on public.thing_photo
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.thing_photo from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.thing_photo to authenticated, service_role;

-- 4. A thing the AI read from a card. The card is the source: a deleted card
-- takes its things with it.
create table public.thing_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  photo_id uuid not null,
  place_id uuid not null,
  name text not null,
  category text not null,
  -- Where in the photo ("översta hyllan, vänster"), as the model says it.
  where_hint text,
  confidence text not null,
  -- The model's order, from the top left.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint thing_item_name_check check (char_length(name) between 1 and 80),
  constraint thing_item_category_check check (
    category in (
      'Verktyg', 'Sport & fritid', 'Trädgård', 'Elektronik', 'Förvaring & lådor',
      'Kläder & textil', 'Hushåll', 'Byggmaterial', 'Övrigt'
    )
  ),
  constraint thing_item_where_hint_check check (where_hint is null or char_length(where_hint) between 1 and 120),
  constraint thing_item_confidence_check check (confidence in ('high', 'medium', 'low')),
  constraint thing_item_photo_fkey foreign key (photo_id, user_id)
    references public.thing_photo (id, user_id) on delete cascade,
  constraint thing_item_place_fkey foreign key (place_id, user_id)
    references public.thing_place (id, user_id) on delete cascade
);

create index thing_item_photo_id_idx on public.thing_item (photo_id);
create index thing_item_place_id_idx on public.thing_item (place_id);

alter table public.thing_item enable row level security;

create policy thing_item_own_rows on public.thing_item
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.thing_item from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.thing_item to authenticated, service_role;

-- 5. The job's end: saves the things of a card that is `reading`, makes it
-- `done`, and removes the older cards of the same place with their things
-- (the new card replaces the old one when the job is done, Story 18.3).
-- Returns the object paths of the cards it removed, for the caller to remove
-- their files with the Storage API. A card that is not the caller's, is gone
-- or is no longer `reading` raises MK440 and nothing is written. Takes a lock
-- per user, so two jobs finishing at once follow each other.
create function public.save_thing_reading(
  photo uuid,
  things jsonb,
  note text default null,
  hidden_count integer default 0
)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.thing_photo;
  removed text[];
begin
  if caller is null then
    raise exception 'save_thing_reading needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 60 then
    raise exception 'things must be a list of at most 60' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select * into target from public.thing_photo where id = photo and user_id = caller;
  if not found or target.status <> 'reading' then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, where_hint, confidence, position)
  select
    photo,
    target.place_id,
    entry.value ->> 'name',
    entry.value ->> 'category',
    entry.value ->> 'where_hint',
    entry.value ->> 'confidence',
    (entry.ordinality - 1)::integer
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  update public.thing_photo
  set status = 'done', error_code = null, unseen_note = note, unseen_count = coalesce(hidden_count, 0)
  where id = photo and user_id = caller;

  with older as (
    delete from public.thing_photo as old
    where old.user_id = caller
      and old.place_id = target.place_id
      and old.id <> photo
      and (old.created_at, old.id) < (target.created_at, target.id)
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;

revoke all on function public.save_thing_reading(uuid, jsonb, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.save_thing_reading(uuid, jsonb, text, integer) to authenticated, service_role;

-- 6. AI jobs get a fourth kind. The code before this never writes it.
alter table public.ai_job drop constraint ai_job_kind_check;
alter table public.ai_job add constraint ai_job_kind_check check (kind in ('suggest', 'analyze', 'import', 'things'));
