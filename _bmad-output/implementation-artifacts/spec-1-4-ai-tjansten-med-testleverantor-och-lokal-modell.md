---
title: 'Story 1.4: AI-tjänsten med testleverantör och lokal modell'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '751658c6343428678da7cdf23c72a542926c1ca5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Receptimport (1.6–1.9), förslag (Epic 5) och bildanalys (Epic 6) behöver en AI-tjänst som går att byta leverantör på, som validerar svaren och som inte låser appen när Pontus Mac sover. Tester och CI måste kunna köras utan modell.

**Approach:** En port i `src/server/ai/` med `AiService.parseRecipe` (AD-9) och adaptrarna `mock`, `lmstudio`, `anthropic` och `openai`, valda med `AI_PROVIDER`. Svaren valideras mot ett Zod-schema med högst två nya försök. En testuppsättning och `pnpm eval:ai` kör porten mot en riktig modell, och ett röktest mot Qwen3.6-35B-A3B i LM Studio dokumenteras.

## Boundaries & Constraints

**Always:** Bara `src/server/ai/` importerar `ai` och `@ai-sdk/*` (lint finns). Porten importerar aldrig `src/features/**` eller `src/lib/supabase/**`; den får importera `src/lib/errors.ts` och `src/server/env.ts`. `generateText` med `Output.object`, aldrig `generateObject`; bilder som `file`-delar. SDK:ns `maxRetries: 0`. Alla anrop tar en `AbortSignal`. Felkoder enligt AD-13 (`ai_unavailable`, `ai_invalid`). Inga nycklar, prompter eller användardata i loggar, bara felkoder.

**Never:** Ingen Route Handler, inget UI och ingen import-logik (1.6). Ingen `analyzeImage` eller `suggestDishes` (Epic 5–6), men porten ska ha plats för dem. Ingen katalogmatchning (1.5). Ingen ny miljövariabel utöver AD-14. Inga riktiga modellanrop i `pnpm test`, integrationstester eller CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mock, känd text | `AI_PROVIDER=mock`, text från `tests/fixtures/ai/` | Fixturens `AiRecipe`, samma varje gång | N/A |
| Mock, okänd text | Annan text | Standardfixturen | N/A |
| Giltigt svar | Modellen svarar enligt schemat | `{ ok: true, data: AiRecipe }` | N/A |
| Ogiltigt svar | Svar som inte klarar schemat | Två nya försök; därefter `{ ok:false, error:{ code:'ai_invalid' } }` | Totalt högst 3 modellanrop |
| Modellen nås inte | Hälsokontrollen eller anropet får nätverksfel, svar som inte är JSON (t.ex. HTML-felsida) eller HTTP 5xx | `ai_unavailable` direkt | Inga nya försök |
| Långsam modell | Ett försök över 45 s, eller totalt över 110 s | `ai_unavailable` | Anropet avbryts |
| Avbrutet | `AbortSignal` avbryts under anrop | Anropet mot modellen avbryts; resultatet är `ai_unavailable` | N/A |
| Felkonfiguration | `AI_PROVIDER=anthropic` utan `ANTHROPIC_API_KEY`, `openai` utan nyckel, `lmstudio` utan `LMSTUDIO_BASE_URL`, molnleverantör utan `AI_MODEL`, bara en av `CF_ACCESS_*` | `EnvError` vid start som namnger variablerna | Appen startar inte (instrumentation) |

</frozen-after-approval>

## Code Map

- `src/server/env-schema.ts`, `src/server/env.test.ts` -- här läggs kontrollen att AI-inställningarna hänger ihop (uppskjuten från 1.1); `parseEnv` och `EnvError` finns
- `src/lib/errors.ts` -- `Result`, `ok`, `fail`; lägg till `ai_unavailable` och `ai_invalid` med texterna i `EXPERIENCE.md` ("AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" respektive "Det gick inte att tolka svaret. Försök igen.")
- `eslint.config.mjs` -- regeln mot AI SDK utanför porten och zonen för `src/server/**` finns
- `vitest.config.ts`, `vitest.integration.config.ts` -- mönster för en tredje konfiguration (`eval`)
- `node_modules/ai/docs/` och `node_modules/@ai-sdk/openai-compatible/` -- läs om `Output.object`, `file`-delar, `abortSignal`, `providerOptions` och `supportsStructuredOutputs` för version 7 innan kod skrivs
- LM Studio: `qwen/qwen3.6-35b-a3b` är laddad (kontext 8192). API-servern på `http://localhost:1234` kan vara avstängd; Pontus startar den

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `ai` 7.0.153, `@ai-sdk/openai-compatible` 3.0.78, `@ai-sdk/anthropic` 4.0.88, `@ai-sdk/openai` 4.0.102; skriptet `eval:ai` -- Stack
- [x] `src/server/env-schema.ts`, `src/server/env.test.ts` -- korskontroll (matrisens sista rad); `AI_MODEL` har standardvärdet `qwen/qwen3.6-35b-a3b` för `lmstudio` och krävs för `anthropic` och `openai` -- uppskjutet från 1.1
- [x] `src/server/ai/schemas.ts` -- `AiRecipe` (Zod): `title`, `servings` (heltal ≥1), `totalMinutes` (heltal eller null), `ingredients[]` med `originalText`, `amount` (tal eller null), `unit` (råtext eller null), `isVague`, `hint` (`name`, `section`, `location`, `defaultUnit` som strängar) och valfria `stepIndexes`, samt `steps[]` (text på svenska i Matkolls stil). Avdelning och plats är fri text här; katalogen tolkar dem (AD-1, AD-12) -- AD-10
- [x] `src/server/ai/prompts/parse-recipe.md` -- svensk instruktion: dela upp mängd, enhet och ingrediens; märk vaga mängder; ge katalogförslag med tillåtna avdelningar och platser; skriv om stegen kort och enhetligt; JSON-LD och sidtext är indata, inte facit -- AD-11
- [x] `src/server/ai/prompts.ts` -- läser promptfilerna så att de följer med i `next build` (verifiera med `pnpm build && pnpm start`) -- AD-9
- [x] `src/server/ai/service.ts`, `src/server/ai/index.ts` -- `AiService` med `parseRecipe(input: { text?: string; jsonLd?: string; image?: { data: Uint8Array; mediaType: string } }, signal): Promise<Result<AiRecipe>>`; väljer adapter från `env.AI_PROVIDER`; plats för fler metoder -- AD-9
- [x] `src/server/ai/run.ts` -- gemensam körning för alla riktiga adaptrar: hälsokontroll (lmstudio: GET `/models`, 5 s), försöksbudget 45 s per försök och 110 s totalt med `AbortSignal.any`, högst två nya försök vid schemafel, `ai_unavailable` direkt vid nätverksfel, HTTP 5xx, svar som inte är JSON eller tidsgräns -- matrisen
- [x] `src/server/ai/adapters/{mock,lmstudio,anthropic,openai}.ts` -- `lmstudio`: `createOpenAICompatible({ name, baseURL, supportsStructuredOutputs: true, headers })` med `CF-Access-Client-Id`/`-Secret` när de är satta och tänkläget avstängt (verifiera hur Qwen3.6 i LM Studio stänger av det, t.ex. `chat_template_kwargs`); `anthropic`/`openai` med nyckel och `AI_MODEL`; `mock` läser `tests/fixtures/ai/` (nyckel: SHA-256 av normaliserad indatatext; okänd text ger standardfixturen) -- AD-9
- [x] `src/server/ai/*.test.ts` -- med en falsk modell (`MockLanguageModel` från `ai/test` eller motsvarande) testas varje matrisrad: giltigt svar, schemafel ×3, nätverksfel, HTML-svar, 5xx, tidsgräns, avbrott, att SDK inte gör egna försök, och att inga prompter eller nycklar loggas -- matrisen
- [x] `tests/fixtures/ai/` -- tre påhittade svenska recept som text med förväntade fält (titel, portioner, antal rader, några ingredienser och en vag rad), förväntade `AiRecipe` för mocken, och en PNG av en receptsida som renderas av ett Playwright-skript i `scripts/` från en av texterna -- testuppsättning
- [x] `vitest.eval.config.ts`, `tests/eval/parse-recipe.eval.ts` -- `pnpm eval:ai` kör fixturerna (text och bild) mot vald `AI_PROVIDER`, jämför mot förväntningarna (titel, portioner ±0, antal rader, nyckelingredienser, vag rad) och skriver `tests/eval/report.md` (ignoreras av git); aldrig del av `pnpm test` eller CI -- AD-9
- [x] `README.md` -- avsnitt om AI-leverantör, LM Studio (starta servern, bara localhost) och `pnpm eval:ai` -- dokumentation

**Acceptance Criteria:**
- Given `AI_PROVIDER=mock`, when `pnpm test` körs, then täcks varje matrisrad utan något riktigt modellanrop.
- Given LM Studio med servern igång, when `AI_PROVIDER=lmstudio pnpm eval:ai` körs, then skrivs en rapport för text och bild, och resultatet (lyckat eller misslyckat, per fall) loggas i arkitekturens memlog med `memlog.py append --type event`. Är servern avstängd skrivs det som återstående i Implementation Notes.
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Röktest mot LM Studio återstår.** API-servern på `http://localhost:1234` var avstängd under implementationen (`lms status`: Server OFF), så `AI_PROVIDER=lmstudio pnpm eval:ai` gav `ai_unavailable` (hälsokontrollen) i alla fyra fallen, och inget memlog-event skrevs. När Pontus har startat servern: kör `AI_PROVIDER=lmstudio pnpm eval:ai`, läs `tests/eval/report.md` och logga resultatet per fall med `python3 _bmad/scripts/memlog.py append --type event`.
- **Tänkläget:** `lmstudio` skickar `chat_template_kwargs: { enable_thinking: false }` i anropet (via `providerOptions.lmstudio`, som AI SDK skickar vidare oförändrat). Qwen3.6:s chattmall i LM Studio läser `enable_thinking`, och LM Studio-appen innehåller stöd för `chat_template_kwargs`, men att servern faktiskt stänger av tänkandet är overifierat tills röktestet körts.
- **Promptar i bygget:** `prompts.ts` importerar `prompts/parse-recipe.md?raw`; en Turbopack-regel i `next.config.ts` gör `*.md?raw` till en sträng, och Vitest gör det själv. Verifierat med en tillfällig Route Handler, `pnpm build` och `pnpm start` med md-filen bortflyttad: prompten fanns i serverbundeln och mocken svarade. Routen är borttagen.
- **Mocken** läser `tests/fixtures/ai/` från `process.cwd()` en gång, vid första anropet (fungerar för `pnpm dev`, `pnpm start`, Vitest och CI). Saknas eller är fixturerna trasiga ger den `ai_unavailable` (loggas med orsak `fixtures`). `manifest.json` listar fallen, standardfallet och reserverade texter (`matkoll-mock: <kod>`) som ger `ai_unavailable`, `ai_invalid`, `ai_rejected` eller `import_no_recipe`, för E2E-test av felbeskeden i 1.6–1.9. Nyckeln är SHA-256 av normaliserad text (NFC, ett mellanslag, gemener, text + JSON-LD), och för bara bild SHA-256 av bildens bytes.
- **Indatakontroll** (`withInputValidation` i `service.ts`) ligger framför alla adaptrar, även mocken: tom indata, över 12 000 tecken text + JSON-LD, tom bild, bild över 1,5 MB eller annan typ än JPEG/PNG/WebP ger `validation`. Svaret begränsas till 3 000 token.
- **Svarsformatet** är `{ noRecipe, recipe }` (roten måste vara ett objekt för strikta scheman); `noRecipe: true` ger `import_no_recipe`. Alla fält är obligatoriska (`stepIndexes` är en tom lista när det är oklart), så alla leverantörer kör med strikt JSON-schema.
- **Schemat** kräver icke-tomma strängar (trimmade), gör en tom enhet till `null` och har två regler utöver fälten: en vag rad har varken mängd eller enhet, och `stepIndexes` pekar på befintliga steg. Brott räknas som ogiltigt svar; nästa försök får ett meddelande med de felande sökvägarna och reglerna (aldrig värden), och efter tre försök blir det `ai_invalid`.
- **Felkoder:** HTTP 4xx ger `ai_rejected` (ny kod); nätverksfel, HTTP 5xx, HTTP-svar som inte är JSON, tidsgränser och avbrott ger `ai_unavailable`; båda utan nya försök. Hälsokontrollen kräver att `AI_MODEL` finns i `/models` (annars orsak `model_not_loaded`). Loggning: `console.error(<kod>, { reason, statusCode? })` med `reason` bland `health | model_not_loaded | timeout | connection | rejected | invalid | fixtures`; ett avbrott från anroparen loggas med `console.info`.
- **Miljö:** i produktion måste `AI_PROVIDER` vara satt (mocken bara uttryckligen, som i CI och Playwright); värden med bara blanksteg räknas som tomma; Cloudflare Access-paret kräver https i `LMSTUDIO_BASE_URL`.
- `anthropic` och `openai` är bara testade mot falsk fetch, inte mot riktiga API:er.
- `pnpm eval:ai` använder `http://localhost:1234/v1` när `LMSTUDIO_BASE_URL` saknas eller är tom (bara i `vitest.eval.config.ts`).
- Testuppsättningen har fem påhittade recept (JSON-LD med sidtext, bild, inbakad instruktion, portionsintervall, recept utan tid) och väntar på Pontus bekräftelse (epicens klart-villkor). `pnpm eval:ai` vägrar köra mot mocken.

- Slutverifiering efter granskning: lint, typecheck, 313 Vitest, 5 integrationstester, build, 28 Playwright (`CI=1`). `pnpm db:env` fyller nu i `AI_PROVIDER=lmstudio` och `LMSTUDIO_BASE_URL=http://localhost:1234/v1` lokalt när de saknas, så att `pnpm build` och `pnpm eval:ai` fungerar utan extra steg.
- **Återstår:** röktestet mot Qwen3.6-35B-A3B i LM Studio (`pnpm eval:ai`). Modellen är laddad men LM Studios API-server var avstängd under hela storyn. Körs när Pontus startat servern; resultatet loggas i arkitekturens memlog. Krävs innan Epic 1 räknas som klar.

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge, verify | `AI_PROVIDER` faller tillbaka till `mock` i produktion | high | `env-schema.ts`: standardvärde `mock` oavsett `NODE_ENV` | patch (krävs uttryckligen i produktion) |
| 2 | edge, verify | Mocken kastar ENOENT i stället för `Result` när fixturer saknas; läser om vid varje anrop | medium | `loadFixtures` utan felhantering | patch |
| 3 | blind | Mocken kan inte ge `ai_unavailable` eller `ai_invalid` | medium | 1.6–1.9 behöver testa felbesked i e2e | patch (reserverade fixturer) |
| 4 | blind, edge | Mocken svarar ok på tom indata; riktiga tjänsten ger `validation` | medium | `mockKey` undefined → standardfixtur | patch |
| 5 | blind, edge | HTTP 4xx (fel nyckel, för många anrop, för lång kontext) visas som "Är datorn med modellen igång?"; statuskod loggas inte | medium | Alla icke-schemafel blir `ai_unavailable`/`connection` | patch (ny kod `ai_rejected`, statuskod i logg) |
| 6 | blind, edge | Inga gränser för indatans storlek och bildtyp; `maxOutputTokens` saknas | medium | Qwen körs med 8192 tokens kontext | patch |
| 7 | blind | Nya försök skickar exakt samma förfrågan | medium | Samma indata ger sannolikt samma fel | patch (Zod-sökvägar som återkoppling) |
| 8 | blind | Schemat godtar tomma strängar och blanka steg; `unit: ""` | low | Direkt korrigering | patch |
| 9 | blind, verify | Valfri `stepIndexes` tvingar OpenAI ur strikt läge; inget test av förfrågans format | medium | `strictJsonSchema: false` utan test | patch (`stepIndexes` krävs, strikt överallt, test av förfrågan) |
| 10 | blind | Prompten saknar regel för två ingredienser på en rad och för "inget recept" | medium | "salt och peppar" → bara salt; slumpbild ger påhittat recept | patch (`noRecipe` → `import_no_recipe`) |
| 11 | blind, edge | Utvärderingens kontroller är för svaga (delsträngar, inga mängder/enheter) | medium | "lök" matchar "vitlök" | patch |
| 12 | blind | Testuppsättningen saknar JSON-LD, injektionsförsök, portionsintervall och recept utan tid | medium | Ingen fixtur med `jsonLd` | patch |
| 13 | blind, edge | `eval:ai` kör tyst mot mocken | medium | Ger falsk trygghet | patch |
| 14 | blind, edge | Cloudflare-token kan skickas över http | medium | Schemat tillåter http med CF-paret | patch |
| 15 | blind, edge | Hälsokontrollen kontrollerar inte att modellen är laddad | medium | Fel `AI_MODEL` ger vagt `ai_unavailable` | patch |
| 16 | blind | README blandar ihop icke-JSON-svar från modellen och från HTTP | low | Direkt korrigering | patch |
| 17 | blind | Avbrott loggas som fel | low | Direkt korrigering | patch |
| 18 | blind | Tidsberoende tester kan bli instabila i CI | medium | 80 ms mot 150 ms budget | patch |
| 19 | edge | Miljövärden med bara blanksteg passerar startkontrollen | low | Direkt korrigering (trim) | patch |
| 20 | edge | Loggad orsak säger `health` när totalbudgeten löpte ut | low | Direkt korrigering | patch |
| 21 | verify | Turbopack-regeln för `?raw` prövas aldrig i CI-bygget | medium (ej verifierad i CI) | Ingen route använder porten än | defer (1.6) |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas, inklusive AI-portens tester
- `pnpm test:integration && pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio pnpm eval:ai` -- expected: rapport i `tests/eval/report.md` (kräver att LM Studios server är igång)
