-- Meal plan, Story 3.2 (AD-1, AD-20, AD-22): set_current_meal_plan, the only
-- function that switches the current meal plan. "Använd igen" and "Ny
-- matsedel" in Tidigare both call it.

-- setCurrentMealPlan (AD-22): makes a new meal plan, named plan_name, the
-- signed-in user's current plan, in one transaction under the meal plan lock.
-- - The plan that was current is set to is_current = false first, and becomes
--   an earlier plan with everything on it.
-- - With source_id ("Använd igen"), the new plan gets the source plan's dishes
--   with the same recipes, titles and servings in the same order (positions
--   0, 1, 2, …); dishes whose recipe is deleted (recipe_id null) are left out.
--   The source must be one of the caller's plans (P0002); it may be the
--   current one. Without source_id ("Ny matsedel"), the new plan is empty.
-- - new_plan_id is chosen by the client: when the caller already has a plan
--   with that id (a retry after a lost answer), nothing is written and that
--   plan is returned. An id another user has taken is 23505.
-- - All or nothing: a refused name (23514) or dish leaves everything as it was.
-- - Execute only for authenticated.
create function public.set_current_meal_plan(
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
    return created;
  end if;

  if source_id is not null and not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = source_id and plan.user_id = caller
  ) then
    raise exception 'the source plan is not found' using errcode = 'P0002';
  end if;

  update public.meal_plan as plan
  set is_current = false
  where plan.user_id = caller and plan.is_current;

  insert into public.meal_plan (id, name, is_current)
  values (new_plan_id, plan_name, true)
  returning * into created;

  if source_id is not null then
    insert into public.meal_plan_recipe (meal_plan_id, recipe_id, recipe_title, servings, position)
    select
      created.id,
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
