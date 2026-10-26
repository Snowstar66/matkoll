-- set_pantry_items after review (AD-1, AD-4, AD-19), replacing the function
-- from 20261026002234_pantry_set_items.sql with the same signature:
-- - Only a signed-in user runs it (auth.uid() not null), with at least one item.
-- - Every delete names the caller's rows (user_id = auth.uid()) as well as
--   relying on RLS, so it never reaches other rows whoever runs it.
-- - One save per user at a time (a transaction-level advisory lock on the
--   user id): two concurrent saves of the same ingredient and location can
--   otherwise both pass the either/or rule (unlimited or amounts) and leave
--   an unlimited row next to an amount.
-- - Execute only for authenticated; service_role has no use for it.
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

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));

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

revoke all on function public.set_pantry_items(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_items(jsonb, uuid) to authenticated;
