-- Row counts for the backup (.github/workflows/backup.yml) and for checking a
-- restore (docs/drift.md): auth.users and every table in public, one per line
-- as "<table> <rows>". Run with psql -X -q -A -t -F ' ' -f scripts/backup-counts.sql.
-- public.pantry_photo is not counted: the backup leaves the photos out
-- (Story 10.3), so a restore has none.
select 'auth.users' as table_name, count(*) as row_count from auth.users
union all
select
  format('%I.%I', table_schema, table_name),
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'pantry_photo'
order by 1;
