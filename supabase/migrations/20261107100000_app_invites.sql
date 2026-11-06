-- Bjud in ett hushåll från appen (Story 21.1, Epic 21). The app's owner (the
-- row of app_owner, Story 20.3) invites an e-mail address from Inställningar,
-- so ALLOWED_EMAILS in Vercel need not change for each new household.
--
-- 1. app_invite: one row per invited address, and the database's allow list.
--    The row holds the address (lower case), the sha256 hash of the code (never
--    the code), when the code expires, and, once the person has made or used an
--    account with the code, used_by: the user id. Access is bound to that id,
--    never to the address (an address can be changed by its user), and the row
--    going away (removing the invitation) ends the access. The address binding
--    does NOT prove that the person owns the mailbox (e-mail confirmation is off):
--    it only stops guessing and forwarding to another address. The code is the
--    real secret, so whoever has the link and the address can sign up. RLS on and no
--    policy, no grant to anon or authenticated: no client reads or writes the
--    table; the owner works through the functions below, which check
--    is_app_owner(), and the app needs no service role.
-- 2. create_app_invite / app_invites / remove_app_invite: owner only (42501
--    for anyone else). The code is 8 characters of the household codes'
--    alphabet, valid 7 days, given back once. Inviting an address again gives
--    a new code while it is not used; one that is used is refused (MK461); two
--    first invitations for one address at once give MK463 (try again).
-- 3. app_invite_preview(code): anon and signed in, what the join page shows
--    (ok, gone, unknown, locked); wrong codes count in household_code_attempt.
-- 4. claim_app_invite(code): the signed-in person whose address the invitation
--    names uses it up (sets used_by); false otherwise (a wrong code counts).
-- 5. app_invite_open(code, email): the open invitation for this code and address.
-- 6. app_invited_access(): whether the caller is in a household where someone
--    has an app invitation that is used. The app lets a person in when their
--    address is in ALLOWED_EMAILS, or this is true, or the household has someone
--    on ALLOWED_EMAILS (Story 21.2b): removing the invitation takes access from
--    the person and from the members who got in only through them.
-- 7. household_signup_hook: a sign-up also passes with an open app invitation
--    code (user_metadata.app_invite_code) for the address signing up, and
--    nothing else; the household code still works as before.
--
-- Every function is security definer with search_path '' and revoked from
-- public; the hook is for supabase_auth_admin only, the rest for authenticated
-- (the preview also for anon).

set local lock_timeout = '5s';

-- The app's codes come from pgcrypto's random bytes (the household codes' generator is left as it was).
create extension if not exists pgcrypto with schema extensions;

create table public.app_invite (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users on delete set null,
  used_at timestamptz,
  constraint app_invite_email_check check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email like '%_@_%'),
  constraint app_invite_used_check check (used_by is null or used_at is not null)
);

create unique index app_invite_email_idx on public.app_invite (email);
create unique index app_invite_code_idx on public.app_invite (code_hash);
create index app_invite_used_by_idx on public.app_invite (used_by) where used_by is not null;

alter table public.app_invite enable row level security;
revoke all on table public.app_invite from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.app_invite to service_role;

-- The open invitation (not used, not expired) with this code for this address, or null.
create function public.app_invite_open(code text, who text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id from public.app_invite as i
  where i.code_hash = public.household_invite_hash(code)
    and i.email = lower(btrim(coalesce(who, '')))
    and i.used_by is null and i.expires_at > now();
$$;

create function public.create_app_invite(invite_email text)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := lower(btrim(coalesce(invite_email, '')));
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  made text;
  bytes bytea;
  pick integer;
  i integer;
  existing public.app_invite;
begin
  if not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  if char_length(clean) not between 3 and 254 or clean not like '%_@_%' or clean ~ '[[:space:],;<>]' then
    raise exception 'not an address' using errcode = '22023';
  end if;
  if (select count(*) from public.app_invite as v) >= 200 then
    raise exception 'too many invitations' using errcode = 'MK462';
  end if;
  select * into existing from public.app_invite as v where v.email = clean for update;
  if existing.used_by is not null then
    raise exception 'already invited' using errcode = 'MK461';
  end if;
  loop
    made := '';
    while char_length(made) < 8 loop
      bytes := extensions.gen_random_bytes(16);
      for i in 0..15 loop
        pick := get_byte(bytes, i);
        -- 248 = 8 * 31: the bytes above it would favour the first characters.
        if pick < 248 and char_length(made) < 8 then
          made := made || substr(alphabet, pick % 31 + 1, 1);
        end if;
      end loop;
    end loop;
    exit when not exists (select 1 from public.app_invite as v where v.code_hash = public.household_invite_hash(made));
  end loop;
  if existing.id is not null then
    return query
      update public.app_invite as v set code_hash = public.household_invite_hash(made), expires_at = now() + interval '7 days', created_by = me
      where v.id = existing.id
      returning v.id, made, v.expires_at;
  else
    begin
      return query
        insert into public.app_invite as v (email, code_hash, created_by, expires_at)
        values (clean, public.household_invite_hash(made), me, now() + interval '7 days')
        returning v.id, made, v.expires_at;
    exception when unique_violation then
      -- Two first invitations for the same address at the same moment: the other one won.
      raise exception 'invited at the same time' using errcode = 'MK463';
    end;
  end if;
end;
$$;

create function public.app_invites()
returns table (id uuid, email text, created_at timestamptz, expires_at timestamptz, accepted boolean)
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
    select v.id, v.email, v.created_at, v.expires_at, v.used_by is not null
    from public.app_invite as v order by v.created_at desc, v.id;
end;
$$;

-- Removes an invitation: the person (and the members who got in only through
-- them) loses access at their next request. False when there was none.
create function public.remove_app_invite(invite_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  if not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  delete from public.app_invite as v where v.id = invite_id;
  get diagnostics gone = row_count;
  return gone > 0;
end;
$$;

create function public.app_invite_preview(code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  found_invite public.app_invite;
begin
  if public.household_code_locked() then
    return jsonb_build_object('status', 'locked');
  end if;
  select * into found_invite from public.app_invite as v where v.code_hash = public.household_invite_hash(code);
  if found_invite.id is null then
    insert into public.household_code_attempt (user_id) values (auth.uid());
    return jsonb_build_object('status', 'unknown');
  end if;
  return jsonb_build_object(
    'status', case when found_invite.used_by is null and found_invite.expires_at > now() then 'ok' else 'gone' end,
    'expires_at', found_invite.expires_at
  );
end;
$$;

-- The signed-in person uses the invitation up; it must name their address.
create function public.claim_app_invite(code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mine text;
  invite public.app_invite;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.household_code_locked() then
    raise exception 'too many wrong codes' using errcode = 'MK451';
  end if;
  select lower(btrim(u.email)) into mine from auth.users as u where u.id = me;
  select * into invite from public.app_invite as v
  where v.id = public.app_invite_open(code, mine)
    and v.used_by is null and v.expires_at > now()
  for update;
  if invite.id is null then
    insert into public.household_code_attempt (user_id) values (me);
    return false;
  end if;
  update public.app_invite as v set used_by = me, used_at = now() where v.id = invite.id;
  return true;
end;
$$;

create function public.app_invited_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_member as mine
    join public.household_member as m on m.household_id = mine.household_id
    join public.app_invite as i on i.used_by = m.user_id
    where mine.user_id = (select auth.uid())
  );
$$;

revoke all on function public.app_invite_open(text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_app_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.app_invites() from public, anon, authenticated, service_role;
revoke all on function public.remove_app_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.app_invite_preview(text) from public, anon, authenticated, service_role;
revoke all on function public.claim_app_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.app_invited_access() from public, anon, authenticated, service_role;

grant execute on function public.create_app_invite(text) to authenticated;
grant execute on function public.app_invites() to authenticated;
grant execute on function public.remove_app_invite(uuid) to authenticated;
grant execute on function public.app_invite_preview(text) to anon, authenticated;
grant execute on function public.claim_app_invite(text) to authenticated;
grant execute on function public.app_invited_access() to authenticated;

-- 7. The sign-up hook: also an open app invitation for the address signing up.
create or replace function public.household_signup_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.household_open_invite(event -> 'user' -> 'user_metadata' ->> 'invite_code') is not null
    or public.app_invite_open(event -> 'user' -> 'user_metadata' ->> 'app_invite_code', event -> 'user' ->> 'email') is not null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Inbjudan gäller inte längre.')
  );
end;
$$;
