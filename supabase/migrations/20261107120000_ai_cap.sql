-- Tak för AI-kostnad per hushåll. The app's owner (a row in app_owner) sets a daily cap in
-- kronor for what a household's AI calls may cost; the app stops asking the model for a household
-- that has reached it, until midnight in Stockholm. The owner's own household is exempt.
--
-- Prices stay in code (src/features/settings/domain/ai-usage.ts, one source of truth): the
-- database only sums tokens per model, and the app turns them into kronor.
--
-- 1. ai_cap: one row (id is always true), the cap in SEK, default 10. 0 means no AI at all for
--    the households that are not exempt (cost >= cap blocks, and 0 >= 0). RLS on and no policy, no
--    grant to anon or authenticated: no client reads or writes it; the owner changes it through
--    set_ai_cap(), and everyone reads it only through ai_cap_status().
-- 2. ai_household_exempt(hid): whether a household has the app's owner among its members.
--    Internal: revoked from everyone (the functions below run as their owner and may call it).
-- 3. ai_cap_status(): the caller's household, today (Stockholm) per model: the cap, whether it
--    is exempt and the tokens. Every member of the household counts, so a family shares one cap.
--    A household without usage today gives one row with a null model.
-- 4. ai_cap_households(): owner only (42501 for anyone else), every household with today's and
--    this month's tokens per model, its cap and whether it is exempt, so the owner's page can
--    show the estimated cost.
-- 5. set_ai_cap(new_cap): owner only; 0 to 1000 kronor (22023 outside, or null).
--
-- Every function is security definer with search_path '' and revoked from public.

set local lock_timeout = '5s';

create table public.ai_cap (
  id boolean primary key default true,
  daily_cap_sek numeric(8, 2) not null default 10,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null,
  constraint ai_cap_one_row check (id),
  constraint ai_cap_range check (daily_cap_sek between 0 and 1000)
);

insert into public.ai_cap (id, daily_cap_sek) values (true, 10);

alter table public.ai_cap enable row level security;
revoke all on table public.ai_cap from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_cap to service_role;

create function public.ai_household_exempt(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_member as m
    join public.app_owner as o on o.user_id = m.user_id
    where m.household_id = hid
  );
$$;

-- The first instant of today in Stockholm.
create function public.ai_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
$$;

-- The first instant of this month in Stockholm.
create function public.ai_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm';
$$;

create function public.ai_cap_status()
returns table (cap_sek numeric, exempt boolean, model text, input_tokens bigint, output_tokens bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.daily_cap_sek,
    public.ai_household_exempt(me.hid),
    u.model,
    coalesce(sum(u.input_tokens), 0)::bigint,
    coalesce(sum(u.output_tokens), 0)::bigint
  from public.ai_cap as c
  cross join (select public.my_household_id() as hid) as me
  left join public.ai_usage as u on u.household_id = me.hid and u.created_at >= public.ai_day_start()
  group by c.daily_cap_sek, me.hid, u.model;
$$;

create function public.ai_cap_households()
returns table (
  household_id uuid,
  name text,
  members text,
  exempt boolean,
  cap_sek numeric,
  model text,
  day_input_tokens bigint,
  day_output_tokens bigint,
  month_input_tokens bigint,
  month_output_tokens bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  return query
    select
      h.id,
      h.name,
      coalesce((select string_agg(m.display_name, ', ' order by m.joined_at) from public.household_member as m where m.household_id = h.id), ''),
      public.ai_household_exempt(h.id),
      (select c.daily_cap_sek from public.ai_cap as c),
      u.model,
      coalesce(sum(u.input_tokens) filter (where u.created_at >= public.ai_day_start()), 0)::bigint,
      coalesce(sum(u.output_tokens) filter (where u.created_at >= public.ai_day_start()), 0)::bigint,
      coalesce(sum(u.input_tokens), 0)::bigint,
      coalesce(sum(u.output_tokens), 0)::bigint
    from public.household as h
    left join public.ai_usage as u on u.household_id = h.id and u.created_at >= public.ai_month_start()
    group by h.id, h.name, u.model
    order by h.name, h.id, u.model;
end;
$$;

create function public.set_ai_cap(new_cap numeric)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved numeric;
begin
  if not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  if new_cap is null or new_cap < 0 or new_cap > 1000 then
    raise exception 'the cap is 0 to 1000 kronor' using errcode = '22023';
  end if;
  update public.ai_cap
  set daily_cap_sek = round(new_cap, 2), updated_at = now(), updated_by = (select auth.uid())
  where id
  returning daily_cap_sek into saved;
  return saved;
end;
$$;

revoke all on function public.ai_household_exempt(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ai_day_start() from public, anon, authenticated, service_role;
revoke all on function public.ai_month_start() from public, anon, authenticated, service_role;
revoke all on function public.ai_cap_status() from public, anon, authenticated, service_role;
revoke all on function public.ai_cap_households() from public, anon, authenticated, service_role;
revoke all on function public.set_ai_cap(numeric) from public, anon, authenticated, service_role;

grant execute on function public.ai_cap_status() to authenticated;
grant execute on function public.ai_cap_households() to authenticated;
grant execute on function public.set_ai_cap(numeric) to authenticated;
