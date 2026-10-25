-- Settings module (AD-11, AD-21): the approved recipe sites per user, and the
-- start data every user gets after signing in.
-- Only src/features/settings reads and writes this table (AD-1).
-- Every row belongs to one user and is protected by RLS (AD-4).

create table public.recipe_site (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Normalised like domainNameSchema in src/features/settings/domain/domain-name.ts:
  -- lower case, no scheme, path, port or "www.", punycode for non-ASCII names.
  domain text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recipe_site_domain_check check (
    char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    and domain !~ '^www\.'
    and domain !~ '^[0-9.]+$'
  ),
  constraint recipe_site_user_id_domain_key unique (user_id, domain)
);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.recipe_site enable row level security;

create policy recipe_site_own_rows on public.recipe_site
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so the
-- cloud project, where new tables are exposed by default, matches local.
revoke all on table public.recipe_site from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.recipe_site to authenticated, service_role;

-- Start data for the signed-in user (AD-21). Called by auth/confirm after a
-- successful sign-in and by the tests' setup. Idempotent: a site that is
-- already there, also one Pontus has turned off, is left as it is. Runs as
-- the caller, so RLS applies and user_id comes from auth.uid(). Epic 7 adds
-- the selected store here.
create function public.ensure_user_defaults()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com')
  on conflict (user_id, domain) do nothing;
$$;

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;
