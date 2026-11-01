-- Story 20.3: Tyck till och inkorg. Anyone signed in can suggest a feature,
-- report a problem or rate the app; only the app's owner can read it, in an
-- inbox under Inställningar. Additive: two new tables and two new functions;
-- nothing existing changes.
--
-- Who the owner is (AD-4, no service role in the app): the database cannot read
-- Vercel's environment, so the owner's address lives in the table app_owner,
-- which nobody but the service role can read or write. `pnpm owner:sync` writes
-- OWNER_EMAIL there (docs/molnet.md, step 5); the app reads OWNER_EMAIL only to
-- show the owner's first name ("Pontus ser texten …"), never to decide access.
-- Access is decided here, by is_app_owner(), which RLS and Inställningar share.
--
-- 1. app_owner: the owners' addresses, lowercased. RLS on and no policy, and
--    no grant to anon or authenticated: no client can read or change it.
-- 2. is_app_owner(): true when the signed-in user's confirmed address in
--    auth.users is in app_owner. Security definer, since the caller can read
--    neither table; it answers only for the caller and reveals nothing else.
-- 3. feedback: one row per idea, rating or problem. Every signed-in user may
--    add rows as themselves (insert grant on the content columns only, so
--    user_id, sender_email, created_at and read_at cannot be chosen); only the
--    owner may read rows and change read_at. Nobody may delete through the API;
--    a user's rows go with the user (on delete cascade).
-- 4. feedback_before_insert: fills in sender_email from auth.users, so the
--    inbox can name the sender without reading auth.users, and limits a
--    signed-in user to 10 rows an hour and 30 a day (MK429).

create table public.app_owner (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint app_owner_email_check check (
    email = lower(btrim(email)) and char_length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
  )
);

alter table public.app_owner enable row level security;

revoke all on table public.app_owner from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.app_owner to service_role;

create function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    join public.app_owner as o on o.email = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function public.is_app_owner() from public, anon, authenticated;
grant execute on function public.is_app_owner() to authenticated, service_role;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- The sender's address when it was sent (set by the trigger, never by the client).
  sender_email text not null default '',
  kind text not null,
  stars smallint,
  body text not null default '',
  -- The help area it is about (Recept … Konto), optional.
  area text,
  -- The page the sender came from, e.g. /lista.
  page text,
  app_version text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint feedback_kind_check check (kind in ('idea', 'rating', 'problem')),
  constraint feedback_stars_check check (
    (kind = 'rating' and stars is not null and stars between 1 and 5) or (kind <> 'rating' and stars is null)
  ),
  constraint feedback_body_check check (char_length(body) <= 2000 and (kind = 'rating' or btrim(body) <> '')),
  constraint feedback_area_check check (
    area is null or area in ('recept', 'matsedel', 'inkopslista', 'matvaror', 'forrad', 'konto')
  ),
  constraint feedback_page_check check (page is null or (char_length(page) <= 200 and page ~ '^/[^[:space:]]*$')),
  constraint feedback_app_version_check check (app_version is null or char_length(app_version) <= 40)
);

create index feedback_user_created_idx on public.feedback (user_id, created_at);
create index feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Everyone adds their own rows; nobody adds a row in another's name.
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Only the owner reads, the sender included (Beslut 5: no "my messages" view).
create policy feedback_owner_reads on public.feedback
  for select to authenticated
  using ((select public.is_app_owner()));

-- Only the owner marks rows read (the grant below allows read_at only).
create policy feedback_owner_marks_read on public.feedback
  for update to authenticated
  using ((select public.is_app_owner()))
  with check ((select public.is_app_owner()));

revoke all on table public.feedback from public, anon, authenticated, service_role;
grant select on table public.feedback to authenticated;
grant insert (kind, stars, body, area, page, app_version) on table public.feedback to authenticated;
grant update (read_at) on table public.feedback to authenticated;
grant select, insert, update, delete on table public.feedback to service_role;

create function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_email := coalesce((select u.email from auth.users as u where u.id = new.user_id), '');
  -- Only a signed-in caller is limited; a script with the service role (pnpm
  -- move:cloud) copies rows without a session. One sender at a time, so two
  -- concurrent inserts cannot both slip under the limit.
  if (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
    if (select count(*) from public.feedback as f where f.user_id = new.user_id and f.created_at > now() - interval '1 hour') >= 10
      or (select count(*) from public.feedback as f where f.user_id = new.user_id and f.created_at > now() - interval '1 day') >= 30
    then
      raise exception 'too many feedback messages' using errcode = 'MK429';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.feedback_before_insert() from public, anon, authenticated;

create trigger feedback_before_insert before insert on public.feedback
  for each row execute function public.feedback_before_insert();
