-- Stryk ingrediens: a recipe line can be struck ("Stryk" in the recipe view), and then it is left out of the
-- pantry status, the shopping list, "Saknas", the nutrition and the preference notes, while it stays in the recipe.
-- Additive and backward compatible: one defaulted column, one new function, and save_shared_recipe with the same
-- signature, grants and owner (create or replace) that now also copies the strike.
-- - recipe_ingredient.is_struck: the household struck the line. update_recipe never writes it, so editing a recipe
--   keeps the strikes of the lines that remain.
-- - set_recipe_line: strikes or restores one line and/or changes its amount (for the recipe's own servings), checked
--   against the recipe's updated_at as update_recipe is (MK409 when it changed; the trigger bumps updated_at).
-- - save_shared_recipe: as 20261108200000_shared_recipes_hardening.sql, plus the copied lines keep is_struck.
--   (The shared view of a recipe does not show strikes; a copy has them as the original's household set them.)

set local lock_timeout = '5s';

alter table public.recipe_ingredient
  add column is_struck boolean not null default false;

create function public.set_recipe_line(
  target_recipe uuid,
  target_line uuid,
  expected_updated_at timestamptz,
  new_is_struck boolean,
  new_amount numeric
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
    or (new_is_struck is null and new_amount is null) or (new_amount is not null and new_amount <= 0) then
    raise exception 'recipe, line and expected_updated_at are required, and something to change' using errcode = '22023';
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

  update public.recipe_ingredient as line
  set is_struck = coalesce(new_is_struck, line.is_struck),
    -- A line without an amount (a vague line) has none to change.
    amount = case when new_amount is not null and not line.is_vague then new_amount else line.amount end
  where line.id = target_line and line.recipe_id = target_recipe and line.household_id = caller_household;
  get diagnostics changed = row_count;
  if changed = 0 then
    return null;
  end if;

  update public.recipe as saved set title = saved.title where saved.id = target_recipe returning saved.updated_at into saved_updated_at;
  return saved_updated_at;
end;
$$;

revoke all on function public.set_recipe_line(uuid, uuid, timestamptz, boolean, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.set_recipe_line(uuid, uuid, timestamptz, boolean, numeric) to authenticated;

create or replace function public.save_shared_recipe(shared_recipe_id uuid, ingredient_ids uuid[], expected_version text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  hid uuid := public.my_household_id();
  origin record;
  copy_id uuid;
  line_count integer;
begin
  if me is null or hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select r.id, r.title, r.original_servings, r.total_minutes, r.image_url, r.source_kind, r.source_url,
    public.household_shared_name(h.name, h.name_is_default) as household_name
  into origin
  from public.recipe as r
  join public.household as h on h.id = r.household_id
  where r.id = shared_recipe_id and r.is_shared and r.household_id <> hid
  for share of r;
  if not found then
    raise exception 'no shared recipe with that id' using errcode = 'P0002';
  end if;

  select c.id into copy_id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = origin.id;
  if copy_id is not null then
    return copy_id;
  end if;

  if expected_version is distinct from public.shared_recipe_version(origin.id) then
    raise exception 'the recipe changed' using errcode = '40001';
  end if;
  select count(*) into line_count from public.recipe_ingredient as l where l.recipe_id = origin.id;
  if coalesce(cardinality(ingredient_ids), 0) <> line_count then
    raise exception 'one ingredient id per line' using errcode = '22023';
  end if;

  insert into public.recipe as c (
    household_id, user_id, title, original_servings, total_minutes, image_url, source_kind, source_url,
    is_shared, shared_from_recipe_id, shared_from_name
  )
  values (
    hid, me, origin.title, origin.original_servings, origin.total_minutes, public.shared_image_url(origin.image_url),
    origin.source_kind, origin.source_url, false, origin.id, origin.household_name
  )
  on conflict (household_id, shared_from_recipe_id) where shared_from_recipe_id is not null do nothing
  returning c.id into copy_id;
  if copy_id is null then
    select c.id into copy_id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = origin.id;
    return copy_id;
  end if;

  insert into public.recipe_step (household_id, user_id, recipe_id, position, text, title)
  select hid, me, copy_id, (row_number() over (order by s.position) - 1)::integer, s.text, s.title
  from public.recipe_step as s
  where s.recipe_id = origin.id;

  insert into public.recipe_ingredient (
    household_id, user_id, recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague, section, is_staple_marked, is_struck
  )
  select hid, me, copy_id, ingredient_ids[l.ordinal::integer], copied_step.id, (l.ordinal - 1)::integer,
    l.original_text, l.amount, l.unit, l.is_vague, l.section, l.is_staple_marked, l.is_struck
  from (
    select li.*, row_number() over (order by li.position) as ordinal
    from public.recipe_ingredient as li
    where li.recipe_id = origin.id
  ) as l
  left join (
    select s.id, (row_number() over (order by s.position) - 1)::integer as step_position
    from public.recipe_step as s
    where s.recipe_id = origin.id
  ) as original_step on original_step.id = l.step_id
  left join public.recipe_step as copied_step
    on copied_step.recipe_id = copy_id and copied_step.position = original_step.step_position;

  return copy_id;
end;
$$;
