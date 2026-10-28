---
title: 'Story 10.4: Lagersaldo och stor bokstav'
type: 'fix'
created: '2026-10-26'
status: 'done'
baseline_commit: '4ceb250'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lagersidan hette Hemma, samma sak som det första stället (Epic 8), så "Hemma" i menyn gick inte att skilja från stället. Menyvalet för inköpslistan hette bara "Lista". Sparade varunamn började ibland med liten bokstav ("bregott", "mellanmjölk") och ibland med stor.

**Approach:**
- Sidan heter "Lagersaldo" i menyn och som rubrik. Det är Pontus val.
- Menyvalet "Lista" heter "Inköpslista", i sidomenyn och i flikfältet. Det är också Pontus val. Rubriken och `<title>` sa redan "Inköpslista".
- Katalogens namn börjar med stor bokstav, för nya och befintliga varor. Det är också Pontus val. Domänen gör det för nya namn, och en migration gör det för de befintliga.

## Boundaries & Constraints

**Always:**
- Flikfältet, sidomenyn, rubriken, `<title>` och texter som nämner sidan säger "Lagersaldo". Adressen `/hemma` är kvar, så att bokmärken fungerar.
- Flikfältet och sidomenyn säger "Inköpslista". Adressen `/lista` är kvar. Etiketten får inte klippas i flikfältet vid 375 px med 200 % textförstoring.
- Stället Hemma behåller sitt namn: `defaultSiteName` är "Hemma", och texter som "Lager: Hemma" och "… för Hemma." gäller stället.
- Bara första bokstaven blir stor (`toLocaleUpperCase("sv")`, så att å, ä och ö fungerar). Resten står kvar som det skrevs.
- Det görs på ett ställe i domänen (`catalog/domain`), som `commitIngredients` använder för alla källor: foto, receptimport, arket Lagervara och AI-förslag.
- "Sparas som: …" och namnet på en ny vara visas som det sparas.
- Migrationen (`supabase migration new catalog_name_capital`) ändrar bara `ingredient.name`, och bara där första bokstaven är liten. Den rör aldrig `normalized_name`, tar inte bort rader och ändrar inga id:n. Å, ä och ö kontrolleras lokalt.
- Före migrationen lokalt tas en säkerhetskopia av bara data. Under testlåset sparas `select id, normalized_name, name from ingredient order by id` före och efter, och bara första bokstaven i `name` får ha ändrats.
- Namn mitt i en mening får liten bokstav där det behövs. Poster i listor får börja med stor bokstav. Exportformatet v1 förblir giltigt.

**Never:**
- `normalized_name`, matchningen och sökningen ändras inte.
- Ingen ny route, och `/hemma` byter inte namn.
- Kör aldrig `supabase db reset`.

</frozen-after-approval>

## Code Map

- `src/components/app-shell/destinations.ts`, `tab-bar.tsx` -- menyns etiketter och var de får brytas
- `src/app/(app)/hemma/page.tsx`, `home-place.tsx` -- `metadata.title` och `PageHeader`
- `src/lib/errors.ts`, `src/features/recipes/ui/ai-suggestions.tsx` -- "Lägg till varor i …" och "Öppna …"
- `src/features/catalog/domain/name.ts` (ny) -- `catalogName`, `nameInSentence`
- `src/features/catalog/data/commit.ts`, `domain/match.ts` (`proposalFrom`), `domain/search.ts` (`newIngredientName`)
- `src/features/pantry/domain/pantry-item-form.ts` (`pantryNewIngredientName`), `pantry-suggestion.ts` (`savedAsText`), `places.ts` (`removedItemsText`)
- `src/features/shopping/domain/list-text.ts` (`restoreFailedText`)
- `supabase/migrations/<tid>_catalog_name_capital.sql`, `<tid>_catalog_name_rule.sql` (`catalog_display_name` och triggern)

## Tasks & Acceptance

**Execution:**
- [x] Menyn, rubriken, `<title>`, felet `suggest_empty_pantry` och länken "Öppna Lagersaldo". Enhetstester och e2e-lokaliserare (flikar, rubriken, länken) -- FR-11
- [x] Menyvalet "Inköpslista" och e2e-lokaliserarna för fliken. I flikfältet bryts en lång etikett mellan sina delar (`labelParts`: Mat/sedel, Inköps/lista, Lager/saldo) med `<wbr>`. `shell.spec.ts` visar att alla etiketter får plats på en rad vid 375 px och utan klippning, på högst två rader, vid 187 px (375 px med 200 % zoom)
- [x] `catalogName` och `nameInSentence` (+ test) i `catalog/domain/name.ts`, använda i `commitIngredients`, `proposalFrom`, `newIngredientName`, `pantryNewIngredientName` och `savedAsText` (+ tester)
- [x] `nameInSentence` i "Med: …", `restoreFailedText` och det andra namnet i `removedItemsText` (+ tester)
- [x] Migrationen `catalog_name_capital` med kollationen `pg_c_utf8`, och ett designtest som låser att den bara ändrar `name` och anger kollationen
- [x] Integrationstest: `commitIngredients` sparar "Bregott" och "Ägg" med `normalized_name` "bregott" och "ägg", och "2 st ägg" matchar exakt
- [x] `EXPERIENCE.md`, `DESIGN.md`, `docs/ux/ux-spec.md`, PRD:ns NFR-3, `README.md` och `docs/oppna-fragor.md` där de nämner sidan
- [x] `docs/beslutslogg.md`, `epics.md` och `sprint-status.yaml`

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e` under `scripts/with-test-lock.sh`, when de körs, then lyckas alla.

## Implementation Notes

- **Kollationen:** databasens kollation är lokalt ICU `en-US`. Med kollationen `C` hade `upper('å')` gett `å`. Migrationen anger därför `pg_c_utf8`, som är inbyggd i PostgreSQL 17 och följer Unicode oavsett databasens kollation. Ett tecken utan en enkel stor bokstav ("ß") står kvar, och `catalogName` gör likadant.
- **Flikfältet vid 200 %:** vid 187 px är varje flik ungefär 47 px bred. "Inköpslista" och "Lagersaldo" får inte plats på en rad, och det gjorde inte heller "Matsedel" före storyn. Etiketterna bryts därför mellan orddelarna med `<wbr>`, aldrig mitt i en del. Två rader ryms i flikfältets 84 px. Sidan /recept har vid 187 px en vågrät scroll som inte kommer från flikfältet; testet kontrollerar bara flikfältet.
- **Sidan eller stället:** kodens kommentarer och tidigare stories (också 10.2:s text) säger fortfarande Hemma om sidan. Bara det Pontus ser och de gällande UX-dokumenten är ändrade.

## Review Triage Log

Iteration 1. Tre granskare gick igenom `fd2527f`. Ändringarna i SQL ligger i en andra migration, `catalog_name_rule`, eftersom `catalog_name_capital` redan var körd lokalt.

**Patch:**
- Databasen håller regeln:
  - `public.catalog_display_name(text)` är samma regel som `catalogName`. En trigger (`before insert or update of name` på `ingredient`) använder den, så att också `commit_ingredients` direkt, äldre klienter och testdata får stor bokstav.
  - Migrationen ger de befintliga namnen den förfinade regeln och ändrar bara rader vars resultat skiljer sig.
  - Det fanns ingen `seed.sql`. Testdatan i e2e-specarna har nu stor bokstav.
- En regel i TS och SQL:
  - Den första bokstaven (`\p{L}`, i SQL `[[:alpha:]]`) blir stor, efter citattecken, parenteser och emoji: "(eko) mjölk" blir "(Eko) mjölk". Ett namn som börjar med en siffra ("7up") står kvar.
  - Ett första ord som redan har blandade versaler ("iPhone-laddare", "pH-neutral", "eKaffe") står kvar.
  - Bara den bokstaven ändras. Namnet NFC-normaliseras inte, så ett tecken som följer bokstaven står kvar.
  - Kontrollen är `<> upper(…)`, så titelversalen ǅ blir Ǆ i båda.
  - Ger den stora bokstaven ett annat normaliserat namn ("ı", "ſ"), eller saknar bokstaven en enkel stor bokstav ("ß"), står namnet kvar.
  - Fallen finns i `tests/fixtures/catalog-name-cases.ts`. Enhetstestet kör `catalogName` på dem, och integrationstestet kör SQL-funktionen och triggern på samma fall.
  - Den första migrationen ändrade 75 rader, och ingen av dem skulle den nya regeln ha lämnat. Inget behövde återställas.
- PostgreSQL 17:
  - `major_version = 17` i `supabase/config.toml`, och lokalt är `server_version_num` 170011.
  - Båda migrationerna stoppar med ett tydligt fel under 170000.
  - `docs/drift.md` säger att molnprojektet måste ha Postgres 17 eller senare.
- `nameInSentence` gäller bara katalognamn:
  - Den sänker aldrig ett ord med blandade versaler ("Coca-Cola", "McCain"), en förkortning ("ICA:s", "BBQ-sås") eller en bokstav före bindestreck ("D-vitamin", "A-fil", "K-märkt").
  - Egna varor och recepttext står som de skrevs (`NameInText`, `lineName`). En mening som börjar med ett namn får stor bokstav: "Diskmedel är borttagen.".
  - "Med: …" jämför normaliserat och sänker bara katalognamn.
  - `productChoiceTitle` använder samma funktion.
  - Knapparnas namn ("Lägg till Palsternacka som ny", "Bekräfta Senap") behåller katalogens skrivning.
- Jämförelser:
  - Namn jämförs normaliserat i `sameIngredient` (arket Lagervara) och `confirmItemFromForm`.
  - Ingen tabell har en nyckel på `ingredient.name`. Nycklarna i `shopping_check` och `shopping_line_override` byggs av ingrediensens id eller av radens text i gemener, och alla främmande nycklar pekar på `(id, user_id)`.
- Flikfältet:
  - `min-h` i stället för fast höjd, så att två rader och ikonen aldrig går in i säkerhetsområdet.
  - Testerna mäter etiketterna medan de är aktiva (/lista och /hemma, halvfet text): vid 375 × 812, vid 375 px med dubbel rotstorlek och vid 187 px. Etiketten ska sluta ovanför länkens nederkant, och länken ovanför flikfältets nedre utfyllnad.
- Tester:
  - `toHaveTitle` för "Lagersaldo – Matkoll" och "Inköpslista – Matkoll".
  - Designtestet låser SET-uttrycket i båda migrationerna ordagrant, liksom triggern och spärren för Postgres 17.
  - `/i` i e2e är utbytt mot exakt skrivning.
  - Sökningen hittar "Bregott" med "bre" och "Ägg" med "ägg", och å, ä och ö sorteras som förut.
  - Etiketten "gurka" med katalognamnet "Gurka" ger inget "Sparas som".
  - Den sönderdelade formen skrivs med `\u030A`.
- Rester av namnbytet:
  - README och `oppna-fragor` säger Lagersaldo och Inköpslista.
  - Ett designtest stoppar ordet "Hemma" i komponenternas text och i `src/lib/errors.ts`, utanför kommentarer. Undantagslistan är tom, eftersom stället bara nämns i `.ts`-filer.

**Undersökt, inte ändrat:**
- De fyra e2e-testerna som bara misslyckas lokalt (`ai-suggestions:153`, `basket-export:260`, `product-choice:180` och `shopping:564`) går igenom mot en produktionsbyggd server (`pnpm build`, `CI=1`). Alla 25 tester i de fyra specarna gick igenom.
  - De misslyckas bara mot `pnpm dev`, som Playwright startar lokalt.
  - Varken databasens innehåll eller servern på port 3000 är orsaken. Playwright startade en egen server på 3100, och samma databas gav rätt resultat i produktionsläge.
  - Klicket ger varken nätverksfel eller konsolfel. Testerna klickar direkt efter att serverns HTML syns, och sannolikt hinner React inte hydrera sidan i utvecklingsläget.

**Avvisat:**
- En tabell i produktion med de ursprungliga namnen. Molnprojektet finns inte än.

## Verification

**Commands:**
- `scripts/with-test-lock.sh pnpm test:integration` och `scripts/with-test-lock.sh pnpm test:e2e` -- expected: alla lyckas
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas
