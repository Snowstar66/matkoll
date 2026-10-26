-- Places in the pantry after review (Story 8.1, AD-4, AD-19, AD-20, AD-24),
-- follow-up to 20261026150611_pantry_site.sql and
-- 20261026151553_pantry_site_default.sql. Only adds and replaces functions;
-- no row changes.
--
-- 1. "A user with places has exactly one selected" is enforced by the
--    database: a deferred constraint trigger checks it at commit, so a
--    selection that clears one place and sets another in one transaction
--    (select_pantry_site, Story 8.2) passes, and a user deleted with all
--    places passes. Anything else is 23514 (check_violation) with the
--    constraint name pantry_site_one_selected.
-- 2. pantry_selected_site no longer selects the oldest place: with (1) a user
--    with places always has a selected one, so the branch could not be
--    reached. It creates Hemma only when the user has no places, under the
--    owner's pantry lock (pantry_owner_lock, the same key as pantry_lock()),
--    so it never writes outside the serialised path. ensure_pantry_defaults()
--    calls it, so it too creates Hemma only for a user without places.
-- 3. pantry_target_site reads the place `for key share` until the
--    transaction ends: a delete of the place waits, and the write that
--    follows never meets 23503 instead of MK410.
-- 4. restore_pantry_removal resolves the place for a stored row without
--    site_id only when it meets one: a stale or deleted `site` never blocks
--    rows that have their own place. A row without a place to go to is
--    skipped and counted in `skipped`.
-- 5. empty_pantry_place looks up the stored record for the operation id
--    before it resolves the place: a replay returns the record as before,
--    also after the place was deleted (not MK410). A replay with a `site`
--    other than the stored rows' place is MK409.
-- 6. restore_pantry_item keeps its order of places, now documented on the
--    function: the item's own site_id, then `site`, then the selected place.
-- 7. pantry_item_site_fkey becomes `on delete no action`: deleting a place
--    with items is still refused, at the end of the statement, and the
--    cascade from auth.users never depends on the order in which it deletes
--    pantry_site and pantry_item.
--
-- A note for later migrations: the pantry_removal backfill in
-- 20261026150611_pantry_site.sql assumed that removed_rows is an array (as
-- pantry_removal_removed_rows_check requires); scripts/pantry-site-check.sql
-- flags any record that is not.

-- 1. One selected place per user with places, checked at commit.
create function public.pantry_site_check_selected()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owners uuid[];
  owner_id uuid;
  places integer;
  selected integer;
begin
  -- Only the cascade from auth.users reaches here without the right to read
  -- pantry_site (the auth service deleting a user); it removes every place
  -- of the user, which the rule allows.
  if not has_table_privilege('public.pantry_site', 'select') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    owners := array[new.user_id];
  elsif tg_op = 'DELETE' then
    owners := array[old.user_id];
  else
    owners := array[old.user_id, new.user_id];
  end if;

  foreach owner_id in array owners loop
    select count(*), count(*) filter (where own.is_selected)
    into places, selected
    from public.pantry_site as own
    where own.user_id = owner_id;
    if places > 0 and selected <> 1 then
      raise exception 'a user with places has exactly one selected place'
        using errcode = '23514', constraint = 'pantry_site_one_selected';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.pantry_site_check_selected() from public, anon, authenticated, service_role;

create constraint trigger pantry_site_one_selected
  after insert or update or delete on public.pantry_site
  deferrable initially deferred
  for each row
  execute function public.pantry_site_check_selected();

-- 2. The pantry lock of `owner`, the same key as pantry_lock(), for code that
-- writes for an owner without a session of their own (the service role's
-- inserts through pantry_item_fill_site). A signed-in caller may only take
-- their own (42501 otherwise). Execute for authenticated and service_role.
create function public.pantry_owner_lock(owner uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if owner is null or (caller is not null and caller <> owner) then
    raise exception 'pantry_owner_lock takes only the caller''s own lock' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || owner::text));
end;
$$;

revoke all on function public.pantry_owner_lock(uuid) from public, anon, authenticated, service_role;
grant execute on function public.pantry_owner_lock(uuid) to authenticated, service_role;

-- The selected place of `owner` (the signed-in user when null). A user
-- without places gets Hemma, selected, created under the owner's pantry lock;
-- a user with places always has a selected one (pantry_site_one_selected).
-- Only writes call it. RLS keeps another owner than the caller out of reach,
-- and so does pantry_owner_lock (42501). Same signature and grants as before.
create or replace function public.pantry_selected_site(owner uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  who uuid := coalesce(owner, auth.uid());
  chosen uuid;
begin
  if who is null then
    raise exception 'pantry_selected_site needs a signed-in user or an owner' using errcode = '42501';
  end if;

  select own.id into chosen
  from public.pantry_site as own
  where own.user_id = who
    and own.is_selected;
  if found then
    return chosen;
  end if;

  -- No places: Hemma, once, under the owner's lock. Another writer may have
  -- created it while this one waited.
  perform public.pantry_owner_lock(who);

  select own.id into chosen
  from public.pantry_site as own
  where own.user_id = who
    and own.is_selected;
  if found then
    return chosen;
  end if;

  insert into public.pantry_site (user_id, name, normalized_name, is_selected)
  values (who, 'Hemma', 'hemma', true)
  on conflict do nothing
  returning id into chosen;
  if not found then
    raise exception 'the selected place could not be created' using errcode = 'P0002';
  end if;
  return chosen;
end;
$$;

-- 3. The place a pantry write goes to, held `for key share` until the
-- transaction ends. Null is the selected place; an id must be one of the
-- caller's places, otherwise MK410 and the caller writes nothing. Same
-- signature and grants as before.
create or replace function public.pantry_target_site(site uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  candidate uuid;
begin
  if caller is null then
    raise exception 'pantry_target_site needs a signed-in user' using errcode = '42501';
  end if;
  candidate := coalesce(site, public.pantry_selected_site());
  perform 1
  from public.pantry_site as own
  where own.id = candidate
    and own.user_id = caller
  for key share;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;
  return candidate;
end;
$$;

-- 4. restorePantryRemoval, "Ångra" for a removal (AD-20): each row goes back
-- to its own place (site_id). Only a stored row without site_id needs
-- another place: `site` when it is one of the caller's, or the selected
-- place when `site` is null, resolved once, when the first such row comes.
-- A row whose place is gone, or that has no place to go to, is skipped and
-- counted in `skipped`. Same signature and grants as before.
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
      element.value ->> 'unit' as unit
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
      insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit)
      values (item.id, row_site, item.ingredient_id, item.location, item.amount, item.unit);
      restored := restored || jsonb_build_object(
        'id', item.id,
        'site_id', row_site,
        'ingredient_id', item.ingredient_id,
        'location', item.location,
        'amount', item.amount,
        'unit', item.unit
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

-- 5. emptyPantryPlace ("Töm kylen"): the stored record for the operation id
-- is looked up first. A replay returns it as before, without resolving the
-- place, so a place deleted since gives the record and not MK410; a replay
-- with a `site` other than the stored rows' place is MK409. Otherwise the
-- place is resolved and its rows in the location are removed and stored, as
-- before. Same signature and grants as before.
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
        'unit', removed.unit
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

-- 6. The order of places for restore_pantry_item, unchanged.
comment on function public.restore_pantry_item(jsonb, uuid) is
  'restorePantryItem, "Ångra" for one row (AD-20): the row goes back to the item''s own site_id when it has one, '
  'otherwise to `site`, otherwise to the selected place. A place that is not the caller''s is MK410; '
  'the location having the item again is 23505. Nothing is written then.';

-- 7. The place's foreign key, checked at the end of the statement.
alter table public.pantry_item drop constraint pantry_item_site_fkey;
alter table public.pantry_item
  add constraint pantry_item_site_fkey foreign key (site_id, user_id)
    references public.pantry_site (id, user_id) on delete no action;
