---
title: 'Story 3.3: Inköpslistan räknas fram'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Matsedeln finns, men Pontus vet inte vad som ska handlas. Hen behöver en inköpslista per butiksavdelning där det som finns hemma redan är avdraget.

**Approach:** Modulen `shopping` får `domain/line-key.ts` (`lineKey`) och `domain/compute-list.ts` (`computeList`), den enda källan till listposter (AD-8). Ingen lista lagras: Lista-sidan läser den aktuella matsedeln, recepten, lagrets ögonblicksbild och katalogens avdelningar och räknar fram posterna vid varje läsning. Överlägget (`overlay = { checks, overrides, customItems }`) är tomt i den här storyn och fylls av 3.4–3.6.

## Boundaries & Constraints

**Always:** `computeList({ plan, recipes, snapshot, catalog, overlay })` är en ren funktion och den enda källan till `ShoppingLine[]` (AD-8). `ShoppingLine = { key, ingredientId?, label, amount, unit, isVague, coverage, pantryNote?, section, origins: mealPlanRecipeId[], checked, isCustom }`. Listnyckeln byggs bara i `shopping/domain/line-key.ts`: `r:<ingredientId>:<unit|->`, där `-` betyder vag rad; täckningsstatus ingår aldrig (AD-8). Mängden skalas per rätt bara med `recipes/domain/scale.ts` (faktor = matsedelsrättens portioner / receptets originalportioner; skapa filen om Epic 4 inte gjort det) och summeras över rätterna bara med `pantry/domain` `aggregateNeeds`; jämförelsen mot lagret görs bara med `coverage(need, snapshot)` (AD-7). Behöver `aggregateNeeds` bära med ursprung (`mealPlanRecipeId`) utökas den i `pantry/domain`, aldrig med en egen summering i `shopping`. Utfall per behov: `covered` ger ingen post (obegränsad vara räcker alltid); `partial` ger en post med kvarvarande mängd; `other-unit` ger en post med hela behovet och `pantryNote` "hemma: 1 kg" (flera enheter kommaseparerade, alltid via `formatQuantity`); `missing` ger hela behovet; `vague-missing` ger en "Finns hemma?"-post utan mängd. Enheter räknas aldrig om (AD-12). Avdelningar kommer från `SECTIONS` i fast ordning; okänd avdelning blir Övrigt. Modulgränser (AD-1): matsedeln via `mealplan/server.ts` (`getCurrentPlan`), recepten via `recipes/server.ts` (`getRecipesByIds` från 3.1), lagret via `pantry/server.ts` (`getPantrySnapshot`), namn och avdelning via `catalog/server.ts` (`getIngredientNames`, `getIngredientDefaults`). Sidan läser inuti `<Suspense>` (AD-18). `src/lib/revalidate.ts`: `/lista` (och `/matsedel`) läggs till för `recipe` och `pantry_item`, och `meal_plan`/`meal_plan_recipe` revaliderar redan `/lista` sedan 3.1 (AD-18). Om en receptrad kan ha mängd men ingen enhet får den inte nyckeln `-` (reserverad för vag rad); välj lösning och skriv in den i `docs/beslutslogg.md`.

**Never:** Inga tabeller, ingen bock (3.4), inga egna varor (3.5), ingen listpostdetalj eller dold post (3.6), ingen "Lägg i lagret" (3.7), ingen "Skicka till ICA" eller produktval (Epic 7). Ingen lagrad lista och ingen omräkning mellan enheter. Ingen fördelning av lagret mellan rätter (AD-7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Skalning | Recept för 4 med 2 dl grädde, matsedelsrätt med 6 portioner, inget lager | Post "Grädde 3 dl" | N/A |
| Sammanslagning | Två rätter med 2 dl och 1 dl grädde | En post "Grädde 3 dl", "från [rätt A], [rätt B]" | N/A |
| Olika enheter i recepten | 2 dl mjöl och 100 g mjöl | Två poster, `r:<mjöl>:dl` och `r:<mjöl>:g` | N/A |
| Obegränsad | Salt obegränsat i lagret | Ingen post för salt | N/A |
| Delvis | Behov 3 dl grädde, lager 2 dl | Post "Grädde 1 dl" | N/A |
| Lagret räcker | Behov 3 dl, lager 5 dl | Ingen post | N/A |
| Annan enhet i lagret | Behov 2 dl mjöl, lager 1 kg | Post "Mjöl 2 dl (hemma: 1 kg)" | N/A |
| Vag rad, saknas | "salt efter smak", salt saknas | Post "Salt" med "Finns hemma?" utan mängd, nyckel `r:<salt>:-` | N/A |
| Vag rad, finns | "salt efter smak", salt finns i någon form | Ingen post | N/A |
| Nyckel | Samma post före och efter att lagret ändrats från saknas till delvis | Samma nyckel; täckningsstatus ingår inte | N/A |
| Okopplad receptrad | Rad utan katalogingrediens | Post under Övrigt med radens originaltext, utan mängdberäkning och utan avdrag mot lagret; nyckel `t:<normaliserad text>` (gemener, trimmad), så att samma text från flera rätter blir en post (beslut 2026-10-26) | N/A |
| Gruppering | Poster i Mejeri, Frukt och grönt och okänd avdelning | Sektioner i ordningen Frukt och grönt, …, Mejeri, …, Övrigt; varunamn med "från [rätt]" under och mängden till höger | N/A |
| Rubrik | Aktuell matsedel "Vecka 44" med 3 rätter och 12 poster | "Inköpslista", "Vecka 44 · 3 rätter · 12 varor kvar" | N/A |
| Ingen matsedel | Ingen aktuell matsedel, eller en utan rätter | "Lägg rätter på matsedeln så räknas listan fram." | N/A |
| Allt hemma | Matsedel där allt är täckt | "Allt finns hemma." | N/A |
| Omräkning | Portioner ändras på Matsedel, eller lagret ändras i Hemma | Listan visas omräknad utan besked; en ändring som sker medan listan är öppen annonseras i en live-region | N/A |
| Svarstid | 10 rätter, 200 lagervaror | Sidan svarar inom en sekund (NFR7) | N/A |
| Läsfel | Supabase svarar inte | Blå `Notice` "Det gick inte att läsa inköpslistan. Försök igen." | `shopping_unavailable` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-3-context.md` -- listnyckel, `ShoppingLine`, modulgränser
- `src/features/mealplan/server.ts` -- `getCurrentPlan()` (3.1): namn, rätter med `id`, `recipe_id`, `recipe_title`, `servings`
- `src/features/recipes/server.ts` -- `getRecipesByIds(ids)` (3.1): originalportioner och receptrader (`ingredientId`, `amount`, `unit`, `isVague`)
- `src/features/recipes/domain/scale.ts` -- skalning; skapa om den saknas
- `src/features/pantry/domain/` (`aggregateNeeds`, `coverage`), `pantry/server.ts` (`getPantrySnapshot`) -- Epic 2, se `spec-2-1-*` och `spec-2-4-*`
- `src/features/catalog/server.ts` (`getIngredientNames`, `getIngredientDefaults`), `catalog/domain/sections.ts` (`SECTIONS`), `units.ts` (`formatQuantity`)
- `src/app/(app)/lista/page.tsx` -- rubrik och tomt läge finns
- `src/components/` -- `PageHeader`, `EmptyState`, `Skeleton`, `Notice`
- `src/lib/revalidate.ts`, `src/lib/errors.ts`
- `tests/e2e/support.ts`, `global-setup.ts` -- ny e2e-användare för listan

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/shopping/domain/line-key.ts` (+ test) -- `recipeLineKey(ingredientId, unit | null)`, `customLineKey(id)`, `parseLineKey(key)` och `lineKeySchema` (Zod) för 3.4–3.6 -- AD-8
- [ ] `src/features/recipes/domain/scale.ts` (+ test, om den saknas) -- `scaleLines(lines, factor)`; vaga rader oförändrade -- AD-7
- [ ] `src/features/pantry/domain/aggregate-needs.ts` (vid behov) -- ursprung per behov, utan att ändra resultatet för befintliga anropare -- AD-7
- [ ] `src/features/shopping/domain/compute-list.ts` (+ test) -- `computeList` och typerna `ShoppingLine`, `ShoppingListInput`, `Overlay` (tomt överlägg tills vidare); tester för varje rad i matrisen som gäller domänen, sortering per `SECTIONS` och sedan namn -- AD-7, AD-8, FR15
- [ ] `src/features/shopping/data/queries.ts`, `server.ts`, `index.ts` -- `getShoppingList()`: `requireUser`, hämtar indata via de andra modulernas `server.ts`, anropar `computeList`, returnerar `{ plan: { id, name, dishCount } | null, lines }`; inga tabeller läses över modulgränsen -- AD-1
- [ ] `src/lib/revalidate.ts` -- `recipe` och `pantry_item` revaliderar även `/matsedel` och `/lista` -- AD-18
- [ ] `src/lib/errors.ts` -- `shopping_unavailable` -- AD-13
- [ ] `src/features/shopping/ui/` -- `ShoppingList` med sektionsrubriker och `ShoppingLineRow` (varunamn, "från [rätt]" i metadata, mängd till höger, "(hemma: …)" och "Finns hemma?"), rubrikraden, tomma lägen, live-region -- UX-DR9
- [ ] `src/app/(app)/lista/page.tsx` -- data inuti `<Suspense>` med skelettrader -- AD-18
- [ ] `tests/integration/shopping.test.ts` -- `getShoppingList` mot riktiga recept, matsedel och lager; 10 rätter och 200 lagervaror inom tidsgränsen -- NFR7
- [ ] `tests/e2e/support.ts`, `global-setup.ts` -- `shoppingEmail` ("e2e-lista@matkoll.test") i `e2eEmails` med egen storage state -- egen e2e-användare
- [ ] `tests/e2e/shopping.spec.ts` -- egen e2e-användare; data läggs in med service role: tom lista utan matsedel, grupperade poster med "från [rätt]", "(hemma: 1 kg)", "Finns hemma?", "Allt finns hemma.", omräkning efter ändrade portioner och ändrat lager -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- En receptrad med mängd men utan enhet räknas som `st`, och nyckeln blir `r:<id>:st`. `-` används bara för vaga rader (beslut 2026-10-26).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
