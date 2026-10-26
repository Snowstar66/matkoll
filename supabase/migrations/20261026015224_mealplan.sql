-- Meal plan module (AD-1, AD-4, AD-20, AD-22): the meal plans and their
-- dishes. Only src/features/mealplan reads and writes these tables (AD-1).
-- Every row belongs to one user and is protected by RLS (AD-4).

create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- "Vecka 44" when created (isoWeekName); Pontus can rename it.
  name text not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint meal_plan_name_check check (btrim(name) <> '' and char_length(name) <= 100),
  -- Target of the composite foreign keys from the plan's dishes and overlay (AD-4).
  constraint meal_plan_id_user_id_key unique (id, user_id)
);

-- At most one current meal plan per user (AD-22).
create unique index meal_plan_one_current_idx on public.meal_plan (user_id) where is_current;

create table public.meal_plan_recipe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  meal_plan_id uuid not null,
  -- null once the recipe is deleted; recipe_title keeps its name (AD-20).
  recipe_id uuid,
  -- The recipe's title when the dish was added.
  recipe_title text not null,
  servings integer not null,
  -- The order on the plan; not unique, since "Ångra" puts a dish back at its old place.
  position integer not null,
  created_at timestamptz not null default now(),
  constraint meal_plan_recipe_recipe_title_check check (btrim(recipe_title) <> '' and char_length(recipe_title) <= 200),
  constraint meal_plan_recipe_servings_check check (servings >= 1),
  constraint meal_plan_recipe_position_check check (position >= 0),
  -- The dishes belong to the plan and go with it (AD-20).
  constraint meal_plan_recipe_meal_plan_fkey foreign key (meal_plan_id, user_id)
    references public.meal_plan (id, user_id) on delete cascade,
  -- Deleting a recipe keeps the dish, without its recipe, and never touches
  -- user_id (AD-20). recipes.deleteRecipe first removes it from the current
  -- plan with mealplan.detachRecipe.
  constraint meal_plan_recipe_recipe_fkey foreign key (recipe_id, user_id)
    references public.recipe (id, user_id) on delete set null (recipe_id)
);

-- The plan's dishes in order, and the foreign key's lookups when a recipe is deleted.
create index meal_plan_recipe_meal_plan_id_position_idx on public.meal_plan_recipe (meal_plan_id, position);
create index meal_plan_recipe_recipe_id_user_id_idx on public.meal_plan_recipe (recipe_id, user_id);

-- RLS: one policy per table, for select, insert, update and delete (AD-4).
alter table public.meal_plan enable row level security;
alter table public.meal_plan_recipe enable row level security;

create policy meal_plan_own_rows on public.meal_plan
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy meal_plan_recipe_own_rows on public.meal_plan_recipe
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so the
-- cloud project, where new tables are exposed by default, matches local.
revoke all on table public.meal_plan, public.meal_plan_recipe from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.meal_plan, public.meal_plan_recipe to authenticated, service_role;

-- Takes the signed-in user's meal plan lock until the transaction ends, so
-- the writes that create or switch the current plan never interleave.
create function public.meal_plan_lock()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'meal_plan_lock needs a signed-in user' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('meal_plan:' || caller::text));
end;
$$;

revoke all on function public.meal_plan_lock() from public, anon, authenticated, service_role;
grant execute on function public.meal_plan_lock() to authenticated;

-- addToCurrentPlan (AD-22): adds a dish to the signed-in user's current meal
-- plan, creating the plan (named plan_name) when there is none, in one
-- transaction. Always a new row: the same recipe may be on the plan more than
-- once. The dish goes last.
-- - dish_id is chosen by the client: when the caller already has a dish with
--   that id (a retry after a lost answer), nothing is written and that row is
--   returned. An id another user has taken is 23505.
-- - The recipe must be the caller's (the composite foreign key, 23503).
-- - The title and servings come from the caller (mealplan reads the recipe
--   through recipes/server.ts, AD-1); the checks refuse empty ones (23514).
-- - Execute only for authenticated.
create function public.add_to_current_plan(
  dish_id uuid,
  dish_recipe_id uuid,
  dish_recipe_title text,
  dish_servings integer,
  plan_name text
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

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position)
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
    )
  )
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_to_current_plan(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.add_to_current_plan(uuid, uuid, text, integer, text) to authenticated;
