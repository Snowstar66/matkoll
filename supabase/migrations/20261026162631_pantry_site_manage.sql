-- Choosing and managing places in Hemma (Story 8.2, FR-29, FR-30, AD-4,
-- AD-24): adds, renames, selects and deletes a user's places. Only adds
-- functions and a trigger; no row, table or column changes.
--
-- 1. The limit of 10 places per user (maxSites in
--    src/features/pantry/domain/site.ts) is held by a trigger on
--    pantry_site, so a direct write through PostgREST is refused too
--    (MK422), and not only save_pantry_site.
-- 2. save_pantry_site(site_id, site_name, site_normalized_name, mode) adds a
--    place (mode `add`) or renames one (mode `rename`).
-- 3. select_pantry_site(site_id) makes a place the selected one.
-- 4. delete_pantry_site(site_id) deletes an empty place that is not
--    selected.
--
-- Every function is security invoker, has `set search_path = ''`, takes
-- pantry_lock() before anything else, so it runs after every other pantry
-- write of the user's, and can only be executed by authenticated. The error
-- codes, in the family of MK409 and MK410:
-- - MK410: the place is not one of the caller's (gone, or another user's);
-- - MK422: the user has 10 places already;
-- - MK423: the place is selected, has items or is the user's last.
--
-- Names are normalized only by src/features/pantry/domain/site.ts
-- (normalizeSiteName, AD-24): save_pantry_site stores the normalized name it
-- is given and never computes one. The table's checks still hold for the
-- name, so a forged call cannot store an invalid one.

-- 1. At most 10 places per user, for every insert, under the owner's pantry
-- lock (pantry_owner_lock, the same key as pantry_lock()), so two inserts at
-- once cannot both pass the count. The pantry functions hold the lock
-- already; it is taken again in the same transaction, which is allowed. An
-- authenticated caller inserting for another user is 42501 from the lock, as
-- RLS would refuse it. The limit must equal maxSites
-- (tests/design/pantry-site-checks.test.ts). Never executed directly.
create function public.pantry_site_check_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  max_places constant integer := 10;
  places integer;
begin
  perform public.pantry_owner_lock(new.user_id);
  select count(*) into places
  from public.pantry_site as own
  where own.user_id = new.user_id;
  if places >= max_places then
    raise exception 'a user has at most % places', max_places using errcode = 'MK422';
  end if;
  return new;
end;
$$;

revoke all on function public.pantry_site_check_limit() from public, anon, authenticated, service_role;

create trigger pantry_site_check_limit
  before insert on public.pantry_site
  for each row
  execute function public.pantry_site_check_limit();

-- 2. savePantrySite (FR-29), as save_store after Story 7.1's review:
-- - site_id is chosen by the client when the sheet Ställen opens, and kept
--   until the name changes, so a retry after a lost answer saves one place.
-- - mode `add`: the caller's place with the id gets the name (a retry);
--   otherwise a user with 10 places is MK422, and the place is added, not
--   selected (a new place is never selected by itself).
-- - mode `rename`: the caller's place with the id gets the name; a place
--   that is gone, or another user's, is MK410, and nothing is written.
-- - The same normalized name as another of the caller's places is 23505 on
--   pantry_site_user_id_normalized_name_key; the table's checks give 23514;
--   an id another user has is 23505 on pantry_site_pkey.
-- - A user without places gets Hemma first (pantry_selected_site), so the
--   new place is never the only one, and the selection rule holds.
-- - Missing values or an unknown mode are 22023; no session is 42501.
create function public.save_pantry_site(site_id uuid, site_name text, site_normalized_name text, mode text)
returns public.pantry_site
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  max_places constant integer := 10;
  places integer;
  saved public.pantry_site;
begin
  if caller is null then
    raise exception 'save_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if save_pantry_site.site_id is null
    or site_name is null
    or site_normalized_name is null
    or save_pantry_site.mode is null
    or save_pantry_site.mode not in ('add', 'rename')
  then
    raise exception 'save_pantry_site needs an id, a name, a normalized name and mode add or rename'
      using errcode = '22023';
  end if;

  perform public.pantry_lock();
  perform public.pantry_selected_site();

  update public.pantry_site as own
  set name = site_name, normalized_name = site_normalized_name
  where own.id = save_pantry_site.site_id
    and own.user_id = caller
  returning own.* into saved;
  if found then
    return saved;
  end if;

  if save_pantry_site.mode = 'rename' then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  -- The trigger holds the limit for every insert; checked here first, so the
  -- answer does not depend on the order of the checks.
  select count(*) into places
  from public.pantry_site as own
  where own.user_id = caller;
  if places >= max_places then
    raise exception 'a user has at most % places', max_places using errcode = 'MK422';
  end if;

  insert into public.pantry_site (id, user_id, name, normalized_name, is_selected)
  values (save_pantry_site.site_id, caller, site_name, site_normalized_name, false)
  returning * into saved;
  return saved;
end;
$$;

revoke all on function public.save_pantry_site(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.save_pantry_site(uuid, text, text, text) to authenticated;

-- 3. selectPantrySite (FR-30, FR-31), the only way the app changes the
-- selected place (AD-24), as select_store: under the pantry lock, so two
-- selections at once run one after the other and the last one wins. A place
-- the caller does not have is MK410, and nothing changes. Otherwise every
-- other place of the caller's is cleared and then this one set, in two
-- statements: the partial unique index pantry_site_one_selected_per_user is
-- checked per row, and pantry_site_one_selected at commit, when exactly one
-- is selected. Selecting the selected place changes nothing. Returns the
-- place.
create function public.select_pantry_site(site_id uuid)
returns public.pantry_site
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  chosen public.pantry_site;
begin
  if caller is null then
    raise exception 'select_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if select_pantry_site.site_id is null then
    raise exception 'select_pantry_site needs an id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  perform 1
  from public.pantry_site as own
  where own.id = select_pantry_site.site_id
    and own.user_id = caller
  for update;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  update public.pantry_site as own
  set is_selected = false
  where own.user_id = caller
    and own.is_selected
    and own.id <> select_pantry_site.site_id;

  update public.pantry_site as own
  set is_selected = true
  where own.id = select_pantry_site.site_id
    and own.user_id = caller
    and not own.is_selected;

  select own.* into chosen
  from public.pantry_site as own
  where own.id = select_pantry_site.site_id
    and own.user_id = caller;
  return chosen;
end;
$$;

revoke all on function public.select_pantry_site(uuid) from public, anon, authenticated, service_role;
grant execute on function public.select_pantry_site(uuid) to authenticated;

-- 4. deletePantrySite (FR-29): deletes the caller's place when it is empty,
-- not selected and not the last, without asking and without "Ångra" (nothing
-- is lost). A place the caller does not have is false: it is gone already,
-- which is what was asked for. The selected place, a place with items and
-- the last place are MK423, and nothing changes. Records in pantry_removal
-- with rows on the place stay; their "Ångra" skips those rows
-- (restore_pantry_removal, Story 8.1). Returns true when it deleted.
create function public.delete_pantry_site(site_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  selected boolean;
begin
  if caller is null then
    raise exception 'delete_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if delete_pantry_site.site_id is null then
    raise exception 'delete_pantry_site needs an id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  select own.is_selected into selected
  from public.pantry_site as own
  where own.id = delete_pantry_site.site_id
    and own.user_id = caller
  for update;
  if not found then
    return false;
  end if;

  if selected
    or exists (
      select 1
      from public.pantry_item as item
      where item.user_id = caller
        and item.site_id = delete_pantry_site.site_id
    )
    or not exists (
      select 1
      from public.pantry_site as other
      where other.user_id = caller
        and other.id <> delete_pantry_site.site_id
    )
  then
    raise exception 'the place is selected, has items or is the last one' using errcode = 'MK423';
  end if;

  delete from public.pantry_site as own
  where own.id = delete_pantry_site.site_id
    and own.user_id = caller;
  return true;
end;
$$;

revoke all on function public.delete_pantry_site(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_pantry_site(uuid) to authenticated;
