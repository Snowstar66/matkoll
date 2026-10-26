-- Pantry module (AD-4, AD-19, AD-20): what is at home, per location.
-- Only src/features/pantry reads and writes this table (AD-1).
-- Every row belongs to one user and is protected by RLS (AD-4).
-- The check lists must equal LOCATIONS and UNITS in
-- src/features/catalog/domain (tests/design/pantry-checks.test.ts).

create table public.pantry_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ingredient_id uuid not null,
  location text not null,
  -- Both null: an unlimited item, which is always enough (AD-19).
  amount numeric,
  unit text,
  created_at timestamptz not null default now(),
  constraint pantry_item_location_check check (
    location in ('Kyl', 'Frys', 'Skafferi')
  ),
  constraint pantry_item_unit_check check (
    unit in ('g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva')
  ),
  constraint pantry_item_amount_check check (amount is null or amount > 0),
  -- An amount always has a unit, and an unlimited item has neither, so the
  -- unique key below holds one unlimited row per ingredient and location.
  constraint pantry_item_unlimited_check check ((amount is null) = (unit is null)),
  -- One row per ingredient, location and unit; unit null (unlimited) counts
  -- as one value (AD-19).
  constraint pantry_item_user_id_ingredient_id_location_unit_key
    unique nulls not distinct (user_id, ingredient_id, location, unit),
  -- The catalog is another module: never deleted from under the pantry (AD-20).
  constraint pantry_item_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict
);

-- Hemma lists one location at a time. The unique key's index, which starts
-- with (user_id, ingredient_id), serves the foreign key's lookups.
create index pantry_item_user_id_location_idx on public.pantry_item (user_id, location);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.pantry_item enable row level security;

create policy pantry_item_own_rows on public.pantry_item
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so the
-- cloud project, where new tables are exposed by default, matches local.
revoke all on table public.pantry_item from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.pantry_item to authenticated, service_role;
