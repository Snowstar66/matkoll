-- Story 17.9 hardening (review): additive follow-up to 20261101200000.
-- 1. Revocation is one-way: revoked_at cannot be cleared or changed once set.
-- 2. The cap of 5 working keys is taken under a per-user advisory lock (no race), and a user has
--    at most 50 key rows in all (MK403).
-- 3. A key adds at most 200 items a day (MK429); the day window is kept in the row, unreadable to clients.
-- 4. Labels are validated before the key is touched, so a bad request costs nothing and tells nothing about
--    the key; an empty list is a valid "probe": it checks the key and counts as a call (returns {}).

alter table public.api_key
  add column day_start timestamptz,
  add column day_count integer not null default 0;

create function public.api_key_revoke_once()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked key stays revoked' using errcode = 'MK404';
  end if;
  return new;
end;
$$;

create trigger api_key_revoke_once before update on public.api_key
  for each row execute function public.api_key_revoke_once();

create or replace function public.api_key_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if (select count(*) from public.api_key as k where k.user_id = new.user_id) >= 50 then
    raise exception 'too many api key rows' using errcode = 'MK403';
  end if;
  if (select count(*) from public.api_key as k where k.user_id = new.user_id and k.revoked_at is null) >= 5 then
    raise exception 'too many api keys' using errcode = 'MK402';
  end if;
  return new;
end;
$$;

create or replace function public.add_items_by_api_key(hash text, labels text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_row record;
  label text;
  added text[] := '{}';
  wanted integer := coalesce(cardinality(labels), 0);
begin
  if hash is null or labels is null then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  -- Validation first: independent of the key, so it says nothing about which keys exist.
  if wanted > 20 then
    raise exception 'labels must be at most 20' using errcode = '22023';
  end if;
  foreach label in array labels loop
    if label is null or btrim(label) = '' or char_length(label) > 200 then
      raise exception 'invalid label' using errcode = '22023';
    end if;
  end loop;
  -- One update finds the key, counts the call and the items, and keeps both limits; the row lock
  -- makes concurrent calls count one after another.
  update public.api_key as k set
    window_count = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then 1 else k.window_count + 1 end,
    window_start = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then now() else k.window_start end,
    day_count = case when k.day_start is null or k.day_start <= now() - interval '1 day' then wanted else k.day_count + wanted end,
    day_start = case when k.day_start is null or k.day_start <= now() - interval '1 day' then now() else k.day_start end,
    last_used_at = now()
  where k.key_hash = add_items_by_api_key.hash and k.revoked_at is null
  returning k.user_id, k.window_count, k.day_count into key_row;
  if not found then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  if key_row.window_count > 30 or key_row.day_count > 200 then
    raise exception 'too many calls' using errcode = 'MK429';
  end if;
  foreach label in array labels loop
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
