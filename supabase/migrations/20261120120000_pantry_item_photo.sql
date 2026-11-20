-- Matvaror: an item added from a photo reading remembers which photo and
-- which number on it it came from, so its row can show a camera icon and its
-- sheet the photo around the item. Only adds two nullable columns and an
-- index: no backfill (items added before this have no link), no changed
-- policy, and the code before it keeps working (AD-5).
--
-- photo_id goes to null when the photo row is deleted (the 30-day sweep,
-- "Ta bort fotot", "Töm kylen"); photo_number stays, which is how the app
-- knows the item came from a photo that is no longer kept.

set local lock_timeout = '5s';

alter table public.pantry_item
  add column photo_id uuid references public.pantry_photo (id) on delete set null,
  add column photo_number integer check (photo_number is null or photo_number >= 1);

-- on delete set null finds the items of a deleted photo through this.
create index pantry_item_photo_id_idx on public.pantry_item (photo_id) where photo_id is not null;

-- The photo is saved after the items it suggested were confirmed, so its id is
-- not known when they are set. This links them afterwards: `links` is an array
-- of `{ "id": <pantry_item id>, "n": <number on the photo> }` (at most 100),
-- and only items of the caller's household are linked, and only to a photo of
-- the caller's household. Says how many items it linked; nothing is written
-- for a photo that is gone. A direct update from the app is not allowed
-- (tests/design/pantry-site-reads.test.ts): every pantry write is a function.
create function public.link_pantry_items_photo(photo uuid, links jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  linked integer;
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

  update public.pantry_item as item
  set photo_id = photo, photo_number = link.n
  from (
    select (entry ->> 'id')::uuid as id, (entry ->> 'n')::integer as n
    from jsonb_array_elements(links) as entry
    where jsonb_typeof(entry) = 'object'
      and (entry ->> 'id') ~ '^[0-9a-fA-F-]{36}$'
      and (entry ->> 'n') ~ '^[0-9]{1,4}$'
  ) as link
  where item.id = link.id
    and link.n >= 1
    and item.household_id = public.my_household_id();
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke all on function public.link_pantry_items_photo(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.link_pantry_items_photo(uuid, jsonb) to authenticated, service_role;
