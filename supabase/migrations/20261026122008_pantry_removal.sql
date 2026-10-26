-- "Töm en plats" after review (Story 6.3, AD-4, AD-19, AD-20): the rows a
-- removal took are kept on the server, so "Ångra" never depends on what the
-- client got back. Replaces empty_pantry_place(text) and
-- restore_pantry_items(jsonb) from 20261026120231_pantry_empty_place.sql.
--
-- 1. pantry_removal: one record per removal operation, keyed by the
--    caller's operation id (chosen in the client, like the id "Ångra" gives
--    back, AD-20), with the removed rows as they were. Any pantry write that
--    removes rows and offers "Ångra" stores them here in its own
--    transaction: "Töm kylen" now, the removals of an inventory (Story 6.4)
--    later. Records older than a day are pruned by the functions below;
--    "Ångra" is offered for 5 s.
-- 2. empty_pantry_place(place, operation_id) deletes the location's rows and
--    stores them under the operation id, in one transaction. It returns one
--    jsonb value, `{ removed, items }`, so PostgREST's max_rows never cuts
--    the answer short. A repeated call with the same operation id (a retry
--    after a lost answer) returns the stored record and deletes nothing.
-- 3. restore_pantry_removal(operation_id) is "Ångra": it puts the stored
--    rows back with the same ids and deletes the record. A row is skipped,
--    not refused, when its id is taken, when the location has the item again
--    (pantry_place_has_item: the same unit, or either one unlimited), or
--    when its catalog ingredient is gone. It returns
--    `{ restored: [rows], skipped }`; an unknown or pruned operation is
--    P0002.
--
-- Both functions take pantry_lock(), so they never interleave with
-- set_pantry_items, restore_pantry_item or add_to_pantry for the same user,
-- run as the caller (security invoker), refuse a caller without auth.uid()
-- (42501) and are executable by authenticated only. Neither takes an array
-- from the caller, so there is no size limit to enforce.

create table public.pantry_removal (
  -- The caller's operation id: one record per removal, per user.
  id uuid not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  -- The removed pantry_item rows: id, ingredient_id, location, amount, unit.
  removed_rows jsonb not null,
  constraint pantry_removal_pkey primary key (user_id, id),
  constraint pantry_removal_removed_rows_check check (jsonb_typeof(removed_rows) = 'array')
);

-- Pruning reads a user's old records.
create index pantry_removal_user_id_created_at_idx on public.pantry_removal (user_id, created_at);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.pantry_removal enable row level security;

create policy pantry_removal_own_rows on public.pantry_removal
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.pantry_removal from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.pantry_removal to authenticated, service_role;

drop function public.restore_pantry_items(jsonb);
drop function public.empty_pantry_place(text);

create function public.empty_pantry_place(place text, operation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  stored jsonb;
begin
  if caller is null then
    raise exception 'empty_pantry_place needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;
  if operation_id is null then
    raise exception 'empty_pantry_place needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  -- The same operation again: what it removed, without removing anything more.
  select record.removed_rows into stored
  from public.pantry_removal as record
  where record.user_id = caller
    and record.id = operation_id;

  if not found then
    with removed as (
      delete from public.pantry_item as gone
      where gone.user_id = caller
        and gone.location = place
      returning gone.*
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', removed.id,
          'ingredient_id', removed.ingredient_id,
          'location', removed.location,
          'amount', removed.amount,
          'unit', removed.unit
        )
        order by removed.id
      ),
      '[]'::jsonb
    )
    into stored
    from removed;

    insert into public.pantry_removal (id, removed_rows)
    values (operation_id, stored);
  end if;

  return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
end;
$$;

revoke all on function public.empty_pantry_place(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.empty_pantry_place(text, uuid) to authenticated;

create function public.restore_pantry_removal(operation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  stored jsonb;
  item record;
  restored jsonb := '[]'::jsonb;
  skipped integer := 0;
begin
  if caller is null then
    raise exception 'restore_pantry_removal needs a signed-in user' using errcode = '42501';
  end if;
  if operation_id is null then
    raise exception 'restore_pantry_removal needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  delete from public.pantry_removal as old
  where old.user_id = caller
    and old.created_at < now() - interval '1 day';

  -- One "Ångra" per record: it goes now, and comes back if anything below fails.
  delete from public.pantry_removal as record
  where record.user_id = caller
    and record.id = operation_id
  returning record.removed_rows into stored;
  if not found then
    raise exception 'no removal with that operation id' using errcode = 'P0002';
  end if;

  for item in
    select
      (element.value ->> 'id')::uuid as id,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(stored) with ordinality as element (value, position)
    order by element.position
  loop
    -- A taken id, or the item in the location again: skipped, the row there stays.
    if item.id is null
      or exists (select 1 from public.pantry_item as other where other.id = item.id)
      or public.pantry_place_has_item(item.ingredient_id, item.location, item.unit) then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      insert into public.pantry_item (id, ingredient_id, location, amount, unit)
      values (item.id, item.ingredient_id, item.location, item.amount, item.unit);
      restored := restored || jsonb_build_object(
        'id', item.id,
        'ingredient_id', item.ingredient_id,
        'location', item.location,
        'amount', item.amount,
        'unit', item.unit
      );
    exception
      -- The catalog ingredient is gone (23503), an id another user's row has
      -- (23505, hidden by RLS above), or a stored row the table no longer
      -- accepts: skipped, the rest go back.
      when foreign_key_violation or unique_violation or check_violation or not_null_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;

revoke all on function public.restore_pantry_removal(uuid) from public, anon, authenticated, service_role;
grant execute on function public.restore_pantry_removal(uuid) to authenticated;
