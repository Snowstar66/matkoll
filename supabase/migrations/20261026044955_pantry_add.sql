-- Pantry module (AD-1, AD-4, AD-19): addToPantry, "Lägg i lagret" from the
-- shopping list (Story 3.7). Only src/features/pantry reads and writes these
-- tables and functions (AD-1).
--
-- 1. pantry_addition: a receipt per item added, keyed by the caller's key
--    (the shopping list sends its check's id), so the flow over two modules
--    is idempotent rather than atomic (AD-1): an item whose receipt exists is
--    never added again, so a second run after an interruption, a double tap
--    or a tap on another device increases the pantry once.
-- 2. add_to_pantry: increases or creates the rows in one transaction, with
--    the receipts.

create table public.pantry_addition (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- The caller's idempotency key: a shopping_check id from "Lägg i lagret".
  key text not null,
  created_at timestamptz not null default now(),
  constraint pantry_addition_key_check check (btrim(key) <> '' and char_length(key) <= 200),
  -- One receipt per key and user: the second add of the same key is a no-op.
  constraint pantry_addition_user_id_key_key unique (user_id, key)
);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.pantry_addition enable row level security;

create policy pantry_addition_own_rows on public.pantry_addition
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.pantry_addition from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.pantry_addition to authenticated, service_role;

-- addToPantry (AD-19): adds what was bought to the signed-in user's pantry,
-- in one transaction under the pantry lock, so it never interleaves with
-- set_pantry_items or restore_pantry_item.
--
-- items: [{ key, ingredient_id, location, amount, unit }], amount and unit
-- both null for an item without amount (a vague line, an own item without
-- amount). In order, for each item:
-- - Its receipt is written (pantry_addition, on conflict do nothing); when
--   the key has a receipt already, the item is skipped.
-- - When the ingredient is unlimited already (a row without unit, in any
--   location), nothing changes: unlimited is always enough.
-- - Without amount, the item becomes unlimited in its location, and the
--   ingredient's rows with an amount there go: an ingredient in a location
--   is either unlimited or has amounts (set_pantry_items' rule, Story 2.2).
-- - With an amount, the row with the same ingredient, location and unit is
--   increased by it, or created. Units are never converted (AD-12).
-- Receipts older than 30 days are deleted first. A refused item (check,
-- foreign key) undoes the whole call, receipts too. Returns the number of
-- items handled, i.e. without those skipped for their receipt.
-- Execute only for authenticated.
create function public.add_to_pantry(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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

  perform public.pantry_lock();

  delete from public.pantry_addition as old
  where old.user_id = caller and old.created_at < now() - interval '30 days';

  for item in
    select
      element.value ->> 'key' as key,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    if item.key is null or item.ingredient_id is null or item.location is null then
      raise exception 'every item needs key, ingredient_id and location' using errcode = '22023';
    end if;

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
        do update set amount = existing.amount + excluded.amount;
    end if;
  end loop;

  return handled;
end;
$$;

revoke all on function public.add_to_pantry(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_to_pantry(jsonb) to authenticated;
