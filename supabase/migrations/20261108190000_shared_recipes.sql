-- Delade recept: a household shares a recipe with every other household in the
-- app (it is invite-only), and another household uses it as it is or saves a
-- copy of its own. Additive only: three columns on recipe, one on household,
-- a trigger, and seven functions.
--
-- What is shared is only the recipe: its title, image address, servings, time,
-- source, steps and ingredient lines (text, amount, unit, group, and the NAME
-- and section of the line's catalog ingredient, never its id). Never notes,
-- favourites, meal plans, pantry, catalog ids or anything about the people.
--
-- RLS is not loosened: no household can read another household's rows, as
-- before. Everything across households goes through the security definer
-- functions below, each of which
--   - needs a signed-in member (my_household_id() not null, else 42501),
--   - reads only recipes that are marked shared (is_shared) and are not the
--     caller's own, and
--   - returns only the fields above.
-- They are:
--   list_shared_recipes()                   the Delade list
--   get_shared_recipe(shared_recipe_id)     one shared recipe, to use or save
--   save_shared_recipe(shared_recipe_id, ingredient_ids)
--                                           the copy in the caller's household
--   shared_recipe_savers(own_recipe_id)     "Sparat av …" for the owner
--   recipe_sharing()                        Tillval: dela alla and the count
--   set_recipe_share_all(share)             Tillval: "Dela alla mina recept"
--   stop_sharing_recipes()                  Tillval: "Sluta dela alla"
--
-- Sharing one recipe is an update of the caller's own row (is_shared) under
-- the existing RLS. "Dela alla mina recept" is kept as household.share_all and
-- is applied to the rows: turning it on marks every own recipe shared, and a
-- new recipe of such a household is shared when it is saved (the trigger), so
-- whether others see a recipe is is_shared alone, and Sluta dela on one recipe
-- works with dela alla on too. A saved copy is never shared by dela alla (it
-- is someone else's recipe); it can be shared by hand like any own recipe.
--
-- A copy is the saver's own recipe: steps and lines copied from the original
-- in one transaction, each line pointing at an ingredient of the saver's own
-- catalog (the caller matches the names and passes the ids; the composite
-- foreign key (ingredient_id, household_id) refuses another household's). It
-- remembers where it came from (shared_from_recipe_id, no foreign key, so it
-- outlives the original) and the sharing household's name at the time
-- (shared_from_name, for "Delat av …"). One copy per household and original
-- (unique index): saving again gives the copy already saved. Only
-- save_shared_recipe writes those two columns (recipe_share_guard).
--
-- Recipe images are addresses only (AD-15: the image is never stored), so the
-- original's address is shown to others and copied with the copy as it is.

set local lock_timeout = '5s';

-- 1. Columns -----------------------------------------------------------------

alter table public.household
  add column share_all boolean not null default false;

alter table public.recipe
  add column is_shared boolean not null default false,
  add column shared_from_recipe_id uuid,
  add column shared_from_name text,
  add constraint recipe_shared_from_check check ((shared_from_recipe_id is null) = (shared_from_name is null)),
  add constraint recipe_shared_from_name_check
    check (shared_from_name is null or (shared_from_name = btrim(shared_from_name) and char_length(shared_from_name) between 1 and 60));

-- One copy per household of each original.
create unique index recipe_shared_copy_once on public.recipe (household_id, shared_from_recipe_id)
  where shared_from_recipe_id is not null;
-- "Sparat av …": the copies of an original, across households.
create index recipe_shared_from_idx on public.recipe (shared_from_recipe_id) where shared_from_recipe_id is not null;
-- The Delade list.
create index recipe_is_shared_idx on public.recipe (created_at desc) where is_shared;

-- 2. The guard ---------------------------------------------------------------

-- A signed-in user never writes where a copy came from (only save_shared_recipe,
-- as its owner, does). A new recipe of a household with dela alla on is shared,
-- unless it is a copy. Sharing alone is not a change of the recipe, so it keeps
-- updated_at, which Ändra recept uses as its lock (recipe_set_updated_at runs
-- before this trigger, by name).
create function public.recipe_share_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.shared_from_recipe_id is not null or new.shared_from_name is not null then
        raise exception 'only save_shared_recipe makes a copy' using errcode = '42501';
      end if;
    elsif new.shared_from_recipe_id is distinct from old.shared_from_recipe_id
      or new.shared_from_name is distinct from old.shared_from_name then
      raise exception 'a copy keeps where it came from' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.shared_from_recipe_id is null and not new.is_shared then
      new.is_shared := coalesce((select h.share_all from public.household as h where h.id = new.household_id), false);
    end if;
  elsif new.is_shared is distinct from old.is_shared
    and (to_jsonb(new) - 'is_shared' - 'updated_at') = (to_jsonb(old) - 'is_shared' - 'updated_at') then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.recipe_share_guard() from public, anon, authenticated, service_role;

create trigger recipe_share_guard
  before insert or update on public.recipe
  for each row execute function public.recipe_share_guard();

-- 3. Reading what others share ----------------------------------------------

-- The Delade list: every recipe another household shares, newest first, at
-- most 500. `saved_copy_id` is the caller's own copy of it, if any (for
-- "✓ Sparat"); `line_texts` are its lines as written (for the categories and
-- the search).
create function public.list_shared_recipes()
returns table (
  id uuid,
  title text,
  original_servings integer,
  total_minutes integer,
  image_url text,
  household_name text,
  created_at timestamptz,
  saved_copy_id uuid,
  line_texts text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select r.id, r.title, r.original_servings, r.total_minutes, r.image_url, h.name, r.created_at,
      (select c.id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = r.id),
      coalesce(
        (select array_agg(l.original_text order by l.position) from public.recipe_ingredient as l where l.recipe_id = r.id),
        '{}'::text[]
      )
    from public.recipe as r
    join public.household as h on h.id = r.household_id
    where r.is_shared and r.household_id <> hid
    order by r.created_at desc, r.id
    limit 500;
end;
$$;

-- One shared recipe, or null when it is not shared (any more), is the caller's
-- own, or does not exist: the three are told apart by nobody. Steps and lines
-- in order; a line's `step_index` is the index of its step among the steps,
-- and `ingredient_name` / `ingredient_section` are its catalog ingredient's
-- name and section (null without one).
create function public.get_shared_recipe(shared_recipe_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
  found_recipe jsonb;
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'servings', r.original_servings,
    'total_minutes', r.total_minutes,
    'image_url', r.image_url,
    'source_kind', r.source_kind,
    'source_url', r.source_url,
    'household_name', h.name,
    'saved_copy_id', (select c.id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = r.id),
    'steps', coalesce(
      (select jsonb_agg(jsonb_build_object('title', s.title, 'text', s.text) order by s.position)
       from public.recipe_step as s where s.recipe_id = r.id),
      '[]'::jsonb
    ),
    'lines', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'original_text', l.original_text,
          'amount', l.amount,
          'unit', l.unit,
          'is_vague', l.is_vague,
          'section', l.section,
          'step_index', case when s.id is null then null else
            (select count(*) from public.recipe_step as earlier where earlier.recipe_id = r.id and earlier.position < s.position) end,
          'ingredient_name', i.name,
          'ingredient_section', i.section
        ) order by l.position)
       from public.recipe_ingredient as l
       left join public.ingredient as i on i.id = l.ingredient_id and i.household_id = l.household_id
       left join public.recipe_step as s on s.id = l.step_id and s.recipe_id = l.recipe_id
       where l.recipe_id = r.id),
      '[]'::jsonb
    )
  )
  into found_recipe
  from public.recipe as r
  join public.household as h on h.id = r.household_id
  where r.id = shared_recipe_id and r.is_shared and r.household_id <> hid;
  return found_recipe;
end;
$$;

-- 4. Saving a copy -------------------------------------------------------------

-- "Spara i mina recept" (and the quiet copy before "Lägg på matsedeln" and
-- "Köp det som saknas"): copies the shared recipe into the caller's household
-- and returns the copy's id; when the household has a copy already, that one.
-- `ingredient_ids[i]` is the caller's own catalog ingredient for the original's
-- line i (in position order), or null; their number must be the number of
-- lines (22023), and an id of another household's catalog fails the foreign
-- key (23503). A recipe that is not shared, the caller's own or gone: P0002.
create function public.save_shared_recipe(shared_recipe_id uuid, ingredient_ids uuid[])
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
  select r.id, r.title, r.original_servings, r.total_minutes, r.image_url, r.source_kind, r.source_url, h.name as household_name
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

  select count(*) into line_count from public.recipe_ingredient as l where l.recipe_id = origin.id;
  if coalesce(cardinality(ingredient_ids), 0) <> line_count then
    raise exception 'one ingredient id per line' using errcode = '22023';
  end if;

  insert into public.recipe as c (
    household_id, user_id, title, original_servings, total_minutes, image_url, source_kind, source_url,
    is_shared, shared_from_recipe_id, shared_from_name
  )
  values (
    hid, me, origin.title, origin.original_servings, origin.total_minutes, origin.image_url, origin.source_kind, origin.source_url,
    false, origin.id, origin.household_name
  )
  on conflict (household_id, shared_from_recipe_id) where shared_from_recipe_id is not null do nothing
  returning c.id into copy_id;
  if copy_id is null then
    -- Saved at the same moment from another device of the household.
    select c.id into copy_id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = origin.id;
    return copy_id;
  end if;

  insert into public.recipe_step (household_id, user_id, recipe_id, position, text, title)
  select hid, me, copy_id, (row_number() over (order by s.position) - 1)::integer, s.text, s.title
  from public.recipe_step as s
  where s.recipe_id = origin.id;

  insert into public.recipe_ingredient (
    household_id, user_id, recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague, section
  )
  select hid, me, copy_id, ingredient_ids[l.ordinal::integer], copied_step.id, (l.ordinal - 1)::integer,
    l.original_text, l.amount, l.unit, l.is_vague, l.section
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

-- 5. The owner's side -----------------------------------------------------------

-- "Sparat av Lindqvists och Bergs": the names of the other households that have
-- a copy of the caller's own recipe, first saved first. Empty for a recipe
-- that is not the caller's household's.
create function public.shared_recipe_savers(own_recipe_id uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select h.name
    from public.recipe as c
    join public.household as h on h.id = c.household_id
    where c.shared_from_recipe_id = own_recipe_id
      and c.household_id <> hid
      and exists (select 1 from public.recipe as o where o.id = own_recipe_id and o.household_id = hid)
    order by c.created_at, h.name;
end;
$$;

-- Tillval: whether the caller's household shares all its recipes, and how many
-- of its recipes are shared now.
create function public.recipe_sharing()
returns table (share_all boolean, shared_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select h.share_all,
      (select count(*)::integer from public.recipe as r where r.household_id = hid and r.is_shared)
    from public.household as h
    where h.id = hid;
end;
$$;

-- "Dela alla mina recept": on shares every own recipe that is not a copy now,
-- and new ones as they are saved; off only stops sharing new ones (Sluta dela
-- alla stops the rest). Returns how many of the household's recipes are shared.
create function public.set_recipe_share_all(share boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if share is null then
    raise exception 'share is on or off' using errcode = '22023';
  end if;
  update public.household as h set share_all = share where h.id = hid;
  if share then
    update public.recipe as r set is_shared = true
    where r.household_id = hid and not r.is_shared and r.shared_from_recipe_id is null;
  end if;
  return (select count(*)::integer from public.recipe as r where r.household_id = hid and r.is_shared);
end;
$$;

-- "Sluta dela alla": no recipe of the household is shared any more, and dela
-- alla is off. Copies others have saved stay theirs. Returns how many stopped.
create function public.stop_sharing_recipes()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
  stopped integer;
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  update public.household as h set share_all = false where h.id = hid;
  update public.recipe as r set is_shared = false where r.household_id = hid and r.is_shared;
  get diagnostics stopped = row_count;
  return stopped;
end;
$$;

revoke all on function public.list_shared_recipes() from public, anon, authenticated, service_role;
revoke all on function public.get_shared_recipe(uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_shared_recipe(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.shared_recipe_savers(uuid) from public, anon, authenticated, service_role;
revoke all on function public.recipe_sharing() from public, anon, authenticated, service_role;
revoke all on function public.set_recipe_share_all(boolean) from public, anon, authenticated, service_role;
revoke all on function public.stop_sharing_recipes() from public, anon, authenticated, service_role;
grant execute on function public.list_shared_recipes() to authenticated;
grant execute on function public.get_shared_recipe(uuid) to authenticated;
grant execute on function public.save_shared_recipe(uuid, uuid[]) to authenticated;
grant execute on function public.shared_recipe_savers(uuid) to authenticated;
grant execute on function public.recipe_sharing() to authenticated;
grant execute on function public.set_recipe_share_all(boolean) to authenticated;
grant execute on function public.stop_sharing_recipes() to authenticated;
