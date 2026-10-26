-- One lock for the pantry's writes after review (AD-1, AD-19): the advisory
-- lock key lives in pantry_lock() alone, and set_pantry_items and
-- restore_pantry_item both take it, so they never interleave for one user.
-- Both functions are replaced with the same signatures and bodies apart from
-- the lock (20261026004040_pantry_set_items_hardening.sql and
-- 20261026005054_pantry_restore_item.sql). The key is unchanged.

-- Takes the signed-in user's pantry lock until the transaction ends.
create function public.pantry_lock()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'pantry_lock needs a signed-in user' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));
end;
$$;

-- The pantry's functions run as the caller (security invoker), so the
-- caller needs execute; never public or anon.
revoke all on function public.pantry_lock() from public, anon, authenticated, service_role;
grant execute on function public.pantry_lock() to authenticated;

create or replace function public.set_pantry_items(items jsonb, replace_id uuid default null)
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
    raise exception 'set_pantry_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  if replace_id is not null then
    delete from public.pantry_item as old
    where old.id = replace_id
      and old.user_id = caller
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
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and other.unit is not null;
    else
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.ingredient_id = item.ingredient_id
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
