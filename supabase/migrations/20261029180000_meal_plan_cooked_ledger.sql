-- Story 13.4 review fixes: undo runs once from a server-side ledger.
--
-- 1. meal_plan_recipe.cooked_deductions: the ledger mark_dish_cooked writes,
--    one entry per pantry row touched (id, site_id, ingredient_id, location,
--    unit, label, created_at, amount as it was, deducted, deleted). Null when
--    the dish is not cooked or nothing was deducted by a mark.
-- 2. mark_dish_cooked: stores the ledger; rejects NaN and amounts of 1000000
--    or more; rejects the same (ingredient, unit) twice.
-- 3. undo_dish_cooked(dish): takes only the dish. Under the pantry lock it
--    updates where cooked_at is not null, so it restores at most once; MK418
--    when there is nothing to undo. Clears cooked_at and cooked_deductions.

alter table public.meal_plan_recipe add column cooked_deductions jsonb;

comment on column public.meal_plan_recipe.cooked_deductions is
  'What mark_dish_cooked took from the pantry, per row, for undo_dish_cooked. Cleared when the dish is unmarked or undone.';

drop function public.undo_dish_cooked(uuid, jsonb);

create or replace function public.mark_dish_cooked(dish uuid, site uuid, deductions jsonb)
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
  seen text[] := '{}';
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
    if need_ingredient is null or need_unit is null or remaining is null
       or remaining = 'NaN'::numeric or remaining <= 0 or remaining >= 1000000 then
      raise exception 'a deduction needs ingredient_id, unit and an amount above 0 and below 1000000' using errcode = '22023';
    end if;
    if (need_ingredient::text || ':' || need_unit) = any (seen) then
      raise exception 'an ingredient and unit may appear once' using errcode = '22023';
    end if;
    seen := seen || (need_ingredient::text || ':' || need_unit);

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
        'label', stock.label, 'created_at', stock.created_at, 'deducted', take,
        'deleted', stock.amount - take <= 0
      ));
      if stock.amount - take <= 0 then
        delete from public.pantry_item as gone where gone.id = stock.id and gone.user_id = caller;
      else
        update public.pantry_item as less set amount = stock.amount - take where less.id = stock.id and less.user_id = caller;
      end if;
    end loop;
  end loop;

  update public.meal_plan_recipe as ledger
  set cooked_deductions = touched
  where ledger.id = mark_dish_cooked.dish and ledger.user_id = caller;

  return jsonb_build_object('cooked_at', marked_at, 'rows', touched);
end;
$$;

create function public.undo_dish_cooked(dish uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  ledger jsonb;
  entry jsonb;
  entry_id uuid;
  entry_deducted numeric;
begin
  if caller is null then
    raise exception 'undo_dish_cooked needs a signed-in user' using errcode = '42501';
  end if;
  if dish is null then
    raise exception 'a dish is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller::text));

  select target.cooked_deductions into ledger
  from public.meal_plan_recipe as target
  where target.id = undo_dish_cooked.dish and target.user_id = caller and target.cooked_at is not null
  for update;
  if not found then
    raise exception 'nothing to undo' using errcode = 'MK418';
  end if;

  update public.meal_plan_recipe as target
  set cooked_at = null, cooked_deductions = null
  where target.id = undo_dish_cooked.dish and target.user_id = caller;

  for entry in select value from jsonb_array_elements(coalesce(ledger, '[]'::jsonb))
  loop
    entry_id := (entry ->> 'id')::uuid;
    entry_deducted := (entry ->> 'deducted')::numeric;
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
revoke all on function public.undo_dish_cooked(uuid) from public, anon, authenticated, service_role;
grant execute on function public.undo_dish_cooked(uuid) to authenticated;
