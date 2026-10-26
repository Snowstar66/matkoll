-- apply_pantry_inventory after review (Story 6.4, AD-19, AD-20), replacing
-- the function from 20261026124016_pantry_apply_inventory.sql with the same
-- signature and the same steps, except how the removed rows are kept:
-- - The rows join the caller's own record for the operation id (user_id =
--   auth.uid() named, as well as RLS), and the record's created_at becomes
--   now(), so a record that removals keep joining is never pruned under
--   them.
-- - Otherwise a new record is inserted for the caller. The key is (user_id,
--   id), so another user's record with the same id never collides. An insert
--   that collides all the same (the same id inserted at the same moment)
--   raises MK409, "the operation id is taken", and nothing is written; the
--   action tries once more with a new id.

create or replace function public.apply_pantry_inventory(
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
