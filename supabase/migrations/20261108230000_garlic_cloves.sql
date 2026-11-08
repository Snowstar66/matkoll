-- Vitlöksklyftor (additive data repair, 2026-11-08).
--
-- A recipe line such as "2 vitlöksklyftor" or "3 klyftor vitlök, pressade" writes its unit inside
-- the noun, and the recipe import read it as 2 whole bulbs (amount 2, no unit, which counts as st).
-- The import now reads klyfta (catalog.unitInNoun); this repairs the lines saved before:
-- recipe_ingredient rows with an amount, no unit or st, whose original text has a word ending in
-- klyfta/klyftan/klyftor/klyftorna right after the amount (after "ca", a number word, or a word of
-- size such as "stora"), get unit 'klyfta'. "1 citron, i klyftor" is not touched, and neither is a
-- line whose catalog ingredient is itself named after the clove ("vitlöksklyfta").
--
-- Only recipe_ingredient changes. No trigger on it touches recipe.updated_at (Ändra recept's lock),
-- and household_row_guard only guards user_id and household_id, which stay. Idempotent: a repaired
-- line has unit 'klyfta' and is not matched again. One statement, so the integration test can run
-- this file again.
--
-- Backa: nothing to drop. To undo, set unit back to null on the repaired lines (unit = 'klyfta'
-- with the same text pattern); the original text was never changed.

update public.recipe_ingredient as ri
set unit = 'klyfta'
where ri.amount is not null
  and (ri.unit is null or ri.unit = 'st')
  and ri.original_text ~* (
    '^\s*('
    || '(ca\.?|cirka|ungefär|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio|tolv|halv|halva)\s+'
    || '|[0-9½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞.,/⁄–-]+\s*'
    || ')+'
    || '((stor|stora|liten|små|medelstor|medelstora|hel|hela|färsk|färska)\s+)?'
    || '[^\s,(;:]*klyft(a|an|or|orna)([^a-zåäö]|$)'
  )
  and not exists (
    select 1
    from public.ingredient as i
    where i.id = ri.ingredient_id
      and lower(i.name) ~ 'klyft(a|an|or|orna)$'
  );
