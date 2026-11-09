-- Matpreferenser per hushåll (Menyrådgivare, steg 2): the food preferences of
-- the people a household chooses for (allergies, tastes, "Undviker" and
-- "Älskar", the usual drink) move from one phone's localStorage to the
-- database, so they follow the household to every phone and the server can
-- read them (AI suggestions, "Laga nu").
--
--   food_profile: one row per person and household. person_key is the stable
--   id the app already uses: 'm-<user id>' for a member of the household, an
--   id of the app's own making for a guest kept on purpose or a person added
--   by hand. A member's name is the household's (household_member), so it is
--   only stored for the people without an account. A member with no row has
--   nothing filled in. A temporary guest is never stored.
--
-- Same rules as every table of the household's data (21.2a): household_id
-- defaults to my_household_id(), household_fill and household_row_guard, and
-- the two policies. Nothing crosses households; there is no function that
-- reads another household's rows. The checks refuse anything the app would
-- not have written (domain/people.ts, domain/preferences.ts).
--
-- Additive: one new table, three small pure functions and three triggers.
-- Nothing existing changes, so the app from before this migration keeps
-- working against it. Rollback: drop table public.food_profile; then drop
-- the three functions food_tastes_valid, food_tags_valid, food_profile_limit
-- (nothing else uses them).

set local lock_timeout = '5s';

-- 1. Checks, as functions (a check cannot hold a subquery) ----------------------

-- The tastes: an object whose keys are the app's TasteKey and whose values are
-- -2, -1, 1 or 2 (0 is "no opinion" and is never stored).
create function public.food_tastes_valid(tastes jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(tastes) = 'object'
    and octet_length(tastes::text) <= 400
    and not exists (
      select 1 from jsonb_each(tastes) as t (key, value)
      where t.key not in ('kott', 'fisk', 'skaldjur', 'vegetariskt', 'pasta', 'pizza', 'starkt', 'sott')
        or jsonb_typeof(t.value) <> 'number'
        or t.value::text not in ('-2', '-1', '1', '2')
    );
$$;

-- "Undviker" / "Älskar": at most 30 tags of 1-40 characters, trimmed, with no
-- markup (the characters < > { } [ ] \ and `, nor a web address), as
-- preferences.ts accepts them.
create function public.food_tags_valid(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select tags is not null
    and cardinality(tags) <= 30
    and not exists (
      select 1 from unnest(tags) as tag
      where tag is null
        or tag <> btrim(tag)
        or char_length(tag) not between 1 and 40
        or tag ~ '[<>{}\[\]\\`]'
        or tag ~* 'https?:'
    );
$$;

revoke all on function public.food_tastes_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.food_tags_valid(text[]) from public, anon, authenticated, service_role;
-- Constraints run with the caller's rights.
grant execute on function public.food_tastes_valid(jsonb) to authenticated, service_role;
grant execute on function public.food_tags_valid(text[]) to authenticated, service_role;

-- 2. The table -------------------------------------------------------------------

create table public.food_profile (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household_id() references public.household (id) on delete cascade,
  -- Who saved it first; empty when the account is deleted.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- 'm-<user id>' for a member, otherwise the app's own id for the person.
  person_key text not null,
  kind text not null,
  -- Only for people without an account (a guest); a member's name is the household's.
  name text,
  allergies text[] not null default '{}',
  tastes jsonb not null default '{}'::jsonb,
  dislikes text[] not null default '{}',
  likes text[] not null default '{}',
  drink text,
  -- A guest kept on purpose ("Spara gäst"); a temporary guest is not stored at all.
  saved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_profile_household_person_key unique (household_id, person_key),
  constraint food_profile_person_key_check check (person_key ~ '^[A-Za-z0-9_-]{1,80}$'),
  constraint food_profile_kind_check check (kind in ('member', 'guest')),
  constraint food_profile_name_check
    check (name is null or (name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[<>{}\[\]\\`]')),
  constraint food_profile_guest_name_check check (kind <> 'guest' or name is not null),
  constraint food_profile_allergies_check
    check (cardinality(allergies) <= 8
      and allergies <@ array['gluten', 'laktos', 'notter', 'skaldjur', 'agg', 'fisk', 'soja', 'sesam']::text[]),
  constraint food_profile_tastes_check check (public.food_tastes_valid(tastes)),
  constraint food_profile_dislikes_check check (public.food_tags_valid(dislikes)),
  constraint food_profile_likes_check check (public.food_tags_valid(likes)),
  constraint food_profile_drink_check
    check (drink is null or drink in ('vatten', 'lask', 'ol', 'vin', 'cocktail', 'kaffe', 'ingen'))
);

alter table public.food_profile enable row level security;

-- The same two policies as every table of the household's data (21.2a).
create policy food_profile_household_rows on public.food_profile
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy food_profile_insert_as_self on public.food_profile
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A member reads the household's profiles, adds one and changes its content
-- (never whose it is: person_key, kind, user_id and household_id stay), and
-- removes one. Never anon.
revoke all on table public.food_profile from public, anon, authenticated, service_role;
grant select, delete on table public.food_profile to authenticated;
grant insert (person_key, kind, name, allergies, tastes, dislikes, likes, drink, saved) on table public.food_profile to authenticated;
grant update (name, allergies, tastes, dislikes, likes, drink, saved) on table public.food_profile to authenticated;
grant select, insert, update, delete on table public.food_profile to service_role;

create trigger household_fill before insert on public.food_profile
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.food_profile
  for each row execute function public.household_row_guard();

-- updated_at follows every update.
create function public.food_profile_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.food_profile_set_updated_at() from public, anon, authenticated, service_role;

create trigger food_profile_set_updated_at before update on public.food_profile
  for each row execute function public.food_profile_set_updated_at();

-- 3. The limit -------------------------------------------------------------------

-- At most 60 people per household (the app keeps 20 added by hand, and the
-- members come on top). Runs after household_fill, by trigger name.
create function public.food_profile_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.food_profile as p where p.household_id = new.household_id) >= 60 then
    raise exception 'too many food profiles' using errcode = 'MK429';
  end if;
  return new;
end;
$$;

revoke all on function public.food_profile_limit() from public, anon, authenticated, service_role;

create trigger household_food_profile_limit before insert on public.food_profile
  for each row execute function public.food_profile_limit();
