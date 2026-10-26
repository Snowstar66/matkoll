---
title: 'Story 2.4: Lagningsstatus i receptbiblioteket'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus ser inte i biblioteket vilka rätter han kan laga med det han har hemma.

**Approach:** Mängdlogiken i `pantry/domain` (`aggregateNeeds`, `coverage`, `recipeStatus`, AD-7) jämför varje recept mot lagrets ögonblicksbild. Receptraderna och biblioteket visar "Kan lagas nu" eller "Saknar N varor", och receptvyn visar bock eller ring per rad. Statusen räknas om när lagret ändras.

## Boundaries & Constraints

**Always:** All jämförelse mot lagret sker bara i `pantry/domain` (AD-7): behov summeras per `(ingredientId, unit)` med `aggregateNeeds` innan `coverage` anropas; `coverage` ger `covered`, `partial`, `other-unit`, `missing` eller `vague-missing`; obegränsad vara räcker alltid; en vag rad är täckt om ingrediensen finns i någon form; N är antalet distinkta katalogingredienser med `missing`, `partial` eller `other-unit`, utan vaga rader. Receptrader utan katalogingrediens (`ingredientId = null`) räknas inte i N och visas neutralt (beslut i `docs/beslutslogg.md`). Biblioteket använder receptets originalportioner. Varje recept jämförs mot hela lagret. Status visas aldrig bara med färg. `recipes` hämtar status via `pantry/index.ts` och `pantry/server.ts`; inga tabeller läses över modulgränsen. Svar inom en sekund för 200 recept (NFR7).

**Never:** Ingen portionsväljare eller "X av Y hemma" (Epic 4), inget filter "Kan lagas nu" eller rangordning (Epic 5), ingen omräkning mellan enheter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Allt finns | Alla rader täckta | "Kan lagas nu" (mint) på raden i biblioteket och i receptvyn | N/A |
| Saknas | Två ingredienser saknas | "Saknar 2 varor" (ljusblå); en: "Saknar 1 vara" | N/A |
| Delvis | Recept 3 dl grädde, lager 2 dl | Räknas som saknad (partial) | N/A |
| Annan enhet | Recept 2 dl mjöl, lager 1 kg | Räknas som saknad (other-unit); receptvyn visar "hemma: 1 kg" | N/A |
| Obegränsad | Salt obegränsad | Täckt oavsett mängd | N/A |
| Vag rad | "salt efter smak", salt saknas | Räknas inte i N; visas utan mängd | N/A |
| Summering | Två rader "1 dl grädde" + "2 dl grädde", lager 2 dl | Behovet 3 dl jämförs; delvis → saknad | N/A |
| Okopplad rad | Rad utan katalogingrediens | Räknas inte i N; visas med originaltext och neutral markering | N/A |
| Receptvyn | Varje rad | Grön bock (finns) eller blå ring (saknas) med skärmläsarnamn "finns hemma"/"saknas"; mängd i `sky-ink` när den saknas | N/A |
| Lagret ändras | Lägg till grädde i Hemma, gå till biblioteket | Statusen är omräknad | N/A |

</frozen-after-approval>

## Code Map

- `src/features/pantry/` -- `getPantrySnapshot()`, `PantrySnapshot` från 2.1
- `src/features/recipes/data/queries.ts` (`listRecipes`, `searchRecipesIn`, `getRecipe`), `domain/recipe-list.ts` (`RecipeListItem`), `ui/recipe-row.tsx`, `ui/recipe-view.tsx` (`IngredientRow`) -- här läggs statusen; listan behöver receptraderna (ingrediens, mängd, enhet, vag) per recept
- `src/components/badges.tsx` (`StatusBadge` ok/missing), `icons.tsx` (bock, ring)
- `src/lib/revalidate.ts` -- `pantry_item` revaliderar `/recept` (layout) sedan 2.2
- `docs/beslutslogg.md` -- skriv in beslutet om okopplade rader

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/pantry/domain/coverage.ts`, `aggregate-needs.ts`, `recipe-status.ts` (+ tester) -- enligt Boundaries och matrisen; tester för varje utfall, summering, vaga och okopplade rader, obegränsad -- AD-7
- [ ] `src/features/recipes/data/queries.ts` -- listan och sökningen hämtar receptraderna (ingredientId, amount, unit, isVague) per recept i samma frågor eller en extra fråga, utan att bryta svarstiden -- NFR7
- [ ] `src/features/recipes/server.ts` eller sidan -- räknar `recipeStatus` med `getPantrySnapshot()` per förfrågan och skickar status till listan och vyn -- AD-1
- [ ] `src/features/recipes/ui/recipe-row.tsx`, `recipe-view.tsx` -- `StatusBadge` med "Kan lagas nu"/"Saknar N varor"/"Saknar 1 vara"; i vyn bock eller ring per rad, "hemma: …" vid annan enhet, neutral markering för okopplad rad -- UX-DR8
- [ ] `docs/beslutslogg.md` -- beslutet om okopplade rader -- spårbarhet
- [ ] `tests/integration/recipes.test.ts` eller `pantry.test.ts` -- status för riktiga recept mot riktigt lager; 200 recept med status inom tidsgränsen -- NFR7
- [ ] `tests/e2e/pantry-status.spec.ts` -- egen e2e-användare: spara ett recept, se "Saknar N varor", lägg till varor i Hemma, se "Kan lagas nu" i biblioteket och bockar i receptvyn -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- En receptrad med mängd men utan enhet jämförs som `st` (beslut 2026-10-26).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
