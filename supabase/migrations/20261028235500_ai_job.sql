-- AI jobs and their queue (Story 12.4, FR-46-FR-49, NFR-13, AD-4, AD-5,
-- AD-28): one table for the jobs the AI runs in the background, and the
-- functions that put them in a queue and keep it honest. Owned by the
-- ai-jobs module (AD-1): only src/features/ai-jobs reads and writes it. This
-- migration only adds, and works with the code before it (AD-5).
--
-- The table holds the job's kind, state and result, never its input: a
-- photo, a recipe text or the pantry stays in the memory of the request that
-- took the job (AD-15, AD-28), and `context` is only what is needed to show
-- and judge the job ({ "siteId": ... }). The rows are temporary and are
-- left out of the backup (AD-23).
--
-- The rules the functions keep, all inside one transaction under
-- ai_job_lock() (a lock per user, like pantry_lock()):
-- - at most one job per user is `running` (the partial unique index; the
--   lock makes the second claimant wait, the index is the last guard);
-- - at most three jobs per user are `queued` or `running`;
-- - the oldest queued job is the next to run;
-- - a job whose `expires_at` has passed (its function died, or it never got
--   to start) is `failed` with `ai_job_lost`, so nothing hangs and blocks the queue;
-- - the same `client_key` always gives the same job, so a double tap or a
--   retry after a lost answer never makes a second one.
-- Error codes: MK430 the queue is full, MK431 no such job (not the user's,
-- or already closed).

-- 1. The table.
create table public.ai_job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  status text not null default 'queued',
  -- Made by the client for each tap, and the same for a retry after a network error.
  client_key uuid not null,
  context jsonb not null default '{}'::jsonb,
  -- null until there is something: the finished result, or a partial one while running.
  result jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- While queued: when the job must have started. While running: when it must be done.
  expires_at timestamptz not null,
  seen_at timestamptz,
  constraint ai_job_kind_check check (kind in ('suggest', 'analyze', 'import')),
  constraint ai_job_status_check check (status in ('queued', 'running', 'done', 'failed', 'cancelled', 'superseded')),
  -- A job is finished exactly when it has a finishing time.
  constraint ai_job_finished_check check ((status in ('queued', 'running')) = (finished_at is null)),
  constraint ai_job_done_result_check check (status <> 'done' or result is not null),
  constraint ai_job_failed_code_check check (status <> 'failed' or error_code is not null),
  constraint ai_job_error_code_check check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{0,62}$'),
  -- Small enough that an input never fits by mistake; the result may be larger.
  constraint ai_job_context_check check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 2048),
  constraint ai_job_result_check check (result is null or octet_length(result::text) <= 262144),
  constraint ai_job_user_id_client_key_key unique (user_id, client_key)
);

-- At most one running job per user, over tabs, devices and server instances.
create unique index ai_job_one_running on public.ai_job (user_id) where status = 'running';
create index ai_job_user_id_status_created_at_idx on public.ai_job (user_id, status, created_at);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.ai_job enable row level security;

create policy ai_job_own_rows on public.ai_job
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4).
revoke all on table public.ai_job from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.ai_job to authenticated, service_role;

-- 2. The lock: one per signed-in user, until the transaction ends.
create function public.ai_job_lock()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'ai_job_lock needs a signed-in user' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_job:' || caller::text));
end;
$$;

revoke all on function public.ai_job_lock() from public, anon, authenticated, service_role;
grant execute on function public.ai_job_lock() to authenticated;

-- 3. Jobs whose time has passed are lost. Called with the lock held.
create function public.ai_job_expire()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'ai_job_expire needs a signed-in user' using errcode = '42501';
  end if;
  update public.ai_job
  set status = 'failed', error_code = 'ai_job_lost', finished_at = now()
  where user_id = caller
    and status in ('queued', 'running')
    and expires_at <= now();
end;
$$;

revoke all on function public.ai_job_expire() from public, anon, authenticated, service_role;
grant execute on function public.ai_job_expire() to authenticated;

-- 4. Puts a job in the queue, or gives the one that is already there:
-- { "created": boolean, "job": the row }. `queue_deadline` is when the job
-- must have started. A new `suggest` while one is active gives the active
-- one; a new `analyze` of a place replaces the place's older ones
-- (`superseded`, FR-49); a fourth active job is MK430.
create function public.enqueue_ai_job(
  job_kind text,
  job_client_key uuid,
  job_context jsonb,
  queue_deadline timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  existing public.ai_job;
  added public.ai_job;
  active_count integer;
begin
  if caller is null then
    raise exception 'enqueue_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_kind is null or job_client_key is null or queue_deadline is null then
    raise exception 'kind, client_key and queue_deadline are required' using errcode = '22023';
  end if;
  if jsonb_typeof(job_context) is distinct from 'object' then
    raise exception 'context must be an object' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  perform public.ai_job_expire();

  -- A finished job is kept for 24 hours at most, closed or not.
  delete from public.ai_job
  where user_id = caller
    and status in ('done', 'failed', 'cancelled', 'superseded')
    and finished_at < now() - interval '24 hours';

  select * into existing from public.ai_job where user_id = caller and client_key = job_client_key;
  if found then
    return jsonb_build_object('created', false, 'job', to_jsonb(existing));
  end if;

  if job_kind = 'suggest' then
    select * into existing
    from public.ai_job
    where user_id = caller and kind = 'suggest' and status in ('queued', 'running')
    order by created_at, id
    limit 1;
    if found then
      return jsonb_build_object('created', false, 'job', to_jsonb(existing));
    end if;
  end if;

  if job_kind = 'analyze' then
    update public.ai_job
    set status = 'superseded', finished_at = now(), result = null, error_code = null
    where user_id = caller
      and kind = 'analyze'
      and status in ('queued', 'running', 'done')
      and context ->> 'siteId' is not distinct from job_context ->> 'siteId'
      and context ->> 'location' is not distinct from job_context ->> 'location';
  end if;

  select count(*) into active_count
  from public.ai_job
  where user_id = caller and status in ('queued', 'running');
  if active_count >= 3 then
    raise exception 'the queue is full' using errcode = 'MK430';
  end if;

  insert into public.ai_job (kind, client_key, context, expires_at)
  values (job_kind, job_client_key, job_context, queue_deadline)
  returning * into added;
  return jsonb_build_object('created', true, 'job', to_jsonb(added));
end;
$$;

revoke all on function public.enqueue_ai_job(text, uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_ai_job(text, uuid, jsonb, timestamptz) to authenticated;

-- 5. The turn of a queued job: { "outcome": "claimed" | "waiting" | "gone",
-- "position": jobs ahead }. `claimed` only when no other job runs and this is
-- the oldest queued one; it is then `running` with `run_deadline` as its
-- time. `gone` when the job is not queued any more (cancelled, replaced,
-- lost, or not the caller's).
create function public.claim_ai_job(job_id uuid, run_deadline timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  target public.ai_job;
  ahead integer;
begin
  if caller is null then
    raise exception 'claim_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_id is null or run_deadline is null then
    raise exception 'job_id and run_deadline are required' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  perform public.ai_job_expire();

  select * into target from public.ai_job where id = job_id and user_id = caller;
  if not found or target.status <> 'queued' then
    return jsonb_build_object('outcome', 'gone', 'position', 0);
  end if;

  select count(*) into ahead
  from public.ai_job as other
  where other.user_id = caller
    and (
      other.status = 'running'
      or (other.status = 'queued' and (other.created_at, other.id) < (target.created_at, target.id))
    );
  if ahead > 0 then
    return jsonb_build_object('outcome', 'waiting', 'position', ahead);
  end if;

  update public.ai_job
  set status = 'running', started_at = now(), expires_at = run_deadline
  where id = target.id;
  return jsonb_build_object('outcome', 'claimed', 'position', 0);
end;
$$;

revoke all on function public.claim_ai_job(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.claim_ai_job(uuid, timestamptz) to authenticated;

-- 6. A partial result while the job runs. True when written; false when the
-- job is not running any more (the result is then thrown away).
create function public.set_ai_job_result(job_id uuid, job_result jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_ai_job_result needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  update public.ai_job set result = job_result
  where id = job_id and user_id = caller and status = 'running';
  return found;
end;
$$;

revoke all on function public.set_ai_job_result(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_ai_job_result(uuid, jsonb) to authenticated;

-- 7. The end of a job: `done` with its result, or `failed` with an error
-- code. Only for a job that is still `running`, or a `queued` one that
-- failed to start in time (`ai_queue_timeout`); for any other nothing
-- changes and false is returned, so the result of a job that was cancelled,
-- replaced or lost is thrown away.
create function public.finish_ai_job(
  job_id uuid,
  job_status text,
  job_result jsonb default null,
  job_error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'finish_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_status is null or job_status not in ('done', 'failed') then
    raise exception 'a job finishes as done or failed' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  update public.ai_job
  set status = job_status,
      result = case when job_status = 'done' then job_result else null end,
      error_code = case when job_status = 'failed' then job_error_code else null end,
      finished_at = now()
  where id = job_id
    and user_id = caller
    and (status = 'running' or (status = 'queued' and job_status = 'failed'));
  return found;
end;
$$;

revoke all on function public.finish_ai_job(uuid, text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.finish_ai_job(uuid, text, jsonb, text) to authenticated;

-- 8. "Avbryt": a queued or running job is `cancelled` (the function that runs
-- it sees it within a few seconds and stops). A cancelled job is counted as
-- seen. True when it was active; false for a finished job; MK431 when it is
-- not the caller's or is gone.
create function public.cancel_ai_job(job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'cancel_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  perform public.ai_job_expire();
  if not exists (select 1 from public.ai_job where id = job_id and user_id = caller) then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
  update public.ai_job
  set status = 'cancelled', finished_at = now(), seen_at = coalesce(seen_at, now()), result = null, error_code = null
  where id = job_id and user_id = caller and status in ('queued', 'running');
  return found;
end;
$$;

revoke all on function public.cancel_ai_job(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_ai_job(uuid) to authenticated;

-- 9. The result has been shown. MK431 when the job is gone.
create function public.mark_ai_job_seen(job_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'mark_ai_job_seen needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  update public.ai_job set seen_at = coalesce(seen_at, now())
  where id = job_id and user_id = caller;
  if not found then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
end;
$$;

revoke all on function public.mark_ai_job_seen(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_ai_job_seen(uuid) to authenticated;

-- 10. The result is closed or saved: the job is removed. A job that is still
-- queued or running is cancelled first, so the function that runs it stops
-- (it sees the job gone). MK431 when it is not the caller's or is gone.
create function public.dismiss_ai_job(job_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'dismiss_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  perform public.ai_job_expire();
  if not exists (select 1 from public.ai_job where id = job_id and user_id = caller) then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
  update public.ai_job
  set status = 'cancelled', finished_at = now(), seen_at = coalesce(seen_at, now()), result = null, error_code = null
  where id = job_id and user_id = caller and status in ('queued', 'running');
  delete from public.ai_job where id = job_id and user_id = caller;
end;
$$;

revoke all on function public.dismiss_ai_job(uuid) from public, anon, authenticated, service_role;
grant execute on function public.dismiss_ai_job(uuid) to authenticated;
