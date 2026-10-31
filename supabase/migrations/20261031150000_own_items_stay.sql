-- Story 17.10: an own item stays on the shopping list until someone checks it
-- off, whichever week is shown. An own item belongs to the household, not to a
-- week: new items are stored without a meal plan, and the checks of own items
-- (`c:<id>` keys) belong to the user, not to a plan. Backward compatible with
-- the code that passes a plan: every function keeps its signature, and rows
-- that have a meal_plan_id keep working.
--
-- 1. shopping_custom_item.meal_plan_id may be null; deleting a plan keeps its
--    legacy items (the plan is cleared, not the item). The index for the plan
--    goes, one by (user_id, created_at) replaces it: the list reads all of the
--    user's items in the order they were added.
-- 2. shopping_check.meal_plan_id may be null for `c:` keys; one such check per
--    user and key. The checks of own items so far move there (a check's
--    created_at says when the item was checked, which the list uses to hide
--    an item once the week it was checked in is past).
-- 3. add/remove/update_shopping_custom_item: no "plan must be current" guard.
-- 4. set_shopping_check: a `c:` key is written without a plan.
-- 5. clear_put_in_pantry: own items and their checks are deleted by id.
-- 6. set_current_meal_plan: a plan is no longer kept for its own items.

-- 1. Own items.
alter table public.shopping_custom_item alter column meal_plan_id drop not null;
alter table public.shopping_custom_item drop constraint shopping_custom_item_meal_plan_fkey;
-- Only meal_plan_id is cleared: user_id is not null and stays.
alter table public.shopping_custom_item add constraint shopping_custom_item_meal_plan_fkey
  foreign key (meal_plan_id, user_id) references public.meal_plan (id, user_id) on delete set null (meal_plan_id);
drop index public.shopping_custom_item_user_id_meal_plan_id_idx;
create index shopping_custom_item_user_id_created_at_idx on public.shopping_custom_item (user_id, created_at);

-- 2. Checks.
alter table public.shopping_check alter column meal_plan_id drop not null;
-- Only an own item's check can be without a plan.
alter table public.shopping_check add constraint shopping_check_plan_or_own_check check (
  meal_plan_id is not null or line_key like 'c:%'
);
-- One check per user and own item (the unique key on (meal_plan_id, line_key)
-- does not hold nulls apart).
create unique index shopping_check_user_id_line_key_own_idx on public.shopping_check (user_id, line_key)
  where meal_plan_id is null;

-- The checks of own items move off their plans (the earliest check wins).
insert into public.shopping_check (user_id, meal_plan_id, line_key, created_at)
select distinct on (item.user_id, item.line_key) item.user_id, null, item.line_key, item.created_at
from public.shopping_check as item
where item.line_key like 'c:%' and item.meal_plan_id is not null
order by item.user_id, item.line_key, item.created_at
on conflict (user_id, line_key) where meal_plan_id is null do nothing;
delete from public.shopping_check as item
where item.line_key like 'c:%' and item.meal_plan_id is not null;

-- 3. addCustomItem and restoreCustomItem (FR-17, AD-20): puts an own item on
-- the caller's list under the meal plan lock.
-- - item: { id, meal_plan_id, label, ingredient_id, amount, unit }; the id is
--   chosen by the client. meal_plan_id is optional: an item without one
--   belongs to the household. A given plan must be the caller's (23503 from
--   the plan foreign key), but need not be the current one.
-- - When the caller already has an item with the id and the same text,
--   ingredient, amount and unit (a retry, or "Ångra" twice), nothing is written
--   and that row is returned. With anything different, nothing is written
--   (55000). An id another user has taken is 23505.
create or replace function public.add_shopping_custom_item(item jsonb)
returns public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
  item_plan_id uuid;
  item_ingredient_id uuid;
  item_amount numeric;
  added public.shopping_custom_item;
begin
  if caller is null then
    raise exception 'add_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  item_plan_id := (item ->> 'meal_plan_id')::uuid;
  item_ingredient_id := (item ->> 'ingredient_id')::uuid;
  item_amount := (item ->> 'amount')::numeric;
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into added
  from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller;
  if found then
    if added.label = (item ->> 'label')
      and added.ingredient_id is not distinct from item_ingredient_id
      and added.amount is not distinct from item_amount
      and added.unit is not distinct from (item ->> 'unit')
    then
      return added;
    end if;
    raise exception 'the item with this id is a different item' using errcode = '55000';
  end if;

  insert into public.shopping_custom_item (id, user_id, meal_plan_id, label, ingredient_id, amount, unit)
  values (item_id, caller, item_plan_id, item ->> 'label', item_ingredient_id, item_amount, item ->> 'unit')
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_shopping_custom_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_shopping_custom_item(jsonb) to authenticated;

-- removeCustomItem (FR-17, AD-20): deletes one of the caller's own items for
-- good under the lock and returns it as it was, for "Ångra". Its check stays.
-- No row when the caller has no item with the id.
create or replace function public.remove_shopping_custom_item(item_id uuid)
returns setof public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'remove_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if item_id is null then
    raise exception 'item_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  return query
  delete from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller
  returning own.*;
end;
$$;

revoke all on function public.remove_shopping_custom_item(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_shopping_custom_item(uuid) to authenticated;

-- updateCustomItem (FR-17, Story 3.6): changes an own item's text, ingredient,
-- amount and unit, keeping its id and so its check, under the lock. The
-- item's plan is not compared and not changed. P0002 when the caller has no
-- item with the id. Idempotent.
create or replace function public.update_shopping_custom_item(item jsonb)
returns public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
  saved public.shopping_custom_item;
begin
  if caller is null then
    raise exception 'update_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into saved
  from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller;
  if not found then
    raise exception 'the item is not found' using errcode = 'P0002';
  end if;

  update public.shopping_custom_item as own
  set
    label = item ->> 'label',
    ingredient_id = (item ->> 'ingredient_id')::uuid,
    amount = (item ->> 'amount')::numeric,
    unit = item ->> 'unit'
  where own.id = item_id and own.user_id = caller
  returning own.* into saved;
  return saved;
end;
$$;

revoke all on function public.update_shopping_custom_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_shopping_custom_item(jsonb) to authenticated;

-- 4. setChecked (FR-16, AD-22): checks a line off, or takes the check off,
-- under the meal plan lock.
-- - A `c:` key (an own item) belongs to the user, not to a plan: plan_id may
--   be null and is not compared with the current plan.
-- - Any other key needs plan_id, the caller's current plan, else nothing is
--   written (55000).
-- - Checking a checked line, or unchecking an unchecked one, changes nothing.
-- - The check constraint refuses a key line-key.ts does not build (23514).
create or replace function public.set_shopping_check(plan_id uuid, line_key text, checked boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  own_item boolean;
begin
  if caller is null then
    raise exception 'set_shopping_check needs a signed-in user' using errcode = '42501';
  end if;
  if set_shopping_check.line_key is null or set_shopping_check.checked is null then
    raise exception 'line_key and checked are required' using errcode = '22023';
  end if;
  own_item := left(set_shopping_check.line_key, 2) = 'c:';
  if set_shopping_check.plan_id is null and not own_item then
    raise exception 'plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if own_item then
    if set_shopping_check.checked then
      insert into public.shopping_check (user_id, meal_plan_id, line_key)
      values (caller, null, set_shopping_check.line_key)
      on conflict (user_id, line_key) where meal_plan_id is null do nothing;
    else
      delete from public.shopping_check as item
      where item.line_key = set_shopping_check.line_key
        and item.user_id = caller;
    end if;
    return;
  end if;

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = set_shopping_check.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if set_shopping_check.checked then
    insert into public.shopping_check (user_id, meal_plan_id, line_key)
    values (caller, set_shopping_check.plan_id, set_shopping_check.line_key)
    on conflict on constraint shopping_check_meal_plan_id_line_key_key do nothing;
  else
    delete from public.shopping_check as item
    where item.meal_plan_id = set_shopping_check.plan_id
      and item.line_key = set_shopping_check.line_key
      and item.user_id = caller;
  end if;
end;
$$;

revoke all on function public.set_shopping_check(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_shopping_check(uuid, text, boolean) to authenticated;

-- 5. "Lägg i lagret": as in 20261026050803_shopping_clear_hardening.sql, on the
-- caller's current plan only (55000), except that own items are deleted by id
-- whichever plan they belong to (or none), and a check is deleted by id
-- whether it belongs to the plan or, an own item's, to the user.
create or replace function public.clear_put_in_pantry(
  plan_id uuid,
  check_ids uuid[],
  override_keys text[],
  custom_item_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  removed integer;
begin
  if caller is null then
    raise exception 'clear_put_in_pantry needs a signed-in user' using errcode = '42501';
  end if;
  if clear_put_in_pantry.plan_id is null
    or clear_put_in_pantry.check_ids is null
    or clear_put_in_pantry.override_keys is null
    or clear_put_in_pantry.custom_item_ids is null then
    raise exception 'plan_id, check_ids, override_keys and custom_item_ids are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = clear_put_in_pantry.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  delete from public.shopping_custom_item as own
  where own.user_id = caller
    and own.id = any (clear_put_in_pantry.custom_item_ids);
  get diagnostics removed = row_count;

  delete from public.shopping_check as item
  where item.user_id = caller
    and (item.meal_plan_id = clear_put_in_pantry.plan_id or item.meal_plan_id is null)
    and item.id = any (clear_put_in_pantry.check_ids);

  delete from public.shopping_line_override as item
  where item.meal_plan_id = clear_put_in_pantry.plan_id
    and item.user_id = caller
    and item.line_key = any (clear_put_in_pantry.override_keys);

  return removed;
end;
$$;

revoke all on function public.clear_put_in_pantry(uuid, uuid[], text[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.clear_put_in_pantry(uuid, uuid[], text[], uuid[]) to authenticated;

-- 6. setCurrentMealPlan, as in 20261029232000_set_current_keeps_own_items.sql,
-- except that own items no longer keep a plan: they do not belong to it. The
-- plan that was current is kept as an earlier plan only with dishes.
create or replace function public.set_current_meal_plan(
  new_plan_id uuid,
  plan_name text,
  source_id uuid default null
)
returns public.meal_plan
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  this_week date := public.meal_plan_week_start();
  created public.meal_plan;
  previous_id uuid;
begin
  if caller is null then
    raise exception 'set_current_meal_plan needs a signed-in user' using errcode = '42501';
  end if;
  if new_plan_id is null then
    raise exception 'new_plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();
  perform public.meal_plan_close_past();

  select plan.* into created
  from public.meal_plan as plan
  where plan.id = new_plan_id and plan.user_id = caller;
  if found then
    if created.week_start = this_week then
      return created;
    end if;
    raise exception 'the plan is no longer the current one' using errcode = '55000';
  end if;

  if source_id is not null then
    if not exists (
      select 1
      from public.meal_plan as plan
      where plan.id = source_id and plan.user_id = caller
    ) then
      raise exception 'the source plan is not found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1
      from public.meal_plan_recipe as dish
      where dish.meal_plan_id = source_id and dish.user_id = caller and dish.recipe_id is not null
    ) then
      raise exception 'the source plan has no dish to use again' using errcode = '22023';
    end if;
  end if;

  select plan.id into previous_id
  from public.meal_plan as plan
  where plan.user_id = caller and plan.week_start = this_week;
  if previous_id is not null then
    if exists (select 1 from public.meal_plan_recipe as dish where dish.meal_plan_id = previous_id) then
      update public.meal_plan as plan
      set is_current = false, week_start = null
      where plan.id = previous_id;
    else
      delete from public.meal_plan as plan
      where plan.id = previous_id;
    end if;
  end if;

  insert into public.meal_plan (id, user_id, name, is_current, week_start)
  values (new_plan_id, caller, plan_name, true, this_week)
  returning * into created;

  if source_id is not null then
    insert into public.meal_plan_recipe (meal_plan_id, user_id, recipe_id, recipe_title, servings, position)
    select
      created.id,
      caller,
      dish.recipe_id,
      dish.recipe_title,
      dish.servings,
      (row_number() over (order by dish.position, dish.id) - 1)::integer
    from public.meal_plan_recipe as dish
    where dish.meal_plan_id = source_id
      and dish.user_id = caller
      and dish.recipe_id is not null;
  end if;

  return created;
end;
$$;

revoke all on function public.set_current_meal_plan(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_current_meal_plan(uuid, text, uuid) to authenticated;
