-- Mark as cooked (Story 13.4, FR-13): a dish on the menu is marked cooked and
-- its ingredients are deducted from the pantry, in one transaction.
--
-- 1. meal_plan_recipe.cooked_at: when the dish was marked cooked, null until
--    then. Existing rows stay null. The table's RLS policy and grants cover
--    the new column; nothing else changes.
-- 2. mark_dish_cooked(dish, site, deductions): deducts each { ingredient_id,
--    unit, amount } from the user's rows of that ingredient and unit in the
--    place, oldest row first, deleting a row that reaches 0 (a pantry amount
--    is above 0, pantry_item_amount_check) and never going below 0; sets
--    cooked_at. Returns { cooked_at, rows }: every pantry row touched as it
--    was ("amount") and with what was taken ("deducted"), for undo.
-- 3. undo_dish_cooked(dish, rows): puts the deducted amounts back (adds to a
--    row that is still there, else inserts the deleted row with its old id)
--    and clears cooked_at. A row that has been made again under the same key
--    refuses with 23505 and nothing changes.
-- Both are security invoker with search_path = '', need auth.uid(), take the
-- pantry's advisory lock and touch only the caller's rows; execute only for
-- authenticated.

alter table public.meal_plan_recipe add column cooked_at timestamptz;

comment on column public.meal_plan_recipe.cooked_at is
  'When the dish was marked cooked (mark_dish_cooked), or null. A cooked dish is left out of the shopping list.';

create function public.mark_dish_cooked(dish uuid, site uuid, deductions jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  marked_at timestamptz := now();
  touched jsonb := '[]'::jsonb;
  need jsonb;
  need_ingredient uuid;
  need_unit text;
  remaining numeric;
  take numeric;
  stock record;
begin
  if caller is null then
    raise exception 'mark_dish_cooked needs a signed-in user' using errcode = '42501';
  end if;
  if dish is null or jsonb_typeof(deductions) is distinct from 'array' then
    raise exception 'dish and an array of deductions are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));

  update public.meal_plan_recipe as target
  set cooked_at = marked_at
  where target.id = mark_dish_cooked.dish and target.user_id = caller and target.cooked_at is null;
  if not found then
    if exists (select 1 from public.meal_plan_recipe as other where other.id = mark_dish_cooked.dish and other.user_id = caller) then
      raise exception 'the dish is cooked already' using errcode = 'MK417';
    end if;
    raise exception 'no such dish' using errcode = 'P0002';
  end if;

  if jsonb_array_length(deductions) > 0 then
    if site is null or not exists (
      select 1 from public.pantry_site as own where own.id = mark_dish_cooked.site and own.user_id = caller
    ) then
      raise exception 'the place is gone' using errcode = 'MK410';
    end if;
  end if;

  for need in select value from jsonb_array_elements(deductions)
  loop
    need_ingredient := (need ->> 'ingredient_id')::uuid;
    need_unit := need ->> 'unit';
    remaining := (need ->> 'amount')::numeric;
    if need_ingredient is null or need_unit is null or remaining is null or remaining <= 0 then
      raise exception 'a deduction needs ingredient_id, unit and an amount above 0' using errcode = '22023';
    end if;

    for stock in
      select item.id, item.site_id, item.ingredient_id, item.location, item.amount, item.unit, item.label, item.created_at
      from public.pantry_item as item
      where item.user_id = caller
        and item.site_id = mark_dish_cooked.site
        and item.ingredient_id = need_ingredient
        and item.unit = need_unit
        and item.amount is not null
      order by item.created_at, item.id
      for update
    loop
      exit when remaining <= 0;
      take := least(stock.amount, remaining);
      remaining := remaining - take;
      touched := touched || jsonb_build_array(jsonb_build_object(
        'id', stock.id, 'site_id', stock.site_id, 'ingredient_id', stock.ingredient_id,
        'location', stock.location, 'amount', stock.amount, 'unit', stock.unit,
        'label', stock.label, 'created_at', stock.created_at, 'deducted', take
      ));
      if stock.amount - take <= 0 then
        delete from public.pantry_item as gone where gone.id = stock.id and gone.user_id = caller;
      else
        update public.pantry_item as less set amount = stock.amount - take where less.id = stock.id and less.user_id = caller;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('cooked_at', marked_at, 'rows', touched);
end;
$$;

create function public.undo_dish_cooked(dish uuid, rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  entry jsonb;
  entry_id uuid;
  entry_deducted numeric;
begin
  if caller is null then
    raise exception 'undo_dish_cooked needs a signed-in user' using errcode = '42501';
  end if;
  if dish is null or jsonb_typeof(rows) is distinct from 'array' then
    raise exception 'dish and an array of rows are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));

  update public.meal_plan_recipe as target
  set cooked_at = null
  where target.id = undo_dish_cooked.dish and target.user_id = caller;
  if not found then
    raise exception 'no such dish' using errcode = 'P0002';
  end if;

  for entry in select value from jsonb_array_elements(rows)
  loop
    entry_id := (entry ->> 'id')::uuid;
    entry_deducted := (entry ->> 'deducted')::numeric;
    if entry_id is null or entry_deducted is null or entry_deducted <= 0 then
      raise exception 'a row needs its id and what was deducted' using errcode = '22023';
    end if;

    update public.pantry_item as back
    set amount = back.amount + entry_deducted
    where back.id = entry_id and back.user_id = caller and back.amount is not null;
    if not found then
      insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
      values (
        entry_id, (entry ->> 'site_id')::uuid, (entry ->> 'ingredient_id')::uuid, entry ->> 'location',
        entry_deducted, entry ->> 'unit', entry ->> 'label', (entry ->> 'created_at')::timestamptz
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.mark_dish_cooked(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.mark_dish_cooked(uuid, uuid, jsonb) to authenticated;
revoke all on function public.undo_dish_cooked(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.undo_dish_cooked(uuid, jsonb) to authenticated;
