-- Välkomsttur (Story 20.1, AD-4, AD-5): whether a user has seen the welcome
-- tour. One row per user, made when the tour is closed in any way (Hoppa över,
-- Esc, one of the last page's choices). No row means the tour is shown at the
-- next start of the app. Kept on the server, not in localStorage, so a second
-- device does not show it again (the same rule as the chosen boende, AD-24).
--
-- Additive and backward compatible: one new table; nothing existing changes.
-- The code before it never reads the table.

create table public.welcome_tour (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tour_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint welcome_tour_user_id_key unique (user_id)
);

alter table public.welcome_tour enable row level security;

-- Own row only: read and add. The row is never changed or removed by the
-- user; it goes with the user (on delete cascade).
create policy welcome_tour_own_rows on public.welcome_tour
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants (AD-4): the user reads their row and adds it (the time only; the
-- user is the caller). Never anon. service_role keeps the whole table, for
-- tests and operations.
revoke all on table public.welcome_tour from public, anon, authenticated, service_role;
grant select (id, user_id, tour_seen_at, created_at) on table public.welcome_tour to authenticated;
grant insert (tour_seen_at) on table public.welcome_tour to authenticated;
grant select, insert, update, delete on table public.welcome_tour to service_role;

-- Decision 8 (Epic 20): the tour is for new users only. Everyone who has an
-- account when this ships has seen it, and finds it under Hjälp och tips.
insert into public.welcome_tour (user_id, tour_seen_at)
select id, now() from auth.users
on conflict (user_id) do nothing;
