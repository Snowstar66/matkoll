-- Matvaror: a photo remembers which of its numbers were ever confirmed (added
-- to the list), so the photo view can tell "was on the list but is gone"
-- (confirmed, no living item) from "was never added" (not confirmed).
-- Only adds one nullable column and replaces one function: no backfill (null
-- means "not known", as for every photo before this, which then shows its
-- numbers without any status), no changed policy, and the code before it
-- keeps working (AD-5).

set local lock_timeout = '5s';

alter table public.pantry_photo
  add column confirmed_numbers integer[] check (
    confirmed_numbers is null or (cardinality(confirmed_numbers) <= 100 and array_position(confirmed_numbers, null) is null)
  );

-- Same as before, and the numbers it links are added (union) to the photo's
-- confirmed_numbers, so "confirmed" is every number that was ever linked.
-- An entry may carry `"c": false` to link without confirming: the carry-over
-- when "Ändra vara" replaces a row only moves a link that already exists.
-- Only numbers inside the photo's reading count.
create or replace function public.link_pantry_items_photo(photo uuid, links jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  linked integer;
  confirmed integer[];
begin
  if caller is null then
    raise exception 'link_pantry_items_photo needs a signed-in user' using errcode = '42501';
  end if;
  if photo is null or links is null or jsonb_typeof(links) <> 'array'
    or jsonb_array_length(links) = 0 or jsonb_array_length(links) > 100 then
    return 0;
  end if;
  if not exists (
    select 1 from public.pantry_photo as kept
    where kept.id = photo and kept.household_id = public.my_household_id()
  ) then
    return 0;
  end if;

  with link as (
    select (entry ->> 'id')::uuid as id, (entry ->> 'n')::integer as n,
      (entry ->> 'c') is distinct from 'false' as confirms
    from jsonb_array_elements(links) as entry
    where jsonb_typeof(entry) = 'object'
      and (entry ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
      and (entry ->> 'n') ~ '^[0-9]{1,4}$'
  ),
  updated as (
    update public.pantry_item as item
    set photo_id = photo, photo_number = link.n
    from link
    where item.id = link.id
      and link.n >= 1
      and item.household_id = public.my_household_id()
    returning link.n, link.confirms
  )
  select count(*)::integer, coalesce(array_agg(distinct updated.n) filter (where updated.confirms), '{}')
  into linked, confirmed
  from updated;

  if cardinality(confirmed) > 0 then
    update public.pantry_photo as kept
    set confirmed_numbers = (
      select coalesce(array_agg(distinct number order by number), '{}')
      from unnest(coalesce(kept.confirmed_numbers, '{}') || confirmed) as number
      where number >= 1 and number <= jsonb_array_length(kept.reading)
    )
    where kept.id = photo and kept.household_id = public.my_household_id();
  end if;
  return linked;
end;
$$;

revoke all on function public.link_pantry_items_photo(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.link_pantry_items_photo(uuid, jsonb) to authenticated, service_role;
