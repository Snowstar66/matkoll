-- Story 18.13/18.14: things written by hand into a box, and a typo-tolerant
-- search in the database. Additive (AD-5): the code before this keeps working.
--
-- What the code before this can meet: a thing row with a null photo_id. It
-- only ever reads things through their card (thing_photo -> thing_item, which
-- never reaches a row without a card), by photo_id, or by the id of a thing it
-- was shown from a card; and the room functions below (thing_room_stats,
-- thing_room_categories, thing_room_things) never select photo_id, they only
-- count and list the written things with their box ("i Black box").
--
-- 1. thing_item.photo_id may be null for a thing written by hand; `source`
-- says which kind a row is, and the check ties the two together. place_id
-- stays: a written thing belongs to its box.
alter table public.thing_item alter column photo_id drop not null;
alter table public.thing_item add column if not exists source text not null default 'photo';
alter table public.thing_item drop constraint if exists thing_item_source_check;
alter table public.thing_item add constraint thing_item_source_check check (source in ('photo', 'manual'));
alter table public.thing_item drop constraint if exists thing_item_source_photo_check;
alter table public.thing_item add constraint thing_item_source_photo_check check ((source = 'manual') = (photo_id is null));
create index if not exists thing_item_manual_place_idx on public.thing_item (place_id) where source = 'manual';

-- 2. Fuzzy search on the name (the extension lives in the `extensions` schema, as in Supabase).
create extension if not exists pg_trgm with schema extensions;
create index if not exists thing_item_name_trgm_idx on public.thing_item using gin (name extensions.gin_trgm_ops);

-- 3. "Skriv vad som finns": replaces the written things of a box with `things`,
-- [{ "name": ..., "category": ... }] (at most 100). The photographed things
-- of the box are not touched. MK440 when the place is not the caller's box.
-- Returns how many things the box has written now. Same lock per user as the
-- card functions.
create or replace function public.replace_box_things(box uuid, things jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  total integer;
begin
  if caller is null then
    raise exception 'replace_box_things needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 100 then
    raise exception 'things must be a list of at most 100' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  perform 1 from public.thing_place where id = box and user_id = caller and kind = 'box';
  if not found then
    raise exception 'the box is not found' using errcode = 'MK440';
  end if;

  -- The things that pointed at a written thing cannot exist: only things of cards are merged.
  delete from public.thing_item where place_id = box and user_id = caller and source = 'manual';

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  select null, box, entry.value ->> 'name', entry.value ->> 'category', 'high', (entry.ordinality - 1)::integer, 'manual'
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  get diagnostics total = row_count;
  return total;
end;
$$;

revoke all on function public.replace_box_things(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.replace_box_things(uuid, jsonb) to authenticated, service_role;

-- 4. The boxes of a room that have written things, for the room's Kort view:
-- how many and when they were written (the newest).
create or replace function public.thing_room_written(site uuid, in_room text)
returns table (place_id uuid, part text, things bigint, written_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select pl.id, pl.part, count(*), max(i.created_at)
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  where pl.site_id = site and pl.room_key = in_room and pl.kind = 'box' and i.source = 'manual'
  group by pl.id, pl.part
  order by max(i.created_at) desc, pl.id;
$$;

revoke all on function public.thing_room_written(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_room_written(uuid, text) to authenticated, service_role;

-- 5. The search of the things of the signed-in user (RLS, security invoker):
-- the kept things (not merged into another) whose name holds a term or is
-- close to it (a typo, an ending: "skiftnyckel" finds "Skiftnycklar"), or whose
-- category holds it. Best first; `score` is 1 for a name that holds the term.
-- The substring match (ilike) uses the trigram index on the name; the close
-- match compares word similarity with 0.45 (the function, not the `<%`
-- operator: the operator's threshold is a pg_trgm setting that a function may
-- not set, and it is only known to a session that has loaded the extension). A term is 2 to 40 characters, at
-- most 8 terms, at most 100 hits (default 40).
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
    coalesce(ph.taken_at, i.created_at), i.source, h.score,
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

-- 6. The closed containers per room, for the answer of the chat: the closed
-- containers the cards could not see into, less the boxes that have contents
-- since (a card or written things), plus the boxes that are still empty.
-- Rooms with none are left out.
create or replace function public.thing_unseen_by_room()
returns table (site_id uuid, room text, room_key text, unseen bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with per_room as (
    select pl.site_id, pl.room_key, (array_agg(pl.room order by pl.created_at, pl.id))[1] as room,
      coalesce(sum((select coalesce(sum(ph.unseen_count), 0) from public.thing_photo ph where ph.place_id = pl.id and ph.user_id = pl.user_id and ph.status = 'done')), 0) as hidden,
      count(*) filter (where pl.kind = 'box' and (
        exists (select 1 from public.thing_photo ph where ph.place_id = pl.id and ph.user_id = pl.user_id and ph.status = 'done')
        or exists (select 1 from public.thing_item i where i.place_id = pl.id and i.user_id = pl.user_id and i.source = 'manual')
      )) as filled,
      count(*) filter (where pl.kind = 'box' and not (
        exists (select 1 from public.thing_photo ph where ph.place_id = pl.id and ph.user_id = pl.user_id and ph.status = 'done')
        or exists (select 1 from public.thing_item i where i.place_id = pl.id and i.user_id = pl.user_id and i.source = 'manual')
      )) as empty
    from public.thing_place pl
    group by pl.site_id, pl.room_key
  )
  select site_id, room, room_key, (greatest(hidden - filled, 0) + empty)::bigint
  from per_room
  where greatest(hidden - filled, 0) + empty > 0;
$$;

revoke all on function public.thing_unseen_by_room() from public, anon, authenticated, service_role;
grant execute on function public.thing_unseen_by_room() to authenticated, service_role;
