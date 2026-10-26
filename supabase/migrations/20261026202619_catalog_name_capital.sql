-- Catalog, Story 10.4: a catalog ingredient's name starts with an uppercase
-- letter ("bregott" -> "Bregott"). New names get it in the domain
-- (catalogName in src/features/catalog/domain/name.ts, used by
-- commitIngredients); this gives the names saved before it the same first
-- letter.
-- - Only `name` changes, and only its first character, and only where that
--   character is a lowercase letter today. normalized_name, ids and every
--   other column stay as they are; no row is added or removed.
-- - upper() and lower() follow the collation, so the expression names one:
--   pg_c_utf8 is built in (PostgreSQL 17) and maps case by Unicode,
--   whatever the database's own collation is, so å, ä and ö become Å, Ä
--   and Ö also where the database collation is "C".
-- - Runs as the migration owner, so RLS does not limit it to one user.
-- - 20261026210016_catalog_name_rule.sql refines the rule (first letter,
--   mixed case) and keeps it with a trigger.

do $$
begin
  if current_setting('server_version_num')::int < 170000 then
    raise exception 'catalog_name_capital needs PostgreSQL 17 or later for the collation pg_c_utf8 (this is %)',
      current_setting('server_version');
  end if;
end;
$$;

update public.ingredient
set name = upper(left(name, 1) collate "pg_c_utf8") || substr(name, 2)
where left(name, 1) collate "pg_c_utf8" <> upper(left(name, 1) collate "pg_c_utf8")
  and left(name, 1) collate "pg_c_utf8" = lower(left(name, 1) collate "pg_c_utf8");
