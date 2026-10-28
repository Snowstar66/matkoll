---
title: 'Story 9.3: Filtret Erbjudanden i Recept'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-2-erbjudanden-pa-inkopslistan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-kan-lagas-nu-rangordnat.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-5-recept-och-matsedel-i-nytt-utseende.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill laga mat med det som är på erbjudande den här veckan, men biblioteket säger bara vad som kan lagas med lagret. Att leta igenom recepten efter falukorv och lax tar tid (FR-52).

**Approach:**
- Ett fjärde filterpiller i Recept, "Erbjudanden", efter "Kan lagas nu".
- Det visar recept där minst en huvudvara är på erbjudande i vald butik, flest erbjudanden först och sedan minst saknat.
- Raden överst säger vilken butik och vecka det gäller och öppnar arket. Korten får upp till två erbjudandeetiketter.

## Boundaries & Constraints

**Always:**
- `isMainLine(line)` och `offersInRecipe(lines, offers)` finns bara i `offers/domain/matching.ts`. En huvudvara är en receptrad som inte är vag och har en katalogingrediens vars kategori (`displayCategory`) inte är Såser & smaksättare. Jämförelsen är samma som i 9.2: samma katalogingrediens, och varje erbjuden vara räknas en gång per recept.
- `/recept` läser vald butik och aktiva erbjudanden inuti `<Suspense>`, räknar etiketterna per recept och skickar dem till biblioteket (`offersByRecipe: Record<recipeId, OfferChipData[]>`, och raden som slot). `recipes/ui` importerar aldrig `offers` (AD-1).
- Sorteringen i filtret: antal erbjudna huvudvaror, flest först; sedan antal saknade varor, minst först (som "Kan lagas nu"); sedan titel i svensk ordning. Den är stabil.
- Pillret sparas på enheten som de andra (`useRecipeFilter`). Sökningen gäller också i filtret.
- Kortet (`recipe-card`, 11.5) får en rad under titeln med upp till två `OfferChip` och "+N" när det finns fler. "+N" har namnet "och 2 till på erbjudande".
- Om butiken eller erbjudandena inte går att läsa visar filtret "Det gick inte att läsa erbjudandena." och inga kort, och `offers_unavailable` loggas. De andra filtren påverkas inte.
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-recept@matkoll.test`.

**Never:**
- Ingen ändring av lagningsstatus, "Kan lagas nu" eller rangordningen i de andra filtren (AD-7).
- Etiketterna visas bara i filtret Erbjudanden, inte i Alla, Favoriter eller Kan lagas nu.
- Inga AI-förslag i den här storyn (9.5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pillret | Recept | Alla, Favoriter, Kan lagas nu, Erbjudanden. Radbryts vid 375 px och 200 % text | N/A |
| Med erbjudanden | Erbjudanden på falukorv, gul lök och laxfilé, vecka 45 | Raden "Recept med veckans erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." och "Visa erbjudanden". Korv stroganoff (falukorv, gul lök) före Ugnslax (laxfilé) | N/A |
| Lika många | Två recept med ett erbjudande vardera, ett saknar 1 vara och ett 3 | Det som saknar 1 först | N/A |
| Kortet | Korv stroganoff | Under titeln "Falukorv 29 kr" och "Gul lök 10 kr" | N/A |
| Fler än två | Ett recept med fyra erbjudna huvudvaror | Två etiketter och "+2" | N/A |
| Bara krydda | Ett recept där bara senapen är på erbjudande | Kommer inte med | N/A |
| Vag rad | "salt efter smak" och salt på erbjudande | Räknas inte | N/A |
| Inget recept | Erbjudanden finns, men inget recept använder dem | "Inget recept använder veckans erbjudanden." | N/A |
| Utan erbjudanden | Inga för veckan, med länk | "Inga erbjudanden för den här veckan." och "Hämta veckans erbjudanden" | N/A |
| Utan butik | `getSelectedStore()` ger `null` | "Välj en butik i inställningarna först." med "Öppna inställningar" | N/A |
| Sökning | "lax" i sökfältet med filtret valt | Bara Ugnslax | N/A |
| Visa erbjudanden | "Visa erbjudanden" | Arket från 9.1 | N/A |
| Fel vid läsning | `getActiveOffers` kastar | "Det gick inte att läsa erbjudandena." | `offers_unavailable` loggas |
| Andra filter | Kan lagas nu med erbjudanden inlagda | Samma ordning och status som utan erbjudanden, inga etiketter | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- huvudvaror, sorteringen och texterna
- `spec-9-2-…md` -- `OfferChip` och jämförelsen
- `src/features/recipes/ui/library.tsx`, `recipe-filter-store.ts`, `recipe-list.tsx`, receptkortet från 11.5 -- pillren och korten
- `src/features/recipes/domain/recipe-list.ts` (`filterRecipes`, `RecipeFilter`) -- filtren
- `src/app/(app)/recept/page.tsx` -- sammansättningen
- `src/features/catalog/domain/categories.ts` -- `displayCategory`
- `tests/e2e/library*.spec.ts`, `support.ts`, `global-setup.ts` -- mönster

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/offers/domain/matching.ts` (+ test) -- `isMainLine` och `offersInRecipe` -- FR-52
- [ ] `src/features/recipes/domain/recipe-list.ts` (+ test) -- filtret `offers` med sorteringen, som tar antalet per recept som argument, så att domänen inte känner till erbjudanden -- FR-52
- [ ] `src/features/recipes/ui/library.tsx` (+ test), `recipe-filter-store.ts` (+ test), receptkortet (+ test) -- pillret, raden som slot, tomlägena och etiketterna på kortet -- UX-DR19, UX-DR32
- [ ] `src/app/(app)/recept/page.tsx` -- läser butik och erbjudanden inuti `<Suspense>` och skickar etiketter och rad. Fel loggas som `offers_unavailable` -- AD-1, AD-18
- [ ] `src/features/offers/ui/offers-recipe-row.tsx` (+ test) -- raden med "Visa erbjudanden" och tomlägena -- UX-DR19
- [ ] `tests/e2e/offers-recipes.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare. Service role seedar recept, lager och erbjudanden. Testerna kontrollerar ordningen, etiketterna, "+N", tomlägena och att Kan lagas nu är oförändrat -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): pillret heter "Erbjudanden".** "Laga med veckans erbjudanden" får inte plats som piller vid 375 px. Raden överst säger hela meningen. Öppen fråga 26.
- **Beslut (förslag): huvudvaror utan Såser & smaksättare.** Salt, senap och buljong på erbjudande gör inte en rätt intressant. Skafferi räknas, eftersom pasta och ris kan vara det som gör rätten billig.
- **Beslut (förslag): erbjudanden först, sedan minst saknat.** Filtret handlar om erbjudandena, och "Kan lagas nu" finns kvar för lagret.
- Loggar innehåller bara felkoder och antal.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** receptkortet från 11.5 är `RecipeCard` i `src/features/recipes/ui/recipe-card.tsx`, med statusetiketten som `StatusBadge` med `onImage` (`src/components/badges.tsx`). `recipe-row.tsx` finns inte längre. Pillren är `src/components/filter-pills.tsx`.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px (två kolumner), i ljust och mörkt läge och med 200 % text: pillren radbryts och etiketterna på korten radbryts utan vågrät scroll.
- Med VoiceOver: pillret säger "Erbjudanden, vald", och etiketterna och "+2" läses efter titeln.
