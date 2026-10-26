-- Shopping module (AD-1, AD-4, AD-8, AD-20, AD-22): corrected amounts and
-- hidden lines on the shopping list (Story 3.6), and changing an own item
-- (Story 3.5's shopping_custom_item). Only src/features/shopping reads and
-- writes these tables (AD-1). An override belongs to a meal plan and a recipe
-- line's key (shopping/domain/line-key.ts); the list itself is never stored,
-- so an override whose line is gone (covered by the pantry, say) stays and
-- applies again if the line comes back with the same key. Every row belongs
-- to one user and is protected by RLS (AD-4).
--
-- 1. shopping_line_override, with updated_at following every update.
-- 2. set_shopping_line_amount: a corrected amount, or back to the counted one.
-- 3. hide_shopping_line: "Ta bort" on a recipe line, returning the row as it
--    was for "Ångra".
-- 4. restore_shopping_line: "Ångra", putting that row back (or none).
-- 5. update_shopping_custom_item: "Spara" in an own item's detail.
-- All on the caller's current plan only, under the meal plan lock.

create table public.shopping_line_override (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  meal_plan_id uuid not null,
  line_key text not null,
  amount numeric,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A recipe line's key (line-key.ts), never an own item's `c:` key: an own
  -- item has its own amount in shopping_custom_item and is removed for good.
  -- - `r:<ingredient id>:<unit or ->`, lower-case id, `-` for a vague line;
  -- - `t:<text>`, a recipe line without a catalog ingredient, with single
  --   spaces between words and no other whitespace, at most 302 characters.
  -- tests/design/shopping-checks pins the units and the length to the domain.
  constraint shopping_line_override_line_key_check check (
    line_key ~ '^r:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(g|kg|ml|cl|dl|l|krm|tsk|msk|st|förp|klyfta|kruka|knippe|skiva|-)$'
    or (line_key ~ '^t:([^[:space:]]+( [^[:space:]]+)*)?$' and char_length(line_key) <= 302)
  ),
  -- A corrected amount is positive and below maxCustomAmount (custom-item.ts).
  constraint shopping_line_override_amount_check check (amount > 0 and amount < 1000000),
  -- Only a line with a unit has an amount to correct: never a vague line
  -- (`-`) or a line without a catalog ingredient (`t:`). The unit is the
  -- key's and never changes (AD-12).
  constraint shopping_line_override_amount_key_check check (
    amount is null
    or line_key ~ '^r:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(g|kg|ml|cl|dl|l|krm|tsk|msk|st|förp|klyfta|kruka|knippe|skiva)$'
  ),
  -- One override per line of a plan.
  constraint shopping_line_override_meal_plan_id_line_key_key unique (meal_plan_id, line_key),
  -- The meal plan owns its overlay: deleting the plan deletes its overrides (AD-20).
  constraint shopping_line_override_meal_plan_fkey foreign key (meal_plan_id, user_id)
    references public.meal_plan (id, user_id) on delete cascade
);

-- The unique key above, which leads with meal_plan_id, serves the list's
-- read of a plan's overrides and the foreign key's lookups when a plan is deleted.

create function public.shopping_line_override_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger shopping_line_override_set_updated_at
  before update on public.shopping_line_override
  for each row execute function public.shopping_line_override_set_updated_at();
-- Only the trigger runs it.
revoke all on function public.shopping_line_override_set_updated_at() from public, anon, authenticated, service_role;

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.shopping_line_override enable row level security;

create policy shopping_line_override_own_rows on public.shopping_line_override
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.shopping_line_override from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.shopping_line_override to authenticated, service_role;

-- setLineAmount and clearLineAmount (FR-17, AD-8, AD-22): the corrected
-- amount of a line on the signed-in user's current meal plan, in one
-- transaction under the meal plan lock.
-- - amount: the corrected amount in the key's unit; null goes back to the
--   counted amount. A row left with neither an amount nor hidden is deleted.
-- - A hidden line stays hidden.
-- - plan_id must be the caller's current plan, else nothing is written
--   (55000): the list was counted for a plan that is no longer current.
-- - The table's checks refuse an own item's key, an amount on a key without a
--   unit, or an amount that is not positive (23514). Idempotent.
-- - Execute only for authenticated.
create function public.set_shopping_line_amount(plan_id uuid, line_key text, amount numeric)
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
    set amount = null
    where item.meal_plan_id = set_shopping_line_amount.plan_id
      and item.line_key = set_shopping_line_amount.line_key
      and item.user_id = caller
      and item.amount is not null;
  else
    insert into public.shopping_line_override (user_id, meal_plan_id, line_key, amount)
    values (caller, set_shopping_line_amount.plan_id, set_shopping_line_amount.line_key, set_shopping_line_amount.amount)
    on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
    do update set amount = excluded.amount;
  end if;
end;
$$;

revoke all on function public.set_shopping_line_amount(uuid, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.set_shopping_line_amount(uuid, text, numeric) to authenticated;

-- hideLine (FR-17, AD-8, AD-20): hides a recipe line on the signed-in user's
-- current meal plan, keeping a corrected amount, in one transaction under the
-- meal plan lock, and returns the line's override as it was before (no row
-- when there was none), so "Ångra" can put exactly that back.
-- - plan_id must be the caller's current plan, else nothing is written (55000).
-- - The table's checks refuse an own item's key (23514).
-- - Execute only for authenticated.
create function public.hide_shopping_line(plan_id uuid, line_key text)
returns setof public.shopping_line_override
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  previous public.shopping_line_override;
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

  insert into public.shopping_line_override (user_id, meal_plan_id, line_key, hidden)
  values (caller, hide_shopping_line.plan_id, hide_shopping_line.line_key, true)
  on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
  do update set hidden = true;

  if previous.id is not null then
    return next previous;
  end if;
  return;
end;
$$;

revoke all on function public.hide_shopping_line(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.hide_shopping_line(uuid, text) to authenticated;

-- restoreLine (FR-17, AD-20): "Ångra" after hideLine. Puts the line's
-- override back exactly as hideLine returned it, with the same id, amount and
-- hidden, or deletes the line's override when there was none (previous null),
-- in one transaction under the meal plan lock.
-- - previous: { id, meal_plan_id, line_key, amount, hidden } or null; its plan
--   and key must be plan_id and line_key (22023).
-- - plan_id must be the caller's current plan, else nothing is written (55000).
-- - Idempotent: "Ångra" twice gives the same row.
-- - Execute only for authenticated.
create function public.restore_shopping_line(plan_id uuid, line_key text, previous jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  previous_id uuid;
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

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = restore_shopping_line.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if previous is null or jsonb_typeof(previous) = 'null' then
    delete from public.shopping_line_override as item
    where item.meal_plan_id = restore_shopping_line.plan_id
      and item.line_key = restore_shopping_line.line_key
      and item.user_id = caller;
    return;
  end if;

  previous_id := (previous ->> 'id')::uuid;
  if previous_id is null
    or (previous ->> 'meal_plan_id')::uuid is distinct from restore_shopping_line.plan_id
    or (previous ->> 'line_key') is distinct from restore_shopping_line.line_key
    or jsonb_typeof(previous -> 'hidden') is distinct from 'boolean'
  then
    raise exception 'previous is not this line''s override' using errcode = '22023';
  end if;

  -- Another row for the line (it was cleared and made again meanwhile) gives way to the one put back.
  delete from public.shopping_line_override as item
  where item.meal_plan_id = restore_shopping_line.plan_id
    and item.line_key = restore_shopping_line.line_key
    and item.user_id = caller
    and item.id <> previous_id;

  insert into public.shopping_line_override (id, user_id, meal_plan_id, line_key, amount, hidden)
  values (
    previous_id,
    caller,
    restore_shopping_line.plan_id,
    restore_shopping_line.line_key,
    (previous ->> 'amount')::numeric,
    (previous ->> 'hidden')::boolean
  )
  on conflict (id) do update
  set amount = excluded.amount, hidden = excluded.hidden
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
end;
$$;

revoke all on function public.restore_shopping_line(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.restore_shopping_line(uuid, text, jsonb) to authenticated;

-- updateCustomItem (FR-17, AD-20, AD-22): "Spara" in an own item's detail
-- changes its text, catalog ingredient, amount and unit, keeping its id, so
-- its check (`c:<id>`) stays. In one transaction under the meal plan lock.
-- - item: { id, meal_plan_id, label, ingredient_id, amount, unit }.
-- - No item with the id among the caller's (removed meanwhile, or another
--   user's): nothing is written (P0002).
-- - The item must be on meal_plan_id and that must be the caller's current
--   plan, else nothing is written (55000).
-- - The table's checks refuse an empty text, an amount without a unit or a
--   unit outside UNITS (23514); the ingredient must be the caller's (23503).
-- - Idempotent: saving the same again changes nothing more.
-- - Execute only for authenticated.
create function public.update_shopping_custom_item(item jsonb)
returns public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
  item_plan_id uuid;
  saved public.shopping_custom_item;
begin
  if caller is null then
    raise exception 'update_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  item_plan_id := (item ->> 'meal_plan_id')::uuid;
  if item_id is null or item_plan_id is null then
    raise exception 'item needs its id and plan' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into saved
  from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller;
  if not found then
    raise exception 'the item is not found' using errcode = 'P0002';
  end if;

  if saved.meal_plan_id <> item_plan_id or not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = item_plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  update public.shopping_custom_item as own
  set
    label = item ->> 'label',
    ingredient_id = (item ->> 'ingredient_id')::uuid,
    amount = (item ->> 'amount')::numeric,
    unit = item ->> 'unit'
  where own.id = item_id and own.user_id = caller
  returning own.* into saved;
  return saved;
end;
$$;

revoke all on function public.update_shopping_custom_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_shopping_custom_item(jsonb) to authenticated;
