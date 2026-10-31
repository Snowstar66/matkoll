-- Story 18.15: correct things, add what the AI missed, and clear a room or the
-- whole Förråd of a boende. Additive (AD-5): the code before this keeps working.
--
-- What the code before this can meet: a thing_item row with source 'added'. It
-- has a card (photo_id is set) like a photographed thing, so every read of a
-- card's things and every room count show it as any other thing; "Ta bort pryl"
-- only removes 'photo' things, so the old code cannot remove an added thing alone
-- (it goes with its card); and the search, which names the source of a hit and is
-- parsed for 'photo' and 'manual' only, answers 'photo' for an added thing (5).
--
-- 1. A third source: 'added', a thing typed onto a card. The existing check
-- that ties 'manual' to a null photo_id already holds for it (photo_id is set).
alter table public.thing_item drop constraint if exists thing_item_source_check;
alter table public.thing_item add constraint thing_item_source_check check (source in ('photo', 'manual', 'added'));

-- 2. "Lägg till pryl" on a card: adds `things`, [{ "name": ..., "category": ... }]
-- (at most 100), to the finished card `photo`, after its other things. MK440
-- when the card is not the caller's or not finished; MK441 when the card would
-- have more than 200 things. Returns how many were added. Same lock per user as
-- the other things functions.
create or replace function public.add_card_things(photo uuid, things jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.thing_photo;
  existing integer;
  next_position integer;
  added integer;
begin
  if caller is null then
    raise exception 'add_card_things needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 100 then
    raise exception 'things must be a list of at most 100' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select * into target from public.thing_photo where id = photo and user_id = caller and status = 'done';
  if not found then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  select count(*), coalesce(max(position) + 1, 0) into existing, next_position
  from public.thing_item where photo_id = photo and user_id = caller;
  if existing + jsonb_array_length(things) > 200 then
    raise exception 'a card holds at most 200 things' using errcode = 'MK441';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  select photo, target.place_id, entry.value ->> 'name', entry.value ->> 'category', 'high', next_position + (entry.ordinality - 1)::integer, 'added'
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.add_card_things(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_card_things(uuid, jsonb) to authenticated, service_role;

-- 3. What "Rensa rummet" / "Rensa förrådet" would remove, for the sheet: the kept
-- things (as the room's counts show them), the finished cards and the boxes of
-- the room `in_room` (its key) of the boende `site`, or of the whole boende when
-- `in_room` is null. Security invoker: only the caller's own rows are counted.
create or replace function public.thing_clear_counts(site uuid, in_room text default null)
returns table (things bigint, cards bigint, boxes bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with places as (
    select pl.id, pl.kind from public.thing_place pl
    where pl.site_id = site and pl.user_id = (select auth.uid()) and (in_room is null or pl.room_key = in_room)
  )
  select
    (select count(*) from public.thing_item i join places p on p.id = i.place_id where i.same_as is null),
    (select count(*) from public.thing_photo ph join places p on p.id = ph.place_id where ph.status = 'done'),
    (select count(*) from places p where p.kind = 'box');
$$;

revoke all on function public.thing_clear_counts(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_clear_counts(uuid, text) to authenticated, service_role;

-- 4. "Rensa rummet" / "Rensa förrådet": removes the places of the room (or of
-- the whole boende when `in_room` is null) of the caller; their cards, things
-- (photographed, written and added) and boxes go with them (the foreign keys
-- cascade). Nothing of the pantry is touched. MK440 when the boende is not the
-- caller's or the room has no places. Returns { things, cards, boxes, paths }:
-- the counts as the sheet showed them and the object paths of every card
-- removed, for the caller to remove the files with the Storage API. Same lock
-- per user as the other things functions.
create or replace function public.clear_things(site uuid, in_room text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  place_ids uuid[];
  counted record;
  removed text[];
begin
  if caller is null then
    raise exception 'clear_things needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  perform 1 from public.pantry_site where id = site and user_id = caller;
  if not found then
    raise exception 'the boende is not found' using errcode = 'MK440';
  end if;

  select coalesce(array_agg(id), '{}') into place_ids
  from public.thing_place
  where site_id = site and user_id = caller and (in_room is null or room_key = in_room);
  if in_room is not null and cardinality(place_ids) = 0 then
    raise exception 'the room is not found' using errcode = 'MK440';
  end if;

  select * into counted from public.thing_clear_counts(site, in_room);
  select coalesce(array_agg(object_path), '{}') into removed
  from public.thing_photo where user_id = caller and place_id = any (place_ids);

  delete from public.thing_place where user_id = caller and id = any (place_ids);

  return jsonb_build_object('things', counted.things, 'cards', counted.cards, 'boxes', counted.boxes, 'paths', to_jsonb(removed));
end;
$$;

revoke all on function public.clear_things(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.clear_things(uuid, text) to authenticated, service_role;

-- 5. search_things (Story 18.14) names the source of each hit for the code that
-- reads it, which knows 'photo' and 'manual' only. An added thing sits on a card
-- like a photographed one, so it is answered as 'photo': the code before this
-- keeps parsing every row. Same function as before, one expression changed.
create or replace function public.search_things(terms text[], max_hits integer default 40)
returns table (
  id uuid, name text, category text, where_hint text, photo_id uuid, place_id uuid, site_id uuid, site_name text,
  room text, room_key text, part text, kind text, taken_at timestamptz, source text, score real, seen_on bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if cardinality(terms) > 50 then
    raise exception 'at most 50 search terms' using errcode = '22023';
  end if;
  return query
  with wanted as (
    select term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as pattern
    from (select distinct lower(btrim(t)) as term from unnest(terms) as t) as cleaned
    where char_length(term) between 2 and 40
    order by term
    limit 8
  ),
  hits as (
    select i.id,
      max(
        case
          when i.name ilike '%' || w.pattern || '%' then 1.0
          when i.category ilike '%' || w.pattern || '%' then 0.5
          else extensions.word_similarity(w.term, i.name)
        end
      )::real as score
    from wanted w
    join public.thing_item i
      on i.name ilike '%' || w.pattern || '%'
      or i.category ilike '%' || w.pattern || '%'
      or extensions.word_similarity(w.term, i.name) >= 0.45
    where i.same_as is null
    group by i.id
  )
  select i.id, i.name, i.category, i.where_hint, i.photo_id, i.place_id, pl.site_id, s.name, pl.room, pl.room_key, pl.part, pl.kind,
    coalesce(ph.taken_at, i.created_at), case when i.source = 'manual' then 'manual' else 'photo' end, h.score,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id)
  from hits h
  join public.thing_item i on i.id = h.id
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  join public.pantry_site s on s.id = pl.site_id
  left join public.thing_photo ph on ph.id = i.photo_id and ph.user_id = i.user_id
  order by h.score desc, i.name, i.id
  limit greatest(1, least(coalesce(max_hits, 40), 100));
end;
$$;

revoke all on function public.search_things(text[], integer) from public, anon, authenticated, service_role;
grant execute on function public.search_things(text[], integer) to authenticated, service_role;
