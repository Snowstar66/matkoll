-- UX-09: a new household starts without a selected store.
--
-- ensure_user_defaults() added Maxi ICA Stormarknad Östersund (the owner's own store) as the selected store of
-- every household that had none, so a household in another town saw the wrong store and offers without being told.
-- It now adds only the start recipe sites; the household picks its store in Inställningar, Butiker ("Välj butik").
--
-- Additive: create or replace of the same function with the same signature, grants and owner. No table changes
-- and no data is touched: a household that has a store (the old default included) keeps it. A household that
-- has none (for example after deleting the default) no longer gets Maxi back at the next sign-in.

set local lock_timeout = '5s';

create or replace function public.ensure_user_defaults()
returns void
language sql
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')
  on conflict (household_id, domain) do nothing;
$$;

comment on function public.ensure_user_defaults() is
  'Adds the start data for the signed-in user (AD-21): the start recipe sites koket.se, tasteline.com, ica.se and arla.se. '
  'No store is selected for a new household (UX-09). Idempotent.';

revoke all on function public.ensure_user_defaults() from public, anon, authenticated, service_role;
grant execute on function public.ensure_user_defaults() to authenticated;
