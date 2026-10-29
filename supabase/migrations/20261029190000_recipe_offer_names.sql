-- Story 16.4: a recipe saved from an offer suggestion remembers the offers it
-- was built around ("Sparad från veckans erbjudanden: falukorv, ketchup").
-- Additive: one column with an empty default, so every saved recipe is as before.
alter table public.recipe
  add column offer_names text[] not null default '{}',
  add constraint recipe_offer_names_check check (cardinality(offer_names) <= 10);

-- As the hardening version of save_recipe, plus recipe.offer_names (a jsonb
-- array of text, missing or null for none).
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

revoke all on function public.save_recipe(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_recipe(jsonb, jsonb, jsonb) to authenticated;
