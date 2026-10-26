-- Pantry writes for the sheet Lagervara (AD-1, AD-19): setPantryItems sets
-- the amount of an ingredient in a location and unit exactly, creating the
-- row when needed, in one transaction as the caller (RLS applies).
--
-- items: [{ ingredient_id, location, amount, unit }], amount and unit both
-- null for an unlimited item. In order, for each item:
-- - An ingredient in a location is either unlimited or has amounts: setting
--   an unlimited item removes the ingredient's rows with an amount in that
--   location, and setting an amount removes its unlimited row there.
-- - The row on (user_id, ingredient_id, location, unit) gets the amount, or
--   is created; an existing row keeps its id (insert … on conflict … do
--   update, never an increase).
-- replace_id: the row being edited. When Pontus changes its location, unit
-- or ingredient, it is removed first, so the item moves; when an item keeps
-- its key, the row is updated in place instead. All or nothing: a refused
-- item (check, foreign key) undoes the removal too.
-- Returns the rows set, in the order of items.
create function public.set_pantry_items(items jsonb, replace_id uuid default null)
returns setof public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item record;
begin
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;

  if replace_id is not null then
    delete from public.pantry_item as old
    where old.id = replace_id
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
      where other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is not null;
    else
      delete from public.pantry_item as other
      where other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is null;
    end if;

    return query
      insert into public.pantry_item as existing (ingredient_id, location, amount, unit)
      values (item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_user_id_ingredient_id_location_unit_key
        do update set amount = excluded.amount
      returning existing.*;
  end loop;
end;
$$;

-- Signed-in users only, never anon (AD-4). For service_role auth.uid() is
-- null, so it cannot create rows through it.
revoke all on function public.set_pantry_items(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_items(jsonb, uuid) to authenticated, service_role;
