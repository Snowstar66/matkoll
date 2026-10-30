-- Story 13.7 review: every guard that tests plan.is_current takes
-- meal_plan_lock() first, so closing past weeks there makes the flag follow
-- the calendar for all of them (detach_recipe_from_current_plan,
-- restore_plan_recipe, set_shopping_check, the custom-item and override
-- functions, clear_put_in_pantry). meal_plan_close_past() does not call the
-- lock, so there is no recursion. Same signature, backward compatible.
create or replace function public.meal_plan_lock()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'meal_plan_lock needs a signed-in user' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('meal_plan:' || caller::text));
  perform public.meal_plan_close_past();
end;
$$;

revoke all on function public.meal_plan_lock() from public, anon, authenticated, service_role;
grant execute on function public.meal_plan_lock() to authenticated;
