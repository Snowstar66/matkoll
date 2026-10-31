-- Story 18.6: no duplicates when cards overlap, and a real column for boxes.
-- Additive (AD-5): the code before this keeps working. It never writes `kind`
-- or `same_as`, a trigger fills `kind` for the boxes it makes, and a thing
-- that is merged is still a row on its own card, so the old code just shows it.
--
-- 1. thing_place.kind: 'part' (a room, or a part of it) or 'box' (Story 18.5).
-- Until now a box was told by its part_key starting with 'box:'. That key
-- stays (a box and a part with the same name never clash), the column says it.
alter table public.thing_place add column kind text not null default 'part';
alter table public.thing_place add constraint thing_place_kind_check check (kind in ('part', 'box'));
update public.thing_place set kind = 'box' where part_key like 'box:%';
alter table public.thing_place add constraint thing_place_kind_key_check check ((kind = 'box') = (part_key like 'box:%'));

-- The code before this makes a box with only the key; the trigger gives it its kind.
create function public.thing_place_set_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.part_key like 'box:%' then
    new.kind := 'box';
  end if;
  return new;
end;
$$;

create trigger thing_place_set_kind before insert on public.thing_place
  for each row execute function public.thing_place_set_kind();

-- 2. thing_item.same_as: a thing seen on several cards of one room is a row
-- per card (each card still lists what is on it) and the later rows point at
-- the kept one. A kept thing has same_as null; a merged thing never is
-- pointed at (no chains). When the kept thing goes (its card is removed), the
-- things that pointed at it become kept themselves (set null), so a card's
-- removal takes only what was solely from it.
alter table public.thing_item add constraint thing_item_id_user_id_key unique (id, user_id);
alter table public.thing_item add column same_as uuid;
alter table public.thing_item add constraint thing_item_same_as_check check (same_as is null or same_as <> id);
alter table public.thing_item add constraint thing_item_same_as_fkey foreign key (same_as, user_id)
  references public.thing_item (id, user_id) on delete set null (same_as);
create index thing_item_same_as_idx on public.thing_item (same_as) where same_as is not null;

-- 3. The merge's end: points the things of the finished card `photo` at the
-- things of other cards of the same room that they are the same as. `pairs` is
-- [{ "item": <thing of the card>, "target": <kept thing> }]. A pair is skipped
-- unless the item is of the card, kept itself and not pointed at, the target
-- is a kept thing of another card, and both places are parts of the same
-- room in the same boende (never across rooms, never into a box). Takes the
-- same lock per user as save_thing_reading, so two cards finishing at once
-- follow each other and no two things can point at each other. Returns how
-- many were merged.
create function public.merge_thing_items(photo uuid, pairs jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  merged integer;
begin
  if caller is null then
    raise exception 'merge_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs) > 100 then
    raise exception 'pairs must be a list of at most 100' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  update public.thing_item as dup
  set same_as = pair.target
  from jsonb_to_recordset(pairs) as pair(item uuid, target uuid)
  where dup.id = pair.item
    and dup.user_id = caller
    and dup.photo_id = photo
    and dup.same_as is null
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = dup.id)
    and exists (
      select 1
      from public.thing_item as kept
      join public.thing_place as kept_place on kept_place.id = kept.place_id and kept_place.user_id = kept.user_id
      join public.thing_place as dup_place on dup_place.id = dup.place_id and dup_place.user_id = dup.user_id
      where kept.id = pair.target
        and kept.user_id = caller
        and kept.same_as is null
        and kept.photo_id <> photo
        and kept_place.kind = 'part'
        and dup_place.kind = 'part'
        and kept_place.site_id = dup_place.site_id
        and kept_place.room_key = dup_place.room_key
    );
  get diagnostics merged = row_count;
  return merged;
end;
$$;

revoke all on function public.merge_thing_items(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.merge_thing_items(uuid, jsonb) to authenticated, service_role;
