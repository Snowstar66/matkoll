---
title: 'Story 12.2: Väck modellen i förväg'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-1-mat-ai-tiderna-och-stall-in-lm-studio.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-ai-tjansten-med-testleverantor-och-lokal-modell.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Det första fotot efter en stund tog 65 s, ett varmt 20 s (T6). Pontus öppnar Lagersaldo eller Recept några sekunder innan AI behövs, och den tiden kan användas till att väcka modellen (FR-45).

**Approach:**
- AI-porten får `warmUp(kind, signal)`: ett minimalt anrop med flödets egen systemprompt och `maxOutputTokens: 1`, bara för LM Studio.
- `POST /api/ai/warm` svarar direkt och väcker i bakgrunden med `after()`.
- Lagersaldo ber om `image` och Recept om `text` när sidan visas, högst en gång per sort och fem minuter.
- Mätt före och efter med 12.1:s utvärdering. Ger det inte minst 20 % snabbare första anrop, tas väckningen bort.

## Boundaries & Constraints

**Always:**
- `warmUp(kind: 'image' | 'text', signal)` i `AiService`. I `lmstudio`: hälsokontrollen (5 s), sedan `generateText` utan `output`, med `system` = `prompts.analyzeImage` och ett meddelande med texten "Bilden visar kylen." och en grå PNG på 64 × 64 px som `file`-del (`image`), eller `system` = `prompts.suggestDishes` och "Lagret:\nsalt: finns" (`text`). `maxOutputTokens: 1`, `maxRetries: 0`, samma `providerOptions` som riktiga anrop (tänkläget av) och för `image` samma sampling. Högst 30 s totalt. Svaret används aldrig.
- `mock`, `anthropic` och `openai` gör inget och svarar direkt.
- `POST /api/ai/warm`: `isCrossSite`, `requireUserForRoute()`, JSON med `{ kind }` (Zod), högst 256 byte. Svarar alltid 202 utan innehåll när indata är giltig, också när inget görs. `maxDuration = 60`.
- Servern hoppar över väckningen när användaren har ett AI-anrop på väg (före 12.4: körningen i `ai-runs.ts` eller kartan i `suggestFromPantry`; från 12.4: ett aktivt jobb), eller när samma användare väckte samma sort för mindre än fem minuter sedan (en karta i processen).
- Klienten (`src/lib/ai-client.ts`, `warmAi(kind)`) skickar högst en gång per sort och fem minuter, med tiden i `sessionStorage` inom `try`, och struntar i svaret och i fel. Lagersaldo anropar `warmAi('image')` och Recept `warmAi('text')` i en effekt när sidan visas (också efter Activity).
- Väckningen syns aldrig för Pontus och loggas bara som `ai_warm` med sort och utfall (`ok`, `skipped`, `unavailable`).
- Mätningen: med 12.1:s utvärdering, kall modell (15 min), första anropet med och utan väckning fem sekunder före, tre gånger per flöde (bild och förslag). Resultatet i beslutsloggen och `docs/lm-studio.md`.

**Never:**
- Ingen väckning från andra sidor, vid varje sidbyte eller med en timer.
- Inget riktigt foto, inget lager och ingen data från Pontus i väckningen.
- Ingen ny miljövariabel. Ingen ändring av `runStructured`.
- Ingen väckning mot en molnleverantör (det kostar pengar och behövs inte).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lagersaldo öppnas | Ingen väckning de senaste 5 min | `POST /api/ai/warm { kind: "image" }`, 202, anrop till LM Studio i bakgrunden | N/A |
| Lagersaldo igen efter 1 min | Väckt nyss | Inget anrop från klienten | N/A |
| Recept öppnas | – | `kind: "text"` | N/A |
| Analys pågår | Pontus öppnar Recept | 202, ingen väckning (`skipped`) | N/A |
| LM Studio av | Hälsokontrollen svarar inte | 202, `unavailable` loggas | Inget visas |
| `AI_PROVIDER=mock` | – | 202, inget anrop | N/A |
| Fel `kind` | `"video"` | 400 `validation` | N/A |
| Annan sajt | `Origin` från en annan sajt | 403 | N/A |
| Inte inloggad | – | 401 | N/A |
| Mätning | Kall modell, väckning 5 s före | Första riktiga anropet minst 20 % snabbare | Annars tas väckningen bort |

</frozen-after-approval>

## Code Map

- `src/server/ai/service.ts` (`AiService`, `withInputValidation`, `createModelAiService`) -- `warmUp`
- `src/server/ai/run.ts` (`ModelTarget`, `healthCheck`, `mergeProviderOptions`) -- samma inställningar som riktiga anrop
- `src/server/ai/adapters/lmstudio.ts`, `mock.ts` -- per adapter
- `src/server/ai/prompts.ts` -- systemprompterna
- `src/app/api/ai/route-support.ts` -- `isCrossSite`, `readCapped`, `respond`
- `src/features/pantry/actions/ai-runs.ts`, `src/features/suggestions/actions/suggest-from-pantry.ts` -- om något pågår (före 12.4)
- `src/lib/ai-client.ts` -- `warmAi`
- `src/app/(app)/hemma/`, `src/app/(app)/recept/` och deras klientkomponenter -- var effekten ligger
- `tests/eval/` och `docs/lm-studio.md` -- mätningen

## Tasks & Acceptance

**Execution:**
- [ ] `src/server/ai/service.ts`, `adapters/*` (+ tester) -- `warmUp` per adapter, med en falsk `fetch` som visar systemprompten, `max_tokens: 1` och att inget nytt försök görs
- [ ] `src/server/ai/warm-image.ts` -- den grå bilden som konstant (byggd i koden, ingen fil)
- [ ] `src/app/api/ai/warm/route.ts` (+ `route.test.ts`) -- kontrollerna, `after()`, gränsen per användare och sort, `skipped` när något pågår
- [ ] `src/lib/ai-client.ts` (+ test) -- `warmAi(kind)` med gränsen i `sessionStorage`
- [ ] Lagersaldo och Recept -- anropen i en effekt
- [ ] `tests/e2e/ai-warm.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-ai-varm@matkoll.test`, `AI_PROVIDER=mock`: öppna Lagersaldo och se ett anrop till `/api/ai/warm` med `image`, öppna igen och se inget nytt
- [ ] Mätningen mot LM Studio enligt Boundaries
- [ ] `docs/lm-studio.md`, `docs/oppna-fragor.md` (T10), `docs/beslutslogg.md` -- siffrorna och beslutet

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given mätningen med kall modell, when väckningen har gjorts fem sekunder före, then är det första anropet minst 20 % snabbare i median, eller så är väckningen borttagen och beslutet loggat.

## Implementation Notes

- **Beslut (förslag): flödets egen systemprompt.** LM Studio kan återanvända början av en prompt (prefix-cache). Samma systemprompt ger störst chans att det riktiga anropet får nytta av det. Med PARALLEL 4 kan cachen höra till en annan plats; mät med den inställning som 12.1 rekommenderar.
- **Beslut (förslag): `after()` och 202.** Sidan ska aldrig vänta på väckningen. Läs `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` före koden.
- **Risk: väckningen krockar med ett riktigt anrop.** Det riktiga anropet kan behöva vänta på väckningen (en token, några sekunder med en bild). Därför hoppar servern över när något pågår, och väckningen har en egen gräns på 30 s.
- **Risk: väckningen hjälper inte** (T10: om det långsamma är minnet och inte cachen). Då tas den bort; det är ett giltigt utfall av storyn.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** Lagersaldo (`/hemma`) har nu också `photo-sweep-gate.tsx` (10.3), som gallrar gamla foton när sidan öppnas, och raden med senaste fotot (`latest-photo.tsx`, 10.2). Väckningen läggs bredvid dem i `home-content.tsx` eller sidan, och får inte vänta på eller störa gallringen. Öppna frågor och osäkerheter för Epic 12 har nya nummer: 21–25 och T9–T11.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai` med och utan väckning -- expected: siffrorna i `docs/lm-studio.md`

**Manual checks (if no CLI):**
- Öppna Lagersaldo efter 15 minuter utan AI och fotografera kylen efter fem sekunder. Jämför tiden med 12.1.
