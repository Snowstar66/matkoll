-- Push-kön: notistexten följer med händelsen, och kön hålls kort (Story 23.3 uppföljning).
--
--   1. note_text on push_event. A note's text used to be looked up when a batch
--      was claimed ("the author's latest note"), so a note written, deleted or
--      replaced between the change and the claim gave the wrong text or none.
--      The trigger now copies the text into the event row when the note is
--      written; the claim reads it from there. Only 'lappar' events carry it,
--      the row is deleted when claimed, and push_event still has no client grants.
--   2. claim_push_batches also drains the queue: events older than a day and
--      this household's events when none of its members has a device left can
--      never be delivered, so they go instead of waiting for a claim that
--      cannot send them.
--
-- save_push_subscription needed no change: the upsert on the unique endpoint
-- already hands a device over to the member who saves it (covered by a test).

set local lock_timeout = '5s';

alter table public.push_event add column note_text text;

create or replace function public.push_event_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := case when tg_op = 'DELETE' then old.household_id else new.household_id end;
  actor uuid := (select auth.uid());
  quoted text;
begin
  if hid is not null and exists (
    select 1
    from public.household_member as m
    join public.push_subscription as s on s.user_id = m.user_id
    where m.household_id = hid and s.user_id is distinct from actor
  ) then
    -- Captured now, so a later edit, delete or newer note cannot change what
    -- this event says. Only notes are quoted (and only when sent alone).
    if tg_argv[0] = 'lappar' then
      quoted := left(new.text, 120);
    end if;
    insert into public.push_event (household_id, kind, actor_id, note_text)
    values (hid, tg_argv[0], actor, quoted);
    delete from public.push_event where created_at < now() - interval '1 day';
  end if;
  return null;
end;
$$;

create or replace function public.claim_push_batches(quiet interval default interval '90 seconds', max_wait interval default interval '5 minutes')
returns table (
  user_id uuid, endpoint text, p256dh text, auth text, kind text, n integer, actor_name text, note_text text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
begin
  if hid is null then
    return;
  end if;
  -- Keep the queue bounded: nobody reads a day-old change, and changes in a
  -- household where no member has a device any more can never be sent.
  delete from public.push_event as e where e.created_at < now() - interval '1 day';
  delete from public.push_event as e
  where e.household_id = hid
    and not exists (
      select 1 from public.household_member as m
      join public.push_subscription as s on s.user_id = m.user_id
      where m.household_id = hid
    );
  return query
  with due as (
    select e.kind from public.push_event as e
    where e.household_id = hid
    group by e.kind
    having max(e.created_at) <= now() - quiet or min(e.created_at) <= now() - max_wait
  ),
  taken as (
    delete from public.push_event as e
    using due
    where e.household_id = hid and e.kind = due.kind
    returning e.kind, e.actor_id, e.note_text
  ),
  batches as (
    select m.user_id as recipient, t.kind as batch_kind, count(*)::integer as changes,
      count(distinct t.actor_id) as makers, min(t.actor_id::text)::uuid as maker,
      max(t.note_text) as quoted
    from taken as t
    join public.household_member as m on m.household_id = hid
    left join public.push_preference as p on p.user_id = m.user_id
    where t.actor_id is distinct from m.user_id
      and case t.kind
        when 'lista' then coalesce(p.lista, true)
        when 'forrad' then coalesce(p.forrad, false)
        when 'matsedel' then coalesce(p.matsedel, false)
        else coalesce(p.lappar, true)
      end
    group by m.user_id, t.kind
  )
  select s.user_id, s.endpoint, s.p256dh, s.auth, b.batch_kind, b.changes,
    case when b.batch_kind = 'lappar' and b.changes = 1 and b.makers = 1
      then (select a.display_name from public.household_member as a where a.household_id = hid and a.user_id = b.maker) end,
    case when b.batch_kind = 'lappar' and b.changes = 1 and b.makers = 1 then b.quoted end
  from batches as b
  join public.push_subscription as s on s.user_id = b.recipient;
end;
$$;
