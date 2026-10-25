---
title: 'Story 1.5: Ingredienskatalog, enheter och avdelningar'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '26f49cd264e30a8c4368ab1830094d9cdf5c1a25'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recept, lager, inköpslista och bildanalys måste peka på samma vara, annars kan Matkoll inte jämföra det som behövs med det som finns hemma. "Lök, hackad" och "gul lök" ska bli samma katalogingrediens, och "deciliter" och "dl" samma enhet.

**Approach:** Modulen `catalog` får de rena reglerna för enheter, mängder, avdelningar, platser och normalisering, projektets första migration (`ingredient`, `ingredient_synonym` med RLS) och två funktioner: skrivfria `matchIngredients` och `commitIngredients`, som bara sparande actions anropar (AD-6, AD-12).

## Boundaries & Constraints

**Always:** Bara `catalog` läser och skriver sina tabeller; andra moduler använder `catalog/index.ts` och `catalog/server.ts` (AD-1). Matchningen skriver aldrig. Migrationen följer AD-4 (`user_id default auth.uid()`, RLS, en policy `user_id = (select auth.uid())`, grants till `authenticated` och `service_role`, aldrig `anon`) och skapas med `supabase migration new`. `database.types.ts` genereras och CI kontrollerar den (AD-5). Enheter räknas aldrig om. Mängder visas bara med `formatQuantity`.

**Never:** Inget UI och ingen action som Pontus anropar direkt (sökning och nya ingredienser i lagret kommer i Epic 2). Ingen sammanslagning eller borttagning av katalogingredienser (AD-20). Inga AI-anrop i katalogen; AI-tipset kommer från `AiRecipe` (1.4). Ingen service role i `src/`. Kör aldrig `supabase db reset` mot den lokala databasen (raderar användarna); använd `supabase migration up`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enhetsalias | "deciliter", "DL", "msk.", "paket", "förpackning" | `dl`, `dl`, `msk`, `förp`, `förp` med `known: true` | N/A |
| Okänd enhet | "näve", "skvätt" | `{ unit: null, known: false }`; raden blir vag hos anroparen | N/A |
| Mängder | "1,5", "1.5", "½", "1 1/2", "2-3" | 1,5; 1,5; 0,5; 1,5; 3 (största värdet i ett intervall) | Ogiltig text → `null` |
| Formatering | (1.5, `dl`), (2, `st`), (0.333, `dl`), (null, null) | "1,5 dl", "2 st", "0,33 dl", "" | N/A |
| Avdelning | "mejeri", "Frukt & grönt", "kött", "okänt" | `Mejeri`, `Frukt och grönt`, `Kött och fisk`, `Övrigt` | N/A |
| Plats | "kylskåp", "frysen", "torrvaror", "okänt" | `Kyl`, `Frys`, `Skafferi`, plats från avdelningen (Mejeri/Kött och fisk/Chark → Kyl, Frys → Frys, annars Skafferi) | N/A |
| Normalisering | "1 Lök, hackad", "  Gul lök ", "2 dl Grädde (40 %)" | "lök", "gul lök", "grädde" | Tom text → `""`, som aldrig matchar |
| Exakt träff | Katalogen har "gul lök"; text "Gul lök" | `{ kind:'match', ingredientId, confidence:'exact' }` | N/A |
| Synonymträff | Synonymen "lök" → "gul lök"; text "Lök, hackad" | `{ kind:'match', confidence:'synonym' }` | N/A |
| Ingen träff | Text "saffran", hint `{ name:"Saffran", section:"kryddor", location:"skafferi", defaultUnit:"g" }` | `{ kind:'new', proposal:{ name:"saffran", section:"Skafferi", location:"Skafferi", defaultUnit:"g" } }` | Okänd avdelning → Övrigt; okänd enhet → `null` |
| Ingen skrivning | `matchIngredients` anropas | Inga rader skapas eller ändras | N/A |
| Ny ingrediens | `commitIngredients` med `new` två gånger samtidigt | En rad; båda anropen får samma id | N/A |
| Rättning | Förslag "lök" → Pontus väljer "rödlök" | Synonymen `"lök, hackad"` (normaliserad originaltext) pekar på rödlök; finns synonymen redan pekas den om | N/A |
| Annan användare | Användare B läser eller skriver A:s rader | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `supabase/config.toml`, `supabase/migrations/` -- inga migrationer ännu; `auto_expose_new_tables = false` är satt
- `src/lib/supabase/server.ts` (`createClient()`), `src/lib/supabase/database.types.ts` (genererad, tom `public`)
- `src/features/auth/` -- mönster för modulens `index.ts`, `server.ts`, `domain/`, `data/`, `actions/`
- `src/server/ai/schemas.ts` -- `AiRecipe.ingredients[].hint` (`name`, `section`, `location`, `defaultUnit` som fri text) och `unit` som råtext
- `tests/integration/auth.test.ts`, `tests/local-supabase.ts`, `vitest.integration.config.ts` -- mönster för integrationstester mot lokal Supabase och skyddet mot molnet
- `.github/workflows/ci.yml` -- jobbet `integration` kör `supabase start`, typdriftkontroll och `pnpm test:integration`

## Tasks & Acceptance

**Execution:**
- [x] `src/features/catalog/domain/units.ts` (+ test) -- `UNITS` (`g, kg, ml, cl, dl, l, krm, tsk, msk, st, förp, klyfta, kruka, knippe, skiva`), `normalizeUnit(raw)` → `{ unit, known }` med alias, `parseQuantity(text)`, `formatQuantity(amount, unit)` med svenskt decimalkomma och högst två decimaler -- AD-12
- [x] `src/features/catalog/domain/sections.ts`, `locations.ts` (+ tester) -- Zod-enum i fast ordning, `toSection(raw)`, `toLocation(raw, section)` enligt matrisen -- AD-12
- [x] `src/features/catalog/domain/normalize.ts` (+ test) -- gemener, trimning, tar bort mängd och enhet i början, parentestext och en kort lista tillagningsord (hackad, finhackad, skivad, riven, tärnad, pressad, strimlad, smält, rumsvarm, färsk, fryst, torkad) -- AD-6
- [x] `src/features/catalog/domain/match.ts` (+ test) -- ren funktion `matchAgainst(items, snapshot)` som ger `IngredientMatch` enligt matrisen; typerna `IngredientMatch`, `IngredientProposal`, `IngredientChoice` -- AD-6
- [x] `supabase/migrations/<tid>_catalog.sql` -- tabellerna `ingredient` (`id`, `user_id`, `name`, `normalized_name`, `section`, `location`, `default_unit` null, `created_at`; unik `(user_id, normalized_name)`; `check` för avdelning, plats och enhet) och `ingredient_synonym` (`id`, `user_id`, `ingredient_id`, `normalized`, `created_at`; unik `(user_id, normalized)`; sammansatt FK `(ingredient_id, user_id)` mot `ingredient(id, user_id)` med `on delete restrict`), RLS, policy och grants enligt AD-4 -- AD-4, AD-6
- [x] `src/lib/supabase/database.types.ts` -- genererad med `pnpm db:types` -- AD-5
- [x] `tests/design/catalog-checks.test.ts` -- listorna i migrationens `check` är exakt `UNITS`, avdelningarna och platserna från domänen -- drift mellan databas och kod
- [x] `src/features/catalog/data/queries.ts`, `src/features/catalog/data/commit.ts` -- tar en `SupabaseClient<Database>` som argument: `loadCatalogSnapshot(db, normalizedTexts)` (bara rader som behövs) och `commitIngredients(db, choices)` med `insert … on conflict (user_id, normalized_name) do update … returning id` och upsert av synonymer på `(user_id, normalized)`; returnerar `Map<originalText, ingredientId>` och tar bort dubbletter inom samma anrop -- AD-6
- [x] `src/features/catalog/server.ts`, `src/features/catalog/index.ts` -- `server.ts`: `matchIngredients(items)` och `commitIngredients(choices)` med användarens sessionsklient; `index.ts`: domänfunktioner och typer -- AD-1
- [x] `tests/integration/support.ts` -- inloggad klient för en testanvändare (skapad med service role, inloggad med `generateLink` + `verifyOtp`, bortstädad efteråt) och en återanvändbar `expectRlsIsolation(table, insertRow)` som visar att anonym klient och annan användare varken läser, skapar, ändrar eller tar bort (`42501` eller tomt resultat godtas) -- AD-4
- [x] `tests/integration/catalog.test.ts` -- RLS för båda tabellerna; matchning utan skrivning (räkna rader före och efter); samtidiga `commitIngredients` ger en rad; rättning sparar och pekar om synonym; en användares synonym påverkar inte en annans matchning -- matrisen
- [x] `README.md` -- kort avsnitt om katalogen och hur en migration skapas (`supabase migration new`, `pnpm db:types`) -- dokumentation

**Acceptance Criteria:**
- Given den lokala databasen, when `supabase migration up` körs, then skapas tabellerna och `pnpm db:types` ger ingen skillnad mot den incheckade filen; CI (som startar från tom databas) ger samma typer.
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Nya ingredienser skapas av Postgres-funktionen `commit_new_ingredients(jsonb)` (`security invoker`, RLS gäller): `on conflict … do update` är en tom uppdatering, så en befintlig ingrediens behåller namn, avdelning, plats och enhet. En vanlig upsert från supabase-js skulle ha skrivit över dem.
- Rättningens synonym sparas normaliserad (`"lök"`), eftersom uppslagningen normaliserar; matrisens `"lök, hackad"` beskriver originaltexten före normalisering.
- Exakt namn går före synonym. En tom enhet ger `{ unit: null, known: true }` (raden blir inte vag); bara okänd enhet ger `known: false`. burk/påse/ask/flaska → `förp`.
- `matchIngredientsIn(db, items)` och `commitIngredients(db, choices)` tar klienten som argument; `server.ts` använder sessionsklienten. De anropar inte `requireUser()` själva – de sparande actions som anropar dem gör det.
- `supabase migration new` väntar på stdin utan terminal; kör med `< /dev/null`.
- RLS-testet är verifierat genom att stänga av RLS tillfälligt (testet fallerade).
- Efter granskning: matchning i ordningen text → synonym → AI-tipsets namn (`confidence: "hint"`) → tipsets synonym → ny; `{ kind: "unmatched" }` för tom text; nya ingredienser sparar originaltexten som synonym; visningsnamn behåller versaler; produktord tas bara bort efter komma; fler mängdformer; NFC och `Map` i aliaslistor; resultat per rad; id kontrolleras; ny migration `…_catalog_atomic_commit.sql` med `commit_ingredients` (en transaktion, ingen `service_role`, ingen delete på `ingredient`); uppdelade uppslag; tusentalsavgränsare och små mängder; anonym klient måste få 42501; alla domänvärden prövas mot databasen.
- Slutverifiering: lint, typecheck, 550 Vitest, 30 integrationstester, build, 28 Playwright (`CI=1`).
- Verifierat före granskning: `supabase migration up`, `pnpm db:types` stabil, lint, typecheck, 452 Vitest, 23 integrationstester, build, 28 Playwright (`CI=1`).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, verify | Matchningen slår aldrig upp AI-tipsets namn; kända ingredienser visas som "Ny" | high | `loadCatalogSnapshot` och `matchAgainst` använder bara radtexten; "vitlöksklyftor" ≠ `vitlök` | patch (text → synonym → tips → tipsets synonym → ny) |
| 2 | blind | Ny ingrediens sparar ingen synonym för originaltexten | medium | Nästa import av "lök" ger "Ny" igen | patch |
| 3 | blind | Visningsnamn sparas med gemener | medium | `proposal.name` normaliseras | patch |
| 4 | blind, edge | Ord som anger själva varan ("torkade", "fryst", "riven") tas bort och slår ihop produkter | medium | "Torkade tomater" → "tomater" (fastlåst i test) | patch (bara efter komma) |
| 5 | blind, edge | Mängder skrivna "500g", med räkneord, okända mått ("näve") eller avslutande fraser ("efter smak") tas inte bort; listpunkter stör | medium | Verifierat i node av granskaren | patch |
| 6 | blind, edge | `toSection`/`toLocation`/`normalizeUnit` saknar NFC och slår upp ärvda nycklar ("constructor") | medium | Verifierat i node | patch |
| 7 | edge | Nästlade eller ensamma parenteser lämnar kvar text | low | Direkt korrigering | patch |
| 8 | blind, edge | Tom text ger ett förslag som inte klarar sitt eget schema | medium | `name: ""` mot `min(1)` | patch |
| 9 | blind, edge, verify | Resultatet nycklas på originaltext; dubbletter ("salt och peppar" som två rader) skrivs över | high | Prompten kräver två rader med samma originaltext | patch (resultat per index; motstridiga synonymer avvisas) |
| 10 | blind, edge | `match`/`chosen`-id kontrolleras inte mot katalogen | medium | Främmande id upptäcks först i andra tabeller | patch |
| 11 | blind, edge | Ingredienser och synonymer skrivs i två steg | medium | Synonymsteget kan fallera efter att ingredienser skapats | patch (en funktion, ny migration) |
| 12 | edge | `commit_new_ingredients` får köras av `service_role`, där `auth.uid()` är null | low | Direkt korrigering (dra in rättigheten) | patch |
| 13 | blind | Migrationen ger `delete` på `ingredient` trots AD-20; `normalized_name` godtar blanksteg | medium | Kommentaren motsäger rättigheterna | patch (ny migration) |
| 14 | blind, edge | `.in(...)` utan uppdelning kan ge för lång URL | low | Direkt korrigering (delning) | patch |
| 15 | edge | "1.500" och "1 000" tolkas fel | low | Direkt korrigering | patch |
| 16 | blind, edge | `formatQuantity` visar små mängder som 0 och avrundar 1,005 fel | low | Direkt korrigering | patch |
| 17 | blind | Ogiltig indata kastar `ZodError`, databasfel `CatalogDataError` | low | Direkt korrigering | patch |
| 18 | blind, edge, verify | Drifttestet läser bara en migrationsfil; levande schemat prövas inte för alla värden | medium | Mutation i en senare migration upptäcks inte | patch (integrationstest för varje värde) |
| 19 | verify | `expectRlsIsolation` godtar tomt svar för anonym klient, så en grant till `anon` upptäcks inte | medium | Mutation: grant till anon passerar | patch |
| 20 | blind | `chosen` med samma id som förslaget sparar en onödig synonym | low | Direkt korrigering | patch |
| 21 | verify | `parseQuantity` och prompten tolkar intervall olika | medium | "2-3" → 3 i koden, 2 i prompten | patch (största värdet överallt) |
| 22 | blind | README blandar klient- och serveringång | low | Direkt korrigering | patch |
| 23 | blind, edge | Rättning till en text som är en annan ingrediens exakta namn tar aldrig effekt | low | AD-6 låser ordningen namn före synonym; ovanligt | patch (spara ingen verkningslös synonym; dokumentera) |
| 24 | edge | Städningen av testanvändare avbryts vid första felet | low | Testbekvämlighet | avvisad |
| 25 | blind | Svaga testnamn ("finds nothing without a session") | low | Kosmetiskt | avvisad |
| 26 | blind | Diffen saknar `database.types.ts` | false | Uteslöts avsiktligt; CI kontrollerar typdrift | avvisad |

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
