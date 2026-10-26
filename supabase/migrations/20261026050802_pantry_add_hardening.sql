-- addToPantry after review (AD-1, AD-4, AD-12, AD-19), following
-- 20261026044955_pantry_add.sql:
-- 1. pantry_addition: a receipt is written and deleted, never changed, so
--    authenticated keeps select, insert and delete but not update. Receipts
--    are deleted when the shopping list clears their check
--    (forgetPantryAdditions); the 30-day pruning in add_to_pantry stays as a
--    safety net.
-- 2. add_to_pantry checks each item before anything is written (22023): an
--    amount above 0, an amount and a unit together or neither, and a unit
--    and location the catalog knows (UNITS and LOCATIONS; tests/design/
--    pantry-checks pins the lists). A sum is capped just below the table's
--    maximum (pantry_item_amount_max_check: amount < 1000000), so adding to
--    a large row never refuses the whole call. Otherwise as before, with the
--    same signature.

revoke update on table public.pantry_addition from authenticated;

create or replace function public.add_to_pantry(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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

  delete from public.pantry_addition as old
  where old.user_id = caller and old.created_at < now() - interval '30 days';

  for item in
    select
      element.value ->> 'key' as key,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      least((element.value ->> 'amount')::numeric, max_amount) as amount,
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
        and other.ingredient_id = item.ingredient_id
        and other.unit is null
    ) then
      continue;
    end if;

    if item.amount is null then
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is not null;
      insert into public.pantry_item (ingredient_id, location, amount, unit)
      values (item.ingredient_id, item.location, null, null);
    else
      insert into public.pantry_item as existing (ingredient_id, location, amount, unit)
      values (item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_user_id_ingredient_id_location_unit_key
        do update set amount = least(existing.amount + excluded.amount, max_amount);
    end if;
  end loop;

  return handled;
end;
$$;

revoke all on function public.add_to_pantry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_to_pantry(jsonb) to authenticated;
