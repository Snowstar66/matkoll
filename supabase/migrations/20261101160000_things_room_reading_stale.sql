-- A card that has been `reading` for more than six minutes has lost its job (the
-- function that ran it died, or it never got to queue it): the app shows it as
-- failed (readingStaleMs in thing-photo.ts), but the count of a room still said
-- "Tittar på kortet …" for it, for ever. thing_room_stats now counts a reading
-- card only while it is younger than that. Same signature, same columns, same
-- security invoker (AD-5, additive).
create or replace function public.thing_room_stats(site uuid)
returns table (room text, room_key text, things bigint, cards bigint, reading bigint, latest timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with places as (
    select * from public.thing_place where site_id = site
  ),
  per_card as (
    select pl.room_key,
      count(*) filter (where ph.status = 'done') as done,
      count(*) filter (where ph.status = 'reading' and ph.created_at > now() - interval '6 minutes') as reading,
      max(ph.taken_at) filter (where ph.status = 'done') as latest
    from public.thing_photo ph
    join places pl on pl.id = ph.place_id and pl.user_id = ph.user_id
    group by pl.room_key
  ),
  per_item as (
    select pl.room_key, count(*) as things
    from public.thing_item i
    join places pl on pl.id = i.place_id and pl.user_id = i.user_id
    where i.same_as is null
    group by pl.room_key
  )
  select
    (array_agg(p.room order by p.created_at, p.id))[1],
    p.room_key,
    coalesce(max(pi.things), 0),
    coalesce(max(pc.done), 0),
    coalesce(max(pc.reading), 0),
    max(pc.latest)
  from places p
  left join per_card pc on pc.room_key = p.room_key
  left join per_item pi on pi.room_key = p.room_key
  group by p.room_key
  order by min(p.created_at), p.room_key;
$$;
