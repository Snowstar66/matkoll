-- Settings module (AD-1, AD-4, AD-16, AD-21, Story 7.1): Pontus's stores, for
-- the basket export (Story 7.3) and the product choices (Story 7.2). Only
-- src/features/settings reads and writes this table (AD-1).
--
-- Several stores, in several chains and several in one chain, are the normal
-- case (docs/beslutslogg.md, 2026-10-26, "Ordning för tilläggen efter 1.0"):
-- nothing here assumes one store. is_selected marks the store v1 uses, and at
-- most one per user is selected. Stores are never deleted in v1.
-- Every row belongs to one user and is protected by RLS (AD-4).
--
-- 1. store.
-- 2. RLS, policy and grants.
-- 3. save_store: adds or changes a store, and may select it.
-- 4. select_store: selects one of the caller's stores.
-- 5. ensure_user_defaults: also adds the default store when the user has none.
-- 6. Backfill: every user who exists now gets the default store.

-- 1. The table.
create table public.store (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  -- STORE_CHAINS in src/features/settings/domain/store.ts
  -- (tests/design/settings-checks pins the list to the domain).
  chain text not null,
  -- The store's id at its chain, e.g. ICA Handla's 1003733; optional.
  external_store_id text,
  address text,
  -- Text Pontus typed; shown as a link and never fetched.
  url text,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  -- 1–100 characters after trimming, on one line (storeFormSchema).
  constraint store_name_check check (
    btrim(name) <> ''
    and char_length(name) <= 100
    and name !~ '[\x01-\x1f\x7f-\x9f]'
  ),
  constraint store_chain_check check (
    chain in ('ICA', 'Willys', 'Coop', 'Lidl', 'Hemköp', 'City Gross', 'Annan')
  ),
  -- Empty is null, so two stores without an id never collide.
  constraint store_external_store_id_check check (
    btrim(external_store_id) <> ''
    and char_length(external_store_id) <= 40
    and external_store_id !~ '[\x01-\x1f\x7f-\x9f]'
  ),
  constraint store_address_check check (
    btrim(address) <> ''
    and char_length(address) <= 200
    and address !~ '[\x01-\x1f\x7f-\x9f]'
  ),
  -- Only https, with a host and no whitespace.
  constraint store_url_check check (
    char_length(url) <= 2048
    and url ~ '^https://[^/?#]'
    and url !~ '[[:space:]\x01-\x1f\x7f-\x9f]'
  ),
  -- For composite foreign keys from other modules (product_choice, Story 7.2, AD-4).
  constraint store_id_user_id_key unique (id, user_id),
  -- A store is identified by its chain and its id there. Nulls are distinct,
  -- so several stores without an id (e.g. Lidl) can be added.
  constraint store_user_id_chain_external_store_id_key unique (user_id, chain, external_store_id)
);

-- At most one selected store per user.
create unique index store_one_selected_per_user on public.store (user_id) where is_selected;

-- 2. RLS: one policy for select, insert, update and delete (AD-4).
alter table public.store enable row level security;

create policy store_own_rows on public.store
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.store from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.store to authenticated, service_role;

-- 3. saveStore (FR-28): adds or changes one of the signed-in user's stores, in
-- one transaction under a lock on the user's stores (AD-1).
-- - store: { id, name, chain, external_store_id, address, url }; the id is
--   chosen by the client. With an id the caller has, that store is changed
--   (its selection stays as it is); with a new id, the store is added, not
--   selected. An id another user has taken is 23505.
-- - With make_selected, the store becomes the selected one and every other
--   store of the caller's is deselected, so exactly one is selected after.
-- - The table's checks refuse what storeFormSchema refuses (23514); the same
--   chain and store id as another of the caller's stores is 23505 on
--   store_user_id_chain_external_store_id_key.
-- - Execute only for authenticated.
create function public.save_store(store jsonb, make_selected boolean)
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
  if saved_id is null or make_selected is null then
    raise exception 'store needs its id, and make_selected a value' using errcode = '22023';
  end if;

  -- The caller's stores, locked in one order, so selections never interleave.
  perform 1 from public.store as own where own.user_id = caller order by own.id for update;

  update public.store as own
  set
    name = store ->> 'name',
    chain = store ->> 'chain',
    external_store_id = store ->> 'external_store_id',
    address = store ->> 'address',
    url = store ->> 'url'
  where own.id = saved_id and own.user_id = caller
  returning own.* into saved;

  if not found then
    insert into public.store (id, user_id, name, chain, external_store_id, address, url, is_selected)
    values (
      saved_id,
      caller,
      store ->> 'name',
      store ->> 'chain',
      store ->> 'external_store_id',
      store ->> 'address',
      store ->> 'url',
      false
    )
    returning * into saved;
  end if;

  if make_selected and not saved.is_selected then
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

revoke all on function public.save_store(jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_store(jsonb, boolean) to authenticated;

-- 4. selectStore (FR-28): makes one of the signed-in user's stores the
-- selected one and deselects the others, in one transaction under the same
-- lock as save_store, so after two selections at once exactly one store is
-- selected (the last). A store the caller does not have (another user's, or
-- none) is P0002, and nothing changes. Execute only for authenticated.
create function public.select_store(store_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'select_store needs a signed-in user' using errcode = '42501';
  end if;
  if select_store.store_id is null then
    raise exception 'store_id is required' using errcode = '22023';
  end if;

  perform 1 from public.store as own where own.user_id = caller order by own.id for update;

  if not exists (
    select 1 from public.store as own where own.id = select_store.store_id and own.user_id = caller
  ) then
    raise exception 'the store is not found' using errcode = 'P0002';
  end if;

  update public.store as own
  set is_selected = false
  where own.user_id = caller and own.is_selected and own.id <> select_store.store_id;

  update public.store as own
  set is_selected = true
  where own.id = select_store.store_id and own.user_id = caller and not own.is_selected;
end;
$$;

revoke all on function public.select_store(uuid) from public, anon, authenticated, service_role;
grant execute on function public.select_store(uuid) to authenticated;

-- 5. Start data (AD-21), as in 20261025215824_settings_backfill_and_domain_labels.sql,
-- plus the default store: Maxi ICA Stormarknad Östersund (ICA Handla, store
-- id 1003733), selected, only when the user has no store at all. A store
-- Pontus has changed is never replaced or duplicated, and a second call
-- changes nothing; `on conflict do nothing` without a target also covers two
-- sign-ins at once.
create or replace function public.ensure_user_defaults()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')
  on conflict (user_id, domain) do nothing;

  insert into public.store (name, chain, external_store_id, url, is_selected)
  select 'Maxi ICA Stormarknad Östersund', 'ICA', '1003733', 'https://handlaprivatkund.ica.se/stores/1003733', true
  where not exists (select 1 from public.store where user_id = (select auth.uid()))
  on conflict do nothing;
$$;

comment on function public.ensure_user_defaults() is
  'Start data for the signed-in user (AD-21): adds the start recipe sites that are missing, and the default store '
  '(Maxi ICA Stormarknad Östersund, selected) when the user has no store. '
  'Sites are turned off (is_active = false), never deleted, and this function never turns an off site on again; '
  'a store the user has changed is never replaced.';

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;

-- 6. Backfill. The migration runs without a session, so user_id is set here.
insert into public.store (user_id, name, chain, external_store_id, url, is_selected)
select users.id, 'Maxi ICA Stormarknad Östersund', 'ICA', '1003733', 'https://handlaprivatkund.ica.se/stores/1003733', true
from auth.users as users
where not exists (select 1 from public.store as own where own.user_id = users.id)
on conflict do nothing;
