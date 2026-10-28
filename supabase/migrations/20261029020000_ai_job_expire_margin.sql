-- Story 12.5 privacy fixes, and the queue margin deferred from Story 12.4.
-- 1. ai_job_expire also clears `result` when it fails a job: a partial AI
--    reading never outlives its job.
-- 2. enqueue_ai_job gives a queued job a margin of 10 seconds past its start
--    deadline for expires_at, as a running job has, so ai_queue_timeout (the
--    route's own deadline) no longer loses to ai_job_lost.
-- Same security invoker, search_path and grants as before.

create or replace function public.ai_job_expire()
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
  set status = 'failed', error_code = 'ai_job_lost', finished_at = now(), result = null
  where user_id = caller
    and status in ('queued', 'running')
    and expires_at <= now();
end;
$$;

create or replace function public.enqueue_ai_job(
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
  values (job_kind, job_client_key, job_context, queue_deadline + interval '10 seconds')
  returning * into added;
  return jsonb_build_object('created', true, 'job', to_jsonb(added));
end;
$$;

