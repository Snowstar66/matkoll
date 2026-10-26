---
title: 'Story 5.1: Kan lagas nu, rangordnat'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Receptbiblioteket visar status per recept, men bara i ordningen nyast först. När Pontus inte vet vad hen ska laga måste hen leta igenom hela listan efter det som går att laga med det som finns hemma, och varor hinner bli dåliga.

**Approach:** Biblioteket får det tredje filterpillret "Kan lagas nu" bredvid Alla och Favoriter. Filtret visar alla recept sorterade på `missingCount` (N från `recipeStatus` via `withStatus`), minst först, och vid lika N nyast först. Sorteringen görs i webbläsaren i `filterRecipes`, utan nytt anrop. Valet sparas på enheten som de andra pillren. Längst ned i filtret finns knappen "Föreslå rätter med AI", som kopplas till AI:n i 5.2.

## Boundaries & Constraints

**Always:**
- N räknas bara av `recipeStatus` (AD-7), för receptets egna portioner. Rangordningen sorterar på `missingCount` och räknar inget själv.
  - Vaga rader och rader utan katalogingrediens räknas inte i N.
  - En mängd utan enhet jämförs som `st`.
  - Beslut 2026-10-26.
- Filtret visar alla recept, även de som saknar varor. Inget recept döljs.
- Ett piller är valt åt gången. Valet sparas på enheten med `useRecipeFilter` och samma nyckel, `matkoll.recept.filter`.
- Filtret gäller också sökträffar. En sökning i "Kan lagas nu" visar träffarna i rangordning.
- Om lagret inte går att läsa (`missingCount` är `null`) visas recepten ändå, utan status och i vanlig ordning (Story 2.4).
- Status visas aldrig bara med färg.
- "Föreslå rätter med AI" finns längst ned bara i filtret "Kan lagas nu".
- Sessionen och recepten läses inuti `<Suspense>` (AD-18).
- Ingen migration behövs. Kör aldrig `supabase db reset`.

**Never:**
- Inget AI-anrop. Knappen kopplas i 5.2.
- Ingen ny serverläsning eller Server Action för filtret. Rangordningen görs på det som redan finns i klienten.
- Ingen skalning och ingen fördelning av lagret mellan recept (AD-7).
- Receptvyn, matsedeln och inköpslistan ändras inte.
- Inga rubriker eller grupper i listan. Statusetiketten på varje rad räcker.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Välj filtret | Recept med N = 2, 0, 1 och 0 (nyast först) | Ordningen blir 0, 0, 1, 2. De två med "Kan lagas nu" står överst i samma inbördes ordning som förut | N/A |
| Lika N | Två recept med "Saknar 1 vara" | Det nyaste först | N/A |
| Inget kan lagas nu | Alla recept har N ≥ 1 | Alla recept visas i rangordning, och längst ned finns "Föreslå rätter med AI" | N/A |
| Något kan lagas nu | Minst ett recept har N = 0 | Samma lista, och knappen finns ändå längst ned | N/A |
| Byt piller | Från "Kan lagas nu" till Alla | Nyast först igen, utan knappen | N/A |
| Valet sparas | "Kan lagas nu" valt, sidan laddas om | "Kan lagas nu" är fortfarande valt och listan rangordnad | `localStorage` saknas: valet lever i minnet |
| Sök i filtret | "Kan lagas nu" valt, sökningen "lök" | Träffarna i rangordning, och knappen längst ned | Sökningen misslyckas: `Notice` med "Försök igen" som förut |
| Ingen träff | Sökning utan träffar i filtret | "Inga recept matchar." och "Visa alla recept", och knappen längst ned | N/A |
| Lagret ändras | En lagervara läggs till i Hemma | Tillbaka i Recept har raderna nya etiketter och ny ordning | N/A |
| Lagret går inte att läsa | Alla rader har `missingCount: null` | Recepten visas utan status i vanlig ordning, med "Det gick inte att läsa lagret, så recepten är inte rangordnade." överst | `pantry_unavailable` loggas (finns) |
| Rader utan katalogingrediens | Ett recept där alla rader saknar katalogingrediens | N = 0, så receptet står bland "Kan lagas nu" | N/A |
| Tomt bibliotek | Inga recept | Tomläget "Inga recept än." som förut, utan piller | N/A |
| Tangentbord | Fokus i pillren, piltangent höger från Favoriter | "Kan lagas nu" blir valt | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-5-context.md` -- rangordning, modulgränser, UX
- `src/features/recipes/domain/recipe-list.ts` (+ `recipe-list.test.ts`) -- `RECIPE_FILTERS`, `RecipeFilter`, `parseRecipeFilter`, `filterRecipes`, `RecipeListItem.missingCount`, `withStatus`
- `src/features/recipes/ui/library.tsx` (+ `library.test.tsx`) -- `filterOptions`, kommentaren om "Kan lagas nu i Epic 5", tomlägen och `RecipeList`
- `src/features/recipes/ui/recipe-filter-store.ts` (+ test) -- sparat filterval, `parseRecipeFilter` vid läsning
- `src/features/recipes/ui/recipe-list.tsx`, `recipe-row.tsx`, `recipe-status-badge.tsx` -- raderna och etiketten
- `src/features/pantry/domain/recipe-status.ts` -- `recipeStatus`, `recipeStatusText`, som inte ändras
- `src/components/filter-pills.tsx`, `button.tsx`, `notice.tsx`, `empty-state.tsx` -- piller, knapp, `Notice` och tomläge
- `src/app/(app)/recept/page.tsx` -- sidan och `<Suspense>`
- `tests/e2e/library.spec.ts`, `pantry-status.spec.ts`, `support.ts`, `global-setup.ts` -- mönster för seed av recept och lager, och egen e2e-användare

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/recipes/domain/recipe-list.ts` (+ test) -- `RECIPE_FILTERS` blir `["all", "favorites", "cookable"]`, och `parseRecipeFilter` godtar `"cookable"`. `filterRecipes` sorterar för `"cookable"` stabilt på `missingCount`, minst först. Rader med `missingCount: null` står kvar i sin ordning efter de rangordnade. Tester täcker: ordningen, lika N (stabil), alla N ≥ 1, alla `null`, blandat `null` och tal, okänt sparat värde som blir Alla och att indata inte ändras -- FR-22, AD-7
- [ ] `src/features/recipes/ui/library.tsx` -- `filterOptions` får `{ value: "cookable", label: "Kan lagas nu" }`. I filtret visas, efter listan eller tomläget för sökningen, sektionen `AiSuggestions` med knappen "Föreslå rätter med AI" (sekundär, full bredd). När alla synliga rader har `missingCount: null` står en `Notice` med `role="status"` överst: "Det gick inte att läsa lagret, så recepten är inte rangordnade." Kommentaren högst upp uppdateras -- FR-8, FR-22
- [ ] `src/features/recipes/ui/ai-suggestions.tsx` (ny, `"use client"`) -- i 5.1 bara knappen "Föreslå rätter med AI", som inte gör något. 5.2 fyller komponenten -- FR-23 (förberedelse)
- [ ] `src/features/recipes/ui/recipe-list.tsx` -- listans `aria-label` blir "Recept, minst saknat först" i filtret "Kan lagas nu" och "Recept" annars
- [ ] `src/features/recipes/ui/library.test.tsx`, `recipe-filter-store.test.tsx` -- tre piller, att "Kan lagas nu" rangordnar och sparas, piltangenter, knappen bara i filtret, sökträffar i rangordning, knappen vid ingen träff och `Notice` utan status. Befintliga tester som räknar pillren uppdateras -- matrisen
- [ ] `tests/e2e/cookable.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-kan-lagas@matkoll.test`. Testet seedar tre recept med mockens fixtures och ett lager med service role (som `pantry-status.spec.ts`), så att N blir 0, 1 och 2 i en annan ordning än nyast först. Det väljer "Kan lagas nu" och ser ordningen och knappen längst ned. Efter omladdning är filtret kvar. Det lägger till en vara i Hemma, går tillbaka och ser att ordningen ändras. Det tömmer lagret och ser att listan visas i rangordning med knappen, utan något som kan lagas nu. Vid 375 px och 1280 px finns ingen vågrät scroll -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): filtret visar alla recept, inte bara de som kan lagas nu.** AC säger "sorteras recepten … med 'Kan lagas nu' överst" och "visas listan ändå i rangordning" när inget kan lagas. Pillrets namn beskriver vad som står överst. Alternativ: bara recept med N = 0, med de övriga under en egen rubrik.
- **Beslut (förslag): lika N sorteras nyast först,** alltså stabil sortering på serverns ordning (`created_at` fallande). Alternativ: favoriter först inom samma N, eller färst rader först.
- **Beslut (förslag): rangordningen görs i `filterRecipes` i `recipes/domain`,** inte i modulen `suggestions`. Biblioteket äger filtervalet och `missingCount`, och sorteringen är en rad kod på ett värde som redan finns. Modulen `suggestions` skapas i 5.2 för serverdelen av AI-förslag. Alternativ: `suggestions/domain/rank.ts`, som `recipes/domain` importerar via `suggestions/index.ts`, enligt Capability Map.
- **Beslut (förslag): "Föreslå rätter med AI" finns alltid längst ned i filtret,** inte bara när inget kan lagas nu. I Flöde 5 finns det recept, men inget lockar. Knappen visas också efter en sökning, även utan träffar, men inte när sökningen misslyckades. Den är en sekundärknapp i full bredd, eftersom biblioteket inte har någon primärknapp och DESIGN.md tillåter högst en.
- **Beslut (förslag): knappen gör inget i 5.1.** 5.1 och 5.2 byggs i samma epicgren och går till `main` i samma PR, så Pontus ser aldrig en knapp utan funktion. Alternativ: vänta med knappen till 5.2, vilket gör att 5.1:s andra kriterium inte går att verifiera i 5.1.
- **Beslut (förslag): när lagret inte går att läsa visas recepten i vanlig ordning,** med en `Notice` (`role="status"`, inte `alert`) överst: "Det gick inte att läsa lagret, så recepten är inte rangordnade." Texten visas bara i filtret "Kan lagas nu" och bara när ingen synlig rad har status. Alternativ: samma `pantry_unavailable`-text som annars ("Det gick inte att läsa lagret. Försök igen.") med "Försök igen" som laddar om sidan.
- **Beslut (förslag): rader utan status hamnar sist** om bara vissa saknar `missingCount`. Det kan i dag inte hända, eftersom ögonblicksbilden läses en gång per lista, men sorteringen ska tåla det.
- **Beslut (förslag): ingen rubrik och ingen gruppering i listan.** Varje rad har sin etikett, och skiss 1 visar en enda lista. Listans `aria-label` säger att den är rangordnad.
- Pillret får värdet `"cookable"` i `localStorage`. Ett gammalt eller okänt värde blir Alla, som i dag.
- Statusen följer lagret utan ändring här: `pantry_item` revaliderar redan `/recept`, och sökningen läser lagret på nytt.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: tre piller och knappen får plats utan vågrät scroll, och pillren bryts till en ny rad i stället för att klippas.
