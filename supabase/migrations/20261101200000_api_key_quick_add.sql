-- Story 17.9: add to the shopping list quickly, also by voice (an iOS Shortcut
-- that calls POST /api/snabb with a personal key). Additive and backward
-- compatible: one new table and one new function; nothing existing changes.
--
-- 1. api_key: a personal key, stored only as sha256(key) (the key is 32 random
--    bytes, so a plain hash is enough). The signed-in owner can list and revoke
--    their keys; the hash column is never granted for reading, so it cannot go
--    back to a client. The rate-limit window lives in the row, also unreadable.
-- 2. add_items_by_api_key: called without a session by the API route. It looks
--    the key up by its hash, refuses a missing or revoked key (MK401) and more
--    than 30 calls in a minute (MK429), and adds the labels as the key owner's
--    own items (household level, no meal plan, Story 17.10). The only table
--    access it has is through its own definer rights; anon has no table grants.

create table public.api_key (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Lowercase hex of sha256(key): 64 characters.
  key_hash text not null,
  label text not null default 'Siri',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  -- Rate limit: calls counted in the minute that started at window_start.
  window_start timestamptz,
  window_count integer not null default 0,
  constraint api_key_hash_unique unique (key_hash),
  constraint api_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_key_label_check check (btrim(label) <> '' and char_length(label) <= 60)
);

create index api_key_user_id_idx on public.api_key (user_id);

alter table public.api_key enable row level security;

create policy api_key_own_rows on public.api_key
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants by column (AD-4): the owner reads everything except the hash and the
-- rate-limit window, may create a key (hash and name; the user is the caller)
-- and may only change revoked_at. No delete: a revoked key stays as history.
-- service_role keeps the whole table, for tests and operations.
revoke all on table public.api_key from public, anon, authenticated, service_role;
grant select (id, user_id, label, created_at, last_used_at, revoked_at) on table public.api_key to authenticated;
grant insert (key_hash, label) on table public.api_key to authenticated;
grant update (revoked_at) on table public.api_key to authenticated;
grant select, insert, update, delete on table public.api_key to service_role;

-- At most 5 working keys per user.
create function public.api_key_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.api_key as k where k.user_id = new.user_id and k.revoked_at is null) >= 5 then
    raise exception 'too many api keys' using errcode = 'MK402';
  end if;
  return new;
end;
$$;

create trigger api_key_limit before insert on public.api_key
  for each row execute function public.api_key_limit();

-- Adds labels as own items for the owner of the key whose sha256 is `hash`.
-- Returns the labels added, in order. 1 to 20 labels of 1 to 200 characters
-- (22023 otherwise). A missing and a revoked key are the same error (MK401),
-- so nothing says which keys exist.
create function public.add_items_by_api_key(hash text, labels text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_row record;
  label text;
  added text[] := '{}';
begin
  if hash is null or labels is null then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  -- One update finds the key, counts the call and keeps the rate limit; the row lock
  -- makes concurrent calls count one after another.
  update public.api_key as k set
    window_count = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then 1 else k.window_count + 1 end,
    window_start = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then now() else k.window_start end,
    last_used_at = now()
  where k.key_hash = add_items_by_api_key.hash and k.revoked_at is null
  returning k.user_id, k.window_count into key_row;
  if not found then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  if key_row.window_count > 30 then
    raise exception 'too many calls' using errcode = 'MK429';
  end if;
  if coalesce(cardinality(labels), 0) not between 1 and 20 then
    raise exception 'labels must be 1 to 20' using errcode = '22023';
  end if;
  foreach label in array labels loop
    if label is null or btrim(label) = '' or char_length(label) > 200 then
      raise exception 'invalid label' using errcode = '22023';
    end if;
    -- clock_timestamp keeps the order they were said in.
    insert into public.shopping_custom_item (user_id, label, created_at)
    values (key_row.user_id, label, clock_timestamp());
    added := added || label;
  end loop;
  return added;
end;
$$;

revoke all on function public.add_items_by_api_key(text, text[]) from public;
grant execute on function public.add_items_by_api_key(text, text[]) to anon, authenticated;
