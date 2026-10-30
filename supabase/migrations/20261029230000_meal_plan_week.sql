-- Plan the coming weeks (Story 13.7, FR-13): a meal plan belongs to a week.
--
-- 1. meal_plan.week_start date: the Monday of the plan's week, counted in
--    Europe/Stockholm. null means "tidigare": a plan that belongs to no
--    particular week (an old plan, or one "Använd igen" / "Ny matsedel" put
--    aside). At most one plan per user and week (unique index below).
-- 2. Backfill: the plan that is current now gets this week's Monday, so
--    Pontus's menu and its shopping list (checks, own items, hidden lines
--    hang on the plan's id) stay where they are. Earlier plans stay null:
--    several of them can share a week, and Tidigare already orders them by
--    created_at, so a guessed Monday would only risk a unique violation.
-- 3. is_current changes meaning to "open for editing": the plan of this week
--    or a later one. Every function that says `plan.is_current` (checks, own
--    items, overrides, restore, detach) therefore works for the coming weeks
--    too, unchanged. The one-current-plan index is replaced by the
--    one-plan-per-week index. What is "the current plan" for the app is the
--    plan whose week_start is this week's Monday.
-- 4. add_to_current_plan is replaced by add_to_plan(week_start, ...), which
--    creates the week's plan on the first dish. set_current_meal_plan and
--    delete_meal_plan are rewritten for the week model.
-- RLS and grants are those of the table, as before; the functions are
-- security invoker with search_path = '' and execute only for authenticated.

alter table public.meal_plan add column week_start date;

alter table public.meal_plan
  add constraint meal_plan_week_start_check check (week_start is null or extract(isodow from week_start) = 1);

comment on column public.meal_plan.week_start is
  'The Monday (Europe/Stockholm) of the week the plan is for, or null for an earlier plan that belongs to no week.';

drop index public.meal_plan_one_current_idx;
create unique index meal_plan_user_week_idx on public.meal_plan (user_id, week_start) where week_start is not null;

-- This week's Monday in Stockholm (or the Monday of the week `at` falls in).
create function public.meal_plan_week_start(at timestamptz default now())
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.date_trunc('week', at at time zone 'Europe/Stockholm')::date;
$$;

revoke all on function public.meal_plan_week_start(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.meal_plan_week_start(timestamptz) to authenticated;

-- The plan that is current now belongs to this week.
update public.meal_plan set week_start = public.meal_plan_week_start() where is_current;

-- A plan of a week that has passed is no longer open. Called under the lock
-- by the functions below, so the flag follows the calendar when plans change.
create function public.meal_plan_close_past()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'meal_plan_close_past needs a signed-in user' using errcode = '42501';
  end if;
  update public.meal_plan as plan
  set is_current = false
  where plan.user_id = caller and plan.is_current and plan.week_start < public.meal_plan_week_start();
end;
$$;

revoke all on function public.meal_plan_close_past() from public, anon, authenticated, service_role;
grant execute on function public.meal_plan_close_past() to authenticated;

-- addToPlan (AD-22): adds a dish last on the signed-in user's plan for the
-- week starting week_start, creating the plan (named plan_name) on the first
-- dish, in one transaction.
-- - week_start must be a Monday, this week or a later one, at most 12 weeks
--   ahead (22023).
-- - dish_id is chosen by the client: a retry with an id the caller already has
--   writes nothing and returns that row. An id another user has taken is 23505.
-- - The recipe must be the caller's (23503); title and servings are checked
--   by the table (23514).
create function public.add_to_plan(
  week_start date,
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
  this_week date := public.meal_plan_week_start();
  week_plan_id uuid;
  added public.meal_plan_recipe;
begin
  if caller is null then
    raise exception 'add_to_plan needs a signed-in user' using errcode = '42501';
  end if;
  if dish_id is null or dish_recipe_id is null then
    raise exception 'dish_id and dish_recipe_id are required' using errcode = '22023';
  end if;
  if week_start is null or extract(isodow from week_start) <> 1
    or week_start < this_week or week_start > this_week + 84 then
    raise exception 'week_start must be a Monday from this week, at most 12 weeks ahead' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();
  perform public.meal_plan_close_past();

  select dish.* into added
  from public.meal_plan_recipe as dish
  where dish.id = dish_id and dish.user_id = caller;
  if found then
    return added;
  end if;

  select plan.id into week_plan_id
  from public.meal_plan as plan
  where plan.user_id = caller and plan.week_start = add_to_plan.week_start;
  if week_plan_id is null then
    insert into public.meal_plan (user_id, name, is_current, week_start)
    values (caller, plan_name, true, add_to_plan.week_start)
    returning id into week_plan_id;
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday)
  values (
    dish_id,
    week_plan_id,
    dish_recipe_id,
    dish_recipe_title,
    dish_servings,
    (
      select coalesce(max(other.position) + 1, 0)
      from public.meal_plan_recipe as other
      where other.meal_plan_id = week_plan_id
    ),
    dish_weekday
  )
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_to_plan(date, uuid, uuid, text, integer, text, smallint)
  from public, anon, authenticated, service_role;
grant execute on function public.add_to_plan(date, uuid, uuid, text, integer, text, smallint) to authenticated;

drop function public.add_to_current_plan(uuid, uuid, text, integer, text, smallint);

-- setCurrentMealPlan (AD-22): "Använd igen" and "Ny matsedel" make a new plan
-- for THIS week, as in Story 3.2. The plan this week already has becomes an
-- earlier plan with everything on it (week_start null, no longer open); one
-- without dishes is deleted instead. Plans of coming weeks are not touched.
-- Otherwise as in 20261026023341_mealplan_set_current_hardening.sql: new_plan_id
-- is the client's; a retry with the caller's plan of this week returns it, an
-- id of an earlier plan is 55000; the source must be the caller's (P0002) with
-- a dish whose recipe is left (22023).
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

-- deletePlan (AD-20): deletes one of the signed-in user's earlier plans.
-- A plan of this week or a coming week is open and never deleted (55000).
create or replace function public.delete_meal_plan(plan_id uuid)
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
  perform public.meal_plan_close_past();

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
