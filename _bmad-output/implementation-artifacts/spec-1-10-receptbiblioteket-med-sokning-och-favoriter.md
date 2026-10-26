---
title: 'Story 1.10: Receptbiblioteket med sökning och favoriter'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '43410d015bdfbd14c37e3c987f8ebcb50fc96245'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sparade recept syns bara via direktlänk. Pontus behöver ett bibliotek där hen bläddrar, söker på titel och ingrediens och snabbt når sina favoriter.

**Approach:** Recept-sidan listar Pontus recept som receptrader (bild, titel, "35 min · 4 portioner", hjärta) enligt `DESIGN.md`. Sökfältet anropar läsactionen `searchRecipes` efter 200 ms paus och söker på titel, originaltext och katalogens namn och synonymer. Filtren Alla och Favoriter sparas på enheten. Hjärtat växlar favorit optimistiskt både i listan och i receptvyn.

## Boundaries & Constraints

**Always:** `recipes` läser bara sina egna tabeller; ingredienssökning går via en exporterad katalogfunktion som returnerar ingrediens-id för namn och synonymer (AD-1). `searchRecipes` är en läsaction (`search*`-undantaget i AD-1) med `requireUser()` och Zod. `toggleFavorite` är en Server Action med `requireUser()`, Zod och `revalidateFor('recipe')`. Listan läses i en Server Component inuti `<Suspense>` med skelettrader. Hjärtat ligger bredvid radens länk (radlänken sträcks över raden, hjärtat ovanpå), aldrig inuti länken. Valet av filter sparas i `localStorage` med try/catch. Svensk text enligt `EXPERIENCE.md`.

**Never:** Ingen lagningsstatus och inget filter "Kan lagas nu" (Epic 2 och 5). Ingen redigering eller borttagning (1.11). Ingen paginering i v1 (en användare); listan sorteras nyast först.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lista | Sparade recept | Receptrader nyast först: bild (72 px, platshållare), titel, "35 min · 4 portioner" (utan tid om den saknas), hjärta; tryck på raden öppnar `/recept/[id]` | Svar inom en sekund för 200 recept (NFR7) |
| Tomt bibliotek | Inga recept | "Inga recept än. Klistra in en länk till ett recept du gillar." och "Importera recept" | N/A |
| Sök titel | "gryta" | Recept vars titel innehåller ordet, efter 200 ms paus | N/A |
| Sök ingrediens | "lök" | Recept med en rad vars originaltext, katalognamn eller synonym innehåller "lök" | N/A |
| Ingen träff | "xyz" | "Inga recept matchar." och "Rensa sökning" som tömmer fältet | N/A |
| Favoriter | Pillret Favoriter | Bara favoriter; utan favoriter "Inga favoriter än. Tryck på hjärtat på ett recept." | N/A |
| Filter sparas | Välj Favoriter, ladda om | Favoriter är valt | Utan `localStorage`: Alla |
| Sök + filter | "gryta" och Favoriter | Favoriter vars titel eller ingredienser matchar | N/A |
| Hjärta | Tryck i listan eller receptvyn | Växlar direkt och sparas; navigering påverkas inte | Fel: hjärtat återställs och en kort bekräftelse "Det gick inte att spara favoriten." |
| Annan användares id | `toggleFavorite` med främmande id | Inget ändras | `unauthorized` / inget resultat (RLS) |

</frozen-after-approval>

## Code Map

- `src/app/(app)/recept/page.tsx` -- tomt läge, "+" och importarket finns; här kommer listan
- `src/features/recipes/data/queries.ts`, `src/features/recipes/server.ts` -- `getRecipe`; lägg till `listRecipes` och sökning
- `src/features/recipes/ui/recipe-view.tsx` -- receptvyn; lägg till hjärtat
- `src/features/catalog/data/queries.ts` (`searchCatalog`), `src/features/catalog/server.ts` -- lägg till en exporterad funktion som ger ingrediens-id för en söktext (namn och synonymer)
- `src/components/` -- `SearchField` (200 ms, Enter direkt), `FilterPills` (radiogroup), `HeartToggle` (bredvid länk), `Skeleton`, `EmptyState`, toast
- `src/lib/revalidate.ts` -- `revalidateFor('recipe')` revaliderar `/recept` på layoutnivå
- `supabase/migrations/*recipes_hardening*` -- index `recipe (user_id, created_at desc)` finns

## Tasks & Acceptance

**Execution:**
- [x] `src/features/catalog/server.ts` (+ data, test) -- `findIngredientIds(query)`: ingrediens-id vars namn eller synonym innehåller söktexten (normaliserad, högst 200 id) -- AD-1
- [x] `src/features/recipes/data/queries.ts` (+ integrationstest) -- `listRecipes(db, { favoritesOnly })` och `searchRecipesIn(db, { text, ingredientIds, favoritesOnly })` som returnerar `RecipeListItem` (`id`, `title`, `imageUrl`, `totalMinutes`, `originalServings`, `isFavorite`), nyast först; ILIKE med escapade jokertecken -- matrisen
- [x] `src/features/recipes/actions/search-recipes.ts` (+ test) -- `"use server"`, `requireUser`, Zod (högst 100 tecken), `findIngredientIds` + `searchRecipesIn`; tom text ger hela listan -- AD-1
- [x] `src/features/recipes/actions/toggle-favorite.ts` (+ test) -- `"use server"`, `requireUser`, Zod (`id`, `isFavorite`), uppdaterar `is_favorite`, `revalidateFor('recipe')` -- FR9
- [x] `src/features/recipes/ui/recipe-list.tsx`, `recipe-row.tsx`, `library.tsx` -- klientkomponent med sökfält, filterpiller Alla/Favoriter (sparas i `localStorage` med try/catch), lista med `useOptimistic` för hjärtat, tomma lägen och "Rensa sökning"; den första listan kommer från servern -- UX-DR7
- [x] `src/app/(app)/recept/page.tsx` -- läser listan i `<Suspense>` med skelettrader och visar biblioteket; tomt läge som tidigare -- matrisen
- [x] `src/features/recipes/ui/recipe-view.tsx` -- hjärta i receptvyn (samma action, optimistiskt) -- FR9
- [x] `tests/e2e/library.spec.ts` -- med e2e-användaren: spara två recept via import (mock), se dem i listan; sök på titel och på ingrediens; ingen träff och "Rensa sökning"; favorit i listan och i receptvyn; filtret Favoriter sparas efter omladdning; tomt bibliotek -- matrisen
- [x] `tests/integration/recipes.test.ts` (utökad) -- `listRecipes` och sökning respekterar RLS; ILIKE-jokertecken i söktexten tolkas som text -- matrisen
- [x] `README.md` -- avsnitt om biblioteket -- dokumentation

**Acceptance Criteria:**
- Given 200 recept för en användare i den lokala databasen, when Recept-sidan laddas i den byggda appen, then svarar sidan inom en sekund (mät i ett integrations- eller e2e-test, notera tiden).
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- `containsPattern` moved from `catalog/domain/search.ts` to `src/lib/like-pattern.ts`, shared by the catalog search and `searchRecipesIn`.
- `searchRecipesIn` runs one PostgREST query per way to match (title; line text via `recipe_ingredient!inner()`; ingredient ids in chunks of 100), each returning recipes rather than lines, ordered (`created_at desc, id`) and paged with `.range()` past `max_rows`; results are merged and sorted newest first. `listRecipes` pages the same way. `findIngredientIds` interleaves name and synonym hits before a 1000-id cap.
- The client filters Alla/Favoriter itself (on the server list or the search answer) so the optimistic heart and pill switches need no request; `searchRecipes(query)` takes the query only.
- The favourite action is `setFavorite` (`actions/set-favorite.ts`), since it sets rather than toggles; the update filters on `id` and `user_id`.
- New error codes: `recipe_search_failed`, `recipe_favorite_failed` ("Det gick inte att spara favoriten.").
- `SearchField` got a `ref` handle (`clear()`) for "Rensa sökning" in the empty state; `RecipeImage` got `iconSize`.
- E2E: the main E2E user's library must stay empty (auth, shell and import specs expect "Inga recept än."), so `e2e-recept@matkoll.test` (recipe.spec, the saved-photo test) and `e2e-bibliotek@matkoll.test` (library.spec) were added to global-setup and ALLOWED_EMAILS. Measured: `/recept` with 200 recipes 85 ms in the built app; `listRecipes` 3 ms and `searchRecipesIn` 6 ms in the integration test.
- Slutverifiering efter granskning: lint, typecheck, 1117 Vitest, 81 integrationstester, build, 94 Playwright (`CI=1`). `toggleFavorite` heter nu `setFavorite`.

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge, verify | Sök över 100 tecken ger fel vars "Försök igen" alltid misslyckas | medium | Ingen `maxLength`; `validation` visas som tillfälligt fel | patch |
| 2 | blind, edge | Utgången session visas som tillfälligt fel vid sökning och favorit | medium | Alla fel blir `failed` | patch (`router.refresh()` vid `unauthorized`) |
| 3 | blind | `favoritesOnly` och tom-text-grenen i `searchRecipes` används inte | low | Klienten filtrerar själv | patch (ta bort) |
| 4 | blind, edge | Ingredienssökningen kapas tyst vid 200 id, namn före synonymer | medium | `findIngredientIdsIn` | patch (slå ihop före kapning, högre gräns) |
| 5 | blind, edge | Listan och sökningen saknar ordning och gräns; PostgREST kapar vid 1 000 rader | medium | `max_rows` | patch (ordning och sidvis hämtning) |
| 6 | blind, edge | Filterlagringens reservläge är modulglobalt; `setItem` som lyckas återställer inte läsningen; `clear()` i annan flik följs inte | medium | `recipe-filter-store.ts` | patch |
| 7 | blind | Sparat Favoriter visar först hela listan | low | Serversnapshot är "all" | patch (vänta med listan tills valet är känt) |
| 8 | blind | Två knappar heter "Rensa sökning" | low | Testerna väljer `.last()` | patch |
| 9 | blind | Pågående sökning syns inte | low | Bara `aria-busy` | patch |
| 10 | blind, verify | Hjärtat i ett sökresultat testas inte; E2E väntar med fast tid | medium | Mutation passerar | patch |
| 11 | verify | Fler än 100 ingrediens-id testas inte | medium | Mutation passerar | patch |
| 12 | edge | Två snabba tryck där det första misslyckas visar felmeddelande trots sparat läge | low | Direkt korrigering | patch |
| 13 | blind | `setFavoriteIn` filtrerar bara på id; namnet `toggleFavorite` sätter i själva verket | low | Direkt korrigering | patch |
| 14 | blind | README lovar mer för NFR7 än testerna kontrollerar | low | Direkt korrigering | patch |
| 15 | blind | Två specar sparar recept parallellt med samma testanvändare; varningen togs bort | low | Kommentar | patch (återställ varningen) |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
