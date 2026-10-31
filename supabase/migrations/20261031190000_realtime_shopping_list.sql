-- Story 17.7: Live-inköpslista. Two phones on one account see each other's
-- changes to the shopping list within a couple of seconds, through Supabase
-- Realtime (postgres_changes). Realtime only sends changes of tables in the
-- `supabase_realtime` publication, and still applies each subscriber's RLS.
-- Additive: the tables the list is counted from, and what a family member can
-- change on it. A table already in the publication is left as it is, so the
-- migration can run twice. `replica identity full` lets a DELETE carry the
-- row's `user_id`, so the subscription's `user_id=eq.<uid>` filter also
-- matches removals.
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
    execute format('alter table public.%I replica identity full', shared);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = shared
    ) then
      execute format('alter publication supabase_realtime add table public.%I', shared);
    end if;
  end loop;
end
$$;
