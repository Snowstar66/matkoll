-- Delade recept, polish (additive; 20261108190000_shared_recipes.sql and 20261108200000_shared_recipes_hardening.sql are the base).
--
--   1. recipe.shared_at: when the recipe was last shared (set when is_shared goes false -> true,
--      cleared when it goes back). "Senast tillagda" in Delade is newest shared first, so a recipe
--      shared today is first even if it was saved a year ago. Backfilled for recipes shared now.
--   2. list_shared_recipes orders by shared_at (the 100 per household and 500 overall stay) and
--      returns it.
--   3. recipe_sharing() also says whether the household still has its default name
--      (household.name_is_default), so the app can ask for a name the first time something is shared.
--      It is the caller's own household's flag only.
--
-- list_shared_recipes and recipe_sharing return one more column, which create or replace cannot do,
-- so each is dropped and created again in this transaction with the same grants; a caller that
-- ignores the new column works as before.

set local lock_timeout = '5s';

-- 1. shared_at ---------------------------------------------------------------------

alter table public.recipe add column shared_at timestamptz;

update public.recipe set shared_at = coalesce(updated_at, created_at) where is_shared;

alter table public.recipe add constraint recipe_shared_at_check check (is_shared = (shared_at is not null));

create index recipe_shared_at_idx on public.recipe (shared_at desc) where is_shared;

-- As before, plus shared_at: set to now when a recipe becomes shared (on insert too), cleared when it
-- stops, and kept while it stays shared. A signed-in user never writes it directly; the service role
-- may give it a value on insert or while the recipe stays shared (tests, repairs). Sharing alone is
-- still not a change of the recipe (updated_at is kept).
create or replace function public.recipe_share_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  by_user boolean := current_user in ('authenticated', 'anon');
begin
  if by_user then
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
    new.shared_at := case
      when not new.is_shared then null
      when by_user then now()
      else coalesce(new.shared_at, now())
    end;
  else
    if not new.is_shared then
      new.shared_at := null;
    elsif not old.is_shared then
      new.shared_at := case when by_user then now() else coalesce(new.shared_at, now()) end;
    elsif by_user or new.shared_at is null then
      new.shared_at := coalesce(old.shared_at, now());
    end if;
    if new.is_shared is distinct from old.is_shared
      and (to_jsonb(new) - 'is_shared' - 'shared_at' - 'updated_at') = (to_jsonb(old) - 'is_shared' - 'shared_at' - 'updated_at') then
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;

-- 2. The Delade list: newest shared first ----------------------------------------------

drop function public.list_shared_recipes();

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
  line_texts text[],
  shared_at timestamptz
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
      ),
      coalesce(r.shared_at, r.created_at)
    from (
      select s.id, s.household_id,
        row_number() over (partition by s.household_id order by coalesce(s.shared_at, s.created_at) desc, s.id) as place
      from public.recipe as s
      where s.is_shared and s.household_id <> hid
    ) as newest
    join public.recipe as r on r.id = newest.id
    join public.household as h on h.id = r.household_id
    where newest.place <= 100
    order by coalesce(r.shared_at, r.created_at) desc, r.id
    limit 500;
end;
$$;

revoke all on function public.list_shared_recipes() from public, anon, authenticated, service_role;
grant execute on function public.list_shared_recipes() to authenticated;

-- 3. Whether the household still has its default name --------------------------------------

drop function public.recipe_sharing();

create function public.recipe_sharing()
returns table (share_all boolean, shared_count integer, name_is_default boolean)
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
      (select count(*)::integer from public.recipe as r where r.household_id = hid and r.is_shared),
      h.name_is_default
    from public.household as h
    where h.id = hid;
end;
$$;

revoke all on function public.recipe_sharing() from public, anon, authenticated, service_role;
grant execute on function public.recipe_sharing() to authenticated;
