---
title: 'Story 4.1: Portioner och "X av Y hemma" i receptvyn'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Receptvyn visar bara receptets egna portioner. Pontus kan inte se hur mycket som behövs för fler eller färre portioner, eller hur mycket som finns hemma för just det antalet, innan hen börjar laga.

**Approach:** Receptvyn får en portionsväljare (`Stepper`) som startar på receptets portioner och skalar mängderna direkt med `scaleFactor` och `scaleLines` från `recipes/domain/scale.ts`. Mängderna visas med `formatQuantity`, och inget sparas. Statusen räknas i webbläsaren med `recipeStatus(recipe, servings, snapshot)`, som utökas med "X av Y hemma". Sidan skickar ögonblicksbilden av lagret i stället för en färdig status. Etiketten, bocken eller ringen per rad, `sky-ink` för saknad mängd och "hemma: …" följer de valda portionerna. Sida vid sida från 1024 px finns redan och verifieras.

## Boundaries & Constraints

**Always:**
- Skalning sker bara i `recipes/domain/scale.ts`, avrundning bara i `formatQuantity`, och enheter räknas aldrig om (AD-7, AD-12).
- Jämförelsen med lagret sker bara i `pantry/domain` (`aggregateNeeds`, `coverage`, `recipeStatus`):
  - N räknar inte vaga rader.
  - Rader utan katalogingrediens räknas varken i N eller i X och Y, och de visas neutralt.
  - En mängd utan enhet jämförs som `st`.
  - Beslut 2026-10-26.
- I receptvyn påverkar portionsvalet bara visningen. Ingen Server Action anropas när − eller + trycks (EXPERIENCE.md).
- Portionsväljaren har minst 1 och högst `maxServings` (1000, samma gräns som matsedelsrätten).
- `recipes` läser lagret via `pantrySnapshotOrNull` (`pantry/server.ts`) och använder `recipeStatus` via `pantry/index.ts`. Andra moduler läser inga tabeller (AD-1).
- Om lagret inte går att läsa visas receptet ändå, med skalning men utan etikett, markeringar och "X av Y hemma" (Story 2.4).
- Status visas aldrig bara med färg.
- Sessionen och id:t läses inuti `<Suspense>` (AD-18).
- Ingen migration behövs. Kör aldrig `supabase db reset`.

**Never:**
- Inget stegläge och ingen "Laga nu"-funktion (4.2).
- Valt antal portioner sparas inte per recept, på enheten eller i adressen.
- Ingen avrundning till hela styck i receptvyn. Den gäller bara inköpslistan.
- Biblioteket, matsedeln och inköpslistan ändras inte. Biblioteket visar fortfarande status för receptets egna portioner.
- Ingen omräkning mellan enheter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna receptet | Recept för 4 portioner | Portionsväljaren visar "4 portioner", och mängderna är receptets egna | N/A |
| Fler portioner | + till 6 på "2 dl grädde" | Raden visar "3 dl" direkt, och inget nätverksanrop görs | N/A |
| Färre portioner | − till 1 på "1 gul lök" (4 port.) | Raden visar "0,25 st", utan avrundning till helt styck | N/A |
| Minst 1 | 1 portion, tryck − | − är `aria-disabled`, och värdet står kvar på 1 | N/A |
| Vag rad | "salt efter smak" vid 8 portioner | Originaltexten visas oskalad | N/A |
| Rad utan katalogingrediens | "2 citroner" (okopplad) vid 8 av 4 portioner | Originaltexten och "×2" visas, med neutralt streck | N/A |
| "X av Y hemma" | 9 katalogingredienser, 7 finns för valda portioner | "7 av 9 hemma" bredvid portionsväljaren | N/A |
| Gränsen passeras | Lager 4 dl grädde, recept 2 dl för 4 portioner, + till 10 | Raden får ring och `sky-ink` och visar "hemma: 4 dl". Etiketten blir "Saknar 1 vara", och X minskar med 1 | N/A |
| Annan enhet | Recept 2 dl mjöl, lager 1 kg | Ring, `sky-ink` och "hemma: 1 kg" för alla portioner | N/A |
| Vag och saknad | "salt efter smak", inget salt hemma | Ring, räknas inte i N men räknas i Y och inte i X | N/A |
| Inga katalograder | Alla rader saknar katalogingrediens | Ingen sammanfattning. Etiketten är "Kan lagas nu" | N/A |
| Lagret går inte att läsa | `pantrySnapshotOrNull()` ger `null` | Receptet visas och mängderna skalas, men utan etikett, markeringar och sammanfattning | `pantry_unavailable` loggas |
| Lägg på matsedeln | 6 portioner valda (receptet har 4) | Rätten läggs till med 6 portioner, och "Lagt på matsedeln." visas | Felet som i 3.1 |
| Receptet ändras | "Ändra" sparar nya portioner (4 → 2) | Portionsväljaren börjar om på receptets nya portioner | N/A |
| Dator | Från 1024 px | Ingredienser och steg ligger sida vid sida (redan byggt) | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-4-context.md` -- skalning, status, modulgränser, UX
- `src/features/recipes/domain/scale.ts` -- `scaleFactor`, `scaleLines`, som redan finns (3.3)
- `src/features/pantry/domain/recipe-status.ts` (+ test), `pantry/index.ts` -- `RecipeStatus` får X och Y, och texten "X av Y hemma" behövs
- `src/features/recipes/server.ts` -- `getRecipeWithStatus` blir `getRecipeWithPantry`, som ger receptet och ögonblicksbilden (`PantrySnapshot | null`)
- `src/features/recipes/ui/recipe-view.tsx` (+ `recipe-view.test.tsx`) -- `IngredientRow`, `LineMark`, `lineCoverage`, rubriken och layouten `desktop:grid-cols-[2fr_3fr]`
- `src/features/recipes/ui/add-to-plan-button.tsx` -- `AddToPlan` får valfria `servings`, och knappen äger i dag sin `FixedAction`
- `src/features/recipes/domain/recipe-list.ts` -- `recipeMetaText(totalMinutes, servings)` (metaraden)
- `src/features/mealplan/index.ts` -- `maxServings`
- `src/components/stepper.tsx`, `fixed-action.tsx`, `button.tsx` -- `Stepper` med `max`, `aria-live`-värdet och `FixedAction` för en eller två knappar
- `src/app/(app)/recept/[id]/page.tsx` -- sidan, `<Suspense>` och `addToPlan` som prop
- `tests/e2e/support.ts`, `global-setup.ts`, `pantry-status.spec.ts` -- egen e2e-användare och mönster för seed av recept och lager

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/recipe-status.ts`, `index.ts` (+ tester) -- `RecipeStatus` får `ingredientCount` (Y) och `atHomeCount` (X), räknade enligt Implementation Notes, och `atHomeSummaryText(x, y)` ger "7 av 9 hemma". Tester täcker: skalade behov över och under gränsen, vag rad som finns och saknas, samma ingrediens på två rader (vag och med mängd), okopplade rader, Y = 0 och att N är oförändrat -- AD-7
- [x] `src/features/recipes/server.ts`, `src/app/(app)/recept/[id]/page.tsx` -- `getRecipeWithPantry(id)` läser receptet och `pantrySnapshotOrNull()` parallellt och ger `{ recipe, snapshot }`. Sidan skickar ögonblicksbilden till vyn, och `getRecipeWithStatus` tas bort när den inte längre används -- AD-1, AD-18
- [x] `src/features/recipes/ui/recipe-view.tsx` och en ny klientdel (till exempel `recipe-body.tsx`, `"use client"`) -- klientdelen håller valt antal portioner (startvärdet är receptets portioner) och har nyckeln `recipe.updatedAt`. Den skalar raderna med `scaleLines(recipe.lines, scaleFactor(servings, recipe.servings))` och räknar `recipeStatus` med ögonblicksbilden. Den visar `Stepper` (min 1, max `max(maxServings, recipe.servings)`) och "X av Y hemma" i en rad under metaraden. Etiketten följer portionerna. `IngredientRow` får de skalade raderna. En okopplad rad med mängd visar "×faktor" när faktorn inte är 1. Metaraden visar bara tiden -- FR-20, UX-DR3, UX-DR8
- [x] `src/features/recipes/ui/add-to-plan-button.tsx` -- `AddToPlan` får `servings?`, som skickas bara när valt antal skiljer sig från receptets. Knappen ligger kvar i `FixedAction` och förbereder plats för "Laga nu" (4.2) -- FR-13, FR-20
- [x] `src/features/recipes/ui/recipe-view.test.tsx` -- + och − skalar mängderna, en vag och en okopplad rad skalas inte, "×2" visas, gränsen 1 gäller, etiketten, X och färgen ändras när gränsen passeras, inget visas utan ögonblicksbild, "Lägg på matsedeln" skickar valda portioner och ingen action anropas vid − och + -- matrisen
- [x] `tests/e2e/recipe-servings.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-receptvy@matkoll.test`. Testet seedar ett recept och lagervaror, ändrar portionerna och ser mängder, "X av Y hemma", etikett och `sky-ink` ändras. Vid 1280 px ligger ingredienser och steg sida vid sida, och vid 375 px ligger ingredienserna ovanför stegen. Det lägger på matsedeln med valda portioner och ser dem på Matsedel -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): valt antal portioner gäller bara medan sidan är öppen.** Valet sparas inte per recept, på enheten (`localStorage`) eller i adressen (`?portioner=`). När sidan öppnas igen börjar väljaren på receptets egna portioner. Det följer EXPERIENCE.md: "I receptvyn påverkar valet bara visningen". Alternativ: `?portioner=6` i adressen, som gör att valet följer med vid omladdning och delning.
- **Beslut (förslag): "X av Y hemma" räknas per katalogingrediens, som bockarna.**
  - Y är antalet distinkta katalogingredienser i receptet, även de som bara har vaga rader.
  - X är de ingredienser där varje behov är `covered` för valda portioner.
  - Rader utan katalogingrediens räknas inte, enligt beslutet 2026-10-26.
  - En vag rad vars vara saknas helt räknas därför i Y men inte i X, fast den inte räknas i N. Då kan "Saknar 1 vara" stå bredvid "7 av 9 hemma". Siffran motsvarar bockarna i listan, och skiss 2 räknar "olivolja efter behov" som en av nio.
  - Alternativ: räkna bort ingredienser med bara vaga rader ur Y, så att Y − X alltid är N.
- **Beslut (förslag): ingen sammanfattning när Y är 0** (inga katalograder eller inga rader), och ingen alls när lagret inte går att läsa.
- **Beslut (förslag): "Lägg på matsedeln" använder valt antal portioner.** Den skickar `servings` bara när valet skiljer sig från receptets egna portioner. Annars väljer actionen som i 3.1. FR-13 säger att originalportionerna är förval, och ett aktivt val i receptvyn går före förvalet. Alternativ: alltid originalportioner, vilket är strikt enligt "påverkar bara visningen".
- **Beslut (förslag): ingen avrundning till hela styck i receptvyn.** "0,25 st" visas som det står (`formatQuantity`, högst två decimaler). Avrundningen uppåt gäller bara det som ska köpas (beslut 2026-10-26).
- **Beslut (förslag): en okopplad rad med mängd visar originaltexten och "×faktor".** Faktorn skrivs `×${formatQuantity(factor, null)}` och visas till höger bara när den inte är 1, i samma form som inköpslistans textposter. Originaltexten skalas inte, eftersom det skulle kräva tolkning av fritext.
- **Beslut (förslag): metaraden i receptvyn visar bara tiden** ("35 min"), eftersom portionsväljaren visar portionerna. Utan tid visas ingen metarad. Det följer skiss 2 ("35 min · Från koket.se", där källan redan har en egen rad hos oss). Biblioteket och matsedeln behåller "35 min · 4 portioner". Befintliga tester som läser `recipe-meta` uppdateras.
- **Beslut (förslag): portionsväljaren nollställs när receptet ändras.** Klientdelen har nyckeln `recipe.updatedAt`, så ett sparat "Ändra" börjar om på de nya portionerna. En omläsning när lagret ändras behåller valet.
- **Beslut (förslag): maxgränsen är `maxServings` (1000) från `mealplan`, eller receptets egna portioner om de är fler,** så att startvärdet alltid ryms. DB-checken för `original_servings` har ingen övre gräns.
- **Ögonblicksbilden till klienten:** den skickas som prop på samma sätt som `MealPlanList`. Första renderingen räknar status för receptets egna portioner, så servern och klienten ger samma HTML.
- Skärmläsarnamn och live-region finns redan i `Stepper` ("Färre portioner", "Fler portioner", `aria-live="polite"`). "X av Y hemma" annonseras inte separat.

## Spec Change Log

- Efter granskningen:
  - Ett recept med fler än 1000 portioner visar 1000 portioner från början, och mängderna skalas efter det.
  - Täckningen jämförs med samma precision som visas, två decimaler. Det påverkar också inköpslistan: en rest under 0,01 blir ingen post.
- `getRecipeWithStatus` ersätts av `getRecipeWithPantry`. Ögonblicksbilden filtreras till receptets egna ingredienser.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- Valt antal portioner ska inte nollställas när Pontus markerar receptet som favorit. Klientdelen får en nyckel som bara ändras när portionerna eller raderna ändras, i stället för `updatedAt`.
- Ett nytt försök med andra portioner får ett nytt id.
- Matsedeln får alltid de portioner som visas.
  - Portionsväljaren går högst till 1000. Ett recept med fler portioner börjar på 1000.
  - Ett ogiltigt startvärde blir 1.
- Mängder och status räknas med samma faktor.
- Bara lagrets rader för receptets ingredienser skickas till klienten.
- Status och "X av Y hemma" läses upp av skärmläsare (`aria-live`).
- Faktorn visas med högst två decimaler och aldrig som "×0".
- Avrundningen är densamma i visning och jämförelse.
- Felet för en rad utan status loggas en gång per rad.
- Ett ogiltigt id kontrolleras innan lagret läses.
- E2E-filen körs seriellt, kontrollerar att inga RSC-anrop görs och använder appens normalisering.

**Reject:** att räkna bort vaga ingredienser ur "X av Y". Det är ett antaget beslut enligt UX-skissen, och radmarkeringarna förklarar skillnaden.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: portionsväljaren och "X av Y hemma" får plats utan vågrät scroll, och + och − har en tryckyta på 44 px.
