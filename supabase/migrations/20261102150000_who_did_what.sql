-- Se vem som gjort vad (Story 21.3, Epic 21; the mockup hushallet.html,
-- section 5, decisions 6 and 7 with their defaults).
--
-- Only what someone else in the household did is marked, so the app needs to
-- know who did each thing:
--   1. A check on the shopping list is one row per check (set_shopping_check
--      inserts it as the caller and deletes it on uncheck), so its user_id is
--      already the one who checked it off; an own item's user_id is the one
--      who added it. Neither needs a new column.
--   2. pantry_item and thing_item get updated_by and updated_at: who last
--      added or changed the row, and when. A trigger sets both from the
--      session on every insert and update, so no client can name someone
--      else. Without a session (the service role, and the foreign key's
--      `on delete set null`) the row is left as it is. Rows from before this
--      migration have neither; the app then reads user_id and created_at.
--   3. thing_change keeps the one who made each change when a function
--      writes the history again (merge_thing_items, save_thing_card's Ta om,
--      restore_thing_count's Ångra, and "Ångra" on a removed föremål):
--      put_thing_changes inserts the rows with their maker. It is security
--      definer because the insert policy only lets a member insert rows
--      in their own name. A maker it is given is kept only when that person
--      is a member of the caller's household now (null stays null: the maker's
--      account is gone); anyone else becomes the caller.
--   4. stop_thing_count (Sluta räkna) gives the makers back with the history,
--      so its Ångra keeps them.

set local lock_timeout = '5s';

-- 2. Who last changed a pantry item or a föremål ---------------------------------

alter table public.pantry_item
  add column updated_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz;

alter table public.thing_item
  add column updated_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz;

create function public.stamp_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is not null then
    new.updated_by := caller;
    new.updated_at := now();
  elsif tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    -- A client without a user id never names anyone.
    new.updated_by := old.updated_by;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_updated_by() from public, anon, authenticated, service_role;

create trigger pantry_item_stamp_updated_by
  before insert or update on public.pantry_item
  for each row execute function public.stamp_updated_by();

create trigger thing_item_stamp_updated_by
  before insert or update on public.thing_item
  for each row execute function public.stamp_updated_by();

create index pantry_item_updated_by_idx on public.pantry_item (updated_by) where updated_by is not null;
create index thing_item_updated_by_idx on public.thing_item (updated_by) where updated_by is not null;

-- 3. A föremål's history keeps its makers ----------------------------------------

-- Puts `changes` (at most 100: kind, delta, quantity_after, cleared,
-- created_at and user_id) on the caller's föremål `item`. An entry without
-- user_id is the caller's; one whose user_id is not a member of the caller's
-- household now is the caller's too.
create function public.put_thing_changes(item uuid, changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null or caller_household is null then
    raise exception 'put_thing_changes needs a signed-in member' using errcode = '42501';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 100 then
    raise exception 'changes must be a list of at most 100' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(changes) as entry(value) where jsonb_typeof(entry.value) is distinct from 'object') then
    raise exception 'each change must be an object' using errcode = '22023';
  end if;
  if not exists (select 1 from public.thing_item as i where i.id = item and i.household_id = caller_household) then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_change (household_id, user_id, item_id, kind, delta, quantity_after, cleared, created_at)
  select
    caller_household,
    case
      when not (entry.value ? 'user_id') then caller
      when jsonb_typeof(entry.value -> 'user_id') = 'null' then null
      when exists (
        select 1 from public.household_member as m
        where m.household_id = caller_household and m.user_id::text = entry.value ->> 'user_id'
      ) then (entry.value ->> 'user_id')::uuid
      else caller
    end,
    item,
    entry.value ->> 'kind',
    (entry.value ->> 'delta')::integer,
    (entry.value ->> 'quantity_after')::integer,
    (entry.value ->> 'cleared')::integer,
    coalesce((entry.value ->> 'created_at')::timestamptz, now())
  from jsonb_array_elements(changes) with ordinality as entry(value, position)
  order by coalesce((entry.value ->> 'created_at')::timestamptz, now()), entry.position;
end;
$$;

revoke all on function public.put_thing_changes(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.put_thing_changes(uuid, jsonb) to authenticated;

-- The functions that write a föremål's history again, with put_thing_changes
-- in place of their own insert (otherwise as in 20261102130000_household.sql).

create or replace function public.merge_thing_items(photo uuid, pairs jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  merged integer;
  dups uuid[];
  targets uuid[];
  step integer;
  dup_count integer;
  gone integer;
  newest uuid;
begin
  if caller is null then
    raise exception 'merge_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs) > 100 then
    raise exception 'pairs must be a list of at most 100' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  with done as (
    update public.thing_item as dup
    set same_as = pair.target
    from jsonb_to_recordset(pairs) as pair(item uuid, target uuid)
    where dup.id = pair.item
      and dup.household_id = caller_household
      and dup.photo_id = photo
      and dup.same_as is null
      and not exists (select 1 from public.thing_item as pointing where pointing.same_as = dup.id)
      and exists (
        select 1
        from public.thing_item as kept
        join public.thing_place as kept_place on kept_place.id = kept.place_id and kept_place.household_id = kept.household_id
        join public.thing_place as dup_place on dup_place.id = dup.place_id and dup_place.household_id = dup.household_id
        where kept.id = pair.target
          and kept.household_id = caller_household
          and kept.same_as is null
          and kept.photo_id <> photo
          and kept_place.kind = 'part'
          and dup_place.kind = 'part'
          and kept_place.site_id = dup_place.site_id
          and kept_place.room_key = dup_place.room_key
      )
    returning dup.id, dup.same_as
  )
  select coalesce(array_agg(done.id order by done.id), '{}'), coalesce(array_agg(done.same_as order by done.id), '{}')
  into dups, targets
  from done;
  merged := coalesce(array_length(dups, 1), 0);

  for step in 1 .. merged loop
    select i.quantity into dup_count from public.thing_item as i where i.id = dups[step] and i.household_id = caller_household;
    if dup_count is null then
      continue;
    end if;
    select count(*) into gone from public.thing_change as c
    where c.item_id = targets[step] and c.household_id = caller_household and c.kind in ('take', 'refill', 'set');
    select c.id into newest from public.thing_change as c
    where c.item_id = dups[step] and c.household_id = caller_household
    order by c.created_at desc, c.id desc
    limit 1;
    delete from public.thing_change as c where c.item_id = targets[step] and c.household_id = caller_household;
    -- Story 21.3: each change keeps the one who made it.
    perform public.put_thing_changes(targets[step], (
      select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', c.user_id, 'kind', c.kind, 'delta', c.delta, 'quantity_after', c.quantity_after,
          'cleared', case when c.id = newest and c.kind = 'card' and gone > 0 then least(gone, 9999) else c.cleared end,
          'created_at', c.created_at
        ) order by c.created_at, c.id), '[]'::jsonb)
      from public.thing_change as c
      where c.item_id = dups[step] and c.household_id = caller_household
    ));
    delete from public.thing_change as c where c.item_id = dups[step] and c.household_id = caller_household;
    update public.thing_item as i set quantity = dup_count where i.id = targets[step] and i.household_id = caller_household;
    update public.thing_item as i set quantity = null where i.id = dups[step] and i.household_id = caller_household;
  end loop;
  return merged;
end;
$$;

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
    photo_id, place_id, name, category, where_hint, confidence, position, box_left, box_top, box_width, box_height, quantity
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
    end
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
  ) as box;

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

create or replace function public.restore_thing_count(item uuid, amount integer, changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  current_count integer;
begin
  if caller is null then
    raise exception 'restore_thing_count needs a signed-in user' using errcode = '42501';
  end if;
  if amount is null or amount not between 0 and 9999 then
    raise exception 'amount must be 0 to 9999' using errcode = '22023';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 50 then
    raise exception 'changes must be a list of at most 50' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select i.quantity into current_count from public.thing_item as i where i.id = item and i.household_id = caller_household and i.same_as is null for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if current_count is not null then
    raise exception 'the thing is counted again' using errcode = 'MK443';
  end if;

  update public.thing_item as i set quantity = amount where i.id = item and i.household_id = caller_household;
  -- Story 21.3: each change keeps the one who made it (put_thing_changes checks who that may be).
  perform public.put_thing_changes(item, changes);
end;
$$;

create or replace function public.stop_thing_count(item uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  kept uuid;
  before_count integer;
  history jsonb;
begin
  if caller is null then
    raise exception 'stop_thing_count needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.household_id = caller_household;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = kept and i.household_id = caller_household for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if before_count is null then
    raise exception 'the thing is not counted' using errcode = 'MK442';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'user_id', c.user_id, 'kind', c.kind, 'delta', c.delta, 'quantity_after', c.quantity_after, 'cleared', c.cleared, 'created_at', c.created_at
    ) order by c.created_at, c.id), '[]'::jsonb)
  into history
  from public.thing_change as c where c.item_id = kept and c.household_id = caller_household;

  delete from public.thing_change as c where c.item_id = kept and c.household_id = caller_household;
  update public.thing_item as i set quantity = null where i.id = kept and i.household_id = caller_household;
  return jsonb_build_object('item', kept, 'quantity', before_count, 'changes', history);
end;
$$;

