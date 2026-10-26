-- Settings, follow-up to 20261025211316_settings.sql (AD-21, docs/oppna-fragor.md T1).
-- ica.se and arla.se passed the server fetch test (pnpm sites:probe, 2026-10-25):
-- the pages come through safeFetch and have schema.org/Recipe JSON-LD.
-- coop.se did not: its recipe pages are built in the browser and the HTML has
-- no recipe data, so it is not added.
-- ensure_user_defaults() stays idempotent: users who already have the first
-- two sites get the new ones at their next sign-in, and a site Pontus has
-- turned off is left as it is.

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

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;
