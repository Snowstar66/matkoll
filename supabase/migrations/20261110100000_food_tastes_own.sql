-- Smak och allergier, ett reglage per sak: food_profile.tastes holds everything a
-- person likes or dislikes (the grouped presets and the person's own things),
-- one key each with the value -2 (Ogillar), -1 (Hellre inte), 1 (Gillar) or 2
-- (Älskar). Until now only eight keys were allowed (kott, fisk, skaldjur,
-- vegetariskt, pasta, pizza, starkt, sott); the free "Undviker" / "Älskar" lists
-- lived in the dislikes / likes columns.
--
-- The check function now also accepts any other key of the shape the app
-- writes (domain/tastes.ts, tasteKeyPattern): a lower-case letter or digit
-- first, then letters (a-z, å, ä, ö), digits, space, _ or -, at most 40
-- characters in all. At most 70 keys (the 23 presets and 40 own things, with
-- room), values as before, and the text at most 4000 bytes.
--
-- The dislikes / likes columns and their checks stay as they are. The app reads
-- what they hold as older data (Undviker as -2, Älskar as +2 in tastes) and
-- writes them empty the next time the person is saved. Nothing is copied or
-- deleted here.
--
-- Additive and compatible with the app from before this migration: every
-- value the old function accepted is still accepted, so the old code keeps
-- working. Rollback: put the earlier function back (the body of
-- food_tastes_valid in 20261109100000_food_profile.sql: the eight keys only,
-- octet_length <= 400); rows that already hold other keys must be cleaned of
-- them first, since the constraint is checked when a row is changed, not
-- re-checked for rows that are left alone.

set local lock_timeout = '5s';

create or replace function public.food_tastes_valid(tastes jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(tastes) <> 'object' then false
    else octet_length(tastes::text) <= 4000
      and (select count(*) from jsonb_object_keys(tastes)) <= 70
      and not exists (
        select 1 from jsonb_each(tastes) as t (key, value)
        where t.key !~ '^[a-zåäö0-9][a-zåäö0-9 _-]{0,39}$'
          or jsonb_typeof(t.value) <> 'number'
          or t.value::text not in ('-2', '-1', '1', '2')
      )
  end;
$$;
