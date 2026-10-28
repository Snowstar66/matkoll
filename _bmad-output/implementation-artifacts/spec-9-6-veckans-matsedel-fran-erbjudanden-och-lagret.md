---
title: 'Story 9.6: Veckans matsedel från erbjudanden och lagret'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-3-filtret-erbjudanden-i-recept.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-5-ai-forslag-med-veckans-erbjudanden.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-3-kortare-svar-for-ai-forslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-5-recept-och-matsedel-i-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.5 kan Pontus få tre rättförslag som använder veckans erbjudanden, men inte en hel vecka. Att planera veckan betyder fortfarande att välja rätt för rätt i arket Lägg till rätt, och då syns varken erbjudandena eller lagret (FR-54).

**Approach:**
- Ett nytt AI-jobb, `weekplan` (AD-28), som startas med "Föreslå veckans matsedel" i Matsedel.
- Servern rangordnar biblioteket utan AI (flest huvudvaror på erbjudande, sedan minst saknat) och skickar de högst 30 bästa recepten, lagret och erbjudandenas namn till en ny portmetod, `planWeek`.
- Modellen väljer i första hand recept ur biblioteket och föreslår högst två nya rätter, högst fem rätter totalt, med det kompakta schemat från 12.3.
- Förslaget visas som rättkort med bock, "6 av 8 hemma" och erbjudandeetiketter. "Lägg 3 rätter på matsedeln" lägger de valda recepten på matsedeln. En ny rätt sparas först via förhandsgranskningen, som andra AI-förslag.

## Boundaries & Constraints

**Always:**
- **Jobbet** följer AD-28: `POST /api/ai/jobs` med `{ kind: "weekplan", clientKey }` (Zod), förhandskontroller utan AI (tomt lager ger `suggest_empty_pantry`, tomt bibliotek och tomt lager ger samma), `enqueue_ai_job` med `context: { siteId, storeId, weekStart }` (`storeId` och `weekStart` `null` utan butik eller erbjudanden), körtid 120 s och `runAiJob` i `after()`. Ett aktivt `weekplan` åt gången: ett nytt tryck ger det som pågår, som `suggest`.
- **Indata byggs på servern** av `suggestions/actions/plan-week.ts` (`planWeekFromPantry`): lagret med `getPantrySnapshot()` utan argument (valt ställe, AD-24), veckans erbjudanden med `getSelectedStore()` och `getActiveOffers(store.id)` (högst 40 namn och 1 000 tecken, aldrig priser), recepten i biblioteket och titlarna på den aktuella matsedeln, som ska undvikas. Klienten skickar inget av det.
- **Rangordningen av biblioteket är deterministisk** och ligger i `suggestions/domain/week-candidates.ts`: antal huvudvaror på erbjudande (`offersInRecipe`, 9.3) flest först, sedan minst saknat (`recipeStatus`), sedan titel. Recept som redan står på matsedeln tas inte med. De högst 30 första skickas som "1. Korv stroganoff (falukorv, grädde, lök)" med högst fyra huvudvaror per rad, inom 2 500 tecken.
- **`planWeek(input, signal)`** i AI-porten (AD-9) med `generateText` och `Output.object`, samma tidsbudget, hälsokontroll och regel för nya försök som `suggestDishes`. Svaret är `{ fromLibrary: number[], newDishes: CompactRecipe[] }` med det kompakta receptschemat från 12.3. Varje del kontrolleras för sig: ett index utanför listan, en dubblett eller ett nytt recept som inte håller (fel schema, för få varor från lagret enligt `minPantryIngredients`, en titel att undvika) lämnas ute. Högst fem från biblioteket, högst två nya och högst fem totalt; fler kapas i svarets ordning.
- **Prompten** `prompts/plan-week.md`: listan med recept, lagret och erbjudandena är data; välj i första hand recept ur listan; använd erbjudanden när det går; föreslå nya rätter bara när listan inte räcker; variera huvudvarorna mellan rätterna.
- **Resultatet** är `WeekPlanResult = { siteId, storeName, weekLabel, dishes: ({ kind: "library", recipeId } | { kind: "new", draft: RecipeDraft })[] }` i `ai_job.result`. För nya rätter görs `fromAiRecipe` och `matchIngredients` i jobbet, som för förslag (AD-10). Status ("6 av 8 hemma") och erbjudandeetiketter räknas när resultatet visas, mot lagret och erbjudandena då.
- **Att lägga på matsedeln** sker bara med Pontus tryck: "Lägg 3 rätter på matsedeln" anropar `mealplan.addToCurrentPlan(recipeId)` för varje valt recept i ordning, med originalportioner. Ett nytt försök efter ett fel lägger bara på dem som inte kom med (klienten håller reda på vilka som lyckades).
- **En ny rätt** har AI-etiketten och "Granska och spara", som öppnar förhandsgranskningen som för ett AI-förslag. När den har sparats blir kortet ett vanligt recept med bock, och den kan läggas på matsedeln med de andra.
- **Inaktuellt förslag:** ett resultat vars `siteId` inte är valt ställe visas med "Förslaget bygger på lagret för Hemma." och "Föreslå igen". Det går ändå att lägga på matsedeln.
- Etiketterna ritas av `mealplan/ui` med `OfferChip` från `src/components`. `mealplan/ui` importerar aldrig `offers`; `/matsedel` räknar etiketterna och skickar dem som data (route → ui).
- Jobbraden säger "AI: Planerar veckan", och den korta bekräftelsen för ett klart jobb "Förslaget till veckans matsedel är klart." med "Visa". Matsedel får inget flikmärke; märket är bara för Recept och Lagersaldo (AD-28), och "Visa" går till Matsedel.
- E2E-specen har den egna e2e-användaren `e2e-veckomeny@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inget läggs på matsedeln och inget recept sparas utan Pontus tryck (AD-2).
- Inga dagar och ingen ordning per veckodag. Matsedeln har inga dagar (AD-22).
- Inga priser till modellen och ingen beräkning av vad veckan kostar.
- Ingen ändring av `suggestDishes`, AI-förslagen, rangordningen i Recept eller lagningsstatusen.
- Inga recepttexter eller lager i `ai_job.context` eller i loggar (NFR-13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Starta | Matsedel, lager och 20 recept, erbjudanden för vecka 45 | "Planerar veckan … Du kan göra annat under tiden." och "Avbryt". Jobbraden "AI: Planerar veckan" | N/A |
| Klart | Mockens svar: tre ur biblioteket och två nya | "Förslag till veckans matsedel" med fem rättkort. Tre har bock förvald och "6 av 8 hemma", två har AI-etiketten och "Granska och spara". Knappen "Lägg 3 rätter på matsedeln" | N/A |
| Erbjudanden | Korv stroganoff använder falukorv på erbjudande | Kortet har etiketten "Falukorv 29 kr" | N/A |
| Utan erbjudanden | Ingen butik eller inga erbjudanden | Samma flöde. Inga etiketter, och prompten saknar avsnittet om erbjudanden | N/A |
| Avmarkera | Pontus tar bort bocken på ett kort | Knappen blir "Lägg 2 rätter på matsedeln" | N/A |
| Lägga på | "Lägg 3 rätter på matsedeln" | Tre `meal_plan_recipe` på den aktuella matsedeln (en skapas om ingen finns, AD-22). "Lade 3 rätter på matsedeln." Korten säger "På matsedeln" | N/A |
| Spara en ny rätt | "Granska och spara" och sedan "Spara recept" | Receptet finns i biblioteket. Kortet får bock och räknas med i knappen | N/A |
| Redan på matsedeln | Korv stroganoff står på den aktuella matsedeln | Skickas inte till modellen och föreslås inte | N/A |
| Modellen svarar fel | Index 31, samma index två gånger, en ny rätt med en vara från lagret | De lämnas ute. Resten visas | N/A |
| Inget håller | Alla delar ogiltiga | Nytt försök enligt AD-9, sedan "Det gick inte att tolka svaret. Försök igen." | `ai_invalid` |
| Tomt lager | Lagret på valt ställe är tomt | Felet direkt, inget jobb | `suggest_empty_pantry` |
| Två tryck | "Föreslå veckans matsedel" igen medan jobbet pågår | Samma jobb visas | N/A |
| Annat ställe | Pontus byter till Stugan medan jobbet pågår | "Förslaget bygger på lagret för Hemma." och "Föreslå igen" | N/A |
| AI-tjänsten svarar inte | Mockens reserverade indata | "AI-tjänsten svarar inte just nu. …" med "Försök igen" | `ai_unavailable` |
| Avbryt | "Avbryt" i Matsedel eller arket AI-jobb | Jobbet avbryts, och knappen visas igen | N/A |
| Stänga förslaget | "Stäng förslaget" | Jobbet tas bort (`dismissAiJob`), och förslaget visas inte igen | N/A |
| Fel vid påläggning | Den andra av tre misslyckas | Den första står på matsedeln. Meddelanderutan "Det gick inte att lägga rätten på matsedeln. Försök igen." och knappen "Lägg 2 rätter på matsedeln" | `mealplan_save_failed` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- bindande beslut, jobbets sort och `context`, texter och e2e-användare
- `spec-12-3-…md`, `spec-12-4-…md`, `spec-9-5-…md` -- det kompakta schemat, jobben och erbjudandena i förslagen
- `src/server/ai/service.ts`, `schemas.ts`, `prompts/`, `adapters/mock.ts`, `adapters/lmstudio.ts` -- porten
- `src/features/suggestions/actions/suggest-from-pantry.ts`, `domain/pantry-input.ts` -- mönster för indata från lagret
- `src/features/offers/domain/matching.ts` (`offersInRecipe`, `isMainLine`), `chip.ts` (`offerChip`), `server.ts` (`getActiveOffers`) -- erbjudandena
- `src/features/recipes/server.ts` (biblioteket med receptrader), `domain/from-ai-recipe.ts`, `ui/ai-suggestion-sheet.tsx` -- recept och förhandsgranskning
- `src/features/mealplan/server.ts` (`addToCurrentPlan`, `getMealPlanView`), `ui/` (rättkort), `src/app/(app)/matsedel/page.tsx` -- matsedeln
- `src/features/ai-jobs/` (`runAiJob`, `useAiJobs`), `src/app/api/ai/jobs/route.ts` -- jobben
- `src/components/offer-chip.tsx`, `dish-card.tsx`, `meter.tsx` -- byggstenar

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_ai_job_weekplan.sql` (via `supabase migration new`) -- `ai_job.kind` tillåter `weekplan` (och `offers`, om 9.7 inte redan har gjort det), och `enqueue_ai_job` ger ett aktivt `weekplan` tillbaka som för `suggest`. Typerna genereras om -- AD-28
- [ ] `src/features/suggestions/domain/week-candidates.ts` (+ test) -- `rankWeekCandidates(recipes, snapshot, offers, planTitles)` och `weekCandidateLines(candidates)` med gränserna 30 recept, fyra huvudvaror per rad och 2 500 tecken -- FR-54
- [ ] `src/lib/suggest-input.ts` (+ test) -- `maxWeekCandidates: 30`, `maxWeekCandidateChars: 2_500`, `maxWeekLibraryDishes: 5`, `maxWeekNewDishes: 2`, `maxWeekDishes: 5`
- [ ] `src/server/ai/schemas.ts` (+ test) -- `planWeekAnswer` och `parseWeekPlan(answer, candidateCount)`, som kontrollerar varje del för sig och räknar ogiltiga -- AD-9, AD-10
- [ ] `src/server/ai/prompts/plan-week.md`, `prompts.ts` -- prompten enligt ovan
- [ ] `src/server/ai/service.ts` (+ test), `index.ts` -- `planWeek(input, signal, options?)`, `isValidPlanWeekInput`, `planWeekContent` (lager, erbjudanden bara när de finns, recepten och titlarna att undvika) och `inputLimits.weekplan` (`maxOutputTokens` som de kompakta förslagen) -- AD-9
- [ ] `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/veckomeny.response.json`, `veckomeny-ogiltig.response.json`, `manifest.json` -- påhittade svar och de reserverade indata
- [ ] `tests/eval/plan-week.eval.ts` -- mäter tid, antal ur biblioteket, antal nya, ogiltiga delar och hur många rätter som använder ett erbjudande. Körs för hand mot LM Studio
- [ ] `src/features/suggestions/actions/plan-week.ts` (+ test), `server.ts` -- `planWeekFromPantry({ signal, deadline })`: läser lagret, butiken, erbjudandena (fel ger `offers_unavailable` i loggen och ett förslag utan erbjudanden), biblioteket och matsedeln, anropar `planWeek` och bygger `WeekPlanResult` -- FR-54, AD-24
- [ ] `src/app/api/ai/jobs/route.ts` (+ test) -- sorten `weekplan` med förhandskontrollen och `context: { siteId, storeId, weekStart }` -- AD-28
- [ ] `src/features/mealplan/ui/week-plan.tsx` (+ test), `src/app/(app)/matsedel/page.tsx` -- knappen "Föreslå veckans matsedel", läget i flödet, resultatet med rättkort, bockar, etiketter, "Lägg N rätter på matsedeln", "Granska och spara", "Stäng förslaget" och raden för inaktuellt förslag. Sidan räknar status och etiketter och skickar dem som data -- FR-54, UX-DR33
- [ ] `src/features/ai-jobs/domain/` (+ test) -- texterna för jobbraden ("Planerar veckan") och bekräftelsen ("Förslaget till veckans matsedel är klart.")
- [ ] `tests/e2e/week-plan.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-veckomeny@matkoll.test`. Service role seedar lagret, sex recept, erbjudanden för falukorv och en tom matsedel. Testerna kontrollerar förloppet, de fem korten, etiketten, att avmarkera ett kort, "Lägg 2 rätter på matsedeln" och raderna på matsedeln, och "Granska och spara" -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn, och tiderna i T5

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): biblioteket först, högst två nya rätter.** En ny rätt måste granskas och sparas innan den kan läggas på matsedeln, så fem nya rätter vore fem förhandsgranskningar. Ett index ur en lista är också mycket kortare att svara med än ett recept, vilket håller tiden nere.
- **Beslut (förslag): servern väljer de 30 kandidaterna utan AI.** Hela biblioteket ryms inte i kontexten på 8 192 token, och rangordningen med erbjudanden och lagret finns redan (9.3, AD-7).
- **Beslut (förslag): fem rätter och inga dagar.** Matsedeln har inga dagar. Antalet är en konstant (öppen fråga 28).
- **Beslut (förslag): inget flikmärke på Matsedel.** AD-28 begränsar märket till Recept och Lagersaldo. Den korta bekräftelsen och jobbraden räcker, och "Visa" går till Matsedel.
- **Risk: tiden.** Två kompakta recept, fem index, lagret och 30 rader recept ligger nära AI-förslagens storlek efter 12.3. Utvärderingen mäter det. Över 100 s med varm modell sänks antalet nya rätter till en.
- **Risk: modellen väljer samma huvudvara fem gånger.** Prompten ber om variation, och utvärderingen räknar det. Annars kan servern begränsa till två rätter per huvudvara.
- Loggar innehåller bara felkoder, sort, antal och jobbets id.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** det finns ingen `src/components/dish-card.tsx`. Rättkortet från 11.5 ligger i `src/features/mealplan/ui/meal-plan-list.tsx` (raden från `dishProgress` och `dishMetaText` i `mealplan/domain/meal-plan.ts`), och mätaren är `Meter` i `src/components/meter.tsx`. Förslagets kort byggs som rättkortet där, eller som `RecipeCard` (`recipes/ui/recipe-card.tsx`) som AI-förslagen i 11.5.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: korten, bockarna, etiketterna och knapparna radbryts utan vågrät scroll.
- Med VoiceOver: bocken läses som "Korv stroganoff, vald", etiketten som "På erbjudande: Falukorv 29 kr", och den korta bekräftelsen läses upp.
- `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/plan-week.eval.ts` mot Qwen i LM Studio: tid och antal skrivs i T5.
