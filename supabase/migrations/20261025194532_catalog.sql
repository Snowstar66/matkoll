-- Catalog module (AD-6, AD-12): the ingredient catalog and its synonyms.
-- Only src/features/catalog reads and writes these tables (AD-1).
-- Every row belongs to one user and is protected by RLS (AD-4).
-- The check lists must equal UNITS, SECTIONS and LOCATIONS in
-- src/features/catalog/domain (tests/design/catalog-checks.test.ts).

create table public.ingredient (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  normalized_name text not null,
  section text not null,
  location text not null,
  default_unit text,
  created_at timestamptz not null default now(),
  constraint ingredient_name_check check (btrim(name) <> ''),
  constraint ingredient_normalized_name_check check (normalized_name <> ''),
  constraint ingredient_section_check check (
    section in ('Frukt och grönt', 'Bröd', 'Mejeri', 'Kött och fisk', 'Chark', 'Frys', 'Skafferi', 'Dryck', 'Övrigt')
  ),
  constraint ingredient_location_check check (
    location in ('Kyl', 'Frys', 'Skafferi')
  ),
  constraint ingredient_default_unit_check check (
    default_unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva')
  ),
  constraint ingredient_user_id_normalized_name_key unique (user_id, normalized_name),
  -- Target of the composite foreign keys from child rows (AD-4).
  constraint ingredient_id_user_id_key unique (id, user_id)
);

create table public.ingredient_synonym (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ingredient_id uuid not null,
  normalized text not null,
  created_at timestamptz not null default now(),
  constraint ingredient_synonym_normalized_check check (normalized <> ''),
  constraint ingredient_synonym_user_id_normalized_key unique (user_id, normalized),
  -- A synonym always points at an ingredient of the same user. Catalog
  -- ingredients are never deleted or merged in v1 (AD-20).
  constraint ingredient_synonym_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict
);

create index ingredient_synonym_ingredient_id_user_id_idx on public.ingredient_synonym (ingredient_id, user_id);

-- RLS: one policy per table, for select, insert, update and delete (AD-4).
alter table public.ingredient enable row level security;
alter table public.ingredient_synonym enable row level security;

create policy ingredient_own_rows on public.ingredient
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy ingredient_synonym_own_rows on public.ingredient_synonym
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so the
-- cloud project, where new tables are exposed by default, matches local.
revoke all on table public.ingredient, public.ingredient_synonym from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ingredient, public.ingredient_synonym to authenticated, service_role;

-- Creates the new ingredients of one commit and returns the id for each
-- normalized name, also when the ingredient already exists (AD-6):
-- insert … on conflict (user_id, normalized_name) do update … returning id.
-- The update is a no-op, so an existing ingredient keeps its name, section,
-- location and unit. Runs as the caller, so RLS applies. The caller removes
-- duplicate normalized names first: one command cannot update a row twice.
create function public.commit_new_ingredients(items jsonb)
returns table (id uuid, normalized_name text)
language sql
security invoker
set search_path = ''
as $$
  insert into public.ingredient as existing (name, normalized_name, section, location, default_unit)
  select item.name, item.normalized_name, item.section, item.location, item.default_unit
  from jsonb_to_recordset(items) as item (
    name text,
    normalized_name text,
    section text,
    location text,
    default_unit text
  )
  on conflict (user_id, normalized_name) do update
    set normalized_name = existing.normalized_name
  returning existing.id, existing.normalized_name;
$$;

revoke all on function public.commit_new_ingredients(jsonb) from public, anon, authenticated;
grant execute on function public.commit_new_ingredients(jsonb) to authenticated, service_role;
