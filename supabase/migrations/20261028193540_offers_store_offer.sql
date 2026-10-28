-- Offers module (AD-1, AD-4, AD-5, AD-20, AD-25, Story 9.1): the weekly
-- offers of Pontus's stores. Only src/features/offers reads and writes this
-- table (AD-1). An offer belongs to one store and one week, the week's Monday
-- in Swedish time; weeks and stores are never mixed.
--
-- 1. store_offer.
-- 2. RLS, policy and grants.
-- 3. save_store_offers: saves one store's offers for one week, in one
--    transaction.

-- 1. The table.
create table public.store_offer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  store_id uuid not null,
  -- The week's Monday (offers/domain/week.ts).
  week_start date not null,
  -- The item as the store wrote it, brand and name: "Arla Herrgård, Präst, Grevé".
  label text not null,
  -- The label as compared: lower case, single spaces. Two offers on the same
  -- item from different brands have different labels, so both are kept.
  label_key text generated always as (lower(regexp_replace(label, '\s+', ' ', 'g'))) stored,
  -- The item in its basic form, normalised (catalog/domain/normalize.ts).
  name text not null,
  -- The catalog ingredient, when the name matched one; null otherwise.
  ingredient_id uuid,
  -- A store section (AD-12).
  section text not null,
  -- As the store wrote it: "2 för 119 kr", "89 kr/kg".
  price text,
  -- A restriction as the store wrote it: "Max 1 köp/hushåll".
  note text,
  -- The offer is for members ("Stammis").
  member_only boolean not null default false,
  -- The last day of the offer, when the store says it.
  valid_to date,
  -- Where the offer came from: the store's link (9.1), pasted text (9.7) or a photo (9.8).
  source text not null,
  created_at timestamptz not null default now(),
  constraint store_offer_store_fkey foreign key (store_id, user_id)
    references public.store (id, user_id) on delete restrict,
  constraint store_offer_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict,
  constraint store_offer_week_start_check check (extract(isodow from week_start) = 1),
  -- Texts are trimmed and on one line, as src/lib/one-line.ts leaves them.
  constraint store_offer_label_check check (
    btrim(label) <> ''
    and label = btrim(label)
    and char_length(label) <= 120
    and label !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  constraint store_offer_name_check check (
    btrim(name) <> ''
    and name = btrim(name)
    and char_length(name) <= 100
    and name !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  constraint store_offer_price_check check (
    btrim(price) <> ''
    and price = btrim(price)
    and char_length(price) <= 40
    and price !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  constraint store_offer_note_check check (
    btrim(note) <> ''
    and note = btrim(note)
    and char_length(note) <= 80
    and note !~ '[\x01-\x1f\x7f-\x9f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]'
  ),
  -- SECTIONS in src/features/catalog/domain/sections.ts (tests/design/offer-checks).
  constraint store_offer_section_check check (
    section in ('Frukt och grönt', 'Bröd', 'Mejeri', 'Kött och fisk', 'Chark', 'Frys', 'Skafferi', 'Dryck', 'Övrigt')
  ),
  -- OFFER_SOURCES in src/features/offers/domain/offer.ts (tests/design/offer-checks).
  constraint store_offer_source_check check (source in ('link', 'text', 'photo')),
  -- An offer that ended before its week began is never saved.
  constraint store_offer_valid_to_check check (valid_to >= week_start),
  -- One row per label in a store's week. Its index also serves the reads by
  -- store and week, (user_id, store_id, week_start).
  constraint store_offer_user_id_store_id_week_start_label_key_key unique (user_id, store_id, week_start, label_key)
);

-- 2. RLS: one policy for select, insert, update and delete (AD-4).
alter table public.store_offer enable row level security;

create policy store_offer_own_rows on public.store_offer
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.store_offer from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.store_offer to authenticated, service_role;

-- 3. saveStoreOffers (FR-34, AD-25): saves the caller's offers for one store
-- and one week, in one transaction under a lock on that store's offers.
-- - store: one of the caller's stores; another user's, or none, is P0002.
-- - week: this week's Monday or next week's, in Europe/Stockholm. A week that
--   is over, further ahead or not a Monday is MK416.
-- - items: [{ label, name, ingredient_id, section, price, note, member_only,
--   valid_to, source }], in the store's order. Two items with the same label
--   key are one: the first is kept.
-- - replace_source: when given ('link'), the store's rows from that source for
--   the week are removed first: a fetch replaces the last one, and offers from
--   text or a photo stay.
-- - Each item is added, or changes the row with the same label key.
-- - More than 300 offers for the store and week is MK422, and nothing is saved.
-- - The caller's offers for weeks that are over are removed.
-- - created_at follows the items' order, so the store's order can be read back.
-- - The table's checks refuse what the domain refuses (23514); an ingredient
--   that is not the caller's is 23503.
-- Returns the number of offers for the store and week. Execute only for authenticated.
create function public.save_store_offers(store uuid, week date, items jsonb, replace_source text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'Europe/Stockholm')::date;
  this_week date;
  total integer;
begin
  if caller is null then
    raise exception 'save_store_offers needs a signed-in user' using errcode = '42501';
  end if;
  if save_store_offers.store is null or week is null or jsonb_typeof(items) is distinct from 'array'
    or (replace_source is not null and replace_source not in ('link', 'text', 'photo'))
  then
    raise exception 'store, week and an array of items are required' using errcode = '22023';
  end if;

  this_week := today - (extract(isodow from today)::integer - 1);
  if week not in (this_week, this_week + 7) then
    raise exception 'the week is over, or further ahead than next week' using errcode = 'MK416';
  end if;

  if not exists (
    select 1 from public.store as own where own.id = save_store_offers.store and own.user_id = caller
  ) then
    raise exception 'the store is not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('store_offer:' || caller::text || ':' || save_store_offers.store::text, 0));

  if replace_source is not null then
    delete from public.store_offer as offer
    where offer.user_id = caller
      and offer.store_id = save_store_offers.store
      and offer.week_start = week
      and offer.source = replace_source;
  end if;

  insert into public.store_offer as offer (
    user_id, store_id, week_start, label, name, ingredient_id, section, price, note, member_only, valid_to, source, created_at
  )
  select
    caller,
    save_store_offers.store,
    week,
    item.label,
    item.name,
    item.ingredient_id,
    item.section,
    item.price,
    item.note,
    coalesce(item.member_only, false),
    item.valid_to,
    item.source,
    now() + make_interval(secs => (item.ord / 1000000.0)::double precision)
  from (
    select distinct on (lower(regexp_replace(entry.label, '\s+', ' ', 'g')))
      entry.*,
      ord
    from jsonb_array_elements(items) with ordinality as element (value, ord)
    cross join lateral jsonb_to_record(element.value) as entry (
      label text,
      name text,
      ingredient_id uuid,
      section text,
      price text,
      note text,
      member_only boolean,
      valid_to date,
      source text
    )
    order by lower(regexp_replace(entry.label, '\s+', ' ', 'g')), ord
  ) as item
  order by item.ord
  on conflict (user_id, store_id, week_start, label_key) do update
  set
    name = excluded.name,
    ingredient_id = excluded.ingredient_id,
    section = excluded.section,
    price = excluded.price,
    note = excluded.note,
    member_only = excluded.member_only,
    valid_to = excluded.valid_to,
    source = excluded.source,
    created_at = excluded.created_at;

  select count(*) into total
  from public.store_offer as offer
  where offer.user_id = caller and offer.store_id = save_store_offers.store and offer.week_start = week;
  if total > 300 then
    raise exception 'a store has at most 300 offers a week' using errcode = 'MK422';
  end if;

  delete from public.store_offer as offer
  where offer.user_id = caller and offer.week_start < this_week;

  return total;
end;
$$;

revoke all on function public.save_store_offers(uuid, date, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.save_store_offers(uuid, date, jsonb, text) to authenticated;
