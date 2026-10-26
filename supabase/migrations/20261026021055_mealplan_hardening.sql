-- Meal plan, follow-up to 20261026015224_mealplan.sql after review (AD-1, AD-20, AD-22):
-- 1. A dish has 1 to 1000 servings, the same as servingsSchema
--    (src/features/mealplan/domain/meal-plan.ts).
-- 2. detach_recipe_from_current_plan: detachRecipe in one statement under the
--    meal plan lock, so it never races a switch of the current plan.
-- 3. restore_plan_recipe: "Ångra" under the lock, only onto the current plan.

alter table public.meal_plan_recipe drop constraint meal_plan_recipe_servings_check;
alter table public.meal_plan_recipe
  add constraint meal_plan_recipe_servings_check check (servings between 1 and 1000);

-- detachRecipe (AD-20): removes every dish of the recipe from the signed-in
-- user's current meal plan, before recipes.deleteRecipe deletes the recipe.
-- Earlier plans keep theirs (the foreign key leaves them without the
-- recipe). Returns the number of dishes removed. Execute only for authenticated.
create function public.detach_recipe_from_current_plan(detached_recipe_id uuid)
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
    raise exception 'detach_recipe_from_current_plan needs a signed-in user' using errcode = '42501';
  end if;
  if detached_recipe_id is null then
    raise exception 'detached_recipe_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  delete from public.meal_plan_recipe as dish
  using public.meal_plan as plan
  where dish.recipe_id = detached_recipe_id
    and dish.user_id = caller
    and plan.id = dish.meal_plan_id
    and plan.user_id = caller
    and plan.is_current;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.detach_recipe_from_current_plan(uuid) from public, anon, authenticated, service_role;
grant execute on function public.detach_recipe_from_current_plan(uuid) to authenticated;

-- restorePlanRecipe (AD-20): "Ångra" puts a removed dish back with the same
-- id, recipe, title, servings and place, under the meal plan lock.
-- - dish: { id, meal_plan_id, recipe_id, recipe_title, servings, position }
-- - The plan must be the caller's current plan; otherwise nothing is
--   written (55000), so a dish never comes back onto an earlier plan.
-- - The title (1–200 characters) and servings (1–1000) are checked as the
--   table does (22023); a row with the id is 23505, a recipe that is gone 23503.
-- - Execute only for authenticated.
create function public.restore_plan_recipe(dish jsonb)
returns public.meal_plan_recipe
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  dish_id uuid;
  dish_plan_id uuid;
  dish_recipe_id uuid;
  dish_title text;
  dish_servings integer;
  dish_position integer;
  restored public.meal_plan_recipe;
begin
  if caller is null then
    raise exception 'restore_plan_recipe needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(dish) is distinct from 'object' then
    raise exception 'dish must be an object' using errcode = '22023';
  end if;

  dish_id := (dish ->> 'id')::uuid;
  dish_plan_id := (dish ->> 'meal_plan_id')::uuid;
  dish_recipe_id := (dish ->> 'recipe_id')::uuid;
  dish_title := dish ->> 'recipe_title';
  dish_servings := (dish ->> 'servings')::integer;
  dish_position := (dish ->> 'position')::integer;
  if dish_id is null or dish_plan_id is null or dish_position is null or dish_position < 0 then
    raise exception 'dish needs its id, plan and position' using errcode = '22023';
  end if;
  if dish_title is null or btrim(dish_title) = '' or char_length(dish_title) > 200 then
    raise exception 'recipe_title must have 1 to 200 characters' using errcode = '22023';
  end if;
  if dish_servings is null or dish_servings not between 1 and 1000 then
    raise exception 'servings must be 1 to 1000' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = dish_plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position)
  values (dish_id, dish_plan_id, dish_recipe_id, dish_title, dish_servings, dish_position)
  returning * into restored;
  return restored;
end;
$$;

revoke all on function public.restore_plan_recipe(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.restore_plan_recipe(jsonb) to authenticated;
