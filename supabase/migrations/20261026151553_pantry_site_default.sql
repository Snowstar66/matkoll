-- Places in the pantry, follow-up to 20261026150611_pantry_site.sql (Story
-- 8.1, AD-5, AD-24): pantry_item.site_id gets a column default, so an insert
-- may leave it out, as the 1.0 code's and the tests' direct inserts do, and
-- the generated types (src/lib/supabase/database.types.ts) say so. Without a
-- default, the types required site_id in every insert, although the trigger
-- pantry_item_fill_site fills it.
--
-- The default is the signed-in user's selected place, read only, and null
-- without a session (the service role) or without a selected place. The
-- trigger then fills a null with pantry_selected_site(new.user_id), which
-- creates Hemma when the owner has no places. So the outcome is the trigger's
-- alone: the owner's selected place. Only adds; nothing else changes.

create function public.pantry_session_site()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select own.id
  from public.pantry_site as own
  where own.user_id = auth.uid()
    and own.is_selected;
$$;

-- A column default runs as the inserting role.
revoke all on function public.pantry_session_site() from public, anon, authenticated, service_role;
grant execute on function public.pantry_session_site() to authenticated, service_role;

alter table public.pantry_item alter column site_id set default public.pantry_session_site();
