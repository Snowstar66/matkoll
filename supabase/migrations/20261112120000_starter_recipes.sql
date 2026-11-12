-- Kom igång med recept (startrecept): a pack of everyday recipes that a household may CHOOSE to
-- copy into its own list (never automatically). The pack is not in the code and has no recipes of
-- its own: it is a list of the app owner's own recipes (is_app_owner()), which the owner adds to,
-- orders, notes and removes from in the app. A household copies the ones it picks; a copy is an
-- ordinary recipe of its own, the texts exactly as the owner's recipe has them (never rewritten).
--
-- This migration only adds (AD-5): one table, two columns, a check, an index, a trigger, a storage
-- policy and functions. Nothing that exists is changed or dropped, so the code before it works as
-- before, and it can run again where noted (docs/drift.md). The pack starts empty.
--
-- 1. starter_pack_item: one row per recipe in the pack (the owner's recipe, its place and a short
--    note). RLS on, no policy and no grant for any client: the owner's functions below are the only
--    way in (as app_owner and app_invite). A recipe deleted by the owner leaves the pack with it.
-- 2. recipe.starter_item_id and recipe.starter_fingerprint: a copy remembers which pack item it came
--    from (no foreign key, so it outlives the item, as shared_from_recipe_id) and what its content
--    was when it was copied (an md5 of title, servings, time, source, steps and lines). A copy whose
--    content still has that fingerprint, is no favourite, is not shared and is on no meal plan is
--    "untouched", and only those are removed by "Ta bort startrecepten". One copy per household and
--    item (unique index): a pack recipe is never copied twice. Only save_starter_recipe writes the
--    two columns (recipe_starter_guard).
-- 3. Reading the pack, for any signed-in member: starter_pack_list(), get_starter_recipe(item).
--    Only the recipe is given (title, image, servings, time, source, steps and lines with the NAME of
--    each line's catalog ingredient), never the owner's household, notes, favourites or plans.
-- 4. save_starter_recipe(item, ingredient_ids, expected_version): the copy, as save_shared_recipe
--    makes one (the caller matches the ingredient names to its own catalog and passes the ids; the
--    version of the lines must be the one shown). It respects the household's recipe cap,
--    starter_recipe_household_cap() (400, the recipes the picture cap of recipe-images has room
--    for); the cap only stops starter copies, never a recipe the household saves itself.
-- 5. The pictures: the owner's stored picture of a pack recipe (recipe-images, <household>/<recipe>)
--    may be READ by any signed-in member (policy recipe_images_starter_select), so the server copies
--    it into the household's own folder with the household's own session; nobody else may add,
--    change or remove it (the bucket's other policies are unchanged).
-- 6. Owner functions (is_app_owner(), else 42501): starter_pack_items(), starter_pack_add(recipe),
--    starter_pack_remove(item), starter_pack_set_note(item, note), starter_pack_move(item, step).
-- 7. The household's own copies (security invoker, so RLS limits them to the household):
--    starter_copies() and delete_untouched_starter_copies(recipe_ids). SQL never deletes files: the
--    code removes the copies' pictures with the Storage API after (the orphan sweep takes what it misses).

set local lock_timeout = '5s';

-- 1. The pack ------------------------------------------------------------------------

create table if not exists public.starter_pack_item (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null unique references public.recipe (id) on delete cascade,
  position integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint starter_pack_item_position_check check (position >= 0),
  constraint starter_pack_item_note_check check (note is null or (note = btrim(note) and char_length(note) between 1 and 140))
);

alter table public.starter_pack_item enable row level security;

revoke all on table public.starter_pack_item from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.starter_pack_item to service_role;

-- 2. The copies' marks -----------------------------------------------------------------

alter table public.recipe add column if not exists starter_item_id uuid;
alter table public.recipe add column if not exists starter_fingerprint text;

alter table public.recipe drop constraint if exists recipe_starter_check;
alter table public.recipe
  add constraint recipe_starter_check check ((starter_item_id is null) = (starter_fingerprint is null));

create unique index if not exists recipe_starter_copy_once on public.recipe (household_id, starter_item_id)
  where starter_item_id is not null;

-- A signed-in user never writes where a copy came from or its fingerprint (only save_starter_recipe does).
create or replace function public.recipe_starter_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.starter_item_id is not null or new.starter_fingerprint is not null then
        raise exception 'only save_starter_recipe makes a starter copy' using errcode = '42501';
      end if;
    elsif new.starter_item_id is distinct from old.starter_item_id
      or new.starter_fingerprint is distinct from old.starter_fingerprint then
      raise exception 'a starter copy keeps where it came from' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.recipe_starter_guard() from public, anon, authenticated, service_role;

drop trigger if exists recipe_starter_guard on public.recipe;
create trigger recipe_starter_guard
  before insert or update on public.recipe
  for each row execute function public.recipe_starter_guard();

-- 3. The cap and the fingerprint ---------------------------------------------------------

-- The most recipes a household has for a starter copy to be made: 400, the recipes the picture cap
-- of recipe-images (800 files, a full size and a thumbnail each) has room for.
create or replace function public.starter_recipe_household_cap()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 400;
$$;

revoke all on function public.starter_recipe_household_cap() from public, anon, authenticated, service_role;

-- The most recipes in the pack.
create or replace function public.starter_pack_cap()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 60;
$$;

revoke all on function public.starter_pack_cap() from public, anon, authenticated, service_role;

-- The content of a recipe as one md5: title, servings, time, source, the steps and the lines (as
-- written, in order, each with the place of its step). Not the image, the favourite, sharing or the
-- catalog ids. Null for a recipe the caller cannot see. Security invoker: under RLS only the
-- caller's own household's recipes are seen.
create or replace function public.starter_recipe_fingerprint(recipe uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(
    concat_ws('|', r.title, r.original_servings, coalesce(r.total_minutes::text, '-'), r.source_kind, coalesce(r.source_url, '-'))
    || '#' || coalesce((
      select string_agg(coalesce(s.title, '-') || ':' || s.text, '|' order by s.position)
      from public.recipe_step as s where s.recipe_id = r.id
    ), '')
    || '#' || coalesce((
      select string_agg(
        concat_ws(':', l.original_text, coalesce(l.amount::text, '-'), coalesce(l.unit, '-'), l.is_vague,
          coalesce(l.section, '-'), l.is_staple_marked, coalesce(steps.place::text, '-')),
        '|' order by l.position)
      from public.recipe_ingredient as l
      left join (
        select s.id, (row_number() over (order by s.position) - 1) as place
        from public.recipe_step as s where s.recipe_id = r.id
      ) as steps on steps.id = l.step_id
      where l.recipe_id = r.id
    ), '')
  )
  from public.recipe as r
  where r.id = recipe;
$$;

revoke all on function public.starter_recipe_fingerprint(uuid) from public, anon, authenticated, service_role;
grant execute on function public.starter_recipe_fingerprint(uuid) to authenticated;

-- 4. Reading the pack ----------------------------------------------------------------------

-- The pack in its order, at most starter_pack_cap() recipes. `copy_id` is the caller's own copy of
-- it, if any (the owner's household gets its own recipe there); `has_image` whether the pack
-- recipe has a stored picture (/api/starter-image); `line_texts` its lines as written (the
-- categories and the household's allergies are worked out from them in the app).
create or replace function public.starter_pack_list()
returns table (
  item_id uuid,
  title text,
  original_servings integer,
  total_minutes integer,
  image_url text,
  has_image boolean,
  note text,
  line_texts text[],
  copy_id uuid
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
    select p.id, r.title, r.original_servings, r.total_minutes, public.shared_image_url(r.image_url), r.image_path is not null, p.note,
      coalesce(
        (select array_agg(l.original_text order by l.position) from public.recipe_ingredient as l where l.recipe_id = r.id),
        '{}'::text[]
      ),
      case when r.household_id = hid then r.id
        else (select c.id from public.recipe as c where c.household_id = hid and c.starter_item_id = p.id) end
    from public.starter_pack_item as p
    join public.recipe as r on r.id = p.recipe_id
    order by p.position, p.created_at, p.id
    limit public.starter_pack_cap();
end;
$$;

-- One pack recipe, in the shape get_shared_recipe gives (so the app reads both the same way):
-- `id` is the pack item's id, `household_name` is always "Startrecept" (the owner's household is
-- never named) and `saved_copy_id` the caller's own copy, if any. Plus `note` and `has_image`.
-- Null for an item that is not in the pack.
create or replace function public.get_starter_recipe(item uuid)
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
    'id', p.id,
    'title', r.title,
    'servings', r.original_servings,
    'total_minutes', r.total_minutes,
    'image_url', public.shared_image_url(r.image_url),
    'source_kind', r.source_kind,
    'source_url', r.source_url,
    'household_name', 'Startrecept',
    'saved_copy_id', case when r.household_id = hid then r.id
      else (select c.id from public.recipe as c where c.household_id = hid and c.starter_item_id = p.id) end,
    'version', public.shared_recipe_version(r.id),
    'note', p.note,
    'has_image', r.image_path is not null,
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
          'is_staple_marked', l.is_staple_marked,
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
  from public.starter_pack_item as p
  join public.recipe as r on r.id = p.recipe_id
  where p.id = item;
  return found_recipe;
end;
$$;

-- The folder of a pack recipe's stored picture (<household>/<recipe>), for the route that shows it
-- and the copy that takes it; null for an item that is not in the pack or has no stored picture.
create or replace function public.starter_image_folder(item uuid)
returns text
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
  return (
    select r.image_path
    from public.starter_pack_item as p
    join public.recipe as r on r.id = p.recipe_id
    where p.id = item
  );
end;
$$;

-- How many recipes the caller's household has, and the cap starter copies stop at.
create or replace function public.starter_recipe_room()
returns table (recipe_count integer, recipe_cap integer)
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
    select (select count(*)::integer from public.recipe as r where r.household_id = hid), public.starter_recipe_household_cap();
end;
$$;

-- 5. The copy --------------------------------------------------------------------------------

-- "Lägg till N recept": copies the pack recipe `item` into the caller's household and returns the
-- copy's id; when the household has a copy already, that one; for the owner's own household, the
-- owner's recipe itself (nothing is copied). `ingredient_ids[i]` is the caller's own catalog
-- ingredient for line i, or null (22023 when their number is not the number of lines; another
-- household's id fails the foreign key, 23503). `expected_version` from get_starter_recipe: when
-- the lines changed since, 40001. Not in the pack (any more): P0002. The household has
-- starter_recipe_household_cap() recipes or more: 54000, and nothing is saved. Copies of one
-- household are made one at a time (a lock per household), so the cap and "one copy per item" are exact.
create or replace function public.save_starter_recipe(item uuid, ingredient_ids uuid[], expected_version text)
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
  select r.id, r.household_id, r.title, r.original_servings, r.total_minutes, r.image_url, r.source_kind, r.source_url, p.id as item_id
  into origin
  from public.starter_pack_item as p
  join public.recipe as r on r.id = p.recipe_id
  where p.id = item
  for share of r;
  if not found then
    raise exception 'no starter recipe with that id' using errcode = 'P0002';
  end if;
  if origin.household_id = hid then
    return origin.id;
  end if;

  perform pg_advisory_xact_lock(hashtext('starter_copy:' || hid::text));

  select c.id into copy_id from public.recipe as c where c.household_id = hid and c.starter_item_id = origin.item_id;
  if copy_id is not null then
    return copy_id;
  end if;

  if expected_version is distinct from public.shared_recipe_version(origin.id) then
    raise exception 'the recipe changed' using errcode = '40001';
  end if;
  if (select count(*) from public.recipe as c where c.household_id = hid) >= public.starter_recipe_household_cap() then
    raise exception 'the household has its recipe cap' using errcode = '54000';
  end if;
  select count(*) into line_count from public.recipe_ingredient as l where l.recipe_id = origin.id;
  if coalesce(cardinality(ingredient_ids), 0) <> line_count then
    raise exception 'one ingredient id per line' using errcode = '22023';
  end if;

  -- The fingerprint is set below, when the steps and lines are in; '' holds its place meanwhile.
  insert into public.recipe as c (
    household_id, user_id, title, original_servings, total_minutes, image_url, source_kind, source_url,
    is_shared, starter_item_id, starter_fingerprint
  )
  values (
    hid, me, origin.title, origin.original_servings, origin.total_minutes, public.shared_image_url(origin.image_url),
    origin.source_kind, origin.source_url, false, origin.item_id, ''
  )
  returning c.id into copy_id;

  insert into public.recipe_step (household_id, user_id, recipe_id, position, text, title)
  select hid, me, copy_id, (row_number() over (order by s.position) - 1)::integer, s.text, s.title
  from public.recipe_step as s
  where s.recipe_id = origin.id;

  insert into public.recipe_ingredient (
    household_id, user_id, recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague, section, is_staple_marked
  )
  select hid, me, copy_id, ingredient_ids[l.ordinal::integer], copied_step.id, (l.ordinal - 1)::integer,
    l.original_text, l.amount, l.unit, l.is_vague, l.section, l.is_staple_marked
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

  -- A household with "Dela alla mina recept" on shares a new recipe of its own when it is saved
  -- (recipe_share_guard); a starter copy is the pack's recipe, so it is not shared by that.
  update public.recipe as c
  set starter_fingerprint = public.starter_recipe_fingerprint(copy_id), is_shared = false
  where c.id = copy_id;

  return copy_id;
end;
$$;

-- 6. The pictures --------------------------------------------------------------------------

-- True when `object_name` is a file of a pack recipe's stored picture (its folder <household>/<recipe>)
-- and the caller is a member of a household: any household may then read it, to copy it.
create or replace function public.recipe_image_in_starter_pack(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.my_household_id() is not null
    and exists (
      select 1
      from public.starter_pack_item as p
      join public.recipe as r on r.id = p.recipe_id
      where r.image_path is not null
        and r.image_path = (storage.foldername(object_name))[1] || '/' || (storage.foldername(object_name))[2]
    ),
    false
  );
$$;

revoke all on function public.recipe_image_in_starter_pack(text) from public, anon, authenticated, service_role;
grant execute on function public.recipe_image_in_starter_pack(text) to authenticated;

drop policy if exists recipe_images_starter_select on storage.objects;
create policy recipe_images_starter_select on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images' and public.recipe_image_in_starter_pack(name));

-- 7. The owner's pack ------------------------------------------------------------------------

-- The pack as the owner manages it: each item's recipe, place, note, whether it has a stored
-- picture and how many households have a copy (a number only). 42501 for anyone but the owner.
create or replace function public.starter_pack_items()
returns table (
  item_id uuid,
  recipe_id uuid,
  title text,
  original_servings integer,
  total_minutes integer,
  image_url text,
  image_path text,
  "position" integer,
  note text,
  copies integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_owner() then
    raise exception 'only the app owner' using errcode = '42501';
  end if;
  return query
    select p.id, r.id, r.title, r.original_servings, r.total_minutes, r.image_url, r.image_path, p.position, p.note,
      (select count(*)::integer from public.recipe as c where c.starter_item_id = p.id)
    from public.starter_pack_item as p
    join public.recipe as r on r.id = p.recipe_id
    order by p.position, p.created_at, p.id;
end;
$$;

-- "Lägg i startpaketet": the owner's own recipe `pack_recipe` (of the owner's household) goes last
-- in the pack; returns its item's id, or the one it has already. Not the owner: 42501. Not a recipe
-- of the owner's household: P0002. A starter copy or a copy saved from another household (their
-- recipe): 22023. The pack is full (starter_pack_cap()): 54000.
create or replace function public.starter_pack_add(pack_recipe uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
  found_recipe record;
  item_id uuid;
begin
  if hid is null or not public.is_app_owner() then
    raise exception 'only the app owner' using errcode = '42501';
  end if;
  select r.id, r.starter_item_id, r.shared_from_recipe_id into found_recipe
  from public.recipe as r
  where r.id = pack_recipe and r.household_id = hid;
  if not found then
    raise exception 'no such recipe' using errcode = 'P0002';
  end if;
  if found_recipe.starter_item_id is not null or found_recipe.shared_from_recipe_id is not null then
    raise exception 'a copy is not added to the pack' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('starter_pack'));
  select p.id into item_id from public.starter_pack_item as p where p.recipe_id = pack_recipe;
  if item_id is not null then
    return item_id;
  end if;
  if (select count(*) from public.starter_pack_item) >= public.starter_pack_cap() then
    raise exception 'the pack is full' using errcode = '54000';
  end if;
  insert into public.starter_pack_item (recipe_id, position)
  values (pack_recipe, coalesce((select max(p.position) + 1 from public.starter_pack_item as p), 0))
  returning id into item_id;
  return item_id;
end;
$$;

-- "Ta bort ur startpaketet": the item leaves the pack. Copies households have made stay theirs
-- (and keep their mark, so "Ta bort startrecepten" still finds them). False when there is no such item.
create or replace function public.starter_pack_remove(item uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_app_owner() then
    raise exception 'only the app owner' using errcode = '42501';
  end if;
  delete from public.starter_pack_item as p where p.id = item;
  return found;
end;
$$;

-- The item's short note (shown under the title in the picker); empty or blank removes it. More than
-- 140 characters: 23514. False when there is no such item.
create or replace function public.starter_pack_set_note(item uuid, item_note text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_app_owner() then
    raise exception 'only the app owner' using errcode = '42501';
  end if;
  update public.starter_pack_item as p
  set note = nullif(btrim(item_note), ''), updated_at = now()
  where p.id = item;
  return found;
end;
$$;

-- Moves the item one place up (`step` -1) or down (+1) in the pack; the places are numbered
-- 0, 1, 2, ... again on the way. False when there is no such item or it is already first or last.
create or replace function public.starter_pack_move(item uuid, step integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ordered uuid[];
  here integer;
  there integer;
begin
  if not public.is_app_owner() then
    raise exception 'only the app owner' using errcode = '42501';
  end if;
  if step is null or step not in (-1, 1) then
    raise exception 'step is -1 or 1' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('starter_pack'));
  select array_agg(p.id order by p.position, p.created_at, p.id) into ordered from public.starter_pack_item as p;
  here := array_position(ordered, item);
  if here is null then
    return false;
  end if;
  there := here + step;
  if there < 1 or there > cardinality(ordered) then
    return false;
  end if;
  ordered[here] := ordered[there];
  ordered[there] := item;
  update public.starter_pack_item as p
  set position = (array_position(ordered, p.id) - 1), updated_at = now()
  where p.position is distinct from (array_position(ordered, p.id) - 1);
  return true;
end;
$$;

-- 8. The household's own copies ------------------------------------------------------------------

-- The household's starter copies and whether each is untouched (the content it was copied with,
-- no favourite, not shared, on no meal plan). Security invoker: RLS gives only the household's own.
create or replace function public.starter_copies()
returns table (recipe_id uuid, untouched boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id,
    r.starter_fingerprint = public.starter_recipe_fingerprint(r.id)
      and not r.is_favorite
      and not r.is_shared
      and not exists (select 1 from public.meal_plan_recipe as m where m.recipe_id = r.id)
  from public.recipe as r
  where r.household_id = public.my_household_id() and r.starter_item_id is not null;
$$;

-- "Ta bort startrecepten" (and the bin on Klart): deletes the household's untouched starter copies,
-- all of them or only those in `recipe_ids`, and returns each deleted one's id and picture folder
-- (the code removes the files). A copy that was changed, made a favourite, shared or planned, and
-- every recipe that is not a starter copy, is never touched. Security invoker: RLS limits it to the
-- household's own recipes.
create or replace function public.delete_untouched_starter_copies(recipe_ids uuid[])
returns table (id uuid, image_path text)
language sql
volatile
security invoker
set search_path = ''
as $$
  delete from public.recipe as r
  where r.household_id = public.my_household_id()
    and r.starter_item_id is not null
    and (recipe_ids is null or r.id = any (recipe_ids))
    and r.starter_fingerprint = public.starter_recipe_fingerprint(r.id)
    and not r.is_favorite
    and not r.is_shared
    and not exists (select 1 from public.meal_plan_recipe as m where m.recipe_id = r.id)
  returning r.id, r.image_path;
$$;

-- 9. Grants ----------------------------------------------------------------------------------------

revoke all on function public.starter_pack_list() from public, anon, authenticated, service_role;
revoke all on function public.get_starter_recipe(uuid) from public, anon, authenticated, service_role;
revoke all on function public.starter_image_folder(uuid) from public, anon, authenticated, service_role;
revoke all on function public.starter_recipe_room() from public, anon, authenticated, service_role;
revoke all on function public.save_starter_recipe(uuid, uuid[], text) from public, anon, authenticated, service_role;
revoke all on function public.starter_pack_items() from public, anon, authenticated, service_role;
revoke all on function public.starter_pack_add(uuid) from public, anon, authenticated, service_role;
revoke all on function public.starter_pack_remove(uuid) from public, anon, authenticated, service_role;
revoke all on function public.starter_pack_set_note(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.starter_pack_move(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.starter_copies() from public, anon, authenticated, service_role;
revoke all on function public.delete_untouched_starter_copies(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.starter_pack_list() to authenticated;
grant execute on function public.get_starter_recipe(uuid) to authenticated;
grant execute on function public.starter_image_folder(uuid) to authenticated;
grant execute on function public.starter_recipe_room() to authenticated;
grant execute on function public.save_starter_recipe(uuid, uuid[], text) to authenticated;
grant execute on function public.starter_pack_items() to authenticated;
grant execute on function public.starter_pack_add(uuid) to authenticated;
grant execute on function public.starter_pack_remove(uuid) to authenticated;
grant execute on function public.starter_pack_set_note(uuid, text) to authenticated;
grant execute on function public.starter_pack_move(uuid, integer) to authenticated;
grant execute on function public.starter_copies() to authenticated;
grant execute on function public.delete_untouched_starter_copies(uuid[]) to authenticated;
