-- Settings module (AD-1, AD-21, AD-25, Story 9.1, FR-34): the link to a
-- store's weekly offers. Only src/features/settings reads and writes it; the
-- offers module reads it through settings/server.ts and fetches only the
-- address stored here, after checking it against OFFER_SITES
-- (src/features/settings/domain/offers-link.ts).
--
-- 1. store.offers_url, with the same basic check as the other texts: https,
--    at most 300 characters, no whitespace or invisible characters.
-- 2. save_store takes offers_url. A store without the key keeps its link, so
--    the code before this migration (which never sends it) changes nothing
--    (AD-5).
-- 3. ensure_user_defaults: a new user's default store, Maxi ICA Stormarknad
--    Östersund, gets its link. A store the user already has is never changed.
-- 4. Backfill: every store at ICA with store id 1003733 and no link gets the
--    link to Maxi ICA Stormarknad Östersund's offers.

-- 1. The column. Null means no link.
alter table public.store add column offers_url text;

alter table public.store add constraint store_offers_url_check check (
  char_length(offers_url) <= 300
  and offers_url ~ '^https://[^/?#]'
  and offers_url !~ '[[:space:]\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
);

-- 2. saveStore (FR-28, FR-34), as in 20261026110955_settings_store_hardening.sql
-- with offers_url: the value in the key, or the stored link when the key is
-- missing. Everything else is unchanged.
create or replace function public.save_store(store jsonb, mode text, make_selected boolean)
returns public.store
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  saved_id uuid;
  saved public.store;
begin
  if caller is null then
    raise exception 'save_store needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(store) is distinct from 'object' then
    raise exception 'store must be an object' using errcode = '22023';
  end if;
  saved_id := (store ->> 'id')::uuid;
  if saved_id is null or make_selected is null or mode is null or mode not in ('add', 'change') then
    raise exception 'store needs its id, mode add or change, and make_selected a value' using errcode = '22023';
  end if;

  perform public.store_lock();

  update public.store as own
  set
    name = store ->> 'name',
    chain = store ->> 'chain',
    external_store_id = store ->> 'external_store_id',
    address = store ->> 'address',
    url = store ->> 'url',
    offers_url = case when store ? 'offers_url' then store ->> 'offers_url' else own.offers_url end
  where own.id = saved_id and own.user_id = caller
  returning own.* into saved;

  if not found then
    if mode = 'change' then
      raise exception 'the store is not found' using errcode = 'P0002';
    end if;
    insert into public.store (id, user_id, name, chain, external_store_id, address, url, offers_url, is_selected)
    values (
      saved_id,
      caller,
      store ->> 'name',
      store ->> 'chain',
      store ->> 'external_store_id',
      store ->> 'address',
      store ->> 'url',
      store ->> 'offers_url',
      false
    )
    returning * into saved;
  end if;

  if not saved.is_selected
    and (make_selected or not exists (select 1 from public.store as own where own.user_id = caller and own.is_selected))
  then
    update public.store as own
    set is_selected = false
    where own.user_id = caller and own.is_selected;

    update public.store as own
    set is_selected = true
    where own.id = saved_id and own.user_id = caller
    returning own.* into saved;
  end if;

  return saved;
end;
$$;

revoke all on function public.save_store(jsonb, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_store(jsonb, text, boolean) to authenticated;

-- 3. Start data (AD-21), as in 20261026105109_settings_store.sql, with the
-- default store's link to its weekly offers. Only a new user's store gets it:
-- a store the user has is never changed here, so a link Pontus has removed
-- stays removed.
create or replace function public.ensure_user_defaults()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')
  on conflict (user_id, domain) do nothing;

  insert into public.store (name, chain, external_store_id, url, offers_url, is_selected)
  select
    'Maxi ICA Stormarknad Östersund',
    'ICA',
    '1003733',
    'https://handlaprivatkund.ica.se/stores/1003733',
    'https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/',
    true
  where not exists (select 1 from public.store where user_id = (select auth.uid()))
  on conflict do nothing;
$$;

comment on function public.ensure_user_defaults() is
  'Start data for the signed-in user (AD-21): adds the start recipe sites that are missing, and the default store '
  '(Maxi ICA Stormarknad Östersund, selected, with the link to its weekly offers) when the user has no store. '
  'Sites are turned off (is_active = false), never deleted, and this function never turns an off site on again; '
  'a store the user has changed is never replaced.';

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;

-- 4. Backfill. The migration runs without a session, so it reaches every
-- user's stores. Only a store without a link is filled in.
update public.store
set offers_url = 'https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/'
where chain = 'ICA' and external_store_id = '1003733' and offers_url is null;
