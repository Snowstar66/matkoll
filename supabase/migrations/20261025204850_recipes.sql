-- Recipes module (AD-1, AD-4, AD-10, AD-20): a recipe with its steps and lines.
-- Only src/features/recipes reads and writes these tables (AD-1).
-- Every row belongs to one user and is protected by RLS (AD-4).
-- The check lists must equal UNITS in src/features/catalog/domain and
-- SOURCE_KINDS in src/features/recipes/domain (tests/design/recipe-checks.test.ts).

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  original_servings integer not null,
  total_minutes integer,
  -- Only an address; the image is never stored (AD-15).
  image_url text,
  source_kind text not null,
  source_url text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_title_check check (btrim(title) <> ''),
  constraint recipe_original_servings_check check (original_servings >= 1),
  constraint recipe_total_minutes_check check (total_minutes is null or total_minutes >= 0),
  constraint recipe_image_url_check check (image_url is null or image_url ~* '^https?://'),
  constraint recipe_source_kind_check check (
    source_kind in ('url', 'text', 'photo', 'ai')
  ),
  constraint recipe_source_url_check check (
    source_url is null or (source_kind = 'url' and source_url ~* '^https?://')
  ),
  -- Target of the composite foreign keys from the recipe's steps and lines (AD-4).
  constraint recipe_id_user_id_key unique (id, user_id)
);

create table public.recipe_step (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id uuid not null,
  position integer not null,
  text text not null,
  created_at timestamptz not null default now(),
  constraint recipe_step_position_check check (position >= 0),
  constraint recipe_step_text_check check (btrim(text) <> ''),
  constraint recipe_step_recipe_id_position_key unique (recipe_id, position),
  -- Target of recipe_ingredient's step link, which must stay inside the recipe.
  constraint recipe_step_id_recipe_id_user_id_key unique (id, recipe_id, user_id),
  -- Steps belong to the recipe and go with it (AD-20).
  constraint recipe_step_recipe_fkey foreign key (recipe_id, user_id)
    references public.recipe (id, user_id) on delete cascade
);

create table public.recipe_ingredient (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id uuid not null,
  -- null: the line has no catalog ingredient (nothing to match or propose).
  ingredient_id uuid,
  -- The first step the line is used in, if any.
  step_id uuid,
  position integer not null,
  original_text text not null,
  amount numeric,
  unit text,
  is_vague boolean not null,
  created_at timestamptz not null default now(),
  constraint recipe_ingredient_position_check check (position >= 0),
  constraint recipe_ingredient_original_text_check check (btrim(original_text) <> ''),
  constraint recipe_ingredient_amount_check check (amount is null or amount > 0),
  constraint recipe_ingredient_unit_check check (
    unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva')
  ),
  -- A line is vague exactly when it has no amount, and then it has no unit (AD-12).
  constraint recipe_ingredient_vague_check check (
    (is_vague and amount is null and unit is null) or (not is_vague and amount is not null)
  ),
  constraint recipe_ingredient_recipe_id_position_key unique (recipe_id, position),
  -- Lines belong to the recipe and go with it (AD-20).
  constraint recipe_ingredient_recipe_fkey foreign key (recipe_id, user_id)
    references public.recipe (id, user_id) on delete cascade,
  -- The catalog is another module: never deleted from under a recipe (AD-20).
  constraint recipe_ingredient_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict,
  -- A step of the same recipe. Removing the step keeps the line without a step.
  constraint recipe_ingredient_step_fkey foreign key (step_id, recipe_id, user_id)
    references public.recipe_step (id, recipe_id, user_id) on delete set null (step_id)
);

create index recipe_ingredient_ingredient_id_user_id_idx on public.recipe_ingredient (ingredient_id, user_id);
create index recipe_ingredient_step_id_idx on public.recipe_ingredient (step_id);

-- RLS: one policy per table, for select, insert, update and delete (AD-4).
alter table public.recipe enable row level security;
alter table public.recipe_step enable row level security;
alter table public.recipe_ingredient enable row level security;

create policy recipe_own_rows on public.recipe
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recipe_step_own_rows on public.recipe_step
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy recipe_ingredient_own_rows on public.recipe_ingredient
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so the
-- cloud project, where new tables are exposed by default, matches local.
revoke all on table public.recipe, public.recipe_step, public.recipe_ingredient
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.recipe, public.recipe_step, public.recipe_ingredient
  to authenticated, service_role;

-- Saves a new recipe with its steps and lines in one transaction, as the caller
-- (RLS applies), and returns the recipe's id (AD-1, AD-10). saveRecipe calls it
-- after catalog.commitIngredients has given each line its ingredient id.
-- - recipe: { title, original_servings, total_minutes, image_url, source_kind, source_url }
-- - steps: [{ position, text }], positions 0, 1, 2, …
-- - lines: [{ position, original_text, amount, unit, is_vague, ingredient_id, step_position }]
--   where step_position is the position of the line's first step, or null.
-- Any invalid row raises, and nothing is saved.
create function public.save_recipe(recipe jsonb, steps jsonb, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_recipe_id uuid;
begin
  if jsonb_typeof(steps) is distinct from 'array' or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'steps and lines must be arrays' using errcode = '22023';
  end if;

  insert into public.recipe (title, original_servings, total_minutes, image_url, source_kind, source_url)
  select item.title, item.original_servings, item.total_minutes, item.image_url, item.source_kind, item.source_url
  from jsonb_to_record(recipe) as item (
    title text,
    original_servings integer,
    total_minutes integer,
    image_url text,
    source_kind text,
    source_url text
  )
  returning id into new_recipe_id;

  insert into public.recipe_step (recipe_id, position, text)
  select new_recipe_id, step.position, step.text
  from jsonb_to_recordset(steps) as step (position integer, text text);

  insert into public.recipe_ingredient (
    recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague
  )
  select new_recipe_id, line.ingredient_id, step.id, line.position, line.original_text, line.amount, line.unit, line.is_vague
  from jsonb_to_recordset(lines) as line (
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer
  )
  left join public.recipe_step as step
    on step.recipe_id = new_recipe_id and step.position = line.step_position;

  -- A step position that names no step is an error, not a line without a step.
  if exists (
    select 1
    from jsonb_to_recordset(lines) as line (step_position integer)
    where line.step_position is not null
      and not exists (
        select 1 from public.recipe_step as step
        where step.recipe_id = new_recipe_id and step.position = line.step_position
      )
  ) then
    raise exception 'step_position names no step' using errcode = '22023';
  end if;

  return new_recipe_id;
end;
$$;

-- Only signed-in users: auth.uid() is null for the service role.
revoke all on function public.save_recipe(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_recipe(jsonb, jsonb, jsonb) to authenticated;
