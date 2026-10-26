-- "Lägg i lagret" after review (AD-1, AD-8, AD-22), replacing
-- clear_put_in_pantry from 20261026045020_shopping_clear.sql:
-- - Checks are deleted by id, the ids of the checks whose items were sent
--   (and of those an earlier, interrupted run put in the pantry), never by
--   line key: a check made on another device meanwhile, with a new id, stays.
-- - Overrides (corrected amount, hidden) are deleted only for the keys of the
--   lines sent to the pantry in this run, so a hidden line stays hidden.
-- Otherwise as before: on the caller's current plan only (55000), under the
-- meal plan lock, in one transaction, idempotent. Returns the number of own
-- items deleted. Execute only for authenticated.

drop function public.clear_put_in_pantry(uuid, text[], uuid[]);

create function public.clear_put_in_pantry(
  plan_id uuid,
  check_ids uuid[],
  override_keys text[],
  custom_item_ids uuid[]
)
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
  if clear_put_in_pantry.plan_id is null
    or clear_put_in_pantry.check_ids is null
    or clear_put_in_pantry.override_keys is null
    or clear_put_in_pantry.custom_item_ids is null then
    raise exception 'plan_id, check_ids, override_keys and custom_item_ids are required' using errcode = '22023';
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
    and item.id = any (clear_put_in_pantry.check_ids);

  delete from public.shopping_line_override as item
  where item.meal_plan_id = clear_put_in_pantry.plan_id
    and item.user_id = caller
    and item.line_key = any (clear_put_in_pantry.override_keys);

  return removed;
end;
$$;

revoke all on function public.clear_put_in_pantry(uuid, uuid[], text[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.clear_put_in_pantry(uuid, uuid[], text[], uuid[]) to authenticated;
