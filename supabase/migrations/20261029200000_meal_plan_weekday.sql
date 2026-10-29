-- Days on the menu (Story 13.5, FR-13): a dish can lie on a weekday.
--
-- 1. meal_plan_recipe.weekday smallint: 1 = Monday ... 7 = Sunday, null = "Ingen
--    dag än". Existing rows stay null, so every menu keeps its dishes and
--    shows them under "Ingen dag än". The table's RLS policy and grants
--    cover the new column. The shopping list never reads it.
-- 2. add_to_current_plan gets an optional dish_weekday (default null). The old
--    five-argument function is dropped so the call stays unambiguous; the
--    body is otherwise the one from 20261026015224_mealplan.sql.
-- 3. restore_plan_recipe ("Ångra" after "Ta bort") puts the weekday back too.
-- Both functions are security invoker with search_path = '' and execute only
-- for authenticated, as before.

alter table public.meal_plan_recipe add column weekday smallint;

alter table public.meal_plan_recipe
  add constraint meal_plan_recipe_weekday_check check (weekday is null or weekday between 1 and 7);

comment on column public.meal_plan_recipe.weekday is
  'The weekday the dish is planned for, 1 (Monday) to 7 (Sunday), or null for no day yet.';

drop function public.add_to_current_plan(uuid, uuid, text, integer, text);

create function public.add_to_current_plan(
  dish_id uuid,
  dish_recipe_id uuid,
  dish_recipe_title text,
  dish_servings integer,
  plan_name text,
  dish_weekday smallint default null
)
returns public.meal_plan_recipe
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  current_plan_id uuid;
  added public.meal_plan_recipe;
begin
  if caller is null then
    raise exception 'add_to_current_plan needs a signed-in user' using errcode = '42501';
  end if;
  if dish_id is null or dish_recipe_id is null then
    raise exception 'dish_id and dish_recipe_id are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select dish.* into added
  from public.meal_plan_recipe as dish
  where dish.id = dish_id and dish.user_id = caller;
  if found then
    return added;
  end if;

  select plan.id into current_plan_id
  from public.meal_plan as plan
  where plan.user_id = caller and plan.is_current;
  if current_plan_id is null then
    insert into public.meal_plan (name, is_current)
    values (plan_name, true)
    returning id into current_plan_id;
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday)
  values (
    dish_id,
    current_plan_id,
    dish_recipe_id,
    dish_recipe_title,
    dish_servings,
    (
      select coalesce(max(other.position) + 1, 0)
      from public.meal_plan_recipe as other
      where other.meal_plan_id = current_plan_id
    ),
    dish_weekday
  )
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_to_current_plan(uuid, uuid, text, integer, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.add_to_current_plan(uuid, uuid, text, integer, text, smallint) to authenticated;

create or replace function public.restore_plan_recipe(dish jsonb)
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
  dish_weekday smallint;
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
  dish_weekday := (dish ->> 'weekday')::smallint;
  if dish_id is null or dish_plan_id is null or dish_position is null or dish_position < 0 then
    raise exception 'dish needs its id, plan and position' using errcode = '22023';
  end if;
  if dish_title is null or btrim(dish_title) = '' or char_length(dish_title) > 200 then
    raise exception 'recipe_title must have 1 to 200 characters' using errcode = '22023';
  end if;
  if dish_servings is null or dish_servings not between 1 and 1000 then
    raise exception 'servings must be 1 to 1000' using errcode = '22023';
  end if;
  if dish_weekday is not null and dish_weekday not between 1 and 7 then
    raise exception 'weekday must be 1 to 7' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = dish_plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday)
  values (dish_id, dish_plan_id, dish_recipe_id, dish_title, dish_servings, dish_position, dish_weekday)
  returning * into restored;
  return restored;
end;
$$;
