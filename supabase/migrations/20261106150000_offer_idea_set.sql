-- Idéerna är klara när du öppnar erbjudandena (Pontus 2026-11-06).
--
-- The AI dish ideas built on a week's offers ("Nya idéer med extrapris") are
-- prepared in the background right after the offers are fetched, and kept here
-- so the card Rätter med extrapris and Matsedel's På erbjudande show the same
-- ready set without anyone waiting:
--
--   offer_idea_set: ONE row per household and offer week (the latest set only;
--   "Andra idéer" replaces it). `status` is pending (a run holds it, see
--   claimed_at: a run that died is taken over after a few minutes), ready
--   (intro + ideas) or failed (error_code is the app's error code, never
--   anything from the model). `ideas` is jsonb: the dishes as savable drafts
--   with why, uses, missing and onOffer, as the app's schema writes them.
--
-- Same household columns, triggers, RLS and grants as every table of the
-- household's data (21.2a, household_staple): a member of the household reads
-- and writes the household's row with the session, nobody else's, never anon.
-- The claim is done by the app as one conditional UPDATE (like store_offer's
-- ai_matched_at), so no function is added.
--
-- Additive: one new table; nothing existing changes.

set local lock_timeout = '5s';

create table public.offer_idea_set (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household_id() references public.household (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- The Monday of the offers' week.
  week_start date not null,
  status text not null default 'pending',
  -- When the run that holds a pending set began.
  claimed_at timestamptz not null default now(),
  intro text not null default '',
  ideas jsonb not null default '[]'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_idea_set_status_check check (status in ('pending', 'ready', 'failed')),
  constraint offer_idea_set_intro_check check (char_length(intro) <= 1000),
  constraint offer_idea_set_ideas_check check (jsonb_typeof(ideas) = 'array' and jsonb_array_length(ideas) <= 10),
  constraint offer_idea_set_error_code_check check (error_code is null or char_length(error_code) <= 64),
  constraint offer_idea_set_household_week_key unique (household_id, week_start)
);

create index offer_idea_set_user_idx on public.offer_idea_set (user_id) where user_id is not null;

alter table public.offer_idea_set enable row level security;

create policy offer_idea_set_household_rows on public.offer_idea_set
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy offer_idea_set_insert_as_self on public.offer_idea_set
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.offer_idea_set from public, anon, authenticated, service_role;
grant select, delete on table public.offer_idea_set to authenticated;
grant insert (week_start, status, claimed_at, intro, ideas, error_code) on table public.offer_idea_set to authenticated;
grant update (status, claimed_at, intro, ideas, error_code, updated_at) on table public.offer_idea_set to authenticated;
grant select, insert, update, delete on table public.offer_idea_set to service_role;

create trigger household_fill before insert on public.offer_idea_set
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.offer_idea_set
  for each row execute function public.household_row_guard();
