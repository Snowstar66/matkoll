-- Basvaror: det man alltid har hemma (Pontus 2026-11-02).
--
-- "du behöver inte lista de absolut vanligaste som t ex vatten … salt, peppar,
-- socker och mjöl likaså när det handlar om småmängder. ska jag baka däremot så
-- är det relevant". A household's staples are counted as at home wherever a
-- recipe's needs are counted: the shopping list leaves them out, and they never
-- count in "Saknar N varor". Each staple may have a limit ("räknas som basvara
-- upp till 1 dl"); a need above it (baking) counts as today.
--
--   1. household_staple: the household's staples, one row each. A table rather
--      than a JSON column on household: the household's own rows, with the same
--      household_id, RLS and triggers as every table of the app's data (21.2a:
--      default my_household_id(), household_fill, household_row_guard, the two
--      policies), so a member adds and removes one row at a time (with Ångra)
--      without rewriting the others, and two members never overwrite each other.
--      household has no update grant at all, and should not get one for this.
--      The name is matched normalised (normalized_name, the app's
--      catalog.normalizeIngredientText) against the catalog ingredient of a
--      recipe line, its synonyms, or the line's own text.
--   2. household_staple_defaults(): the default list, the one place it is kept.
--   3. Every household gets the defaults now, and every new one when it is made
--      (an account's own, and the one a member gets when leaving): a trigger on
--      household, so no path that makes a household can miss it.
--   4. reset_household_staples(): "Återställ standard", for the caller's own
--      household, as the caller (RLS applies).
--   5. At most 200 staples a household (MK429).
--
-- Additive: one new table and four functions; nothing existing changes, so the
-- app before this migration keeps working against it.

set local lock_timeout = '5s';

-- 1. The table ----------------------------------------------------------------------

create table public.household_staple (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household_id() references public.household (id) on delete cascade,
  -- Who added it; empty for the defaults, and when the account is deleted.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- As shown: "Salt", "Vetemjöl".
  name text not null,
  -- As matched: catalog.normalizeIngredientText of the name.
  normalized_name text not null,
  -- The limit: a need up to max_amount max_unit counts as a staple. Both empty: always.
  max_amount numeric,
  max_unit text,
  created_at timestamptz not null default now(),
  constraint household_staple_name_check check (name = btrim(name) and char_length(name) between 1 and 60),
  constraint household_staple_normalized_name_check
    check (normalized_name = btrim(normalized_name) and char_length(normalized_name) between 1 and 60),
  constraint household_staple_limit_check check ((max_amount is null) = (max_unit is null)),
  constraint household_staple_max_amount_check check (max_amount is null or (max_amount > 0 and max_amount <= 100000)),
  -- The units of volume and weight (catalog.UNITS); a staple is never counted in pieces.
  constraint household_staple_max_unit_check
    check (max_unit is null or max_unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk')),
  constraint household_staple_household_name_key unique (household_id, normalized_name)
);

create index household_staple_user_idx on public.household_staple (user_id) where user_id is not null;

alter table public.household_staple enable row level security;

-- The same two policies as every table of the household's data (21.2a).
create policy household_staple_household_rows on public.household_staple
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy household_staple_insert_as_self on public.household_staple
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A member reads the household's staples, adds one (the content only) and
-- removes one. Nothing is changed in place: a new limit is a remove and an add.
-- Never anon.
revoke all on table public.household_staple from public, anon, authenticated, service_role;
grant select, delete on table public.household_staple to authenticated;
grant insert (name, normalized_name, max_amount, max_unit) on table public.household_staple to authenticated;
grant select, insert, update, delete on table public.household_staple to service_role;

create trigger household_fill before insert on public.household_staple
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.household_staple
  for each row execute function public.household_row_guard();

-- 2. The default list ---------------------------------------------------------------

-- Always: water, salt, pepper and the common dried spices. Up to a limit: sugar,
-- flour, butter and oils, in small amounts. The names follow the catalog's
-- ("peppar", "mjöl", "olja" are catalog names as well as "svartpeppar",
-- "vetemjöl", "rapsolja"); normalized_name is what the app's normaliser makes
-- of the name.
create function public.household_staple_defaults()
returns table (name text, normalized_name text, max_amount numeric, max_unit text)
language sql
immutable
set search_path = ''
as $$
  values
    ('Vatten', 'vatten', null::numeric, null::text),
    ('Salt', 'salt', null, null),
    ('Flingsalt', 'flingsalt', null, null),
    ('Salt och peppar', 'salt och peppar', null, null),
    ('Peppar', 'peppar', null, null),
    ('Svartpeppar', 'svartpeppar', null, null),
    ('Vitpeppar', 'vitpeppar', null, null),
    ('Paprikapulver', 'paprikapulver', null, null),
    ('Oregano', 'oregano', null, null),
    ('Torkad timjan', 'torkad timjan', null, null),
    ('Kanel', 'kanel', null, null),
    ('Spiskummin', 'spiskummin', null, null),
    ('Chiliflakes', 'chiliflakes', null, null),
    ('Socker', 'socker', 1, 'dl'),
    ('Vetemjöl', 'vetemjöl', 1, 'dl'),
    ('Mjöl', 'mjöl', 1, 'dl'),
    ('Smör', 'smör', 50, 'g'),
    ('Olivolja', 'olivolja', 1, 'dl'),
    ('Rapsolja', 'rapsolja', 1, 'dl'),
    ('Olja', 'olja', 1, 'dl'),
    ('Matolja', 'matolja', 1, 'dl')
$$;

revoke all on function public.household_staple_defaults() from public, anon, authenticated, service_role;
-- reset_household_staples runs as the caller, and reads the list from here.
grant execute on function public.household_staple_defaults() to authenticated, service_role;

-- 3. Every household gets them --------------------------------------------------------

create function public.household_staple_seed(hid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.household_staple (household_id, user_id, name, normalized_name, max_amount, max_unit)
  select hid, null, d.name, d.normalized_name, d.max_amount, d.max_unit
  from public.household_staple_defaults() as d
  on conflict (household_id, normalized_name) do nothing;
$$;

revoke all on function public.household_staple_seed(uuid) from public, anon, authenticated, service_role;

create function public.household_staple_for_new_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.household_staple_seed(new.id);
  return null;
end;
$$;

revoke all on function public.household_staple_for_new_household() from public, anon, authenticated, service_role;

create trigger household_staple_for_new_household
  after insert on public.household
  for each row execute function public.household_staple_for_new_household();

-- The households there are now. Idempotent: a staple a household has is left alone.
select public.household_staple_seed(h.id) from public.household as h;

-- 4. Återställ standard -----------------------------------------------------------------

-- The caller's household's staples become the default list again. As the
-- caller: RLS lets it touch nothing but the caller's own household.
create function public.reset_household_staples()
returns void
language plpgsql
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'no household' using errcode = '42501';
  end if;
  delete from public.household_staple as s where s.household_id = hid;
  insert into public.household_staple (name, normalized_name, max_amount, max_unit)
  select d.name, d.normalized_name, d.max_amount, d.max_unit from public.household_staple_defaults() as d;
end;
$$;

revoke all on function public.reset_household_staples() from public, anon, authenticated, service_role;
grant execute on function public.reset_household_staples() to authenticated;

-- 5. The limit ------------------------------------------------------------------------

create function public.household_staple_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.household_staple as s where s.household_id = new.household_id) >= 200 then
    raise exception 'too many staples' using errcode = 'MK429';
  end if;
  return new;
end;
$$;

revoke all on function public.household_staple_limit() from public, anon, authenticated, service_role;

-- After household_fill (triggers of the same kind run in name order), so the household is known.
create trigger household_staple_limit before insert on public.household_staple
  for each row execute function public.household_staple_limit();
