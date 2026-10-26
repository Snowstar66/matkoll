-- Shopping module (AD-1, AD-4, AD-6, AD-8, AD-20, AD-22): Pontus's own items
-- on the shopping list (Story 3.5, egna varor). Only src/features/shopping
-- reads and writes this table (AD-1). An own item belongs to a meal plan, has
-- Pontus's text, and may point at a catalog ingredient, which gives its store
-- section; it is never merged with the recipes' lines. Its list key is
-- `c:<id>` (shopping/domain/line-key.ts), so its check is in shopping_check.
-- Every row belongs to one user and is protected by RLS (AD-4).
--
-- 1. shopping_custom_item.
-- 2. add_shopping_custom_item: adding an item, and "Ångra" after removing
--    one, onto the caller's current plan under the meal plan lock.
-- 3. remove_shopping_custom_item: removing an item from the current plan
--    under the lock, returning it as it was for "Ångra".
-- 4. set_current_meal_plan: a plan with own items is not empty, so it is
--    kept as an earlier plan, with its items, when another becomes current.

create table public.shopping_custom_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  meal_plan_id uuid not null,
  label text not null,
  ingredient_id uuid,
  amount numeric,
  unit text,
  created_at timestamptz not null default now(),
  -- What Pontus wrote: not empty, at most maxCustomLabelLength (custom-item.ts).
  constraint shopping_custom_item_label_check check (btrim(label) <> '' and char_length(label) <= 200),
  -- An amount is positive and below maxCustomAmount (custom-item.ts).
  constraint shopping_custom_item_amount_check check (amount > 0 and amount < 1000000),
  -- The catalog's UNITS (tests/design/shopping-checks pins the list to the domain).
  constraint shopping_custom_item_unit_check check (
    unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva')
  ),
  -- Both or neither: a pantry row without a unit means unlimited (AD-19), so
  -- an amount never goes without its unit.
  constraint shopping_custom_item_amount_unit_check check ((amount is null) = (unit is null)),
  -- The meal plan owns its overlay: deleting the plan deletes its items (AD-20).
  constraint shopping_custom_item_meal_plan_fkey foreign key (meal_plan_id, user_id)
    references public.meal_plan (id, user_id) on delete cascade,
  -- The catalog is another module: never deleted from under an item (AD-20).
  constraint shopping_custom_item_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict
);

-- The list reads the user's items of a plan; the index also serves the plan
-- foreign key's lookups when a plan is deleted.
create index shopping_custom_item_user_id_meal_plan_id_idx on public.shopping_custom_item (user_id, meal_plan_id);
-- The ingredient foreign key's lookups when an ingredient is deleted.
create index shopping_custom_item_ingredient_id_user_id_idx on public.shopping_custom_item (ingredient_id, user_id)
  where ingredient_id is not null;

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.shopping_custom_item enable row level security;

create policy shopping_custom_item_own_rows on public.shopping_custom_item
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.shopping_custom_item from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.shopping_custom_item to authenticated, service_role;

-- addCustomItem and restoreCustomItem (FR-17, AD-20, AD-22): puts an own
-- item onto the signed-in user's current meal plan, in one transaction under
-- the meal plan lock.
-- - item: { id, meal_plan_id, label, ingredient_id, amount, unit }; the id is
--   chosen by the client, so a retry after a lost answer, or "Ångra" with the
--   removed row, writes the item with that id once.
-- - When the caller already has an item with the id (a retry), nothing is
--   written and that row is returned. An id another user has taken is 23505.
-- - meal_plan_id must be the caller's current plan, else nothing is written
--   (55000): the list was counted for a plan that is no longer current, and
--   own items never land on an earlier plan.
-- - The table's checks refuse an empty text, an amount without a unit or a
--   unit outside UNITS (23514); the ingredient must be the caller's (23503).
-- - Execute only for authenticated.
create function public.add_shopping_custom_item(item jsonb)
returns public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
  item_plan_id uuid;
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
  if item_id is null or item_plan_id is null then
    raise exception 'item needs its id and plan' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into added
  from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller;
  if found then
    return added;
  end if;

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = item_plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  insert into public.shopping_custom_item (id, user_id, meal_plan_id, label, ingredient_id, amount, unit)
  values (
    item_id,
    caller,
    item_plan_id,
    item ->> 'label',
    (item ->> 'ingredient_id')::uuid,
    (item ->> 'amount')::numeric,
    item ->> 'unit'
  )
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_shopping_custom_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_shopping_custom_item(jsonb) to authenticated;

-- removeCustomItem (FR-17, AD-20): deletes one of the signed-in user's own
-- items for good, under the meal plan lock, and returns it as it was, for
-- "Ångra". Its check (shopping_check, `c:<id>`) stays, so "Ångra" brings the
-- check back too. No row when the caller has no item with the id (gone
-- already, or another user's). An item on a plan that is no longer the
-- current one is not deleted (55000): the list was counted for that plan.
-- Execute only for authenticated.
create function public.remove_shopping_custom_item(item_id uuid)
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

  if exists (
    select 1
    from public.shopping_custom_item as own
    join public.meal_plan as plan on plan.id = own.meal_plan_id and plan.user_id = own.user_id
    where own.id = item_id and own.user_id = caller and not plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  return query
  delete from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller
  returning own.*;
end;
$$;

revoke all on function public.remove_shopping_custom_item(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_shopping_custom_item(uuid) to authenticated;

-- setCurrentMealPlan (AD-22), as in 20261026023341_mealplan_set_current_hardening.sql,
-- except that the plan that was current counts as empty only without dishes
-- and without own items (Story 3.5): one with own items is kept as an earlier
-- plan, and its items stay with it.
-- - The plan that was current becomes an earlier plan with everything on it;
--   one without dishes and own items is deleted instead, so Tidigare never
--   fills with empty plans.
-- - With source_id ("Använd igen"), the new plan gets the source plan's dishes
--   with the same recipes, titles and servings in the same order (positions
--   0, 1, 2, …); dishes whose recipe is deleted (recipe_id null) are left out.
--   Own items are not copied: they belong to the plan they were added to.
--   The source must be one of the caller's plans (P0002) with at least one
--   dish whose recipe is left (22023). Without source_id ("Ny matsedel"), the
--   new plan is empty.
-- - new_plan_id is chosen by the client: when it is the caller's current plan
--   already (a retry after a lost answer), nothing is written and that plan
--   is returned; when it is one of the caller's earlier plans, nothing is
--   written (55000). An id another user has taken is 23505.
-- - All or nothing: a refused name (23514) or dish leaves everything as it was.
-- - Execute only for authenticated.
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

  select plan.* into created
  from public.meal_plan as plan
  where plan.id = new_plan_id and plan.user_id = caller;
  if found then
    if created.is_current then
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
  where plan.user_id = caller and plan.is_current;
  if previous_id is not null then
    if exists (select 1 from public.meal_plan_recipe as dish where dish.meal_plan_id = previous_id)
      or exists (select 1 from public.shopping_custom_item as own where own.meal_plan_id = previous_id)
    then
      update public.meal_plan as plan
      set is_current = false
      where plan.id = previous_id;
    else
      delete from public.meal_plan as plan
      where plan.id = previous_id;
    end if;
  end if;

  insert into public.meal_plan (id, user_id, name, is_current)
  values (new_plan_id, caller, plan_name, true)
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
