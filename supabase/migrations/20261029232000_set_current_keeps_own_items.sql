-- Story 13.7 follow-up: set_current_meal_plan in 20261029230000_meal_plan_week.sql
-- was written from the 3.2 version and lost the rule of
-- 20261026033405_shopping_custom_item.sql: a plan that has own items on its
-- list, even without dishes, is kept as an earlier plan, not deleted. The week
-- rules of 20261029230000 stay.
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
    if exists (select 1 from public.meal_plan_recipe as dish where dish.meal_plan_id = previous_id)
      or exists (select 1 from public.shopping_custom_item as own where own.meal_plan_id = previous_id)
    then
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
