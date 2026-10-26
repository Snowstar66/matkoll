-- Places in the pantry (Story 8.1, FR-29, NFR-9, AD-4, AD-5, AD-19, AD-20,
-- AD-21, AD-24): Pontus can keep a pantry in several places, for example
-- Hemma and Stugan. This migration only adds: no table, column or row is
-- removed, and no pantry_item row gets a new id. It works with the 1.0 code,
-- which runs against the new schema while the code is deployed (AD-5): the
-- 1.0 calls without `site` mean the selected place, which is Hemma, and the
-- 1.0 reads through PostgREST read every row, which are all Hemma's.
--
-- The Supabase CLI applies the file in one transaction, so a failure leaves
-- the schema and the rows as they were. The steps, in order:
-- 1. pantry_site, owned by the pantry module (AD-1): only
--    src/features/pantry reads and writes it.
-- 2. Backfill: every user gets Hemma as the selected place.
-- 3. pantry_item.site_id, filled with the owner's Hemma, not null, with a
--    composite foreign key to pantry_site.
-- 4. The unique key and the location index gain site_id, so "unlimited or
--    amounts" holds per place and location (AD-19).
-- 5. The removed rows kept in pantry_removal gain site_id.
-- 6. Helpers: pantry_selected_site(), pantry_target_site() and the trigger
--    that fills site_id on a direct insert.
-- 7. The seven pantry functions gain the parameter `site uuid default null`,
--    last. Null means the selected place.
-- 8. ensure_pantry_defaults(), the pantry's start data (AD-21).
--
-- Names are normalized only by src/features/pantry/domain/site.ts
-- (normalizeSiteName, AD-24); SQL stores what the domain gives and never
-- compares names itself. The only exception is the literal 'Hemma' and
-- 'hemma' below, which tests/design/pantry-site-checks.test.ts pins to
-- defaultSiteName and normalizeSiteName(defaultSiteName).

-- 1. The table (AD-4, AD-24).
create table public.pantry_site (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- As typed, after oneLine (src/lib/one-line.ts): trimmed, on one line,
  -- 1–40 characters (maxSiteNameChars).
  name text not null,
  -- normalizeSiteName(name), unique per user.
  normalized_name text not null,
  -- The place the whole app counts against; at most one per user.
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  -- The same one-line rules as store_name_check: the bracket refuses exactly
  -- refusedCodePoints (tests/design/pantry-site-checks.test.ts), written as
  -- escapes, never literally (tests/design/invisible-characters.test.ts).
  constraint pantry_site_name_check check (
    btrim(name) <> ''
    and name = btrim(name)
    and char_length(name) <= 40
    and name !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  constraint pantry_site_normalized_name_check check (btrim(normalized_name) <> ''),
  -- For the composite foreign key from pantry_item (AD-4).
  constraint pantry_site_id_user_id_key unique (id, user_id),
  constraint pantry_site_user_id_normalized_name_key unique (user_id, normalized_name)
);

-- At most one selected place per user.
create unique index pantry_site_one_selected_per_user on public.pantry_site (user_id) where is_selected;

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.pantry_site enable row level security;

create policy pantry_site_own_rows on public.pantry_site
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.pantry_site from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.pantry_site to authenticated, service_role;

-- 2. Backfill: Hemma, selected, for every user who exists now. The migration
-- runs without a session, so user_id is set here.
insert into public.pantry_site (user_id, name, normalized_name, is_selected)
select users.id, 'Hemma', 'hemma', true
from auth.users as users
on conflict do nothing;

-- 3. Every pantry row goes to its owner's Hemma, with its id, ingredient,
-- location, amount and unit as they are.
alter table public.pantry_item add column site_id uuid;

update public.pantry_item as item
set site_id = own.id
from public.pantry_site as own
where own.user_id = item.user_id
  and own.is_selected;

alter table public.pantry_item alter column site_id set not null;

-- A place with items cannot be deleted (AD-20, AD-24).
alter table public.pantry_item
  add constraint pantry_item_site_fkey foreign key (site_id, user_id)
    references public.pantry_site (id, user_id) on delete restrict;

-- 4. One row per place, ingredient, location and unit; unit null (unlimited)
-- counts as one value (AD-19, AD-24).
alter table public.pantry_item drop constraint pantry_item_user_id_ingredient_id_location_unit_key;
alter table public.pantry_item
  add constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
    unique nulls not distinct (user_id, site_id, ingredient_id, location, unit);

-- Hemma lists one location of one place at a time; the index also serves
-- pantry_item_site_fkey's lookups when a place is deleted.
drop index public.pantry_item_user_id_location_idx;
create index pantry_item_user_id_site_id_location_idx on public.pantry_item (user_id, site_id, location);

-- The catalog's foreign key (ingredient_id, user_id) had its lookups from the
-- old unique key, which started with (user_id, ingredient_id); the new one
-- starts with (user_id, site_id), so the catalog gets its own index.
create index pantry_item_ingredient_id_user_id_idx on public.pantry_item (ingredient_id, user_id);

-- 5. A removal kept for "Ångra" puts each row back on its own place: every
-- stored row without site_id gets its owner's Hemma, in the same order.
update public.pantry_removal as record
set removed_rows = (
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(element.value) = 'object' and not (element.value ? 'site_id')
          then element.value || jsonb_build_object('site_id', own.id)
        else element.value
      end
      order by element.position
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(record.removed_rows) with ordinality as element (value, position)
)
from public.pantry_site as own
where own.user_id = record.user_id
  and own.is_selected
  and exists (
    select 1
    from jsonb_array_elements(record.removed_rows) as element (value)
    where jsonb_typeof(element.value) = 'object'
      and not (element.value ? 'site_id')
  );

-- 6. Helpers.

-- The selected place of `owner` (the signed-in user when null). A user
-- without places gets Hemma, selected, so a write never fails for a user who
-- has not signed in since this migration (a test user, for one). A user with
-- places but none selected, which only a direct write to the table can
-- leave, gets the oldest selected. Only writes call it: reads never create
-- anything, and a user without places has an empty pantry (AD-24). RLS keeps
-- another owner than the caller out of reach: their places are not read, and
-- creating one is refused (42501). The service role, for the trigger below,
-- reaches every owner. Execute for authenticated and service_role.
create function public.pantry_selected_site(owner uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  who uuid := coalesce(owner, auth.uid());
  chosen uuid;
begin
  if who is null then
    raise exception 'pantry_selected_site needs a signed-in user or an owner' using errcode = '42501';
  end if;

  select own.id into chosen
  from public.pantry_site as own
  where own.user_id = who
    and own.is_selected;
  if found then
    return chosen;
  end if;

  update public.pantry_site as own
  set is_selected = true
  where own.id = (
    select oldest.id
    from public.pantry_site as oldest
    where oldest.user_id = who
    order by oldest.created_at, oldest.id
    limit 1
  )
  returning own.id into chosen;
  if found then
    return chosen;
  end if;

  insert into public.pantry_site (user_id, name, normalized_name, is_selected)
  values (who, 'Hemma', 'hemma', true)
  on conflict do nothing
  returning id into chosen;
  if found then
    return chosen;
  end if;

  -- Another transaction created it at the same moment, and has committed.
  select own.id into chosen
  from public.pantry_site as own
  where own.user_id = who
    and own.is_selected;
  if not found then
    raise exception 'the selected place could not be created' using errcode = 'P0002';
  end if;
  return chosen;
end;
$$;

revoke all on function public.pantry_selected_site(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pantry_selected_site(uuid) to authenticated, service_role;

-- The place a pantry write goes to: null is the selected place
-- (pantry_selected_site), and an id must be one of the caller's places,
-- otherwise MK410, "the place is gone" (the family of MK409), and the
-- caller writes nothing. Execute for authenticated.
create function public.pantry_target_site(site uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'pantry_target_site needs a signed-in user' using errcode = '42501';
  end if;
  if site is null then
    return public.pantry_selected_site();
  end if;
  if not exists (
    select 1
    from public.pantry_site as own
    where own.id = site
      and own.user_id = caller
  ) then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;
  return site;
end;
$$;

revoke all on function public.pantry_target_site(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pantry_target_site(uuid) to authenticated;

-- A row inserted without site_id goes to its owner's selected place. The
-- pantry functions always set site_id, so this does nothing for the app's
-- writes; it is for inserts that do not go through them: the tests' seeds
-- with the service role, and direct inserts while the code is deployed. A
-- set site_id is left as it is. Never executed directly.
create function public.pantry_item_fill_site()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.site_id is null then
    new.site_id := public.pantry_selected_site(new.user_id);
  end if;
  return new;
end;
$$;

revoke all on function public.pantry_item_fill_site() from public, anon, authenticated, service_role;

create trigger pantry_item_fill_site
  before insert on public.pantry_item
  for each row
  execute function public.pantry_item_fill_site();

-- 7. The pantry functions with `site uuid default null` last. A new
-- parameter cannot be added with `create or replace`, which would create an
-- overload and make the 1.0 calls ambiguous (42725); each function is
-- dropped and created again, with the same grants, in this transaction, so
-- there is no moment without it. PostgREST matches calls on parameter names,
-- so the 1.0 calls reach the new functions with site null. Each keeps its
-- behaviour, error codes and answer, and in addition:
-- - takes pantry_lock() and then target := pantry_target_site(site) before
--   it reads or writes anything; pantry_lock() is unchanged and still covers
--   the user's writes on every place;
-- - has site_id = target in every where against pantry_item, and sets
--   site_id in every insert;
-- - uses the new unique key in `on conflict on constraint`;
-- - has site_id in every row of its jsonb answers and of
--   pantry_removal.removed_rows.

drop function public.set_pantry_items(jsonb, uuid);
drop function public.add_to_pantry(jsonb);
drop function public.pantry_place_has_item(uuid, text, text);
drop function public.restore_pantry_item(jsonb);
drop function public.empty_pantry_place(text, uuid);
drop function public.restore_pantry_removal(uuid);
drop function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid);

-- setPantryItems (AD-19), as in 20261026010657_pantry_lock.sql, on one
-- place: replace_id is removed only when the row is on that place.
create function public.set_pantry_items(items jsonb, replace_id uuid default null, site uuid default null)
returns setof public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  item record;
begin
  if caller is null then
    raise exception 'set_pantry_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  if replace_id is not null then
    delete from public.pantry_item as old
    where old.id = replace_id
      and old.user_id = caller
      and old.site_id = target
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = old.location
          and element.value ->> 'unit' is not distinct from old.unit
      );
  end if;

  for item in
    select
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    if item.amount is null then
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is not null;
    else
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is null;
    end if;

    return query
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit)
      values (target, item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
        do update set amount = excluded.amount
      returning existing.*;
  end loop;
end;
$$;

revoke all on function public.set_pantry_items(jsonb, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_items(jsonb, uuid, uuid) to authenticated;

-- addToPantry (AD-19), as in 20261026051336_pantry_add_unlimited_fix.sql, on
-- one place: "already unlimited" is the ingredient on that place. The
-- receipts in pantry_addition are unchanged.
create function public.add_to_pantry(items jsonb, site uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  -- The largest amount pantry_item keeps.
  max_amount constant numeric := 999999.999;
  item record;
  receipt uuid;
  handled integer := 0;
begin
  if caller is null then
    raise exception 'add_to_pantry needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  -- Every item is checked before anything is written.
  for item in
    select
      element.value ->> 'key' as key,
      element.value ->> 'ingredient_id' as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) as element (value)
  loop
    if item.key is null or item.ingredient_id is null or item.location is null then
      raise exception 'every item needs key, ingredient_id and location' using errcode = '22023';
    end if;
    if item.location not in ('Kyl', 'Frys', 'Skafferi') then
      raise exception 'unknown location' using errcode = '22023';
    end if;
    if (item.amount is null) <> (item.unit is null) then
      raise exception 'an amount needs a unit, and a unit an amount' using errcode = '22023';
    end if;
    if item.amount is not null and not (item.amount > 0) then
      raise exception 'an amount must be above 0' using errcode = '22023';
    end if;
    if item.unit is not null and item.unit not in (
      'g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva'
    ) then
      raise exception 'unknown unit' using errcode = '22023';
    end if;
  end loop;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_addition as old
  where old.user_id = caller and old.created_at < now() - interval '30 days';

  for item in
    select
      element.value ->> 'key' as key,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      -- least() skips nulls, so an item without amount stays without one.
      case
        when element.value ->> 'amount' is null then null
        else least((element.value ->> 'amount')::numeric, max_amount)
      end as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    receipt := null;
    insert into public.pantry_addition (user_id, key)
    values (caller, item.key)
    on conflict on constraint pantry_addition_user_id_key_key do nothing
    returning id into receipt;
    if receipt is null then
      continue;
    end if;
    handled := handled + 1;

    if exists (
      select 1
      from public.pantry_item as other
      where other.user_id = caller
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.unit is null
    ) then
      continue;
    end if;

    if item.amount is null then
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is not null;
      insert into public.pantry_item (site_id, ingredient_id, location, amount, unit)
      values (target, item.ingredient_id, item.location, null, null);
    else
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit)
      values (target, item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
        do update set amount = least(existing.amount + excluded.amount, max_amount);
    end if;
  end loop;

  return handled;
end;
$$;

revoke all on function public.add_to_pantry(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.add_to_pantry(jsonb, uuid) to authenticated;

-- Whether a location on a place of the signed-in user's has the ingredient
-- in a way that rules out a row with `item_unit`: the same unit, or either
-- one unlimited (unit null). Site null reads the selected place and creates
-- nothing: a user without a selected place has nothing. Stable, and never
-- writes; the restore functions below call it under their lock.
create function public.pantry_place_has_item(ingredient uuid, place text, item_unit text, site uuid default null)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.pantry_item as other
    where other.user_id = auth.uid()
      and other.site_id = coalesce(
        site,
        (
          select own.id
          from public.pantry_site as own
          where own.user_id = auth.uid()
            and own.is_selected
        )
      )
      and other.ingredient_id = ingredient
      and other.location = place
      and (item_unit is null or other.unit is null or other.unit = item_unit)
  );
$$;

revoke all on function public.pantry_place_has_item(uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.pantry_place_has_item(uuid, text, text, uuid) to authenticated;

-- restorePantryItem, "Ångra" for one row (AD-20), as in
-- 20261026120231_pantry_empty_place.sql: the row goes back to its own place
-- (item ->> 'site_id'), else to `site`, else to the selected place. The place
-- is checked as in pantry_target_site: one that is gone is MK410, and
-- nothing is written.
create function public.restore_pantry_item(item jsonb, site uuid default null)
returns public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  item_id uuid;
  item_site_id uuid;
  item_ingredient_id uuid;
  item_location text;
  item_amount numeric;
  item_unit text;
  restored public.pantry_item;
begin
  if caller is null then
    raise exception 'restore_pantry_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  item_site_id := (item ->> 'site_id')::uuid;
  item_ingredient_id := (item ->> 'ingredient_id')::uuid;
  item_location := item ->> 'location';
  item_amount := (item ->> 'amount')::numeric;
  item_unit := item ->> 'unit';
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(coalesce(item_site_id, site));

  if public.pantry_place_has_item(item_ingredient_id, item_location, item_unit, target) then
    raise exception 'the location has the item again' using errcode = '23505';
  end if;

  insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit)
  values (item_id, target, item_ingredient_id, item_location, item_amount, item_unit)
  returning * into restored;
  return restored;
end;
$$;

revoke all on function public.restore_pantry_item(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_item(jsonb, uuid) to authenticated;

-- emptyPantryPlace ("Töm kylen", Story 6.3), as in
-- 20261026122008_pantry_removal.sql, on one place: only the place's rows in
-- the location are removed, and each stored row has its site_id. The same
-- operation id again returns the stored record and removes nothing.
create function public.empty_pantry_place(place text, operation_id uuid, site uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  stored jsonb;
begin
  if caller is null then
    raise exception 'empty_pantry_place needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;
  if operation_id is null then
    raise exception 'empty_pantry_place needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  -- The same operation again: what it removed, without removing anything more.
  select record.removed_rows into stored
  from public.pantry_removal as record
  where record.user_id = caller
    and record.id = operation_id;

  if not found then
    with removed as (
      delete from public.pantry_item as gone
      where gone.user_id = caller
        and gone.site_id = target
        and gone.location = place
      returning gone.*
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', removed.id,
          'site_id', removed.site_id,
          'ingredient_id', removed.ingredient_id,
          'location', removed.location,
          'amount', removed.amount,
          'unit', removed.unit
        )
        order by removed.id
      ),
      '[]'::jsonb
    )
    into stored
    from removed;

    insert into public.pantry_removal (id, removed_rows)
    values (operation_id, stored);
  end if;

  return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
end;
$$;

revoke all on function public.empty_pantry_place(text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.empty_pantry_place(text, uuid, uuid) to authenticated;

-- restorePantryRemoval, "Ångra" for a removal (AD-20), as in
-- 20261026122008_pantry_removal.sql: each row goes back to its own place
-- (site_id); `site`, and then the selected place, only when the row has
-- none. A row whose place is gone is skipped and counted in `skipped`, like
-- one whose catalog ingredient is gone.
create function public.restore_pantry_removal(operation_id uuid, site uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  row_site uuid;
  stored jsonb;
  item record;
  restored jsonb := '[]'::jsonb;
  skipped integer := 0;
begin
  if caller is null then
    raise exception 'restore_pantry_removal needs a signed-in user' using errcode = '42501';
  end if;
  if operation_id is null then
    raise exception 'restore_pantry_removal needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  -- One "Ångra" per record: it goes now, and comes back if anything below fails.
  delete from public.pantry_removal as record
  where record.user_id = caller
    and record.id = operation_id
  returning record.removed_rows into stored;
  if not found then
    raise exception 'no removal with that operation id' using errcode = 'P0002';
  end if;

  for item in
    select
      (element.value ->> 'id')::uuid as id,
      (element.value ->> 'site_id')::uuid as site_id,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(stored) with ordinality as element (value, position)
    order by element.position
  loop
    row_site := coalesce(item.site_id, target);

    -- A taken id, a place that is gone, or the item in the location again:
    -- skipped, the row there stays.
    if item.id is null
      or exists (select 1 from public.pantry_item as other where other.id = item.id)
      or not exists (
        select 1
        from public.pantry_site as own
        where own.id = row_site
          and own.user_id = caller
      )
      or public.pantry_place_has_item(item.ingredient_id, item.location, item.unit, row_site) then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit)
      values (item.id, row_site, item.ingredient_id, item.location, item.amount, item.unit);
      restored := restored || jsonb_build_object(
        'id', item.id,
        'site_id', row_site,
        'ingredient_id', item.ingredient_id,
        'location', item.location,
        'amount', item.amount,
        'unit', item.unit
      );
    exception
      -- The catalog ingredient or the place is gone (23503), an id another
      -- user's row has (23505, hidden by RLS above), or a stored row the
      -- table no longer accepts: skipped, the rest go back.
      when foreign_key_violation or unique_violation or check_violation or not_null_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;

revoke all on function public.restore_pantry_removal(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_removal(uuid, uuid) to authenticated;

-- confirmPantryInventory's write (Story 6.4), as in
-- 20261026131054_pantry_apply_inventory_hardening.sql, on one place: only
-- the place's rows are replaced and removed, and the items are set there
-- through set_pantry_items(items, null, target).
create function public.apply_pantry_inventory(
  place text,
  items jsonb,
  replace_ids uuid[],
  remove_ids uuid[],
  operation_id uuid default null,
  site uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  item_count integer;
  replace_count integer := coalesce(cardinality(replace_ids), 0);
  remove_count integer := coalesce(cardinality(remove_ids), 0);
  replaced integer := 0;
  removed jsonb := '[]'::jsonb;
  set_rows jsonb := '[]'::jsonb;
  undoable integer := 0;
begin
  if caller is null then
    raise exception 'apply_pantry_inventory needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(items) as element (value)
    where jsonb_typeof(element.value) is distinct from 'object'
  ) then
    raise exception 'every item must be an object' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(items);
  -- The limits of confirmPantryInventory (inventoryConfirmSchema).
  if item_count > 40 or replace_count > 50 or remove_count > 1000 then
    raise exception 'too many items or ids' using errcode = '22023';
  end if;
  if item_count = 0 and remove_count = 0 then
    raise exception 'nothing to apply' using errcode = '22023';
  end if;
  if remove_count > 0 and operation_id is null then
    raise exception 'removals need an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  with gone as (
    delete from public.pantry_item as old
    where old.id = any (replace_ids)
      and old.user_id = caller
      and old.site_id = target
      and old.location = place
      and exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = place
      )
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = old.location
          and element.value ->> 'unit' is not distinct from old.unit
      )
    returning old.id
  )
  select count(*) into replaced from gone;

  with gone as (
    delete from public.pantry_item as old
    where old.id = any (remove_ids)
      and old.user_id = caller
      and old.site_id = target
      and old.location = place
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = place
      )
    returning old.*
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', gone.id,
        'site_id', gone.site_id,
        'ingredient_id', gone.ingredient_id,
        'location', gone.location,
        'amount', gone.amount,
        'unit', gone.unit
      )
      order by gone.id
    ),
    '[]'::jsonb
  )
  into removed
  from gone;

  if jsonb_array_length(removed) > 0 then
    -- The caller's own record for the operation gains the rows, and its time
    -- is renewed, so pruning counts from the latest removal it holds.
    update public.pantry_removal as record
    set removed_rows = record.removed_rows || removed,
        created_at = now()
    where record.user_id = caller
      and record.id = operation_id;
    if not found then
      begin
        insert into public.pantry_removal (id, user_id, removed_rows)
        values (operation_id, caller, removed);
      exception
        when unique_violation then
          raise exception 'the operation id is taken' using errcode = 'MK409';
      end;
    end if;
  end if;

  if operation_id is not null then
    select jsonb_array_length(record.removed_rows) into undoable
    from public.pantry_removal as record
    where record.user_id = caller
      and record.id = operation_id;
    undoable := coalesce(undoable, 0);
  end if;

  if item_count > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', saved.id,
          'site_id', saved.site_id,
          'ingredient_id', saved.ingredient_id,
          'location', saved.location,
          'amount', saved.amount,
          'unit', saved.unit
        )
        order by saved.ordinality
      ),
      '[]'::jsonb
    )
    into set_rows
    from public.set_pantry_items(items, null, target) with ordinality as saved;
  end if;

  return jsonb_build_object('set', set_rows, 'removed', removed, 'replaced', replaced, 'undoable', undoable);
end;
$$;

revoke all on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid) to authenticated;

-- 8. The pantry's start data (AD-21): Hemma as the selected place, only when
-- the user has no places. Idempotent: a second call changes nothing, and two
-- sign-ins at once run one after the other under pantry_lock(). auth/confirm
-- calls it after ensure_user_defaults(). Execute for authenticated.
create function public.ensure_pantry_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.pantry_lock();
  perform public.pantry_selected_site();
end;
$$;

comment on function public.ensure_pantry_defaults() is
  'Start data for the signed-in user''s pantry (AD-21, AD-24): Hemma as the selected place when the user has no places. '
  'Idempotent; a place the user has is never replaced.';

revoke all on function public.ensure_pantry_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_pantry_defaults() to authenticated;
