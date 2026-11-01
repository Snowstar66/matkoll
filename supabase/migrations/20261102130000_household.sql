-- Hushållet i databasen (Story 21.2a, Epic 21; the mockup hushallet.html,
-- section 7 "Teknik, kort"; decisions 2, 3 and 10 with their defaults).
--
-- Until now every row belonged to an account (user_id), and a family shared
-- one login. From here every row of the app's data belongs to a household,
-- and a household has members with logins of their own (the members and the
-- invitations come with Story 21.2b; this migration has no new screen).
--
-- What this migration does, in one transaction:
--   1. household, household_member (one household per person: user_id is
--      unique) and household_invite (locked; 21.2b adds its functions).
--   2. my_household_id() and is_household_member(hid): security definer,
--      stable, search_path ''. RLS uses my_household_id() in the initPlan
--      form, `household_id = (select public.my_household_id())`, which
--      Postgres works out once per statement.
--   3. Backfill: every account gets a household with itself as owner (named
--      from the e-mail's first part, "Pontus hushåll"), and every row gets its
--      account's household. Nothing is moved or deleted. A new account gets
--      its household from a trigger on auth.users.
--   4. household_id on the 26 tables of the app's data, not null, with
--      default my_household_id(), a foreign key to household (on delete
--      cascade) and the composite foreign keys (x_id, household_id) in place
--      of (x_id, user_id), so a row can never point at another household's
--      row. The unique keys and indexes on user_id become household_id ones
--      (bockar, produktval, AI-valet, the selected boende and butik, ...).
--   5. RLS: every policy on those tables compares household_id instead of
--      user_id; a new row's user_id must still be the caller's (it is "the
--      one who made it" until Story 21.3 names it created_by).
--   6. Storage: photo files stay where they are (`<user_id>/<place>/...`). A
--      file is readable and removable when a row of the caller's household
--      points at it, or when it lies in the folder of a member of the
--      caller's household, under none of another household's places, and no
--      other household's row points at it.
--   7. The functions: every one that filtered on auth.uid() or took a lock
--      per user now does so per household.
--
-- Per person, and not shared: welcome_tour, api_key (a Siri key is a person's;
-- what it adds goes to their household), feedback (what a person sent) and
-- app_owner (the app's owner, not a household's). docs/molnet.md has the
-- whole table of decisions.
--
-- Backward compatible for one-member households (every household today): the
-- old columns stay (user_id is kept), and code that inserts with an explicit
-- user_id still works (household_id comes from the default, or from the
-- user's membership when there is no session). user_id now means "the member
-- who made the row": it may be empty, and a deleted account empties it (on
-- delete set null) instead of taking the household's rows with it; the
-- household's data goes only with the household (household_drop_when_empty).
-- A signed-in user never changes a row's user_id or household_id
-- (household_row_guard).

-- A lock it waits for longer than this fails the migration (and rolls it all
-- back) instead of holding up the app.
set local lock_timeout = '5s';

-- 1. The household, its members and its invitations ---------------------------

create table public.household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint household_name_check check (name = btrim(name) and char_length(name) between 1 and 60)
);

create table public.household_member (
  household_id uuid not null references public.household (id) on delete cascade,
  -- Decision 3: one household per person.
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  display_name text not null,
  -- Decision 7: a shade per member, mint, sky, sand, lila in order.
  color text not null default 'mint',
  joined_at timestamptz not null default now(),
  constraint household_member_pkey primary key (household_id, user_id),
  constraint household_member_user_id_key unique (user_id),
  constraint household_member_role_check check (role in ('owner', 'member')),
  constraint household_member_color_check check (color in ('mint', 'sky', 'sand', 'lila')),
  constraint household_member_display_name_check
    check (display_name = btrim(display_name) and char_length(display_name) between 1 and 40)
);

-- At most one owner per household.
create unique index household_member_one_owner on public.household_member (household_id) where role = 'owner';

-- An invitation (Story 21.2b): the code is kept only as its hash. Valid for 7
-- days and one person; revoked_at closes it. No one reads or writes this
-- table directly: 21.2b adds security definer functions for it.
create table public.household_invite (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  household_id uuid not null references public.household (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  constraint household_invite_code_hash_key unique (code_hash),
  constraint household_invite_used_check check ((used_by is null) = (used_at is null))
);

create index household_invite_household_id_idx on public.household_invite (household_id);

alter table public.household enable row level security;
alter table public.household_member enable row level security;
alter table public.household_invite enable row level security;

-- 2. The helpers -------------------------------------------------------------

-- The caller's household, or null without a session or a membership.
create function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id from public.household_member as m where m.user_id = (select auth.uid());
$$;

-- Whether the caller is a member of the household `hid`.
create function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_member as m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.my_household_id() from public, anon, authenticated, service_role;
revoke all on function public.is_household_member(uuid) from public, anon, authenticated, service_role;
grant execute on function public.my_household_id() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
-- The column default my_household_id() is evaluated for the service role's
-- inserts too (tests, scripts); without a session it gives null, and
-- household_fill below takes the household from the row's user_id.
grant execute on function public.my_household_id() to service_role;

-- Members read their own household and its members; nothing else, and no one
-- writes them directly (21.2b's functions do). Never anon.
create policy household_member_reads on public.household
  for select to authenticated
  using (id = (select public.my_household_id()));

create policy household_member_reads on public.household_member
  for select to authenticated
  using (household_id = (select public.my_household_id()));

revoke all on table public.household, public.household_member, public.household_invite
  from public, anon, authenticated, service_role;
grant select on table public.household, public.household_member to authenticated;
grant select, insert, update, delete on table public.household, public.household_member, public.household_invite
  to service_role;

-- The name a member gets from an e-mail address: its first part up to a dot,
-- plus, dash or underscore, with a capital ("pontus.hellgren@…" → "Pontus").
-- Decision 4: 21.2b asks for the name at the first sign-in, prefilled with this.
create function public.household_display_name(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(left(initcap(split_part(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[._+-]+', ' ', 'g'), ' ', 1)), 40)), ''),
    'Jag'
  );
$$;

-- "Pontus hushåll", "Martinas hushåll": a name that ends in s, x or z takes no s.
create function public.household_default_name(display_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select display_name || case when lower(right(display_name, 1)) in ('s', 'x', 'z') then ' hushåll' else 's hushåll' end;
$$;

revoke all on function public.household_display_name(text) from public, anon, authenticated, service_role;
revoke all on function public.household_default_name(text) from public, anon, authenticated, service_role;

-- 3. Every account gets a household -------------------------------------------

-- Idempotent: an account that is a member already is left alone.
do $$
declare
  account record;
  made uuid;
  shown text;
begin
  for account in
    select u.id, u.email from auth.users as u
    where not exists (select 1 from public.household_member as m where m.user_id = u.id)
    order by u.created_at, u.id
  loop
    shown := public.household_display_name(account.email);
    insert into public.household (name) values (public.household_default_name(shown)) returning id into made;
    insert into public.household_member (household_id, user_id, role, display_name, color)
    values (made, account.id, 'owner', shown, 'mint');
  end loop;
end;
$$;

-- A new account (users:sync, the sign-up hook of 21.2b) gets its own household
-- the same way. 21.2b's accept_invite moves the person into the inviting one.
create function public.household_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  made uuid;
  shown text := public.household_display_name(new.email);
begin
  if exists (select 1 from public.household_member as m where m.user_id = new.id) then
    return new;
  end if;
  insert into public.household (name) values (public.household_default_name(shown)) returning id into made;
  insert into public.household_member (household_id, user_id, role, display_name, color)
  values (made, new.id, 'owner', shown, 'mint');
  return new;
end;
$$;

revoke all on function public.household_for_new_user() from public, anon, authenticated, service_role;

create trigger household_for_new_user
  after insert on auth.users
  for each row execute function public.household_for_new_user();

-- A household whose last member is gone (the account deleted) goes too, with
-- all its data (household_id on delete cascade).
create function public.household_drop_when_empty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.household as h
  where h.id = old.household_id
    and not exists (select 1 from public.household_member as m where m.household_id = old.household_id);
  return null;
end;
$$;

revoke all on function public.household_drop_when_empty() from public, anon, authenticated, service_role;

create trigger household_drop_when_empty
  after delete on public.household_member
  for each row execute function public.household_drop_when_empty();

-- 4. household_id on every table of the app's data -----------------------------

-- A row inserted without a session (the service role: tests, scripts) and
-- without household_id gets its user's household. With a session the column
-- default has set it already, and RLS checks it.
create function public.household_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is null then
    select m.household_id into new.household_id from public.household_member as m where m.user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.household_fill() from public, anon, authenticated, service_role;

-- A signed-in user (or anon) never changes who made a row or whose it is, and
-- never moves a photo row's file to another folder. The service role and the
-- functions that run as the owner may: the foreign key's `on delete set null`
-- (it runs as the table's owner) and Story 21.2b's moves.
create function public.household_row_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.user_id is distinct from old.user_id or new.household_id is distinct from old.household_id then
      raise exception 'a row keeps its maker and its household' using errcode = '42501';
    end if;
    if tg_table_name in ('pantry_photo', 'thing_photo') then
      if split_part(new.object_path, '/', 1) is distinct from split_part(old.object_path, '/', 1) then
        raise exception 'a photo keeps its folder' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.household_row_guard() from public, anon, authenticated, service_role;

-- The backfill below changes pantry_site rows, whose one-selected check
-- (pantry_site_one_selected) waits for the commit by default; a table with a
-- check still waiting cannot be altered, so it runs at once here.
set constraints pantry_site_one_selected immediate;

-- The backfill must not touch updated_at (it is the optimistic lock of a
-- recipe, a product choice and a changed line), so those triggers rest meanwhile.
alter table public.recipe disable trigger recipe_set_updated_at;
alter table public.product_choice disable trigger product_choice_set_updated_at;
alter table public.shopping_line_override disable trigger shopping_line_override_set_updated_at;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_job', 'ai_setting', 'ai_usage', 'ingredient', 'ingredient_synonym', 'meal_plan', 'meal_plan_recipe',
    'pantry_addition', 'pantry_item', 'pantry_photo', 'pantry_removal', 'pantry_site', 'product_choice', 'recipe',
    'recipe_ingredient', 'recipe_site', 'recipe_step', 'shopping_check', 'shopping_custom_item',
    'shopping_line_override', 'store', 'store_offer', 'thing_change', 'thing_item', 'thing_photo', 'thing_place'
  ] loop
    execute format('alter table public.%I add column if not exists household_id uuid', t);
    -- Idempotent: only rows without a household yet.
    execute format(
      'update public.%I as r set household_id = m.household_id from public.household_member as m
       where m.user_id = r.user_id and r.household_id is null', t);
    execute format('alter table public.%I alter column household_id set not null', t);
    execute format('alter table public.%I alter column household_id set default public.my_household_id()', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (household_id) references public.household (id) on delete cascade',
      t, t || '_household_id_fkey');
    execute format(
      'create trigger household_fill before insert on public.%I for each row execute function public.household_fill()', t);
    execute format(
      'create trigger household_row_guard before update on public.%I for each row execute function public.household_row_guard()', t);
  end loop;
end;
$$;

alter table public.recipe enable trigger recipe_set_updated_at;
alter table public.product_choice enable trigger product_choice_set_updated_at;
alter table public.shopping_line_override enable trigger shopping_line_override_set_updated_at;

-- The photo rows' paths: `<folder>/<place>/...` with the row's own place and
-- id, where the folder is the member who took the photo. With user_id empty
-- (the taker's account deleted) the old check (`object_path = user_id || ...`)
-- would pass anything, so the folder is now read from the path itself, must be
-- a uuid, and is the maker's while there is one.
alter table public.pantry_photo drop constraint pantry_photo_object_path_check;
alter table public.pantry_photo add constraint pantry_photo_object_path_check check (
  split_part(object_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (user_id is null or split_part(object_path, '/', 1) = user_id::text)
  and object_path = split_part(object_path, '/', 1) || '/' || site_id::text || '/'
    || case location when 'Kyl' then 'kyl' when 'Frys' then 'frys' when 'Skafferi' then 'skafferi' end
    || '/' || id::text
    || case media_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end
);
alter table public.thing_photo drop constraint thing_photo_object_path_check;
alter table public.thing_photo add constraint thing_photo_object_path_check check (
  split_part(object_path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (user_id is null or split_part(object_path, '/', 1) = user_id::text)
  and object_path = split_part(object_path, '/', 1) || '/' || place_id::text || '/' || id::text
    || case media_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' end
);

-- thing_change grants its columns one by one (Story 18.23): members read the new one too.
grant select (household_id) on table public.thing_change to authenticated;

-- The composite foreign keys: a row points only at a row of its own household.
-- (x_id, user_id) foreign keys and the unique keys behind them go; (x_id,
-- household_id) ones come in their place, with the same on delete rules. The
-- unique keys and indexes on user_id become household_id ones (risk 2: a
-- forgotten one gives two bockar on one line or two product choices).

alter table public.ingredient_synonym drop constraint ingredient_synonym_ingredient_fkey;
alter table public.meal_plan_recipe drop constraint meal_plan_recipe_meal_plan_fkey;
alter table public.meal_plan_recipe drop constraint meal_plan_recipe_recipe_fkey;
alter table public.pantry_item drop constraint pantry_item_ingredient_fkey;
alter table public.pantry_item drop constraint pantry_item_site_fkey;
alter table public.pantry_photo drop constraint pantry_photo_site_fkey;
alter table public.product_choice drop constraint product_choice_ingredient_fkey;
alter table public.product_choice drop constraint product_choice_store_fkey;
alter table public.recipe_ingredient drop constraint recipe_ingredient_ingredient_fkey;
alter table public.recipe_ingredient drop constraint recipe_ingredient_recipe_fkey;
alter table public.recipe_ingredient drop constraint recipe_ingredient_step_fkey;
alter table public.recipe_step drop constraint recipe_step_recipe_fkey;
alter table public.shopping_check drop constraint shopping_check_meal_plan_fkey;
alter table public.shopping_custom_item drop constraint shopping_custom_item_ingredient_fkey;
alter table public.shopping_custom_item drop constraint shopping_custom_item_meal_plan_fkey;
alter table public.shopping_line_override drop constraint shopping_line_override_meal_plan_fkey;
alter table public.store_offer drop constraint store_offer_ingredient_fkey;
alter table public.store_offer drop constraint store_offer_store_fkey;
alter table public.thing_change drop constraint thing_change_item_fkey;
alter table public.thing_item drop constraint thing_item_photo_fkey;
alter table public.thing_item drop constraint thing_item_place_fkey;
alter table public.thing_item drop constraint thing_item_same_as_fkey;
alter table public.thing_photo drop constraint thing_photo_place_fkey;
alter table public.thing_photo drop constraint thing_photo_replaces_fkey;
alter table public.thing_place drop constraint thing_place_site_fkey;

alter table public.ai_job drop constraint ai_job_user_id_client_key_key;
alter table public.ai_setting drop constraint ai_setting_user_id_key;
alter table public.ingredient drop constraint ingredient_id_user_id_key;
alter table public.ingredient drop constraint ingredient_user_id_normalized_name_key;
alter table public.ingredient_synonym drop constraint ingredient_synonym_user_id_normalized_key;
alter table public.meal_plan drop constraint meal_plan_id_user_id_key;
alter table public.pantry_addition drop constraint pantry_addition_user_id_key_key;
alter table public.pantry_item drop constraint pantry_item_user_id_site_id_ingredient_id_location_unit_key;
alter table public.pantry_photo drop constraint pantry_photo_user_id_site_id_location_key;
alter table public.pantry_removal drop constraint pantry_removal_pkey;
alter table public.pantry_site drop constraint pantry_site_id_user_id_key;
alter table public.pantry_site drop constraint pantry_site_user_id_normalized_name_key;
alter table public.product_choice drop constraint product_choice_user_id_ingredient_id_store_id_key;
alter table public.recipe drop constraint recipe_id_user_id_key;
alter table public.recipe_site drop constraint recipe_site_user_id_domain_key;
alter table public.recipe_step drop constraint recipe_step_id_recipe_id_user_id_key;
alter table public.store drop constraint store_id_user_id_key;
alter table public.store_offer drop constraint store_offer_user_id_store_id_week_start_label_key_key;
alter table public.thing_item drop constraint thing_item_id_user_id_key;
alter table public.thing_photo drop constraint thing_photo_id_user_id_key;
alter table public.thing_place drop constraint thing_place_id_user_id_key;
alter table public.thing_place drop constraint thing_place_user_id_site_id_room_key_part_key_key;

drop index public.ai_job_one_running;
drop index public.ai_job_user_id_status_created_at_idx;
drop index public.ai_usage_user_id_created_at_idx;
drop index public.ingredient_synonym_ingredient_id_user_id_idx;
drop index public.meal_plan_user_week_idx;
drop index public.meal_plan_recipe_recipe_id_user_id_idx;
drop index public.pantry_item_ingredient_id_user_id_idx;
drop index public.pantry_item_user_id_site_id_location_idx;
drop index public.pantry_removal_user_id_created_at_idx;
drop index public.pantry_site_one_selected_per_user;
drop index public.product_choice_ingredient_id_user_id_idx;
drop index public.product_choice_store_id_user_id_idx;
drop index public.recipe_user_id_created_at_idx;
drop index public.recipe_ingredient_ingredient_id_user_id_idx;
drop index public.shopping_check_user_id_line_key_own_idx;
drop index public.shopping_custom_item_ingredient_id_user_id_idx;
drop index public.shopping_custom_item_user_id_created_at_idx;
drop index public.store_one_selected_per_user;
drop index public.store_user_id_chain_external_store_id_key;
drop index public.thing_change_user_idx;
drop index public.thing_item_noted_idx;

alter table public.ai_job add constraint ai_job_household_id_client_key_key unique (household_id, client_key);
alter table public.ai_setting add constraint ai_setting_household_id_key unique (household_id);
alter table public.ingredient add constraint ingredient_id_household_id_key unique (id, household_id);
alter table public.ingredient add constraint ingredient_household_id_normalized_name_key unique (household_id, normalized_name);
alter table public.ingredient_synonym add constraint ingredient_synonym_household_id_normalized_key unique (household_id, normalized);
alter table public.meal_plan add constraint meal_plan_id_household_id_key unique (id, household_id);
alter table public.pantry_addition add constraint pantry_addition_household_id_key_key unique (household_id, key);
alter table public.pantry_item add constraint pantry_item_household_site_ingredient_location_unit_key unique nulls not distinct (household_id, site_id, ingredient_id, location, unit);
alter table public.pantry_photo add constraint pantry_photo_household_id_site_id_location_key unique (household_id, site_id, location);
alter table public.pantry_removal add constraint pantry_removal_pkey primary key (household_id, id);
alter table public.pantry_site add constraint pantry_site_id_household_id_key unique (id, household_id);
alter table public.pantry_site add constraint pantry_site_household_id_normalized_name_key unique (household_id, normalized_name);
alter table public.product_choice add constraint product_choice_household_id_ingredient_id_store_id_key unique (household_id, ingredient_id, store_id);
alter table public.recipe add constraint recipe_id_household_id_key unique (id, household_id);
alter table public.recipe_site add constraint recipe_site_household_id_domain_key unique (household_id, domain);
alter table public.recipe_step add constraint recipe_step_id_recipe_id_household_id_key unique (id, recipe_id, household_id);
alter table public.store add constraint store_id_household_id_key unique (id, household_id);
alter table public.store_offer add constraint store_offer_household_id_store_id_week_start_label_key_key unique (household_id, store_id, week_start, label_key);
alter table public.thing_item add constraint thing_item_id_household_id_key unique (id, household_id);
alter table public.thing_photo add constraint thing_photo_id_household_id_key unique (id, household_id);
alter table public.thing_place add constraint thing_place_id_household_id_key unique (id, household_id);
alter table public.thing_place add constraint thing_place_household_id_site_id_room_key_part_key_key unique (household_id, site_id, room_key, part_key);

alter table public.ingredient_synonym add constraint ingredient_synonym_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.meal_plan_recipe add constraint meal_plan_recipe_meal_plan_fkey foreign key (meal_plan_id, household_id) references public.meal_plan(id, household_id) on delete cascade;
alter table public.meal_plan_recipe add constraint meal_plan_recipe_recipe_fkey foreign key (recipe_id, household_id) references public.recipe(id, household_id) on delete set null (recipe_id);
alter table public.pantry_item add constraint pantry_item_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.pantry_item add constraint pantry_item_site_fkey foreign key (site_id, household_id) references public.pantry_site(id, household_id);
alter table public.pantry_photo add constraint pantry_photo_site_fkey foreign key (site_id, household_id) references public.pantry_site(id, household_id) on delete cascade;
alter table public.product_choice add constraint product_choice_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.product_choice add constraint product_choice_store_fkey foreign key (store_id, household_id) references public.store(id, household_id) on delete restrict;
alter table public.recipe_ingredient add constraint recipe_ingredient_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.recipe_ingredient add constraint recipe_ingredient_recipe_fkey foreign key (recipe_id, household_id) references public.recipe(id, household_id) on delete cascade;
alter table public.recipe_ingredient add constraint recipe_ingredient_step_fkey foreign key (step_id, recipe_id, household_id) references public.recipe_step(id, recipe_id, household_id) on delete set null (step_id);
alter table public.recipe_step add constraint recipe_step_recipe_fkey foreign key (recipe_id, household_id) references public.recipe(id, household_id) on delete cascade;
alter table public.shopping_check add constraint shopping_check_meal_plan_fkey foreign key (meal_plan_id, household_id) references public.meal_plan(id, household_id) on delete cascade;
alter table public.shopping_custom_item add constraint shopping_custom_item_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.shopping_custom_item add constraint shopping_custom_item_meal_plan_fkey foreign key (meal_plan_id, household_id) references public.meal_plan(id, household_id) on delete set null (meal_plan_id);
alter table public.shopping_line_override add constraint shopping_line_override_meal_plan_fkey foreign key (meal_plan_id, household_id) references public.meal_plan(id, household_id) on delete cascade;
alter table public.store_offer add constraint store_offer_ingredient_fkey foreign key (ingredient_id, household_id) references public.ingredient(id, household_id) on delete restrict;
alter table public.store_offer add constraint store_offer_store_fkey foreign key (store_id, household_id) references public.store(id, household_id) on delete restrict;
alter table public.thing_change add constraint thing_change_item_fkey foreign key (item_id, household_id) references public.thing_item(id, household_id) on delete cascade;
alter table public.thing_item add constraint thing_item_photo_fkey foreign key (photo_id, household_id) references public.thing_photo(id, household_id) on delete cascade;
alter table public.thing_item add constraint thing_item_place_fkey foreign key (place_id, household_id) references public.thing_place(id, household_id) on delete cascade;
alter table public.thing_item add constraint thing_item_same_as_fkey foreign key (same_as, household_id) references public.thing_item(id, household_id) on delete set null (same_as);
alter table public.thing_photo add constraint thing_photo_place_fkey foreign key (place_id, household_id) references public.thing_place(id, household_id) on delete cascade;
alter table public.thing_photo add constraint thing_photo_replaces_fkey foreign key (replaces_photo_id, household_id) references public.thing_photo(id, household_id) on delete set null (replaces_photo_id);
alter table public.thing_place add constraint thing_place_site_fkey foreign key (site_id, household_id) references public.pantry_site(id, household_id) on delete cascade;

create unique index ai_job_one_running on public.ai_job (household_id) where (status = 'running'::text);
create index ai_job_household_id_status_created_at_idx on public.ai_job (household_id, status, created_at);
create index ai_usage_household_id_created_at_idx on public.ai_usage (household_id, created_at);
create index ingredient_synonym_ingredient_id_household_id_idx on public.ingredient_synonym (ingredient_id, household_id);
create unique index meal_plan_household_week_idx on public.meal_plan (household_id, week_start) where (week_start IS NOT NULL);
create index meal_plan_recipe_recipe_id_household_id_idx on public.meal_plan_recipe (recipe_id, household_id);
create index pantry_item_ingredient_id_household_id_idx on public.pantry_item (ingredient_id, household_id);
create index pantry_item_household_id_site_id_location_idx on public.pantry_item (household_id, site_id, location);
create index pantry_removal_household_id_created_at_idx on public.pantry_removal (household_id, created_at);
create unique index pantry_site_one_selected_per_household on public.pantry_site (household_id) where is_selected;
create index product_choice_ingredient_id_household_id_idx on public.product_choice (ingredient_id, household_id);
create index product_choice_store_id_household_id_idx on public.product_choice (store_id, household_id);
create index recipe_household_id_created_at_idx on public.recipe (household_id, created_at DESC);
create index recipe_ingredient_ingredient_id_household_id_idx on public.recipe_ingredient (ingredient_id, household_id);
create unique index shopping_check_household_id_line_key_own_idx on public.shopping_check (household_id, line_key) where (meal_plan_id IS NULL);
create index shopping_custom_item_ingredient_id_household_id_idx on public.shopping_custom_item (ingredient_id, household_id) where (ingredient_id IS NOT NULL);
create index shopping_custom_item_household_id_created_at_idx on public.shopping_custom_item (household_id, created_at);
create unique index store_one_selected_per_household on public.store (household_id) where is_selected;
create unique index store_household_id_chain_external_store_id_key on public.store (household_id, chain, lower(external_store_id));
create index thing_change_household_idx on public.thing_change (household_id);
create index thing_item_noted_idx on public.thing_item (household_id) where (source = 'noted'::text);

-- user_id is the member who made the row: a deleted account leaves the row to
-- the household with no maker, instead of deleting it (and failing on another
-- member's row that points at it, on delete restrict). After the keys above,
-- since pantry_removal's old primary key held user_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_job', 'ai_setting', 'ai_usage', 'ingredient', 'ingredient_synonym', 'meal_plan', 'meal_plan_recipe',
    'pantry_addition', 'pantry_item', 'pantry_photo', 'pantry_removal', 'pantry_site', 'product_choice', 'recipe',
    'recipe_ingredient', 'recipe_site', 'recipe_step', 'shopping_check', 'shopping_custom_item',
    'shopping_line_override', 'store', 'store_offer', 'thing_change', 'thing_item', 'thing_photo', 'thing_place'
  ] loop
    execute format('alter table public.%I alter column user_id drop not null', t);
    execute format('alter table public.%I drop constraint %I', t, t || '_user_id_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users (id) on delete set null',
      t, t || '_user_id_fkey');
  end loop;
end;
$$;

-- Every table can find its household's rows by an index.
create index meal_plan_household_id_idx on public.meal_plan (household_id);
create index meal_plan_recipe_household_id_idx on public.meal_plan_recipe (household_id);
create index recipe_ingredient_household_id_idx on public.recipe_ingredient (household_id);
create index recipe_step_household_id_idx on public.recipe_step (household_id);
create index shopping_check_household_id_idx on public.shopping_check (household_id);
create index shopping_line_override_household_id_idx on public.shopping_line_override (household_id);
create index thing_item_household_id_idx on public.thing_item (household_id);
create index thing_photo_household_id_idx on public.thing_photo (household_id);

-- 5. RLS: the household's rows ------------------------------------------------

-- Members read, change and remove every row of their household, whoever made
-- it. A new row is the caller's household's and names the caller as its maker
-- (user_id; the restrictive policy is ANDed with the permissive one); a changed
-- row stays in the household.

drop policy ai_job_own_rows on public.ai_job;
create policy ai_job_household_rows on public.ai_job
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy ai_job_insert_as_self on public.ai_job
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy ai_setting_own_rows on public.ai_setting;
create policy ai_setting_household_rows on public.ai_setting
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy ai_setting_insert_as_self on public.ai_setting
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy ai_usage_own_rows on public.ai_usage;
create policy ai_usage_household_rows on public.ai_usage
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy ai_usage_insert_as_self on public.ai_usage
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy ingredient_own_rows on public.ingredient;
create policy ingredient_household_rows on public.ingredient
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy ingredient_insert_as_self on public.ingredient
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy ingredient_synonym_own_rows on public.ingredient_synonym;
create policy ingredient_synonym_household_rows on public.ingredient_synonym
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy ingredient_synonym_insert_as_self on public.ingredient_synonym
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy meal_plan_own_rows on public.meal_plan;
create policy meal_plan_household_rows on public.meal_plan
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy meal_plan_insert_as_self on public.meal_plan
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy meal_plan_recipe_own_rows on public.meal_plan_recipe;
create policy meal_plan_recipe_household_rows on public.meal_plan_recipe
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy meal_plan_recipe_insert_as_self on public.meal_plan_recipe
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy pantry_addition_own_rows on public.pantry_addition;
create policy pantry_addition_household_rows on public.pantry_addition
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy pantry_addition_insert_as_self on public.pantry_addition
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy pantry_item_own_rows on public.pantry_item;
create policy pantry_item_household_rows on public.pantry_item
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy pantry_item_insert_as_self on public.pantry_item
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy pantry_photo_own_rows on public.pantry_photo;
create policy pantry_photo_household_rows on public.pantry_photo
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy pantry_photo_insert_as_self on public.pantry_photo
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy pantry_removal_own_rows on public.pantry_removal;
create policy pantry_removal_household_rows on public.pantry_removal
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy pantry_removal_insert_as_self on public.pantry_removal
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy pantry_site_own_rows on public.pantry_site;
create policy pantry_site_household_rows on public.pantry_site
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy pantry_site_insert_as_self on public.pantry_site
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy product_choice_own_rows on public.product_choice;
create policy product_choice_household_rows on public.product_choice
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy product_choice_insert_as_self on public.product_choice
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy recipe_own_rows on public.recipe;
create policy recipe_household_rows on public.recipe
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy recipe_insert_as_self on public.recipe
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy recipe_ingredient_own_rows on public.recipe_ingredient;
create policy recipe_ingredient_household_rows on public.recipe_ingredient
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy recipe_ingredient_insert_as_self on public.recipe_ingredient
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy recipe_site_own_rows on public.recipe_site;
create policy recipe_site_household_rows on public.recipe_site
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy recipe_site_insert_as_self on public.recipe_site
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy recipe_step_own_rows on public.recipe_step;
create policy recipe_step_household_rows on public.recipe_step
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy recipe_step_insert_as_self on public.recipe_step
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy shopping_check_own_rows on public.shopping_check;
create policy shopping_check_household_rows on public.shopping_check
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy shopping_check_insert_as_self on public.shopping_check
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy shopping_custom_item_own_rows on public.shopping_custom_item;
create policy shopping_custom_item_household_rows on public.shopping_custom_item
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy shopping_custom_item_insert_as_self on public.shopping_custom_item
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy shopping_line_override_own_rows on public.shopping_line_override;
create policy shopping_line_override_household_rows on public.shopping_line_override
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy shopping_line_override_insert_as_self on public.shopping_line_override
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy store_own_rows on public.store;
create policy store_household_rows on public.store
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy store_insert_as_self on public.store
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy store_offer_own_rows on public.store_offer;
create policy store_offer_household_rows on public.store_offer
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy store_offer_insert_as_self on public.store_offer
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy thing_item_own_rows on public.thing_item;
create policy thing_item_household_rows on public.thing_item
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy thing_item_insert_as_self on public.thing_item
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy thing_photo_own_rows on public.thing_photo;
create policy thing_photo_household_rows on public.thing_photo
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy thing_photo_insert_as_self on public.thing_photo
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy thing_place_own_rows on public.thing_place;
create policy thing_place_household_rows on public.thing_place
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));
create policy thing_place_insert_as_self on public.thing_place
  as restrictive for insert to authenticated
  with check (user_id = (select auth.uid()));

-- thing_change (Story 18.23) is read, added and removed, never changed.
drop policy thing_change_select on public.thing_change;
create policy thing_change_select on public.thing_change
  for select to authenticated
  using (household_id = (select public.my_household_id()));
drop policy thing_change_delete on public.thing_change;
create policy thing_change_delete on public.thing_change
  for delete to authenticated
  using (household_id = (select public.my_household_id()));
drop policy thing_change_insert on public.thing_change;
create policy thing_change_insert on public.thing_change
  for insert to authenticated
  with check (household_id = (select public.my_household_id()) and user_id = (select auth.uid()));


-- 6. Storage: the photo buckets ----------------------------------------------------

-- Files keep their paths, `<folder>/<place>/...`: the folder is the member who
-- took the photo, the place a pantry_site (pantry-photo) or a thing_place
-- (thing-photo). No file is moved.
--
-- Whether the caller may read or remove the file `object_name` of `bucket`:
--   * a row of the caller's household points at it (the photo is the
--     household's, whoever took it, also after the taker moved or was
--     deleted); or
--   * it lies in the folder of a member of the caller's household, under a
--     place that is the caller's household's or no household's any more (a
--     deleted boende or part, whose files the app removes right after the
--     rows), and no row of another household points at it. This is a file
--     whose row is not saved yet, or was removed and waits for "Ångra" or the
--     sweep.
-- So a member who moved to another household keeps no way into the old
-- household's photos or its leftover files under its places, and nor does
-- their new household. Without a household nothing is readable.
create function public.photo_file_in_my_household(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as household_id),
  parts as (
    select (storage.foldername(object_name))[1] as folder, (storage.foldername(object_name))[2] as place
  ),
  row_households as (
    select p.household_id from public.pantry_photo as p where bucket = 'pantry-photo' and p.object_path = object_name
    union all
    select t.household_id from public.thing_photo as t where bucket = 'thing-photo' and t.object_path = object_name
  ),
  place_households as (
    select s.household_id from public.pantry_site as s, parts
    where bucket = 'pantry-photo' and s.id::text = parts.place
    union all
    select l.household_id from public.thing_place as l, parts
    where bucket = 'thing-photo' and l.id::text = parts.place
  )
  select coalesce(
    (select me.household_id from me) is not null
    and bucket in ('pantry-photo', 'thing-photo')
    and (
      exists (select 1 from row_households as r, me where r.household_id = me.household_id)
      or (
        exists (
          select 1 from public.household_member as m, me, parts
          where m.household_id = me.household_id and m.user_id::text = parts.folder
        )
        and not exists (select 1 from place_households as h, me where h.household_id <> me.household_id)
        and not exists (select 1 from row_households as r, me where r.household_id <> me.household_id)
      )
    ),
    false
  );
$$;

-- Whether the caller may add a file at `object_name` of `bucket`: only in the
-- folder of a member of the caller's household (their own, or a co-member's
-- when a card moves to another place and keeps its taker's folder), never
-- under a place of another household, and never at a path a row of another
-- household points at. A place that is no household's (deleted meanwhile, in
-- another tab) is let through, so the app answers "the place is gone" when it
-- saves the row (the file is then removed, or swept).
create function public.photo_folder_in_my_household(bucket text, object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.my_household_id() as household_id),
  parts as (
    select (storage.foldername(object_name))[1] as folder, (storage.foldername(object_name))[2] as place
  )
  select coalesce(
    (select me.household_id from me) is not null
    and exists (
      select 1 from public.household_member as m, me, parts
      where m.household_id = me.household_id and m.user_id::text = parts.folder
    )
    and bucket in ('pantry-photo', 'thing-photo')
    and not exists (
      select 1 from public.pantry_site as s, me, parts
      where bucket = 'pantry-photo' and s.id::text = parts.place and s.household_id <> me.household_id
    )
    and not exists (
      select 1 from public.thing_place as l, me, parts
      where bucket = 'thing-photo' and l.id::text = parts.place and l.household_id <> me.household_id
    )
    and not exists (
      select 1 from public.pantry_photo as p, me
      where bucket = 'pantry-photo' and p.object_path = object_name and p.household_id <> me.household_id
    )
    and not exists (
      select 1 from public.thing_photo as t, me
      where bucket = 'thing-photo' and t.object_path = object_name and t.household_id <> me.household_id
    ),
    false
  );
$$;

revoke all on function public.photo_file_in_my_household(text, text) from public, anon, authenticated, service_role;
revoke all on function public.photo_folder_in_my_household(text, text) from public, anon, authenticated, service_role;
grant execute on function public.photo_file_in_my_household(text, text) to authenticated;
grant execute on function public.photo_folder_in_my_household(text, text) to authenticated;

drop policy pantry_photo_select on storage.objects;
create policy pantry_photo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'pantry-photo' and public.photo_file_in_my_household(bucket_id, name));

drop policy pantry_photo_insert on storage.objects;
create policy pantry_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pantry-photo'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(kyl|frys|skafferi)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    and public.photo_folder_in_my_household(bucket_id, name)
  );

drop policy pantry_photo_delete on storage.objects;
create policy pantry_photo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pantry-photo' and public.photo_file_in_my_household(bucket_id, name));

drop policy thing_photo_select on storage.objects;
create policy thing_photo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'thing-photo' and public.photo_file_in_my_household(bucket_id, name));

drop policy thing_photo_insert on storage.objects;
create policy thing_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'thing-photo'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$'
    and public.photo_folder_in_my_household(bucket_id, name)
  );

drop policy thing_photo_delete on storage.objects;
create policy thing_photo_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'thing-photo' and public.photo_file_in_my_household(bucket_id, name));

-- 7. The functions ------------------------------------------------------------------

-- The functions below are security invoker, so RLS limits them to the
-- caller's household as well; their own filters and locks were per user
-- (`user_id = caller`, `'things:' || caller`) and are per household now
-- (`household_id = caller_household`). A new row still names the caller as
-- its maker (user_id). The bodies are otherwise unchanged.

-- The pantry's lock of a user is their household's (the one pantry_lock takes).
create or replace function public.pantry_owner_lock(owner uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  owner_household uuid;
begin
  if owner is null or (caller is not null and caller <> owner) then
    raise exception 'pantry_owner_lock takes only the caller''s own lock' using errcode = '42501';
  end if;
  select m.household_id into owner_household from public.household_member as m where m.user_id = owner;
  if owner_household is null then
    raise exception 'pantry_owner_lock needs a member of a household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || owner_household::text));
end;
$$;

-- The household's selected place; Hemma when it has none yet.
create or replace function public.pantry_selected_site(owner uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  who uuid := coalesce(owner, auth.uid());
  who_household uuid;
  chosen uuid;
begin
  if who is null then
    raise exception 'pantry_selected_site needs a signed-in user or an owner' using errcode = '42501';
  end if;
  select m.household_id into who_household from public.household_member as m where m.user_id = who;
  if who_household is null then
    raise exception 'pantry_selected_site needs a member of a household' using errcode = '42501';
  end if;

  select own.id into chosen
  from public.pantry_site as own
  where own.household_id = who_household
    and own.is_selected;
  if found then
    return chosen;
  end if;

  -- No places: Hemma, once, under the household's lock. Another writer may
  -- have created it while this one waited.
  perform public.pantry_owner_lock(who);

  select own.id into chosen
  from public.pantry_site as own
  where own.household_id = who_household
    and own.is_selected;
  if found then
    return chosen;
  end if;

  insert into public.pantry_site (user_id, household_id, name, normalized_name, is_selected)
  values (who, who_household, 'Hemma', 'hemma', true)
  on conflict do nothing
  returning id into chosen;
  if not found then
    raise exception 'the selected place could not be created' using errcode = 'P0002';
  end if;
  return chosen;
end;
$$;

-- At most ten places per household, counted under the household's lock.
create or replace function public.pantry_site_check_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_places constant integer := 10;
  places integer;
begin
  if new.household_id is null then
    raise exception 'a place needs a household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || new.household_id::text));
  select count(*) into places
  from public.pantry_site as own
  where own.household_id = new.household_id;
  if places >= max_places then
    raise exception 'a household has at most % places', max_places using errcode = 'MK422';
  end if;
  return new;
end;
$$;

-- A household with places has exactly one selected place, checked at commit.
create or replace function public.pantry_site_check_selected()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  households uuid[];
  checked uuid;
  places integer;
  selected integer;
begin
  -- Only the cascade from auth.users reaches here without the right to read
  -- pantry_site (the auth service deleting a user, and with the last member
  -- their household); it removes every place of the household, which the
  -- rule allows.
  if not has_table_privilege('public.pantry_site', 'select') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    households := array[new.household_id];
  elsif tg_op = 'DELETE' then
    households := array[old.household_id];
  else
    households := array[old.household_id, new.household_id];
  end if;

  foreach checked in array households loop
    select count(*), count(*) filter (where own.is_selected)
    into places, selected
    from public.pantry_site as own
    where own.household_id = checked;
    if places > 0 and selected <> 1 then
      raise exception 'a household with places has exactly one selected place'
        using errcode = '23514', constraint = 'pantry_site_one_selected';
    end if;
  end loop;
  return null;
end;
$$;

-- A Siri key is a person's (api_key stays per user); what it adds goes on the
-- list of the person's household.
create or replace function public.add_items_by_api_key(hash text, labels text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_row record;
  key_household uuid;
  label text;
  added text[] := '{}';
  wanted integer := coalesce(cardinality(labels), 0);
begin
  if hash is null or labels is null then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  -- Validation first: independent of the key, so it says nothing about which keys exist.
  if wanted > 20 then
    raise exception 'labels must be at most 20' using errcode = '22023';
  end if;
  foreach label in array labels loop
    if label is null or btrim(label) = '' or char_length(label) > 200 then
      raise exception 'invalid label' using errcode = '22023';
    end if;
  end loop;
  -- One update finds the key, counts the call and the items, and keeps both limits; the row lock
  -- makes concurrent calls count one after another.
  update public.api_key as k set
    window_count = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then 1 else k.window_count + 1 end,
    window_start = case when k.window_start is null or k.window_start <= now() - interval '1 minute' then now() else k.window_start end,
    day_count = case when k.day_start is null or k.day_start <= now() - interval '1 day' then wanted else k.day_count + wanted end,
    day_start = case when k.day_start is null or k.day_start <= now() - interval '1 day' then now() else k.day_start end,
    last_used_at = now()
  where k.key_hash = add_items_by_api_key.hash and k.revoked_at is null
  returning k.user_id, k.window_count, k.day_count into key_row;
  if not found then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  if key_row.window_count > 30 or key_row.day_count > 200 then
    raise exception 'too many calls' using errcode = 'MK429';
  end if;
  select m.household_id into key_household from public.household_member as m where m.user_id = key_row.user_id;
  if key_household is null then
    raise exception 'invalid key' using errcode = 'MK401';
  end if;
  foreach label in array labels loop
    -- clock_timestamp keeps the order they were said in.
    insert into public.shopping_custom_item (user_id, household_id, label, created_at)
    values (key_row.user_id, key_household, label, clock_timestamp());
    added := added || label;
  end loop;
  return added;
end;
$$;

create or replace function public.add_card_things(photo uuid, things jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_photo;
  existing integer;
  next_position integer;
  added integer;
begin
  if caller is null then
    raise exception 'add_card_things needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 100 then
    raise exception 'things must be a list of at most 100' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_photo where id = photo and household_id = caller_household and status = 'done';
  if not found then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  select count(*), coalesce(max(position) + 1, 0) into existing, next_position
  from public.thing_item where photo_id = photo and household_id = caller_household;
  if existing + jsonb_array_length(things) > 200 then
    raise exception 'a card holds at most 200 things' using errcode = 'MK441';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  select photo, target.place_id, entry.value ->> 'name', entry.value ->> 'category', 'high', next_position + (entry.ordinality - 1)::integer, 'added'
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  get diagnostics added = row_count;
  return added;
end;
$$;

create or replace function public.add_shopping_custom_item(item jsonb)
returns shopping_custom_item
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
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
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into added
  from public.shopping_custom_item as own
  where own.id = item_id and own.household_id = caller_household;
  if found then
    if added.label = (item ->> 'label')
      and added.ingredient_id is not distinct from item_ingredient_id
      and added.amount is not distinct from item_amount
      and added.unit is not distinct from (item ->> 'unit')
    then
      return added;
    end if;
    raise exception 'the item with this id is a different item' using errcode = '55000';
  end if;

  insert into public.shopping_custom_item (id, user_id, meal_plan_id, label, ingredient_id, amount, unit)
  values (item_id, caller, item_plan_id, item ->> 'label', item_ingredient_id, item_amount, item ->> 'unit')
  returning * into added;
  return added;
end;
$$;

create or replace function public.add_to_pantry(items jsonb, site uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target uuid;
  -- The largest amount pantry_item keeps.
  max_amount constant numeric := 999999.999;
  item record;
  receipt uuid;
  handled integer := 0;
  gone_created_at timestamptz;
  gone_label text;
begin
  if caller is null then
    raise exception 'add_to_pantry needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  -- Every item is checked before anything is written.
  for item in
    select
      element.value ->> 'key' as key,
      element.value ->> 'ingredient_id' as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) as element (value)
  loop
    if item.key is null or item.ingredient_id is null or item.location is null then
      raise exception 'every item needs key, ingredient_id and location' using errcode = '22023';
    end if;
    if item.location not in ('Kyl', 'Frys', 'Skafferi') then
      raise exception 'unknown location' using errcode = '22023';
    end if;
    if (item.amount is null) <> (item.unit is null) then
      raise exception 'an amount needs a unit, and a unit an amount' using errcode = '22023';
    end if;
    if item.amount is not null and not (item.amount > 0) then
      raise exception 'an amount must be above 0' using errcode = '22023';
    end if;
    if item.unit is not null and item.unit not in (
      'g', 'kg', 'ml', 'cl', 'dl', 'l', 'krm', 'tsk', 'msk', 'st', 'förp', 'klyfta', 'kruka', 'knippe', 'skiva'
    ) then
      raise exception 'unknown unit' using errcode = '22023';
    end if;
  end loop;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_addition as old
  where old.household_id = caller_household and old.created_at < now() - interval '30 days';

  for item in
    select
      element.value ->> 'key' as key,
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      -- least() skips nulls, so an item without amount stays without one.
      case
        when element.value ->> 'amount' is null then null
        else least((element.value ->> 'amount')::numeric, max_amount)
      end as amount,
      element.value ->> 'unit' as unit
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    receipt := null;
    insert into public.pantry_addition (user_id, key)
    values (caller, item.key)
    on conflict on constraint pantry_addition_household_id_key_key do nothing
    returning id into receipt;
    if receipt is null then
      continue;
    end if;
    handled := handled + 1;

    if exists (
      select 1
      from public.pantry_item as other
      where other.household_id = caller_household
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.unit is null
    ) then
      continue;
    end if;

    if item.amount is null then
      with gone as (
        delete from public.pantry_item as other
        where other.household_id = caller_household
          and other.site_id = target
          and other.ingredient_id = item.ingredient_id
          and other.location = item.location
          and other.unit is not null
        returning other.created_at, other.label
      )
      select
        min(gone.created_at),
        (array_agg(gone.label order by gone.created_at) filter (where gone.label is not null))[1]
      into gone_created_at, gone_label
      from gone;
      insert into public.pantry_item (site_id, ingredient_id, location, amount, unit, label, created_at)
      values (target, item.ingredient_id, item.location, null, null, gone_label, coalesce(gone_created_at, now()));
    else
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit)
      values (target, item.ingredient_id, item.location, item.amount, item.unit)
      on conflict on constraint pantry_item_household_site_ingredient_location_unit_key
        do update set amount = least(existing.amount + excluded.amount, max_amount);
    end if;
  end loop;

  return handled;
end;
$$;

create or replace function public.add_to_plan(week_start date, dish_id uuid, dish_recipe_id uuid, dish_recipe_title text, dish_servings integer, plan_name text, dish_weekday smallint default null)
returns meal_plan_recipe
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  this_week date := public.meal_plan_week_start();
  week_plan_id uuid;
  added public.meal_plan_recipe;
begin
  if caller is null then
    raise exception 'add_to_plan needs a signed-in user' using errcode = '42501';
  end if;
  if dish_id is null or dish_recipe_id is null then
    raise exception 'dish_id and dish_recipe_id are required' using errcode = '22023';
  end if;
  if week_start is null or extract(isodow from week_start) <> 1
    or week_start < this_week or week_start > this_week + 84 then
    raise exception 'week_start must be a Monday from this week, at most 12 weeks ahead' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();
  perform public.meal_plan_close_past();

  select dish.* into added
  from public.meal_plan_recipe as dish
  where dish.id = dish_id and dish.household_id = caller_household;
  if found then
    return added;
  end if;

  select plan.id into week_plan_id
  from public.meal_plan as plan
  where plan.household_id = caller_household and plan.week_start = add_to_plan.week_start;
  if week_plan_id is null then
    insert into public.meal_plan (user_id, name, is_current, week_start)
    values (caller, plan_name, true, add_to_plan.week_start)
    returning id into week_plan_id;
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday)
  values (
    dish_id,
    week_plan_id,
    dish_recipe_id,
    dish_recipe_title,
    dish_servings,
    (
      select coalesce(max(other.position) + 1, 0)
      from public.meal_plan_recipe as other
      where other.meal_plan_id = week_plan_id
    ),
    dish_weekday
  )
  returning * into added;
  return added;
end;
$$;

create or replace function public.ai_job_expire()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'ai_job_expire needs a signed-in user' using errcode = '42501';
  end if;
  update public.ai_job
  set status = 'failed', error_code = 'ai_job_lost', finished_at = now(), result = null
  where household_id = caller_household
    and status in ('queued', 'running')
    and expires_at <= now();
end;
$$;

create or replace function public.ai_job_lock()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'ai_job_lock needs a signed-in user' using errcode = '42501';
  end if;
  if caller_household is null then
    raise exception 'the caller has no household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_job:' || caller_household::text));
end;
$$;

create or replace function public.apply_pantry_inventory(place text, items jsonb, replace_ids uuid[], remove_ids uuid[], operation_id uuid default null, site uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target uuid;
  item_count integer;
  replace_count integer := coalesce(cardinality(replace_ids), 0);
  remove_count integer := coalesce(cardinality(remove_ids), 0);
  replaced integer := 0;
  replaced_rows jsonb := '[]'::jsonb;
  set_items jsonb;
  removed jsonb := '[]'::jsonb;
  set_rows jsonb := '[]'::jsonb;
  undoable integer := 0;
begin
  if caller is null then
    raise exception 'apply_pantry_inventory needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'items must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(items) as element (value)
    where jsonb_typeof(element.value) is distinct from 'object'
  ) then
    raise exception 'every item must be an object' using errcode = '22023';
  end if;
  item_count := jsonb_array_length(items);
  -- The limits of confirmPantryInventory (inventoryConfirmSchema).
  if item_count > 40 or replace_count > 50 or remove_count > 1000 then
    raise exception 'too many items or ids' using errcode = '22023';
  end if;
  if item_count = 0 and remove_count = 0 then
    raise exception 'nothing to apply' using errcode = '22023';
  end if;
  if remove_count > 0 and operation_id is null then
    raise exception 'removals need an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  delete from public.pantry_removal as old
  where old.household_id = caller_household
    and old.created_at < now() - interval '1 day';

  -- Story 8.4: the caller's record for the operation keeps rows of one place
  -- only. An operation id whose record has a row of another place (or one
  -- without a place) is MK409 before anything is written, so removals never
  -- join another place's "Ångra" in silence.
  if operation_id is not null and exists (
    select 1
    from public.pantry_removal as record,
      jsonb_array_elements(record.removed_rows) as element (value)
    where record.household_id = caller_household
      and record.id = operation_id
      and element.value ->> 'site_id' is distinct from target::text
  ) then
    raise exception 'the operation id belongs to another place' using errcode = 'MK409';
  end if;

  with gone as (
    delete from public.pantry_item as old
    where old.id = any (replace_ids)
      and old.household_id = caller_household
      and old.site_id = target
      and old.location = place
      and exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = place
      )
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = old.location
          and element.value ->> 'unit' is not distinct from old.unit
      )
    returning old.ingredient_id, old.created_at, old.label
  )
  select
    count(*),
    coalesce(
      jsonb_agg(
        jsonb_build_object('ingredient_id', gone.ingredient_id, 'created_at', gone.created_at, 'label', gone.label)
      ),
      '[]'::jsonb
    )
  into replaced, replaced_rows
  from gone;

  with gone as (
    delete from public.pantry_item as old
    where old.id = any (remove_ids)
      and old.household_id = caller_household
      and old.site_id = target
      and old.location = place
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = place
      )
    returning old.*
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', gone.id,
        'site_id', gone.site_id,
        'ingredient_id', gone.ingredient_id,
        'location', gone.location,
        'amount', gone.amount,
        'unit', gone.unit,
        'label', gone.label,
        'created_at', gone.created_at
      )
      order by gone.id
    ),
    '[]'::jsonb
  )
  into removed
  from gone;

  if jsonb_array_length(removed) > 0 then
    -- The caller's own record for the operation gains the rows, and its time
    -- is renewed, so pruning counts from the latest removal it holds.
    update public.pantry_removal as record
    set removed_rows = record.removed_rows || removed,
        created_at = now()
    where record.household_id = caller_household
      and record.id = operation_id;
    if not found then
      begin
        insert into public.pantry_removal (id, user_id, removed_rows)
        values (operation_id, caller, removed);
      exception
        when unique_violation then
          raise exception 'the operation id is taken' using errcode = 'MK409';
      end;
    end if;
  end if;

  if operation_id is not null then
    select jsonb_array_length(record.removed_rows) into undoable
    from public.pantry_removal as record
    where record.household_id = caller_household
      and record.id = operation_id;
    undoable := coalesce(undoable, 0);
  end if;

  if item_count > 0 then
    -- The heir of each ingredient's replaced rows: its first item in the place.
    with inherited as (
      select
        (old.value ->> 'ingredient_id')::uuid as ingredient_id,
        min((old.value ->> 'created_at')::timestamptz) as created_at,
        (array_agg(old.value ->> 'label' order by (old.value ->> 'created_at')::timestamptz)
          filter (where old.value ->> 'label' is not null))[1] as label
      from jsonb_array_elements(replaced_rows) as old (value)
      group by 1
    ),
    heirs as (
      select distinct on (candidate.ingredient_id) candidate.ingredient_id, candidate.position
      from (
        select (element.value ->> 'ingredient_id')::uuid as ingredient_id, element.position
        from jsonb_array_elements(items) with ordinality as element (value, position)
        where element.value ->> 'location' = place
      ) as candidate
      order by candidate.ingredient_id, candidate.position
    )
    select jsonb_agg(
      case
        when inherited.ingredient_id is not null then
          (element.value - 'inherit_created_at' - 'inherit_label')
            || jsonb_build_object('inherit_created_at', inherited.created_at, 'inherit_label', inherited.label)
        else element.value - 'inherit_created_at' - 'inherit_label'
      end
      order by element.position
    )
    into set_items
    from jsonb_array_elements(items) with ordinality as element (value, position)
    left join heirs on heirs.position = element.position
    left join inherited on inherited.ingredient_id = heirs.ingredient_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', saved.id,
          'site_id', saved.site_id,
          'ingredient_id', saved.ingredient_id,
          'location', saved.location,
          'amount', saved.amount,
          'unit', saved.unit,
          'label', saved.label,
          'created_at', saved.created_at
        )
        order by saved.ordinality
      ),
      '[]'::jsonb
    )
    into set_rows
    from public.set_pantry_items(set_items, null, target) with ordinality as saved;
  end if;

  return jsonb_build_object('set', set_rows, 'removed', removed, 'replaced', replaced, 'undoable', undoable);
end;
$$;

create or replace function public.cancel_ai_job(job_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'cancel_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  perform public.ai_job_expire();
  if not exists (select 1 from public.ai_job where id = job_id and household_id = caller_household) then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
  update public.ai_job
  set status = 'cancelled', finished_at = now(), seen_at = coalesce(seen_at, now()), result = null, error_code = null
  where id = job_id and household_id = caller_household and status in ('queued', 'running');
  return found;
end;
$$;

create or replace function public.change_thing_quantity(item uuid, delta integer)
returns table (change_id uuid, quantity_now integer)
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  kept uuid;
  before_count integer;
  after_count integer;
  saved uuid;
begin
  if caller is null then
    raise exception 'change_thing_quantity needs a signed-in user' using errcode = '42501';
  end if;
  if delta is null or delta = 0 or delta not between -999 and 999 then
    raise exception 'delta must be -999 to 999 and not 0' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.household_id = caller_household;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = kept and i.household_id = caller_household for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if before_count is null then
    raise exception 'the thing is not counted' using errcode = 'MK442';
  end if;

  after_count := least(9999, greatest(0, before_count + delta));
  update public.thing_item as i set quantity = after_count where i.id = kept and i.household_id = caller_household;
  insert into public.thing_change (user_id, item_id, kind, delta, quantity_after)
  values (caller, kept, case when delta < 0 then 'take' else 'refill' end, after_count - before_count, after_count)
  returning id into saved;
  return query select saved, after_count;
end;
$$;

create or replace function public.claim_ai_job(job_id uuid, run_deadline timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.ai_job;
  ahead integer;
begin
  if caller is null then
    raise exception 'claim_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_id is null or run_deadline is null then
    raise exception 'job_id and run_deadline are required' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  perform public.ai_job_expire();

  select * into target from public.ai_job where id = job_id and household_id = caller_household;
  if not found or target.status <> 'queued' then
    return jsonb_build_object('outcome', 'gone', 'position', 0);
  end if;

  select count(*) into ahead
  from public.ai_job as other
  where other.household_id = caller_household
    and (
      other.status = 'running'
      or (other.status = 'queued' and (other.created_at, other.id) < (target.created_at, target.id))
    );
  if ahead > 0 then
    return jsonb_build_object('outcome', 'waiting', 'position', ahead);
  end if;

  update public.ai_job
  set status = 'running', started_at = now(), expires_at = run_deadline
  where id = target.id;
  return jsonb_build_object('outcome', 'claimed', 'position', 0);
end;
$$;

create or replace function public.clear_other_store_offers(keep uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  removed integer;
begin
  if caller is null then
    raise exception 'clear_other_store_offers needs a signed-in user' using errcode = '42501';
  end if;
  if keep is null or cardinality(keep) = 0 then
    raise exception 'at least one store to keep is required' using errcode = '22023';
  end if;

  delete from public.store_offer as offer
  where offer.household_id = caller_household
    and not (offer.store_id = any (clear_other_store_offers.keep));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.clear_put_in_pantry(plan_id uuid, check_ids uuid[], override_keys text[], custom_item_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
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
    where plan.id = clear_put_in_pantry.plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  delete from public.shopping_custom_item as own
  where own.household_id = caller_household
    and own.id = any (clear_put_in_pantry.custom_item_ids);
  get diagnostics removed = row_count;

  delete from public.shopping_check as item
  where item.household_id = caller_household
    and (item.meal_plan_id = clear_put_in_pantry.plan_id or item.meal_plan_id is null)
    and item.id = any (clear_put_in_pantry.check_ids);

  delete from public.shopping_line_override as item
  where item.meal_plan_id = clear_put_in_pantry.plan_id
    and item.household_id = caller_household
    and item.line_key = any (clear_put_in_pantry.override_keys);

  return removed;
end;
$$;

create or replace function public.clear_things(site uuid, in_room text DEFAULT NULL::text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  place_ids uuid[];
  counted record;
  removed text[];
begin
  if caller is null then
    raise exception 'clear_things needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  perform 1 from public.pantry_site where id = site and household_id = caller_household;
  if not found then
    raise exception 'the boende is not found' using errcode = 'MK440';
  end if;

  select coalesce(array_agg(id), '{}') into place_ids
  from public.thing_place
  where site_id = site and household_id = caller_household and (in_room is null or room_key = in_room);
  if in_room is not null and cardinality(place_ids) = 0 then
    raise exception 'the room is not found' using errcode = 'MK440';
  end if;

  select * into counted from public.thing_clear_counts(site, in_room);
  select coalesce(array_agg(object_path), '{}') into removed
  from public.thing_photo where household_id = caller_household and place_id = any (place_ids);

  delete from public.thing_place where household_id = caller_household and id = any (place_ids);

  return jsonb_build_object('things', counted.things, 'cards', counted.cards, 'boxes', counted.boxes, 'paths', to_jsonb(removed));
end;
$$;

create or replace function public.commit_ingredients(new_ingredients jsonb, synonyms jsonb)
returns table (id uuid, normalized_name text)
language sql
set search_path = ''
as $$
  with inserted as (
    insert into public.ingredient as existing (name, normalized_name, section, location, default_unit)
    select item.name, item.normalized_name, item.section, item.location, item.default_unit
    from jsonb_to_recordset(new_ingredients) as item (
      name text,
      normalized_name text,
      section text,
      location text,
      default_unit text
    )
    on conflict (household_id, normalized_name) do update
      set normalized_name = existing.normalized_name
    returning existing.id, existing.normalized_name
  ),
  -- Runs even though the final select does not read it.
  linked as (
    insert into public.ingredient_synonym as synonym (ingredient_id, normalized)
    select coalesce(link.ingredient_id, inserted.id), link.normalized
    from jsonb_to_recordset(synonyms) as link (normalized text, ingredient_id uuid, ingredient_name text)
    left join inserted on inserted.normalized_name = link.ingredient_name
    on conflict (household_id, normalized) do update
      set ingredient_id = excluded.ingredient_id
    returning synonym.id
  )
  select inserted.id, inserted.normalized_name from inserted;
$$;

create or replace function public.copy_meal_plan(source_plan uuid, target_week date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  source_week date;
  copied integer := 0;
  item record;
begin
  if caller is null then
    raise exception 'copy_meal_plan needs a signed-in user' using errcode = '42501';
  end if;

  select plan.week_start into source_week
  from public.meal_plan as plan
  where plan.id = source_plan and plan.household_id = caller_household;
  if not found then
    raise exception 'no such meal plan' using errcode = 'P0002';
  end if;
  if source_week is not distinct from target_week then
    raise exception 'a plan is not copied onto its own week' using errcode = '22023';
  end if;

  for item in
    select dish.recipe_id, dish.recipe_title, dish.servings, dish.weekday
    from public.meal_plan_recipe as dish
    where dish.meal_plan_id = source_plan and dish.household_id = caller_household and dish.recipe_id is not null
    order by dish.position, dish.id
  loop
    perform public.add_to_plan(
      target_week,
      pg_catalog.gen_random_uuid(),
      item.recipe_id,
      item.recipe_title,
      item.servings,
      'Vecka ' || pg_catalog.date_part('week', target_week)::integer,
      item.weekday
    );
    copied := copied + 1;
  end loop;

  if copied = 0 then
    raise exception 'no dish with a recipe to copy' using errcode = '22023';
  end if;
  return copied;
end;
$$;

create or replace function public.delete_expired_pantry_photos(photo_ids uuid[], taken_before timestamptz)
returns setof uuid
language sql
set search_path = ''
as $$
  delete from public.pantry_photo as photo
  where cardinality(photo_ids) <= 100
    and photo.id = any (photo_ids)
    and photo.household_id = (select public.my_household_id())
    and photo.taken_at < taken_before
    and not exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'pantry-photo'
        and object.name = photo.object_path
    )
  returning photo.id;
$$;

create or replace function public.delete_meal_plan(plan_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'delete_meal_plan needs a signed-in user' using errcode = '42501';
  end if;
  if plan_id is null then
    raise exception 'plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();
  perform public.meal_plan_close_past();

  if exists (
    select 1
    from public.meal_plan as plan
    where plan.id = plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the current plan is not deleted' using errcode = '55000';
  end if;

  delete from public.meal_plan as plan
  where plan.id = plan_id and plan.household_id = caller_household and not plan.is_current;
  return found;
end;
$$;

create or replace function public.delete_pantry_site(site_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  selected boolean;
begin
  if caller is null then
    raise exception 'delete_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if delete_pantry_site.site_id is null then
    raise exception 'delete_pantry_site needs an id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  select own.is_selected into selected
  from public.pantry_site as own
  where own.id = delete_pantry_site.site_id
    and own.household_id = caller_household
  for update;
  if not found then
    return false;
  end if;

  if selected
    or exists (
      select 1
      from public.pantry_item as item
      where item.household_id = caller_household
        and item.site_id = delete_pantry_site.site_id
    )
    or not exists (
      select 1
      from public.pantry_site as other
      where other.household_id = caller_household
        and other.id <> delete_pantry_site.site_id
    )
  then
    raise exception 'the place is selected, has items or is the last one' using errcode = 'MK423';
  end if;

  delete from public.pantry_site as own
  where own.id = delete_pantry_site.site_id
    and own.household_id = caller_household;
  return true;
end;
$$;

create or replace function public.detach_recipe_from_current_plan(detached_recipe_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  removed integer;
begin
  if caller is null then
    raise exception 'detach_recipe_from_current_plan needs a signed-in user' using errcode = '42501';
  end if;
  if detached_recipe_id is null then
    raise exception 'detached_recipe_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  delete from public.meal_plan_recipe as dish
  using public.meal_plan as plan
  where dish.recipe_id = detached_recipe_id
    and dish.household_id = caller_household
    and plan.id = dish.meal_plan_id
    and plan.household_id = caller_household
    and plan.is_current;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function public.dismiss_ai_job(job_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'dismiss_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  perform public.ai_job_expire();
  if not exists (select 1 from public.ai_job where id = job_id and household_id = caller_household) then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
  update public.ai_job
  set status = 'cancelled', finished_at = now(), seen_at = coalesce(seen_at, now()), result = null, error_code = null
  where id = job_id and household_id = caller_household and status in ('queued', 'running');
  delete from public.ai_job where id = job_id and household_id = caller_household;
end;
$$;

create or replace function public.empty_pantry_place(place text, operation_id uuid, site uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target uuid;
  stored jsonb;
begin
  if caller is null then
    raise exception 'empty_pantry_place needs a signed-in user' using errcode = '42501';
  end if;
  -- The list must equal LOCATIONS (tests/design/pantry-checks.test.ts).
  if place is null or place not in ('Kyl', 'Frys', 'Skafferi') then
    raise exception 'unknown location' using errcode = '22023';
  end if;
  if operation_id is null then
    raise exception 'empty_pantry_place needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  delete from public.pantry_removal as old
  where old.household_id = caller_household
    and old.created_at < now() - interval '1 day';

  -- The same operation again: what it removed, without removing anything more.
  select record.removed_rows into stored
  from public.pantry_removal as record
  where record.household_id = caller_household
    and record.id = operation_id;

  if found then
    if site is not null and exists (
      select 1
      from jsonb_array_elements(stored) as element (value)
      where element.value ->> 'site_id' is distinct from site::text
    ) then
      raise exception 'the operation id belongs to another place' using errcode = 'MK409';
    end if;
    return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
  end if;

  target := public.pantry_target_site(site);

  with removed as (
    delete from public.pantry_item as gone
    where gone.household_id = caller_household
      and gone.site_id = target
      and gone.location = place
    returning gone.*
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', removed.id,
        'site_id', removed.site_id,
        'ingredient_id', removed.ingredient_id,
        'location', removed.location,
        'amount', removed.amount,
        'unit', removed.unit,
        'label', removed.label,
        'created_at', removed.created_at
      )
      order by removed.id
    ),
    '[]'::jsonb
  )
  into stored
  from removed;

  insert into public.pantry_removal (id, removed_rows)
  values (operation_id, stored);

  return jsonb_build_object('removed', jsonb_array_length(stored), 'items', stored);
end;
$$;

create or replace function public.enqueue_ai_job(job_kind text, job_client_key uuid, job_context jsonb, queue_deadline timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  existing public.ai_job;
  added public.ai_job;
  active_count integer;
begin
  if caller is null then
    raise exception 'enqueue_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_kind is null or job_client_key is null or queue_deadline is null then
    raise exception 'kind, client_key and queue_deadline are required' using errcode = '22023';
  end if;
  if jsonb_typeof(job_context) is distinct from 'object' then
    raise exception 'context must be an object' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  perform public.ai_job_expire();

  -- A finished job is kept for 24 hours at most, closed or not.
  delete from public.ai_job
  where household_id = caller_household
    and status in ('done', 'failed', 'cancelled', 'superseded')
    and finished_at < now() - interval '24 hours';

  select * into existing from public.ai_job where household_id = caller_household and client_key = job_client_key;
  if found then
    return jsonb_build_object('created', false, 'job', to_jsonb(existing));
  end if;

  if job_kind = 'suggest' then
    select * into existing
    from public.ai_job
    where household_id = caller_household and kind = 'suggest' and status in ('queued', 'running')
    order by created_at, id
    limit 1;
    if found then
      return jsonb_build_object('created', false, 'job', to_jsonb(existing));
    end if;
  end if;

  if job_kind = 'analyze' then
    update public.ai_job
    set status = 'superseded', finished_at = now(), result = null, error_code = null
    where household_id = caller_household
      and kind = 'analyze'
      and status in ('queued', 'running', 'done')
      and context ->> 'siteId' is not distinct from job_context ->> 'siteId'
      and context ->> 'location' is not distinct from job_context ->> 'location';
  end if;

  select count(*) into active_count
  from public.ai_job
  where household_id = caller_household and status in ('queued', 'running');
  if active_count >= 3 then
    raise exception 'the queue is full' using errcode = 'MK430';
  end if;

  insert into public.ai_job (kind, client_key, context, expires_at)
  values (job_kind, job_client_key, job_context, queue_deadline + interval '10 seconds')
  returning * into added;
  return jsonb_build_object('created', true, 'job', to_jsonb(added));
end;
$$;

create or replace function public.ensure_user_defaults()
returns void
language sql
set search_path = ''
as $$
  insert into public.recipe_site (domain)
  values ('koket.se'), ('tasteline.com'), ('ica.se'), ('arla.se')
  on conflict (household_id, domain) do nothing;

  insert into public.store (name, chain, external_store_id, url, offers_url, is_selected)
  select
    'Maxi ICA Stormarknad Östersund',
    'ICA',
    '1003733',
    'https://handlaprivatkund.ica.se/stores/1003733',
    'https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/',
    true
  where not exists (select 1 from public.store where household_id = (select public.my_household_id()))
  on conflict do nothing;
$$;

create or replace function public.finish_ai_job(job_id uuid, job_status text, job_result jsonb DEFAULT NULL::jsonb, job_error_code text DEFAULT NULL::text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'finish_ai_job needs a signed-in user' using errcode = '42501';
  end if;
  if job_status is null or job_status not in ('done', 'failed') then
    raise exception 'a job finishes as done or failed' using errcode = '22023';
  end if;

  perform public.ai_job_lock();
  update public.ai_job
  set status = job_status,
      result = case when job_status = 'done' then job_result else null end,
      error_code = case when job_status = 'failed' then job_error_code else null end,
      finished_at = now()
  where id = job_id
    and household_id = caller_household
    and (status = 'running' or (status = 'queued' and job_status = 'failed'));
  return found;
end;
$$;

create or replace function public.hide_shopping_line(plan_id uuid, line_key text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  previous public.shopping_line_override;
  hidden_at timestamptz;
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
    where plan.id = hide_shopping_line.plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  select item.* into previous
  from public.shopping_line_override as item
  where item.meal_plan_id = hide_shopping_line.plan_id
    and item.line_key = hide_shopping_line.line_key
    and item.household_id = caller_household;
  if previous.id is not null then
    previous.hidden := false;
  end if;

  insert into public.shopping_line_override (user_id, meal_plan_id, line_key, hidden)
  values (caller, hide_shopping_line.plan_id, hide_shopping_line.line_key, true)
  on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
  do update set hidden = true
  returning updated_at into hidden_at;

  return jsonb_build_object(
    'previous', case when previous.id is null then null else to_jsonb(previous) end,
    'hidden_updated_at', hidden_at
  );
end;
$$;

create or replace function public.mark_ai_job_seen(job_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'mark_ai_job_seen needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  update public.ai_job set seen_at = coalesce(seen_at, now())
  where id = job_id and household_id = caller_household;
  if not found then
    raise exception 'the job is not found' using errcode = 'MK431';
  end if;
end;
$$;

create or replace function public.mark_dish_cooked(dish uuid, site uuid, deductions jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  marked_at timestamptz := now();
  touched jsonb := '[]'::jsonb;
  need jsonb;
  need_ingredient uuid;
  need_unit text;
  remaining numeric;
  take numeric;
  stock record;
  seen text[] := '{}';
begin
  if caller is null then
    raise exception 'mark_dish_cooked needs a signed-in user' using errcode = '42501';
  end if;
  if dish is null or jsonb_typeof(deductions) is distinct from 'array' then
    raise exception 'dish and an array of deductions are required' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller_household::text));

  update public.meal_plan_recipe as target
  set cooked_at = marked_at
  where target.id = mark_dish_cooked.dish and target.household_id = caller_household and target.cooked_at is null;
  if not found then
    if exists (select 1 from public.meal_plan_recipe as other where other.id = mark_dish_cooked.dish and other.household_id = caller_household) then
      raise exception 'the dish is cooked already' using errcode = 'MK417';
    end if;
    raise exception 'no such dish' using errcode = 'P0002';
  end if;

  if jsonb_array_length(deductions) > 0 then
    if site is null or not exists (
      select 1 from public.pantry_site as own where own.id = mark_dish_cooked.site and own.household_id = caller_household
    ) then
      raise exception 'the place is gone' using errcode = 'MK410';
    end if;
  end if;

  for need in select value from jsonb_array_elements(deductions)
  loop
    need_ingredient := (need ->> 'ingredient_id')::uuid;
    need_unit := need ->> 'unit';
    remaining := (need ->> 'amount')::numeric;
    if need_ingredient is null or need_unit is null or remaining is null
       or remaining = 'NaN'::numeric or remaining <= 0 or remaining >= 1000000 then
      raise exception 'a deduction needs ingredient_id, unit and an amount above 0 and below 1000000' using errcode = '22023';
    end if;
    if (need_ingredient::text || ':' || need_unit) = any (seen) then
      raise exception 'an ingredient and unit may appear once' using errcode = '22023';
    end if;
    seen := seen || (need_ingredient::text || ':' || need_unit);

    for stock in
      select item.id, item.site_id, item.ingredient_id, item.location, item.amount, item.unit, item.label, item.created_at
      from public.pantry_item as item
      where item.household_id = caller_household
        and item.site_id = mark_dish_cooked.site
        and item.ingredient_id = need_ingredient
        and item.unit = need_unit
        and item.amount is not null
      order by item.created_at, item.id
      for update
    loop
      exit when remaining <= 0;
      take := least(stock.amount, remaining);
      remaining := remaining - take;
      touched := touched || jsonb_build_array(jsonb_build_object(
        'id', stock.id, 'site_id', stock.site_id, 'ingredient_id', stock.ingredient_id,
        'location', stock.location, 'amount', stock.amount, 'unit', stock.unit,
        'label', stock.label, 'created_at', stock.created_at, 'deducted', take,
        'deleted', stock.amount - take <= 0
      ));
      if stock.amount - take <= 0 then
        delete from public.pantry_item as gone where gone.id = stock.id and gone.household_id = caller_household;
      else
        update public.pantry_item as less set amount = stock.amount - take where less.id = stock.id and less.household_id = caller_household;
      end if;
    end loop;
  end loop;

  update public.meal_plan_recipe as ledger
  set cooked_deductions = touched
  where ledger.id = mark_dish_cooked.dish and ledger.household_id = caller_household;

  return jsonb_build_object('cooked_at', marked_at, 'rows', touched);
end;
$$;

create or replace function public.meal_plan_close_past()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'meal_plan_close_past needs a signed-in user' using errcode = '42501';
  end if;
  update public.meal_plan as plan
  set is_current = false
  where plan.household_id = caller_household and plan.is_current and plan.week_start < public.meal_plan_week_start();
end;
$$;

create or replace function public.meal_plan_lock()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'meal_plan_lock needs a signed-in user' using errcode = '42501';
  end if;
  if caller_household is null then
    raise exception 'the caller has no household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('meal_plan:' || caller_household::text));
  perform public.meal_plan_close_past();
end;
$$;

create or replace function public.merge_thing_items(photo uuid, pairs jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  merged integer;
  dups uuid[];
  targets uuid[];
  step integer;
  dup_count integer;
  gone integer;
  newest uuid;
begin
  if caller is null then
    raise exception 'merge_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(pairs) is distinct from 'array' or jsonb_array_length(pairs) > 100 then
    raise exception 'pairs must be a list of at most 100' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  with done as (
    update public.thing_item as dup
    set same_as = pair.target
    from jsonb_to_recordset(pairs) as pair(item uuid, target uuid)
    where dup.id = pair.item
      and dup.household_id = caller_household
      and dup.photo_id = photo
      and dup.same_as is null
      and not exists (select 1 from public.thing_item as pointing where pointing.same_as = dup.id)
      and exists (
        select 1
        from public.thing_item as kept
        join public.thing_place as kept_place on kept_place.id = kept.place_id and kept_place.household_id = kept.household_id
        join public.thing_place as dup_place on dup_place.id = dup.place_id and dup_place.household_id = dup.household_id
        where kept.id = pair.target
          and kept.household_id = caller_household
          and kept.same_as is null
          and kept.photo_id <> photo
          and kept_place.kind = 'part'
          and dup_place.kind = 'part'
          and kept_place.site_id = dup_place.site_id
          and kept_place.room_key = dup_place.room_key
      )
    returning dup.id, dup.same_as
  )
  select coalesce(array_agg(done.id order by done.id), '{}'), coalesce(array_agg(done.same_as order by done.id), '{}')
  into dups, targets
  from done;
  merged := coalesce(array_length(dups, 1), 0);

  for step in 1 .. merged loop
    select i.quantity into dup_count from public.thing_item as i where i.id = dups[step] and i.household_id = caller_household;
    if dup_count is null then
      continue;
    end if;
    select count(*) into gone from public.thing_change as c
    where c.item_id = targets[step] and c.household_id = caller_household and c.kind in ('take', 'refill', 'set');
    select c.id into newest from public.thing_change as c
    where c.item_id = dups[step] and c.household_id = caller_household
    order by c.created_at desc, c.id desc
    limit 1;
    delete from public.thing_change as c where c.item_id = targets[step] and c.household_id = caller_household;
    insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
    select caller, targets[step], c.kind, c.delta, c.quantity_after,
      case when c.id = newest and c.kind = 'card' and gone > 0 then least(gone, 9999) else c.cleared end,
      c.created_at
    from public.thing_change as c
    where c.item_id = dups[step] and c.household_id = caller_household;
    delete from public.thing_change as c where c.item_id = dups[step] and c.household_id = caller_household;
    update public.thing_item as i set quantity = dup_count where i.id = targets[step] and i.household_id = caller_household;
    update public.thing_item as i set quantity = null where i.id = dups[step] and i.household_id = caller_household;
  end loop;
  return merged;
end;
$$;

create or replace function public.pantry_lock()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'pantry_lock needs a signed-in user' using errcode = '42501';
  end if;
  if caller_household is null then
    raise exception 'the caller has no household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller_household::text));
end;
$$;

create or replace function public.pantry_place_has_item(ingredient uuid, place text, item_unit text, site uuid default null)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.pantry_item as other
    where other.household_id = (select public.my_household_id())
      and other.site_id = coalesce(
        site,
        (
          select own.id
          from public.pantry_site as own
          where own.household_id = (select public.my_household_id())
            and own.is_selected
        )
      )
      and other.ingredient_id = ingredient
      and other.location = place
      and (item_unit is null or other.unit is null or other.unit = item_unit)
  );
$$;

create or replace function public.pantry_session_site()
returns uuid
language sql
stable
set search_path = ''
as $$
  select own.id
  from public.pantry_site as own
  where own.household_id = (select public.my_household_id())
    and own.is_selected;
$$;

create or replace function public.pantry_site_item_counts()
returns table (site_id uuid, item_count integer)
language sql
stable
set search_path = ''
as $$
  select item.site_id, count(*)::integer
  from public.pantry_item as item
  where item.household_id = (select public.my_household_id())
  group by item.site_id;
$$;

create or replace function public.pantry_target_site(site uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  candidate uuid;
begin
  if caller is null then
    raise exception 'pantry_target_site needs a signed-in user' using errcode = '42501';
  end if;
  candidate := coalesce(site, public.pantry_selected_site());
  perform 1
  from public.pantry_site as own
  where own.id = candidate
    and own.household_id = caller_household
  for key share;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;
  return candidate;
end;
$$;

create or replace function public.relink_thing_items(links jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  total integer := 0;
  step integer;
begin
  if caller is null then
    raise exception 'relink_thing_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(links) is distinct from 'array' or jsonb_array_length(links) > 200 then
    raise exception 'links must be a list of at most 200' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  update public.thing_item as item
  set same_as = link.same_as
  from jsonb_to_recordset(links) as link(id uuid, same_as uuid)
  where link.same_as is not null
    and item.id = link.id
    and item.household_id = caller_household
    and item.same_as is null
    and item.quantity is null
    and link.same_as <> item.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = item.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.same_as and kept.household_id = caller_household and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;

  update public.thing_item as pointer
  set same_as = link.id
  from (
    select entry.id, pointed.value::uuid as pointer_id
    from jsonb_to_recordset(links) as entry(id uuid, pointed_by jsonb),
      lateral jsonb_array_elements_text(coalesce(entry.pointed_by, '[]'::jsonb)) as pointed(value)
  ) as link
  where pointer.id = link.pointer_id
    and pointer.household_id = caller_household
    and pointer.same_as is null
    and pointer.quantity is null
    and pointer.id <> link.id
    and not exists (select 1 from public.thing_item as pointing where pointing.same_as = pointer.id)
    and exists (select 1 from public.thing_item as kept where kept.id = link.id and kept.household_id = caller_household and kept.same_as is null);
  get diagnostics step = row_count;
  total := total + step;
  return total;
end;
$$;

create or replace function public.remember_thing(place uuid, thing_name text, thing_category text, replaces uuid default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  saved uuid;
begin
  if caller is null then
    raise exception 'remember_thing needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  perform 1 from public.thing_place where id = place and household_id = caller_household and kind = 'part';
  if not found then
    raise exception 'the place is not found' using errcode = 'MK440';
  end if;

  delete from public.thing_item
  where household_id = caller_household and source = 'noted' and lower(btrim(name)) = lower(btrim(thing_name));

  if (select count(*) from public.thing_item where household_id = caller_household and source = 'noted') >= 2000 then
    raise exception 'at most 2000 noted things' using errcode = 'MK441';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  values (null, place, thing_name, thing_category, 'high', 0, 'noted')
  returning id into saved;
  return saved;
end;
$$;

create or replace function public.remove_shopping_custom_item(item_id uuid)
returns setof shopping_custom_item
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'remove_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if item_id is null then
    raise exception 'item_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  return query
  delete from public.shopping_custom_item as own
  where own.id = item_id and own.household_id = caller_household
  returning own.*;
end;
$$;

create or replace function public.remove_thing_place(place uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_place;
  counted record;
  removed text[];
  left_in_room integer;
begin
  if caller is null then
    raise exception 'remove_thing_place needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_place where id = place and household_id = caller_household;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK440';
  end if;

  select c.things, c.cards into counted from public.thing_place_counts(target.site_id, target.room_key) c where c.place_id = place;
  select coalesce(array_agg(object_path), '{}') into removed
  from public.thing_photo where household_id = caller_household and place_id = place;

  delete from public.thing_place where household_id = caller_household and id = place;

  select count(*) into left_in_room from public.thing_place
  where household_id = caller_household and site_id = target.site_id and room_key = target.room_key;

  return jsonb_build_object('things', counted.things, 'cards', counted.cards, 'paths', to_jsonb(removed), 'room_left', left_in_room);
end;
$$;

create or replace function public.rename_thing_room(site uuid, in_room text, new_name text, new_key text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  source public.thing_place;
  target public.thing_place;
  shown text := new_name;
  merged integer := 0;
  moved integer := 0;
  existing_room text;
  all_moves jsonb := '[]'::jsonb;
  part_moves jsonb;
begin
  if caller is null then
    raise exception 'rename_thing_room needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  perform 1 from public.pantry_site where id = site and household_id = caller_household;
  if not found then
    raise exception 'the boende is not found' using errcode = 'MK440';
  end if;
  perform 1 from public.thing_place where site_id = site and household_id = caller_household and room_key = in_room;
  if not found then
    raise exception 'the room is not found' using errcode = 'MK440';
  end if;

  if new_key <> in_room then
    select room into existing_room from public.thing_place
    where site_id = site and household_id = caller_household and room_key = new_key order by created_at, id limit 1;
    if existing_room is not null then
      shown := existing_room;
    end if;
  end if;

  for source in
    select * from public.thing_place where site_id = site and household_id = caller_household and room_key = in_room order by created_at, id
  loop
    select * into target from public.thing_place
    where site_id = site and household_id = caller_household and room_key = new_key and part_key = source.part_key and id <> source.id;
    if found then
      -- A card file keeps its folder (the taker's; thing_photo_object_path_check),
      -- whoever in the household merges, also when the taker's account is gone.
      with moving as (
        select id, object_path as old_path from public.thing_photo where household_id = caller_household and place_id = source.id
      ), done as (
        update public.thing_photo ph
        set place_id = target.id,
          object_path = split_part(ph.object_path, '/', 1) || '/' || target.id::text || '/' || ph.id::text
            || case ph.media_type when 'image/jpeg' then '.jpg' else '.png' end
        from moving
        where ph.id = moving.id and ph.household_id = caller_household
        returning moving.old_path, ph.object_path as new_path
      )
      select coalesce(jsonb_agg(jsonb_build_object('from', old_path, 'to', new_path)), '[]'::jsonb) into part_moves from done;
      all_moves := all_moves || part_moves;
      update public.thing_item set place_id = target.id where household_id = caller_household and place_id = source.id;
      delete from public.thing_place where household_id = caller_household and id = source.id;
      merged := merged + 1;
    else
      update public.thing_place set room = shown, room_key = new_key where household_id = caller_household and id = source.id;
      moved := moved + 1;
    end if;
  end loop;

  return jsonb_build_object('merged', merged, 'moved', moved, 'moves', all_moves);
end;
$$;

create or replace function public.replace_box_things(box uuid, things jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  total integer;
begin
  if caller is null then
    raise exception 'replace_box_things needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 100 then
    raise exception 'things must be a list of at most 100' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  perform 1 from public.thing_place where id = box and household_id = caller_household and kind = 'box';
  if not found then
    raise exception 'the box is not found' using errcode = 'MK440';
  end if;

  -- The things that pointed at a written thing cannot exist: only things of cards are merged.
  delete from public.thing_item where place_id = box and household_id = caller_household and source = 'manual';

  insert into public.thing_item (photo_id, place_id, name, category, confidence, position, source)
  select null, box, entry.value ->> 'name', entry.value ->> 'category', 'high', (entry.ordinality - 1)::integer, 'manual'
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  get diagnostics total = row_count;
  return total;
end;
$$;

create or replace function public.restore_pantry_item(item jsonb, site uuid default null)
returns pantry_item
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target uuid;
  item_id uuid;
  item_site_id uuid;
  item_ingredient_id uuid;
  item_location text;
  item_amount numeric;
  item_unit text;
  item_label text;
  item_created_at timestamptz;
  restored public.pantry_item;
begin
  if caller is null then
    raise exception 'restore_pantry_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  item_site_id := (item ->> 'site_id')::uuid;
  item_ingredient_id := (item ->> 'ingredient_id')::uuid;
  item_location := item ->> 'location';
  item_amount := (item ->> 'amount')::numeric;
  item_unit := item ->> 'unit';
  item_label := item ->> 'label';
  item_created_at := coalesce(public.pantry_added_time(item ->> 'created_at'), now());
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(coalesce(item_site_id, site));

  if public.pantry_place_has_item(item_ingredient_id, item_location, item_unit, target) then
    raise exception 'the location has the item again' using errcode = '23505';
  end if;

  insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
  values (item_id, target, item_ingredient_id, item_location, item_amount, item_unit, item_label, item_created_at)
  returning * into restored;
  return restored;
end;
$$;

create or replace function public.restore_pantry_removal(operation_id uuid, site uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  fallback uuid;
  fallback_resolved boolean := false;
  row_site uuid;
  readable boolean;
  stored jsonb;
  element record;
  item_id uuid;
  item_ingredient_id uuid;
  item_location text;
  item_amount numeric;
  item_unit text;
  item_label text;
  item_created_at timestamptz;
  stored_label text;
  restored jsonb := '[]'::jsonb;
  skipped integer := 0;
begin
  if caller is null then
    raise exception 'restore_pantry_removal needs a signed-in user' using errcode = '42501';
  end if;
  if operation_id is null then
    raise exception 'restore_pantry_removal needs an operation id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  delete from public.pantry_removal as old
  where old.household_id = caller_household
    and old.created_at < now() - interval '1 day';

  -- One "Ångra" per record: it goes now, and comes back if anything below fails.
  delete from public.pantry_removal as record
  where record.household_id = caller_household
    and record.id = operation_id
  returning record.removed_rows into stored;
  if not found then
    raise exception 'no removal with that operation id' using errcode = 'P0002';
  end if;

  for element in
    select stored_row.value
    from jsonb_array_elements(stored) with ordinality as stored_row (value, position)
    order by stored_row.position
  loop
    -- The row's own place, or one resolved once for the rows without one.
    readable := true;
    begin
      row_site := (element.value ->> 'site_id')::uuid;
    exception
      when data_exception then
        readable := false;
    end;
    if readable and row_site is null then
      if not fallback_resolved then
        fallback_resolved := true;
        if site is null then
          fallback := public.pantry_selected_site();
        else
          select own.id into fallback
          from public.pantry_site as own
          where own.id = site
            and own.household_id = caller_household;
        end if;
      end if;
      row_site := fallback;
    end if;
    if not readable or row_site is null then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      item_id := (element.value ->> 'id')::uuid;
      item_ingredient_id := (element.value ->> 'ingredient_id')::uuid;
      item_location := element.value ->> 'location';
      item_amount := (element.value ->> 'amount')::numeric;
      item_unit := element.value ->> 'unit';
      item_label := element.value ->> 'label';
      -- A record stored before 20261026211834_pantry_label.sql has no time: now().
      item_created_at := coalesce(public.pantry_added_time(element.value ->> 'created_at'), now());
      if item_id is null then
        raise exception 'a stored row needs its id' using errcode = '22023';
      end if;

      -- A place that is gone, a taken id, or the item in the location again:
      -- skipped, the row there stays. The place is held until the
      -- transaction ends, so it cannot go before the insert.
      perform 1
      from public.pantry_site as own
      where own.id = row_site
        and own.household_id = caller_household
      for key share;
      if not found
        or exists (select 1 from public.pantry_item as other where other.id = item_id)
        or public.pantry_place_has_item(item_ingredient_id, item_location, item_unit, row_site) then
        skipped := skipped + 1;
      else
        begin
          insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
          values (item_id, row_site, item_ingredient_id, item_location, item_amount, item_unit, item_label, item_created_at)
          returning label into stored_label;
        exception
          -- A label the check refuses now: the row goes back without it. Any
          -- other refusal fails again here and is skipped below.
          when check_violation then
            insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
            values (item_id, row_site, item_ingredient_id, item_location, item_amount, item_unit, null, item_created_at)
            returning label into stored_label;
        end;
        restored := restored || jsonb_build_object(
          'id', item_id,
          'site_id', row_site,
          'ingredient_id', item_ingredient_id,
          'location', item_location,
          'amount', item_amount,
          'unit', item_unit,
          'label', stored_label,
          'created_at', item_created_at
        );
      end if;
    exception
      -- A malformed stored row (22xxx), the catalog ingredient gone (23503),
      -- an id another user's row has (23505, hidden by RLS above), or a row
      -- the table no longer accepts: skipped, the rest go back.
      when data_exception or foreign_key_violation or unique_violation or check_violation or not_null_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object('restored', restored, 'skipped', skipped);
end;
$$;

create or replace function public.restore_plan_recipe(dish jsonb)
returns meal_plan_recipe
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  dish_id uuid;
  dish_plan_id uuid;
  dish_recipe_id uuid;
  dish_title text;
  dish_servings integer;
  dish_position integer;
  dish_weekday smallint;
  restored public.meal_plan_recipe;
begin
  if caller is null then
    raise exception 'restore_plan_recipe needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(dish) is distinct from 'object' then
    raise exception 'dish must be an object' using errcode = '22023';
  end if;

  dish_id := (dish ->> 'id')::uuid;
  dish_plan_id := (dish ->> 'meal_plan_id')::uuid;
  dish_recipe_id := (dish ->> 'recipe_id')::uuid;
  dish_title := dish ->> 'recipe_title';
  dish_servings := (dish ->> 'servings')::integer;
  dish_position := (dish ->> 'position')::integer;
  dish_weekday := (dish ->> 'weekday')::smallint;
  if dish_id is null or dish_plan_id is null or dish_position is null or dish_position < 0 then
    raise exception 'dish needs its id, plan and position' using errcode = '22023';
  end if;
  if dish_title is null or btrim(dish_title) = '' or char_length(dish_title) > 200 then
    raise exception 'recipe_title must have 1 to 200 characters' using errcode = '22023';
  end if;
  if dish_servings is null or dish_servings not between 1 and 1000 then
    raise exception 'servings must be 1 to 1000' using errcode = '22023';
  end if;
  if dish_weekday is not null and dish_weekday not between 1 and 7 then
    raise exception 'weekday must be 1 to 7' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = dish_plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  insert into public.meal_plan_recipe (id, meal_plan_id, recipe_id, recipe_title, servings, position, weekday)
  values (dish_id, dish_plan_id, dish_recipe_id, dish_title, dish_servings, dish_position, dish_weekday)
  returning * into restored;
  return restored;
end;
$$;

create or replace function public.restore_shopping_line(plan_id uuid, line_key text, previous jsonb, hidden_updated_at timestamptz DEFAULT NULL::timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  previous_id uuid;
  saved public.shopping_line_override;
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
  if previous is not null and jsonb_typeof(previous) = 'null' then
    previous := null;
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = restore_shopping_line.plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if previous is not null then
    previous_id := (previous ->> 'id')::uuid;
    if previous_id is null
      or (previous ->> 'meal_plan_id')::uuid is distinct from restore_shopping_line.plan_id
      or (previous ->> 'line_key') is distinct from restore_shopping_line.line_key
      or jsonb_typeof(previous -> 'hidden') is distinct from 'boolean'
    then
      raise exception 'previous is not this line''s override' using errcode = '22023';
    end if;
  end if;

  select item.* into saved
  from public.shopping_line_override as item
  where item.meal_plan_id = restore_shopping_line.plan_id
    and item.line_key = restore_shopping_line.line_key
    and item.household_id = caller_household;

  if hidden_updated_at is not null and (saved.id is null or saved.updated_at is distinct from hidden_updated_at) then
    -- Changed since the hide: only the hidden flag goes back; the current amount stays.
    update public.shopping_line_override as item
    set hidden = coalesce((previous ->> 'hidden')::boolean, false)
    where item.id = saved.id and item.hidden;
  elsif previous is null then
    delete from public.shopping_line_override as item
    where item.meal_plan_id = restore_shopping_line.plan_id
      and item.line_key = restore_shopping_line.line_key
      and item.household_id = caller_household;
  else
    -- Another row for the line (it was cleared and made again meanwhile) gives way to the one put back.
    delete from public.shopping_line_override as item
    where item.meal_plan_id = restore_shopping_line.plan_id
      and item.line_key = restore_shopping_line.line_key
      and item.household_id = caller_household
      and item.id <> previous_id;

    insert into public.shopping_line_override (id, user_id, meal_plan_id, line_key, amount, base_amount, hidden)
    values (
      previous_id,
      caller,
      restore_shopping_line.plan_id,
      restore_shopping_line.line_key,
      (previous ->> 'amount')::numeric,
      case when (previous ->> 'amount') is null then null else (previous ->> 'base_amount')::numeric end,
      (previous ->> 'hidden')::boolean
    )
    on conflict (id) do update
    set amount = excluded.amount, base_amount = excluded.base_amount, hidden = excluded.hidden
    where shopping_line_override.meal_plan_id = excluded.meal_plan_id
      and shopping_line_override.line_key = excluded.line_key;

    if not exists (
      select 1
      from public.shopping_line_override as item
      where item.id = previous_id
        and item.meal_plan_id = restore_shopping_line.plan_id
        and item.line_key = restore_shopping_line.line_key
        and item.household_id = caller_household
    ) then
      raise exception 'previous is not this line''s override' using errcode = '22023';
    end if;
  end if;

  delete from public.shopping_line_override as item
  where item.meal_plan_id = restore_shopping_line.plan_id
    and item.line_key = restore_shopping_line.line_key
    and item.household_id = caller_household
    and item.amount is null
    and not item.hidden;
end;
$$;

create or replace function public.restore_thing_count(item uuid, amount integer, changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  current_count integer;
begin
  if caller is null then
    raise exception 'restore_thing_count needs a signed-in user' using errcode = '42501';
  end if;
  if amount is null or amount not between 0 and 9999 then
    raise exception 'amount must be 0 to 9999' using errcode = '22023';
  end if;
  if jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) > 50 then
    raise exception 'changes must be a list of at most 50' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select i.quantity into current_count from public.thing_item as i where i.id = item and i.household_id = caller_household and i.same_as is null for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if current_count is not null then
    raise exception 'the thing is counted again' using errcode = 'MK443';
  end if;

  update public.thing_item as i set quantity = amount where i.id = item and i.household_id = caller_household;
  insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
  select caller, item, entry.kind, entry.delta, entry.quantity_after, entry.cleared, coalesce(entry.created_at, now())
  from jsonb_to_recordset(changes) as entry(kind text, delta integer, quantity_after integer, cleared integer, created_at timestamptz)
  order by entry.created_at;
end;
$$;

create or replace function public.save_pantry_photo(site uuid, place text, photo_id uuid, photo_path text, photo_type text, photo_width integer, photo_height integer, photo_taken_at timestamptz, photo_reading jsonb, photo_points jsonb DEFAULT NULL::jsonb)
returns table (outcome text, previous_path text)
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  stored_taken_at timestamptz;
  replaced text;
begin
  if caller is null then
    raise exception 'save_pantry_photo needs a signed-in user' using errcode = '42501';
  end if;
  if site is null then
    raise exception 'save_pantry_photo needs a place' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  if not exists (
    select 1
    from public.pantry_site as own
    where own.id = site
      and own.household_id = caller_household
  ) then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  select stored.taken_at into stored_taken_at
  from public.pantry_photo as stored
  where stored.household_id = caller_household
    and stored.site_id = site
    and stored.location = place;
  if found and stored_taken_at > photo_taken_at then
    return query select 'stale'::text, null::text;
    return;
  end if;

  delete from public.pantry_photo as old
  where old.household_id = caller_household
    and old.site_id = site
    and old.location = place
  returning old.object_path into replaced;

  insert into public.pantry_photo (
    id, site_id, location, object_path, media_type, width, height, taken_at, reading, points
  )
  values (
    photo_id, site, place, photo_path, photo_type, photo_width, photo_height, photo_taken_at, photo_reading, photo_points
  );

  return query select 'saved'::text, replaced;
end;
$$;

create or replace function public.save_pantry_site(site_id uuid, site_name text, site_normalized_name text, mode text)
returns pantry_site
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  max_places constant integer := 10;
  places integer;
  saved public.pantry_site;
begin
  if caller is null then
    raise exception 'save_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if save_pantry_site.site_id is null
    or site_name is null
    or site_normalized_name is null
    or save_pantry_site.mode is null
    or save_pantry_site.mode not in ('add', 'rename')
  then
    raise exception 'save_pantry_site needs an id, a name, a normalized name and mode add or rename'
      using errcode = '22023';
  end if;

  perform public.pantry_lock();
  perform public.pantry_selected_site();

  if save_pantry_site.mode = 'rename' then
    update public.pantry_site as own
    set name = site_name, normalized_name = site_normalized_name
    where own.id = save_pantry_site.site_id
      and own.household_id = caller_household
    returning own.* into saved;
    if not found then
      raise exception 'the place is not found' using errcode = 'MK410';
    end if;
    return saved;
  end if;

  -- Mode add with an id the caller has already: a retry after a lost answer
  -- when the place has the same normalized name, which gets the name as
  -- typed now. A place with another name was renamed since (on another
  -- device, say), and a stale retry must never take that name back: MK424,
  -- and nothing changes.
  select own.* into saved
  from public.pantry_site as own
  where own.id = save_pantry_site.site_id
    and own.household_id = caller_household
  for update;
  if found then
    if saved.normalized_name is distinct from site_normalized_name then
      raise exception 'the id belongs to a place with another name' using errcode = 'MK424';
    end if;
    update public.pantry_site as own
    set name = site_name
    where own.id = save_pantry_site.site_id
      and own.household_id = caller_household
    returning own.* into saved;
    return saved;
  end if;

  -- The trigger holds the limit for every insert; checked here first, so the
  -- answer does not depend on the order of the checks.
  select count(*) into places
  from public.pantry_site as own
  where own.household_id = caller_household;
  if places >= max_places then
    raise exception 'a user has at most % places', max_places using errcode = 'MK422';
  end if;

  -- clock_timestamp(), not now(): Hemma, created above for a user without
  -- places in this same transaction, has now(), so the new place comes after
  -- it in the order of creation instead of tying with it.
  insert into public.pantry_site (id, user_id, name, normalized_name, is_selected, created_at)
  values (save_pantry_site.site_id, caller, site_name, site_normalized_name, false, clock_timestamp())
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.save_product_choice(choice jsonb, expected_id uuid, expected_updated_at timestamptz)
returns product_choice
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  choice_ingredient uuid;
  choice_store uuid;
  current_choice public.product_choice;
  saved public.product_choice;
begin
  if caller is null then
    raise exception 'save_product_choice needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(choice) is distinct from 'object' then
    raise exception 'choice must be an object' using errcode = '22023';
  end if;
  choice_ingredient := (choice ->> 'ingredient_id')::uuid;
  choice_store := (choice ->> 'store_id')::uuid;
  if choice_ingredient is null or choice_store is null or (expected_id is null) <> (expected_updated_at is null) then
    raise exception 'choice needs its ingredient and store, and the expected choice both or neither of id and updated_at'
      using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtextextended('product_choice:' || caller_household::text, 0));

  select own.* into current_choice
  from public.product_choice as own
  where own.household_id = caller_household and own.ingredient_id = choice_ingredient and own.store_id = choice_store;

  if found then
    if current_choice.product_name = (choice ->> 'product_name')
      and current_choice.package_size is not distinct from (choice ->> 'package_size')
      and current_choice.url is not distinct from (choice ->> 'url')
    then
      return current_choice;
    end if;
    if expected_id is null
      or current_choice.id <> expected_id
      or current_choice.updated_at <> expected_updated_at
    then
      raise exception 'the product choice has changed' using errcode = 'MK409';
    end if;
    update public.product_choice as own
    set
      product_name = choice ->> 'product_name',
      package_size = choice ->> 'package_size',
      url = choice ->> 'url'
    where own.id = current_choice.id
    returning own.* into saved;
    return saved;
  end if;

  if expected_id is not null then
    raise exception 'the product choice has been removed' using errcode = 'MK409';
  end if;
  insert into public.product_choice (user_id, ingredient_id, store_id, product_name, package_size, url)
  values (
    caller,
    choice_ingredient,
    choice_store,
    choice ->> 'product_name',
    choice ->> 'package_size',
    choice ->> 'url'
  )
  returning * into saved;
  return saved;
end;
$$;

create or replace function public.save_store(store jsonb, mode text, make_selected boolean)
returns store
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  saved_id uuid;
  saved public.store;
begin
  if caller is null then
    raise exception 'save_store needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(store) is distinct from 'object' then
    raise exception 'store must be an object' using errcode = '22023';
  end if;
  saved_id := (store ->> 'id')::uuid;
  if saved_id is null or make_selected is null or mode is null or mode not in ('add', 'change') then
    raise exception 'store needs its id, mode add or change, and make_selected a value' using errcode = '22023';
  end if;

  perform public.store_lock();

  update public.store as own
  set
    name = store ->> 'name',
    chain = store ->> 'chain',
    external_store_id = store ->> 'external_store_id',
    address = store ->> 'address',
    url = store ->> 'url',
    offers_url = case when store ? 'offers_url' then store ->> 'offers_url' else own.offers_url end
  where own.id = saved_id and own.household_id = caller_household
  returning own.* into saved;

  if not found then
    if mode = 'change' then
      raise exception 'the store is not found' using errcode = 'P0002';
    end if;
    insert into public.store (id, user_id, name, chain, external_store_id, address, url, offers_url, is_selected)
    values (
      saved_id,
      caller,
      store ->> 'name',
      store ->> 'chain',
      store ->> 'external_store_id',
      store ->> 'address',
      store ->> 'url',
      store ->> 'offers_url',
      false
    )
    returning * into saved;
  end if;

  if not saved.is_selected
    and (make_selected or not exists (select 1 from public.store as own where own.household_id = caller_household and own.is_selected))
  then
    update public.store as own
    set is_selected = false
    where own.household_id = caller_household and own.is_selected;

    update public.store as own
    set is_selected = true
    where own.id = saved_id and own.household_id = caller_household
    returning own.* into saved;
  end if;

  return saved;
end;
$$;

create or replace function public.save_store_offers(store uuid, week date, items jsonb, replace_source text DEFAULT NULL::text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  today date := (now() at time zone 'Europe/Stockholm')::date;
  this_week date;
  total integer;
begin
  if caller is null then
    raise exception 'save_store_offers needs a signed-in user' using errcode = '42501';
  end if;
  if save_store_offers.store is null or week is null or jsonb_typeof(items) is distinct from 'array'
    or (replace_source is not null and replace_source not in ('link', 'text', 'photo'))
  then
    raise exception 'store, week and an array of items are required' using errcode = '22023';
  end if;

  this_week := today - (extract(isodow from today)::integer - 1);
  if week not in (this_week, this_week + 7) then
    raise exception 'the week is over, or further ahead than next week' using errcode = 'MK416';
  end if;

  if not exists (
    select 1 from public.store as own where own.id = save_store_offers.store and own.household_id = caller_household
  ) then
    raise exception 'the store is not found' using errcode = 'P0002';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtextextended('store_offer:' || caller_household::text || ':' || save_store_offers.store::text, 0));

  if replace_source is not null then
    delete from public.store_offer as offer
    where offer.household_id = caller_household
      and offer.store_id = save_store_offers.store
      and offer.week_start = week
      and offer.source = replace_source;
  end if;

  insert into public.store_offer as offer (
    user_id, store_id, week_start, label, name, ingredient_id, section, price, note, member_only, valid_to, source, regular_price, saving_percent, created_at
  )
  select
    caller,
    save_store_offers.store,
    week,
    item.label,
    item.name,
    item.ingredient_id,
    item.section,
    item.price,
    item.note,
    coalesce(item.member_only, false),
    item.valid_to,
    item.source,
    item.regular_price,
    item.saving_percent,
    now() + make_interval(secs => (item.ord / 1000000.0)::double precision)
  from (
    select distinct on (lower(regexp_replace(entry.label, '\s+', ' ', 'g')))
      entry.*,
      ord
    from jsonb_array_elements(items) with ordinality as element (value, ord)
    cross join lateral jsonb_to_record(element.value) as entry (
      label text,
      name text,
      ingredient_id uuid,
      section text,
      price text,
      note text,
      member_only boolean,
      valid_to date,
      source text,
      regular_price numeric,
      saving_percent smallint
    )
    order by lower(regexp_replace(entry.label, '\s+', ' ', 'g')), ord
  ) as item
  order by item.ord
  on conflict (household_id, store_id, week_start, label_key) do update
  set
    name = excluded.name,
    ingredient_id = excluded.ingredient_id,
    section = excluded.section,
    price = excluded.price,
    note = excluded.note,
    member_only = excluded.member_only,
    valid_to = excluded.valid_to,
    source = excluded.source,
    regular_price = excluded.regular_price,
    saving_percent = excluded.saving_percent,
    created_at = excluded.created_at;

  select count(*) into total
  from public.store_offer as offer
  where offer.household_id = caller_household and offer.store_id = save_store_offers.store and offer.week_start = week;
  if total > 300 then
    raise exception 'a store has at most 300 offers a week' using errcode = 'MK422';
  end if;

  delete from public.store_offer as offer
  where offer.household_id = caller_household and offer.week_start < this_week;

  return total;
end;
$$;

create or replace function public.save_thing_card(photo uuid, things jsonb, note text DEFAULT NULL::text, hidden_count integer DEFAULT 0)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_photo;
  removed text[];
  prev record;
  fresh record;
begin
  if caller is null then
    raise exception 'save_thing_card needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 60 then
    raise exception 'things must be a list of at most 60' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_photo where id = photo and household_id = caller_household;
  if not found or target.status <> 'reading' then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_item (
    photo_id, place_id, name, category, where_hint, confidence, position, box_left, box_top, box_width, box_height, quantity
  )
  select
    photo,
    target.place_id,
    entry.value ->> 'name',
    entry.value ->> 'category',
    entry.value ->> 'where_hint',
    entry.value ->> 'confidence',
    (entry.ordinality - 1)::integer,
    case when box.ok then box.l end,
    case when box.ok then box.t end,
    case when box.ok then box.w end,
    case when box.ok then box.h end,
    -- Nested, so the text is cast only once it is known to be a number.
    case when jsonb_typeof(entry.value -> 'count') = 'number' then
      case
        when (entry.value ->> 'count')::numeric between 1 and 999
          and (entry.value ->> 'count')::numeric = trunc((entry.value ->> 'count')::numeric)
        then (entry.value ->> 'count')::numeric::integer
      end
    end
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality)
  cross join lateral (
    select raw.l, raw.t, raw.w, raw.h,
      coalesce(
        raw.l >= 0 and raw.t >= 0 and raw.w > 0 and raw.h > 0 and raw.l + raw.w <= 1.0001 and raw.t + raw.h <= 1.0001,
        false
      ) as ok
    from (
      select
        case when jsonb_typeof(entry.value #> '{box,left}') = 'number' and abs((entry.value #>> '{box,left}')::numeric) <= 2 then round((entry.value #>> '{box,left}')::numeric, 6)::real end as l,
        case when jsonb_typeof(entry.value #> '{box,top}') = 'number' and abs((entry.value #>> '{box,top}')::numeric) <= 2 then round((entry.value #>> '{box,top}')::numeric, 6)::real end as t,
        case when jsonb_typeof(entry.value #> '{box,width}') = 'number' and abs((entry.value #>> '{box,width}')::numeric) <= 2 then round((entry.value #>> '{box,width}')::numeric, 6)::real end as w,
        case when jsonb_typeof(entry.value #> '{box,height}') = 'number' and abs((entry.value #>> '{box,height}')::numeric) <= 2 then round((entry.value #>> '{box,height}')::numeric, 6)::real end as h
    ) as raw
  ) as box;

  -- Ta om: the counts of the replaced card, by name. A föremål the new card did
  -- not count takes over the old count and its history (copied: the old rows go
  -- with the replaced card below).
  if target.replaces_photo_id is not null then
    for prev in
      select i.id, i.quantity, lower(btrim(i.name)) as name_key
      from public.thing_item as i
      join public.thing_photo as ph on ph.id = i.photo_id and ph.household_id = i.household_id
      where i.photo_id = target.replaces_photo_id and i.household_id = caller_household and i.same_as is null and i.quantity is not null
        and ph.place_id = target.place_id
      order by i.position, i.id
    loop
      select n.id, n.quantity into fresh
      from public.thing_item as n
      where n.photo_id = photo and n.household_id = caller_household and lower(btrim(n.name)) = prev.name_key
      order by n.position, n.id
      limit 1;
      if not found or fresh.quantity is not null then
        continue;
      end if;
      update public.thing_item as n set quantity = prev.quantity where n.id = fresh.id and n.household_id = caller_household;
      insert into public.thing_change (user_id, item_id, kind, delta, quantity_after, cleared, created_at)
      select caller, fresh.id, c.kind, c.delta, c.quantity_after, c.cleared, c.created_at
      from public.thing_change as c
      where c.item_id = prev.id and c.household_id = caller_household;
    end loop;
  end if;

  -- The history of each föremål the new card counted starts with the card; after
  -- Ta om it says how many changes of the replaced card's count went.
  insert into public.thing_change (user_id, item_id, kind, quantity_after, cleared)
  select caller, i.id, 'card', i.quantity,
    nullif(least(9999, (
      select count(*)
      from public.thing_change as c
      join public.thing_item as p on p.id = c.item_id and p.household_id = c.household_id
      where target.replaces_photo_id is not null
        and p.photo_id = target.replaces_photo_id
        and p.household_id = caller_household
        and p.same_as is null
        and lower(btrim(p.name)) = lower(btrim(i.name))
        and c.kind in ('take', 'refill', 'set')
    )), 0)
  from public.thing_item as i
  where i.photo_id = photo and i.household_id = caller_household and i.quantity is not null
    and not exists (select 1 from public.thing_change as c where c.item_id = i.id and c.household_id = caller_household);

  update public.thing_photo
  set status = 'done', error_code = null, unseen_note = note, unseen_count = coalesce(hidden_count, 0)
  where id = photo and household_id = caller_household;

  with older as (
    delete from public.thing_photo as old
    where old.household_id = caller_household
      and old.id = target.replaces_photo_id
      and old.place_id = target.place_id
      and old.id <> photo
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;

create or replace function public.save_thing_reading(photo uuid, things jsonb, note text DEFAULT NULL::text, hidden_count integer DEFAULT 0)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_photo;
  removed text[];
begin
  if caller is null then
    raise exception 'save_thing_reading needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(things) is distinct from 'array' or jsonb_array_length(things) > 60 then
    raise exception 'things must be a list of at most 60' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_photo where id = photo and household_id = caller_household;
  if not found or target.status <> 'reading' then
    raise exception 'the card is not found' using errcode = 'MK440';
  end if;

  insert into public.thing_item (photo_id, place_id, name, category, where_hint, confidence, position)
  select
    photo,
    target.place_id,
    entry.value ->> 'name',
    entry.value ->> 'category',
    entry.value ->> 'where_hint',
    entry.value ->> 'confidence',
    (entry.ordinality - 1)::integer
  from jsonb_array_elements(things) with ordinality as entry(value, ordinality);

  update public.thing_photo
  set status = 'done', error_code = null, unseen_note = note, unseen_count = coalesce(hidden_count, 0)
  where id = photo and household_id = caller_household;

  with older as (
    delete from public.thing_photo as old
    where old.household_id = caller_household
      and old.place_id = target.place_id
      and old.id <> photo
      and (old.created_at, old.id) < (target.created_at, target.id)
    returning old.object_path
  )
  select coalesce(array_agg(older.object_path), '{}') into removed from older;
  return removed;
end;
$$;

create or replace function public.search_things(terms text[], max_hits integer DEFAULT 40)
returns table (id uuid, name text, category text, where_hint text, photo_id uuid, place_id uuid, site_id uuid, site_name text, room text, room_key text, part text, kind text, taken_at timestamptz, source text, score real, seen_on bigint, noted boolean, quantity integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if cardinality(terms) > 50 then
    raise exception 'at most 50 search terms' using errcode = '22023';
  end if;
  return query
  with wanted as (
    select term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') as pattern
    from (select distinct lower(btrim(t)) as term from unnest(terms) as t) as cleaned
    where char_length(term) between 2 and 40
    order by term
    limit 8
  ),
  hits as (
    select i.id,
      max(
        case
          when i.name ilike '%' || w.pattern || '%' then 1.0
          when i.category ilike '%' || w.pattern || '%' then 0.5
          else extensions.word_similarity(w.term, i.name)
        end
      )::real as score
    from wanted w
    join public.thing_item i
      on i.name ilike '%' || w.pattern || '%'
      or i.category ilike '%' || w.pattern || '%'
      or extensions.word_similarity(w.term, i.name) >= 0.45
    where i.same_as is null
    group by i.id
  )
  select i.id, i.name, i.category, i.where_hint, i.photo_id, i.place_id, pl.site_id, s.name, pl.room, pl.room_key, pl.part, pl.kind,
    coalesce(ph.taken_at, i.created_at), case when i.source = 'manual' then 'manual' else 'photo' end, h.score,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id),
    i.source = 'noted',
    i.quantity
  from hits h
  join public.thing_item i on i.id = h.id
  join public.thing_place pl on pl.id = i.place_id and pl.household_id = i.household_id
  join public.pantry_site s on s.id = pl.site_id
  left join public.thing_photo ph on ph.id = i.photo_id and ph.household_id = i.household_id
  order by h.score desc, i.name, i.id
  limit greatest(1, least(coalesce(max_hits, 40), 100));
end;
$$;

create or replace function public.select_pantry_site(site_id uuid)
returns pantry_site
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  chosen public.pantry_site;
begin
  if caller is null then
    raise exception 'select_pantry_site needs a signed-in user' using errcode = '42501';
  end if;
  if select_pantry_site.site_id is null then
    raise exception 'select_pantry_site needs an id' using errcode = '22023';
  end if;

  perform public.pantry_lock();

  perform 1
  from public.pantry_site as own
  where own.id = select_pantry_site.site_id
    and own.household_id = caller_household
  for update;
  if not found then
    raise exception 'the place is not found' using errcode = 'MK410';
  end if;

  update public.pantry_site as own
  set is_selected = false
  where own.household_id = caller_household
    and own.is_selected
    and own.id <> select_pantry_site.site_id;

  update public.pantry_site as own
  set is_selected = true
  where own.id = select_pantry_site.site_id
    and own.household_id = caller_household
    and not own.is_selected;

  select own.* into chosen
  from public.pantry_site as own
  where own.id = select_pantry_site.site_id
    and own.household_id = caller_household;
  return chosen;
end;
$$;

create or replace function public.select_store(store_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'select_store needs a signed-in user' using errcode = '42501';
  end if;
  if select_store.store_id is null then
    raise exception 'store_id is required' using errcode = '22023';
  end if;

  perform public.store_lock();

  if not exists (
    select 1 from public.store as own where own.id = select_store.store_id and own.household_id = caller_household
  ) then
    raise exception 'the store is not found' using errcode = 'P0002';
  end if;

  update public.store as own
  set is_selected = false
  where own.household_id = caller_household and own.is_selected and own.id <> select_store.store_id;

  update public.store as own
  set is_selected = true
  where own.id = select_store.store_id and own.household_id = caller_household and not own.is_selected;
end;
$$;

create or replace function public.set_ai_job_result(job_id uuid, job_result jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'set_ai_job_result needs a signed-in user' using errcode = '42501';
  end if;
  perform public.ai_job_lock();
  update public.ai_job set result = job_result
  where id = job_id and household_id = caller_household and status = 'running';
  return found;
end;
$$;

create or replace function public.set_current_meal_plan(new_plan_id uuid, plan_name text, source_id uuid default null)
returns meal_plan
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  this_week date := public.meal_plan_week_start();
  created public.meal_plan;
  previous_id uuid;
begin
  if caller is null then
    raise exception 'set_current_meal_plan needs a signed-in user' using errcode = '42501';
  end if;
  if new_plan_id is null then
    raise exception 'new_plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();
  perform public.meal_plan_close_past();

  select plan.* into created
  from public.meal_plan as plan
  where plan.id = new_plan_id and plan.household_id = caller_household;
  if found then
    if created.week_start = this_week then
      return created;
    end if;
    raise exception 'the plan is no longer the current one' using errcode = '55000';
  end if;

  if source_id is not null then
    if not exists (
      select 1
      from public.meal_plan as plan
      where plan.id = source_id and plan.household_id = caller_household
    ) then
      raise exception 'the source plan is not found' using errcode = 'P0002';
    end if;
    if not exists (
      select 1
      from public.meal_plan_recipe as dish
      where dish.meal_plan_id = source_id and dish.household_id = caller_household and dish.recipe_id is not null
    ) then
      raise exception 'the source plan has no dish to use again' using errcode = '22023';
    end if;
  end if;

  select plan.id into previous_id
  from public.meal_plan as plan
  where plan.household_id = caller_household and plan.week_start = this_week;
  if previous_id is not null then
    if exists (select 1 from public.meal_plan_recipe as dish where dish.meal_plan_id = previous_id) then
      update public.meal_plan as plan
      set is_current = false, week_start = null
      where plan.id = previous_id;
    else
      delete from public.meal_plan as plan
      where plan.id = previous_id;
    end if;
  end if;

  insert into public.meal_plan (id, user_id, name, is_current, week_start)
  values (new_plan_id, caller, plan_name, true, this_week)
  returning * into created;

  if source_id is not null then
    insert into public.meal_plan_recipe (meal_plan_id, user_id, recipe_id, recipe_title, servings, position)
    select
      created.id,
      caller,
      dish.recipe_id,
      dish.recipe_title,
      dish.servings,
      (row_number() over (order by dish.position, dish.id) - 1)::integer
    from public.meal_plan_recipe as dish
    where dish.meal_plan_id = source_id
      and dish.household_id = caller_household
      and dish.recipe_id is not null;
  end if;

  return created;
end;
$$;

create or replace function public.set_pantry_items(items jsonb, replace_id uuid default null, site uuid default null)
returns setof pantry_item
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target uuid;
  item record;
  -- The row replace_id removed, for the first item of its ingredient.
  replaced_ingredient uuid;
  replaced_created_at timestamptz;
  replaced_label text;
  replaced_taken boolean := false;
  takes_replaced boolean;
  -- The other kind of row (unlimited or amounts) an item removed.
  gone_created_at timestamptz;
  gone_label text;
  -- What a new row gets, and a row an item lands on keeps the oldest of.
  inherited_created_at timestamptz;
  inherited_label text;
begin
  if caller is null then
    raise exception 'set_pantry_items needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then
    raise exception 'items must be a non-empty array' using errcode = '22023';
  end if;

  perform public.pantry_lock();
  target := public.pantry_target_site(site);

  if replace_id is not null then
    delete from public.pantry_item as old
    where old.id = replace_id
      and old.household_id = caller_household
      and old.site_id = target
      and not exists (
        select 1
        from jsonb_array_elements(items) as element (value)
        where (element.value ->> 'ingredient_id')::uuid = old.ingredient_id
          and element.value ->> 'location' = old.location
          and element.value ->> 'unit' is not distinct from old.unit
      )
    returning old.ingredient_id, old.created_at, old.label
    into replaced_ingredient, replaced_created_at, replaced_label;
  end if;

  for item in
    select
      (element.value ->> 'ingredient_id')::uuid as ingredient_id,
      element.value ->> 'location' as location,
      (element.value ->> 'amount')::numeric as amount,
      element.value ->> 'unit' as unit,
      -- A missing key keeps the label.
      element.value ? 'label' as has_label,
      element.value ->> 'label' as label,
      coalesce((element.value ->> 'label_if_empty')::boolean, false) as label_if_empty,
      public.pantry_added_time(element.value ->> 'inherit_created_at') as inherit_created_at,
      element.value ->> 'inherit_label' as inherit_label
    from jsonb_array_elements(items) with ordinality as element (value, position)
    order by element.position
  loop
    with gone as (
      delete from public.pantry_item as other
      where other.household_id = caller_household
        and other.site_id = target
        and other.ingredient_id = item.ingredient_id
        and other.location = item.location
        and (case when item.amount is null then other.unit is not null else other.unit is null end)
      returning other.created_at, other.label
    )
    select
      min(gone.created_at),
      (array_agg(gone.label order by gone.created_at) filter (where gone.label is not null))[1]
    into gone_created_at, gone_label
    from gone;

    takes_replaced := not replaced_taken
      and replaced_ingredient is not null
      and item.ingredient_id = replaced_ingredient;
    if takes_replaced then
      replaced_taken := true;
    end if;
    -- least() skips nulls.
    inherited_created_at := least(
      case when takes_replaced then replaced_created_at end,
      item.inherit_created_at,
      gone_created_at
    );
    inherited_label := coalesce(case when takes_replaced then replaced_label end, item.inherit_label, gone_label);

    return query
      insert into public.pantry_item as existing (site_id, ingredient_id, location, amount, unit, label, created_at)
      values (
        target,
        item.ingredient_id,
        item.location,
        item.amount,
        item.unit,
        case
          when item.has_label and not item.label_if_empty then item.label
          when item.has_label then coalesce(inherited_label, item.label)
          else inherited_label
        end,
        coalesce(inherited_created_at, now())
      )
      on conflict on constraint pantry_item_household_site_ingredient_location_unit_key
        do update set
          amount = excluded.amount,
          created_at = least(existing.created_at, inherited_created_at),
          label = case
            when item.has_label and not item.label_if_empty and item.label is not null then item.label
            -- Removed only from the row being edited; another row keeps its own.
            when item.has_label and not item.label_if_empty and existing.id = replace_id then null
            when item.has_label and not item.label_if_empty then existing.label
            when item.has_label then coalesce(existing.label, inherited_label, item.label)
            else coalesce(existing.label, inherited_label)
          end
      returning existing.*;
  end loop;
end;
$$;

create or replace function public.set_pantry_photo_points(photo_id uuid, photo_points jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'set_pantry_photo_points needs a signed-in user' using errcode = '42501';
  end if;
  if photo_points is null or jsonb_typeof(photo_points) <> 'array' or jsonb_array_length(photo_points) = 0 then
    return false;
  end if;

  update public.pantry_photo as photo
  set points = photo_points
  where photo.id = photo_id
    and photo.household_id = caller_household
    and photo.points is null
    and public.pantry_photo_points_valid(photo_points, photo.reading);
  return found;
end;
$$;

create or replace function public.set_shopping_check(plan_id uuid, line_key text, checked boolean)
returns void
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  own_item boolean;
begin
  if caller is null then
    raise exception 'set_shopping_check needs a signed-in user' using errcode = '42501';
  end if;
  if set_shopping_check.line_key is null or set_shopping_check.checked is null then
    raise exception 'line_key and checked are required' using errcode = '22023';
  end if;
  own_item := left(set_shopping_check.line_key, 2) = 'c:';
  if set_shopping_check.plan_id is null and not own_item then
    raise exception 'plan_id is required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if own_item then
    if set_shopping_check.checked then
      insert into public.shopping_check (user_id, meal_plan_id, line_key)
      values (caller, null, set_shopping_check.line_key)
      on conflict (household_id, line_key) where meal_plan_id is null do nothing;
    else
      delete from public.shopping_check as item
      where item.line_key = set_shopping_check.line_key
        and item.household_id = caller_household;
    end if;
    return;
  end if;

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = set_shopping_check.plan_id and plan.household_id = caller_household and plan.is_current
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
      and item.household_id = caller_household;
  end if;
end;
$$;

create or replace function public.set_shopping_line_amount(plan_id uuid, line_key text, amount numeric, base_amount numeric DEFAULT NULL::numeric)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
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
    where plan.id = set_shopping_line_amount.plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  if set_shopping_line_amount.amount is null then
    delete from public.shopping_line_override as item
    where item.meal_plan_id = set_shopping_line_amount.plan_id
      and item.line_key = set_shopping_line_amount.line_key
      and item.household_id = caller_household
      and not item.hidden;
    update public.shopping_line_override as item
    set amount = null, base_amount = null
    where item.meal_plan_id = set_shopping_line_amount.plan_id
      and item.line_key = set_shopping_line_amount.line_key
      and item.household_id = caller_household
      and item.amount is not null;
  else
    insert into public.shopping_line_override (user_id, meal_plan_id, line_key, amount, base_amount)
    values (
      caller,
      set_shopping_line_amount.plan_id,
      set_shopping_line_amount.line_key,
      set_shopping_line_amount.amount,
      set_shopping_line_amount.base_amount
    )
    on conflict on constraint shopping_line_override_meal_plan_id_line_key_key
    do update set amount = excluded.amount, base_amount = excluded.base_amount;
  end if;
end;
$$;

create or replace function public.set_thing_quantity(item uuid, amount integer)
returns table (change_id uuid, quantity_now integer)
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  kept uuid;
  saved uuid;
begin
  if caller is null then
    raise exception 'set_thing_quantity needs a signed-in user' using errcode = '42501';
  end if;
  if amount is null or amount not between 0 and 9999 then
    raise exception 'amount must be 0 to 9999' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.household_id = caller_household;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  update public.thing_item as i set quantity = amount where i.id = kept and i.household_id = caller_household;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  insert into public.thing_change (user_id, item_id, kind, quantity_after)
  values (caller, kept, 'set', amount)
  returning id into saved;
  return query select saved, amount;
end;
$$;

create or replace function public.show_shopping_line(plan_id uuid, line_key text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'show_shopping_line needs a signed-in user' using errcode = '42501';
  end if;
  if show_shopping_line.plan_id is null or show_shopping_line.line_key is null then
    raise exception 'plan_id and line_key are required' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  if not exists (
    select 1
    from public.meal_plan as plan
    where plan.id = show_shopping_line.plan_id and plan.household_id = caller_household and plan.is_current
  ) then
    raise exception 'the plan is not the current one' using errcode = '55000';
  end if;

  delete from public.shopping_line_override as item
  where item.meal_plan_id = show_shopping_line.plan_id
    and item.line_key = show_shopping_line.line_key
    and item.household_id = caller_household
    and item.amount is null;
  update public.shopping_line_override as item
  set hidden = false
  where item.meal_plan_id = show_shopping_line.plan_id
    and item.line_key = show_shopping_line.line_key
    and item.household_id = caller_household
    and item.hidden;
end;
$$;

create or replace function public.stop_thing_count(item uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  kept uuid;
  before_count integer;
  history jsonb;
begin
  if caller is null then
    raise exception 'stop_thing_count needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select coalesce(i.same_as, i.id) into kept from public.thing_item as i where i.id = item and i.household_id = caller_household;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = kept and i.household_id = caller_household for update;
  if not found then
    raise exception 'the thing is not found' using errcode = 'MK440';
  end if;
  if before_count is null then
    raise exception 'the thing is not counted' using errcode = 'MK442';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'delta', c.delta, 'quantity_after', c.quantity_after, 'cleared', c.cleared, 'created_at', c.created_at
    ) order by c.created_at, c.id), '[]'::jsonb)
  into history
  from public.thing_change as c where c.item_id = kept and c.household_id = caller_household;

  delete from public.thing_change as c where c.item_id = kept and c.household_id = caller_household;
  update public.thing_item as i set quantity = null where i.id = kept and i.household_id = caller_household;
  return jsonb_build_object('item', kept, 'quantity', before_count, 'changes', history);
end;
$$;

create or replace function public.store_lock()
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
begin
  if caller is null then
    raise exception 'store_lock needs a signed-in user' using errcode = '42501';
  end if;
  if caller_household is null then
    raise exception 'the caller has no household' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:' || caller_household::text, 0));
end;
$$;

create or replace function public.thing_change_trim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.thing_change as old_row
  where old_row.item_id = new.item_id
    and old_row.household_id = new.household_id
    and old_row.id in (
      select kept.id
      from public.thing_change as kept
      where kept.item_id = new.item_id and kept.household_id = new.household_id
      order by kept.created_at desc, kept.id desc
      offset 50
    );
  return null;
end;
$$;

create or replace function public.thing_clear_counts(site uuid, in_room text DEFAULT NULL::text)
returns table (things bigint, cards bigint, boxes bigint)
language sql
stable
set search_path = ''
as $$
  with places as (
    select pl.id, pl.kind from public.thing_place pl
    where pl.site_id = site and pl.household_id = (select public.my_household_id()) and (in_room is null or pl.room_key = in_room)
  )
  select
    (select count(*) from public.thing_item i join places p on p.id = i.place_id where i.same_as is null),
    (select count(*) from public.thing_photo ph join places p on p.id = ph.place_id where ph.status = 'done'),
    (select count(*) from places p where p.kind = 'box');
$$;

create or replace function public.thing_place_counts(site uuid, in_room text)
returns table (place_id uuid, things bigint, cards bigint)
language sql
stable
set search_path = ''
as $$
  select pl.id,
    (select count(*) from public.thing_item i where i.place_id = pl.id and i.household_id = pl.household_id and i.same_as is null),
    (select count(*) from public.thing_photo ph where ph.place_id = pl.id and ph.household_id = pl.household_id and ph.status = 'done')
  from public.thing_place pl
  where pl.site_id = site and pl.household_id = (select public.my_household_id()) and pl.room_key = in_room;
$$;

create or replace function public.thing_room_categories(site uuid, in_room text)
returns table (category text, things bigint)
language sql
stable
set search_path = ''
as $$
  select i.category, count(*)
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.household_id = i.household_id
  where pl.site_id = site and pl.room_key = in_room and i.same_as is null
  group by i.category;
$$;

create or replace function public.thing_room_merge_moves(site uuid, in_room text, new_key text)
returns table (photo uuid, from_path text, to_path text)
language sql
stable
set search_path = ''
as $$
  select ph.id, ph.object_path, split_part(ph.object_path, '/', 1) || '/' || target.id::text || '/' || ph.id::text
    || case ph.media_type when 'image/jpeg' then '.jpg' else '.png' end
  from public.thing_place source
  join public.thing_place target
    on target.household_id = source.household_id and target.site_id = source.site_id and target.room_key = new_key and target.part_key = source.part_key
  join public.thing_photo ph on ph.place_id = source.id and ph.household_id = source.household_id
  where source.site_id = site and source.household_id = (select public.my_household_id()) and source.room_key = in_room and in_room <> new_key
  order by ph.id;
$$;

create or replace function public.thing_room_stats(site uuid)
returns table (room text, room_key text, things bigint, cards bigint, reading bigint, latest timestamptz)
language sql
stable
set search_path = ''
as $$
  with places as (
    select * from public.thing_place where site_id = site
  ),
  per_card as (
    select pl.room_key,
      count(*) filter (where ph.status = 'done') as done,
      count(*) filter (where ph.status = 'reading' and ph.created_at > now() - interval '6 minutes') as reading,
      max(ph.taken_at) filter (where ph.status = 'done') as latest
    from public.thing_photo ph
    join places pl on pl.id = ph.place_id and pl.household_id = ph.household_id
    group by pl.room_key
  ),
  per_item as (
    select pl.room_key, count(*) as things
    from public.thing_item i
    join places pl on pl.id = i.place_id and pl.household_id = i.household_id
    where i.same_as is null
    group by pl.room_key
  )
  select
    (array_agg(p.room order by p.created_at, p.id))[1],
    p.room_key,
    coalesce(max(pi.things), 0),
    coalesce(max(pc.done), 0),
    coalesce(max(pc.reading), 0),
    max(pc.latest)
  from places p
  left join per_card pc on pc.room_key = p.room_key
  left join per_item pi on pi.room_key = p.room_key
  group by p.room_key
  order by min(p.created_at), p.room_key;
$$;

create or replace function public.thing_room_things(site uuid, in_room text, wanted text)
returns table (id uuid, name text, category text, where_hint text, confidence text, part text, kind text, seen_on bigint, noted boolean, noted_at timestamptz, quantity integer)
language sql
stable
set search_path = ''
as $$
  select i.id, i.name, i.category, i.where_hint, i.confidence, pl.part, pl.kind,
    1 + (select count(*) from public.thing_item p where p.same_as = i.id),
    i.source = 'noted',
    case when i.source = 'noted' then i.created_at end,
    i.quantity
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.household_id = i.household_id
  where pl.site_id = site and pl.room_key = in_room and i.category = wanted and i.same_as is null
  order by i.name, i.id
  limit 2000;
$$;

create or replace function public.thing_room_written(site uuid, in_room text)
returns table (place_id uuid, part text, things bigint, written_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select pl.id, pl.part, count(*), max(i.created_at)
  from public.thing_item i
  join public.thing_place pl on pl.id = i.place_id and pl.household_id = i.household_id
  where pl.site_id = site and pl.room_key = in_room and pl.kind = 'box' and i.source = 'manual'
  group by pl.id, pl.part
  order by max(i.created_at) desc, pl.id;
$$;

create or replace function public.thing_unseen_by_room()
returns table (site_id uuid, room text, room_key text, unseen bigint)
language sql
stable
set search_path = ''
as $$
  with per_room as (
    select pl.site_id, pl.room_key, (array_agg(pl.room order by pl.created_at, pl.id))[1] as room,
      coalesce(sum((select coalesce(sum(ph.unseen_count), 0) from public.thing_photo ph where ph.place_id = pl.id and ph.household_id = pl.household_id and ph.status = 'done')), 0) as hidden,
      count(*) filter (where pl.kind = 'box' and (
        exists (select 1 from public.thing_photo ph where ph.place_id = pl.id and ph.household_id = pl.household_id and ph.status = 'done')
        or exists (select 1 from public.thing_item i where i.place_id = pl.id and i.household_id = pl.household_id and i.source = 'manual')
      )) as filled,
      count(*) filter (where pl.kind = 'box' and not (
        exists (select 1 from public.thing_photo ph where ph.place_id = pl.id and ph.household_id = pl.household_id and ph.status = 'done')
        or exists (select 1 from public.thing_item i where i.place_id = pl.id and i.household_id = pl.household_id and i.source = 'manual')
      )) as empty
    from public.thing_place pl
    group by pl.site_id, pl.room_key
  )
  select site_id, room, room_key, (greatest(hidden - filled, 0) + empty)::bigint
  from per_room
  where greatest(hidden - filled, 0) + empty > 0;
$$;

create or replace function public.undo_dish_cooked(dish uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  ledger jsonb;
  entry jsonb;
  entry_id uuid;
  entry_deducted numeric;
begin
  if caller is null then
    raise exception 'undo_dish_cooked needs a signed-in user' using errcode = '42501';
  end if;
  if dish is null then
    raise exception 'a dish is required' using errcode = '22023';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('set_pantry_items:' || caller_household::text));

  select target.cooked_deductions into ledger
  from public.meal_plan_recipe as target
  where target.id = undo_dish_cooked.dish and target.household_id = caller_household and target.cooked_at is not null
  for update;
  if not found then
    raise exception 'nothing to undo' using errcode = 'MK418';
  end if;

  update public.meal_plan_recipe as target
  set cooked_at = null, cooked_deductions = null
  where target.id = undo_dish_cooked.dish and target.household_id = caller_household;

  for entry in select value from jsonb_array_elements(coalesce(ledger, '[]'::jsonb))
  loop
    entry_id := (entry ->> 'id')::uuid;
    entry_deducted := (entry ->> 'deducted')::numeric;
    update public.pantry_item as back
    set amount = back.amount + entry_deducted
    where back.id = entry_id and back.household_id = caller_household and back.amount is not null;
    if not found then
      insert into public.pantry_item (id, site_id, ingredient_id, location, amount, unit, label, created_at)
      values (
        entry_id, (entry ->> 'site_id')::uuid, (entry ->> 'ingredient_id')::uuid, entry ->> 'location',
        entry_deducted, entry ->> 'unit', entry ->> 'label', (entry ->> 'created_at')::timestamptz
      );
    end if;
  end loop;
end;
$$;

create or replace function public.undo_thing_change(change uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  target public.thing_change;
  before_count integer;
  after_count integer;
begin
  if caller is null then
    raise exception 'undo_thing_change needs a signed-in user' using errcode = '42501';
  end if;

  if caller_household is null then

    raise exception 'the caller has no household' using errcode = '42501';

  end if;

  perform pg_advisory_xact_lock(hashtext('things:' || caller_household::text));

  select * into target from public.thing_change as c
  where c.id = change and c.household_id = caller_household and c.kind in ('take', 'refill');
  if not found then
    raise exception 'the change is not found' using errcode = 'MK440';
  end if;
  -- Only the newest change of the föremål: an older one undone would rewrite a count that has moved on since.
  if exists (
    select 1 from public.thing_change as newer
    where newer.item_id = target.item_id and newer.household_id = caller_household
      and (newer.created_at, newer.id) > (target.created_at, target.id)
  ) then
    raise exception 'only the newest change can be undone' using errcode = 'MK444';
  end if;
  select i.quantity into before_count from public.thing_item as i where i.id = target.item_id and i.household_id = caller_household for update;
  if not found or before_count is null then
    raise exception 'the change is not found' using errcode = 'MK440';
  end if;

  after_count := least(9999, greatest(0, before_count - target.delta));
  update public.thing_item as i set quantity = after_count where i.id = target.item_id and i.household_id = caller_household;
  delete from public.thing_change as c where c.id = target.id and c.household_id = caller_household;
  return after_count;
end;
$$;

create or replace function public.update_recipe(id uuid, expected_updated_at timestamptz, recipe jsonb, steps jsonb, lines jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  target uuid := update_recipe.id;
  caller uuid := (select auth.uid());
  caller_household uuid := public.my_household_id();
  saved_updated_at timestamptz;
begin
  if target is null
    or expected_updated_at is null
    or jsonb_typeof(recipe) is distinct from 'object'
    or jsonb_typeof(steps) is distinct from 'array'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'id and expected_updated_at are required, recipe must be an object, steps and lines arrays'
      using errcode = '22023';
  end if;
  if jsonb_array_length(steps) > 100 or jsonb_array_length(lines) > 200 then
    raise exception 'too many steps or lines' using errcode = '22023';
  end if;
  if (
    select count(distinct step.position)
    from jsonb_to_recordset(steps) as step (position integer)
    where step.position >= 0 and step.position < jsonb_array_length(steps)
  ) <> jsonb_array_length(steps) then
    raise exception 'step positions must be 0, 1, 2, …' using errcode = '22023';
  end if;
  if (
    select count(distinct line.position)
    from jsonb_to_recordset(lines) as line (position integer)
    where line.position >= 0 and line.position < jsonb_array_length(lines)
  ) <> jsonb_array_length(lines) then
    raise exception 'line positions must be 0, 1, 2, …' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(steps) as step (id uuid)
    where step.id is not null group by step.id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(lines) as line (id uuid)
    where line.id is not null group by line.id having count(*) > 1
  ) then
    raise exception 'a step or line id is given twice' using errcode = '22023';
  end if;

  -- Locks the caller's recipe until the transaction ends.
  select saved.updated_at into saved_updated_at
  from public.recipe as saved
  where saved.id = target and saved.household_id = caller_household
  for update;
  if not found then
    return null;
  end if;
  if saved_updated_at is distinct from expected_updated_at then
    raise exception 'the recipe has changed since the form was filled' using errcode = 'MK409';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(steps) as step (id uuid)
    where step.id is not null
      and not exists (
        select 1 from public.recipe_step as saved
        where saved.id = step.id and saved.recipe_id = target and saved.household_id = caller_household
      )
  ) or exists (
    select 1 from jsonb_to_recordset(lines) as line (id uuid)
    where line.id is not null
      and not exists (
        select 1 from public.recipe_ingredient as saved
        where saved.id = line.id and saved.recipe_id = target and saved.household_id = caller_household
      )
  ) then
    raise exception 'a step or line id is not one of the recipe''s' using errcode = '22023';
  end if;

  update public.recipe as saved
  set title = item.title, original_servings = item.original_servings, total_minutes = item.total_minutes
  from jsonb_to_record(recipe) as item (title text, original_servings integer, total_minutes integer)
  where saved.id = target and saved.household_id = caller_household;

  -- Steps and lines no longer in the lists go. A removed step leaves its lines without a step
  -- (on delete set null); the lines get their steps again below.
  delete from public.recipe_step as saved
  where saved.recipe_id = target
    and saved.household_id = caller_household
    and saved.id not in (
      select step.id from jsonb_to_recordset(steps) as step (id uuid) where step.id is not null
    );
  delete from public.recipe_ingredient as saved
  where saved.recipe_id = target
    and saved.household_id = caller_household
    and saved.id not in (
      select line.id from jsonb_to_recordset(lines) as line (id uuid) where line.id is not null
    );

  -- Positions are unique per recipe and checked row by row, so the kept rows
  -- first move out of the way (above every position a list may hold).
  update public.recipe_step as saved set position = saved.position + 1000
  where saved.recipe_id = target and saved.household_id = caller_household;
  update public.recipe_ingredient as saved set position = saved.position + 1000
  where saved.recipe_id = target and saved.household_id = caller_household;

  update public.recipe_step as saved
  set position = step.position, text = step.text
  from jsonb_to_recordset(steps) as step (id uuid, position integer, text text)
  where step.id is not null and saved.id = step.id and saved.recipe_id = target and saved.household_id = caller_household;

  insert into public.recipe_step (recipe_id, position, text)
  select target, step.position, step.text
  from jsonb_to_recordset(steps) as step (id uuid, position integer, text text)
  where step.id is null;

  update public.recipe_ingredient as saved
  set position = line.position,
    original_text = line.original_text,
    amount = line.amount,
    unit = line.unit,
    is_vague = line.is_vague,
    ingredient_id = line.ingredient_id,
    step_id = step.id
  from jsonb_to_recordset(lines) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer
  )
  left join public.recipe_step as step
    on step.recipe_id = target and step.position = line.step_position
  where line.id is not null and saved.id = line.id and saved.recipe_id = target and saved.household_id = caller_household;

  insert into public.recipe_ingredient (
    recipe_id, ingredient_id, step_id, position, original_text, amount, unit, is_vague
  )
  select target, line.ingredient_id, step.id, line.position, line.original_text, line.amount, line.unit, line.is_vague
  from jsonb_to_recordset(lines) as line (
    id uuid,
    position integer,
    original_text text,
    amount numeric,
    unit text,
    is_vague boolean,
    ingredient_id uuid,
    step_position integer
  )
  left join public.recipe_step as step
    on step.recipe_id = target and step.position = line.step_position
  where line.id is null;

  -- A step position that names no step is an error, not a line without a step.
  if exists (
    select 1
    from jsonb_to_recordset(lines) as line (step_position integer)
    where line.step_position is not null
      and not exists (
        select 1 from public.recipe_step as step
        where step.recipe_id = target and step.position = line.step_position
      )
  ) then
    raise exception 'step_position names no step' using errcode = '22023';
  end if;

  return target;
end;
$$;

create or replace function public.update_shopping_custom_item(item jsonb)
returns shopping_custom_item
language plpgsql
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_household uuid := public.my_household_id();
  item_id uuid;
  saved public.shopping_custom_item;
begin
  if caller is null then
    raise exception 'update_shopping_custom_item needs a signed-in user' using errcode = '42501';
  end if;
  if jsonb_typeof(item) is distinct from 'object' then
    raise exception 'item must be an object' using errcode = '22023';
  end if;

  item_id := (item ->> 'id')::uuid;
  if item_id is null then
    raise exception 'item needs its id' using errcode = '22023';
  end if;

  perform public.meal_plan_lock();

  select own.* into saved
  from public.shopping_custom_item as own
  where own.id = item_id and own.household_id = caller_household;
  if not found then
    raise exception 'the item is not found' using errcode = 'P0002';
  end if;

  update public.shopping_custom_item as own
  set
    label = item ->> 'label',
    ingredient_id = (item ->> 'ingredient_id')::uuid,
    amount = (item ->> 'amount')::numeric,
    unit = item ->> 'unit'
  where own.id = item_id and own.household_id = caller_household
  returning own.* into saved;
  return saved;
end;
$$;
