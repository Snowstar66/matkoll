-- Tak för AI-kostnad, hardened (security review 2026-11-11, findings S-01, S-02 and S-03).
--
-- S-01: a call that was aborted, timed out or failed left no ai_usage row, though the provider may
-- still bill it. S-02: the cap was read before a call and the cost written after it, so N parallel
-- calls at 9,99 kr all got through. S-03: a member could insert ai_usage rows straight through the
-- API (for instance a flood of 0-token rows that makes the day's sum slow).
--
-- The fix: before each model call the app reserves the call's worst case as placeholder rows in
-- ai_usage, and after it replaces them with what the call really used (or, after an abort, an
-- estimate of what was sent). A placeholder counts towards the day's spend like any row, in every
-- existing function (ai_cap_status, ai_cap_households, ai_usage_month), so a call that never
-- settles (a killed function) stays counted at its worst case. Prices stay in code, so the app
-- decides: the reservation answers the household's tokens per model today *before* this call's
-- placeholders, and the app releases the placeholders and answers ai_cap_reached when that is
-- already at the cap. Reservations of one household are taken one at a time (an advisory lock
-- held to the end of the reservation's transaction), so each one sees every earlier placeholder.
--
-- 1. ai_usage_reservation: which ai_usage rows are placeholders, under which reservation id. RLS
--    on, no policy, no grant to anon or authenticated: no client reads it, so a reservation id is
--    known only to the server call that made it.
-- 2. ai_usage_check_rows(usage, min_rows): internal; 22023 unless `usage` is a JSON array of
--    min_rows to 5 objects {model: 1-100 chars, input_tokens and output_tokens: whole numbers
--    0-100 000 000}.
-- 3. ai_usage_reserve(usage): the caller's household (my_household_id()) and the caller
--    (auth.uid()) only. Returns {reservation, cap_sek, exempt, usage, too_many}: `usage` is the
--    household's tokens per model today before this reservation (empty for an exempt household,
--    which the cap never stops and whose rows are not summed). A household that is not exempt and
--    already has 2000 rows today gets too_many = true and no reservation (a bound on the sum).
-- 4. ai_usage_settle(reservation, usage): replaces the reservation's placeholders with `usage` (0 to
--    5 rows; none releases it), in the placeholders' household, as the caller. Only the member
--    whose session made the reservation can settle it, once; false when there is nothing to settle.
-- 5. ai_cap_exempt(): whether the caller's household is exempt from the cap, without summing
--    anything, so the app's gate can let an exempt household through when the sum cannot be read
--    and stop every other one (fails closed).
-- 6. S-03: insert on ai_usage is revoked from authenticated; every row is now written by the two
--    functions above (security definer). Members still read their household's rows.
--
-- Additive and idempotent: a new table, new functions, one revoke. Every existing function, table,
-- policy and grant is left as it was, except that a signed-in client can no longer insert into
-- ai_usage itself (the app from before this migration did; the deploy that carries this migration
-- does not). Rollback: grant insert on table public.ai_usage to authenticated; drop the functions
-- ai_cap_exempt, ai_usage_settle, ai_usage_reserve, ai_usage_check_rows; drop table
-- public.ai_usage_reservation (the placeholder rows stay in ai_usage, at their estimate).

set local lock_timeout = '5s';

create table if not exists public.ai_usage_reservation (
  usage_id uuid primary key references public.ai_usage (id) on delete cascade,
  reservation_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_reservation_reservation_id_idx on public.ai_usage_reservation (reservation_id);

alter table public.ai_usage_reservation enable row level security;
revoke all on table public.ai_usage_reservation from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_usage_reservation to service_role;

create or replace function public.ai_usage_check_rows(usage jsonb, min_rows integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if usage is null or jsonb_typeof(usage) is distinct from 'array'
     or jsonb_array_length(usage) < min_rows or jsonb_array_length(usage) > 5 then
    raise exception 'usage is an array of % to 5 rows', min_rows using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(usage) loop
    if jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item -> 'model') is distinct from 'string'
       or char_length(item ->> 'model') not between 1 and 100
       or jsonb_typeof(item -> 'input_tokens') is distinct from 'number'
       or jsonb_typeof(item -> 'output_tokens') is distinct from 'number'
       or (item ->> 'input_tokens')::numeric not between 0 and 100000000
       or (item ->> 'output_tokens')::numeric not between 0 and 100000000
       or (item ->> 'input_tokens')::numeric <> trunc((item ->> 'input_tokens')::numeric)
       or (item ->> 'output_tokens')::numeric <> trunc((item ->> 'output_tokens')::numeric) then
      raise exception 'a usage row is {model, input_tokens, output_tokens}' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.ai_usage_reserve(usage jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid := public.my_household_id();
  cap numeric;
  is_exempt boolean;
  today jsonb := '[]'::jsonb;
  rows_today bigint := 0;
  rid uuid := gen_random_uuid();
begin
  if uid is null or hid is null then
    raise exception 'a signed-in member of a household only' using errcode = '42501';
  end if;
  perform public.ai_usage_check_rows(usage, 1);
  -- One reservation of the household at a time: the next one waits here and then sees this one's rows.
  perform pg_advisory_xact_lock(hashtextextended('public.ai_usage_reserve ' || hid::text, 0));
  select c.daily_cap_sek into cap from public.ai_cap as c where c.id;
  is_exempt := public.ai_household_exempt(hid);
  if not is_exempt then
    select
      coalesce(jsonb_agg(jsonb_build_object('model', t.model, 'input_tokens', t.input_tokens, 'output_tokens', t.output_tokens)), '[]'::jsonb),
      coalesce(sum(t.calls), 0)
    into today, rows_today
    from (
      select u.model, sum(u.input_tokens)::bigint as input_tokens, sum(u.output_tokens)::bigint as output_tokens, count(*) as calls
      from public.ai_usage as u
      where u.household_id = hid and u.created_at >= public.ai_day_start()
      group by u.model
    ) as t;
    if rows_today >= 2000 then
      return jsonb_build_object('reservation', null, 'cap_sek', cap, 'exempt', false, 'usage', '[]'::jsonb, 'too_many', true);
    end if;
  end if;
  with placeholders as (
    insert into public.ai_usage (user_id, household_id, model, input_tokens, output_tokens)
    select uid, hid, r.model, r.input_tokens, r.output_tokens
    from jsonb_to_recordset(usage) as r (model text, input_tokens integer, output_tokens integer)
    returning id
  )
  insert into public.ai_usage_reservation (usage_id, reservation_id)
  select p.id, rid from placeholders as p;
  return jsonb_build_object('reservation', rid, 'cap_sek', cap, 'exempt', is_exempt, 'usage', today, 'too_many', false);
end;
$$;

create or replace function public.ai_usage_settle(reservation uuid, usage jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
  removed integer;
begin
  if uid is null then
    raise exception 'a signed-in user only' using errcode = '42501';
  end if;
  perform public.ai_usage_check_rows(usage, 0);
  select u.household_id into hid
  from public.ai_usage_reservation as r
  join public.ai_usage as u on u.id = r.usage_id
  where r.reservation_id = reservation and u.user_id = uid
  limit 1;
  if hid is null then
    return false;
  end if;
  -- The placeholders go (their reservation rows with them, on delete cascade); a second settle finds none.
  delete from public.ai_usage as u
  using public.ai_usage_reservation as r
  where r.reservation_id = reservation and u.id = r.usage_id and u.user_id = uid;
  get diagnostics removed = row_count;
  if removed = 0 then
    return false;
  end if;
  insert into public.ai_usage (user_id, household_id, model, input_tokens, output_tokens)
  select uid, hid, r.model, r.input_tokens, r.output_tokens
  from jsonb_to_recordset(usage) as r (model text, input_tokens integer, output_tokens integer);
  return true;
end;
$$;

create or replace function public.ai_cap_exempt()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.ai_household_exempt(public.my_household_id()), false);
$$;

revoke all on function public.ai_usage_check_rows(jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.ai_usage_reserve(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ai_usage_settle(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ai_cap_exempt() from public, anon, authenticated, service_role;

grant execute on function public.ai_usage_reserve(jsonb) to authenticated;
grant execute on function public.ai_usage_settle(uuid, jsonb) to authenticated;
grant execute on function public.ai_cap_exempt() to authenticated;

-- S-03: no client writes ai_usage any more (update and delete were revoked by 20261107120000_ai_cap).
revoke insert on table public.ai_usage from authenticated;
