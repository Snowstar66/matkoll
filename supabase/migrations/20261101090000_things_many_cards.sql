-- Story 18.11/18.12: many cards per place, "Ta om" replaces one card, and
-- room overviews computed in the database. Additive (AD-5): the code before
-- this keeps working, with its own save_thing_reading (which still replaces the
-- older cards of a place) and every table as it was.
--
-- 1. thing_photo.replaces_photo_id: "Ta om" on a card takes a new photo that
-- replaces that one card once the new one is read. Null for a card that
-- replaces nothing (every card before this). When the replaced card goes
-- (removed by hand, or by the new card's save) the column is set null.
alter table public.thing_photo add column replaces_photo_id uuid;
alter table public.thing_photo add constraint thing_photo_replaces_check check (replaces_photo_id is null or replaces_photo_id <> id);
alter table public.thing_photo add constraint thing_photo_replaces_fkey foreign key (replaces_photo_id, user_id)
  references public.thing_photo (id, user_id) on delete set null (replaces_photo_id);
create index thing_photo_replaces_idx on public.thing_photo (replaces_photo_id) where replaces_photo_id is not null;

-- 2. save_thing_card: like save_thing_reading (the things are saved, the card
-- is done, the paths of removed files are returned, MK440 for a card that is
-- not found or not `reading`, the same lock per user), but a new card ADDS to
-- its place: only the card it replaces (replaces_photo_id, in the same place)
-- is removed, with its things.
create function public.save_thing_card(
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
    raise exception 'save_thing_card needs a signed-in user' using errcode = '42501';
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
      and old.id = target.replaces_photo_id
      and old.place_id = target.place_id
      and old.id <> photo
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;

revoke all on function public.save_thing_card(uuid, jsonb, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.save_thing_card(uuid, jsonb, text, integer) to authenticated, service_role;

-- 3. The overview of the rooms of a boende, counted in the database so the
-- start page never loads every thing. A room is the distinct room_key of the
-- boende's places. Only kept things (same_as null) are counted. Security
-- invoker: RLS limits every read to the caller's own rows.
create function public.thing_room_stats(site uuid)
returns table (room text, room_key text, things bigint, cards bigint, reading bigint, latest timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with places as (
    select * from public.thing_place where site_id = site
  ),
  per_card as (
    select pl.room_key,
      count(*) filter (where ph.status = 'done') as done,
      count(*) filter (where ph.status = 'reading') as reading,
      max(ph.taken_at) filter (where ph.status = 'done') as latest
    from public.thing_photo ph
    join places pl on pl.id = ph.place_id and pl.user_id = ph.user_id
    group by pl.room_key
  ),
  per_item as (
    select pl.room_key, count(*) as things
    from public.thing_item i
    join places pl on pl.id = i.place_id and pl.user_id = i.user_id
    where i.same_as is null
    group by pl.room_key
  )
  select
    (array_agg(p.room order by p.created_at, p.id))[1],
    p.room_key,
    coalesce(max(pi.things), 0),
    coalesce(max(pc.done), 0),
    coalesce(max(pc.reading), 0),
    max(pc.latest)
  from places p
  left join per_card pc on pc.room_key = p.room_key
  left join per_item pi on pi.room_key = p.room_key
  group by p.room_key
  order by min(p.created_at), p.room_key;
$$;

-- The categories of one room with how many kept things each has.
-- The room parameter is not called `room`: in a SQL function a column name wins over a parameter name.
create function public.thing_room_categories(site uuid, in_room text)
returns table (category text, things bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.category, count(*)
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  where pl.site_id = site and pl.room_key = in_room and i.same_as is null
  group by i.category;
$$;

-- The kept things of one category of a room (at most 2000), with where they
-- are (the place's part and kind) and on how many cards each is seen.
create function public.thing_room_things(site uuid, in_room text, wanted text)
returns table (id uuid, name text, category text, where_hint text, confidence text, part text, kind text, seen_on bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.name, i.category, i.where_hint, i.confidence, pl.part, pl.kind,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id)
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  where pl.site_id = site and pl.room_key = in_room and i.category = wanted and i.same_as is null
  order by i.name, i.id
  limit 2000;
$$;

revoke all on function public.thing_room_stats(uuid) from public, anon, authenticated, service_role;
revoke all on function public.thing_room_categories(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.thing_room_things(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_room_stats(uuid) to authenticated, service_role;
grant execute on function public.thing_room_categories(uuid, text) to authenticated, service_role;
grant execute on function public.thing_room_things(uuid, text, text) to authenticated, service_role;
