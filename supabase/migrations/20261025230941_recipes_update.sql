-- Recipes: changing a saved recipe (Story 1.11, AD-4, AD-10, AD-20).
-- update_recipe is the only way a saved recipe's content changes; updateRecipe
-- calls it after catalog.commitIngredients. Removing a recipe needs no
-- function: a plain delete takes its steps and lines with it (on delete cascade).

-- Changes the recipe `id` with its steps and lines in one transaction, as the
-- caller (RLS applies), and returns the id; null when the caller has no recipe
-- with that id (another user's recipe, or one that is gone), and then nothing
-- changes.
-- - recipe: { title, original_servings, total_minutes }. The source and the
--   image address never change here.
-- - steps: [{ id, position, text }], positions 0, 1, 2, … once each. A step
--   with an id of the recipe's is updated and keeps its id; one without id is
--   added; the recipe's steps missing from the list are deleted.
-- - lines: [{ id, position, original_text, amount, unit, is_vague,
--   ingredient_id, step_position }], positions 0, 1, 2, … once each, with
--   step_position the position (in the new steps) of the line's first step, or
--   null. Ids work as for steps.
-- The limits are save_recipe's: at most 100 steps and 200 lines. An id that
-- is not one of this recipe's steps or lines, an id given twice, or a step
-- position that names no step is 22023. Any invalid row raises, and nothing
-- changes.
create function public.update_recipe(id uuid, recipe jsonb, steps jsonb, lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  target uuid := update_recipe.id;
  updated uuid;
begin
  if target is null
    or jsonb_typeof(recipe) is distinct from 'object'
    or jsonb_typeof(steps) is distinct from 'array'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'id is required, recipe must be an object, steps and lines arrays' using errcode = '22023';
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
  if (
    select count(distinct line.position)
    from jsonb_to_recordset(lines) as line (position integer)
    where line.position >= 0 and line.position < jsonb_array_length(lines)
  ) <> jsonb_array_length(lines) then
    raise exception 'line positions must be 0, 1, 2, …' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(steps) as step (id uuid)
    where step.id is not null group by step.id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(lines) as line (id uuid)
    where line.id is not null group by line.id having count(*) > 1
  ) then
    raise exception 'a step or line id is given twice' using errcode = '22023';
  end if;

  -- Locks the recipe; RLS shows it only when it is the caller's.
  update public.recipe as saved
  set title = item.title, original_servings = item.original_servings, total_minutes = item.total_minutes
  from jsonb_to_record(recipe) as item (title text, original_servings integer, total_minutes integer)
  where saved.id = target
  returning saved.id into updated;
  if updated is null then
    return null;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(steps) as step (id uuid)
    where step.id is not null
      and not exists (
        select 1 from public.recipe_step as saved where saved.id = step.id and saved.recipe_id = target
      )
  ) or exists (
    select 1 from jsonb_to_recordset(lines) as line (id uuid)
    where line.id is not null
      and not exists (
        select 1 from public.recipe_ingredient as saved where saved.id = line.id and saved.recipe_id = target
      )
  ) then
    raise exception 'a step or line id is not one of the recipe''s' using errcode = '22023';
  end if;

  -- Steps and lines no longer in the lists go. A removed step leaves its lines without a step
  -- (on delete set null); the lines get their steps again below.
  delete from public.recipe_step as saved
  where saved.recipe_id = target
    and saved.id not in (
      select step.id from jsonb_to_recordset(steps) as step (id uuid) where step.id is not null
    );
  delete from public.recipe_ingredient as saved
  where saved.recipe_id = target
    and saved.id not in (
      select line.id from jsonb_to_recordset(lines) as line (id uuid) where line.id is not null
    );

  -- Positions are unique per recipe and checked row by row, so the kept rows
  -- first move out of the way (above every position a list may hold).
  update public.recipe_step as saved set position = saved.position + 1000 where saved.recipe_id = target;
  update public.recipe_ingredient as saved set position = saved.position + 1000 where saved.recipe_id = target;

  update public.recipe_step as saved
  set position = step.position, text = step.text
  from jsonb_to_recordset(steps) as step (id uuid, position integer, text text)
  where step.id is not null and saved.id = step.id and saved.recipe_id = target;

  insert into public.recipe_step (recipe_id, position, text)
  select target, step.position, step.text
  from jsonb_to_recordset(steps) as step (id uuid, position integer, text text)
  where step.id is null;

  update public.recipe_ingredient as saved
  set position = line.position,
    original_text = line.original_text,
    amount = line.amount,
    unit = line.unit,
    is_vague = line.is_vague,
    ingredient_id = line.ingredient_id,
    step_id = step.id
  from jsonb_to_recordset(lines) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer
  )
  left join public.recipe_step as step
    on step.recipe_id = target and step.position = line.step_position
  where line.id is not null and saved.id = line.id and saved.recipe_id = target;

  insert into public.recipe_ingredient (
    recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague
  )
  select target, line.ingredient_id, step.id, line.position, line.original_text, line.amount, line.unit, line.is_vague
  from jsonb_to_recordset(lines) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer
  )
  left join public.recipe_step as step
    on step.recipe_id = target and step.position = line.step_position
  where line.id is null;

  -- A step position that names no step is an error, not a line without a step.
  if exists (
    select 1
    from jsonb_to_recordset(lines) as line (step_position integer)
    where line.step_position is not null
      and not exists (
        select 1 from public.recipe_step as step
        where step.recipe_id = target and step.position = line.step_position
      )
  ) then
    raise exception 'step_position names no step' using errcode = '22023';
  end if;

  return target;
end;
$$;

-- Only signed-in users: auth.uid() is null for the service role.
revoke all on function public.update_recipe(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_recipe(uuid, jsonb, jsonb, jsonb) to authenticated;
