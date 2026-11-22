-- Värdetips: the user's own star and a line about each card.
-- thing_item.worth_set_by_user: null = never touched, true = the user starred it, false = the user removed the
-- star. It goes before the AI in both directions; save_thing_card (same signature) carries it over a Ta om by name
-- and never writes it from a reading. A star shows when worth_set_by_user is true, or null with an AI tip.
-- thing_photo.summary (a line about what the card holds, written by the AI), ai_title (a short name the AI
-- suggests, 2 to 4 words) and user_title (the user's own name for the card). All nullable and additive:
-- the code before this ignores them. RLS is the tables' own (household), nothing new to grant.

alter table public.thing_item add column if not exists worth_set_by_user boolean;
alter table public.thing_photo add column if not exists summary text;
alter table public.thing_photo add column if not exists ai_title text;
alter table public.thing_photo add column if not exists user_title text;

alter table public.thing_photo drop constraint if exists thing_photo_summary_check;
alter table public.thing_photo add constraint thing_photo_summary_check check (summary is null or char_length(summary) between 1 and 80);
alter table public.thing_photo drop constraint if exists thing_photo_titles_check;
alter table public.thing_photo add constraint thing_photo_titles_check check (
  (ai_title is null or char_length(ai_title) between 1 and 40) and (user_title is null or char_length(user_title) between 1 and 40)
);

create or replace function public.save_thing_card(photo uuid, things jsonb, note text DEFAULT NULL::text, hidden_count integer DEFAULT 0)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_photo;
  removed text[];
  prev record;
  fresh record;
begin
  if caller is null then
    raise exception 'save_thing_card needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 60 then
    raise exception 'things must be a list of at most 60' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_photo where id = photo and household_id = caller_household;
  if not found or target.status <> 'reading' then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_item (
    photo_id, place_id, name, category, where_hint, confidence, position, box_left, box_top, box_width, box_height, quantity, worth_why, worth_confidence
  )
  select
    photo,
    target.place_id,
    entry.value ->> 'name',
    entry.value ->> 'category',
    entry.value ->> 'where_hint',
    entry.value ->> 'confidence',
    (entry.ordinality - 1)::integer,
    case when box.ok then box.l end,
    case when box.ok then box.t end,
    case when box.ok then box.w end,
    case when box.ok then box.h end,
    -- Nested, so the text is cast only once it is known to be a number.
    case when jsonb_typeof(entry.value -> 'count') = 'number' then
      case
        when (entry.value ->> 'count')::numeric between 1 and 999
          and (entry.value ->> 'count')::numeric = trunc((entry.value ->> 'count')::numeric)
        then (entry.value ->> 'count')::numeric::integer
      end
    end,
    -- Värt en titt: a short sentence and how sure; both or neither (thing_item_worth_check), anything else is no tip.
    case when worth.ok then worth.why end,
    case when worth.ok then worth.confidence end
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality)
  cross join lateral (
    select raw.l, raw.t, raw.w, raw.h,
      coalesce(
        raw.l >= 0 and raw.t >= 0 and raw.w > 0 and raw.h > 0 and raw.l + raw.w <= 1.0001 and raw.t + raw.h <= 1.0001,
        false
      ) as ok
    from (
      select
        case when jsonb_typeof(entry.value #> '{box,left}') = 'number' and abs((entry.value #>> '{box,left}')::numeric) <= 2 then round((entry.value #>> '{box,left}')::numeric, 6)::real end as l,
        case when jsonb_typeof(entry.value #> '{box,top}') = 'number' and abs((entry.value #>> '{box,top}')::numeric) <= 2 then round((entry.value #>> '{box,top}')::numeric, 6)::real end as t,
        case when jsonb_typeof(entry.value #> '{box,width}') = 'number' and abs((entry.value #>> '{box,width}')::numeric) <= 2 then round((entry.value #>> '{box,width}')::numeric, 6)::real end as w,
        case when jsonb_typeof(entry.value #> '{box,height}') = 'number' and abs((entry.value #>> '{box,height}')::numeric) <= 2 then round((entry.value #>> '{box,height}')::numeric, 6)::real end as h
    ) as raw
  ) as box
  cross join lateral (
    select
      btrim(entry.value #>> '{worth,why}') as why,
      entry.value #>> '{worth,confidence}' as confidence,
      coalesce(
        jsonb_typeof(entry.value #> '{worth,why}') = 'string'
        and char_length(btrim(entry.value #>> '{worth,why}')) between 1 and 200
        and (entry.value #>> '{worth,confidence}') in ('sure', 'guess', 'unsure'),
        false
      ) as ok
  ) as worth;

  -- Ta om: the user's own choice about a star (worth_set_by_user) follows a föremål that is still there by name:
  -- the new reading never overrides it. A removed star (false) also drops the new tip, as thing_item_worth_check
  -- wants both columns or neither; a star set by the user (true) keeps the new tip, if there is one.
  if target.replaces_photo_id is not null then
    update public.thing_item as n
    set worth_set_by_user = p.choice,
        worth_why = case when p.choice is false then null else n.worth_why end,
        worth_confidence = case when p.choice is false then null else n.worth_confidence end
    from (
      select distinct on (lower(btrim(i.name))) lower(btrim(i.name)) as name_key, i.worth_set_by_user as choice
      from public.thing_item as i
      join public.thing_photo as ph on ph.id = i.photo_id and ph.household_id = i.household_id
      where i.photo_id = target.replaces_photo_id and i.household_id = caller_household and i.same_as is null
        and i.worth_set_by_user is not null and ph.place_id = target.place_id
      order by lower(btrim(i.name)), i.position, i.id
    ) as p
    where n.photo_id = photo and n.household_id = caller_household and lower(btrim(n.name)) = p.name_key;
  end if;

  -- Ta om: the counts of the replaced card, by name. A föremål the new card did
  -- not count takes over the old count and its history (copied: the old rows go
  -- with the replaced card below).
  if target.replaces_photo_id is not null then
    for prev in
      select i.id, i.quantity, lower(btrim(i.name)) as name_key
      from public.thing_item as i
      join public.thing_photo as ph on ph.id = i.photo_id and ph.household_id = i.household_id
      where i.photo_id = target.replaces_photo_id and i.household_id = caller_household and i.same_as is null and i.quantity is not null
        and ph.place_id = target.place_id
      order by i.position, i.id
    loop
      select n.id, n.quantity into fresh
      from public.thing_item as n
      where n.photo_id = photo and n.household_id = caller_household and lower(btrim(n.name)) = prev.name_key
      order by n.position, n.id
      limit 1;
      if not found or fresh.quantity is not null then
        continue;
      end if;
      update public.thing_item as n set quantity = prev.quantity where n.id = fresh.id and n.household_id = caller_household;
      -- Story 21.3: each change keeps the one who made it.
      perform public.put_thing_changes(fresh.id, (
        select coalesce(jsonb_agg(jsonb_build_object(
            'user_id', c.user_id, 'kind', c.kind, 'delta', c.delta, 'quantity_after', c.quantity_after,
            'cleared', c.cleared, 'created_at', c.created_at
          ) order by c.created_at, c.id), '[]'::jsonb)
        from public.thing_change as c
        where c.item_id = prev.id and c.household_id = caller_household
      ));
    end loop;
  end if;

  -- The history of each föremål the new card counted starts with the card; after
  -- Ta om it says how many changes of the replaced card's count went.
  insert into public.thing_change (user_id, item_id, kind, quantity_after, cleared)
  select caller, i.id, 'card', i.quantity,
    nullif(least(9999, (
      select count(*)
      from public.thing_change as c
      join public.thing_item as p on p.id = c.item_id and p.household_id = c.household_id
      where target.replaces_photo_id is not null
        and p.photo_id = target.replaces_photo_id
        and p.household_id = caller_household
        and p.same_as is null
        and lower(btrim(p.name)) = lower(btrim(i.name))
        and c.kind in ('take', 'refill', 'set')
    )), 0)
  from public.thing_item as i
  where i.photo_id = photo and i.household_id = caller_household and i.quantity is not null
    and not exists (select 1 from public.thing_change as c where c.item_id = i.id and c.household_id = caller_household);

  update public.thing_photo
  set status = 'done', error_code = null, unseen_note = note, unseen_count = coalesce(hidden_count, 0)
  where id = photo and household_id = caller_household;

  with older as (
    delete from public.thing_photo as old
    where old.household_id = caller_household
      and old.id = target.replaces_photo_id
      and old.place_id = target.place_id
      and old.id <> photo
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;
