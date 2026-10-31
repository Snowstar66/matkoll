-- Story 18.6 follow-up: "Ångra" must not bring duplicates back. A removed
-- thing (or card) is given back with the thing it was merged into (`same_as`)
-- and the ids of the things that pointed at it; once the rows are restored,
-- this puts the links back. Additive. Takes the same per-user lock as
-- merge_thing_items and save_thing_reading, so it never runs between a merge's
-- reads and writes.
--
-- `links` is [{ "id": <restored thing>, "same_as": <uuid or null>,
-- "pointed_by": [<uuid>, ...] }]. A link is put back only when it still holds:
--  - the restored thing points at `same_as` only if it is kept itself, nothing
--    points at it, and the target is still there and kept;
--  - each thing in `pointed_by` points at the restored thing only if it is
--    still kept, nothing points at it, and the restored thing is kept.
-- Anything else is left as it is (counted once on its own card). Returns how
-- many links were put back.
create function public.relink_thing_items(links jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  total integer := 0;
  step integer;
begin
  if caller is null then
    raise exception 'relink_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(links) is distinct from 'array' or jsonb_array_length(links) > 200 then
    raise exception 'links must be a list of at most 200' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller::text));

  update public.thing_item as item
  set same_as = link.same_as
  from jsonb_to_recordset(links) as link(id uuid, same_as uuid)
  where link.same_as is not null
    and item.id = link.id
    and item.user_id = caller
    and item.same_as is null
    and link.same_as <> item.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = item.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.same_as and kept.user_id = caller and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;

  update public.thing_item as pointer
  set same_as = link.id
  from (
    select entry.id, pointed.value::uuid as pointer_id
    from jsonb_to_recordset(links) as entry(id uuid, pointed_by jsonb),
      lateral jsonb_array_elements_text(coalesce(entry.pointed_by, '[]'::jsonb)) as pointed(value)
  ) as link
  where pointer.id = link.pointer_id
    and pointer.user_id = caller
    and pointer.same_as is null
    and pointer.id <> link.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = pointer.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.id and kept.user_id = caller and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;
  return total;
end;
$$;

revoke all on function public.relink_thing_items(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.relink_thing_items(jsonb) to authenticated, service_role;
