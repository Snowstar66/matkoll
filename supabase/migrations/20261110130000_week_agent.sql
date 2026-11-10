-- Veckoagenten (PR 1): the household's settings for the week agent and the
-- drafts it makes. Nothing is built on top of them yet; the app reads and
-- writes them from PR 2 on.
--
--   household_week_agent_settings: one row per household, the choices of the
--   settings sheet as a small jsonb (dinners 3-7, budget, vegetarian / skip /
--   leftover weekdays, quick weekdays, use-soon-first, favour offers, which
--   stores' offers). A household with no row uses the app's defaults
--   (domain/settings.ts). The jsonb is checked here for shape and size, so
--   nothing the app would not write can be stored; the app parses it again
--   (zod) and falls back to the default for any field that is not valid.
--
--   week_agent_proposals: the drafts. One row per proposal for a week
--   (week_start is that week's Monday), status draft | used | discarded.
--   A draft is only a draft: nothing is in Matsedel until "Använd veckan".
--   At most one draft per household and week (a new draft replaces the old
--   one, which the app marks discarded first). The proposal is a jsonb of
--   the week's seven days, checked for shape and size.
--
-- Same rules as every table of the household's data (21.2a, like food_profile):
-- household_id defaults to my_household_id(), household_fill and
-- household_row_guard, and the two policies. Nothing crosses households.
--
--   meal_plan_recipe.source: who put the dish on the day, so Matsedel can tell
--   "Din rätt" from a dish the week agent filled in. null (every existing row,
--   and every row the app writes today) means the user; 'week_agent' is set by
--   "Använd veckan". The column is nullable and unused by every existing
--   function, so nothing reads or writes it until the app is updated. The
--   table's policies and grants cover it as for its other columns; copying a
--   plan leaves it null (the copy is the user's).
--
-- Additive: two new tables, one new nullable column, two checks as functions,
-- four triggers. Nothing existing changes, so the app from before this migration keeps working
-- against it. Rollback: alter table public.meal_plan_recipe drop column source
-- (its check goes with it); drop table public.week_agent_proposals; drop table
-- public.household_week_agent_settings; then drop the functions
-- week_agent_settings_valid, week_agent_proposal_valid,
-- week_agent_set_updated_at and week_agent_proposal_limit (nothing else
-- uses them).

set local lock_timeout = '5s';

-- 1. Checks, as functions (a check cannot hold a subquery) ----------------------

-- The settings: an object of at most 2000 bytes with only the keys the app
-- knows, each of the right kind (domain/settings.ts).
create function public.week_agent_settings_valid(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and octet_length(s::text) <= 2000
    and not exists (
      select 1 from jsonb_object_keys(s) as k
      where k not in ('dinners', 'budget', 'vegetarianDays', 'skipDays', 'leftoverDays', 'quickWeekdays', 'useSoonFirst', 'favourOffers', 'offerStoreIds')
    )
    and (not s ? 'dinners' or (jsonb_typeof(s -> 'dinners') = 'number' and (s ->> 'dinners') ~ '^[3-7]$'))
    and (not s ? 'budget' or (jsonb_typeof(s -> 'budget') = 'string' and (s ->> 'budget') in ('normal', 'low')))
    and (not s ? 'quickWeekdays' or jsonb_typeof(s -> 'quickWeekdays') = 'boolean')
    and (not s ? 'useSoonFirst' or jsonb_typeof(s -> 'useSoonFirst') = 'boolean')
    and (not s ? 'favourOffers' or jsonb_typeof(s -> 'favourOffers') = 'boolean')
    and not exists (
      -- Weekday lists: an array of at most 7 numbers, each 1 (måndag) to 7 (söndag).
      select 1 from unnest(array['vegetarianDays', 'skipDays', 'leftoverDays']) as k
      where s ? k and (
        jsonb_typeof(s -> k) <> 'array'
        or jsonb_array_length(s -> k) > 7
        or exists (
          select 1 from jsonb_array_elements(s -> k) as e
          where jsonb_typeof(e) <> 'number' or e::text !~ '^[1-7]$'
        )
      )
    )
    and (
      not s ? 'offerStoreIds'
      or (
        jsonb_typeof(s -> 'offerStoreIds') = 'array'
        and jsonb_array_length(s -> 'offerStoreIds') <= 20
        and not exists (
          select 1 from jsonb_array_elements(s -> 'offerStoreIds') as e
          where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      )
    );
$$;

-- The proposal: an object of at most 40000 bytes with a `days` array of at
-- most 7 entries (domain/proposal.ts holds the rest of the shape).
create function public.week_agent_proposal_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 40000
    and jsonb_typeof(p -> 'days') = 'array'
    and jsonb_array_length(p -> 'days') <= 7;
$$;

revoke all on function public.week_agent_settings_valid(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.week_agent_proposal_valid(jsonb) from public, anon, authenticated, service_role;
-- Constraints run with the caller's rights.
grant execute on function public.week_agent_settings_valid(jsonb) to authenticated, service_role;
grant execute on function public.week_agent_proposal_valid(jsonb) to authenticated, service_role;

-- 2. updated_at, shared by both tables ---------------------------------------------

create function public.week_agent_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.week_agent_set_updated_at() from public, anon, authenticated, service_role;

-- 3. The settings -----------------------------------------------------------------

create table public.household_week_agent_settings (
  id uuid primary key default gen_random_uuid(),
  -- One row per household.
  household_id uuid not null unique default public.my_household_id() references public.household (id) on delete cascade,
  -- Who saved it first; empty when the account is deleted.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_week_agent_settings_settings_check check (public.week_agent_settings_valid(settings))
);

alter table public.household_week_agent_settings enable row level security;

create policy household_week_agent_settings_household_rows on public.household_week_agent_settings
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy household_week_agent_settings_insert_as_self on public.household_week_agent_settings
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A member reads the household's settings, adds the row and changes its content
-- (never whose it is). Never anon, and no delete: the row is changed, not removed.
revoke all on table public.household_week_agent_settings from public, anon, authenticated, service_role;
grant select on table public.household_week_agent_settings to authenticated;
grant insert (settings) on table public.household_week_agent_settings to authenticated;
grant update (settings) on table public.household_week_agent_settings to authenticated;
grant select, insert, update, delete on table public.household_week_agent_settings to service_role;

create trigger household_fill before insert on public.household_week_agent_settings
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.household_week_agent_settings
  for each row execute function public.household_row_guard();
create trigger week_agent_set_updated_at before update on public.household_week_agent_settings
  for each row execute function public.week_agent_set_updated_at();

-- 4. The proposals ----------------------------------------------------------------

create table public.week_agent_proposals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household_id() references public.household (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- The Monday of the week the proposal is for.
  week_start date not null,
  status text not null default 'draft',
  proposal jsonb not null,
  -- The model that made it (or 'rules' for the deterministic planner), for the cost log and "Gör noggrannare".
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint week_agent_proposals_status_check check (status in ('draft', 'used', 'discarded')),
  constraint week_agent_proposals_week_start_check check (extract(isodow from week_start) = 1),
  constraint week_agent_proposals_proposal_check check (public.week_agent_proposal_valid(proposal)),
  constraint week_agent_proposals_model_check check (model is null or char_length(model) between 1 and 60)
);

create index week_agent_proposals_household_week_idx on public.week_agent_proposals (household_id, week_start, created_at desc);
-- At most one draft per household and week.
create unique index week_agent_proposals_one_draft on public.week_agent_proposals (household_id, week_start) where status = 'draft';

alter table public.week_agent_proposals enable row level security;

create policy week_agent_proposals_household_rows on public.week_agent_proposals
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy week_agent_proposals_insert_as_self on public.week_agent_proposals
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A member reads the household's proposals, adds one, changes its status, content and model
-- ("Gör om", "Använd veckan", discard) but never whose it is or which week.
revoke all on table public.week_agent_proposals from public, anon, authenticated, service_role;
grant select, delete on table public.week_agent_proposals to authenticated;
grant insert (week_start, status, proposal, model) on table public.week_agent_proposals to authenticated;
grant update (status, proposal, model) on table public.week_agent_proposals to authenticated;
grant select, insert, update, delete on table public.week_agent_proposals to service_role;

create trigger household_fill before insert on public.week_agent_proposals
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.week_agent_proposals
  for each row execute function public.household_row_guard();
create trigger week_agent_set_updated_at before update on public.week_agent_proposals
  for each row execute function public.week_agent_set_updated_at();

-- At most 200 proposals per household (a draft or two a week for a few years; the
-- app discards the old ones). Runs after household_fill, by trigger name.
create function public.week_agent_proposal_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.week_agent_proposals as p where p.household_id = new.household_id) >= 200 then
    raise exception 'too many week agent proposals' using errcode = 'MK429';
  end if;
  return new;
end;
$$;

revoke all on function public.week_agent_proposal_limit() from public, anon, authenticated, service_role;

create trigger household_week_agent_proposal_limit before insert on public.week_agent_proposals
  for each row execute function public.week_agent_proposal_limit();

-- 5. Who put a dish on the day ----------------------------------------------------

alter table public.meal_plan_recipe add column source text;

alter table public.meal_plan_recipe
  add constraint meal_plan_recipe_source_check check (source is null or source in ('user', 'week_agent'));

comment on column public.meal_plan_recipe.source is
  'Who put the dish on its day: null or user (the household), week_agent (Veckoagenten, via Använd veckan).';
