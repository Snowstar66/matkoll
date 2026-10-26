---
title: 'Story 1.7: Spara recept och visa receptet'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cbc3ff69d9a67fb9c018de8083e02b0c42ac1e62'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ett tolkat och granskat recept försvinner när arket stängs. Pontus behöver kunna spara det och se det i en receptvy som ser likadan ut oavsett källa.

**Approach:** Modulen `recipes` får tabellerna `recipe`, `recipe_step` och `recipe_ingredient` (AD-4, AD-20), Postgres-funktionen `save_recipe` som skriver receptet i en transaktion, Server Action `saveRecipe(draft)` som först kopplar ingredienserna via `catalog.commitIngredients` (AD-6, AD-10), knappen "Spara recept" i förhandsgranskningen och receptvyn `/recept/[id]`.

## Boundaries & Constraints

**Always:** Bara `recipes` läser och skriver sina tabeller (AD-1). Migrationen följer AD-4 (RLS, policy, grants till `authenticated` och `service_role`, aldrig `anon`, sammansatta främmande nycklar `(…_id, user_id)`) och AD-20 (`cascade` inom receptet, `restrict` mot katalogen). `saveRecipe` börjar med `requireUser()`, validerar `RecipeDraft` med Zod och är den enda skrivvägen för nya recept. Efter skrivning anropas `revalidateFor('recipe')` (AD-18). Sessionen läses inuti `<Suspense>`. Mängder visas bara med `formatQuantity`, källan bara med `sourceLabel()`. Svensk text enligt `EXPERIENCE.md`. Kör aldrig `supabase db reset`.

**Never:** Ingen redigering eller borttagning av recept (1.11), inget bibliotek med sökning och favoriter (1.10), ingen portionsväljare eller "X av Y hemma" (Epic 4), ingen lagningsstatus (Epic 2). Ingen sparning av bilder; `image_url` är bara en adress (AD-15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Spara | Giltig förhandsgranskning, "Spara recept" | `commitIngredients` → `save_recipe` i en transaktion; arket stängs, Pontus hamnar på `/recept/[id]` och ser "Receptet är sparat." | N/A |
| Omkopplad rad | Raden "Lök, hackad" bytt till "Rödlök" | Raden sparas med Rödlöks id; synonymen sparas av katalogen | N/A |
| Ny ingrediens | Rad med `kind: "new"` | Katalogingrediensen skapas och raden pekar på den | N/A |
| Vag eller okopplad rad | `isVague` eller `kind: "unmatched"` | Sparas med originaltext; `ingredient_id` null för okopplad | N/A |
| Ogiltigt utkast | Tom titel eller tomt steg | "Spara recept" inaktiv och fältet visar felet | Inget anrop |
| Sparning misslyckas | Databasfel eller avbrott | Meddelanderutan "Det gick inte att spara receptet. Försök igen." och förhandsgranskningen finns kvar oförändrad | Ingen halv sparning av receptet |
| Receptvy | `/recept/[id]` för eget recept | Bild (`referrerPolicy="no-referrer"`, platshållare vid fel), titel, tid, portioner, källa, ingredienser med mängd och enhet, numrerade steg; på mobil ingredienser ovanför steg | N/A |
| Okänt recept | `/recept/<annat id>`, annan användares id eller ogiltigt id | "Sidan finns inte." (not-found i app-gruppen) | N/A |
| Annan användare | Läser eller skriver A:s recept | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `src/features/recipes/domain/recipe-draft.ts` (`recipeDraftSchema`, `RecipeLine` med valfritt `hint`, `validateDraft`), `src/features/recipes/ui/import-sheet.tsx`, `recipe-preview.tsx` (exponerar `isValid`) -- förhandsgranskningen från 1.6; här läggs "Spara recept". Regeln "ingen mängd ⇒ vag rad utan enhet" gäller redan i schemat
- `src/features/catalog/server.ts` -- `commitIngredients(choices)` returnerar id per rad (null för `unmatched`), `getIngredientNames(ids)`
- `supabase/migrations/*_catalog*.sql` -- mönster för tabeller, RLS, grants, sammansatt FK och `security invoker`-funktion; `ingredient (id, user_id)` är unik för sammansatta FK
- `tests/integration/support.ts` (`expectRlsIsolation`, inloggade testanvändare), `tests/integration/catalog.test.ts` -- mönster för integrationstester
- `src/app/(app)/recept/page.tsx`, `src/app/(app)/not-found.tsx`, `src/components/` (Notice, Button, FixedAction, toast) -- sidor och byggstenar
- `src/features/auth/server.ts` -- `requireUser`, `requireUserOrRedirect`

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<tid>_recipes.sql` (skapad med `supabase migration new … < /dev/null`, körd med `supabase migration up`) -- `recipe` (`title`, `original_servings` ≥1, `total_minutes` null eller ≥0, `image_url`, `source_kind` med check, `source_url` satt bara när `source_kind = 'url'`, `is_favorite` default false, `created_at`, `updated_at`), `recipe_step` (`recipe_id`, `position`, `text`; unik `(recipe_id, position)`), `recipe_ingredient` (`recipe_id`, `ingredient_id` null, `step_id` null, `position`, `original_text`, `amount`, `unit` med check mot `UNITS`, `is_vague`; check att vag rad saknar mängd och enhet); sammansatta FK med `cascade` till receptet och `restrict` till `ingredient`; RLS, policy och grants enligt AD-4; funktionen `save_recipe(recipe jsonb, steps jsonb, lines jsonb)` (`security invoker`) som skriver allt i en transaktion och returnerar receptets id -- AD-4, AD-10, AD-20
- [x] `src/lib/supabase/database.types.ts` -- `pnpm db:types` -- AD-5
- [x] `tests/design/` -- enhetslistan i `recipe_ingredient` matchar `UNITS`; `source_kind` matchar `RecipeDraft` -- drift
- [x] `src/lib/revalidate.ts` -- `revalidateFor(table)` med `recipe` → `/recept` och `/recept/[id]` (layoutnivå) -- AD-18
- [x] `src/features/recipes/domain/source-label.ts` (+ test) -- `sourceLabel(kind, url)`: värdnamn utan `www.` för `url`, "Inklistrad text", "Foto av kokbok", "AI-förslag" -- AD-10
- [x] `src/features/recipes/ui/` -- använd `validateDraft` och `isValid` från Story 1.6 för att spärra "Spara recept"; inga nya valideringsregler här -- matrisen
- [x] `src/features/recipes/data/save.ts`, `src/features/recipes/data/queries.ts` -- `saveRecipeIn(db, draft, ingredientIds)` via `save_recipe`; `getRecipe(db, id)` med steg, rader och ingrediensnamn -- AD-1
- [x] `src/features/recipes/actions/save-recipe.ts` (`"use server"`) -- `requireUser`, Zod, `commitIngredients` (val per rad), `saveRecipeIn`, `revalidateFor('recipe')`; returnerar `Result<{ id }>`; fel → `recipe_save_failed` med text "Det gick inte att spara receptet. Försök igen." i `src/lib/errors.ts` -- AD-2, AD-13
- [x] `src/features/recipes/ui/` -- "Spara recept" som primär knapp längst ned i förhandsgranskningen, inaktiv vid fältfel; under sparning "Sparar …"; vid framgång stäng arket, navigera till `/recept/[id]` och visa kort bekräftelse "Receptet är sparat." -- UX
- [x] `src/app/(app)/recept/[id]/page.tsx`, `src/features/recipes/ui/recipe-view.tsx`, `src/features/recipes/ui/recipe-image.tsx` -- receptvyn enligt matrisen; `notFound()` för okänt eller ogiltigt id; bilden som klientkomponent med platshållare vid fel -- FR-20 (grund)
- [x] `tests/integration/recipes.test.ts` -- RLS för de tre tabellerna; `save_recipe` sparar allt eller inget (ogiltig rad mitt i ger inga rader); främmande `ingredient_id` nekas; stegkoppling sparas; vag rad med mängd nekas; borttagning av recept tar med steg och rader -- matrisen
- [x] `tests/e2e/import.spec.ts` (utökad) eller `tests/e2e/recipe.spec.ts` -- importera fixturtext → spara → receptvyn visar titel, ingredienser och steg; mobil (390 px) ingredienser ovanför steg; okänt id visar "Sidan finns inte." -- matrisen
- [x] `README.md` -- receptmodulens tabeller och `saveRecipe` -- dokumentation

**Acceptance Criteria:**
- Given den lokala databasen, when `supabase migration up` och `pnpm db:types` körs, then skapas tabellerna och typerna ger ingen skillnad vid ny generering.
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- `recipe_ingredient.step_id` holds one step, while `RecipeLine.stepIndexes` is a list: `toSaveRecipeArgs` keeps the line's first (lowest) step. `step_id` must be a step of the same recipe (FK `(step_id, recipe_id, user_id)`, `on delete set null (step_id)`), so `updateRecipe` (1.11) can remove steps without losing lines.
- `save_recipe` raises `22023` for a `step_position` that names no step, so a broken link is never saved silently. `recipe.image_url` and `source_url` also have a check for `http(s)://`.
- `/recept/[id]` is the first dynamic route in the app shell. `next build` refused `usePathname()` outside `<Suspense>` in the layout, so `TabBar`, `SideMenu` and `ScrollMemory` now wrap the hook in `<Suspense>`; the menus render without a current item until the path is known (`currentState` takes `null`).
- The new route made `@next/next/no-html-link-for-pages` flag `<a href="/recept/1">` in `src/components/toggles.test.tsx`; the test now uses a hash link.
- `tests/e2e/recipe.spec.ts` saves the fiskgratäng fixture, not linssoppa: saving creates catalog ingredients for the shared E2E user, and `import.spec.ts` needs linssoppa's carrots to stay "Ny".
- A failed save shows the notice above "Spara recept" in the sheet's footer, where the button is, rather than at the top of the scrolled preview.
- Review follow-up (`<time>_recipes_hardening.sql`): the client makes the recipe id with the preview (`crypto.randomUUID`), `saveRecipe(draft, recipeId)` passes it on, and `save_recipe` inserts `on conflict (id) do nothing`, so a lost answer followed by "Försök igen" never makes a copy. The migration also adds the `updated_at` trigger, the symmetric source check, an index on `(user_id, created_at desc)`, length limits matching `draftLimits`, and checks for an object recipe, steps 0…n−1 and at most 100 steps and 200 lines. While saving, the sheet cannot be closed (`Sheet preventClose`) and the preview is `inert`.
- The E2E global-setup deletes the E2E user before each run (the service role may not delete catalog ingredients, AD-20, so the user's cascade is the way to empty its catalog). recipe.spec.ts still saves fiskgratäng, because spec files run at the same time against that one user.
- Slutverifiering efter granskning: lint, typecheck, 695 Vitest, 59 integrationstester, build, 52 Playwright (`CI=1`). E2E raderar hela testanvändaren före varje körning (katalogingredienser får inte raderas, AD-20).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Ett förlorat svar följt av "Försök igen" sparar receptet två gånger | high | Ingen idempotens i `save_recipe` | patch (id från klienten, `on conflict do nothing`) |
| 2 | edge | Arket kan stängas under pågående sparning; gammalt fel visas vid nästa import; förhandsgranskningen går att ändra under sparning | medium | Ingen token för sparningen | patch |
| 3 | blind, edge | `updated_at` uppdateras aldrig | medium | Ingen trigger | patch (ny migration) |
| 4 | blind | `source_kind = 'url'` utan `source_url` godtas av databasen | medium | Kontrollen gäller bara åt ett håll | patch (ny migration) |
| 5 | blind | Inget index på `recipe (user_id, created_at)` | low | Direkt tillägg | patch (ny migration) |
| 6 | blind | `save_recipe` kontrollerar inte att `recipe` är ett objekt eller att positionerna är sammanhängande | low | Direkt korrigering | patch (ny migration) |
| 7 | blind | Inga längd- eller antalsgränser för titel, steg och rader | medium | Server Action tar emot allt | patch (schema och databas) |
| 8 | blind | Receptvyn döljer originaltexten (tillagningsnoter) för exakta rader | medium | "Lök, hackad" visas som "Rödlök 1 st" | patch |
| 9 | edge | `totalMinutes = 0` visas som "0 min" | low | Direkt korrigering | patch |
| 10 | blind | Webbläsarfliken heter alltid "Recept" | low | Direkt korrigering | patch (`generateMetadata`) |
| 11 | blind | `getRecipe` kan kasta `ZodError` | low | Direkt korrigering | patch |
| 12 | blind | Dubbel rad i `revalidateFor('recipe')` | low | Direkt korrigering | patch |
| 13 | blind | E2E-användarens recept och katalog växer för varje körning | medium | Gör testerna beroende av varandra | patch (städning i global-setup) |
| 14 | verify | Recept-fliken som aktuell på `/recept/[id]` testas inte | medium | Bara statiska vägar testas | patch |
| 15 | verify, blind | `RecipeImage` (fel, no-referrer) testas inte | medium | Bara `src === null` testas | patch |
| 16 | verify | `RecipeView` testas bara utan tid och utan länk | medium | Fixturen är text utan tid | patch |
| 17 | blind | En rad sparar bara sitt första steg | low | Datamodellen har ett `step_id`; stegläget visar raden vid första användningen | avvisad (beslut loggat) |
| 18 | edge | `notFound()` inuti `<Suspense>` ger HTTP 200 | low | Ingen synlig skillnad för Pontus | avvisad |
| 19 | blind, edge | Punycode visas för domäner med å/ä/ö | low | Ovanligt för receptsajter | avvisad |
| 20 | edge | SVG utan egen storlek tolkas som trasig bild | low | Ovanligt | avvisad |
| 21 | verify, blind | Meddelandet för utgången session testas inte; utkastet sparas inte över inloggning | low | Kräver utloggad Server Action i e2e | defer |

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellerna finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
