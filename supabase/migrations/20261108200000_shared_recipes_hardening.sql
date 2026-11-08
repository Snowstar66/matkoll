-- Delade recept, hardening after review (additive; 20261108190000_shared_recipes.sql is the base).
--
--   1. household.name_is_default: true while the household still has the name it got with the
--      account ("Phellgren85s hushåll", from the e-mail's first part). Other households then see
--      "Ett hushåll" instead, in Delade, "Delat av …" and "Sparat av …". Any change of the name
--      (rename_household) clears it.
--   2. A saved copy is never shared again (recipe_share_guard refuses is_shared on a copy).
--   3. When a household is deleted, other households' copies of its recipes say "Ett hushåll".
--   4. Image addresses go to other households only when they are https (no plain-http pixels),
--      in the list, the recipe and the copy.
--   5. Delade holds at most 100 recipes per household (newest), within the 500.
--   6. get_shared_recipe gives a version of the recipe's lines; save_shared_recipe takes it and
--      refuses with 40001 when the lines changed in between, since the caller's ingredient ids are
--      by line. The two-argument save_shared_recipe is no longer callable.
--   7. The staple mark (•) of a line is shared and copied.

set local lock_timeout = '5s';

-- 1. The household's default name ------------------------------------------------

alter table public.household add column name_is_default boolean not null default true;

-- Existing rows: still the default when the name is what a member's e-mail or name would give.
update public.household as h
set name_is_default = exists (
  select 1
  from public.household_member as m
  left join auth.users as u on u.id = m.user_id
  where m.household_id = h.id
    and (h.name = public.household_default_name(public.household_display_name(u.email))
      or h.name = public.household_default_name(m.display_name))
);

-- A new name is the household's own choice.
create function public.household_name_chosen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.name_is_default := false;
  end if;
  return new;
end;
$$;

revoke all on function public.household_name_chosen() from public, anon, authenticated, service_role;

create trigger household_name_chosen
  before update of name on public.household
  for each row execute function public.household_name_chosen();

-- The name other households see.
create function public.household_shared_name(household_name text, is_default boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when is_default then 'Ett hushåll' else household_name end;
$$;

revoke all on function public.household_shared_name(text, boolean) from public, anon, authenticated, service_role;

-- An image address other households may load: https only.
create function public.shared_image_url(url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when url ~* '^https://' then url end;
$$;

revoke all on function public.shared_image_url(text) from public, anon, authenticated, service_role;

-- The version of a recipe's lines: their order, text and ingredient (save_shared_recipe's ids are by line).
create function public.shared_recipe_version(recipe uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(l.position || ':' || l.original_text || ':' || coalesce(l.ingredient_id::text, '-'), '|' order by l.position), ''))
  from public.recipe_ingredient as l
  where l.recipe_id = recipe;
$$;

revoke all on function public.shared_recipe_version(uuid) from public, anon, authenticated, service_role;

-- 2. The guard: a copy is never shared again --------------------------------------

create or replace function public.recipe_share_guard()
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
  if new.is_shared and new.shared_from_recipe_id is not null then
    raise exception 'a saved copy is not shared again' using errcode = '42501';
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

-- Copies saved before this migration that were shared by hand stop being shared.
update public.recipe set is_shared = false where is_shared and shared_from_recipe_id is not null;

-- 3. A deleted household's name leaves the copies -----------------------------------

create function public.household_forget_shared_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recipe as c
  set shared_from_name = 'Ett hushåll'
  where c.household_id <> old.id
    and c.shared_from_recipe_id in (select r.id from public.recipe as r where r.household_id = old.id)
    and c.shared_from_name is distinct from 'Ett hushåll';
  return old;
end;
$$;

revoke all on function public.household_forget_shared_name() from public, anon, authenticated, service_role;

create trigger household_forget_shared_name
  before delete on public.household
  for each row execute function public.household_forget_shared_name();

-- 4–7. The functions --------------------------------------------------------------

create or replace function public.list_shared_recipes()
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
    select r.id, r.title, r.original_servings, r.total_minutes, public.shared_image_url(r.image_url),
      public.household_shared_name(h.name, h.name_is_default), r.created_at,
      (select c.id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = r.id),
      coalesce(
        (select array_agg(l.original_text order by l.position) from public.recipe_ingredient as l where l.recipe_id = r.id),
        '{}'::text[]
      )
    from (
      select s.id, s.household_id, row_number() over (partition by s.household_id order by s.created_at desc, s.id) as place
      from public.recipe as s
      where s.is_shared and s.household_id <> hid
    ) as newest
    join public.recipe as r on r.id = newest.id
    join public.household as h on h.id = r.household_id
    where newest.place <= 100
    order by r.created_at desc, r.id
    limit 500;
end;
$$;

create or replace function public.get_shared_recipe(shared_recipe_id uuid)
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
    'image_url', public.shared_image_url(r.image_url),
    'source_kind', r.source_kind,
    'source_url', r.source_url,
    'household_name', public.household_shared_name(h.name, h.name_is_default),
    'saved_copy_id', (select c.id from public.recipe as c where c.household_id = hid and c.shared_from_recipe_id = r.id),
    'version', public.shared_recipe_version(r.id),
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
  from public.recipe as r
  join public.household as h on h.id = r.household_id
  where r.id = shared_recipe_id and r.is_shared and r.household_id <> hid;
  return found_recipe;
end;
$$;

-- As the two-argument version, with `expected_version` from get_shared_recipe: when the lines
-- changed since (another number of lines, other texts or ingredients), 40001 and nothing is saved.
-- An existing copy is given back whatever the version.
create function public.save_shared_recipe(shared_recipe_id uuid, ingredient_ids uuid[], expected_version text)
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

  return copy_id;
end;
$$;

create or replace function public.shared_recipe_savers(own_recipe_id uuid)
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
    select public.household_shared_name(h.name, h.name_is_default)
    from public.recipe as c
    join public.household as h on h.id = c.household_id
    where c.shared_from_recipe_id = own_recipe_id
      and c.household_id <> hid
      and exists (select 1 from public.recipe as o where o.id = own_recipe_id and o.household_id = hid)
    order by c.created_at, h.name;
end;
$$;

revoke all on function public.save_shared_recipe(uuid, uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.save_shared_recipe(uuid, uuid[], text) to authenticated;
-- The version without the check is kept (additive) but no longer callable.
revoke all on function public.save_shared_recipe(uuid, uuid[]) from public, anon, authenticated, service_role;
