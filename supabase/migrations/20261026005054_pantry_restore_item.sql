-- restore_pantry_item (AD-19, AD-20): "Ångra" after a pantry item was
-- removed puts the row back with the same id, amount, unit and location.
-- Removal is a hard delete (AD-20), so this is an insert with the old id.
-- - Only a signed-in user runs it (auth.uid() not null), and the row is
--   theirs (user_id defaults to auth.uid(); RLS checks it).
-- - It takes the same advisory lock as set_pantry_items, so the two never
--   interleave for one user.
-- - The location must not have the item again in the meantime: a row with
--   the same key (ingredient, location, unit), or one of the other kind (an
--   ingredient in a location is either unlimited or has amounts, see
--   set_pantry_items), refuses the restore with 23505 and changes nothing.
--   So does the id when a row has it (the primary key).
-- - Execute only for authenticated.
create function public.restore_pantry_item(item jsonb)
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

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));

  if exists (
    select 1
    from public.pantry_item as other
    where other.user_id = caller
      and other.ingredient_id = item_ingredient_id
      and other.location = item_location
      and (item_unit is null or other.unit is null or other.unit = item_unit)
  ) then
    raise exception 'the location has the item again' using errcode = '23505';
  end if;

  insert into public.pantry_item (id, ingredient_id, location, amount, unit)
  values (item_id, item_ingredient_id, item_location, item_amount, item_unit)
  returning * into restored;
  return restored;
end;
$$;

revoke all on function public.restore_pantry_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_item(jsonb) to authenticated;
