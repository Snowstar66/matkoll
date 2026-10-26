-- Shopping module (AD-1, AD-8, AD-22): the second half of "Lägg i lagret"
-- (Story 3.7). After pantry.addToPantry has added the checked lines,
-- clear_put_in_pantry takes them off the list in one transaction. Only
-- src/features/shopping calls it (AD-1). The pantry comes first and this
-- clearing second, so an interruption between them leaves the checks, and
-- the next run, whose items the pantry skips by their receipts, clears them.

-- putCheckedInPantry (FR-19, AD-8): on the signed-in user's current meal
-- plan, under the meal plan lock:
-- - deletes the own items custom_item_ids (put in the pantry when linked to
--   a catalog ingredient, else only taken off the list);
-- - deletes the checks and the overrides (corrected amount, hidden) of the
--   line keys `keys`, so a line that comes back is counted afresh, unchecked.
-- - plan_id must be the caller's current plan, else nothing is written
--   (55000): the list was counted for a plan that is no longer current.
-- - Idempotent: keys and items already gone are skipped.
-- Returns the number of own items deleted. Execute only for authenticated.
create function public.clear_put_in_pantry(plan_id uuid, keys text[], custom_item_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  removed integer;
begin
  if caller is null then
    raise exception 'clear_put_in_pantry needs a signed-in user' using errcode = '42501';
  end if;
  if clear_put_in_pantry.plan_id is null or clear_put_in_pantry.keys is null or clear_put_in_pantry.custom_item_ids is null then
    raise exception 'plan_id, keys and custom_item_ids are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = clear_put_in_pantry.plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  delete from public.shopping_custom_item as own
  where own.meal_plan_id = clear_put_in_pantry.plan_id
    and own.user_id = caller
    and own.id = any (clear_put_in_pantry.custom_item_ids);
  get diagnostics removed = row_count;

  delete from public.shopping_check as item
  where item.meal_plan_id = clear_put_in_pantry.plan_id
    and item.user_id = caller
    and item.line_key = any (clear_put_in_pantry.keys);

  delete from public.shopping_line_override as item
  where item.meal_plan_id = clear_put_in_pantry.plan_id
    and item.user_id = caller
    and item.line_key = any (clear_put_in_pantry.keys);

  return removed;
end;
$$;

revoke all on function public.clear_put_in_pantry(uuid, text[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.clear_put_in_pantry(uuid, text[], uuid[]) to authenticated;
