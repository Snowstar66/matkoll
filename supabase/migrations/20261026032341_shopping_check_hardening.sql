-- Shopping checks, follow-up to 20261026031111_shopping_check.sql after
-- review (AD-4, AD-8, AD-22):
-- 1. shopping_check_line_key_check matches lineKeySchema more closely:
--    lower-case uuids, and a text key without doubled or edge spaces.
-- 2. The (user_id, meal_plan_id) index goes: the list reads a plan's checks
--    by meal_plan_id, which the unique key (meal_plan_id, line_key) serves,
--    as it does the foreign key's lookups.
-- 3. set_shopping_check: checking a line off, or taking the check off, on
--    the caller's current plan, under the meal plan lock, so a check never
--    lands on a plan that "Använd igen" or "Ny matsedel" just replaced.

-- The keys shopping/domain/line-key.ts builds (tests/design/shopping-checks
-- pins the units and the length to the domain):
-- - `r:<ingredient id>:<unit or ->`, `-` for a vague line;
-- - `c:<custom item id>`, an item Pontus adds (Story 3.5);
-- - `t:<text>`, a recipe line without a catalog ingredient, by its text with
--   single spaces between words and none at the edges (lineText). At most
--   302 characters: lineKeySchema counts UTF-16 units, which are never fewer
--   than the characters counted here, so no key the app sends is refused.
alter table public.shopping_check drop constraint shopping_check_line_key_check;
alter table public.shopping_check add constraint shopping_check_line_key_check check (
  line_key ~ '^r:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(g|kg|ml|cl|dl|l|krm|tsk|msk|st|förp|klyfta|kruka|knippe|skiva|-)$'
  or line_key ~ '^c:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or (line_key ~ '^t:([^ ]+( [^ ]+)*)?$' and char_length(line_key) <= 302)
);

drop index public.shopping_check_user_id_meal_plan_id_idx;

-- setChecked (FR-16, AD-22): checks the line off on the signed-in user's
-- current meal plan (checked), or takes the check off, in one transaction
-- under the meal plan lock.
-- - plan_id must be the caller's current plan, else nothing is written
--   (55000): the list was counted for a plan that is no longer current.
-- - Checking a checked line, or unchecking an unchecked one, changes nothing.
-- - The check constraint refuses a key line-key.ts does not build (23514).
-- - Execute only for authenticated.
create function public.set_shopping_check(plan_id uuid, line_key text, checked boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'set_shopping_check needs a signed-in user' using errcode = '42501';
  end if;
  if set_shopping_check.plan_id is null or set_shopping_check.line_key is null or set_shopping_check.checked is null then
    raise exception 'plan_id, line_key and checked are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = set_shopping_check.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if set_shopping_check.checked then
    insert into public.shopping_check (user_id, meal_plan_id, line_key)
    values (caller, set_shopping_check.plan_id, set_shopping_check.line_key)
    on conflict on constraint shopping_check_meal_plan_id_line_key_key do nothing;
  else
    delete from public.shopping_check as item
    where item.meal_plan_id = set_shopping_check.plan_id
      and item.line_key = set_shopping_check.line_key
      and item.user_id = caller;
  end if;
end;
$$;

revoke all on function public.set_shopping_check(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_shopping_check(uuid, text, boolean) to authenticated;
