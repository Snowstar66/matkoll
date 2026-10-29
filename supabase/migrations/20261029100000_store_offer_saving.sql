-- Offers module (Story 9.11): how good each offer is. The store's regular
-- price ("Ord.pris") and the saving in whole percent, when the page lets the
-- app state them; null when not known, and for rows saved before this
-- migration. Never a guess (offers/domain/offer-saving.ts).
--
-- 1. store_offer.regular_price and saving_percent.
-- 2. save_store_offers takes both from each item: { ..., regular_price,
--    saving_percent }. create or replace; still security invoker,
--    search_path = '' and execute only for authenticated.

alter table public.store_offer
  add column regular_price numeric(8, 2),
  add column saving_percent smallint,
  add constraint store_offer_regular_price_check check (regular_price > 0),
  add constraint store_offer_saving_percent_check check (saving_percent between 1 and 99);

comment on column public.store_offer.regular_price is
  'The regular price in kronor (ICA''s Ord.pris), or null when the page has none.';
comment on column public.store_offer.saving_percent is
  'The saving in whole percent (1-99), or null when it cannot be stated.';

create or replace function public.save_store_offers(store uuid, week date, items jsonb, replace_source text default null)
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
    user_id, store_id, week_start, label, name, ingredient_id, section, price, note, member_only, valid_to, source, regular_price, saving_percent, created_at
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
    item.regular_price,
    item.saving_percent,
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
      source text,
      regular_price numeric,
      saving_percent smallint
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
    regular_price = excluded.regular_price,
    saving_percent = excluded.saving_percent,
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
