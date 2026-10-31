-- Story 17.7 follow-up. The migration before this one set `replica identity
-- full` on the tables of the live shopping list, on the belief that a DELETE
-- event could then carry `user_id` and match the subscription's filter. It
-- cannot: Realtime applies neither RLS nor filters to DELETE events, and with
-- RLS on, a DELETE's `old` record holds the primary key only. `full` gained
-- nothing and only wrote whole old rows to the WAL, so it is undone here.
-- Additive in effect (no data, no policy changes). The client treats every
-- event as a bare "something changed" ping and never reads a payload; INSERT
-- and UPDATE are filtered on `user_id` and follow RLS, DELETE is listened to
-- without a filter, so another account's removal can arrive as a ping that
-- carries only a row id (a timing-only leak, accepted: ids are random uuids).
do $$
declare
  shared text;
begin
  foreach shared in array array[
    'shopping_check',
    'shopping_custom_item',
    'shopping_line_override',
    'meal_plan',
    'meal_plan_recipe',
    'pantry_item',
    'product_choice'
  ] loop
    execute format('alter table public.%I replica identity default', shared);
  end loop;
end
$$;
