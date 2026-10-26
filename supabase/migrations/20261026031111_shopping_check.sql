-- Shopping module (AD-1, AD-4, AD-8, AD-20): the checks on the shopping list
-- (Story 3.4). Only src/features/shopping reads and writes this table (AD-1).
-- A check belongs to a meal plan and a list line's key (shopping/domain/
-- line-key.ts); the list itself is never stored, so a check whose line is
-- gone (covered by the pantry, say) stays and applies again if the line comes
-- back. Every row belongs to one user and is protected by RLS (AD-4).

create table public.shopping_check (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  meal_plan_id uuid not null,
  line_key text not null,
  created_at timestamptz not null default now(),
  -- The keys line-key.ts builds: `r:<ingredient id>:<unit or ->` for a
  -- catalog ingredient (`-` for a vague line), `t:<normalised text>` for a
  -- recipe line without one, at most 302 characters, and `c:<custom item id>`
  -- for an item Pontus adds (Story 3.5). lineKeySchema checks the same in the app.
  constraint shopping_check_line_key_check check (
    line_key ~ ('^r:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:'
      || '(g|kg|ml|cl|dl|l|krm|tsk|msk|st|förp|klyfta|kruka|knippe|skiva|-)$')
    or line_key ~ '^c:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or (left(line_key, 2) = 't:' and char_length(line_key) <= 302 and line_key = btrim(line_key))
  ),
  -- One check per line of a plan; checking twice (two devices) is one row.
  constraint shopping_check_meal_plan_id_line_key_key unique (meal_plan_id, line_key),
  -- The meal plan owns its overlay: deleting the plan deletes its checks (AD-20).
  constraint shopping_check_meal_plan_fkey foreign key (meal_plan_id, user_id)
    references public.meal_plan (id, user_id) on delete cascade
);

-- The list reads the user's checks of a plan. The unique key above, which
-- leads with meal_plan_id, serves the foreign key's lookups when a plan is deleted.
create index shopping_check_user_id_meal_plan_id_idx on public.shopping_check (user_id, meal_plan_id);

-- RLS: one policy for select, insert, update and delete (AD-4).
alter table public.shopping_check enable row level security;

create policy shopping_check_own_rows on public.shopping_check
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Grants: exactly select, insert, update and delete to authenticated and
-- service_role, never anon (AD-4). The revoke removes default privileges, so
-- the cloud project, where new tables are exposed by default, matches local.
revoke all on table public.shopping_check from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.shopping_check to authenticated, service_role;
