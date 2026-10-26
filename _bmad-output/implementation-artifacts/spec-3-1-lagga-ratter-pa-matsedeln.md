---
title: 'Story 3.1: Lägga rätter på matsedeln'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'ce36da849de0e389156d12d587d8aafd5a0708f0'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus kan inte planera veckan. Hen behöver en matsedel med rätter och portioner, där en favorit läggs till med två tryck.

**Approach:** Modulen `mealplan` får tabellerna `meal_plan` och `meal_plan_recipe` (AD-20, AD-22), `addToCurrentPlan` som skapar en aktuell matsedel vid behov, Matsedel-sidan med matsedelsrätter (portionsväljare och status), arket Lägg till rätt med favoriter överst och knappen "Lägg på matsedeln" i receptvyn. Borttagning av recept tar först bort rätten från den aktuella matsedeln (`detachRecipe`).

## Boundaries & Constraints

**Always:** Bara `mealplan` läser och skriver sina tabeller (AD-1); recept hämtas via `recipes/server.ts`, status via `pantry` (`recipeStatus`, `getPantrySnapshot`). `meal_plan.is_current` är unik per användare (partiellt unikt index). `meal_plan_recipe.recipe_id` är `on delete set null (recipe_id)` med `recipe_title` som ögonblicksbild; barntabeller har sammansatta FK med `cascade` (AD-20). `addToCurrentPlan(recipeId, servings?)` skapar aktuell matsedel om ingen finns (namn "Vecka <ISO-vecka>"), lägger alltid till en ny rad (samma recept får förekomma flera gånger) och förvalda portioner är receptets originalportioner (AD-22). Migration enligt AD-4. Actions: `requireUser()`, Zod, `Result`, felkoder `mealplan_<orsak>`, `revalidateFor('meal_plan_recipe')` som revaliderar `/matsedel`, `/recept` och `/lista`. Klientkomponenter får andra modulers actions som props från sidan. Kör aldrig `supabase db reset`.

**Never:** Inga tidigare matsedlar eller "Använd igen" (3.2). Ingen inköpslista (3.3). Ingen omordning med dra och släpp.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tom matsedel | Ingen aktuell matsedel | "Ingen rätt på matsedeln än." och "Lägg till rätt" | N/A |
| Två tryck | "Lägg till rätt" → tryck på en favorit | Aktuell matsedel skapas vid behov ("Vecka 44"), rätten läggs till med originalportioner, arket stängs | N/A |
| Sök i arket | Sökord i Lägg till rätt | Bibliotekssökningen (titel och ingredienser) under favoriterna | N/A |
| Receptvyn | "Lägg på matsedeln" | Rätten läggs till; kort bekräftelse "Lagt på matsedeln." | N/A |
| Samma recept igen | Recept som redan finns | Ny rad; båda visas | N/A |
| Portioner | − / + på en matsedelsrätt | Sparas optimistiskt; minst 1 | Fel: värdet återställs och "Det gick inte att spara portionerna." |
| Status | Matsedelsrätt | "Kan lagas nu" / "Saknar N varor" för valda portioner via `recipeStatus` | N/A |
| Ta bort rätt | Svep vänster eller "Ta bort" | Rätten tas bort med "Ångra" i 5 s (samma id tillbaka) | N/A |
| Recept raderas | Recept på aktuell matsedel tas bort i biblioteket | `detachRecipe` tar bort rätten från aktuell matsedel före raderingen | N/A |
| Annan användare | Läser eller skriver A:s matsedel | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-3-context.md` -- tabeller, referenser, `addToCurrentPlan`, UX
- `src/features/recipes/server.ts` (`listRecipes`, `getRecipe`, `searchRecipes`), `actions/delete-recipe.ts` -- läsfunktion för flera recept-id behövs; `deleteRecipe` ska anropa `mealplan.detachRecipe`
- `src/features/recipes/ui/recipe-row.tsx`, `recipe-view.tsx` -- radkomponenten (flytta det som behövs till `src/components/`), knappen i receptvyn
- `src/features/pantry/` -- `recipeStatus`, `getPantrySnapshot` (Epic 2)
- `src/components/` -- `Stepper`, `Sheet`, `SearchField`, `StatusBadge`, `SwipeRow` (2.3), toast
- `src/app/(app)/matsedel/page.tsx` -- tomt läge finns
- `tests/e2e/support.ts`, `global-setup.ts` -- lägg till en egen e2e-användare för matsedeln

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<tid>_mealplan.sql` (+ `pnpm db:types`) -- `meal_plan` (`name`, `is_current`, `created_at`, partiellt unikt index), `meal_plan_recipe` (`meal_plan_id`, `recipe_id` null, `recipe_title`, `servings` ≥ 1, `position`, `created_at`), FK enligt Boundaries, RLS och grants; funktionen `add_to_current_plan(recipe_id, servings, id)` (`security invoker`) som skapar aktuell matsedel vid behov och lägger till raden i en transaktion -- AD-4, AD-20, AD-22
- [x] `src/features/recipes/server.ts` -- `getRecipesByIds(ids)` (titel, bild, originalportioner, tid, rader för status) -- AD-1
- [x] `src/features/mealplan/domain/`, `data/`, `actions/`, `server.ts`, `index.ts` (+ tester) -- `getCurrentPlan()`, `addToCurrentPlan`, `setServings`, `removePlanRecipe` (returnerar raden), `restorePlanRecipe`, `detachRecipe(recipeId)`; `isoWeekName(date)` -- AD-22
- [x] `src/features/recipes/actions/delete-recipe.ts` -- anropar `mealplan.detachRecipe` före raderingen -- AD-20
- [x] `src/lib/revalidate.ts` -- `meal_plan`/`meal_plan_recipe` → `/matsedel`, `/lista`, `/recept` -- AD-18
- [x] `src/app/(app)/matsedel/page.tsx`, `src/features/mealplan/ui/` -- matsedelsrätter som kort med bild, titel, portionsväljare och status, svep och "Ta bort" med Ångra, "Lägg till rätt" och arket med favoriter överst och sökning -- UX
- [x] `src/features/recipes/ui/recipe-view.tsx`, `src/app/(app)/recept/[id]/page.tsx` -- "Lägg på matsedeln" (primär) med action som prop från sidan -- FR-13
- [x] `tests/integration/mealplan.test.ts` -- RLS för båda tabellerna; en aktuell matsedel per användare; `add_to_current_plan` skapar och lägger till; `set null` vid raderat recept behåller titeln; `detachRecipe` -- matrisen
- [x] `tests/e2e/mealplan.spec.ts` -- egen e2e-användare: tom matsedel, favorit med två tryck, sök och lägg till, "Lägg på matsedeln" i receptvyn, portioner, status, ta bort med Ångra -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **`add_to_current_plan`:** funktionen tar emot dish-id, recept-id, titel, portioner och matsedelns namn. Det beror på att bara `mealplan` får läsa recepttabellerna (AD-1). Actionen läser receptet via `recipes.getRecipesByIds`.
- **`getCurrentPlan()`:** ger bara matsedelns egna rader. Matsedel-sidan använder `getMealPlanView()`, som också hämtar recept och lagerstatus.
- **Statusen:** räknas i webbläsaren utifrån ögonblicksbilden, så att den följer portionsväljaren direkt.
- **UX-val (står i beslutsloggen):**
  - Korten har en synlig knapp "Ta bort".
  - Arket visar "Övriga recept" när sökfältet är tomt.
  - Bekräftelsen säger "X är borttagen från matsedeln.".

## Spec Change Log

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- `detachRecipe` blir en RPC med låset.
- Ångra går via en RPC som bara återställer till den aktuella matsedeln.
- Dish-id skapas i klienten, så att ett nytt försök inte ger en dubblett.
- Portioner:
  - en DB-check för 1–1000
  - receptets portioner begränsas till det intervallet
  - portionsväljaren har en min- och maxgräns
  - skrivningar per rätt görs i ordning
- Titelns längd stämmer med receptets.
- Om biblioteket eller receptdata inte går att läsa visas matsedeln ändå.
- Arket nollställs när det öppnas.
- Ingen fel-toast för en rätt som håller på att tas bort.
- Bilderna laddas lazy.
- Nya tester:
  - felvägarna
  - Ångra för flera rätter
  - fokus efter borttagning
  - samtidiga första tillägg
  - återställning till en matsedel som inte är aktuell
  - portionsgränsen

**Defer:**
- En transaktion över både detach och radering av receptet. Modulgränsen hindrar det, och ett nytt försök är säkert.
- En tidsgräns i arket.
- En positionsräknare, så att en ledig position aldrig återanvänds.
- Årtal i matsedelns namn, som tas upp i 3.2.
- Att en annan alert ersätter Ångra-toasten, samma som för lagret.

**Reject:** SVG med `naturalWidth` 0.

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellerna finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
