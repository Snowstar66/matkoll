-- Byt ut ingrediens: a recipe line can be replaced by another ingredient ("Byt ut" in the recipe view): the line keeps
-- its amount and unit and gets the new ingredient and the new name as its text, and remembers what it was so
-- "Ta tillbaka" can put it back. Additive: two nullable columns and one new function.
-- - recipe_ingredient.replaced_from_text / replaced_from_ingredient_id: the text and ingredient the line had before
--   the first replacement (a second replacement keeps the first original). Both null on a line never replaced.
--   update_recipe never writes them, so editing the recipe keeps them on the lines that remain.
-- - replace_recipe_line: replaces (new_ingredient given) or restores (new_ingredient null) one line, checked against
--   the recipe's updated_at as set_recipe_line is (MK409 when it changed; the trigger bumps updated_at). The new
--   ingredient must be one the caller's household can see (RLS, security invoker) and is the household's own.

set local lock_timeout = '5s';

alter table public.recipe_ingredient
  add column replaced_from_text text,
  add column replaced_from_ingredient_id uuid;

create function public.replace_recipe_line(
  target_recipe uuid,
  target_line uuid,
  expected_updated_at timestamptz,
  new_ingredient uuid,
  new_text text
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_household uuid := public.my_household_id();
  saved_updated_at timestamptz;
  changed integer;
begin
  if target_recipe is null or target_line is null or expected_updated_at is null
    or (new_ingredient is not null and (new_text is null or btrim(new_text) = '')) then
    raise exception 'recipe, line, expected_updated_at and, for a replacement, a name are required' using errcode = '22023';
  end if;

  -- Locks the caller's recipe until the transaction ends.
  select saved.updated_at into saved_updated_at
  from public.recipe as saved
  where saved.id = target_recipe and saved.household_id = caller_household
  for update;
  if not found then
    return null;
  end if;
  if saved_updated_at is distinct from expected_updated_at then
    raise exception 'the recipe has changed since it was read' using errcode = 'MK409';
  end if;

  if new_ingredient is not null and not exists (
    select 1 from public.ingredient as found where found.id = new_ingredient and found.household_id = caller_household
  ) then
    return null;
  end if;

  if new_ingredient is not null then
    update public.recipe_ingredient as line
    set replaced_from_text = coalesce(line.replaced_from_text, line.original_text),
      replaced_from_ingredient_id = case when line.replaced_from_text is null then line.ingredient_id else line.replaced_from_ingredient_id end,
      ingredient_id = new_ingredient,
      original_text = btrim(new_text),
      is_struck = false
    where line.id = target_line and line.recipe_id = target_recipe and line.household_id = caller_household;
  else
    update public.recipe_ingredient as line
    set original_text = coalesce(line.replaced_from_text, line.original_text),
      ingredient_id = case when line.replaced_from_text is not null then line.replaced_from_ingredient_id else line.ingredient_id end,
      replaced_from_text = null,
      replaced_from_ingredient_id = null
    where line.id = target_line and line.recipe_id = target_recipe and line.household_id = caller_household;
  end if;
  get diagnostics changed = row_count;
  if changed = 0 then
    return null;
  end if;

  update public.recipe as saved set title = saved.title where saved.id = target_recipe returning saved.updated_at into saved_updated_at;
  return saved_updated_at;
end;
$$;

revoke all on function public.replace_recipe_line(uuid, uuid, timestamptz, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_recipe_line(uuid, uuid, timestamptz, uuid, text) to authenticated;
