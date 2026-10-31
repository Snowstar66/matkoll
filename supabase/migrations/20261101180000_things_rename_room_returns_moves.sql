-- Story 18.16 (review): rename_thing_room also gives back the card files its
-- merge moved ({ from, to } for each), as the rows really were when they moved,
-- so the caller can copy a file that a card uploaded after the plan needs too.
-- Additive (AD-5): the same function with one more key in its answer
-- ({ merged, moved } stays; `moves` is new); the code before this ignores it.
create or replace function public.rename_thing_room(site uuid, in_room text, new_name text, new_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source public.thing_place;
  target public.thing_place;
  shown text := new_name;
  merged integer := 0;
  moved integer := 0;
  existing_room text;
  all_moves jsonb := '[]'::jsonb;
  part_moves jsonb;
begin
  if caller is null then
    raise exception 'rename_thing_room needs a signed-in user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  perform 1 from public.pantry_site where id = site and user_id = caller;
  if not found then
    raise exception 'the boende is not found' using errcode = 'MK440';
  end if;
  perform 1 from public.thing_place where site_id = site and user_id = caller and room_key = in_room;
  if not found then
    raise exception 'the room is not found' using errcode = 'MK440';
  end if;

  if new_key <> in_room then
    select room into existing_room from public.thing_place
    where site_id = site and user_id = caller and room_key = new_key order by created_at, id limit 1;
    if existing_room is not null then
      shown := existing_room;
    end if;
  end if;

  for source in
    select * from public.thing_place where site_id = site and user_id = caller and room_key = in_room order by created_at, id
  loop
    select * into target from public.thing_place
    where site_id = site and user_id = caller and room_key = new_key and part_key = source.part_key and id <> source.id;
    if found then
      with moving as (
        select id, object_path as old_path from public.thing_photo where user_id = caller and place_id = source.id
      ), done as (
        update public.thing_photo ph
        set place_id = target.id,
          object_path = caller::text || '/' || target.id::text || '/' || ph.id::text
            || case ph.media_type when 'image/jpeg' then '.jpg' else '.png' end
        from moving
        where ph.id = moving.id and ph.user_id = caller
        returning moving.old_path, ph.object_path as new_path
      )
      select coalesce(jsonb_agg(jsonb_build_object('from', old_path, 'to', new_path)), '[]'::jsonb) into part_moves from done;
      all_moves := all_moves || part_moves;
      update public.thing_item set place_id = target.id where user_id = caller and place_id = source.id;
      delete from public.thing_place where user_id = caller and id = source.id;
      merged := merged + 1;
    else
      update public.thing_place set room = shown, room_key = new_key where user_id = caller and id = source.id;
      moved := moved + 1;
    end if;
  end loop;

  return jsonb_build_object('merged', merged, 'moved', moved, 'moves', all_moves);
end;
$$;

revoke all on function public.rename_thing_room(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.rename_thing_room(uuid, text, text, text) to authenticated, service_role;
