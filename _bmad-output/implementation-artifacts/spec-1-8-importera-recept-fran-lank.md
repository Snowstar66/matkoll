---
title: 'Story 1.8: Importera recept från länk'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b98ee3e06ad8e014feeac5fc0604b56de59b353a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus hittar recept på koket.se och tasteline.com och vill inte skriva av dem. Servern måste hämta sidan säkert, bara från godkända sajter, och ge samma förhandsgranskning som för inklistrad text.

**Approach:** Modulen `settings` får tabellen `recipe_site` och `ensure_user_defaults()` (AD-21), som körs efter inloggning. Porten `src/server/fetch/safeFetch` hämtar sidor enligt AD-11. Importflödet från 1.6 får typen `url`: servern hämtar sidan, plockar ut JSON-LD och läsbar text och skickar båda till `parseRecipe`. Fliken Länk i arket blir standardflik.

## Boundaries & Constraints

**Always:** `safeFetch` är den enda kod som hämtar från receptsajter (AD-11): bara https, värden ska vara en godkänd domän eller dess `www.`-variant, inga IP-adresser, adressen kontrolleras vid själva anslutningen (inte bara vid en förhandsuppslagning, för att stoppa DNS-rebinding) mot privata, lokala, länklokala och reserverade intervall (IPv4 och IPv6), omdirigeringar följs manuellt med ny kontroll (högst 3), tidsgräns 10 s, högst 3 MB. Porten tar domänlistan som argument och importerar aldrig features eller Supabase (AD-1). JSON-LD används bara som indata till `parseRecipe` (AD-10, AD-11). Tabellen följer AD-4. Route Handlern behåller kontrollerna från 1.6 (ursprung, innehållstyp, storlek, behörighet) och skriver aldrig. Kör aldrig `supabase db reset`.

**Never:** Ingen hantering av sajtlistan i inställningarna (1.12); "Öppna inställningar" länkar bara dit. Ingen fotoimport (1.9). Inga riktiga nätverksanrop i `pnpm test`, integrationstester eller CI; de använder sparade sidor och falska uppslagningar. Ingen automatisk läsning av urklipp utan att Pontus trycker på en knapp.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Startdata | Första inloggningen | `recipe_site` har koket.se och tasteline.com, aktiva | Andra anropet ändrar inget |
| Godkänd länk | `https://www.koket.se/<recept>` | Sidan hämtas; JSON-LD och läsbar text till `parseRecipe`; förhandsgranskning med `sourceKind: url` och URL | N/A |
| Ej godkänd domän | `https://example.com/recept` | "example.com är inte en godkänd receptsajt." och "Öppna inställningar" | Ingen anslutning görs |
| http | `http://www.koket.se/…` | Avvisas som ogiltig länk | Ingen anslutning |
| IP-adress | `https://127.0.0.1/…`, `https://[::1]/…` | Avvisas | Ingen anslutning |
| Privat adress | Godkänd domän som pekar på 10.x, 192.168.x, 169.254.x, ::1, fc00::/7 | `fetch_blocked` | Stoppas vid anslutning |
| Omdirigering | Till samma domän / till annan domän / fler än 3 | Följs / `fetch_domain_not_allowed` / `fetch_blocked` | Ny kontroll varje steg |
| Långsam sajt | Inget svar inom 10 s | `fetch_timeout` och "Klistra in text i stället" | Byter till fliken Text med fokus i textfältet |
| Stor sida | Över 3 MB | `fetch_too_large` | Läsningen avbryts vid gränsen |
| Blockerad | HTTP 403/429/5xx eller annan innehållstyp än HTML | `fetch_blocked` och "Klistra in text i stället" | N/A |
| Inget recept | Sida utan recept | `import_no_recipe` och "Klistra in text i stället" | N/A |
| Klistra in | Knappen "Klistra in länk" | Urklippets text i fältet om webbläsaren tillåter | Annars händer inget |

</frozen-after-approval>

## Code Map

- `src/features/recipes/actions/import-recipe.ts`, `src/app/api/ai/import/route.ts`, `src/lib/ai-client.ts`, `src/features/recipes/ui/import-sheet.tsx` -- importflödet från 1.6 (`{ kind: "text" }`); utöka med `{ kind: "url", url }`
- `src/server/ai/service.ts` -- `parseRecipe({ text, jsonLd })`; gränsen 12 000 tecken gäller text + JSON-LD
- `src/features/recipes/domain/from-ai-recipe.ts` -- tar `source` (`{ kind: "url", url }`)
- `src/app/auth/confirm/route.ts`, `src/features/auth/actions/confirm-email-link.ts` -- anropa `ensure_user_defaults()` via `settings/server.ts` efter lyckad inloggning
- `supabase/migrations/*`, `tests/integration/support.ts` (`expectRlsIsolation`) -- mönster för migration och RLS-test
- `src/lib/errors.ts` -- lägg till `fetch_domain_not_allowed`, `fetch_blocked`, `fetch_timeout`, `fetch_too_large`, `fetch_invalid_url` med svenska texter; domänen skickas i `error.fields.domain`
- `cheerio` 1.2.0 (Stack) för att plocka ut JSON-LD och läsbar text
- Sparade sidor: hämta en receptsida från koket.se och en från tasteline.com en gång under utvecklingen till `tests/fixtures/sites/` (för eget bruk, bara som testindata)

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<tid>_settings.sql` -- `recipe_site` (`domain` unik per användare, `is_active` default true, `created_at`), RLS, policy och grants enligt AD-4; `ensure_user_defaults()` (`security invoker`, idempotent, `on conflict do nothing`) med koket.se och tasteline.com -- AD-4, AD-21
- [x] `src/lib/supabase/database.types.ts` -- `pnpm db:types` -- AD-5
- [x] `src/features/settings/domain/domain-name.ts` (+ test) -- Zod-schema som normaliserar en domän (gemener, utan schema, sökväg, port och `www.`; punycode via `URL`); `hostAllowed(host, domains)` -- AD-11
- [x] `src/features/settings/data/`, `src/features/settings/server.ts`, `src/features/settings/index.ts` -- `getActiveRecipeDomains()`, `ensureUserDefaults()` -- AD-1
- [x] `src/features/auth/actions/confirm-email-link.ts` -- efter lyckad verifiering anropas `settings.ensureUserDefaults()`; ett fel där loggas men stoppar inte inloggningen -- AD-21
- [x] `src/server/fetch/safe-fetch.ts` (+ test), `src/server/fetch/index.ts` -- `safeFetch(url, { allowedDomains, signal, lookup?, fetchImpl? })` enligt Boundaries; adressen kontrolleras i anslutningens uppslagning (t.ex. en undici-dispatcher med egen `lookup`), så att samma IP som kontrollerats är den som används; returnerar `{ url, html }` eller ett fel med kod -- AD-11
- [x] `src/server/fetch/extract.ts` (+ test) -- med cheerio: JSON-LD med `@type` Recipe (även i `@graph` och listor) som sträng, och läsbar text utan script, style, nav, header, footer, form och kommentarer; text och JSON-LD kortas så att summan ryms i AI-portens gräns -- AD-11
- [x] `tests/fixtures/sites/` -- en sparad receptsida från koket.se och en från tasteline.com; extract-testerna visar att båda ger JSON-LD Recipe och läsbar text -- AC
- [x] `src/features/recipes/actions/import-recipe.ts` -- `importRecipe({ kind: "url", url })`: domänlista från `settings`, `safeFetch`, `extract`, `parseRecipe({ text, jsonLd })`, matchning, `fromAiRecipe` med `{ kind: "url", url }` -- AD-10
- [x] `src/app/api/ai/import/route.ts`, `src/lib/ai-client.ts` -- schema `{ kind: "url", url }` (högst 2 048 tecken); statuskoder för de nya felen (422 för ej godkänd domän och ogiltig länk, 502 för blockerad/för stor, 504 för tidsgräns) -- AD-13
- [x] `src/features/recipes/ui/import-sheet.tsx` -- fliken Länk som standard: fält för länk, "Klistra in länk" (läser urklipp vid tryck), "Tolka"; felrutor enligt matrisen med "Öppna inställningar" eller "Klistra in text i stället" (byter flik och fokuserar textfältet) -- UX
- [x] `tests/integration/settings.test.ts` -- RLS för `recipe_site`; `ensure_user_defaults()` två gånger ger två rader -- AC
- [x] `tests/e2e/import.spec.ts` (utökad) -- mot den byggda servern med `AI_PROVIDER=mock` och en fejkad receptsajt: ej godkänd domän visar meddelandet utan nätverksanrop; godkänd länk ger förhandsgranskning med källan (sajten simuleras genom att importflödet i testläge får en `fetchImpl` via mockens fixturer, eller genom en lokal https-server, dokumentera valet) -- matrisen
- [x] `docs/oppna-fragor.md` (T1) -- hämta en receptsida från ica.se, arla.se och coop.se med `safeFetch` (eget skript i `scripts/`, körs för hand), notera resultatet per sajt (fungerar, blockeras, saknar receptdata) och lägg till de som fungerar i en ny migration som utökar `ensure_user_defaults()` -- AC
- [x] `README.md` -- avsnitt om `safeFetch`, godkända sajter och testsidorna -- dokumentation

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla utan nätverksanrop till riktiga sajter.
- Given LM Studio igång, when en riktig koket.se-länk importeras lokalt, then visas förhandsgranskningen (manuell kontroll, noteras i Implementation Notes).

## Implementation Notes

- **Anslutningskontroll:** `safeFetch` använder `node:https` med en egen `lookup` (i stället för en undici-dispatcher, så inget nytt paket behövs). Uppslagningen kontrollerar alla adresser och node ansluter till den adress som kontrollerats; `https-fetch.test.ts` visar att node använder adressen från uppslagningen och att en privat adress stoppar anslutningen. Alla adresser för en värd måste vara publika. Svar packas upp (gzip, deflate, br) och 3 MB räknas efter uppackning.
- **E2E-sajten (valet enligt Tasks):** med `AI_PROVIDER=mock` och en `SITE_URL` på localhost/127.0.0.1 får importflödet `fetchImpl` och `lookup` från `src/server/fetch/fixture-sites.ts`, som svarar med de sparade sidorna i `tests/fixtures/sites/` enligt `manifest.json` (ingen lokal https-server). Begäran går ändå genom `safeFetch` och alla kontroller. Felfallen (403, sida utan recept, tom sida, sajt som aldrig svarar, sida över 3 MB, omdirigering till annan sajt) ligger under `/matkoll-test/`. Testsidorna läses vid körning och spåras inte in i serverbygget. `settings_unavailable` kan inte uppstå av sig själv i E2E, så det testet simulerar svaret med `page.route`. Testsidornas text och JSON-LD är AI-mockens fall `koket-chow-mein` och `tasteline-bakad-fetaost`; `extract.test.ts` larmar om extraktionen glider. Ingen ny miljövariabel.
- **Nya felkoder utöver specen:** `settings_unavailable` (503) när sajtlistan inte går att läsa. Ett avbrott från anroparen ger `fetch_aborted` (499, loggas bara som info; klienten visar inget för avbrutna anrop). `fetch_blocked` och `fetch_timeout` bär också `fields.domain`, så texten blir "koket.se släppte inte in oss." / "… svarade inte i tid.".
- **Länk som inte är https eller är en IP-adress** ger `fetch_invalid_url` (422); en omdirigering till http eller en IP-adress ger `fetch_blocked`. Importschemat kontrollerar bara längden (högst 2 048), så att porten ger koden.
- **Källa:** utkastets `sourceUrl` är sidans adress efter omdirigeringar, och `imageUrl` tas från JSON-LD (bara https). Förhandsgranskningen visar "Källa: koket.se" och "Tillbaka till länken".
- **En inklistrad länk** räknas inte som osparad ändring (den är lätt att klistra in igen); inklistrad text gör det som förut.
- **Befintliga användare:** migrationen `*_settings_backfill_and_domain_labels.sql` ger alla användare som fanns startsajterna, skärper domänkontrollen till etiketter på högst 63 tecken och dokumenterar i funktionens kommentar att sajter stängs av och aldrig tas bort (beslutslogg 2026-10-25). `hostAllowed` är borttagen; regeln finns bara i `safeFetch`.
- **T1 (2026-10-25, `pnpm sites:probe`):** ica.se och arla.se fungerar (hämtning och JSON-LD Recipe, Qwen tolkar sidorna) och ligger nu i `ensure_user_defaults()` via `*_settings_more_recipe_sites.sql`. coop.se saknar receptdata (receptet byggs i webbläsaren). Resultatet står i `docs/oppna-fragor.md`.
- **Manuell kontroll med LM Studio (AC 2):** `https://www.koket.se/amaretto-sour` genom appen (dev-server, `AI_PROVIDER=lmstudio`) gav förhandsgranskningen "Amaretto sour", "Källa: koket.se", 4 rader, på 11 s. Längre recept tar för lång tid: koket.se chow mein (19 rader) 45 s, fiskgryta 49 s, ica.se 56 s, arla.se 41–45 s, mot AI-portens 45 s per försök (AD-9), så ungefär hälften ger `ai_unavailable`. **T4 hanterad:** AD-9 är uppdaterad och `defaultLimits` i `src/server/ai/run.ts` är nu 100 s per försök och 115 s totalt, och ett nytt försök startar bara om minst 20 s återstår (`minRetryMs`). Route Handlerns `maxDuration` är kvar på 120.
- **Extraktion:** JSON-LD görs mindre i steg (utan brus, korta listor, utan extrafält) och utelämnas hellre än kortas mitt i; texten får högst 2 000 tecken när JSON-LD har ingredienser och steg. Bara sidans ram tas bort (header, footer och nav utanför main/article, aside, role=banner/contentinfo/navigation, script, style, noscript, svg). Bilden följer `@id`, provar `url` och sedan `contentUrl` och faller tillbaka på `og:image`. Mockens `.txt` och `.jsonld.json` för de två sidorna är genererade på nytt.
- **Fixturer:** Qwen tog med underrubriken "Sås" som receptrad i chow mein; raden är borttagen ur mockens svar och `expected.json` räknar 19 rader. Tastelines Cloudflare-beacon är borttagen ur den sparade sidan eftersom dess publika token stoppas av gitleaks.
- Slutverifiering efter granskning: lint, typecheck, 942 Vitest, 69 integrationstester, build, 69 Playwright (`CI=1`).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | implementation | Qwen behöver 40–56 s för fulla recept; 45 s per försök ger `ai_unavailable` för hälften (T4) | high | Manuella körningar mot koket.se, ica.se, arla.se | patch (AD-9: 100 s per försök, 115 s totalt) |
| 2 | blind | Användare som loggade in före migrationen saknar sajter | medium | `ensure_user_defaults()` körs bara vid inloggning | patch (ny migration fyller i för befintliga användare) |
| 3 | blind | En borttagen standardsajt läggs tillbaka vid varje inloggning | medium | `on conflict do nothing` minns inte borttagning | patch (sajter stängs av, raderas inte; beslut loggat) |
| 4 | blind, verify | Testsidorna används så fort `AI_PROVIDER=mock`, även i en felkonfigurerad produktion; ingen test för riktig leverantör | high | `fetchRecipePage` kopplar två portar | patch (bara mock och lokal `SITE_URL`; `index.test.ts`) |
| 5 | blind, edge, verify | JSON-LD kapas mitt i en token | medium | `cut()` på enradig JSON | patch (strukturell förkortning eller ingen JSON-LD) |
| 6 | blind | Hela sidtexten skickas även när JSON-LD räcker | medium | Längre prompt, bidrar till T4 | patch |
| 7 | blind | Textutdragningen tar bort inbäddade header/form men behåller aside | medium | Titel och ingredienser kan ligga i `<article><header>`/`<form>` | patch |
| 8 | blind, edge | Bild hittas inte via `@id`, `og:image` eller `contentUrl`; lång bild-URL fäller utkastet | medium | `imageOf` läser få former | patch |
| 9 | blind, verify | `hostAllowed` är oanvänd dubblett av regeln i `safeFetch` | low | Ingen anropare | patch (ta bort) |
| 10 | blind, edge, verify | Domänkontrollen i databasen saknar 63-teckengräns per del | low | Motsäger kommentaren | patch (ny migration) |
| 11 | blind | Pontus egna avbrott loggas och svaras som `fetch_timeout` | medium | Brus i loggar, 504 | patch |
| 12 | verify | `httpsFetch` (uppackning, huvuden, statusar) körs aldrig i test | high | Alla tester byter `fetchImpl` | patch (`toFetchResponse` med tester för gzip/deflate/br/okänd/204 och 3 MB efter uppackning) |
| 13 | verify | Spärren "ingen text och ingen JSON-LD" nås aldrig | medium | Fixturen har text | patch (tom sida i fixturerna) |
| 14 | blind | `fetch_timeout`, `fetch_too_large` och `settings_unavailable` saknar e2e i arket | medium | Inga fixturvägar | patch |
| 15 | edge | Slutadress efter omdirigering över 2 048 tecken ger `ai_invalid` efter modellkörningen | medium | Bara indata kontrolleras | patch |
| 16 | blind, edge | Lång länk i urklipp kortas tyst | low | Direkt korrigering | patch |
| 17 | blind | "Öppna inställningar" hoppar över "Släng ändringarna?" | medium | Vanlig länk | patch |
| 18 | edge | Enter i länkfältet under läsning startar om; bekräftelse följer med till annan flik | low | Direkt korrigering | patch |
| 19 | edge | Synkront fel i svarshanteraren lämnar promise ohanterad | medium | Ingen try/catch | patch |
| 20 | edge | Teckenkodning med enkla citattecken eller `utf-16` i meta tolkas fel | low | Direkt korrigering | patch |
| 21 | edge | Felaktig länk när sajtlistan inte går att läsa ger `settings_unavailable` | low | Direkt korrigering (kontrollera syntax först) | patch |
| 22 | blind | "Öppna inställningar" leder till en tom sida tills 1.12 | low | 1.12 kommer i samma epic | avvisad |
| 23 | edge | `sites:probe --save` lämnar gamla fixturer kvar | low | Manuellt skript | avvisad |
| 24 | blind | Diffen saknar fixturerna; hela sidor checkas in | low | Uteslöts avsiktligt ur diffen; sidorna är testindata för eget bruk | avvisad |

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: `recipe_site` finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
