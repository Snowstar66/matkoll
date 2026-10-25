-- Settings, follow-up to 20261025211316_settings.sql and
-- 20261025213853_settings_more_recipe_sites.sql (AD-4, AD-11, AD-21).
-- 1. Every user who exists now gets the start sites, so a session from before
--    these migrations does not have to sign in again before importing a link.
-- 2. The rule for turning sites off (docs/beslutslogg.md, 2026-10-25): a site
--    is turned off (is_active = false), never deleted, so the start data does
--    not come back at the next sign-in; ensure_user_defaults() only adds
--    missing sites and never turns an off site on again.
-- 3. A domain label is at most 63 characters, as in DNS and in
--    src/features/settings/domain/domain-name.ts.

-- 1. Backfill. The migration runs without a session, so user_id is set here.
insert into public.recipe_site (user_id, domain)
select users.id, defaults.domain
from auth.users as users
cross join (values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')) as defaults (domain)
on conflict (user_id, domain) do nothing;

-- 2. The same function, with the rule in its comment.
create or replace function public.ensure_user_defaults()
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')
  on conflict (user_id, domain) do nothing;
$$;

comment on function public.ensure_user_defaults() is
  'Start data for the signed-in user (AD-21): adds the start recipe sites that are missing. '
  'Sites are turned off (is_active = false), never deleted, and this function never turns an off site on again.';

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;

-- 3. Labels of at most 63 characters.
alter table public.recipe_site drop constraint recipe_site_domain_check;
alter table public.recipe_site
  add constraint recipe_site_domain_check check (
    char_length(domain) <= 253
    and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and domain !~ '^www\.'
    and domain !~ '^[0-9.]+$'
  );
