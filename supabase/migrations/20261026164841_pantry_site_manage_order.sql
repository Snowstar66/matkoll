-- Choosing and managing places, follow-up to
-- 20261026162631_pantry_site_manage.sql (Story 8.2, AD-24): a place added by
-- save_pantry_site for a user without places came in the same transaction
-- as the Hemma that pantry_selected_site creates first, so both had the same
-- created_at (now() is the transaction's start), and the order of creation
-- fell back on the ids, at random. The new place now gets clock_timestamp(),
-- which is later. Same signature, behaviour and grants otherwise; no row
-- changes.

create or replace function public.save_pantry_site(site_id uuid, site_name text, site_normalized_name text, mode text)
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

  -- clock_timestamp(), not now(): Hemma, created above for a user without
  -- places in this same transaction, has now(), so the new place comes after
  -- it in the order of creation instead of tying with it.
  insert into public.pantry_site (id, user_id, name, normalized_name, is_selected, created_at)
  values (save_pantry_site.site_id, caller, site_name, site_normalized_name, false, clock_timestamp())
  returning * into saved;
  return saved;
end;
$$;
