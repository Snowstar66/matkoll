-- Recipes, follow-up to 20261025204850_recipes.sql (AD-4, AD-10, AD-18).
-- 1. recipe.updated_at follows every update.
-- 2. source_url is set exactly when source_kind is 'url', as in RecipeDraft.
-- 3. An index for the library's newest-first list (Story 1.10).
-- 4. Size limits, the same as recipeDraftSchema's (src/features/recipes/domain/recipe-draft.ts,
--    tests/design/recipe-checks.test.ts).
-- 5. save_recipe takes the recipe's id from the client, so saving the same
--    preview twice (a lost answer, then "Försök igen") writes it once.

create function public.recipe_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger recipe_set_updated_at
  before update on public.recipe
  for each row execute function public.recipe_set_updated_at();
-- Only the trigger runs it.
revoke all on function public.recipe_set_updated_at() from public, anon, authenticated, service_role;

alter table public.recipe drop constraint recipe_source_url_check;
alter table public.recipe
  add constraint recipe_source_url_check check (
    (source_kind = 'url') = (source_url is not null) and (source_url is null or source_url ~* '^https?://')
  );

create index recipe_user_id_created_at_idx on public.recipe (user_id, created_at desc);

alter table public.recipe
  add constraint recipe_title_length_check check (char_length(title) <= 200),
  add constraint recipe_source_url_length_check check (char_length(source_url) <= 2048),
  add constraint recipe_image_url_length_check check (char_length(image_url) <= 2048);
alter table public.recipe_step
  add constraint recipe_step_text_length_check check (char_length(text) <= 2000);
alter table public.recipe_ingredient
  add constraint recipe_ingredient_original_text_length_check check (char_length(original_text) <= 300);

-- As before, plus:
-- - recipe.id is required and chosen by the client. When the caller already
--   has a recipe with that id, nothing is written and its id is returned; an
--   id another user has taken is 23505.
-- - recipe must be an object, steps have the positions 0, 1, 2, … once each,
--   and there are at most 100 steps and 200 lines (22023 otherwise).
create or replace function public.save_recipe(recipe jsonb, steps jsonb, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_id uuid;
  new_recipe_id uuid;
begin
  if jsonb_typeof(recipe) is distinct from 'object'
    or jsonb_typeof(steps) is distinct from 'array'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'recipe must be an object, steps and lines arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(steps) > 100 or jsonb_array_length(lines) > 200 then
    raise exception 'too many steps or lines' using errcode = '22023';
  end if;
  if (
    select count(distinct step.position)
    from jsonb_to_recordset(steps) as step (position integer)
    where step.position >= 0 and step.position < jsonb_array_length(steps)
  ) <> jsonb_array_length(steps) then
    raise exception 'step positions must be 0, 1, 2, …' using errcode = '22023';
  end if;

  requested_id := (recipe ->> 'id')::uuid;
  if requested_id is null then
    raise exception 'recipe.id is required' using errcode = '22023';
  end if;

  insert into public.recipe (id, title, original_servings, total_minutes, image_url, source_kind, source_url)
  select requested_id, item.title, item.original_servings, item.total_minutes, item.image_url, item.source_kind, item.source_url
  from jsonb_to_record(recipe) as item (
    title text,
    original_servings integer,
    total_minutes integer,
    image_url text,
    source_kind text,
    source_url text
  )
  on conflict (id) do nothing
  returning id into new_recipe_id;

  if new_recipe_id is null then
    -- Saved before: RLS shows the row only when it is the caller's.
    if exists (select 1 from public.recipe as saved where saved.id = requested_id) then
      return requested_id;
    end if;
    raise exception 'recipe id is taken' using errcode = '23505';
  end if;

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

-- create or replace keeps the grants; restated so this file reads on its own.
revoke all on function public.save_recipe(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_recipe(jsonb, jsonb, jsonb) to authenticated;
