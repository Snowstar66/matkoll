-- Automatic error reports into Tyck till's inbox. A signed-in user's browser (an
-- error boundary, an unhandled error or rejection) and the server (Next's
-- onRequestError) add a row of the new kind 'error', as that user, so the owner
-- sees what went wrong without anyone writing. Same table as the messages, so the
-- inbox, RLS (insert own, only the owner reads and marks read) and the owner's
-- unread count are reused. Additive apart from the kind check and the trigger.
--
-- 1. kind 'error' is allowed; the body is a short technical summary (name,
--    message and the first lines of the stack, scrubbed by the app; 2000 chars
--    like every body). page and app_version are kept; area is optional.
-- 2. digest: Next's error digest, only on an error row (text, at most 64 chars).
-- 3. Users may set digest on insert (same grant style as the other content columns).
-- 4. The trigger: error rows have their own limit, 5 per sender per 10 minutes,
--    kept for every caller, so a crash loop cannot fill the inbox or use up the
--    10 an hour / 30 a day that real messages have. Those two limits no longer
--    count error rows, so errors cannot block a real message either (MK429).

alter table public.feedback drop constraint feedback_kind_check;
alter table public.feedback
  add constraint feedback_kind_check check (kind in ('idea', 'rating', 'problem', 'error'));

alter table public.feedback add column digest text;
alter table public.feedback
  add constraint feedback_digest_check check (
    digest is null or (kind = 'error' and char_length(digest) <= 64)
  );

grant insert (digest) on table public.feedback to authenticated;

create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_email := coalesce((select u.email from auth.users as u where u.id = new.user_id), '');
  if new.kind = 'error' then
    -- Error reports: 5 per sender per 10 minutes, whoever inserts (the browser's
    -- session or the server acting as the user).
    perform pg_advisory_xact_lock(hashtextextended('feedback-error:' || new.user_id::text, 0));
    if (select count(*) from public.feedback as f where f.user_id = new.user_id and f.kind = 'error' and f.created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'too many error reports' using errcode = 'MK429';
    end if;
  -- Only a signed-in caller is limited; a script with the service role (pnpm
  -- move:cloud) copies rows without a session. One sender at a time, so two
  -- concurrent inserts cannot both slip under the limit.
  elsif (select auth.uid()) is not null then
    perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
    if (select count(*) from public.feedback as f where f.user_id = new.user_id and f.kind <> 'error' and f.created_at > now() - interval '1 hour') >= 10
      or (select count(*) from public.feedback as f where f.user_id = new.user_id and f.kind <> 'error' and f.created_at > now() - interval '1 day') >= 30
    then
      raise exception 'too many feedback messages' using errcode = 'MK429';
    end if;
  end if;
  return new;
end;
$$;
