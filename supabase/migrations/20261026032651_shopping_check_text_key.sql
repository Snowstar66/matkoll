-- Shopping checks, follow-up to 20261026032341_shopping_check_hardening.sql:
-- a `t:` key refuses any whitespace other than single spaces between words,
-- not only doubled and edge spaces. lineText turns every run of whitespace
-- into one space (searchText), so a tab or a line break never reaches a key;
-- what Postgres counts as whitespace ([:space:]) is a subset of what
-- JavaScript's \s collapses, so no key the app builds is refused.

-- The keys shopping/domain/line-key.ts builds (tests/design/shopping-checks
-- pins the units and the length to the domain):
-- - `r:<ingredient id>:<unit or ->`, lower-case id, `-` for a vague line;
-- - `c:<custom item id>`, lower-case id, an item Pontus adds (Story 3.5);
-- - `t:<text>`, a recipe line without a catalog ingredient, by its text with
--   single spaces between words and no other whitespace (lineText). At most
--   302 characters: lineKeySchema counts UTF-16 units, which are never fewer
--   than the characters counted here.
alter table public.shopping_check drop constraint shopping_check_line_key_check;
alter table public.shopping_check add constraint shopping_check_line_key_check check (
  line_key ~ '^r:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(g|kg|ml|cl|dl|l|krm|tsk|msk|st|förp|klyfta|kruka|knippe|skiva|-)$'
  or line_key ~ '^c:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or (line_key ~ '^t:([^[:space:]]+( [^[:space:]]+)*)?$' and char_length(line_key) <= 302)
);
