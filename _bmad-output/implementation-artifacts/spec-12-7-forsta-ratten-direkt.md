---
title: 'Story 12.7: Första rätten direkt'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'ce988c8'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-3-kortare-svar-for-ai-forslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Också med kortare svar (12.3) kommer tre rätter på en gång, efter hela tiden. Den första rätten är klar långt innan den sista, men Pontus ser den inte förrän alla är klara.

**Approach:**
- Först ett prov mot LM Studio: strömmar ett svar med JSON-schema genom `@ai-sdk/openai-compatible`, så att `elementStream` ger den första rätten innan svaret är klart? Svaret avgör om storyn bygger något (T9).
- Går det: `suggestDishesStream` med `streamText`, `Output.array` och `elementStream`. Varje färdig rätt kontrolleras, matchas mot katalogen och läggs till i jobbets resultat. Klienten visar den vid nästa pollning.
- Går det inte: storyn avslutas med mätningen och beslutet, utan strömning.

## Boundaries & Constraints

**Always:**
- **Provet först:** ett skript i `tests/eval/` (inte i appen) som anropar LM Studio med `streamText`, `Output.array({ element: compactDish, minItems: 1, maxItems: 3 })` och tidsstämplar för varje element från `elementStream` och för slutet. Tre körningar med varm modell. Kommer det första elementet efter mer än 80 % av tiden, eller blir svaret ogiltigt oftare än med `generateText`, byggs inget mer. Utfallet står i T9 och beslutsloggen.
- **I porten (om provet går igenom):** `suggestDishesStream(input, signal, { deadline, onDish })` i `AiService`, med samma hälsokontroll, `providerOptions`, `maxRetries: 0` och tidsbudget som `runStructured`. Varje element kontrolleras mot titlarna att undvika och mot titlar som redan har kommit, görs om med `fromCompactDish` och lämnas till `onDish`. En rätt som inte håller hoppas över och loggas (`ai_invalid` med index). När strömmen är slut utan giltig rätt görs ett nytt försök som i `runStructured` (med feedback), annars är körningen klar med de rätter som kom. Mocken strömmar sina rätter med `AI_MOCK_DELAY_MS` mellan dem.
- **`suggestFromPantry`:** matchar varje rätt mot katalogen när den kommer, gör samma kontroller som i dag (`recipeDraftSchema`, minst två varor från lagret) och skriver resultatet med `report` (`set_ai_job_result`) med alla rätter hittills. Jobbet är klart när strömmen är slut.
- **Klienten:** pollar varannan sekund som förut och visar nya rätter under de förra, med "Letar efter fler …" och "Avbryt" sist tills jobbet är klart. En ny rätt annonseras: "Ny rätt: Pasta med svamp.". Ett förslag kan sparas innan de andra har kommit. Bekräftelsen "3 rättförslag är klara." (eller "2 rättförslag …") kommer när jobbet är klart, inte för varje rätt.
- **AD-9:** `streamText` används bara här. `parseRecipe`, `analyzeImage` och `locateItems` behåller `generateText` med `Output.object`.
- **Mätning:** tid till första rätten och till alla, tre körningar med varm modell, före och efter. Målet: den första rätten syns efter högst 40 % av tiden för alla tre.
- E2E-specen har den egna e2e-användaren `e2e-ai-strom@matkoll.test`.

**Never:**
- Ingen ny transport (SSE, WebSocket) till klienten: pollningen från 12.4 räcker.
- Ingen strömning av bildanalysen eller importen.
- Ingen rätt visas innan den har klarat schemat, titlarna och kontrollen mot lagret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Provet strömmar | Första elementet efter 35 % av tiden | Storyn byggs | N/A |
| Provet strömmar inte | Alla element på slutet | Storyn avslutas med mätningen och beslutet | N/A |
| Första rätten | Klar efter 12 s | Visas vid nästa pollning med "Letar efter fler …" | N/A |
| Titel att undvika | Rätt 2 har en titel under "Föreslå inte:" | Hoppas över; rätt 1 och 3 visas | Loggas som `ai_invalid` |
| Dubbel titel | Rätt 3 har samma titel som rätt 1 | Hoppas över | Loggas |
| Ingen giltig rätt | Alla tre ogiltiga | Nytt försök med feedback | Sedan `ai_invalid` som förut |
| Avbryt | Efter den första rätten | Jobbet `cancelled`; den visade rätten försvinner | N/A |
| Spara tidigt | Pontus sparar rätt 1 medan 2 och 3 kommer | Rätt 1 sparas; de andra kommer som vanligt | N/A |
| Tiden tar slut | Efter två rätter | Klart med två rätter | N/A |
| LM Studio av | – | `ai_unavailable` som förut | N/A |

</frozen-after-approval>

## Code Map

- `node_modules/ai/docs/07-reference/01-ai-sdk-core/28-output.mdx` (`Output.array`, `elementStream`) och `02-stream-text.mdx` -- läs före koden
- `src/server/ai/run.ts` -- hälsokontrollen, tidsbudgeten och feedbacken som strömningen ska följa
- `src/server/ai/service.ts`, `schemas.ts` (`compactDish`, 12.3), `compact-dish.ts` -- porten
- `src/server/ai/adapters/mock.ts` -- strömmande mock
- `src/features/suggestions/actions/suggest-from-pantry.ts` -- en rätt i taget
- `src/features/recipes/ui/use-dish-suggestions.ts`, `ai-suggestions.tsx` -- klienten
- `tests/eval/suggest-dishes.eval.ts`, `timing.ts` -- mätningen

## Tasks & Acceptance

**Execution:**
- [x] `tests/eval/stream-probe.eval.ts` -- provet mot LM Studio; utfallet i `docs/oppna-fragor.md` (T9) och `docs/beslutslogg.md`. Avbryt här om provet inte går igenom
- [x] `src/server/ai/service.ts`, `run.ts` (+ tester) -- `suggestDishesStream` med en falsk modell som strömmar element (giltiga, ogiltiga, dubbla, avbrott)
- [x] `src/server/ai/adapters/mock.ts` (+ test) -- strömmande rätter med fördröjning
- [x] `src/features/suggestions/actions/suggest-from-pantry.ts` (+ test) -- en rätt i taget med `report`
- [x] `src/features/recipes/ui/use-dish-suggestions.ts`, `ai-suggestions.tsx` (+ tester) -- rätter som kommer, "Letar efter fler …", annonsering, spara tidigt
- [x] `tests/e2e/ai-stream.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-ai-strom@matkoll.test`, `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS=3000`: den första rätten syns innan den tredje, och en rätt kan sparas tidigt
- [ ] Mätning mot LM Studio före och efter (flyttad till Epic 12-mätningen, se Vid bygget)
- [x] `docs/lm-studio.md`, `docs/oppna-fragor.md` (T5, T9), `docs/beslutslogg.md`

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given mätningen med varm modell, when den körs tre gånger, then syns den första rätten efter högst 40 % av tiden för alla tre, eller så är storyn avslutad efter provet med beslutet loggat.

## Implementation Notes

- **Beslut (förslag): strömning till jobbet, pollning till klienten.** Jobbet och pollningen finns redan (12.4). En ny rätt syns inom två sekunder, utan ny transport.
- **Beslut (förslag): minst en giltig rätt räcker.** Ett nytt försök när bara en av tre höll skulle dra ut på tiden. "Föreslå andra rätter" ger fler.
- **Risk: LM Studio och strukturerad strömning** (T9). `supportsStructuredOutputs: true` skickar `response_format` med JSON-schema. Det är inte prövat om LM Studio strömmar ett sådant svar token för token, eller om `@ai-sdk/openai-compatible` ger delarna till `elementStream`. Därför provet först.
- **Risk: `elementStream` och `maxItems`.** Ger modellen fler än tre rätter felar strömmen före den fjärde, och generering avbryts inte av sig själv. Avbryt med signalen när den tredje har kommit.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** AI-förslagen i `ai-suggestions.tsx` är sedan 11.5 receptkort (`RecipeCard` i `recipes/ui/recipe-card.tsx`) med en kort mintremsa och AI-etiketten, utan hjärta och länk. En rätt som kommer in läggs till som ett sådant kort. Osäkerheten om strömningen heter nu T9.

## Vid bygget

- **Provet kördes inte** (LM Studio får inte anropas i det här bygget): `tests/eval/stream-probe.eval.ts` är skrivet och skriver ut en dom (BUILD eller STOP) efter tre körningar med varm modell, men T9 är fortfarande öppen. Strömningen är byggd och gäller bara för modeller som strömmar; går provet inte igenom i Epic 12-mätningen ska storyn dras tillbaka (`suggestDishesStream` kan då anropa `suggestDishes` och ge alla rätter på en gång). Mätningen före och efter ligger i Epic 12-mätningen, mot målet 40 %.
- `runElementStream` (`run.ts`) och `suggestDishesStream` (`service.ts`): `streamText` med `Output.array({ minItems: 1, maxItems: 3 })`, samma hälsokontroll, `providerOptions`, `maxRetries: 0` och tidsbudget som `runStructured`. Strömmen stoppas när den tredje rätten har kommit. Minst en behållen rätt räcker (ingen ny försök); ingen behållen rätt ger nytt försök med feedback. Tiden tar slut efter första rätten ger klart med den. `onError` är satt så att SDK:t inte loggar svaret.
- AI SDK ger ett element först när nästa har börjat (det sista av ett reparerat delsvar tas bort), så den första rätten kommer några token efter sin sista klammer, inte exakt vid den. Element som inte följer `compactDish` hoppas över av SDK:t utan att nå koden; titel att undvika eller dubbel titel loggas som `ai_invalid` (`reason: "title"`, index).
- Systemprompten för strömmen (`prompts.suggestDishesStream`) nämner `{ "elements": [ … ] }`, eftersom `Output.array` lindar svaret så.
- `suggestFromPantry` tar emot `report`, matchar varje rätt mot katalogen när den kommer (ett `matchIngredients`-anrop och ett `getIngredientNames`-anrop per rätt) och rapporterar alla rätter hittills. Ett katalogfel för en rätt hoppar över den; är det den enda ger det `catalog_unavailable`.
- Listan ger `count` också för ett körande AI-förslagsjobb. Klienten hämtar jobbets delresultat (GET `/api/ai/jobs/[id]` gav redan delresultat sedan 12.5) när `count` växer och visar nya rätter efter de förra, med "Letar efter fler …" och "Ny rätt: …." i statusregionen. Fokus flyttas till rubriken först när jobbet är klart (som förut).
- Mocken ger sina rätter en i taget med `AI_MOCK_DELAY_MS` jämnt fördelad över dem (3 s ger 1 s mellan rätterna), så helheten tar lika lång tid som förut.
- Avvikelse: en rätt som sparas tidigt öppnar receptet, och då försvinner bibliotekets tillstånd; när Pontus kommer tillbaka visas jobbets hela resultat, också den sparade rätten. Ligger kvar tills vidare, som för titlar att undvika.
- `pnpm test:integration` kördes inte: inga tabeller, funktioner eller Server Actions ändrades. Ingen migration.

## Utfall

- **Strömningen dragen tillbaka efter provet (2026-10-29).** `stream-probe.eval.ts` gav domen "STOP: ingen strömning" (`docs/lm-studio.md`, "Slutmätning Epic 12"). Första rätten kom efter 69, 42 och 43 % av tiden, men det strömmade svaret var ogiltigt i två av tre körningar. `generateText` var giltigt i alla tre (25,6, 29,6 och 25,6 s). T9 är stängd.
- Bygget är återtaget i `epic12-wrapup` (revert av `79cd282`): AI-förslagen går tillbaka till jobbvägen med `generateText` från 12.4 och visas alla på en gång. Provet `tests/eval/stream-probe.eval.ts` ligger kvar och kan köras om om modellen eller AI SDK byts.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai tests/eval/suggest-dishes.eval.ts` -- expected: tid till första rätten i rapporten

**Manual checks (if no CLI):**
- Mot LM Studio: be om förslag och se den första rätten komma medan "Letar efter fler …" står kvar. VoiceOver läser "Ny rätt: …" en gång per rätt.
