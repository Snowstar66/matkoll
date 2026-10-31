-- Story 18.16: rename a room (merging it into one that already has the name),
-- and count and remove one part or box with its cards, files and things.
-- Additive (AD-5): only new functions; nothing the code before this uses changes.
-- Renaming one part or box is a plain update of the user's own row by the code.

-- 1. What removing each place of a room would take, for the sheet: the kept
-- things (as the room's counts show them) and the finished cards of every place
-- in the room `in_room` (its key) of the boende `site`. Security invoker: only
-- the caller's own rows are counted.
create or replace function public.thing_place_counts(site uuid, in_room text)
returns table (place_id uuid, things bigint, cards bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select pl.id,
    (select count(*) from public.thing_item i where i.place_id = pl.id and i.user_id = pl.user_id and i.same_as is null),
    (select count(*) from public.thing_photo ph where ph.place_id = pl.id and ph.user_id = pl.user_id and ph.status = 'done')
  from public.thing_place pl
  where pl.site_id = site and pl.user_id = (select auth.uid()) and pl.room_key = in_room;
$$;

revoke all on function public.thing_place_counts(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_place_counts(uuid, text) to authenticated, service_role;

-- 2. "Ta bort" on a part or box: removes the place of the caller; its cards,
-- things (photographed, written and added) go with it (the foreign keys
-- cascade). MK440 when the place is not the caller's. Returns { things, cards,
-- paths, room_left }: the counts as the sheet showed them, the object paths of
-- every card removed (for the caller to remove the files with the Storage API)
-- and how many places the room has left. Same lock per user as the other things
-- functions.
create or replace function public.remove_thing_place(place uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.thing_place;
  counted record;
  removed text[];
  left_in_room integer;
begin
  if caller is null then
    raise exception 'remove_thing_place needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select * into target from public.thing_place where id = place and user_id = caller;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK440';
  end if;

  select c.things, c.cards into counted from public.thing_place_counts(target.site_id, target.room_key) c where c.place_id = place;
  select coalesce(array_agg(object_path), '{}') into removed
  from public.thing_photo where user_id = caller and place_id = place;

  delete from public.thing_place where user_id = caller and id = place;

  select count(*) into left_in_room from public.thing_place
  where user_id = caller and site_id = target.site_id and room_key = target.room_key;

  return jsonb_build_object('things', counted.things, 'cards', counted.cards, 'paths', to_jsonb(removed), 'room_left', left_in_room);
end;
$$;

revoke all on function public.remove_thing_place(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_thing_place(uuid) to authenticated, service_role;

-- 3. The files a room merge has to move: when the room `in_room` is renamed to
-- `new_key` and the target room has a place with the same part, the source
-- place is merged into it and its cards' files get a new path (a card's path
-- holds its place). Gives { photo, from_path, to_path } for each; the caller
-- copies the files first, then merges. Security invoker.
create or replace function public.thing_room_merge_moves(site uuid, in_room text, new_key text)
returns table (photo uuid, from_path text, to_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select ph.id, ph.object_path, ph.user_id::text || '/' || target.id::text || '/' || ph.id::text
    || case ph.media_type when 'image/jpeg' then '.jpg' else '.png' end
  from public.thing_place source
  join public.thing_place target
    on target.user_id = source.user_id and target.site_id = source.site_id and target.room_key = new_key and target.part_key = source.part_key
  join public.thing_photo ph on ph.place_id = source.id and ph.user_id = source.user_id
  where source.site_id = site and source.user_id = (select auth.uid()) and source.room_key = in_room and in_room <> new_key
  order by ph.id;
$$;

revoke all on function public.thing_room_merge_moves(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_room_merge_moves(uuid, text, text) to authenticated, service_role;

-- 4. "Byt namn på rummet": gives the room `in_room` of the boende `site` the
-- name `new_name` (its key `new_key`, both made by the code). When the boende
-- already has a room with that key the rooms are merged: a place with a part
-- that the other room has too is merged into it (its cards and things move, the
-- card's path follows), and any other place simply moves; the other room keeps
-- its own spelling. MK440 when the boende or room is not the caller's. Returns
-- { merged, moved }: the places merged into others and the places moved or
-- renamed. Same lock per user as the other things functions.
create or replace function public.rename_thing_room(site uuid, in_room text, new_name text, new_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source public.thing_place;
  target public.thing_place;
  shown text := new_name;
  merged integer := 0;
  moved integer := 0;
  existing_room text;
begin
  if caller is null then
    raise exception 'rename_thing_room needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  perform 1 from public.pantry_site where id = site and user_id = caller;
  if not found then
    raise exception 'the boende is not found' using errcode = 'MK440';
  end if;
  perform 1 from public.thing_place where site_id = site and user_id = caller and room_key = in_room;
  if not found then
    raise exception 'the room is not found' using errcode = 'MK440';
  end if;

  if new_key <> in_room then
    select room into existing_room from public.thing_place
    where site_id = site and user_id = caller and room_key = new_key order by created_at, id limit 1;
    if existing_room is not null then
      shown := existing_room;
    end if;
  end if;

  for source in
    select * from public.thing_place where site_id = site and user_id = caller and room_key = in_room order by created_at, id
  loop
    select * into target from public.thing_place
    where site_id = site and user_id = caller and room_key = new_key and part_key = source.part_key and id <> source.id;
    if found then
      update public.thing_photo
      set place_id = target.id, object_path = caller::text || '/' || target.id::text || '/' || id::text
        || case media_type when 'image/jpeg' then '.jpg' else '.png' end
      where user_id = caller and place_id = source.id;
      update public.thing_item set place_id = target.id where user_id = caller and place_id = source.id;
      delete from public.thing_place where user_id = caller and id = source.id;
      merged := merged + 1;
    else
      update public.thing_place set room = shown, room_key = new_key where user_id = caller and id = source.id;
      moved := moved + 1;
    end if;
  end loop;

  return jsonb_build_object('merged', merged, 'moved', moved);
end;
$$;

revoke all on function public.rename_thing_room(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.rename_thing_room(uuid, text, text, text) to authenticated, service_role;
