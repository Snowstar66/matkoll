-- Story 13.7 follow-up: 20261029230000_meal_plan_week.sql dropped
-- add_to_current_plan, which the code on main still calls. It comes back with
-- its exact signature from 20261029200000_meal_plan_weekday.sql, as a thin
-- wrapper that adds to this week's plan (Monday in Europe/Stockholm).
create function public.add_to_current_plan(
  dish_id uuid,
  dish_recipe_id uuid,
  dish_recipe_title text,
  dish_servings integer,
  plan_name text,
  dish_weekday smallint default null
)
returns public.meal_plan_recipe
language sql
security invoker
set search_path = ''
as $$
  select * from public.add_to_plan(
    public.meal_plan_week_start(),
    dish_id,
    dish_recipe_id,
    dish_recipe_title,
    dish_servings,
    plan_name,
    dish_weekday
  );
$$;

revoke all on function public.add_to_current_plan(uuid, uuid, text, integer, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.add_to_current_plan(uuid, uuid, text, integer, text, smallint) to authenticated;
