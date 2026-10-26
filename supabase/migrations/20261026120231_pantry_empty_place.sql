-- "Töm en plats" (Story 6.3, AD-19, AD-20): two new pantry writes.
--
-- empty_pantry_place(place) deletes every row of the signed-in user in one
-- location, in one transaction, and returns them as they were, so "Ångra"
-- can put them back. It removes everything in the location, also a row that
-- another tab added after the question was shown: "Töm kylen" means that the
-- fridge is empty afterwards.
--
-- restore_pantry_items(items) is "Ångra" for many rows at once: one call and
-- one transaction instead of one restore_pantry_item per row. Each row goes
-- back with its own id, ingredient, location, amount and unit. A row is
-- skipped, not refused, when its id is taken or when the location has the
-- item again (a row with the same key, or one of the other kind: an
-- ingredient in a location is either unlimited or has amounts), the same
-- condition as restore_pantry_item. Refusing the whole "Ångra" for one such
-- row would leave all the others removed; skipping it keeps the row that is
-- there now, and the caller says how many could not be put back. A row
-- whose ingredient is not the user's is not skipped: the foreign key
-- (ingredient_id, user_id) refuses it with 23503 and nothing is restored, and
-- RLS keeps every row the user's own (user_id defaults to auth.uid()).
--
-- Both take pantry_lock(), so they never interleave with set_pantry_items,
-- restore_pantry_item or add_to_pantry for the same user. Both run as the
-- caller (security invoker), refuse a caller without auth.uid() (42501) and
-- are executable by authenticated only.
--
-- The condition for "the location has the item again" now lives in
-- pantry_place_has_item(), which restore_pantry_item uses too; that function
-- is replaced with the same signature and behaviour
-- (20261026010657_pantry_lock.sql).

-- Whether the signed-in user's location has the ingredient in a way that
-- rules out a row with `item_unit`: the same unit, or either one unlimited
-- (unit null).
create function public.pantry_place_has_item(ingredient uuid, place text, item_unit text)
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
      and other.ingredient_id = ingredient
      and other.location = place
      and (item_unit is null or other.unit is null or other.unit = item_unit)
  );
$$;

revoke all on function public.pantry_place_has_item(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.pantry_place_has_item(uuid, text, text) to authenticated;

create or replace function public.restore_pantry_item(item jsonb)
returns public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
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
  item_ingredient_id := (item ->> 'ingredient_id')::uuid;
  item_location := item ->> 'location';
  item_amount := (item ->> 'amount')::numeric;
  item_unit := item ->> 'unit';
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  if public.pantry_place_has_item(item_ingredient_id, item_location, item_unit) then
    raise exception 'the location has the item again' using errcode = '23505';
  end if;

  insert into public.pantry_item (id, ingredient_id, location, amount, unit)
  values (item_id, item_ingredient_id, item_location, item_amount, item_unit)
  returning * into restored;
  return restored;
end;
$$;

create function public.empty_pantry_place(place text)
returns setof public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'empty_pantry_place needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  return query
    with removed as (
      delete from public.pantry_item as gone
      where gone.user_id = caller
        and gone.location = place
      returning gone.*
    )
    select removed.* from removed order by removed.id;
end;
$$;

revoke all on function public.empty_pantry_place(text) from public, anon, authenticated, service_role;
grant execute on function public.empty_pantry_place(text) to authenticated;

create function public.restore_pantry_items(items jsonb)
returns setof public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item record;
begin
  if caller is null then
    raise exception 'restore_pantry_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(items) as element (value)
    where jsonb_typeof(element.value) is distinct from 'object'
      or element.value ->> 'id' is null
  ) then
    raise exception 'every item needs its id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  for item in
    select
      (element.value ->> 'id')::uuid as id,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    -- Taken id (also by a row restored earlier in this call), or the item
    -- is in the location again: skipped, the row there stays.
    if exists (select 1 from public.pantry_item as other where other.id = item.id)
      or public.pantry_place_has_item(item.ingredient_id, item.location, item.unit) then
      continue;
    end if;

    -- `on conflict do nothing` also skips an id that another user's row has,
    -- which RLS hides from the check above.
    return query
      insert into public.pantry_item as restored (id, ingredient_id, location, amount, unit)
      values (item.id, item.ingredient_id, item.location, item.amount, item.unit)
      on conflict do nothing
      returning restored.*;
  end loop;
end;
$$;

revoke all on function public.restore_pantry_items(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_items(jsonb) to authenticated;
