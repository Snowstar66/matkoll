-- Shopping module (AD-1, AD-4, AD-20, Story 7.2): Pontus's product choices,
-- which product to buy for a catalog ingredient in one store, for the
-- shopping list's detail and the basket export (Story 7.3). Only
-- src/features/shopping reads and writes this table (AD-1); the store is read
-- through settings/server.ts and the ingredient is never written here.
--
-- A choice belongs to a catalog ingredient and a store: the same ingredient
-- can have another choice in another store (docs/beslutslogg.md, 2026-10-26,
-- several stores and product choices per store). It is never stored in a
-- list key or the list's overlay, and the list is not counted again when a
-- choice changes (AD-8).
-- Every row belongs to one user and is protected by RLS (AD-4).
--
-- 1. product_choice, with its checks and keys.
-- 2. Indexes for the list's read and the foreign keys' lookups.
-- 3. RLS, policy and grants.
-- 4. updated_at follows every update (an upsert that changes a choice).

-- 1. The table.
create table public.product_choice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ingredient_id uuid not null,
  store_id uuid not null,
  -- What Pontus typed; productChoiceFormSchema (src/features/shopping/domain/
  -- product-choice.ts) keeps it trimmed and on one line with oneLine, so the
  -- export's line format (7.3) never breaks: no control characters, no
  -- U+2028/U+2029 and no bidi controls (U+202A–U+202E, U+2066–U+2069).
  product_name text not null,
  -- Free text such as "5 dl", "500 g" or "2-pack"; never read as an amount (AD-7).
  package_size text,
  -- Text Pontus typed, https only; shown as a link and never fetched.
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_choice_product_name_check check (
    btrim(product_name) <> ''
    and product_name = btrim(product_name)
    and char_length(product_name) <= 200
    and product_name !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
  ),
  -- Empty is null.
  constraint product_choice_package_size_check check (
    btrim(package_size) <> ''
    and package_size = btrim(package_size)
    and char_length(package_size) <= 40
    and package_size !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
  ),
  -- Only https, with a host and no whitespace, as store_url_check.
  constraint product_choice_url_check check (
    char_length(url) <= 2048
    and url ~ '^https://[^/?#]'
    and url !~ '[[:space:]\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]'
  ),
  -- One choice per catalog ingredient and store: saving is an upsert on it.
  constraint product_choice_user_id_ingredient_id_store_id_key unique (user_id, ingredient_id, store_id),
  -- The catalog and the stores are other modules: never deleted from under a choice (AD-20).
  constraint product_choice_ingredient_fkey foreign key (ingredient_id, user_id)
    references public.ingredient (id, user_id) on delete restrict,
  constraint product_choice_store_fkey foreign key (store_id, user_id)
    references public.store (id, user_id) on delete restrict
);

-- 2. The list reads the choices of one store.
create index product_choice_user_id_store_id_idx on public.product_choice (user_id, store_id);
-- The foreign keys' lookups when a store or an ingredient is deleted.
create index product_choice_store_id_user_id_idx on public.product_choice (store_id, user_id);
create index product_choice_ingredient_id_user_id_idx on public.product_choice (ingredient_id, user_id);

-- 3. RLS: one policy for select, insert, update and delete (AD-4).
alter table public.product_choice enable row level security;

create policy product_choice_own_rows on public.product_choice
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.product_choice from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.product_choice to authenticated, service_role;

-- 4. updated_at follows every update.
create function public.product_choice_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger product_choice_set_updated_at
  before update on public.product_choice
  for each row execute function public.product_choice_set_updated_at();
-- Only the trigger runs it.
revoke all on function public.product_choice_set_updated_at() from public, anon, authenticated, service_role;
