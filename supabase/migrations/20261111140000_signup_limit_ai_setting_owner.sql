-- Security review 2026-11-11, findings S-07 and S-09.
--
-- S-09, the sign-up hook. household_signup_hook let every sign-up with an open
-- household code through, and the code is used up only when someone joins with
-- it (accept_household_invite), so one valid code could make any number of
-- accounts by calling Supabase Auth directly, with any unconfirmed address,
-- also an address the owner has invited from the app.
--   1. household_invite.signup_count: the accounts the hook has let through
--      with the code. Added with a default, nothing else of the table changes.
--   2. household_signup_limit(): 3. An invitation is for one person; three
--      leaves room for a typo in the address or a sign-up that fails after
--      the hook, and stops a code from making accounts in bulk.
--   3. household_signup_hook, replaced (same name, same signature, same
--      grants, so config.toml and the cloud's hook setting need no change):
--      - an open app invitation for the address signing up passes, as before
--        (it is bound to the address, and an address has only one account);
--      - a household code must be open (as before), the address must not be
--        on the owner's allow list (any row of app_invite: that address gets
--        its account with its own app invitation, never with someone's
--        household code), and the code must have let fewer than
--        household_signup_limit() accounts through; the count goes up by one
--        in the same statement that checks it, so two sign-ups at once
--        cannot both take the last place;
--      - everything else is refused with 403 "Inbjudan gäller inte längre."
--        (the app shows "Inbjudan gäller inte längre. Be om en ny."), the
--        same answer for every refusal, so it tells no one whether an address
--        is invited;
--      - an error inside the hook refuses with 500 "Det gick inte att skapa
--        kontot just nu." instead of letting the sign-up through.
--
-- S-07, the AI choice. Every member of a household could write the
-- household's ai_setting row through PostgREST (RLS allowed it), and so pick
-- the dearest model and level for the owner's AI jobs; the password and
-- AI_SETTINGS_EMAILS were checked only in the server action.
--   4. set_ai_setting(provider, model, effort) and clear_ai_setting(): the only
--      way to write the row, for the app's owner only (is_app_owner(), 42501
--      for anyone else, also for a session without a user), on the caller's
--      own household (my_household_id()). The table's checks still apply.
--   5. insert, update and delete on ai_setting are revoked from
--      authenticated; select stays, so reading the choice (and the jobs that
--      use it) works as before. Its policies stay as they are.
--
-- Every function is security definer with search_path '' and revoked from
-- public. Idempotent: `if not exists`, `create or replace`, and grants and
-- revokes that may run again.

set local lock_timeout = '5s';

-- 1. The count ---------------------------------------------------------------------------

alter table public.household_invite add column if not exists signup_count integer not null default 0;

-- 2. The limit ---------------------------------------------------------------------------

create or replace function public.household_signup_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 3 $$;

revoke all on function public.household_signup_limit() from public, anon, authenticated, service_role;

-- 3. The sign-up hook --------------------------------------------------------------------

create or replace function public.household_signup_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  who text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  household_code text := event -> 'user' -> 'user_metadata' ->> 'invite_code';
  app_code text := event -> 'user' -> 'user_metadata' ->> 'app_invite_code';
  invite uuid;
  refused constant jsonb := jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Inbjudan gäller inte längre.')
  );
begin
  begin
    if app_code is not null and public.app_invite_open(app_code, who) is not null then
      return '{}'::jsonb;
    end if;
    invite := public.household_open_invite(household_code);
    if invite is null or who = '' then
      return refused;
    end if;
    if exists (select 1 from public.app_invite as i where i.email = who) then
      return refused;
    end if;
    update public.household_invite as v set signup_count = v.signup_count + 1
    where v.id = invite and v.signup_count < public.household_signup_limit();
    if not found then
      return refused;
    end if;
    return '{}'::jsonb;
  exception when others then
    -- Never let a sign-up through on an error; say so instead of failing without a message.
    raise log 'household_signup_hook failed: %', sqlstate;
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 500, 'message', 'Det gick inte att skapa kontot just nu.')
    );
  end;
end;
$$;

revoke all on function public.household_signup_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.household_signup_hook(jsonb) to supabase_auth_admin;

-- 4. Writing the AI choice ------------------------------------------------------------------

create or replace function public.set_ai_setting(new_provider text, new_model text, new_effort text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hid uuid;
begin
  if me is null or not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  hid := public.my_household_id();
  if hid is null then
    raise exception 'no household' using errcode = '42501';
  end if;
  insert into public.ai_setting as s (household_id, user_id, provider, model, effort, updated_at)
  values (hid, me, new_provider, new_model, new_effort, now())
  on conflict (household_id) do update
    set provider = excluded.provider, model = excluded.model, effort = excluded.effort, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.clear_ai_setting()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  gone integer;
begin
  if auth.uid() is null or not public.is_app_owner() then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  delete from public.ai_setting as s where s.household_id = public.my_household_id();
  get diagnostics gone = row_count;
  return gone > 0;
end;
$$;

revoke all on function public.set_ai_setting(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.clear_ai_setting() from public, anon, authenticated, service_role;
grant execute on function public.set_ai_setting(text, text, text) to authenticated;
grant execute on function public.clear_ai_setting() to authenticated;

-- 5. No direct writes ---------------------------------------------------------------------

revoke insert, update, delete on table public.ai_setting from authenticated;
