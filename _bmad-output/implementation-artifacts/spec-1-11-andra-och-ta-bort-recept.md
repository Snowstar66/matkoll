---
title: 'Story 1.11: Ändra och ta bort recept'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd4b2c278221554a556a35c0518cf585af91b1fa0'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ett sparat recept kan inte rättas eller tas bort, så biblioteket blir fel över tid.

**Approach:** Receptvyn får en meny (⋯) med "Ändra". Den öppnar samma formulär som förhandsgranskningen, förifyllt med receptet. `updateRecipe(id, draft)` sparar ändringarna och behåller id för rader och steg som finns kvar, och omkopplingar sparas som synonymer (AD-10). "Ta bort recept" längst ned frågar först och raderar sedan receptet med steg och rader.

## Boundaries & Constraints

**Always:** `updateRecipe` är den enda skrivvägen för ändringar (AD-10) och går genom `catalog.commitIngredients`. Uppdateringen sker i en Postgres-funktion (`security invoker`) i en transaktion: rader och steg med kvarvarande id uppdateras, nya läggs till, borttagna raderas. Radering är hård och kräver förhandsbekräftelse "Ta bort [titel]? Det går inte att ångra." (EXPERIENCE). Efter skrivning `revalidateFor('recipe')`. Formuläret är samma komponent som förhandsgranskningen, med samma validering och "Släng ändringarna?". Kör aldrig `supabase db reset`.

**Never:** Ingen ångra efter radering. Ingen hantering av matsedeln (kommer i Epic 3 med `mealplan.detachRecipe`). Ingen ändring av källa eller bild-URL i formuläret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna formuläret | Receptvyn, menyn ⋯, "Ändra" | Arket med förhandsgranskningen förifyllt med titel, portioner, tid, rader (namn och koppling) och steg; rubriken "Ändra recept" | N/A |
| Spara ändring | Ändrad titel, en rad omkopplad, ett steg tillagt | Receptet uppdateras; oförändrade raders och stegs id består; omkopplingen sparas som synonym; Pontus är kvar i receptvyn med "Ändringarna är sparade." | N/A |
| Ta bort rad eller steg | Rad eller steg borttaget i formuläret | Raden eller steget raderas; övrigas id består | N/A |
| Ogiltigt | Tom titel, tomt steg | "Spara ändringar" inaktiv med fältfel | Inget anrop |
| Stäng med ändringar | Ändrat formulär, stäng | "Släng ändringarna?" | Inget sparas |
| Sparning misslyckas | Databasfel | "Det gick inte att spara receptet. Försök igen." och formuläret finns kvar | Allt eller inget |
| Ta bort | "Ta bort recept", bekräfta | Receptet med steg och rader raderas; Pontus hamnar i biblioteket med "Receptet är borttaget." | Avbryt i frågan: inget händer |
| Annans recept | `updateRecipe`/`deleteRecipe` med främmande id | Inget ändras | `unauthorized` eller tomt resultat (RLS) |

</frozen-after-approval>

## Code Map

- `src/features/recipes/ui/import-sheet.tsx`, `recipe-preview.tsx`, `ingredient-picker.tsx` -- förhandsgranskningen och arket; återanvänd för "Ändra" (läge `edit` med befintligt recept-id)
- `src/features/recipes/domain/saved-recipe.ts` (`SavedRecipe`, `toSaveRecipeArgs`), `recipe-draft.ts` (`RecipeDraft`, `validateDraft`) -- behöver mappning `SavedRecipe` → `RecipeDraft` med rad- och steg-id
- `src/features/recipes/data/save.ts`, `queries.ts`, `actions/save-recipe.ts`, `server.ts` -- mönster för `save_recipe` och `getRecipe`
- `supabase/migrations/*recipes*.sql` -- `save_recipe`, tabeller, gränser och trigger för `updated_at`
- `src/features/recipes/ui/recipe-view.tsx`, `src/app/(app)/recept/[id]/page.tsx` -- receptvyn; här läggs menyn
- `src/components/` -- Sheet (bekräftelse, `preventClose`), Button, toast

## Tasks & Acceptance

**Execution:**
- [x] `src/features/recipes/domain/` (+ test) -- `toEditableDraft(saved)`: `SavedRecipe` → `RecipeDraft` där rader och steg bär sina befintliga id (valfritt fält `id`), kopplade rader blir `{ kind: "chosen", ingredientId }`; schema-tillägget är bakåtkompatibelt med import -- AD-10
- [x] ny migration -- `update_recipe(id, recipe, steps, lines)` (`security invoker`, en transaktion, samma kontroller och gränser som `save_recipe`): uppdatera receptet, uppdatera steg och rader med befintligt id som tillhör receptet, lägg till nya, radera de som inte finns med; främmande id ger 22023; `delete_recipe` behövs inte om vanlig delete räcker med `cascade` -- AD-4, AD-20
- [x] `src/features/recipes/data/`, `actions/update-recipe.ts`, `actions/delete-recipe.ts` (+ tester) -- `updateRecipe(id, draft)`: `requireUser`, Zod, `commitIngredients`, `update_recipe`, `revalidateFor('recipe')`; `deleteRecipe(id)`: `requireUser`, Zod, delete, `revalidateFor('recipe')` -- AD-2
- [x] `src/features/recipes/ui/` -- menyn ⋯ i receptvyn med "Ändra"; arket i läge `edit` med rubriken "Ändra recept", knappen "Spara ändringar" och "Ta bort recept" längst ned; bekräftelse i ett ark ("Ta bort [titel]? Det går inte att ångra." med "Ta bort" och "Avbryt"); efter radering navigering till `/recept` och kort bekräftelse -- matrisen
- [x] `tests/integration/recipes.test.ts` (utökad) -- `update_recipe` behåller id, lägger till och tar bort; främmande rad-id nekas; allt eller inget; RLS för uppdatering och radering -- matrisen
- [x] `tests/e2e/recipe-edit.spec.ts` -- spara ett recept, ändra titel och en rad, kontrollera receptvyn; ta bort ett steg; ta bort receptet via bekräftelsen och kontrollera att det inte finns i biblioteket -- matrisen
- [x] `README.md` -- ändra och ta bort recept -- dokumentation

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Steg i `RecipeDraft` är text (som vid import) eller `{ id?, text }` (sparat steg); `stepText`/`stepId` läser båda. Rader har valfritt `id`. Importens utkast är oförändrade.
- `toEditableDraft` gör kopplade rader till `chosen` enligt specen. För att inte spara synonymer för orörda rader (och undvika `conflicting_synonyms` när två rader med samma text pekar på olika ingredienser) läser `updateRecipe` först radernas sparade ingredienser (`savedLineIngredientsIn`, som också avgör att receptet är användarens) och `lineChoices` skickar en oförändrad rad som vanlig träff. Bara omkopplade rader blir synonymer.
- `update_recipe` flyttar först kvarvarande rader och steg till position + 1000, eftersom den unika positionen kontrolleras rad för rad. Funktionen kontrollerar även radpositioner 0, 1, 2, … och dubbla id. Ett recept som RLS döljer ger `null`.
- Bekräftelsen "Ta bort [titel]?" visas i samma ark (arken staplas aldrig); "Avbryt" tar tillbaka formuläret med ändringarna. Ny felkod `recipe_delete_failed`.
- Formuläret (även vid import) fick "Ta bort raden", "Ta bort steg" och "Lägg till steg", som matrisen kräver.
- Efter granskning: `update_recipe` fick `expected_updated_at` (ny migration `<tid>_recipes_update_conflict.sql`, felkod `MK409` → `recipe_conflict`) och filtrerar alla skrivningar på `user_id = auth.uid()`. `updateRecipe` kontrollerar ägare, `updated_at` och att alla rad- och steg-id hör till receptet innan katalogen skrivs; `conflicting_synonyms` blir `recipe_conflicting_links`. `deleteRecipe` räknar ett redan borttaget recept som lyckat. Formulärets rader och steg har stabila nycklar.
- `EditRecipeSheet` hålls monterat och nollställs per öppning (`session`), eftersom ett ark som monteras redan öppet stängs av Reacts dubbla effekter i utvecklingsläge.
- Slutverifiering efter granskning: lint, typecheck, 1179 Vitest, 97 integrationstester, build, 98 Playwright (`CI=1`). Känd effekt: varje ändring av receptraden (även hjärtat) flyttar `updated_at`, så ett formulär öppet i en annan flik får `recipe_conflict` och måste öppnas igen.

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Ett formulär som öppnats före en ändring i annan flik skriver över den utan varning; varje nytt försök misslyckas tills omladdning | medium | `update_recipe` raderar allt som inte skickas | patch (förväntad `updated_at`, konfliktkod, `router.refresh()`) |
| 2 | blind, edge | Katalogen ändras (synonymer, nya ingredienser) även när uppdateringen sedan misslyckas | medium | `commitIngredients` före `update_recipe` | patch (kontrollera id först, dokumentera) |
| 3 | blind | Nytt försök att ta bort ett redan borttaget recept misslyckas för alltid | medium | `not_found` → `recipe_delete_failed` | patch (idempotent) |
| 4 | blind, edge | "Sidan finns inte." kan blinka före omdirigeringen efter borttagning | low | Revalidering av den aktuella sidan | patch |
| 5 | blind, verify | "Ta bort raden", förskjutning av inskrivna mängder och fokus efter borttagning testas inte | medium | Bara rena funktioner testas | patch |
| 6 | blind | `update_recipe` filtrerar inte på ägaren; missvisande kommentar | low | Förlitar sig på RLS | patch |
| 7 | blind | Rader och steg har `key={index}` trots att de kan tas bort | medium | Radtillstånd flyttar till nästa rad | patch |
| 8 | blind | Kontrollen av osparade ändringar är kopierad mellan arken | low | Kan glida isär | patch |
| 9 | edge | Två rader med samma text kopplade till olika ingredienser ger bara allmänt fel | medium | `catalog_conflicting_synonyms` | patch |
| 10 | edge | Fel i fält som inte visas låser "Spara ändringar" utan meddelande | medium | `imageUrl`, `sourceUrl` | patch |
| 11 | blind, verify | `unauthorized` vid sparning och borttagning, menyns stängning och att tolkade data skickas testas inte | medium | Mutationer passerar | patch |
| 12 | blind | Samma loggorsak för två olika lägen | low | Direkt korrigering | patch |
| 13 | edge | Tab i menyn hoppar till fel ställe | low | Direkt korrigering | patch |
| 14 | blind | Grammatikfel i README | low | Direkt korrigering | patch |
| 15 | blind | Genererade typer säger att `update_recipe` alltid ger en sträng | low | Supabase kan inte uttrycka null | avvisad (kommentar vid kontrollen) |

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: funktionen finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
