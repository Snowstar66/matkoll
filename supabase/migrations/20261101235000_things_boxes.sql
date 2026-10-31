-- Visa föremålet på kortet (Story 18.7, AD-4, AD-5): where each föremål is on
-- its card, as a box in normalized coordinates (0 to 1 of the photo's width and
-- height from its top left corner). A new card gets the boxes in the same AI
-- call that lists its things; an older one gets a föremål's box from a small
-- lookup the first time it is opened, and a lookup that found nothing is
-- remembered (box_missed), so the same föremål never costs a second call.
--
-- This migration only adds, and works with the code before it (AD-5): the
-- columns are nullable or have a default, and save_thing_card keeps its
-- signature and reads a box only when an entry has one, so the code before it
-- (whose entries have none) saves its cards as before. Every row stays the
-- user's own through the existing RLS of thing_item.

-- 1. The box, all four values or none, inside the photo and with a size. The
-- small slack lets the sum of two rounded reals reach the edge.
alter table public.thing_item add column if not exists box_left real;
alter table public.thing_item add column if not exists box_top real;
alter table public.thing_item add column if not exists box_width real;
alter table public.thing_item add column if not exists box_height real;
alter table public.thing_item add column if not exists box_missed boolean not null default false;

alter table public.thing_item drop constraint if exists thing_item_box_check;
alter table public.thing_item add constraint thing_item_box_check check (
  (box_left is null and box_top is null and box_width is null and box_height is null)
  or (
    -- Every value named, so a missing one is a refusal and not a NULL that passes.
    box_left is not null and box_top is not null and box_width is not null and box_height is not null
    and box_left >= 0 and box_top >= 0 and box_width > 0 and box_height > 0
    and box_left + box_width <= 1.0001 and box_top + box_height <= 1.0001
  )
);
-- A föremål with a box was found: it cannot be missed too.
alter table public.thing_item drop constraint if exists thing_item_box_missed_check;
alter table public.thing_item add constraint thing_item_box_missed_check check (not (box_missed and box_left is not null));

-- 2. save_thing_card (Story 18.11) as before, and each entry's `box`
-- ({ left, top, width, height }) saved with its thing. A box that is missing,
-- not four numbers or not inside the photo is left out (the thing is saved
-- without one), so a bad box never fails a card: the code checks the boxes
-- first, and this is the second guard. A number is range-checked and rounded
-- as numeric before it becomes a real, so one like 1e39 or 1e-50 cannot fail
-- the cast.
create or replace function public.save_thing_card(
  photo uuid,
  things jsonb,
  note text default null,
  hidden_count integer default 0
)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.thing_photo;
  removed text[];
begin
  if caller is null then
    raise exception 'save_thing_card needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 60 then
    raise exception 'things must be a list of at most 60' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  select * into target from public.thing_photo where id = photo and user_id = caller;
  if not found or target.status <> 'reading' then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_item (
    photo_id, place_id, name, category, where_hint, confidence, position, box_left, box_top, box_width, box_height
  )
  select
    photo,
    target.place_id,
    entry.value ->> 'name',
    entry.value ->> 'category',
    entry.value ->> 'where_hint',
    entry.value ->> 'confidence',
    (entry.ordinality - 1)::integer,
    case when box.ok then box.l end,
    case when box.ok then box.t end,
    case when box.ok then box.w end,
    case when box.ok then box.h end
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality)
  cross join lateral (
    select raw.l, raw.t, raw.w, raw.h,
      coalesce(
        raw.l >= 0 and raw.t >= 0 and raw.w > 0 and raw.h > 0 and raw.l + raw.w <= 1.0001 and raw.t + raw.h <= 1.0001,
        false
      ) as ok
    from (
      select
        case when jsonb_typeof(entry.value #> '{box,left}') = 'number' and abs((entry.value #>> '{box,left}')::numeric) <= 2 then round((entry.value #>> '{box,left}')::numeric, 6)::real end as l,
        case when jsonb_typeof(entry.value #> '{box,top}') = 'number' and abs((entry.value #>> '{box,top}')::numeric) <= 2 then round((entry.value #>> '{box,top}')::numeric, 6)::real end as t,
        case when jsonb_typeof(entry.value #> '{box,width}') = 'number' and abs((entry.value #>> '{box,width}')::numeric) <= 2 then round((entry.value #>> '{box,width}')::numeric, 6)::real end as w,
        case when jsonb_typeof(entry.value #> '{box,height}') = 'number' and abs((entry.value #>> '{box,height}')::numeric) <= 2 then round((entry.value #>> '{box,height}')::numeric, 6)::real end as h
    ) as raw
  ) as box;

  update public.thing_photo
  set status = 'done', error_code = null, unseen_note = note, unseen_count = coalesce(hidden_count, 0)
  where id = photo and user_id = caller;

  with older as (
    delete from public.thing_photo as old
    where old.user_id = caller
      and old.id = target.replaces_photo_id
      and old.place_id = target.place_id
      and old.id <> photo
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;

revoke all on function public.save_thing_card(uuid, jsonb, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.save_thing_card(uuid, jsonb, text, integer) to authenticated, service_role;
