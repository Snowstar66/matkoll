-- Brand and time on pantry items (Story 11.2, FR-42, AD-5, AD-19, AD-20):
-- a pantry item keeps its brand or kind ("Arla laktosfri") in a new column,
-- and created_at means "added" ("Tillagd"): it stays when the amount
-- changes, when a row is replaced (another unit or location) and after
-- "Ångra".
--
-- This migration only adds a column and replaces functions with the same
-- signatures, grants, `security invoker` and pantry_lock(). No row changes:
-- every pantry_item row keeps its id, amount and created_at, and label is
-- null on all of them. It works with the code before the story (AD-5): a
-- caller that sends no label gets the same behaviour as before, apart from
-- created_at, which now stays where it used to be renewed.
--
-- The Supabase CLI applies the file in one transaction. The steps:
-- 1. pantry_item.label, null or 1–60 characters without spaces at either
--    end and without the characters one-line texts never hold.
-- 2. set_pantry_items reads `label` per item: a missing key keeps the label,
--    null removes it, a text sets it. A row it replaces (replace_id, or the
--    other kind of row for the ingredient and location) passes its
--    created_at, and its label when the item has none, to the new row.
-- 3. restore_pantry_item puts created_at and label back.
-- 4. empty_pantry_place keeps created_at and label in pantry_removal.
-- 5. restore_pantry_removal puts them back; an older record without them
--    gives now() and null.
-- 6. apply_pantry_inventory keeps them for its removals, and a row it
--    replaces ("Ändrat" in another unit) passes them on as in step 2.
--
-- A created_at from a caller is never later than now(). add_to_pantry is
-- unchanged: it never touches label, and a new row gets null.

-- 1. The column (AD-19). The same rule is pantryLabelSchema in
-- src/features/pantry/domain/pantry-item-form.ts; the bracket refuses exactly
-- refusedCodePoints (src/lib/one-line.ts), written as escapes, never
-- literally (tests/design/invisible-characters.test.ts), and the limit is
-- maxPantryLabelLength (tests/design/pantry-checks.test.ts).
alter table public.pantry_item add column label text;

alter table public.pantry_item
  add constraint pantry_item_label_check check (
    label is null
    or (
      label = btrim(label)
      and char_length(label) between 1 and 60
      and label !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
    )
  );

-- 2. setPantryItems (AD-19), as in 20261026150611_pantry_site.sql, with the
-- label and the time of a replaced row.
create or replace function public.set_pantry_items(items jsonb, replace_id uuid default null, site uuid default null)
returns setof public.pantry_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  item record;
  -- The row replace_id removed: its time and label go to the new row.
  replaced_created_at timestamptz;
  replaced_label text;
  -- The other kind of row (unlimited or amounts) an item removed.
  gone_created_at timestamptz;
  gone_label text;
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
      )
    returning old.created_at, old.label into replaced_created_at, replaced_label;
  end if;

  for item in
    select
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit,
      -- A missing key keeps the label; null removes it.
      element.value ? 'label' as has_label,
      element.value ->> 'label' as label
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    with gone as (
      delete from public.pantry_item as other
      where other.user_id = caller
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and (case when item.amount is null then other.unit is not null else other.unit is null end)
      returning other.created_at, other.label
    )
    select
      min(gone.created_at),
      (array_agg(gone.label order by gone.created_at) filter (where gone.label is not null))[1]
    into gone_created_at, gone_label
    from gone;

    -- A new row is as old as the oldest row it replaces; least() skips nulls.
    return query
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit, label, created_at)
      values (
        target,
        item.ingredient_id,
        item.location,
        item.amount,
        item.unit,
        case when item.has_label then item.label else coalesce(replaced_label, gone_label) end,
        coalesce(least(replaced_created_at, gone_created_at), now())
      )
      on conflict on constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
        do update set
          amount = excluded.amount,
          label = case when item.has_label then excluded.label else existing.label end
      returning existing.*;
  end loop;
end;
$$;

revoke all on function public.set_pantry_items(jsonb, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_items(jsonb, uuid, uuid) to authenticated;

-- 3. restorePantryItem, "Ångra" for one row (AD-20), as in
-- 20261026150611_pantry_site.sql, with the row's created_at and label. A
-- created_at that is missing or later than now() is now(); a missing label
-- is null.
create or replace function public.restore_pantry_item(item jsonb, site uuid default null)
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
  item_label text;
  item_created_at timestamptz;
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
  item_label := item ->> 'label';
  item_created_at := least(coalesce((item ->> 'created_at')::timestamptz, now()), now());
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(coalesce(item_site_id, site));

  if public.pantry_place_has_item(item_ingredient_id, item_location, item_unit, target) then
    raise exception 'the location has the item again' using errcode = '23505';
  end if;

  insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
  values (item_id, target, item_ingredient_id, item_location, item_amount, item_unit, item_label, item_created_at)
  returning * into restored;
  return restored;
end;
$$;

revoke all on function public.restore_pantry_item(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_item(jsonb, uuid) to authenticated;

comment on function public.restore_pantry_item(jsonb, uuid) is
  'restorePantryItem, "Ångra" for one row (AD-20): the row goes back to the item''s own site_id when it has one, '
  'otherwise to `site`, otherwise to the selected place, with its created_at (never later than now()) and label. '
  'A place that is not the caller''s is MK410; the location having the item again is 23505. Nothing is written then.';

-- 4. emptyPantryPlace ("Töm kylen"), as in
-- 20261026153024_pantry_site_hardening.sql: each stored row also has its
-- created_at and label.
create or replace function public.empty_pantry_place(place text, operation_id uuid, site uuid default null)
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

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  -- The same operation again: what it removed, without removing anything more.
  select record.removed_rows into stored
  from public.pantry_removal as record
  where record.user_id = caller
    and record.id = operation_id;

  if found then
    if site is not null and exists (
      select 1
      from jsonb_array_elements(stored) as element (value)
      where element.value ->> 'site_id' is distinct from site::text
    ) then
      raise exception 'the operation id belongs to another place' using errcode = 'MK409';
    end if;
    return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
  end if;

  target := public.pantry_target_site(site);

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
        'unit', removed.unit,
        'label', removed.label,
        'created_at', removed.created_at
      )
      order by removed.id
    ),
    '[]'::jsonb
  )
  into stored
  from removed;

  insert into public.pantry_removal (id, removed_rows)
  values (operation_id, stored);

  return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
end;
$$;

revoke all on function public.empty_pantry_place(text, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.empty_pantry_place(text, uuid, uuid) to authenticated;

-- 5. restorePantryRemoval, "Ångra" for a removal (AD-20), as in
-- 20261026153024_pantry_site_hardening.sql, with each row's created_at
-- (never later than now()) and label. A record stored before this
-- migration has neither: its rows come back with now() and null.
create or replace function public.restore_pantry_removal(operation_id uuid, site uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  fallback uuid;
  fallback_resolved boolean := false;
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
      element.value ->> 'unit' as unit,
      element.value ->> 'label' as label,
      least(coalesce((element.value ->> 'created_at')::timestamptz, now()), now()) as created_at
    from jsonb_array_elements(stored) with ordinality as element (value, position)
    order by element.position
  loop
    if item.site_id is not null then
      row_site := item.site_id;
    else
      if not fallback_resolved then
        fallback_resolved := true;
        if site is null then
          fallback := public.pantry_selected_site();
        else
          select own.id into fallback
          from public.pantry_site as own
          where own.id = site
            and own.user_id = caller;
        end if;
      end if;
      row_site := fallback;
    end if;

    -- No place, a place that is gone, a taken id, or the item in the
    -- location again: skipped, the row there stays. The place is held until
    -- the transaction ends, so it cannot go before the insert.
    if row_site is null or item.id is null then
      skipped := skipped + 1;
      continue;
    end if;
    perform 1
    from public.pantry_site as own
    where own.id = row_site
      and own.user_id = caller
    for key share;
    if not found
      or exists (select 1 from public.pantry_item as other where other.id = item.id)
      or public.pantry_place_has_item(item.ingredient_id, item.location, item.unit, row_site) then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
      values (item.id, row_site, item.ingredient_id, item.location, item.amount, item.unit, item.label, item.created_at);
      restored := restored || jsonb_build_object(
        'id', item.id,
        'site_id', row_site,
        'ingredient_id', item.ingredient_id,
        'location', item.location,
        'amount', item.amount,
        'unit', item.unit,
        'label', item.label,
        'created_at', item.created_at
      );
    exception
      -- The catalog ingredient is gone (23503), an id another user's row has
      -- (23505, hidden by RLS above), or a stored row the table no longer
      -- accepts: skipped, the rest go back.
      when foreign_key_violation or unique_violation or check_violation or not_null_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;

revoke all on function public.restore_pantry_removal(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_removal(uuid, uuid) to authenticated;

-- 6. confirmPantryInventory's write (Story 6.4), as in
-- 20261026184443_pantry_inventory_operation_site.sql: the removals keep
-- their created_at and label for "Ångra", the items' labels go through
-- set_pantry_items, and a row of an item's ingredient replaced in another
-- unit ("Ändrat") passes its created_at, and its label when the item has
-- none, to the row set for that ingredient, as set_pantry_items does for
-- the row it replaces. The answer's rows have created_at and label.
create or replace function public.apply_pantry_inventory(
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
  replaced_rows jsonb := '[]'::jsonb;
  removed jsonb := '[]'::jsonb;
  set_ids uuid[] := '{}';
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

  -- Story 8.4: the caller's record for the operation keeps rows of one place
  -- only. An operation id whose record has a row of another place (or one
  -- without a place) is MK409 before anything is written, so removals never
  -- join another place's "Ångra" in silence.
  if operation_id is not null and exists (
    select 1
    from public.pantry_removal as record,
      jsonb_array_elements(record.removed_rows) as element (value)
    where record.user_id = caller
      and record.id = operation_id
      and element.value ->> 'site_id' is distinct from target::text
  ) then
    raise exception 'the operation id belongs to another place' using errcode = 'MK409';
  end if;

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
    returning old.ingredient_id, old.created_at, old.label
  )
  select
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object('ingredient_id', gone.ingredient_id, 'created_at', gone.created_at, 'label', gone.label)
      ),
      '[]'::jsonb
    )
  into replaced, replaced_rows
  from gone;

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
        'unit', gone.unit,
        'label', gone.label,
        'created_at', gone.created_at
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
    select coalesce(array_agg(saved.id order by saved.ordinality), '{}')
    into set_ids
    from public.set_pantry_items(items, null, target) with ordinality as saved;

    -- A replaced row's time, and its label when the item has none, go to the
    -- rows set for its ingredient: the same item, counted in another unit.
    if replaced > 0 then
      update public.pantry_item as saved
      set created_at = least(saved.created_at, inherited.created_at),
          label = case
            when exists (
              select 1
              from jsonb_array_elements(items) as element (value)
              where (element.value ->> 'ingredient_id')::uuid = saved.ingredient_id
                and element.value ? 'label'
            ) then saved.label
            else coalesce(saved.label, inherited.label)
          end
      from (
        select
          (old.value ->> 'ingredient_id')::uuid as ingredient_id,
          min((old.value ->> 'created_at')::timestamptz) as created_at,
          (array_agg(old.value ->> 'label' order by (old.value ->> 'created_at')::timestamptz)
            filter (where old.value ->> 'label' is not null))[1] as label
        from jsonb_array_elements(replaced_rows) as old (value)
        group by 1
      ) as inherited
      where saved.id = any (set_ids)
        and saved.user_id = caller
        and saved.ingredient_id = inherited.ingredient_id;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', saved.id,
          'site_id', saved.site_id,
          'ingredient_id', saved.ingredient_id,
          'location', saved.location,
          'amount', saved.amount,
          'unit', saved.unit,
          'label', saved.label,
          'created_at', saved.created_at
        )
        order by ids.position
      ),
      '[]'::jsonb
    )
    into set_rows
    from unnest(set_ids) with ordinality as ids (id, position)
    join public.pantry_item as saved on saved.id = ids.id;
  end if;

  return jsonb_build_object('set', set_rows, 'removed', removed, 'replaced', replaced, 'undoable', undoable);
end;
$$;

revoke all on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid) to authenticated;
