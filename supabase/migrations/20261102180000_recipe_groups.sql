-- Recipe format: ingredient groups and step headings (Linas Matkasse cards and
-- the like). Additive and backward compatible: three nullable or defaulted
-- columns, and save_recipe and update_recipe with the same signatures, which
-- read the new keys when they are there.
-- - recipe_ingredient.section: the group the line is listed under ("Rostad
--   småpotatis"), or null. Groups come in the order of their first line
--   (position), so no position of their own is needed.
-- - recipe_ingredient.is_staple_marked: the source marks the line as a staple
--   (• on a Linas card). Only stored for now.
-- - recipe_step.title: the step's heading ("Rostad småpotatis"), or null.
-- Limits as in recipeDraftSchema (draftLimits.groupChars, stepTitleChars;
-- tests/design/recipe-checks.test.ts). Rows keep their household's RLS; no new
-- function is added.

alter table public.recipe_ingredient
  add column section text,
  add column is_staple_marked boolean not null default false,
  add constraint recipe_ingredient_section_check check (btrim(section) <> ''),
  add constraint recipe_ingredient_section_length_check check (char_length(section) <= 60);

alter table public.recipe_step
  add column title text,
  add constraint recipe_step_title_check check (btrim(title) <> ''),
  add constraint recipe_step_title_length_check check (char_length(title) <= 60);

-- As 20261029190000_recipe_offer_names.sql, plus:
-- - steps: [{ position, text, title? }]
-- - lines: [{ …, section?, is_staple_marked? }]
-- A missing or blank title or section is null; a missing is_staple_marked is false.
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
  if jsonb_typeof(recipe -> 'offer_names') not in ('array', 'null') and recipe ? 'offer_names' then
    raise exception 'offer_names must be an array' using errcode = '22023';
  end if;

  requested_id := (recipe ->> 'id')::uuid;
  if requested_id is null then
    raise exception 'recipe.id is required' using errcode = '22023';
  end if;

  insert into public.recipe (id, title, original_servings, total_minutes, image_url, source_kind, source_url, offer_names)
  select requested_id, item.title, item.original_servings, item.total_minutes, item.image_url, item.source_kind, item.source_url,
    case
      when jsonb_typeof(recipe -> 'offer_names') = 'array'
        then array(select jsonb_array_elements_text(recipe -> 'offer_names'))
      else '{}'::text[]
    end
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
    -- Saved before: RLS shows the row only when it is the caller's household's.
    if exists (select 1 from public.recipe as saved where saved.id = requested_id) then
      return requested_id;
    end if;
    raise exception 'recipe id is taken' using errcode = '23505';
  end if;

  insert into public.recipe_step (recipe_id, position, text, title)
  select new_recipe_id, step.position, step.text, nullif(btrim(step.title), '')
  from jsonb_to_recordset(steps) as step (position integer, text text, title text);

  insert into public.recipe_ingredient (
    recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague, section, is_staple_marked
  )
  select new_recipe_id, line.ingredient_id, step.id, line.position, line.original_text, line.amount, line.unit, line.is_vague,
    nullif(btrim(line.section), ''), coalesce(line.is_staple_marked, false)
  from jsonb_to_recordset(lines) as line (
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer,
    section text,
    is_staple_marked boolean
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

revoke all on function public.save_recipe(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_recipe(jsonb, jsonb, jsonb) to authenticated;

-- As 20261102130000_household.sql, plus:
-- - steps: [{ id, position, text, title? }]
-- - lines: [{ id, …, section?, is_staple_marked? }]
-- A kept step or line whose key is missing keeps what it has, so a client that
-- does not know the keys yet never clears them; a new one gets null or false.
-- A blank title or section is null.
create or replace function public.update_recipe(id uuid, expected_updated_at timestamptz, recipe jsonb, steps jsonb, lines jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  target uuid := update_recipe.id;
  caller_household uuid := public.my_household_id();
  saved_updated_at timestamptz;
begin
  if target is null
    or expected_updated_at is null
    or jsonb_typeof(recipe) is distinct from 'object'
    or jsonb_typeof(steps) is distinct from 'array'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'id and expected_updated_at are required, recipe must be an object, steps and lines arrays'
      using errcode = '22023';
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

  -- Locks the caller's recipe until the transaction ends.
  select saved.updated_at into saved_updated_at
  from public.recipe as saved
  where saved.id = target and saved.household_id = caller_household
  for update;
  if not found then
    return null;
  end if;
  if saved_updated_at is distinct from expected_updated_at then
    raise exception 'the recipe has changed since the form was filled' using errcode = 'MK409';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(steps) as step (id uuid)
    where step.id is not null
      and not exists (
        select 1 from public.recipe_step as saved
        where saved.id = step.id and saved.recipe_id = target and saved.household_id = caller_household
      )
  ) or exists (
    select 1 from jsonb_to_recordset(lines) as line (id uuid)
    where line.id is not null
      and not exists (
        select 1 from public.recipe_ingredient as saved
        where saved.id = line.id and saved.recipe_id = target and saved.household_id = caller_household
      )
  ) then
    raise exception 'a step or line id is not one of the recipe''s' using errcode = '22023';
  end if;

  update public.recipe as saved
  set title = item.title, original_servings = item.original_servings, total_minutes = item.total_minutes
  from jsonb_to_record(recipe) as item (title text, original_servings integer, total_minutes integer)
  where saved.id = target and saved.household_id = caller_household;

  -- Steps and lines no longer in the lists go. A removed step leaves its lines without a step
  -- (on delete set null); the lines get their steps again below.
  delete from public.recipe_step as saved
  where saved.recipe_id = target
    and saved.household_id = caller_household
    and saved.id not in (
      select step.id from jsonb_to_recordset(steps) as step (id uuid) where step.id is not null
    );
  delete from public.recipe_ingredient as saved
  where saved.recipe_id = target
    and saved.household_id = caller_household
    and saved.id not in (
      select line.id from jsonb_to_recordset(lines) as line (id uuid) where line.id is not null
    );

  -- Positions are unique per recipe and checked row by row, so the kept rows
  -- first move out of the way (above every position a list may hold).
  update public.recipe_step as saved set position = saved.position + 1000
  where saved.recipe_id = target and saved.household_id = caller_household;
  update public.recipe_ingredient as saved set position = saved.position + 1000
  where saved.recipe_id = target and saved.household_id = caller_household;

  update public.recipe_step as saved
  set position = step.position,
    text = step.text,
    title = case when item ? 'title' then nullif(btrim(step.title), '') else saved.title end
  from jsonb_array_elements(steps) as item
  cross join lateral jsonb_to_record(item) as step (id uuid, position integer, text text, title text)
  where step.id is not null and saved.id = step.id and saved.recipe_id = target and saved.household_id = caller_household;

  insert into public.recipe_step (recipe_id, position, text, title)
  select target, step.position, step.text, nullif(btrim(step.title), '')
  from jsonb_to_recordset(steps) as step (id uuid, position integer, text text, title text)
  where step.id is null;

  update public.recipe_ingredient as saved
  set position = line.position,
    original_text = line.original_text,
    amount = line.amount,
    unit = line.unit,
    is_vague = line.is_vague,
    ingredient_id = line.ingredient_id,
    step_id = step.id,
    section = case when item ? 'section' then nullif(btrim(line.section), '') else saved.section end,
    is_staple_marked = case
      when item ? 'is_staple_marked' then coalesce(line.is_staple_marked, false)
      else saved.is_staple_marked
    end
  from jsonb_array_elements(lines) as item
  cross join lateral jsonb_to_record(item) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer,
    section text,
    is_staple_marked boolean
  )
  left join public.recipe_step as step
    on step.recipe_id = target and step.position = line.step_position
  where line.id is not null and saved.id = line.id and saved.recipe_id = target and saved.household_id = caller_household;

  insert into public.recipe_ingredient (
    recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague, section, is_staple_marked
  )
  select target, line.ingredient_id, step.id, line.position, line.original_text, line.amount, line.unit, line.is_vague,
    nullif(btrim(line.section), ''), coalesce(line.is_staple_marked, false)
  from jsonb_to_recordset(lines) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer,
    section text,
    is_staple_marked boolean
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

revoke all on function public.update_recipe(uuid, timestamptz, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_recipe(uuid, timestamptz, jsonb, jsonb, jsonb) to authenticated;
