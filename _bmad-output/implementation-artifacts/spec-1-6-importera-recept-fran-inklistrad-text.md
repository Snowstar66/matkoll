---
title: 'Story 1.6: Importera recept från inklistrad text'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '523aaa6043a4fed057c050ea5cfb17e70441fd20'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus kan inte lägga in recept. Det första steget är att klistra in en recepttext och få se receptet i Matkolls format, med katalogkopplingar som går att rätta, innan något sparas.

**Approach:** Arket Importera recept (flikarna Länk, Text, Foto; bara Text fungerar i denna story) skickar texten via `src/lib/ai-client.ts` till Route Handlern `/api/ai/import`. Den anropar `recipes/actions/importRecipe` (AI-porten, `catalog.matchIngredients`, `fromAiRecipe`) och returnerar en `RecipeDraft` utan att skriva något (AD-2, AD-9, AD-10). Förhandsgranskningen visas i samma ark och går att redigera.

## Boundaries & Constraints

**Always:** `RecipeDraft` (Zod) i `recipes/domain` är den enda formen för ett tolkat recept, och `fromAiRecipe` är den enda mappningen från `AiRecipe` (AD-10). Route Handlern skriver aldrig till databasen och svarar med resultatformen i AD-13 (401 utan behörig användare). Avbryt i klienten avbryter anropet till modellen via `request.signal`. Svensk text och felmeddelanden från `src/lib/errors.ts`. Byggstenarna från Story 1.3 (Sheet, Button, Notice, Stepper, SearchField, badges). Enheter, mängder och katalogförslag tolkas bara med `catalog`-funktionerna (AD-12).

**Never:** Ingen sparning, inga tabeller för recept och ingen receptvy (1.7). Ingen import från länk eller foto (1.8, 1.9); de flikarna visar bara att funktionen kommer. Inget anrop till `commitIngredients`. Ingen ny katalogingrediens skapas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna arket | "+" i Recept-rubriken, eller "Importera recept" i tomt bibliotek | Arket Importera recept med flikarna Länk, Text, Foto; fliken Text vald med textfält och knappen "Tolka" | N/A |
| Tolka text | Recepttext, `AI_PROVIDER=mock` | "Läser receptet …" med "Avbryt", sedan förhandsgranskningen | N/A |
| Avbryt | "Avbryt" under tolkning | Anropet avbryts; tillbaka till textfältet med texten kvar | Inget fel visas |
| Tom text | Tomt fält | "Tolka" inaktiv | N/A |
| Förhandsgranskning | `RecipeDraft` | Titel, portioner, tid, receptrader (mängd, enhet, ingrediens) och steg; rader med `confidence: "hint"` har ljusblå ring och "Kontrollera"; `kind: "new"` märks "Ny"; vaga rader visar originaltexten | N/A |
| Redigera | Ändra titel, portioner (Stepper), tid, mängd, enhet (enhetslistan), steg | Ändringen syns direkt i förhandsgranskningen | Ogiltig mängd → "Ange ett tal." |
| Byt ingrediens | Tryck på en rads ingrediens, sök "gul lök", välj | Raden får `{ kind: "chosen", ingredientId }` och visar valt namn utan "Kontrollera" | Ingen träff → "Ingen ingrediens hittades." och möjlighet att ändra namnet på den nya |
| AI otillgänglig | `matkoll-mock: ai_unavailable` | Meddelanderutan "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" med "Försök igen" | Texten finns kvar |
| Ogiltigt svar | `matkoll-mock: ai_invalid` | "Det gick inte att tolka svaret. Försök igen." följt av " eller klistra in texten" enligt AD-13 | Texten finns kvar |
| Avvisad / inget recept | `matkoll-mock: ai_rejected` / `import_no_recipe` | Respektive text från `src/lib/errors.ts` | Texten finns kvar |
| Stäng med ändringar | Ändrad förhandsgranskning, stäng arket | "Släng ändringarna?"; "Släng" stänger, "Fortsätt ändra" behåller | Inget har sparats |
| Ej inloggad | POST `/api/ai/import` utan session eller med otillåten adress | 401 med `{ ok:false, error:{ code:"unauthorized" } }` | N/A |

</frozen-after-approval>

## Code Map

- `src/server/ai/index.ts` (`getAiService().parseRecipe(input, signal)`, typer `AiRecipe`), `src/server/ai/schemas.ts` -- AI-porten; mockens reserverade indata `matkoll-mock: <kod>` i `tests/fixtures/ai/manifest.json`
- `src/features/catalog/server.ts` (`matchIngredients(items)` med `{ text, hint }`), `src/features/catalog/index.ts` (`normalizeUnit`, `parseQuantity`, `formatQuantity`, `UNITS`, `IngredientMatch`, `ChosenIngredient`) -- katalogen
- `src/features/auth/server.ts` (`requireUser`, `requireUserForRoute`) -- behörighet
- `src/lib/errors.ts` -- `Result`, `ok`, `fail`, felkoder och svenska texter
- `src/components/` -- `Sheet`, `Button`, `Notice`, `Stepper`, `SearchField`, `StatusBadge`/`AiBadge`, `Field`; `src/app/(app)/recept/page.tsx` och `PageHeader` -- här läggs "+" och knappen i tomt läge
- `eslint.config.mjs` -- ui får anropa actions och `src/lib/ai-client`; Route Handlers läser via `server.ts`
- `_bmad-output/implementation-artifacts/deferred-work.md` -- två punkter hör hit: e2e att AI-porten (med prompten via `?raw`) fungerar i den byggda servern, och e2e av Sheet i riktig webbläsare

## Tasks & Acceptance

**Execution:**
- [x] `src/features/recipes/domain/recipe-draft.ts` (+ test) -- `recipeDraftSchema` (Zod) enligt AD-10: `title`, `servings`, `totalMinutes`, `imageUrl`, `sourceKind` (`url | text | photo | ai`), `sourceUrl` (bara för `url`), `steps[]`, `lines[]` med `originalText`, `amount`, `unit` (en av `UNITS` eller null), `isVague`, `ingredient` (`IngredientMatch` eller `ChosenIngredient`), `stepIndexes` -- AD-10
- [x] `src/features/recipes/domain/from-ai-recipe.ts` (+ test) -- `fromAiRecipe(aiRecipe, matches, source)`: enheten via `normalizeUnit` (okänd enhet → vag rad med mängd och enhet null), mängd behålls, `matches[i]` till rad i, ogiltiga stegindex tas bort -- AD-10, AD-12
- [x] `src/features/recipes/actions/import-recipe.ts`, `src/features/recipes/server.ts`, `src/features/recipes/index.ts` -- `importRecipe({ text }, { signal })`: `parseRecipe` → `matchIngredients` → `fromAiRecipe`, returnerar `Result<RecipeDraft>`; skriver aldrig -- AD-2
- [x] `src/features/catalog/actions/search-ingredients.ts` (+ export) -- läsaction `searchIngredients(query)` (`"use server"`, `requireUser`, Zod) som söker namn och synonymer, högst 20 träffar -- AD-1 (search*-undantaget)
- [x] `src/app/api/ai/import/route.ts` -- POST `{ kind: "text", text }`, `maxDuration = 120`, `requireUserForRoute`, Zod-validering, `importRecipe` med `request.signal`, svar enligt AD-13 -- AD-9
- [x] `src/lib/ai-client.ts` (+ test) -- `postAi(path, body, signal)` som returnerar `Result`; nätverksfel → `ai_unavailable`, avbrott → särskilt utfall som UI:t inte visar som fel -- AD-9
- [x] `src/features/recipes/ui/import-sheet.tsx`, `src/features/recipes/ui/recipe-preview.tsx`, `src/features/recipes/ui/ingredient-picker.tsx` -- arket med flikar (Länk och Foto: "Kommer snart." i `EmptyState`), textfält, Tolka/Avbryt, felrutor, förhandsgranskning i samma ark med "Tillbaka till texten", redigering och ingrediensbyte via `searchIngredients`; arket är `isDirty` när förhandsgranskningen ändrats -- matrisen
- [x] `src/app/(app)/recept/page.tsx` -- "+" i rubriken (bredvid kugghjulet på mobil, i rubriken på dator) och "Importera recept" i tomt läge öppnar arket -- UX
- [x] `tests/e2e/import.spec.ts` -- med `AI_PROVIDER=mock` mot den byggda servern: tolka en fixturtext → förhandsgranskning med "Kontrollera" och "Ny"; redigera och byt ingrediens; Avbryt; varje reserverat felbesked; "Släng ändringarna?" vid stängning med Esc och med stängknappen; 401 för `/api/ai/import` utan session -- matrisen, uppskjutna punkter
- [x] `README.md` -- kort om importflödet och `/api/ai/import` -- dokumentation

**Acceptance Criteria:**
- Given den byggda appen med `AI_PROVIDER=mock`, when `/api/ai/import` anropas, then fungerar AI-porten inklusive prompten som laddas via `?raw` (bekräftar den uppskjutna punkten).
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given LM Studio igång, when Pontus tolkar en riktig recepttext lokalt, then visas förhandsgranskningen (manuell kontroll, noteras i Implementation Notes).

## Implementation Notes

- **Namn i svaret:** `RecipeDraft` bär bara `ingredientId` för matchade rader (AD-10), men förhandsgranskningen måste visa namnet. `importRecipe` returnerar därför `Result<RecipeImport>` = `{ draft: RecipeDraft, ingredientNames: Record<id, namn> }` (`recipes/domain/import.ts`); utkastet i sig följer AD-10 oförändrat. Namnen läses med den nya `catalog/server.getIngredientNames(ids)`. Ingrediensväljaren lägger till namnet för en vald ingrediens.
- **`searchIngredients` över modulgränsen:** ui får inte importera en annan moduls `server.ts` eller `actions/`, och `index.ts` får inte exportera actions. Därför exporteras actionen från `catalog/server.ts`, och sidan `recept/page.tsx` skickar den som prop till `ImportRecipeProvider` (en Server Action går att skicka till en klientkomponent). Lintreglerna är oförändrade.
- **Ny felkod:** `catalog_unavailable` ("Det gick inte att läsa ingredienskatalogen. Försök igen.") när katalogen inte går att läsa vid import eller sökning. `isErrorCode()` lades till i `errors.ts` för `ai-client`.
- **HTTP-status:** 400 `validation`, 401 `unauthorized`, 422 `import_no_recipe`, 502 `ai_invalid`/`ai_rejected`, 503 `ai_unavailable`/`catalog_unavailable`. `postAi` läser resultatet oavsett status.
- **UI-val:** arkets stängknapp heter "Stäng" (inte "Avbryt") så att den inte krockar med "Avbryt" under tolkning. "Försök igen" visas för `ai_unavailable`, `ai_invalid` och `catalog_unavailable`. "Tillbaka till texten" behåller förhandsgranskningen ("Visa förhandsgranskningen" tar tillbaka den); Utan träff i väljaren: "Ingen ingrediens hittades." och "Lägg till [namn] som ny" (en `kind: "new"`-rad; inget skapas i katalogen). Förloppsraden använder en ny `animate-progress` i `globals.css` och står still med "Minska rörelse".
- **Uppskjutna punkter:** `tests/e2e/import.spec.ts` kör mot den byggda servern i CI (`pnpm build && pnpm start`) och visar därmed att AI-porten med prompten via `?raw` fungerar efter `next build`, och testar Sheet i riktig webbläsare (Esc, stängknappen, "Släng ändringarna?"/"Fortsätt ändra"). Svep nedåt testas inte i E2E.
- **Manuell kontroll med LM Studio (2026-10-25):** byggd server (`pnpm start`) med `AI_PROVIDER=lmstudio` och `qwen/qwen3.6-35b-a3b`: `linssoppa.txt` gav förhandsgranskningen efter 42 s, med "Kontrollera" på gul lök och vitlök, "Ny" på övriga och vaga rader för "1 bit färsk ingefära" och "en näve färsk koriander". Gjord av agenten, inte av Pontus i `pnpm dev`.

- **Efter granskning:** en rad är vag precis när den saknar mängd, och då saknar den enhet (schema, `fromAiRecipe`, `withAmount`). Raden behåller AI-tipset (`hint`) så att en ny ingrediens får tipsets avdelning, plats och enhet. `validateDraft(draft, pending)` ger fältfel (titel, steg, mängd, tid) och arket räknar ut `isValid` (`data-valid`) för Story 1.7. `importRecipe` kontrollerar utkastet med `recipeDraftSchema` (annars `ai_invalid`) och gör bara `CatalogDataError` till `catalog_unavailable`; andra fel kastas. Route Handlern kräver egen origin/`Sec-Fetch-Site` (403), JSON (415) och högst 64 kB (413). Ny tolkning av en ändrad förhandsgranskning och stängning med otolkad text frågar "Släng ändringarna?". Texten begränsas till 12 000 tecken med räknare. Esc i ingrediensväljaren går tillbaka till förhandsgranskningen. "Ny" har en neutral etikett (`Badge tone="neutral"`). Importtexten för `ai_invalid` är `importInvalidMessage` i `errors.ts`.
- **Origin-kontrollen:** `Origin` måste vara `SITE_URL`:s origin. Öppnas appen på en annan adress än `SITE_URL` (t.ex. `127.0.0.1:3000` när `SITE_URL` är `localhost:3000`) svarar importen 403.
- Slutverifiering efter granskning: lint, typecheck, 665 Vitest, 35 integrationstester, build, 45 Playwright (`CI=1`). Route Handlern ger 403 om appen öppnas på en annan adress än `SITE_URL` (t.ex. `127.0.0.1` i stället för `localhost`).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Ny tolkning ersätter en redigerad förhandsgranskning utan fråga; inklistrad men otolkad text räknas inte som ändring | high | `isDirty` skyddar bara stängning | patch |
| 2 | blind, edge | Förhandsgranskningen kan hålla ett ogiltigt utkast (tom titel, tomt steg, ogiltig mängd/tid) utan felmeddelande | high | 1.7 kan inte blockera "Spara" | patch |
| 3 | blind, edge | Rad utan mängd behåller enhet; vaghet går förlorad; AI-rad med enhet men utan mängd blir osynlig | medium | `withAmount(line, null)`, `fromAiRecipe` | patch (utan mängd → vag, schemaregel) |
| 4 | blind | `importRecipe` validerar inte utkastet på servern | medium | Klienten ger `ai_invalid` utan serverlogg | patch |
| 5 | blind, edge | `try` i `importRecipe` gör programfel till `catalog_unavailable` | medium | Fångar även `fromAiRecipe` | patch |
| 6 | blind, edge | Route Handlern kontrollerar varken innehållstyp, ursprung eller storlek | high | `text/plain` korsplats-POST startar 110 s körningar på lokala modellen | patch |
| 7 | verify | Att `request.signal` når `importRecipe` testas inte; statuskoder otestade | medium | Mutation passerar alla tester | patch |
| 8 | verify | `searchIngredients` saknar test för behörighet, validering och fel | medium | Första publika läsningen av katalogen | patch |
| 9 | blind, edge | Ingen längdgräns i textfältet; för lång text ger generiskt fel | medium | `maxImportTextChars` finns men används inte i UI | patch |
| 10 | blind | Fokus försvinner när förhandsgranskningen visas; "Läser receptet …" annonseras inte säkert | medium | Live-region monteras med innehåll | patch |
| 11 | blind | Esc i "Byt ingrediens" stänger hela arket | medium | Sheet hanterar Esc | patch |
| 12 | blind | Ny ingrediens på en matchad rad tappar AI-tipset | medium | Tipset finns inte i `RecipeLine` | patch (valfritt `hint` på raden) |
| 13 | blind, edge | "Lägg till … som ny" bara vid noll träffar och innan svaret kommit; gemener | medium | "lök" går inte att lägga till när "Gul lök" finns | patch |
| 14 | edge | "Visa förhandsgranskningen" visar en granskning av gammal text | low | Direkt korrigering | patch |
| 15 | edge | Home/End saknas i flikarnas tangentbordsmönster | low | Direkt korrigering | patch |
| 16 | edge | `ai-client` släpper igenom icke-strängar i `fields` | low | Direkt korrigering | patch |
| 17 | blind | E2E räknar katalograder för alla användare; fast väntetid 3,5 s | medium | Instabilt vid parallella tester | patch |
| 18 | blind | `importErrorMessage` bygger på exakt formulering i `errors.ts` | low | Direkt korrigering | patch |
| 19 | blind | "Ny" använder sand, som betyder AI | low | DESIGN.md: sand = skafferi och AI | patch (neutral etikett) |
| 20 | blind | README-rader hamnar utanför tabellen | low | Direkt korrigering | patch |
| 21 | verify | Klientgrenen `catalog_unavailable` och väljarens logik saknar test | medium | Mutationer passerar | patch (komponenttest för väljaren) |
| 22 | blind, edge, verify | Sökningen läser 100 kandidater i bokstavsordning före rangordning | low | En personlig katalog når sällan dit | patch (rätta kommentaren) |
| 23 | edge | `*` i sökningen ger fel rangordning | low | Ovanligt | avvisad |
| 24 | edge | `importRecipe` returnerar `{ draft, ingredientNames }` i stället för `RecipeDraft` | low | Dokumenterat avsteg; utkastet är oförändrat | avvisad |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas, inklusive `import.spec.ts`

**Manual checks (if no CLI):**
- Med `AI_PROVIDER=lmstudio` och LM Studio igång: tolka `tests/fixtures/ai/linssoppa.txt` i `pnpm dev` och kontrollera förhandsgranskningen
