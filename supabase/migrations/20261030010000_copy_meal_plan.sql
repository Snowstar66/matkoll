-- Story 13.9: "Kopiera till …" copies the dishes of one of the caller's plans
-- into the plan of a week (this week to 12 weeks ahead), appending when that
-- week has dishes already. One transaction, through add_to_plan (which locks,
-- creates the week's plan and checks the recipe). Weekday, servings and order
-- are kept. Dishes whose recipe is deleted (recipe_id null) are skipped, as
-- set_current_meal_plan ("Använd igen") does: without a recipe a dish has no
-- ingredients to buy or cook. Returns how many dishes were copied.
-- Errors: P0002 no such plan of the caller's; 22023 bad week, the plan's own
-- week, or no dish with a recipe left; 42501 not signed in.
-- Additive only: nothing existing is changed.
create function public.copy_meal_plan(source_plan uuid, target_week date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  source_week date;
  copied integer := 0;
  item record;
begin
  if caller is null then
    raise exception 'copy_meal_plan needs a signed-in user' using errcode = '42501';
  end if;

  select plan.week_start into source_week
  from public.meal_plan as plan
  where plan.id = source_plan and plan.user_id = caller;
  if not found then
    raise exception 'no such meal plan' using errcode = 'P0002';
  end if;
  if source_week is not distinct from target_week then
    raise exception 'a plan is not copied onto its own week' using errcode = '22023';
  end if;

  for item in
    select dish.recipe_id, dish.recipe_title, dish.servings, dish.weekday
    from public.meal_plan_recipe as dish
    where dish.meal_plan_id = source_plan and dish.user_id = caller and dish.recipe_id is not null
    order by dish.position, dish.id
  loop
    perform public.add_to_plan(
      target_week,
      pg_catalog.gen_random_uuid(),
      item.recipe_id,
      item.recipe_title,
      item.servings,
      'Vecka ' || pg_catalog.date_part('week', target_week)::integer,
      item.weekday
    );
    copied := copied + 1;
  end loop;

  if copied = 0 then
    raise exception 'no dish with a recipe to copy' using errcode = '22023';
  end if;
  return copied;
end;
$$;

revoke all on function public.copy_meal_plan(uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.copy_meal_plan(uuid, date) to authenticated;
