-- Lappen på kylskåpet (Story 24.1, Epic 24; the mockup hushallet.html,
-- section 6, decisions 5, 11 and 12 with their defaults).
--
-- A member writes a short note to the others in the household ("Sugen på
-- fisksoppa idag, kan du handla?"). The others see it at the top of the app
-- until someone marks it Klar, for at most 7 days. Push (Epic 23) comes later.
--
--   1. household_note: the household's notes. household_id as on every table
--      of the app's data (21.2a: default my_household_id(), household_fill,
--      household_row_guard, the same two policies), user_id is the author (the
--      caller, never chosen: insert is granted on the content columns only),
--      text 1-280 characters, an optional mood (the five emoji of the mockup),
--      the buttons the author kept (at most 3, found by rules in the app, no
--      AI), done_at/done_by (Klar, with Ångra) and reply_to (Svara).
--   2. household_note_before_insert: at most 20 notes a day per member (MK429),
--      and the household's old notes are cleared on the way (no cron): done
--      for a day, or older than 7 days. Nothing reads them after that.
--   3. household_note_done: Klar and its Ångra. Only done_at may be changed by
--      a member (update is granted on done_at only); the trigger stamps the
--      time and the member who pressed it, so no client names someone else.
--
-- Additive: one new table, an enum and two trigger functions.

set local lock_timeout = '5s';

-- The mood the author chose (decision: optional; 24.2's avatar will take its
-- look from it): 😊 happy, 😍 love, 😋 yum, 😤 cross, 😩 weary.
create type public.household_note_mood as enum ('happy', 'love', 'yum', 'cross', 'weary');

create table public.household_note (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household_id() references public.household (id) on delete cascade,
  -- The author; a deleted account leaves the note with "Någon" as sender.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  text text not null,
  mood public.household_note_mood,
  -- [{ "kind": "plan", "recipeId": uuid, "title": text } | { "kind": "list" }], in order.
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  -- The note this one answers (Svara); cleared when that note is cleared away.
  reply_to uuid,
  constraint household_note_text_check check (text = btrim(text) and char_length(text) between 1 and 280),
  constraint household_note_actions_check
    check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 3 and octet_length(actions::text) <= 2000),
  constraint household_note_done_check check (done_by is null or done_at is not null),
  constraint household_note_id_household_key unique (id, household_id),
  -- A reply is always to a note of the same household.
  constraint household_note_reply_to_fkey foreign key (reply_to, household_id)
    references public.household_note (id, household_id) on delete set null (reply_to)
);

-- What the app reads: the household's open notes, newest first.
create index household_note_household_idx on public.household_note (household_id, created_at desc);
-- The limit: a member's notes of the last day.
create index household_note_user_idx on public.household_note (user_id, created_at) where user_id is not null;
create index household_note_reply_to_idx on public.household_note (reply_to) where reply_to is not null;

alter table public.household_note enable row level security;

-- The same two policies as every table of the household's data (21.2a).
create policy household_note_household_rows on public.household_note
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy household_note_insert_as_self on public.household_note
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- A member reads the household's notes, writes one as themselves (the content
-- only) and changes nothing but done_at. Nobody deletes through the API: the
-- trigger below clears old notes. Never anon.
revoke all on table public.household_note from public, anon, authenticated, service_role;
grant select on table public.household_note to authenticated;
grant insert (text, mood, actions, reply_to) on table public.household_note to authenticated;
grant update (done_at) on table public.household_note to authenticated;
grant select, insert, update, delete on table public.household_note to service_role;

create trigger household_fill before insert on public.household_note
  for each row execute function public.household_fill();
create trigger household_row_guard before update on public.household_note
  for each row execute function public.household_row_guard();

-- 2. The limit, and the clearing of old notes ------------------------------------

-- How many notes a member may write in a day.
create function public.household_note_daily_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 20 $$;

create function public.household_note_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only a signed-in caller is limited; the service role (tests, scripts) is
  -- not. One author at a time, so two concurrent notes cannot both slip under.
  if (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended('household_note:' || new.user_id::text, 0));
    if (
      select count(*) from public.household_note as n
      where n.user_id = new.user_id and n.created_at > now() - interval '1 day'
    ) >= public.household_note_daily_limit() then
      raise exception 'too many notes' using errcode = 'MK429';
    end if;
  end if;
  -- The household's notes nobody will see again: done for a day, or older than
  -- 7 days. A done note stays a day, so the limit above still counts it.
  delete from public.household_note as n
  where n.household_id = new.household_id
    and (n.created_at < now() - interval '7 days' or n.done_at < now() - interval '1 day');
  return new;
end;
$$;

revoke all on function public.household_note_before_insert() from public, anon, authenticated, service_role;
revoke all on function public.household_note_daily_limit() from public, anon, authenticated, service_role;

-- After household_fill (triggers of the same kind run in name order), so the
-- household is known for the service role's inserts too.
create trigger household_note_before_insert before insert on public.household_note
  for each row execute function public.household_note_before_insert();

-- 3. Klar, and its Ångra ------------------------------------------------------------

create function public.household_note_done()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.done_at is null then
    -- Ångra: open again.
    new.done_by := null;
  elsif old.done_at is null then
    -- Klar: now, by the caller, whatever time the client sent.
    new.done_at := now();
    new.done_by := caller;
  else
    -- Already done: stays as it was.
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

revoke all on function public.household_note_done() from public, anon, authenticated, service_role;

create trigger household_note_done before update on public.household_note
  for each row execute function public.household_note_done();
