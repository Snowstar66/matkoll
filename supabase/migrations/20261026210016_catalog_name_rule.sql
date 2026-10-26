-- Catalog, Story 10.4 after review: the database keeps the rule that a
-- catalog name starts with an uppercase letter, the same rule as catalogName
-- in src/features/catalog/domain/name.ts. 20261026202619_catalog_name_capital.sql
-- gave the names of the time a capital first character; this migration
-- refines the rule and keeps it for every later write.
-- 1. public.catalog_display_name(text) is the rule in SQL.
-- 2. A trigger applies it to every insert and every change of
--    ingredient.name: commitIngredients, commit_ingredients called directly,
--    older clients, seeds and test fixtures.
-- 3. Existing names get the refined rule. Only rows whose result differs
--    change, and only their name. No row is added or removed, and ids and
--    normalized_name stay as they are.
-- upper() and lower() follow the collation, so the function names one:
-- pg_c_utf8 is built in from PostgreSQL 17 and maps case and classifies
-- characters by Unicode, whatever the database's own collation is.

do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise exception 'catalog_name_rule needs PostgreSQL 17 or later for the collation pg_c_utf8 (this is %)',
      current_setting('server_version');
  end if;
end;
$$;

-- The name with its first letter in upper case, as catalogName:
-- - the first letter after any leading characters that are neither letters
--   nor digits ("(eko) mjölk" -> "(Eko) mjölk"); a name that starts with a
--   digit ("7up") or has no letter is kept;
-- - a first word that is already mixed case (its second letter is a capital,
--   "iPhone-laddare", "pH-neutral") is kept;
-- - only that letter changes, never what follows it, and nothing is
--   normalised;
-- - a letter whose capital is itself ("ß") or would change the lower-case
--   name ("ı", "ſ") is kept.
-- The caller trims; ingredient_name_check refuses a blank name.
create function public.catalog_display_name(name_text text)
returns text
language plpgsql
immutable
parallel safe
security invoker
set search_path = ''
as $$
declare
  value text := name_text collate "pg_c_utf8";
  prefix text;
  first text;
  capital text;
  second text;
  result text;
begin
  if value is null then
    return null;
  end if;
  prefix := substring(value from '^[^[:alpha:][:digit:]]*');
  first := substr(value, length(prefix) + 1, 1);
  if first = '' or first !~ '^[[:alpha:]]$' then
    return value;
  end if;
  capital := upper(first);
  if capital = first then
    return value;
  end if;
  second := substring(substr(value, length(prefix) + 2) from '^[^[:space:][:alpha:]]*([[:alpha:]])');
  if second is not null and lower(second) <> second then
    return value;
  end if;
  result := prefix || capital || substr(value, length(prefix) + 2);
  if lower(result) <> lower(value) then
    return value;
  end if;
  return result;
end;
$$;

revoke all on function public.catalog_display_name(text) from public, anon, authenticated, service_role;
grant execute on function public.catalog_display_name(text) to authenticated, service_role;

-- Applies catalog_display_name to ingredient.name. Never executed directly.
create function public.ingredient_display_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.name := public.catalog_display_name(new.name);
  return new;
end;
$$;

revoke all on function public.ingredient_display_name() from public, anon, authenticated, service_role;

create trigger ingredient_display_name
  before insert or update of name on public.ingredient
  for each row
  execute function public.ingredient_display_name();

-- 3. Existing names: only rows whose result differs.
update public.ingredient
set name = public.catalog_display_name(name)
where name <> public.catalog_display_name(name);
