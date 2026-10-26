-- Corrected amounts and hidden lines, follow-up to
-- 20261026040748_shopping_line_override.sql after review (AD-8, AD-20, AD-22):
-- 1. base_amount: the amount the list counted when a correction was saved, so
--    the row can say when the counted amount has changed since.
-- 2. set_shopping_line_amount takes base_amount.
-- 3. hide_shopping_line returns { previous, hidden_updated_at }: a line that
--    was already hidden gives its row as not hidden, so "Ångra" always brings
--    the line back, and the hidden row's updated_at lets "Ångra" see a change
--    made after the hide.
-- 4. restore_shopping_line takes hidden_updated_at: when the row has changed
--    since the hide (a correction from another tab), only the hidden flag
--    goes back and the current amount stays. A row left with neither an
--    amount nor hidden is deleted.
-- 5. show_shopping_line: "Visa igen" in Dolda varor, un-hiding a line and
--    keeping its corrected amount.
-- All on the caller's current plan only, under the meal plan lock.

alter table public.shopping_line_override add column base_amount numeric;
-- Positive and below maxCustomAmount, like amount.
alter table public.shopping_line_override add constraint shopping_line_override_base_amount_check check (
  base_amount > 0 and base_amount < 1000000
);
-- Only a corrected amount has a counted amount beside it.
alter table public.shopping_line_override add constraint shopping_line_override_base_amount_amount_check check (
  base_amount is null or amount is not null
);

-- setLineAmount and clearLineAmount (FR-17, AD-8, AD-22), as in
-- 20261026040748_shopping_line_override.sql, with base_amount:
-- - amount: the corrected amount in the key's unit; null goes back to the
--   counted amount (and base_amount goes too). A row left with neither an
--   amount nor hidden is deleted. A hidden line stays hidden.
-- - base_amount: the amount the list counted when the correction was saved.
-- - plan_id must be the caller's current plan, else nothing is written (55000).
-- - Idempotent. Execute only for authenticated.
drop function public.set_shopping_line_amount(uuid, text, numeric);
create function public.set_shopping_line_amount(
  plan_id uuid,
  line_key text,
  amount numeric,
  base_amount numeric default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_shopping_line_amount needs a signed-in user' using errcode = '42501';
  end if;
  if set_shopping_line_amount.plan_id is null or set_shopping_line_amount.line_key is null then
    raise exception 'plan_id and line_key are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = set_shopping_line_amount.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if set_shopping_line_amount.amount is null then
    delete from public.shopping_line_override as item
    where item.meal_plan_id = set_shopping_line_amount.plan_id
      and item.line_key = set_shopping_line_amount.line_key
      and item.user_id = caller
      and not item.hidden;
    update public.shopping_line_override as item
    set amount = null, base_amount = null
    where item.meal_plan_id = set_shopping_line_amount.plan_id
      and item.line_key = set_shopping_line_amount.line_key
      and item.user_id = caller
      and item.amount is not null;
  else
    insert into public.shopping_line_override (user_id, meal_plan_id, line_key, amount, base_amount)
    values (
      caller,
      set_shopping_line_amount.plan_id,
      set_shopping_line_amount.line_key,
      set_shopping_line_amount.amount,
      set_shopping_line_amount.base_amount
    )
    on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
    do update set amount = excluded.amount, base_amount = excluded.base_amount;
  end if;
end;
$$;

revoke all on function public.set_shopping_line_amount(uuid, text, numeric, numeric) from public, anon, authenticated, service_role;
grant execute on function public.set_shopping_line_amount(uuid, text, numeric, numeric) to authenticated;

-- hideLine (FR-17, AD-8, AD-20): hides a recipe line on the signed-in user's
-- current meal plan, keeping a corrected amount, under the meal plan lock.
-- Returns { previous, hidden_updated_at }:
-- - previous: the line's override as it was before, or null when there was
--   none. A line that was hidden already (a second hide, or a retry after a
--   lost answer) gives its row as not hidden, so "Ångra" always brings the
--   line back.
-- - hidden_updated_at: the hidden row's updated_at, which restore_shopping_line
--   compares to see a change made after the hide.
-- - plan_id must be the caller's current plan, else nothing is written (55000).
-- - The table's checks refuse an own item's key (23514).
-- - Execute only for authenticated.
drop function public.hide_shopping_line(uuid, text);
create function public.hide_shopping_line(plan_id uuid, line_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  previous public.shopping_line_override;
  hidden_at timestamptz;
begin
  if caller is null then
    raise exception 'hide_shopping_line needs a signed-in user' using errcode = '42501';
  end if;
  if hide_shopping_line.plan_id is null or hide_shopping_line.line_key is null then
    raise exception 'plan_id and line_key are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = hide_shopping_line.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  select item.* into previous
  from public.shopping_line_override as item
  where item.meal_plan_id = hide_shopping_line.plan_id
    and item.line_key = hide_shopping_line.line_key
    and item.user_id = caller;
  if previous.id is not null then
    previous.hidden := false;
  end if;

  insert into public.shopping_line_override (user_id, meal_plan_id, line_key, hidden)
  values (caller, hide_shopping_line.plan_id, hide_shopping_line.line_key, true)
  on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
  do update set hidden = true
  returning updated_at into hidden_at;

  return jsonb_build_object(
    'previous', case when previous.id is null then null else to_jsonb(previous) end,
    'hidden_updated_at', hidden_at
  );
end;
$$;

revoke all on function public.hide_shopping_line(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.hide_shopping_line(uuid, text) to authenticated;

-- restoreLine (FR-17, AD-20): "Ångra" after hideLine, under the meal plan lock.
-- - previous: { id, meal_plan_id, line_key, amount, base_amount, hidden } as
--   hideLine returned it, or null when the line had none; its plan and key
--   must be plan_id and line_key (22023).
-- - hidden_updated_at: the hidden row's updated_at from hideLine. When the
--   row has changed since (a correction from another tab), or is gone, only
--   the hidden flag goes back (as previous had it, else not hidden) and the
--   current amount stays. Otherwise the row is put back exactly, with the same
--   id, or deleted when there was none.
-- - A row left with neither an amount nor hidden is deleted.
-- - plan_id must be the caller's current plan, else nothing is written (55000).
-- - Idempotent: "Ångra" twice gives the same row.
-- - Execute only for authenticated.
drop function public.restore_shopping_line(uuid, text, jsonb);
create function public.restore_shopping_line(
  plan_id uuid,
  line_key text,
  previous jsonb,
  hidden_updated_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  previous_id uuid;
  saved public.shopping_line_override;
begin
  if caller is null then
    raise exception 'restore_shopping_line needs a signed-in user' using errcode = '42501';
  end if;
  if restore_shopping_line.plan_id is null or restore_shopping_line.line_key is null then
    raise exception 'plan_id and line_key are required' using errcode = '22023';
  end if;
  if previous is not null and jsonb_typeof(previous) not in ('object', 'null') then
    raise exception 'previous must be an object or null' using errcode = '22023';
  end if;
  if previous is not null and jsonb_typeof(previous) = 'null' then
    previous := null;
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = restore_shopping_line.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if previous is not null then
    previous_id := (previous ->> 'id')::uuid;
    if previous_id is null
      or (previous ->> 'meal_plan_id')::uuid is distinct from restore_shopping_line.plan_id
      or (previous ->> 'line_key') is distinct from restore_shopping_line.line_key
      or jsonb_typeof(previous -> 'hidden') is distinct from 'boolean'
    then
      raise exception 'previous is not this line''s override' using errcode = '22023';
    end if;
  end if;

  select item.* into saved
  from public.shopping_line_override as item
  where item.meal_plan_id = restore_shopping_line.plan_id
    and item.line_key = restore_shopping_line.line_key
    and item.user_id = caller;

  if hidden_updated_at is not null and (saved.id is null or saved.updated_at is distinct from hidden_updated_at) then
    -- Changed since the hide: only the hidden flag goes back; the current amount stays.
    update public.shopping_line_override as item
    set hidden = coalesce((previous ->> 'hidden')::boolean, false)
    where item.id = saved.id and item.hidden;
  elsif previous is null then
    delete from public.shopping_line_override as item
    where item.meal_plan_id = restore_shopping_line.plan_id
      and item.line_key = restore_shopping_line.line_key
      and item.user_id = caller;
  else
    -- Another row for the line (it was cleared and made again meanwhile) gives way to the one put back.
    delete from public.shopping_line_override as item
    where item.meal_plan_id = restore_shopping_line.plan_id
      and item.line_key = restore_shopping_line.line_key
      and item.user_id = caller
      and item.id <> previous_id;

    insert into public.shopping_line_override (id, user_id, meal_plan_id, line_key, amount, base_amount, hidden)
    values (
      previous_id,
      caller,
      restore_shopping_line.plan_id,
      restore_shopping_line.line_key,
      (previous ->> 'amount')::numeric,
      case when (previous ->> 'amount') is null then null else (previous ->> 'base_amount')::numeric end,
      (previous ->> 'hidden')::boolean
    )
    on conflict (id) do update
    set amount = excluded.amount, base_amount = excluded.base_amount, hidden = excluded.hidden
    where shopping_line_override.meal_plan_id = excluded.meal_plan_id
      and shopping_line_override.line_key = excluded.line_key;

    if not exists (
      select 1
      from public.shopping_line_override as item
      where item.id = previous_id
        and item.meal_plan_id = restore_shopping_line.plan_id
        and item.line_key = restore_shopping_line.line_key
        and item.user_id = caller
    ) then
      raise exception 'previous is not this line''s override' using errcode = '22023';
    end if;
  end if;

  delete from public.shopping_line_override as item
  where item.meal_plan_id = restore_shopping_line.plan_id
    and item.line_key = restore_shopping_line.line_key
    and item.user_id = caller
    and item.amount is null
    and not item.hidden;
end;
$$;

revoke all on function public.restore_shopping_line(uuid, text, jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.restore_shopping_line(uuid, text, jsonb, timestamptz) to authenticated;

-- showLine (FR-17, Story 3.6): "Visa igen" in Dolda varor. Un-hides the line
-- on the signed-in user's current meal plan and keeps a corrected amount; a
-- row left with neither is deleted. Under the meal plan lock; plan_id must be
-- the caller's current plan, else nothing is written (55000). Idempotent.
-- Execute only for authenticated.
create function public.show_shopping_line(plan_id uuid, line_key text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'show_shopping_line needs a signed-in user' using errcode = '42501';
  end if;
  if show_shopping_line.plan_id is null or show_shopping_line.line_key is null then
    raise exception 'plan_id and line_key are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = show_shopping_line.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  delete from public.shopping_line_override as item
  where item.meal_plan_id = show_shopping_line.plan_id
    and item.line_key = show_shopping_line.line_key
    and item.user_id = caller
    and item.amount is null;
  update public.shopping_line_override as item
  set hidden = false
  where item.meal_plan_id = show_shopping_line.plan_id
    and item.line_key = show_shopping_line.line_key
    and item.user_id = caller
    and item.hidden;
end;
$$;

revoke all on function public.show_shopping_line(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.show_shopping_line(uuid, text) to authenticated;
