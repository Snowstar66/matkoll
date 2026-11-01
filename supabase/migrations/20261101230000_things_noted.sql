-- Story 18.19: "Kom ihåg var jag lade den". A thing Pontus tells the chat about
-- ("Passen ligger i översta byrålådan i sovrummet") is saved as a thing of its
-- own, without a card or a photo, in a part of a room. Additive (AD-5): the
-- code before this keeps working.
--
-- What the code before this can meet: a thing_item row with source 'noted' and
-- a null photo_id, in a place of kind 'part'. It reads things of a card by
-- photo_id (never reaching a noted row), counts every kept thing of a place or
-- room (a noted thing is counted, as it should be), lists a room's things with
-- thing_room_things (2, it ignores the new columns), and searches with
-- search_things, which answers 'photo' for every source but 'manual' (3, as
-- before), so its hit opens the place's room; "Ta bort föremål" only removes
-- 'photo' and 'added' things there, so the old code cannot remove a noted thing
-- alone. replace_box_things only touches 'manual' rows, and only in boxes.
--
-- 1. A fourth source: 'noted', a thing written in by hand with where it is.
-- Like 'manual' it has no card.
alter table public.thing_item drop constraint if exists thing_item_source_check;
alter table public.thing_item add constraint thing_item_source_check check (source in ('photo', 'manual', 'added', 'noted'));
alter table public.thing_item drop constraint if exists thing_item_source_photo_check;
alter table public.thing_item add constraint thing_item_source_photo_check check ((source in ('manual', 'noted')) = (photo_id is null));
create index if not exists thing_item_noted_idx on public.thing_item (user_id) where source = 'noted';

-- 2. "Kom ihåg": saves `thing_name` with `thing_category` in the caller's part
-- (or whole room) `place`, and removes the caller's noted things of the same
-- name in any case: the same thing written again has moved, also when two
-- proposals or two tabs save it. A noted thing of another name stays. `replaces`
-- (the one the proposal showed) is taken for the record; the name decides. MK440 when the place is not the caller's or is a box; MK441
-- when the caller has 2000 noted things. The name and category are checked by
-- the table. Returns the new thing's id. Same lock per user as the other things
-- functions.
create or replace function public.remember_thing(place uuid, thing_name text, thing_category text, replaces uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  saved uuid;
begin
  if caller is null then
    raise exception 'remember_thing needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  perform 1 from public.thing_place where id = place and user_id = caller and kind = 'part';
  if not found then
    raise exception 'the place is not found' using errcode = 'MK440';
  end if;

  delete from public.thing_item
  where user_id = caller and source = 'noted' and lower(btrim(name)) = lower(btrim(thing_name));

  if (select count(*) from public.thing_item where user_id = caller and source = 'noted') >= 2000 then
    raise exception 'at most 2000 noted things' using errcode = 'MK441';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  values (null, place, thing_name, thing_category, 'high', 0, 'noted')
  returning id into saved;
  return saved;
end;
$$;

revoke all on function public.remember_thing(uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.remember_thing(uuid, text, text, uuid) to authenticated, service_role;

-- 3. thing_room_things (Story 18.12) also says whether a thing is noted and
-- when it was written in, for the room's list ("Översta byrålådan · skrivet
-- 31 okt"). Two columns are added at the end; the code before this ignores
-- them. A changed result needs the function dropped first.
drop function if exists public.thing_room_things(uuid, text, text);
create function public.thing_room_things(site uuid, in_room text, wanted text)
returns table (
  id uuid, name text, category text, where_hint text, confidence text, part text, kind text, seen_on bigint,
  noted boolean, noted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.name, i.category, i.where_hint, i.confidence, pl.part, pl.kind,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id),
    i.source = 'noted',
    case when i.source = 'noted' then i.created_at end
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  where pl.site_id = site and pl.room_key = in_room and i.category = wanted and i.same_as is null
  order by i.name, i.id
  limit 2000;
$$;

revoke all on function public.thing_room_things(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_room_things(uuid, text, text) to authenticated, service_role;

-- 4. search_things (Stories 18.14 and 18.15) also says whether a hit is a
-- noted thing; `source` stays 'manual' or 'photo' for the code before this (a
-- noted thing is 'photo': its hit opens the place's room). Same search as
-- before, one column added at the end.
drop function if exists public.search_things(text[], integer);
create function public.search_things(terms text[], max_hits integer default 40)
returns table (
  id uuid, name text, category text, where_hint text, photo_id uuid, place_id uuid, site_id uuid, site_name text,
  room text, room_key text, part text, kind text, taken_at timestamptz, source text, score real, seen_on bigint,
  noted boolean
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
    1 + (select count(*) from public.thing_item p where p.same_as = i.id),
    i.source = 'noted'
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
