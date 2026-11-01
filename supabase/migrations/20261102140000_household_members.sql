-- Medlemmar och inbjudan (Story 21.2b, Epic 21; the mockup hushallet.html,
-- sections 1-3 and 7, every decision with its default).
--
-- Story 21.2a made every row the household's and left household_invite
-- locked. This migration adds the functions that let people join, leave and
-- run a household, and the sign-up hook that lets a new account be made only
-- with a valid invitation:
--   1. household_member.named_at: when the person said what they are called
--      ("Vad heter du?" is asked once, while it is null).
--   2. household_code_attempt: wrong codes, per account (10 an hour, then the
--      account is locked out of codes for the rest of that hour) and, without
--      an account, for everyone together (the preview on /ga-med).
--   3. The invitation: a code of 6 characters without 0/O, 1/I/L, kept only
--      as its sha256 hash, valid 7 days and for one person. Any member may
--      invite (decision 2); any member may revoke or restore one.
--   4. Joining (accept_household_invite): the membership is deleted and
--      inserted again (never updated), so household_drop_when_empty takes the
--      old household when it is left empty. Decision 10, built as its
--      fallback: an account alone in a household with data of its own cannot
--      join another one (the merge of two households' data is not built); the
--      data of a household with other members stays with them.
--   5. Leaving, removing a member, making someone else owner, renaming the
--      household and setting one's own name. The owner who leaves hands the
--      ownership to the member who has been there longest. Someone alone in a
--      household cannot leave it (nothing to leave).
--   6. The photo files: a file under a place of the caller's household is the
--      household's whoever's folder it lies in, so the files a member who left
--      took there (no row points at them any more after a card is removed)
--      can still be removed by the household.
--   7. The sign-up hook (Supabase Auth "Before User Created"): a sign-up goes
--      through only with a valid invitation code in its user metadata. The
--      service role's admin API (users:sync, the tests) does not run the hook.
--
-- Every function is security definer with search_path '', and only for
-- authenticated (the preview also for anon, the hook only for
-- supabase_auth_admin). No client writes the household tables directly.

set local lock_timeout = '5s';

-- 1. The name, asked once ------------------------------------------------------

alter table public.household_member add column named_at timestamptz;

-- An invitation that was used keeps used_at when the account that used it is
-- deleted (used_by is set null by its foreign key); 21.2a's check asked for
-- both or neither, which made such an account impossible to delete.
alter table public.household_invite drop constraint household_invite_used_check;
alter table public.household_invite add constraint household_invite_used_check check (used_by is null or used_at is not null);

-- 2. Wrong codes ------------------------------------------------------------------

create table public.household_code_attempt (
  id bigint generated always as identity primary key,
  -- The account that tried, or null for the preview without a session.
  user_id uuid references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index household_code_attempt_user_idx on public.household_code_attempt (user_id, attempted_at);
create index household_code_attempt_at_idx on public.household_code_attempt (attempted_at);

alter table public.household_code_attempt enable row level security;
revoke all on table public.household_code_attempt from public, anon, authenticated, service_role;
grant select, insert, delete on table public.household_code_attempt to service_role;

-- How many wrong codes an account may give in an hour, and how many the
-- preview without a session may give in ten minutes, for everyone together.
create function public.household_code_limit()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- The sha256 of a code as the person typed it: spaces and dashes go, letters
-- are capitals ("k7q 4mp" is "K7Q4MP").
create function public.household_invite_hash(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(upper(regexp_replace(coalesce(code, ''), '[[:space:]-]', '', 'g')), 'UTF8')), 'hex');
$$;

-- Whether the caller (or, without a session, everyone together) has given too
-- many wrong codes. Old attempts are cleared on the way.
create function public.household_code_locked()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  delete from public.household_code_attempt as a where a.attempted_at < now() - interval '1 hour';
  if me is null then
    return (
      select count(*) from public.household_code_attempt as a
      where a.user_id is null and a.attempted_at > now() - interval '10 minutes'
    ) >= public.household_code_limit() * 5;
  end if;
  return (
    select count(*) from public.household_code_attempt as a
    where a.user_id = me and a.attempted_at > now() - interval '1 hour'
  ) >= public.household_code_limit();
end;
$$;

-- The open invitation with this code, or null.
create function public.household_open_invite(code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id from public.household_invite as i
  where i.code_hash = public.household_invite_hash(code)
    and i.used_at is null and i.revoked_at is null and i.expires_at > now();
$$;

revoke all on function public.household_code_limit() from public, anon, authenticated, service_role;
revoke all on function public.household_invite_hash(text) from public, anon, authenticated, service_role;
revoke all on function public.household_code_locked() from public, anon, authenticated, service_role;
revoke all on function public.household_open_invite(text) from public, anon, authenticated, service_role;

-- 3. The invitation -----------------------------------------------------------------

-- The colour the next member gets: the first of mint, sky, sand, lila that no
-- one in the household has, or else by turn (decision 7).
create function public.household_next_color(hid uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select c.color from unnest(array['mint', 'sky', 'sand', 'lila']) with ordinality as c(color, n)
      where not exists (select 1 from public.household_member as m where m.household_id = hid and m.color = c.color)
      order by c.n limit 1
    ),
    (array['mint', 'sky', 'sand', 'lila'])[(select count(*) from public.household_member as m where m.household_id = hid) % 4 + 1]
  );
$$;

revoke all on function public.household_next_color(uuid) from public, anon, authenticated, service_role;

-- A new invitation to the caller's household; the code is given back this
-- once and kept only as its hash. At most 10 open at a time.
create function public.create_household_invite()
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hid uuid;
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  made text;
  bytes bytea;
  pick integer;
  i integer;
begin
  select m.household_id into hid from public.household_member as m where m.user_id = me;
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  -- One invitation at a time per household, so two members do not race past the limit.
  perform 1 from public.household as h where h.id = hid for update;
  if (
    select count(*) from public.household_invite as v
    where v.household_id = hid and v.used_at is null and v.revoked_at is null and v.expires_at > now()
  ) >= 10 then
    raise exception 'too many open invitations' using errcode = 'MK457';
  end if;
  loop
    made := '';
    while char_length(made) < 6 loop
      bytes := uuid_send(gen_random_uuid());
      for i in 0..15 loop
        pick := get_byte(bytes, i);
        -- 248 = 8 * 31: the bytes above it would favour the first characters.
        if pick < 248 and char_length(made) < 6 then
          made := made || substr(alphabet, pick % 31 + 1, 1);
        end if;
      end loop;
    end loop;
    exit when not exists (select 1 from public.household_invite as v where v.code_hash = public.household_invite_hash(made));
  end loop;
  return query
    insert into public.household_invite as v (code_hash, household_id, created_by, expires_at)
    values (public.household_invite_hash(made), hid, me, now() + interval '7 days')
    returning v.id, made, v.expires_at;
end;
$$;

-- "Tog bort inbjudan." An open invitation of the caller's household is closed.
create function public.revoke_household_invite(invite_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.household_invite as v set revoked_at = now()
  where v.id = invite_id and v.household_id = public.my_household_id()
    and v.used_at is null and v.revoked_at is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- "Ångra" after "Tog bort inbjudan.": a revoked invitation that has not run
-- out is open again, with the same code.
create function public.restore_household_invite(invite_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.household_invite as v set revoked_at = null
  where v.id = invite_id and v.household_id = public.my_household_id()
    and v.used_at is null and v.revoked_at is not null and v.expires_at > now();
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- The open invitations of the caller's household, newest first.
create function public.household_invites()
returns table (id uuid, created_by_name text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, m.display_name, v.created_at, v.expires_at
  from public.household_invite as v
  left join public.household_member as m on m.user_id = v.created_by and m.household_id = v.household_id
  where v.household_id = public.my_household_id()
    and v.used_at is null and v.revoked_at is null and v.expires_at > now()
  order by v.created_at desc;
$$;

-- The members of the caller's household with their addresses, in the order
-- they joined (the address is what the list shows under the name, and what
-- the app checks against ALLOWED_EMAILS).
create function public.household_members()
returns table (
  user_id uuid, display_name text, email text, role text, color text, joined_at timestamptz, named boolean, is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, m.display_name, coalesce(u.email, '')::text, m.role, m.color, m.joined_at, m.named_at is not null,
    m.user_id = (select auth.uid())
  from public.household_member as m
  left join auth.users as u on u.id = m.user_id
  where m.household_id = public.my_household_id()
  order by m.joined_at, m.user_id;
$$;

-- What /ga-med shows before anyone signs in: the household's name, who
-- invited, how many are in it and their initials' colours. `status` is ok,
-- gone (expired, used or revoked: the inviter's name comes along), unknown
-- (no such code; counts as a wrong code) or locked (too many wrong codes).
create function public.household_invite_preview(code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  found_invite public.household_invite;
  hid uuid;
begin
  if public.household_code_locked() then
    return jsonb_build_object('status', 'locked');
  end if;
  select * into found_invite from public.household_invite as v where v.code_hash = public.household_invite_hash(code);
  if found_invite.id is null then
    insert into public.household_code_attempt (user_id) values (auth.uid());
    return jsonb_build_object('status', 'unknown');
  end if;
  hid := found_invite.household_id;
  return jsonb_build_object(
    'status', case
      when found_invite.used_at is null and found_invite.revoked_at is null and found_invite.expires_at > now() then 'ok'
      else 'gone' end,
    'household', (select h.name from public.household as h where h.id = hid),
    'invited_by', (
      select m.display_name from public.household_member as m
      where m.user_id = found_invite.created_by and m.household_id = hid
    ),
    'expires_at', found_invite.expires_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('initial', upper(left(m.display_name, 1)), 'color', m.color) order by m.joined_at, m.user_id)
      from public.household_member as m where m.household_id = hid
    ), '[]'::jsonb),
    'already_member', coalesce(hid = public.my_household_id(), false),
    -- Signed in, alone in a household with data of its own: joining is refused (decision 10's fallback).
    'own_data', coalesce(
      hid <> public.my_household_id()
      and not exists (
        select 1 from public.household_member as m
        where m.household_id = public.my_household_id() and m.user_id <> (select auth.uid())
      )
      and public.household_has_data(public.my_household_id()),
      false
    )
  );
end;
$$;

-- 4. Joining ----------------------------------------------------------------------------

-- Whether a household holds data someone put in (not only the start data
-- every account gets: Hemma, the store, the recipe sites).
create function public.household_has_data(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.recipe as r where r.household_id = hid)
    or exists (select 1 from public.meal_plan_recipe as r where r.household_id = hid)
    or exists (select 1 from public.shopping_custom_item as r where r.household_id = hid)
    or exists (select 1 from public.pantry_item as r where r.household_id = hid)
    or exists (select 1 from public.pantry_photo as r where r.household_id = hid)
    or exists (select 1 from public.thing_photo as r where r.household_id = hid)
    or exists (select 1 from public.thing_item as r where r.household_id = hid);
$$;

-- Takes `who` out of their household: when they owned it and others are left,
-- the one who has been there longest becomes owner. Deletes the membership
-- (household_drop_when_empty takes a household left empty). Gives back the
-- display name and when it was set, for the next membership.
create function public.household_member_out(who uuid, out shown text, out named timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_member public.household_member;
  heir uuid;
begin
  select * into current_member from public.household_member as m where m.user_id = who for update;
  if current_member.user_id is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if current_member.role = 'owner' then
    select m.user_id into heir from public.household_member as m
    where m.household_id = current_member.household_id and m.user_id <> who
    order by m.joined_at, m.user_id limit 1;
  end if;
  delete from public.household_member as m where m.user_id = who;
  if heir is not null then
    update public.household_member as m set role = 'owner' where m.user_id = heir;
  end if;
  shown := current_member.display_name;
  named := current_member.named_at;
end;
$$;

-- `who` gets a household of their own, empty, as its owner.
create function public.household_new_for(who uuid, shown text, named timestamptz)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  made uuid;
begin
  insert into public.household (name) values (public.household_default_name(shown)) returning id into made;
  insert into public.household_member (household_id, user_id, role, display_name, color, named_at)
  values (made, who, 'owner', shown, 'mint', named);
  return made;
end;
$$;

revoke all on function public.household_has_data(uuid) from public, anon, authenticated, service_role;
revoke all on function public.household_member_out(uuid) from public, anon, authenticated, service_role;
revoke all on function public.household_new_for(uuid, text, timestamptz) from public, anon, authenticated, service_role;

-- "Gå med": the caller becomes a member of the code's household. The code is
-- used up. An unknown, expired, used or revoked code gives no row and counts
-- as a wrong one (answered, not raised, so the count is kept); 10 in an hour
-- lock the account out of codes for the rest of that hour (MK451). A member of the household already MK453, and an account alone in
-- a household with data of its own MK452 (decision 10, its fallback).
create function public.accept_household_invite(code text)
returns table (household_id uuid, household_name text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  invite public.household_invite;
  mine public.household_member;
  was_shown text;
  was_named timestamptz;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if public.household_code_locked() then
    raise exception 'too many wrong codes' using errcode = 'MK451';
  end if;
  -- The conditions again under the lock: of two people with the same code at
  -- the same moment, the second sees it used.
  select * into invite from public.household_invite as v
  where v.id = public.household_open_invite(code)
    and v.used_at is null and v.revoked_at is null and v.expires_at > now()
  for update;
  if invite.id is null then
    insert into public.household_code_attempt (user_id) values (me);
    -- The attempt must stay although the call fails: it is answered, not raised.
    return;
  end if;
  select * into mine from public.household_member as m where m.user_id = me for update;
  if mine.household_id = invite.household_id then
    raise exception 'already a member' using errcode = 'MK453';
  end if;
  if mine.household_id is not null
    and not exists (select 1 from public.household_member as m where m.household_id = mine.household_id and m.user_id <> me)
    and public.household_has_data(mine.household_id) then
    raise exception 'the household has data of its own' using errcode = 'MK452';
  end if;

  -- Both households stay still meanwhile.
  perform 1 from public.household as h where h.id in (invite.household_id, mine.household_id) order by h.id for update;
  if mine.household_id is not null then
    select o.shown, o.named into was_shown, was_named from public.household_member_out(me) as o;
  end if;
  insert into public.household_member as m (household_id, user_id, role, display_name, color, named_at)
  values (
    invite.household_id, me, 'member',
    coalesce(was_shown, public.household_display_name((select u.email from auth.users as u where u.id = me))),
    public.household_next_color(invite.household_id), was_named
  );
  update public.household_invite as v set used_by = me, used_at = now() where v.id = invite.id;
  return query select h.id, h.name from public.household as h where h.id = invite.household_id;
end;
$$;

-- 5. Leaving and running the household ---------------------------------------------------

-- "Lämna hushållet": the caller gets a household of their own, empty. What
-- they put in stays. Alone in the household there is nothing to leave (MK456).
create function public.leave_household()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hid uuid := public.my_household_id();
  was_shown text;
  was_named timestamptz;
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform 1 from public.household as h where h.id = hid for update;
  if not exists (select 1 from public.household_member as m where m.household_id = hid and m.user_id <> me) then
    raise exception 'alone in the household' using errcode = 'MK456';
  end if;
  select o.shown, o.named into was_shown, was_named from public.household_member_out(me) as o;
  return public.household_new_for(me, was_shown, was_named);
end;
$$;

-- "Ta bort ur hushållet": only the owner, never themselves. The member gets a
-- household of their own, empty; what they put in stays. MK454 when the
-- caller is not the owner, MK455 when `member` is not in the household.
create function public.remove_household_member(member uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hid uuid := public.my_household_id();
  was_shown text;
  was_named timestamptz;
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform 1 from public.household as h where h.id = hid for update;
  if not exists (select 1 from public.household_member as m where m.household_id = hid and m.user_id = me and m.role = 'owner') then
    raise exception 'only the owner removes a member' using errcode = 'MK454';
  end if;
  if member is null or member = me
    or not exists (select 1 from public.household_member as m where m.household_id = hid and m.user_id = member) then
    raise exception 'not a member of the household' using errcode = 'MK455';
  end if;
  select o.shown, o.named into was_shown, was_named from public.household_member_out(member) as o;
  perform public.household_new_for(member, was_shown, was_named);
end;
$$;

-- "Gör till ägare": the owner hands the ownership to another member.
create function public.make_household_owner(member uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hid uuid := public.my_household_id();
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform 1 from public.household as h where h.id = hid for update;
  if not exists (select 1 from public.household_member as m where m.household_id = hid and m.user_id = me and m.role = 'owner') then
    raise exception 'only the owner hands over' using errcode = 'MK454';
  end if;
  if member is null or member = me
    or not exists (select 1 from public.household_member as m where m.household_id = hid and m.user_id = member) then
    raise exception 'not a member of the household' using errcode = 'MK455';
  end if;
  update public.household_member as m set role = 'member' where m.user_id = me;
  update public.household_member as m set role = 'owner' where m.user_id = member;
end;
$$;

-- "Namn" on Medlemmar: any member renames the household (decision 2).
create function public.rename_household(new_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
  cleaned text := btrim(regexp_replace(coalesce(new_name, ''), '[[:space:]]+', ' ', 'g'));
begin
  if hid is null then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if char_length(cleaned) not between 1 and 60 then
    raise exception 'a name has 1 to 60 characters' using errcode = '22023';
  end if;
  update public.household as h set name = cleaned where h.id = hid;
  return cleaned;
end;
$$;

-- "Vad heter du?" and Konto: the caller's own name, 1 to 40 characters.
create function public.set_my_display_name(new_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cleaned text := btrim(regexp_replace(coalesce(new_name, ''), '[[:space:]]+', ' ', 'g'));
  changed integer;
begin
  if char_length(cleaned) not between 1 and 40 then
    raise exception 'a name has 1 to 40 characters' using errcode = '22023';
  end if;
  update public.household_member as m set display_name = cleaned, named_at = now() where m.user_id = me;
  get diagnostics changed = row_count;
  if changed = 0 then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return cleaned;
end;
$$;

revoke all on function public.create_household_invite() from public, anon, authenticated, service_role;
revoke all on function public.revoke_household_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.restore_household_invite(uuid) from public, anon, authenticated, service_role;
revoke all on function public.household_invites() from public, anon, authenticated, service_role;
revoke all on function public.household_members() from public, anon, authenticated, service_role;
revoke all on function public.household_invite_preview(text) from public, anon, authenticated, service_role;
revoke all on function public.accept_household_invite(text) from public, anon, authenticated, service_role;
revoke all on function public.leave_household() from public, anon, authenticated, service_role;
revoke all on function public.remove_household_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.make_household_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rename_household(text) from public, anon, authenticated, service_role;
revoke all on function public.set_my_display_name(text) from public, anon, authenticated, service_role;

grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.restore_household_invite(uuid) to authenticated;
grant execute on function public.household_invites() to authenticated;
grant execute on function public.household_members() to authenticated;
grant execute on function public.household_invite_preview(text) to anon, authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on function public.make_household_owner(uuid) to authenticated;
grant execute on function public.rename_household(text) to authenticated;
grant execute on function public.set_my_display_name(text) to authenticated;

-- 6. The photo files of a member who left -----------------------------------------------

-- As in 21.2a, plus: a file under a place of the caller's household (one that
-- still is) is the household's in any folder, when no row of another
-- household points at it. Only a member of the household could ever put a
-- file there (the insert policy never lets anyone write under another
-- household's place), so this reaches only files that members who have since
-- left put there: their card's file after the card is removed, and what they
-- left without a row.
create or replace function public.photo_file_in_my_household(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as household_id),
  parts as (
    select (storage.foldername(object_name))[1] as folder, (storage.foldername(object_name))[2] as place
  ),
  row_households as (
    select p.household_id from public.pantry_photo as p where bucket = 'pantry-photo' and p.object_path = object_name
    union all
    select t.household_id from public.thing_photo as t where bucket = 'thing-photo' and t.object_path = object_name
  ),
  place_households as (
    select s.household_id from public.pantry_site as s, parts
    where bucket = 'pantry-photo' and s.id::text = parts.place
    union all
    select l.household_id from public.thing_place as l, parts
    where bucket = 'thing-photo' and l.id::text = parts.place
  )
  select coalesce(
    (select me.household_id from me) is not null
    and bucket in ('pantry-photo', 'thing-photo')
    and (
      exists (select 1 from row_households as r, me where r.household_id = me.household_id)
      or (
        (
          exists (
            select 1 from public.household_member as m, me, parts
            where m.household_id = me.household_id and m.user_id::text = parts.folder
          )
          or exists (select 1 from place_households as h, me where h.household_id = me.household_id)
        )
        and not exists (select 1 from place_households as h, me where h.household_id <> me.household_id)
        and not exists (select 1 from row_households as r, me where r.household_id <> me.household_id)
      )
    ),
    false
  );
$$;

-- 7. The sign-up hook -----------------------------------------------------------------------

-- Supabase Auth's "Before User Created" hook (docs/molnet.md, "Medlemmar och
-- inbjudan"). Sign-ups are on in the project only so that an invited person
-- can make an account on /ga-med; this lets one through only when its
-- user_metadata.invite_code is an open invitation. Everything else is
-- refused, also a sign-in link to an unknown address (it would make an
-- account). The service role's admin API (users:sync) never runs the hook.
-- The code is not used up here: accept_household_invite does that, right
-- after the sign-up.
create function public.household_signup_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.household_open_invite(event -> 'user' -> 'user_metadata' ->> 'invite_code') is not null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Inbjudan gäller inte längre.')
  );
end;
$$;

revoke all on function public.household_signup_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.household_signup_hook(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
