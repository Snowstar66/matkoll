-- Ta och fyll på (Story 18.23): a count on the föremål where it matters
-- (gravljus, batterier, glödlampor), and a short history of what was taken
-- and filled up, so "har vi gravljus?" can be answered "Ja, 5 gravljus …" and
-- honestly "Du borde ha 3 kvar …" when it has drifted from the card.
--
-- Additive (AD-5): the code before this keeps working. thing_item gets a
-- nullable column (null = not counted, which every row is until a card is read
-- with counts or someone taps Räkna); thing_change is a new table; the
-- functions the old code calls keep their names and arguments. Two of them
-- (search_things, thing_room_things) return one more column at the end, which
-- the old code's checks ignore; save_thing_card and merge_thing_items do more
-- than before but take and return the same.
--
-- Everything here is the caller's own: RLS on thing_change limits every row to
-- its user, every function is security invoker (RLS applies inside it) with an
-- empty search_path, checks the caller itself, and takes the same per-user lock
-- as the other things functions, so two phones on one account follow each
-- other and a change never lands in the middle of a card's save or merge.

-- 1. The count. Null = not counted ("räknas inte"); 0 = slut.
alter table public.thing_item add column if not exists quantity integer;
alter table public.thing_item drop constraint if exists thing_item_quantity_check;
alter table public.thing_item add constraint thing_item_quantity_check check (quantity is null or quantity between 0 and 9999);

-- 2. The history of a count: one row per change, newest last. `delta` is what a
-- take or refill really changed (never below 0, never above 9999), null for the
-- others. `cleared` is set on a 'card' row that replaced an older count: how
-- many older changes it cleared ("2 äldre ändringar rensades"). `member_id` is
-- for Epic 21 (who in the household); until it has a table it is always null.
create table if not exists public.thing_change (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  member_id uuid,
  item_id uuid not null,
  kind text not null,
  delta integer,
  quantity_after integer not null,
  cleared integer,
  created_at timestamptz not null default now(),
  constraint thing_change_kind_check check (kind in ('take', 'refill', 'set', 'card', 'noted')),
  constraint thing_change_delta_check check (
    (kind in ('take', 'refill')) = (delta is not null)
    and (delta is null or (kind = 'take' and delta between -9999 and 0) or (kind = 'refill' and delta between 0 and 9999))
  ),
  constraint thing_change_quantity_after_check check (quantity_after between 0 and 9999),
  constraint thing_change_cleared_check check (cleared is null or (kind = 'card' and cleared between 1 and 9999)),
  constraint thing_change_member_check check (member_id is null),
  -- The föremål with its user, so a row can never point at another user's föremål.
  constraint thing_change_item_fkey foreign key (item_id, user_id)
    references public.thing_item (id, user_id) on delete cascade
);

create index if not exists thing_change_item_idx on public.thing_change (item_id, created_at desc);
create index if not exists thing_change_user_idx on public.thing_change (user_id);

alter table public.thing_change enable row level security;

-- Own rows only: read, write and remove. No update: a change is never edited
-- (where a card's save or merge hands a history to another föremål, the rows
-- are copied and the old ones removed).
drop policy if exists thing_change_select on public.thing_change;
create policy thing_change_select on public.thing_change
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists thing_change_insert on public.thing_change;
create policy thing_change_insert on public.thing_change
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists thing_change_delete on public.thing_change;
create policy thing_change_delete on public.thing_change
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.thing_change from public, anon, authenticated, service_role;
grant select, insert, delete on table public.thing_change to authenticated, service_role;
-- `pnpm move:cloud` copies the rows with upserts as the service role; a signed-in user never updates one.
grant update on table public.thing_change to service_role;

-- 3. At most 50 rows per föremål: the oldest go when a new one comes.
create or replace function public.thing_change_trim()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.thing_change as old_row
  where old_row.item_id = new.item_id
    and old_row.user_id = new.user_id
    and old_row.id in (
      select kept.id
      from public.thing_change as kept
      where kept.item_id = new.item_id and kept.user_id = new.user_id
      order by kept.created_at desc, kept.id desc
      offset 50
    );
  return null;
end;
$$;

revoke all on function public.thing_change_trim() from public, anon, authenticated, service_role;

drop trigger if exists thing_change_trim on public.thing_change;
create trigger thing_change_trim after insert on public.thing_change
  for each row execute function public.thing_change_trim();

-- 4. Ta / Fyll på: changes the count of `item` by `delta` (−999 to 999, never
-- 0) at once, never below 0 nor above 9999, and logs it in the same
-- transaction. A delta, not a new number, so two phones taking at the same
-- time never overwrite each other. A föremål merged into another (Story 18.6)
-- counts on the one it was merged into. MK440 when the föremål is not the
-- caller's or is gone; MK442 when it is not counted. Returns the change's id
-- and the new count.
create or replace function public.change_thing_quantity(item uuid, delta integer)
returns table (change_id uuid, quantity_now integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  kept uuid;
  before_count integer;
  after_count integer;
  saved uuid;
begin
  if caller is null then
    raise exception 'change_thing_quantity needs a signed-in user' using errcode = '42501';
  end if;
  if delta is null or delta = 0 or delta not between -999 and 999 then
    raise exception 'delta must be -999 to 999 and not 0' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.user_id = caller;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = kept and i.user_id = caller for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if before_count is null then
    raise exception 'the thing is not counted' using errcode = 'MK442';
  end if;

  after_count := least(9999, greatest(0, before_count + delta));
  update public.thing_item as i set quantity = after_count where i.id = kept and i.user_id = caller;
  insert into public.thing_change (user_id, item_id, kind, delta, quantity_after)
  values (caller, kept, case when delta < 0 then 'take' else 'refill' end, after_count - before_count, after_count)
  returning id into saved;
  return query select saved, after_count;
end;
$$;

revoke all on function public.change_thing_quantity(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.change_thing_quantity(uuid, integer) to authenticated, service_role;

-- 5. Ångra a take or refill: gives back what it changed (never below 0 nor
-- above 9999) and removes it from the history. MK440 when the change is not
-- the caller's, is not a take or refill, is gone (a new card cleared it), or
-- its föremål is no longer counted; MK444 when it is not the föremål's newest
-- change. Returns the new count.
create or replace function public.undo_thing_change(change uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.thing_change;
  before_count integer;
  after_count integer;
begin
  if caller is null then
    raise exception 'undo_thing_change needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select * into target from public.thing_change as c
  where c.id = change and c.user_id = caller and c.kind in ('take', 'refill');
  if not found then
    raise exception 'the change is not found' using errcode = 'MK440';
  end if;
  -- Only the newest change of the föremål: an older one undone would rewrite a count that has moved on since.
  if exists (
    select 1 from public.thing_change as newer
    where newer.item_id = target.item_id and newer.user_id = caller
      and (newer.created_at, newer.id) > (target.created_at, target.id)
  ) then
    raise exception 'only the newest change can be undone' using errcode = 'MK444';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = target.item_id and i.user_id = caller for update;
  if not found or before_count is null then
    raise exception 'the change is not found' using errcode = 'MK440';
  end if;

  after_count := least(9999, greatest(0, before_count - target.delta));
  update public.thing_item as i set quantity = after_count where i.id = target.item_id and i.user_id = caller;
  delete from public.thing_change as c where c.id = target.id and c.user_id = caller;
  return after_count;
end;
$$;

revoke all on function public.undo_thing_change(uuid) from public, anon, authenticated, service_role;
grant execute on function public.undo_thing_change(uuid) to authenticated, service_role;

-- 6. Räkna / Rätta antalet: sets the count of `item` to `amount` (0 to 9999),
-- also for a föremål that was not counted, and logs it as 'set'. MK440 when the
-- föremål is not the caller's. Returns the change's id and the count.
create or replace function public.set_thing_quantity(item uuid, amount integer)
returns table (change_id uuid, quantity_now integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  kept uuid;
  saved uuid;
begin
  if caller is null then
    raise exception 'set_thing_quantity needs a signed-in user' using errcode = '42501';
  end if;
  if amount is null or amount not between 0 and 9999 then
    raise exception 'amount must be 0 to 9999' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.user_id = caller;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  update public.thing_item as i set quantity = amount where i.id = kept and i.user_id = caller;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  insert into public.thing_change (user_id, item_id, kind, quantity_after)
  values (caller, kept, 'set', amount)
  returning id into saved;
  return query select saved, amount;
end;
$$;

revoke all on function public.set_thing_quantity(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.set_thing_quantity(uuid, integer) to authenticated, service_role;

-- 7. Sluta räkna: the count and its history go. Returns what was there
-- ({ "item", "quantity", "changes": [...] }) for Ångra (restore_thing_count).
-- MK440 when the föremål is not the caller's, MK442 when it is not counted (already stopped).
create or replace function public.stop_thing_count(item uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  kept uuid;
  before_count integer;
  history jsonb;
begin
  if caller is null then
    raise exception 'stop_thing_count needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.user_id = caller;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = kept and i.user_id = caller for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if before_count is null then
    raise exception 'the thing is not counted' using errcode = 'MK442';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'delta', c.delta, 'quantity_after', c.quantity_after, 'cleared', c.cleared, 'created_at', c.created_at
    ) order by c.created_at, c.id), '[]'::jsonb)
  into history
  from public.thing_change as c where c.item_id = kept and c.user_id = caller;

  delete from public.thing_change as c where c.item_id = kept and c.user_id = caller;
  update public.thing_item as i set quantity = null where i.id = kept and i.user_id = caller;
  return jsonb_build_object('item', kept, 'quantity', before_count, 'changes', history);
end;
$$;

revoke all on function public.stop_thing_count(uuid) from public, anon, authenticated, service_role;
grant execute on function public.stop_thing_count(uuid) to authenticated, service_role;

-- 8. Ångra on Sluta räkna: puts the count and (at most 50 of) its changes back,
-- only while the föremål is still not counted (counted again since: MK443,
-- nothing changes). Every value is checked by the table. MK440 when the
-- föremål is not the caller's or is gone.
create or replace function public.restore_thing_count(item uuid, amount integer, changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select i.quantity into current_count from public.thing_item as i where i.id = item and i.user_id = caller and i.same_as is null for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if current_count is not null then
    raise exception 'the thing is counted again' using errcode = 'MK443';
  end if;

  update public.thing_item as i set quantity = amount where i.id = item and i.user_id = caller;
  insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
  select caller, item, entry.kind, entry.delta, entry.quantity_after, entry.cleared, coalesce(entry.created_at, now())
  from jsonb_to_recordset(changes) as entry(kind text, delta integer, quantity_after integer, cleared integer, created_at timestamptz)
  order by entry.created_at;
end;
$$;

revoke all on function public.restore_thing_count(uuid, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.restore_thing_count(uuid, integer, jsonb) to authenticated, service_role;

-- 9. save_thing_card (Stories 18.11 and 18.7) as before, and each entry's
-- `count` saved as the föremål's count when it is a whole number from 1 to
-- 999 (anything else: not counted), with the history's first row
-- ("5 · Nytt kort"). "Ta om" (the card replaces one card): a counted föremål
-- of the replaced card that the new card has under the same name keeps its
-- count and history when the new card did not count it; when the new card
-- counted it, the new card's count wins and the 'card' row says how many older
-- changes went.
create or replace function public.save_thing_card(
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
  prev record;
  fresh record;
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
      join public.thing_photo as ph on ph.id = i.photo_id and ph.user_id = i.user_id
      where i.photo_id = target.replaces_photo_id and i.user_id = caller and i.same_as is null and i.quantity is not null
        and ph.place_id = target.place_id
      order by i.position, i.id
    loop
      select n.id, n.quantity into fresh
      from public.thing_item as n
      where n.photo_id = photo and n.user_id = caller and lower(btrim(n.name)) = prev.name_key
      order by n.position, n.id
      limit 1;
      if not found or fresh.quantity is not null then
        continue;
      end if;
      update public.thing_item as n set quantity = prev.quantity where n.id = fresh.id and n.user_id = caller;
      insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
      select caller, fresh.id, c.kind, c.delta, c.quantity_after, c.cleared, c.created_at
      from public.thing_change as c
      where c.item_id = prev.id and c.user_id = caller;
    end loop;
  end if;

  -- The history of each föremål the new card counted starts with the card; after
  -- Ta om it says how many changes of the replaced card's count went.
  insert into public.thing_change (user_id, item_id, kind, quantity_after, cleared)
  select caller, i.id, 'card', i.quantity,
    nullif(least(9999, (
      select count(*)
      from public.thing_change as c
      join public.thing_item as p on p.id = c.item_id and p.user_id = c.user_id
      where target.replaces_photo_id is not null
        and p.photo_id = target.replaces_photo_id
        and p.user_id = caller
        and p.same_as is null
        and lower(btrim(p.name)) = lower(btrim(i.name))
        and c.kind in ('take', 'refill', 'set')
    )), 0)
  from public.thing_item as i
  where i.photo_id = photo and i.user_id = caller and i.quantity is not null
    and not exists (select 1 from public.thing_change as c where c.item_id = i.id and c.user_id = caller);

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

-- 10. merge_thing_items (Story 18.6) as before, and "ett nytt kort vinner": a
-- föremål of the new card that is merged into one of an older card gives that
-- one its count and history when it has a count (the new card counted it, or
-- it kept the count of the card it replaced). The older changes are cleared,
-- and the 'card' row says how many. A föremål the new card did not count
-- leaves the kept count and history as they were.
create or replace function public.merge_thing_items(photo uuid, pairs jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  with done as (
    update public.thing_item as dup
    set same_as = pair.target
    from jsonb_to_recordset(pairs) as pair(item uuid, target uuid)
    where dup.id = pair.item
      and dup.user_id = caller
      and dup.photo_id = photo
      and dup.same_as is null
      and not exists (select 1 from public.thing_item as pointing where pointing.same_as = dup.id)
      and exists (
        select 1
        from public.thing_item as kept
        join public.thing_place as kept_place on kept_place.id = kept.place_id and kept_place.user_id = kept.user_id
        join public.thing_place as dup_place on dup_place.id = dup.place_id and dup_place.user_id = dup.user_id
        where kept.id = pair.target
          and kept.user_id = caller
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
    select i.quantity into dup_count from public.thing_item as i where i.id = dups[step] and i.user_id = caller;
    if dup_count is null then
      continue;
    end if;
    select count(*) into gone from public.thing_change as c
    where c.item_id = targets[step] and c.user_id = caller and c.kind in ('take', 'refill', 'set');
    select c.id into newest from public.thing_change as c
    where c.item_id = dups[step] and c.user_id = caller
    order by c.created_at desc, c.id desc
    limit 1;
    delete from public.thing_change as c where c.item_id = targets[step] and c.user_id = caller;
    insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
    select caller, targets[step], c.kind, c.delta, c.quantity_after,
      case when c.id = newest and c.kind = 'card' and gone > 0 then least(gone, 9999) else c.cleared end,
      c.created_at
    from public.thing_change as c
    where c.item_id = dups[step] and c.user_id = caller;
    delete from public.thing_change as c where c.item_id = dups[step] and c.user_id = caller;
    update public.thing_item as i set quantity = dup_count where i.id = targets[step] and i.user_id = caller;
    update public.thing_item as i set quantity = null where i.id = dups[step] and i.user_id = caller;
  end loop;
  return merged;
end;
$$;

revoke all on function public.merge_thing_items(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.merge_thing_items(uuid, jsonb) to authenticated, service_role;

-- 11. thing_room_things (Story 18.19) and search_things (Story 18.19) also give
-- the count, as a column at the end; the code before this ignores it. A
-- changed result needs the function dropped first.
drop function if exists public.thing_room_things(uuid, text, text);
create function public.thing_room_things(site uuid, in_room text, wanted text)
returns table (
  id uuid, name text, category text, where_hint text, confidence text, part text, kind text, seen_on bigint,
  noted boolean, noted_at timestamptz, quantity integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.name, i.category, i.where_hint, i.confidence, pl.part, pl.kind,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id),
    i.source = 'noted',
    case when i.source = 'noted' then i.created_at end,
    i.quantity
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.user_id = i.user_id
  where pl.site_id = site and pl.room_key = in_room and i.category = wanted and i.same_as is null
  order by i.name, i.id
  limit 2000;
$$;

revoke all on function public.thing_room_things(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.thing_room_things(uuid, text, text) to authenticated, service_role;

drop function if exists public.search_things(text[], integer);
create function public.search_things(terms text[], max_hits integer default 40)
returns table (
  id uuid, name text, category text, where_hint text, photo_id uuid, place_id uuid, site_id uuid, site_name text,
  room text, room_key text, part text, kind text, taken_at timestamptz, source text, score real, seen_on bigint,
  noted boolean, quantity integer
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
    i.source = 'noted',
    i.quantity
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

-- 12. relink_thing_items (Story 18.6 follow-up) as before, except that a
-- föremål with a count of its own is never pointed at another again: it would
-- hide its count and history behind the one it points at. That happens when a
-- removed föremål comes back (Ångra) after one of the föremål merged into it
-- was counted on its own meanwhile; that one stays a föremål of its own.
create or replace function public.relink_thing_items(links jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  total integer := 0;
  step integer;
begin
  if caller is null then
    raise exception 'relink_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(links) is distinct from 'array' or jsonb_array_length(links) > 200 then
    raise exception 'links must be a list of at most 200' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  update public.thing_item as item
  set same_as = link.same_as
  from jsonb_to_recordset(links) as link(id uuid, same_as uuid)
  where link.same_as is not null
    and item.id = link.id
    and item.user_id = caller
    and item.same_as is null
    and item.quantity is null
    and link.same_as <> item.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = item.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.same_as and kept.user_id = caller and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;

  update public.thing_item as pointer
  set same_as = link.id
  from (
    select entry.id, pointed.value::uuid as pointer_id
    from jsonb_to_recordset(links) as entry(id uuid, pointed_by jsonb),
      lateral jsonb_array_elements_text(coalesce(entry.pointed_by, '[]'::jsonb)) as pointed(value)
  ) as link
  where pointer.id = link.pointer_id
    and pointer.user_id = caller
    and pointer.same_as is null
    and pointer.quantity is null
    and pointer.id <> link.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = pointer.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.id and kept.user_id = caller and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;
  return total;
end;
$$;

revoke all on function public.relink_thing_items(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.relink_thing_items(jsonb) to authenticated, service_role;
