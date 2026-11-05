-- Push-notiser med inställningar (Story 23.3, Epic 23).
--
-- A member turns notifications on per device and chooses what they want: new
-- items on the shopping list, new cards in Förråd, a changed meal plan and
-- notes (Lappar). Changes made in the household are collected for a short
-- while and sent as one ("3 nya varor på listan") to everyone but the person
-- who made them. The app sends from Vercel with the caller's own session (the
-- service role is never in Vercel, docs/molnet.md), so the queue and the
-- recipients are read through two functions that work on the caller's own
-- household only.
--
--   1. push_subscription: one row per device (the browser's endpoint and keys).
--      A person's own rows, like api_key and welcome_tour (no household_id).
--      Written through save_push_subscription (an endpoint that moves to
--      another account on the same device is taken over), read and removed by
--      its owner.
--   2. push_preference: one row per person with what they want. No row means
--      the defaults: list and notes on, Förråd and meal plan off.
--   3. push_event: the queue. A trigger on the tables whose changes are told
--      adds one row per change (kind, household, who made it); nobody reads or
--      writes it through the API. No foreign key to household, so removing a
--      household never waits on it; old rows are cleared on the way.
--   4. claim_push_batches(): takes the household's changes that have been
--      quiet for 90 seconds (or waited 5 minutes) off the queue, and returns
--      one row per recipient device and kind: the count, never the content,
--      except a single note (its text and the author's name, for the
--      notification itself).
--   5. drop_push_subscriptions(): removes devices the push service refused
--      (404/410), among the household's members.
--
-- Additive: three tables and functions; nothing existing changes, so the app
-- before this migration keeps working against it.

set local lock_timeout = '5s';

-- 1. Devices ---------------------------------------------------------------------

create table public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscription_endpoint_key unique (endpoint),
  -- Only the browsers' own push services, so the server never posts to another host.
  constraint push_subscription_endpoint_check check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]*push\.services\.mozilla\.com)/[^\s]*$'
  ),
  constraint push_subscription_keys_check check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 200)
);

create index push_subscription_user_idx on public.push_subscription (user_id);

alter table public.push_subscription enable row level security;

create policy push_subscription_own_rows on public.push_subscription
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A person reads, adds and removes their own devices (an endpoint that is already
-- another account's goes through save_push_subscription).
revoke all on table public.push_subscription from public, anon, authenticated, service_role;
grant select, delete on table public.push_subscription to authenticated;
grant insert (endpoint, p256dh, auth) on table public.push_subscription to authenticated;
grant select, insert, update, delete on table public.push_subscription to service_role;

-- 2. What a person wants ----------------------------------------------------------

create table public.push_preference (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lista boolean not null default true,
  forrad boolean not null default false,
  matsedel boolean not null default false,
  lappar boolean not null default true,
  created_at timestamptz not null default now(),
  constraint push_preference_user_key unique (user_id)
);

alter table public.push_preference enable row level security;

create policy push_preference_own_rows on public.push_preference
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.push_preference from public, anon, authenticated, service_role;
grant select on table public.push_preference to authenticated;
grant insert (lista, forrad, matsedel, lappar) on table public.push_preference to authenticated;
grant update (lista, forrad, matsedel, lappar) on table public.push_preference to authenticated;
grant select, insert, update, delete on table public.push_preference to service_role;

-- 3. The queue ---------------------------------------------------------------------

create table public.push_event (
  seq bigint generated always as identity primary key,
  household_id uuid not null,
  kind text not null,
  -- Who made the change; empty when the database did (a shortcut, a script).
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint push_event_kind_check check (kind in ('lista', 'forrad', 'matsedel', 'lappar'))
);

create index push_event_household_idx on public.push_event (household_id, kind, created_at);

-- RLS on and no policy: only the functions below (and the service role) touch it.
alter table public.push_event enable row level security;
revoke all on table public.push_event from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.push_event to service_role;

-- Adds one event for a change, when someone else in the household has a device
-- that could be told. The kind is the trigger's argument.
create function public.push_event_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := case when tg_op = 'DELETE' then old.household_id else new.household_id end;
  actor uuid := (select auth.uid());
begin
  if hid is not null and exists (
    select 1
    from public.household_member as m
    join public.push_subscription as s on s.user_id = m.user_id
    where m.household_id = hid and s.user_id is distinct from actor
  ) then
    insert into public.push_event (household_id, kind, actor_id) values (hid, tg_argv[0], actor);
    -- Nobody reads a day-old change.
    delete from public.push_event where created_at < now() - interval '1 day';
  end if;
  return null;
end;
$$;

revoke all on function public.push_event_enqueue() from public, anon, authenticated, service_role;

create trigger push_event_enqueue after insert on public.shopping_custom_item
  for each row execute function public.push_event_enqueue('lista');
create trigger push_event_enqueue after insert on public.thing_photo
  for each row execute function public.push_event_enqueue('forrad');
create trigger push_event_enqueue after insert on public.household_note
  for each row execute function public.push_event_enqueue('lappar');
create trigger push_event_enqueue after insert or delete on public.meal_plan_recipe
  for each row execute function public.push_event_enqueue('matsedel');
create trigger push_event_enqueue_weekday after update of weekday on public.meal_plan_recipe
  for each row when (old.weekday is distinct from new.weekday)
  execute function public.push_event_enqueue('matsedel');

-- 4. Taking a batch ---------------------------------------------------------------

-- The caller's household's changes that are due: quiet for `quiet`, or the
-- oldest has waited `max_wait`. They leave the queue in this one statement, so
-- two senders never send the same batch. One row per device of each member who
-- wants that kind and did not make every change in it. `n` is the number of
-- changes by others; `note_text` and `actor_name` come only for a single note.
create function public.claim_push_batches(quiet interval default interval '90 seconds', max_wait interval default interval '5 minutes')
returns table (
  user_id uuid, endpoint text, p256dh text, auth text, kind text, n integer, actor_name text, note_text text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    return;
  end if;
  return query
  with due as (
    select e.kind from public.push_event as e
    where e.household_id = hid
    group by e.kind
    having max(e.created_at) <= now() - quiet or min(e.created_at) <= now() - max_wait
  ),
  taken as (
    delete from public.push_event as e
    using due
    where e.household_id = hid and e.kind = due.kind
    returning e.kind, e.actor_id
  ),
  batches as (
    select m.user_id as recipient, t.kind as batch_kind, count(*)::integer as changes,
      count(distinct t.actor_id) as makers, min(t.actor_id::text)::uuid as maker
    from taken as t
    join public.household_member as m on m.household_id = hid
    left join public.push_preference as p on p.user_id = m.user_id
    where t.actor_id is distinct from m.user_id
      and case t.kind
        when 'lista' then coalesce(p.lista, true)
        when 'forrad' then coalesce(p.forrad, false)
        when 'matsedel' then coalesce(p.matsedel, false)
        else coalesce(p.lappar, true)
      end
    group by m.user_id, t.kind
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth, b.batch_kind, b.changes,
    case when b.batch_kind = 'lappar' and b.changes = 1 and b.makers = 1
      then (select a.display_name from public.household_member as a where a.household_id = hid and a.user_id = b.maker) end,
    case when b.batch_kind = 'lappar' and b.changes = 1 and b.makers = 1
      then (select left(n.text, 120) from public.household_note as n
            where n.household_id = hid and n.user_id = b.maker order by n.created_at desc limit 1) end
  from batches as b
  join public.push_subscription as s on s.user_id = b.recipient;
end;
$$;

revoke all on function public.claim_push_batches(interval, interval) from public, anon, authenticated, service_role;
grant execute on function public.claim_push_batches(interval, interval) to authenticated;

-- 5. Devices ---------------------------------------------------------------------

-- Turns notifications on for this device as the caller. An endpoint already
-- saved by another account on the same device moves to the caller.
create function public.save_push_subscription(device_endpoint text, device_p256dh text, device_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscription (user_id, endpoint, p256dh, auth)
  values (caller, device_endpoint, device_p256dh, device_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- Removes devices the push service refused (404/410), among the caller's
-- household's members. Returns how many went.
create function public.drop_push_subscriptions(endpoints text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.push_subscription as s
  where s.endpoint = any (endpoints)
    and s.user_id in (select m.user_id from public.household_member as m where m.household_id = public.my_household_id());
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.drop_push_subscriptions(text[]) from public, anon, authenticated, service_role;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.drop_push_subscriptions(text[]) to authenticated;
