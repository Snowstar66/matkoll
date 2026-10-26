-- "Inventera en plats med foto" (Story 6.4, AD-19, AD-20): one pantry write
-- for what a photo of a place that already has items asks Pontus to confirm.
--
-- apply_pantry_inventory(place, items, replace_ids, remove_ids, operation_id)
-- does, in one transaction under pantry_lock() and in this order:
-- 1. refuses a caller without auth.uid() (42501), an unknown location, items
--    that are not an array of objects, more than 40 items, 50 replace ids or
--    1 000 remove ids, a request with neither items nor removals, and
--    removals without an operation id (22023);
-- 2. deletes the rows in `replace_ids` ("Ändrat": the photo has the
--    ingredient in other units) that are the caller's, lie in `place`, have
--    an ingredient that an item sets in `place`, and do not have the key
--    (ingredient, location, unit) of any item, so a row the items set anyway
--    keeps its id;
-- 3. deletes the rows in `remove_ids` ("Syns inte längre") that are the
--    caller's, lie in `place`, and have an ingredient that no item sets in
--    `place`, so a contradictory request never removes what it adds;
-- 4. keeps the rows step 3 removed in pantry_removal under the caller's
--    operation id (20261026122008_pantry_removal.sql), so "Ångra" puts them
--    back with restore_pantry_removal(operation_id). Removals made while the
--    same confirmation shows send the same id, and their rows join the same
--    record, so one "Ångra" puts them all back. Rows replaced in step 2 are
--    not kept: confirming "Ändrat" is not undone, like a confirmation in
--    Story 6.2, and restoring a replaced unit next to the photo's would undo
--    half of a change that stays;
-- 5. sets the items with public.set_pantry_items(items), so the rules for
--    setting amounts (exactly per ingredient, location and unit; either
--    unlimited or amounts) live in one place. The advisory lock is taken
--    again there, which a transaction allows;
-- 6. returns one jsonb value, `{ set, removed, replaced, undoable }`: the
--    rows set and the rows removed (id, ingredient_id, location, amount,
--    unit), how many rows were replaced, and how many rows the operation's
--    record holds for "Ångra" (also rows an earlier call with the same id
--    removed, e.g. one whose answer was lost).
--
-- An id that does not meet its conditions (another user's or another
-- location's row, one already gone) is skipped without an error. Anything
-- that fails, e.g. an ingredient that is not in the caller's catalog
-- (23503 in set_pantry_items), rolls everything back. The function runs as
-- the caller (security invoker) and is executable by authenticated only.

create function public.apply_pantry_inventory(
  place text,
  items jsonb,
  replace_ids uuid[],
  remove_ids uuid[],
  operation_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
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

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  with gone as (
    delete from public.pantry_item as old
    where old.id = any (replace_ids)
      and old.user_id = caller
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
    insert into public.pantry_removal as record (id, removed_rows)
    values (operation_id, removed)
    on conflict on constraint pantry_removal_pkey
      do update set removed_rows = record.removed_rows || excluded.removed_rows;
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
    from public.set_pantry_items(items) with ordinality as saved;
  end if;

  return jsonb_build_object('set', set_rows, 'removed', removed, 'replaced', replaced, 'undoable', undoable);
end;
$$;

revoke all on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid) to authenticated;
