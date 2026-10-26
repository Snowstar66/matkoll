-- Stores, follow-up to 20261026105109_settings_store.sql after review (AD-1,
-- AD-4, AD-20, Story 7.1):
-- 1. Stores are never deleted in v1: authenticated keeps select, insert and
--    update (the invoker functions need them), but not delete.
-- 2. A store's chain and store id are unique per user whatever the id's case,
--    and the id is stored trimmed.
-- 3. The texts are trimmed and on one line: besides control characters, the
--    checks refuse U+2028/U+2029 and the bidi controls U+202A–U+202E and
--    U+2066–U+2069 (oneLine in src/features/settings/domain/store.ts removes
--    them), so the export's line format (Story 7.3) never breaks.
-- 4. save_store takes an explicit mode: `add` inserts, or changes the
--    caller's store with the same id (a retry after a lost answer); `change`
--    only changes, and a store that is gone is P0002.
-- 5. save_store and select_store take a per-user advisory lock before
--    anything else, so adds and selections at once never meet in a unique
--    key: they run one after the other, and the last one wins. A saved store
--    becomes the selected one when the user has no selected store.

-- 1. No delete for authenticated.
revoke delete on table public.store from authenticated;

-- 2. Unique on chain and lower(store id). The index keeps the constraint's
-- name, so a duplicate still names store_user_id_chain_external_store_id_key.
alter table public.store drop constraint store_user_id_chain_external_store_id_key;
create unique index store_user_id_chain_external_store_id_key
  on public.store (user_id, chain, lower(external_store_id));

-- 3. One trimmed line per text.
alter table public.store drop constraint store_name_check;
alter table public.store add constraint store_name_check check (
  btrim(name) <> ''
  and name = btrim(name)
  and char_length(name) <= 100
  and name !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
);

alter table public.store drop constraint store_external_store_id_check;
alter table public.store add constraint store_external_store_id_check check (
  btrim(external_store_id) <> ''
  and external_store_id = btrim(external_store_id)
  and char_length(external_store_id) <= 40
  and external_store_id !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
);

alter table public.store drop constraint store_address_check;
alter table public.store add constraint store_address_check check (
  btrim(address) <> ''
  and address = btrim(address)
  and char_length(address) <= 200
  and address !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
);

alter table public.store drop constraint store_url_check;
alter table public.store add constraint store_url_check check (
  char_length(url) <= 2048
  and url ~ '^https://[^/?#]'
  and url !~ '[[:space:]\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
);

-- The lock both functions take first: one per user, until the transaction ends.
create function public.store_lock()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'store_lock needs a signed-in user' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:' || caller::text, 0));
end;
$$;

revoke all on function public.store_lock() from public, anon, authenticated, service_role;
grant execute on function public.store_lock() to authenticated;

-- 4. saveStore (FR-28), replacing save_store(jsonb, boolean):
-- - store: { id, name, chain, external_store_id, address, url }; the id is
--   chosen by the client and kept for the sheet's whole opening.
-- - mode `add`: a store the caller has with the id is changed (a retry after
--   a lost answer); otherwise the store is added. An id another user has
--   taken is 23505 on store_pkey.
-- - mode `change`: the caller's store with the id is changed; when there is
--   none (gone, or another user's), nothing is written (P0002).
-- - Changing keeps the store's selection. The store becomes the selected one,
--   and every other store of the caller's is deselected, with make_selected
--   or when the caller has no selected store; exactly one is selected after.
-- - The table's checks refuse what storeFormSchema refuses (23514); the same
--   chain and store id as another of the caller's stores is 23505 on
--   store_user_id_chain_external_store_id_key.
-- - Execute only for authenticated.
drop function public.save_store(jsonb, boolean);

create function public.save_store(store jsonb, mode text, make_selected boolean)
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
    url = store ->> 'url'
  where own.id = saved_id and own.user_id = caller
  returning own.* into saved;

  if not found then
    if mode = 'change' then
      raise exception 'the store is not found' using errcode = 'P0002';
    end if;
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

-- 5. selectStore (FR-28), as in 20261026105109_settings_store.sql, under the
-- per-user lock: selections at once run one after the other, and the last
-- one wins. A store the caller does not have is P0002, and nothing changes.
-- Execute only for authenticated.
create or replace function public.select_store(store_id uuid)
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

  perform public.store_lock();

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
