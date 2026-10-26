-- Meal plan, follow-up to 20261026022037_mealplan_set_current.sql after
-- review (AD-1, AD-20, AD-22):
-- 1. set_current_meal_plan: a retry with a plan id that is no longer the
--    current plan is refused (55000) instead of returned; a source without a
--    dish whose recipe is left is refused (22023); an empty current plan is
--    deleted instead of kept as an earlier plan; both inserts name the caller.
-- 2. delete_meal_plan: deleting an earlier plan under the meal plan lock, so
--    it never races "Använd igen" of the same plan.

-- setCurrentMealPlan (AD-22): makes a new meal plan, named plan_name, the
-- signed-in user's current plan, in one transaction under the meal plan lock.
-- - The plan that was current becomes an earlier plan with everything on it;
--   one without dishes is deleted instead, so Tidigare never fills with
--   empty plans.
-- - With source_id ("Använd igen"), the new plan gets the source plan's dishes
--   with the same recipes, titles and servings in the same order (positions
--   0, 1, 2, …); dishes whose recipe is deleted (recipe_id null) are left out.
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
    if exists (select 1 from public.meal_plan_recipe as dish where dish.meal_plan_id = previous_id) then
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

-- deletePlan (AD-20): deletes one of the signed-in user's earlier meal plans
-- for good, with its dishes and what the shopping list keeps for it (on delete
-- cascade), under the meal plan lock. Returns false when the caller has no
-- plan with the id (gone already, or another user's). The current plan is
-- never deleted (55000). Execute only for authenticated.
create function public.delete_meal_plan(plan_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'delete_meal_plan needs a signed-in user' using errcode = '42501';
  end if;
  if plan_id is null then
    raise exception 'plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if exists (
    select 1
    from public.meal_plan as plan
    where plan.id = plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the current plan is not deleted' using errcode = '55000';
  end if;

  delete from public.meal_plan as plan
  where plan.id = plan_id and plan.user_id = caller and not plan.is_current;
  return found;
end;
$$;

revoke all on function public.delete_meal_plan(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_meal_plan(uuid) to authenticated;
