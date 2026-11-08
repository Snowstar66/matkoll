-- "Ät snart": how long a thing keeps in the fridge, per ingredient, and a
-- daily reminder.
--
-- Until now Matvaror marked an item as old with one flat limit per location
-- (Kyl 7 days, Frys 60), which flags minced meat far too late and hard cheese
-- needlessly. From here:
--   1. ingredient.keeps_days: days a thing keeps in the fridge after it was
--      bought (nullable, above 0). Null means "use the location's default" in
--      the app. Freezer storage keeps its flat limit (60), so there is no
--      freezer column.
--   2. ingredient_keeps_days(normalized_name): the Swedish household values,
--      matched on the normalised name. Conservative: err early. Catalogs are
--      per household and filled as people buy (there is no shared seed), so
--      the values are given by this function: it backfills the existing
--      ingredients now, and a before-insert trigger gives every new
--      ingredient its value. A value given on insert is kept.
--   3. push_preference.atsnart (default on) and claim_eat_soon_devices():
--      once a day per household it gives the devices of the members who want
--      the daily "Ät snart" notification (table eat_soon_sent keeps the day). The send itself is the app's (POST /api/eat-soon/notify,
--      called by a scheduled job as a member), with the same web-push sender
--      as the other kinds. push_event (the queue) is not involved.
--
-- Additive: one nullable column, one defaulted column, one small table, three functions.

set local lock_timeout = '5s';

-- 1. How long it keeps -------------------------------------------------------------

alter table public.ingredient add column keeps_days smallint;
alter table public.ingredient add constraint ingredient_keeps_days_check check (keeps_days > 0);

-- 2. The values --------------------------------------------------------------------

-- First matching rule wins, so the specific ones (smoked fish) come before the
-- general ones. Null: no rule, the app uses the location's default.
create function public.ingredient_keeps_days(normalized_name text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select (case
    -- Smoked, cured or salted fish lasts longer than fresh.
    when n ~ '(rökt|gravad|gravlax|ansjovis|surströmming|(^|[ -])sill)' then 5
    -- Sauces, stock and seasoning named after meat or fish keep like pantry goods: no rule.
    when n ~ '(sås|buljong|fond|krydda|tärning|extrakt)' then null
    -- Raw minced meat, poultry, fish and shellfish: flagged the day after purchase.
    when n ~ '(färs($|[^k])|kyckling|kalkon|fisk|lax|torsk|(^|[ -])sej|abborre|röding|räk|skaldjur|mussl|krabb|hummer)' then 1
    -- Other raw meat.
    when n ~ '(biff|entrecote|entrecôte|oxfilé|fläskfilé|karré|kotlett|schnitzel|lamm|högrev|revben|medaljong|(^|[ -])anka|tärnat kött|strimlat kött)' then 3
    -- Cold cuts and sausages (opened packs keep a few days).
    when n ~ '(skinka|pålägg|leverpastej|kassler|salami|prosciutto|mortadella)' then 5
    when n ~ '(bacon|korv|köttbull)' then 7
    -- Dairy.
    when n ~ '(grädde|cr[eè]me fra[iî]che|gräddfil|mascarpone|ricotta)' then 5
    when n ~ '(^|[ -])(mjölk|standardmjölk|lättmjölk|mellanmjölk|minimjölk)($| )' then 7
    when n ~ '(yoghurt|yogurt|filmjölk|kefir|kvarg|^fil$)' then 10
    when n ~ '(keso|cottage)' then 7
    when n ~ '(mozzarella|burrata)' then 5
    when n ~ '(färskost|philadelphia|fetaost|feta|halloumi|brie|camembert|blåmögel|chèvre|getost)' then 14
    when n ~ '(hårdost|parmesan|parmigiano|grana|cheddar|prästost|herrgård|västerbotten|grevé|gouda|emmentaler|gruyère|manchego|pecorino|svecia)' then 30
    when n ~ '(^|[ -])(smör|bregott|margarin)($| )' then 30
    when n ~ '(^|[ -])ägg($| )' then 28
    -- Fresh greens, herbs, mushrooms and berries.
    when n ~ '(sallad|ruccola|rucola|spenat|mâche|babyleaf)' then 4
    when n ~ '(dill|persilja|koriander|basilika|gräslök|mynta|timjan|rosmarin)' then 5
    when n ~ '(champinjon|svamp|kantarell)' then 5
    when n ~ '(jordgubb|hallon|blåbär|björnbär|vinbär|krusbär|tranbär)' then 3
    else null
  end)::smallint
  from (select lower(normalized_name) as n) as input;
$$;

revoke all on function public.ingredient_keeps_days(text) from public, anon, authenticated, service_role;
grant execute on function public.ingredient_keeps_days(text) to authenticated, service_role;

-- The ingredients that exist now.
update public.ingredient set keeps_days = public.ingredient_keeps_days(normalized_name)
where keeps_days is null and public.ingredient_keeps_days(normalized_name) is not null;

-- New ingredients get their value when they are created; one that is given a
-- value on insert keeps it.
create function public.ingredient_set_keeps_days()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.keeps_days is null then
    new.keeps_days := public.ingredient_keeps_days(new.normalized_name);
  end if;
  return new;
end;
$$;

revoke all on function public.ingredient_set_keeps_days() from public, anon, authenticated, service_role;

create trigger ingredient_set_keeps_days before insert on public.ingredient
  for each row execute function public.ingredient_set_keeps_days();

-- 3. The daily reminder ------------------------------------------------------------

alter table public.push_preference add column atsnart boolean not null default true;
grant insert (atsnart) on table public.push_preference to authenticated;
grant update (atsnart) on table public.push_preference to authenticated;

-- One send per household and day: the claim below inserts the day, and only
-- the call that inserted it gets the devices. No policy and no grants: only
-- the function touches it. No foreign key, so removing a household never
-- waits on it.
create table public.eat_soon_sent (
  household_id uuid not null,
  day date not null,
  constraint eat_soon_sent_pkey primary key (household_id, day)
);

alter table public.eat_soon_sent enable row level security;
revoke all on table public.eat_soon_sent from public, anon, authenticated, service_role;

-- The daily claim, as a member of the household: takes today's (Swedish day)
-- send for the caller's household, and gives the devices of the members who
-- want "Ät snart" (no choice made means yes). A second call the same day gives
-- nothing, so the push cannot be repeated and the devices cannot be read at
-- will. push_subscription is otherwise a person's own. Rows older than a week
-- are cleared on the way.
create function public.claim_eat_soon_devices()
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hid uuid := public.my_household_id();
  today date := (now() at time zone 'Europe/Stockholm')::date;
  claimed integer;
begin
  if hid is null then
    return;
  end if;
  delete from public.eat_soon_sent as e where e.day < today - 7;
  insert into public.eat_soon_sent (household_id, day) values (hid, today) on conflict do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    return;
  end if;
  return query
  select s.user_id, s.endpoint, s.p256dh, s.auth
  from public.household_member as m
  left join public.push_preference as p on p.user_id = m.user_id
  join public.push_subscription as s on s.user_id = m.user_id
  where m.household_id = hid and coalesce(p.atsnart, true);
end;
$$;

revoke all on function public.claim_eat_soon_devices() from public, anon, authenticated, service_role;
grant execute on function public.claim_eat_soon_devices() to authenticated;
