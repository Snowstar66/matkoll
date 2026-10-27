-- Brand and time on pantry items after review (Story 11.2, FR-42, AD-5,
-- AD-19, AD-20), follow-up to 20261026211834_pantry_label.sql. Only replaces
-- a check and functions, with the same signatures, grants, `security
-- invoker` and pantry_lock(); no row changes. The steps:
-- 1. pantry_item_label_check also refuses the blank-looking format
--    characters (blankLabelCodePoints) and a label of nothing but white
--    space.
-- 2. pantry_added_time(value): a time from a caller, never later than now()
--    or earlier than 2000-01-01, and refused (22023) when not finite.
-- 3. set_pantry_items: a label is never lost.
--    - An item's `label` sets the row's label. A null `label` removes it only
--      from the row being edited (replace_id); any other row keeps its own.
--    - `label_if_empty` (a photo's label) fills the label only when the row
--      has none, so the model's label never replaces one Pontus wrote.
--    - Without `label` the row keeps its label.
--    - The row replace_id removes passes its time and label to the first
--      item of its own ingredient only.
--    - A new row gets the time of the rows it replaces, and a row an item
--      lands on keeps the oldest time.
--    - `inherit_created_at` and `inherit_label` are the time and label of
--      rows apply_pantry_inventory replaced for the item.
-- 4. add_to_pantry: an unlimited item that replaces rows with amounts keeps
--    their time and label.
-- 5. restore_pantry_item: the time goes through pantry_added_time.
-- 6. restore_pantry_removal: each stored row is read inside its own block,
--    so a malformed row is skipped and never stops the others. A label the
--    check refuses now puts the row back without it.
-- 7. apply_pantry_inventory: a row replaced in another unit ("Ändrat")
--    passes its time and label to the first item of its ingredient in the
--    place only, through set_pantry_items.

-- 1. The label's check. The same rule as pantryLabelSchema, except that the
-- domain also wants a letter, digit, symbol or punctuation: a row the
-- database takes and the domain refuses is read without its label
-- (listPantryIn). The brackets are written as escapes, never literally
-- (tests/design/invisible-characters.test.ts), and are refusedCodePoints and
-- blankLabelCodePoints (tests/design/pantry-checks.test.ts).
alter table public.pantry_item drop constraint pantry_item_label_check;
alter table public.pantry_item
  add constraint pantry_item_label_check check (
    label is null
    or (
      label = btrim(label)
      and char_length(label) between 1 and 60
      and label !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
      and label !~ '[\u00ad\u034f\u115f\u2060\u3164]'
      and label ~ '[^[:space:]]'
    )
  );

-- 2. A time from a caller.
create function public.pantry_added_time(value text)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  added timestamptz;
begin
  if value is null then
    return null;
  end if;
  added := value::timestamptz;
  if not isfinite(added) then
    raise exception 'a time must be finite' using errcode = '22023';
  end if;
  return greatest(least(added, now()), '2000-01-01 00:00:00+00'::timestamptz);
end;
$$;

revoke all on function public.pantry_added_time(text) from public, anon, authenticated, service_role;
grant execute on function public.pantry_added_time(text) to authenticated;

-- 3. setPantryItems (AD-19).
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
  -- The row replace_id removed, for the first item of its ingredient.
  replaced_ingredient uuid;
  replaced_created_at timestamptz;
  replaced_label text;
  replaced_taken boolean := false;
  takes_replaced boolean;
  -- The other kind of row (unlimited or amounts) an item removed.
  gone_created_at timestamptz;
  gone_label text;
  -- What a new row gets, and a row an item lands on keeps the oldest of.
  inherited_created_at timestamptz;
  inherited_label text;
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
    returning old.ingredient_id, old.created_at, old.label
    into replaced_ingredient, replaced_created_at, replaced_label;
  end if;

  for item in
    select
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit,
      -- A missing key keeps the label.
      element.value ? 'label' as has_label,
      element.value ->> 'label' as label,
      coalesce((element.value ->> 'label_if_empty')::boolean, false) as label_if_empty,
      public.pantry_added_time(element.value ->> 'inherit_created_at') as inherit_created_at,
      element.value ->> 'inherit_label' as inherit_label
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

    takes_replaced := not replaced_taken
      and replaced_ingredient is not null
      and item.ingredient_id = replaced_ingredient;
    if takes_replaced then
      replaced_taken := true;
    end if;
    -- least() skips nulls.
    inherited_created_at := least(
      case when takes_replaced then replaced_created_at end,
      item.inherit_created_at,
      gone_created_at
    );
    inherited_label := coalesce(case when takes_replaced then replaced_label end, item.inherit_label, gone_label);

    return query
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit, label, created_at)
      values (
        target,
        item.ingredient_id,
        item.location,
        item.amount,
        item.unit,
        case
          when item.has_label and not item.label_if_empty then item.label
          when item.has_label then coalesce(inherited_label, item.label)
          else inherited_label
        end,
        coalesce(inherited_created_at, now())
      )
      on conflict on constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
        do update set
          amount = excluded.amount,
          created_at = least(existing.created_at, inherited_created_at),
          label = case
            when item.has_label and not item.label_if_empty and item.label is not null then item.label
            -- Removed only from the row being edited; another row keeps its own.
            when item.has_label and not item.label_if_empty and existing.id = replace_id then null
            when item.has_label and not item.label_if_empty then existing.label
            when item.has_label then coalesce(existing.label, inherited_label, item.label)
            else coalesce(existing.label, inherited_label)
          end
      returning existing.*;
  end loop;
end;
$$;

revoke all on function public.set_pantry_items(jsonb, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_pantry_items(jsonb, uuid, uuid) to authenticated;

-- 4. addToPantry (AD-19), as in 20261026150611_pantry_site.sql. It never
-- sets a label; an unlimited item that replaces rows with amounts keeps
-- their oldest time and first label.
create or replace function public.add_to_pantry(items jsonb, site uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target uuid;
  -- The largest amount pantry_item keeps.
  max_amount constant numeric := 999999.999;
  item record;
  receipt uuid;
  handled integer := 0;
  gone_created_at timestamptz;
  gone_label text;
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
  target := public.pantry_target_site(site);

  delete from public.pantry_addition as old
  where old.user_id = caller and old.created_at < now() - interval '30 days';

  for item in
    select
      element.value ->> 'key' as key,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      -- least() skips nulls, so an item without amount stays without one.
      case
        when element.value ->> 'amount' is null then null
        else least((element.value ->> 'amount')::numeric, max_amount)
      end as amount,
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
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.unit is null
    ) then
      continue;
    end if;

    if item.amount is null then
      with gone as (
        delete from public.pantry_item as other
        where other.user_id = caller
          and other.site_id = target
          and other.ingredient_id = item.ingredient_id
          and other.location = item.location
          and other.unit is not null
        returning other.created_at, other.label
      )
      select
        min(gone.created_at),
        (array_agg(gone.label order by gone.created_at) filter (where gone.label is not null))[1]
      into gone_created_at, gone_label
      from gone;
      insert into public.pantry_item (site_id, ingredient_id, location, amount, unit, label, created_at)
      values (target, item.ingredient_id, item.location, null, null, gone_label, coalesce(gone_created_at, now()));
    else
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit)
      values (target, item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key
        do update set amount = least(existing.amount + excluded.amount, max_amount);
    end if;
  end loop;

  return handled;
end;
$$;

revoke all on function public.add_to_pantry(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.add_to_pantry(jsonb, uuid) to authenticated;

-- 5. restorePantryItem, "Ångra" for one row (AD-20), as in
-- 20261026211834_pantry_label.sql, with the time through pantry_added_time.
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
  item_created_at := coalesce(public.pantry_added_time(item ->> 'created_at'), now());
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

-- 6. restorePantryRemoval, "Ångra" for a removal (AD-20), as in
-- 20261026211834_pantry_label.sql. Each stored row is read in its own block:
-- a malformed one is skipped and counted, and the others go back.
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
  readable boolean;
  stored jsonb;
  element record;
  item_id uuid;
  item_ingredient_id uuid;
  item_location text;
  item_amount numeric;
  item_unit text;
  item_label text;
  item_created_at timestamptz;
  stored_label text;
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

  for element in
    select stored_row.value
    from jsonb_array_elements(stored) with ordinality as stored_row (value, position)
    order by stored_row.position
  loop
    -- The row's own place, or one resolved once for the rows without one.
    readable := true;
    begin
      row_site := (element.value ->> 'site_id')::uuid;
    exception
      when data_exception then
        readable := false;
    end;
    if readable and row_site is null then
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
    if not readable or row_site is null then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      item_id := (element.value ->> 'id')::uuid;
      item_ingredient_id := (element.value ->> 'ingredient_id')::uuid;
      item_location := element.value ->> 'location';
      item_amount := (element.value ->> 'amount')::numeric;
      item_unit := element.value ->> 'unit';
      item_label := element.value ->> 'label';
      -- A record stored before 20261026211834_pantry_label.sql has no time: now().
      item_created_at := coalesce(public.pantry_added_time(element.value ->> 'created_at'), now());
      if item_id is null then
        raise exception 'a stored row needs its id' using errcode = '22023';
      end if;

      -- A place that is gone, a taken id, or the item in the location again:
      -- skipped, the row there stays. The place is held until the
      -- transaction ends, so it cannot go before the insert.
      perform 1
      from public.pantry_site as own
      where own.id = row_site
        and own.user_id = caller
      for key share;
      if not found
        or exists (select 1 from public.pantry_item as other where other.id = item_id)
        or public.pantry_place_has_item(item_ingredient_id, item_location, item_unit, row_site) then
        skipped := skipped + 1;
      else
        begin
          insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
          values (item_id, row_site, item_ingredient_id, item_location, item_amount, item_unit, item_label, item_created_at)
          returning label into stored_label;
        exception
          -- A label the check refuses now: the row goes back without it. Any
          -- other refusal fails again here and is skipped below.
          when check_violation then
            insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
            values (item_id, row_site, item_ingredient_id, item_location, item_amount, item_unit, null, item_created_at)
            returning label into stored_label;
        end;
        restored := restored || jsonb_build_object(
          'id', item_id,
          'site_id', row_site,
          'ingredient_id', item_ingredient_id,
          'location', item_location,
          'amount', item_amount,
          'unit', item_unit,
          'label', stored_label,
          'created_at', item_created_at
        );
      end if;
    exception
      -- A malformed stored row (22xxx), the catalog ingredient gone (23503),
      -- an id another user's row has (23505, hidden by RLS above), or a row
      -- the table no longer accepts: skipped, the rest go back.
      when data_exception or foreign_key_violation or unique_violation or check_violation or not_null_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;

revoke all on function public.restore_pantry_removal(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_removal(uuid, uuid) to authenticated;

-- 7. confirmPantryInventory's write (Story 6.4), as in
-- 20261026211834_pantry_label.sql. A row replaced in another unit passes its
-- time and label to the first item of its ingredient in the place, and to
-- no other: set_pantry_items gets them as that item's inherit_created_at and
-- inherit_label. The client's own inherit keys are dropped.
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
  set_items jsonb;
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
    -- The heir of each ingredient's replaced rows: its first item in the place.
    with inherited as (
      select
        (old.value ->> 'ingredient_id')::uuid as ingredient_id,
        min((old.value ->> 'created_at')::timestamptz) as created_at,
        (array_agg(old.value ->> 'label' order by (old.value ->> 'created_at')::timestamptz)
          filter (where old.value ->> 'label' is not null))[1] as label
      from jsonb_array_elements(replaced_rows) as old (value)
      group by 1
    ),
    heirs as (
      select distinct on (candidate.ingredient_id) candidate.ingredient_id, candidate.position
      from (
        select (element.value ->> 'ingredient_id')::uuid as ingredient_id, element.position
        from jsonb_array_elements(items) with ordinality as element (value, position)
        where element.value ->> 'location' = place
      ) as candidate
      order by candidate.ingredient_id, candidate.position
    )
    select jsonb_agg(
      case
        when inherited.ingredient_id is not null then
          (element.value - 'inherit_created_at' - 'inherit_label')
            || jsonb_build_object('inherit_created_at', inherited.created_at, 'inherit_label', inherited.label)
        else element.value - 'inherit_created_at' - 'inherit_label'
      end
      order by element.position
    )
    into set_items
    from jsonb_array_elements(items) with ordinality as element (value, position)
    left join heirs on heirs.position = element.position
    left join inherited on inherited.ingredient_id = heirs.ingredient_id;

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
        order by saved.ordinality
      ),
      '[]'::jsonb
    )
    into set_rows
    from public.set_pantry_items(set_items, null, target) with ordinality as saved;
  end if;

  return jsonb_build_object('set', set_rows, 'removed', removed, 'replaced', replaced, 'undoable', undoable);
end;
$$;

revoke all on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_pantry_inventory(text, jsonb, uuid[], uuid[], uuid, uuid) to authenticated;
