-- Own items, follow-up to 20261026033405_shopping_custom_item.sql after
-- review (AD-4, AD-12, AD-20):
-- 1. shopping_custom_item_label_check agrees with the domain (custom-item.ts):
--    a text with nothing but whitespace is refused for every character
--    JavaScript's trim and \s count as whitespace (tabs, line breaks,
--    no-break and other Unicode spaces), not only for spaces. The length is
--    counted in characters (code points) here and in the schema alike.
-- 2. add_shopping_custom_item: a retry with an id the caller already has
--    returns that row only when the payload is the same (plan, text,
--    ingredient, amount and unit); otherwise nothing is written (55000), so
--    an id is never reused for a changed item.

-- The characters JavaScript's \s matches (WhiteSpace and LineTerminator).
alter table public.shopping_custom_item drop constraint shopping_custom_item_label_check;
alter table public.shopping_custom_item add constraint shopping_custom_item_label_check check (
  label ~ '[^\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
  and char_length(label) <= 200
);

-- addCustomItem and restoreCustomItem (FR-17, AD-20, AD-22), as in
-- 20261026033405_shopping_custom_item.sql, except for a retry:
-- - item: { id, meal_plan_id, label, ingredient_id, amount, unit }; the id is
--   chosen by the client.
-- - When the caller already has an item with the id and the same plan, text,
--   ingredient, amount and unit (a retry after a lost answer, or "Ångra"
--   twice), nothing is written and that row is returned. With anything
--   different, nothing is written (55000). An id another user has taken is 23505.
-- - meal_plan_id must be the caller's current plan, else nothing is written (55000).
-- - The table's checks refuse an empty text, an amount without a unit or a
--   unit outside UNITS (23514); the ingredient must be the caller's (23503).
-- - Execute only for authenticated.
create or replace function public.add_shopping_custom_item(item jsonb)
returns public.shopping_custom_item
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  item_id uuid;
  item_plan_id uuid;
  item_ingredient_id uuid;
  item_amount numeric;
  added public.shopping_custom_item;
begin
  if caller is null then
    raise exception 'add_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  item_plan_id := (item ->> 'meal_plan_id')::uuid;
  item_ingredient_id := (item ->> 'ingredient_id')::uuid;
  item_amount := (item ->> 'amount')::numeric;
  if item_id is null or item_plan_id is null then
    raise exception 'item needs its id and plan' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into added
  from public.shopping_custom_item as own
  where own.id = item_id and own.user_id = caller;
  if found then
    if added.meal_plan_id = item_plan_id
      and added.label = (item ->> 'label')
      and added.ingredient_id is not distinct from item_ingredient_id
      and added.amount is not distinct from item_amount
      and added.unit is not distinct from (item ->> 'unit')
    then
      return added;
    end if;
    raise exception 'the item with this id is a different item' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = item_plan_id and plan.user_id = caller and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  insert into public.shopping_custom_item (id, user_id, meal_plan_id, label, ingredient_id, amount, unit)
  values (item_id, caller, item_plan_id, item ->> 'label', item_ingredient_id, item_amount, item ->> 'unit')
  returning * into added;
  return added;
end;
$$;

revoke all on function public.add_shopping_custom_item(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.add_shopping_custom_item(jsonb) to authenticated;
