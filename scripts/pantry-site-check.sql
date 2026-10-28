-- The pantry before and after the migration that adds places
-- (supabase/migrations/*_pantry_site.sql, Story 8.1, NFR-9): run it before and
-- after `supabase migration up` locally, and before and after
-- `supabase db push` in the cloud (docs/drift.md), and `diff` the two outputs.
-- They must be identical: every pantry_item row with the same id, user,
-- ingredient, location, amount, unit and created_at (Story 11.2), the same number of rows, and every
-- pantry_removal record ("Ångra") with the same rows, in the same order,
-- apart from the site_id the migration adds to each.
--
-- Once pantry_site exists, the script also checks the migration's
-- postconditions, as tests/integration/pantry-site.test.ts does. They print
-- nothing to standard output, so the diff stays empty: a NOTICE on standard
-- error says they hold, and an error stops the script with a non-zero exit
-- code when one does not.
--
-- Run with psql -X -q -A -t -F ' ' -v ON_ERROR_STOP=1 -f scripts/pantry-site-check.sql.

select id, user_id, ingredient_id, location, amount, unit, created_at
from public.pantry_item
order by id;

select 'pantry_item rows', count(*) from public.pantry_item;

-- removed_rows without site_id, element by element in order. A record that is
-- not an array (pantry_removal_removed_rows_check forbids it) is printed as it
-- is, and the check below stops the script.
select
  record.id,
  record.user_id,
  case
    when jsonb_typeof(record.removed_rows) <> 'array' then record.removed_rows
    else coalesce(
      (
        select jsonb_agg(
          case when jsonb_typeof(element.value) = 'object' then element.value - 'site_id' else element.value end
          order by element.position
        )
        from jsonb_array_elements(
          case when jsonb_typeof(record.removed_rows) = 'array' then record.removed_rows else '[]'::jsonb end
        ) with ordinality as element (value, position)
      ),
      '[]'::jsonb
    )
  end
from public.pantry_removal as record
order by record.user_id, record.id;

select 'pantry_removal records', count(*) from public.pantry_removal;

-- Before and after: every removed_rows is an array (the migration's backfill
-- assumed it).
do $$
declare
  problems integer;
begin
  select count(*) into problems
  from public.pantry_removal as record
  where jsonb_typeof(record.removed_rows) <> 'array';
  if problems > 0 then
    raise exception '% pantry_removal records whose removed_rows is not an array', problems;
  end if;
end;
$$;

select to_regclass('public.pantry_site') is not null as has_sites \gset

\if :has_sites
do $$
declare
  problems integer;
begin
  -- Every pantry row is on a place of its own user.
  select count(*) into problems
  from public.pantry_item as item
  where item.site_id is null
    or not exists (
      select 1 from public.pantry_site as own
      where own.id = item.site_id and own.user_id = item.user_id
    );
  if problems > 0 then
    raise exception '% pantry_item rows without a place of their own user', problems;
  end if;

  -- Every user with places has exactly one selected.
  select count(*) into problems
  from (
    select own.user_id
    from public.pantry_site as own
    group by own.user_id
    having count(*) filter (where own.is_selected) <> 1
  ) as users;
  if problems > 0 then
    raise exception '% users without exactly one selected place', problems;
  end if;

  -- Every user with pantry rows or a stored removal has a place.
  select count(*) into problems
  from (
    select item.user_id from public.pantry_item as item
    union
    select record.user_id from public.pantry_removal as record
  ) as users
  where not exists (select 1 from public.pantry_site as own where own.user_id = users.user_id);
  if problems > 0 then
    raise exception '% users with pantry rows or removals but without a place', problems;
  end if;

  -- Every stored removed row has a place of the removal's user.
  select count(*) into problems
  from public.pantry_removal as record,
    jsonb_array_elements(record.removed_rows) as element (value)
  where jsonb_typeof(element.value) = 'object'
    and (
      element.value ->> 'site_id' is null
      or not exists (
        select 1 from public.pantry_site as own
        where own.id::text = element.value ->> 'site_id'
          and own.user_id = record.user_id
      )
    );
  if problems > 0 then
    raise exception '% removed rows in pantry_removal without a place of their user', problems;
  end if;

  raise notice 'pantry-site-check: the postconditions hold';
end;
$$;
\endif
