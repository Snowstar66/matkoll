---
title: 'Story 9.1: Veckans erbjudanden från butikens länk'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/docs/erbjudanden-lankar.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-1-valja-butik.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-8-importera-recept-fran-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-4-inkopslistan-i-nytt-utseende.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att Matkoll vet vad som är på erbjudande i butiken den här veckan utan att något skrivs av: "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." ICA:s erbjudandesida per butik har samma adress varje vecka, och en vanlig GET ger hela veckan som data (`docs/erbjudanden-lankar.md`). Det motsvarar FR-34 och FR-35.

**Approach:**
- Butiken i Inställningar får fältet "Länk till veckans erbjudanden" (`store.offers_url`). Bara ica.se:s erbjudandesidor godkänns. Pontus butik får länken ifylld.
- En ny modul, `offers`, med tabellen `store_offer` och Postgres-funktionen `save_store_offers` (AD-25).
- Server Action `fetchStoreOffers` hämtar sidan en gång per tryck med `safeFetch`, läser `window.__INITIAL_DATA__ → offers.weeklyOffers` deterministiskt utan `eval`, tar bara mat, kopplar till katalogen med `matchIngredients` och sparar för veckan.
- Arket Veckans erbjudanden öppnas från textknappen "Erbjudanden" i Inköpslistans rubrik. Det har "Hämta veckans erbjudanden" och visar erbjudandena i kategorier som Lagersaldo.
- 403, 429 och en sida som har ändrats ger ett besked med "Öppna sidan", aldrig ett nytt försök.

## Boundaries & Constraints

**Always:**
- `settings` äger `store.offers_url`. Länken kontrolleras bara i `settings/domain/offers-link.ts`: `OFFER_SITES` med värden `www.ica.se`, kedjan ICA och sökvägen `/erbjudanden/<slug>-<siffror>/` (avslutande `/` läggs till), https, ingen fråga, inget fragment och högst 300 tecken. Tabellens `check` gör samma grundkontroll (https, längd, inga blanktecken).
- `save_store` tar `offers_url`, och en saknad nyckel lämnar värdet orört. Migrationen fyller i länken för `chain = 'ICA'` och `external_store_id = '1003733'` när den är tom, och `ensure_user_defaults()` gör det för nya användare.
- `offers` äger `store_offer` (AD-1). Tabellen följer AD-4, AD-5, AD-20 och AD-25 som de står i epic-kontexten, med RLS-test, designtest och `label_key` som unik nyckel per butik och vecka.
- `save_store_offers(store, week, items, replace_source)` gör allt i en transaktion: kontroll av veckan, borttagning av butikens länkrader för veckan när `replace_source = 'link'`, `upsert` per `label_key`, gränsen 300 och borttagning av veckor som är slut. "Idag" räknas i `Europe/Stockholm`.
- `fetchStoreOffers({ storeId })` börjar med `requireUser()` och Zod. Butiken läses på servern, och klienten skickar aldrig adressen. Exakt ett anrop till `safeFetch` per tryck, med `OFFER_SITE_DOMAINS`, 10 s, 3 MB och `OFFERS_USER_AGENT`. 403 och 429 ger `offers_fetch_blocked` utan nytt försök.
- `parseIcaOfferPage(html)` i `offers/domain` är ren: den hittar `window.__INITIAL_DATA__ =`, läser objektet med en egen läsare som håller reda på strängar och klamrar, ersätter `undefined` och `new Map([...])` utanför strängar och tolkar med `JSON.parse`. Bara `offers.weeklyOffers` lämnas ut, varje post kontrollerad med Zod. Okänd form ger `offers_page_changed`.
- Bara kategorierna i `FOOD_CATEGORIES` sparas. De andra räknas i `skipped`.
- Veckan räknas med `weekOfValidTo` i `offers/domain/week.ts` (`now` som argument). Den måste vara den här eller nästa vecka, annars `offers_page_old`.
- `name` och `ingredient_id` kommer från `offerName` och ett anrop till `matchIngredients`. `commitIngredients` anropas aldrig.
- `publicAccessToken`, kakor, sessions-id och `env`-adresser sparas, returneras och loggas aldrig. Loggar har bara felkod och antal.
- `revalidateFor('store_offer')` → `/recept`, `/lista` och `/matsedel` (layout), och `store` får `/lista` och `/matsedel` (AD-18).
- Tester anropar aldrig ica.se: hämtningen går mot `tests/fixtures/sites/` via `fixture-sites.ts`. E2E-specen har den egna e2e-användaren `e2e-erbjudanden-lank@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen AI i hämtningen eller läsningen, inget `eval`, `Function` eller `vm`, och ingen hämtning av andra adresser på ica.se (inga interna API:er, ingen bladvisare).
- Ingen automatisk hämtning: inte vid sidladdning, inte på schema och inte vid fel.
- Ingen webbläsares User-Agent, inga `sec-ch-ua`-huvuden och inga kakor.
- Inga nya katalogingredienser eller synonymer.
- Ingen etikett på listposter (9.2), inget filter i Recept (9.3), inget "Fyll på lagret" (9.4) och ingen borttagning (9.9).
- Ingen påverkan på lagningsstatus, rangordning, inköpslistans poster eller exporten.
- Ingen riktig butiksdata i fixturer utöver strukturen. Varorna är påhittade.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Förifylld länk | Pontus butik Maxi ICA, 1003733, tom länk före migrationen | Länken är `https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/`. Butikskortet visar "Erbjudanden: ica.se" | N/A |
| Ändra länken | Pontus klistrar in en annan ICA-butiks erbjudandesida i arket Butik | Sparas. `?utm=…` och `#…` nekas, avslutande `/` läggs till | N/A |
| Fel adress | `https://www.willys.se/erbjudanden/butik` eller `https://www.ica.se/recept/…` | Under fältet: "Ange adressen till butikens erbjudanden på ica.se, till exempel …" Inget sparas | `validation` |
| Annan kedja | Butik med kedjan Willys | Fältet visas inte. "Länk stöds bara för ICA än så länge." | N/A |
| Öppna arket | Inköpslistan, "Erbjudanden" | Arket med "Maxi ICA Stormarknad Östersund · vecka 44, 26 okt–1 nov" och "Hämta veckans erbjudanden" | N/A |
| Hämta | Fixturen `ica-erbjudanden.html` med 9 poster, varav 2 inte mat | "Hämtar erbjudandena från ica.se …", sedan "Hämtade 7 erbjudanden för vecka 44." och raden "2 varor som inte är mat togs inte med." Erbjudandena står i kategorier | N/A |
| Fälten | Posten "Gårdens Herrgård®, Präst®" med `mechanicInfo` "89 kr/kg", `Stammis`, `Max 1 köp/hushåll`, `validTo` 22 nov | Raden "Gårdens Herrgård, Präst" och under "89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov" | N/A |
| Vara i katalogen | "Havets Laxfilé" och katalogen har "laxfilé" | Sparas med katalogingrediensens id och under Kött, fisk & chark | N/A |
| Vara utanför katalogen | "Gårdens Herrgård, Präst" | Sparas med `ingredient_id null`, `name` "herrgård" och avdelningen från ICA:s kategori. Katalogen är oförändrad | N/A |
| Hämta igen | 15 minuter senare, sidan har nu 8 poster på mat | Butikens länkrader för veckan ersätts. Erbjudanden från text eller foto står kvar | N/A |
| För tätt | "Hämta igen" efter 5 minuter | Ingen hämtning. "Erbjudandena hämtades nyss. Försök igen om en stund." | `offers_fetched_recently` |
| ICA nekar | Fixtursidan svarar 403, eller 429 | Ett anrop, inget nytt försök. Meddelanderutan med "Öppna sidan" | `offers_fetch_blocked` |
| Sidan har ändrats | Ingen `__INITIAL_DATA__`, eller en okänd konstruktion som `new Set(` | "Sidan med erbjudanden ser inte ut som Matkoll väntar sig. …" med "Öppna sidan" | `offers_page_changed` |
| Tom vecka | `weeklyOffers: []` | "Hittade inga erbjudanden på mat." | `offers_none` |
| Bara annat än mat | Alla poster i "Hem & fritid" | Som ovan | `offers_none` |
| Gammal sida | `validTo` i en vecka som är slut | Inget sparas | `offers_page_old` |
| För stor eller långsam | 4 MB, eller ingen svar på 10 s | "Det gick inte att hämta erbjudandena. Försök igen senare." | `offers_fetch_failed` |
| Omdirigering bort | Sidan omdirigerar till `https://www.ica.se/` | Startsidan har ingen data | `offers_page_changed` |
| Omdirigering till annan värd | Till `https://evil.example/` | Stoppas av `safeFetch` | `offers_fetch_failed` |
| Token i sidan | Fixturen har `publicAccessToken: "inte-en-riktig-nyckel"` | Strängen finns inte i svaret, i `store_offer` eller i loggarna | N/A |
| Ingen länk | Butik utan länk | Meddelanderutan "Lägg in länken till butikens erbjudanden under Butik i Inställningar." med "Öppna inställningar" | `offers_link_missing` |
| Ingen vald butik | `getSelectedStore()` ger `null` | Arket säger "Välj en butik i inställningarna först." | `offers_store_missing` |
| Annan användares butik | Förfalskat `storeId` | Ingen hämtning | `offers_store_missing` |
| Gränsen 300 | 295 sparade från text, 10 nya från länken | Inget sparas | `offers_limit` |
| Gamla veckor | Erbjudanden för en vecka som är slut | Tas bort vid sparandet | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut, felkoder, texter och e2e-användare
- `docs/erbjudanden-lankar.md` -- ICA-sidans form, fälten och felfallen
- `src/server/fetch/safe-fetch.ts`, `index.ts`, `fixture-sites.ts`, `tests/fixtures/sites/manifest.json` -- hämtningen och fixturerna
- `src/features/settings/domain/store.ts`, `data/stores.ts`, `actions/save-store.ts`, `ui/store-sheet.tsx`, `ui/store-settings.tsx`, `server.ts` -- butiken
- `supabase/migrations/*_settings_store*.sql` -- `store`, `save_store` och `ensure_user_defaults`
- `src/features/catalog/server.ts` (`matchIngredients`), `domain/normalize.ts`, `domain/categories.ts` (`displayCategory`) -- katalogen och kategorierna
- `src/components/` (Ark, Kategorirubrik, Listgrupp, Listrad, Meddelanderuta, kort bekräftelse) -- byggstenar från 11.1
- `src/app/(app)/lista/page.tsx`, `src/features/shopping/ui/` -- rubriken i Inköpslistan
- `src/lib/errors.ts`, `src/lib/revalidate.ts`, `src/lib/one-line.ts` -- fel, revalidering och enradstext
- `eslint.config.mjs` -- zonerna (AD-1) och `no-eval`
- `tests/integration/settings.test.ts`, `tests/design/`, `tests/e2e/support.ts`, `global-setup.ts` -- mönster

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_settings_store_offers_url.sql` (via `supabase migration new`) -- `store.offers_url` med `check`, `save_store` med `offers_url`, `ensure_user_defaults()` med länken för Maxi ICA och uppdateringen av befintlig butik med id 1003733 och tom länk -- FR-34, AD-21
- [ ] `supabase/migrations/<ts>_offers_store_offer.sql`, `src/lib/supabase/database.types.ts` -- tabellen, `label_key`, index, RLS, grants och `save_store_offers` enligt AD-25, med egna SQLSTATE-koder för vecka och gräns -- AD-4, AD-5, AD-25
- [ ] `src/features/settings/domain/offers-link.ts` (+ test), `store.ts`, `data/stores.ts`, `actions/save-store.ts` (+ test), `ui/store-sheet.tsx` (+ test), `ui/store-settings.tsx` -- `OFFER_SITES`, `OFFER_SITE_DOMAINS`, `parseOffersLink(url, chain)`, fältet, hjälptexten, felet och raden "Erbjudanden: ica.se" -- FR-34, UX-DR19
- [ ] `src/server/fetch/safe-fetch.ts` (+ test), `index.ts` -- valet `userAgent`, med `OFFERS_USER_AGENT` bredvid receptimportens. Inga andra huvuden ändras. Ett test visar att `Set-Cookie` aldrig skickas tillbaka -- AD-11
- [ ] `tests/fixtures/sites/ica-erbjudanden.html`, `ica-erbjudanden-utan-data.html`, `ica-erbjudanden-tom.html`, `ica-erbjudanden-gammal.html`, `manifest.json` -- påhittade varor med ICA:s struktur, en påhittad token, `undefined` och `new Map([])`, och sidor för 403, 429 och en för stor sida -- NFR-10
- [ ] `src/features/offers/domain/week.ts` (+ test) -- veckofunktionerna med `weekOfValidTo`. Testerna täcker sommartid, årsskifte, vecka 53 och söndag 23.59 -- AD-25
- [ ] `src/features/offers/domain/ica-offer-page.ts` (+ test) -- `parseIcaOfferPage(html): Result<{ offers: IcaOffer[]; skipped: number }>` och `FOOD_CATEGORIES`. Testerna har ett `}`, `undefined` och `new Map(` inuti strängar, en okänd konstruktion, ingen data, tom lista, en post med fel form (lämnas ute) och token. Ett test söker i filen efter `eval(`, `Function(` och `vm` -- NFR-10
- [ ] `src/features/offers/domain/offer-name.ts` (+ test), `offer.ts` (+ test), `index.ts` -- `offerName(details)`, `toOfferDraft`, ICA-kategori till avdelning, gränserna (`maxOfferLabelChars` 120, `maxOfferNameChars` 100, `maxOfferPriceChars` 40, `maxOfferNoteChars` 80, `maxOffersPerWeek` 300) och texterna (`offersFetchedText`, `offersSkippedText`, `offerMetaText`, `fetchedAtText`) -- FR-34
- [ ] `src/features/offers/data/` (`client.ts`, `queries.ts`, `save.ts`) (+ tester), `server.ts` -- `getActiveOffers(storeId)` (veckan som inte är slut, utan erbjudanden vars `valid_to` har passerat), `listOffers(storeId, weekStart)`, `getLastFetch(storeId)` och `saveOffersIn`, som översätter SQLSTATE till `offers_week_invalid`, `offers_limit` och `offers_failed` -- AD-25
- [ ] `src/features/offers/actions/fetch-store-offers.ts` (+ test) -- flödet i epic-kontexten. Testerna använder fixtursajterna och visar ett anrop per tryck, inget nytt försök vid 403 och 429, ingen token i svar och loggar, och felkoderna -- FR-34, NFR-10
- [ ] `src/lib/errors.ts` (+ test) -- felkoderna och texterna för 9.1
- [ ] `src/lib/revalidate.ts` (+ test) -- `store_offer` och de nya rutterna för `store` -- AD-18
- [ ] `eslint.config.mjs` -- `offers` får importera `src/server/fetch`, och `no-eval`, `no-new-func` och `no-implied-eval` gäller hela `src/` -- AD-1
- [ ] `src/features/offers/ui/offers-sheet.tsx` (+ test), `offers-list.tsx` (+ test), `fetch-offers-button.tsx` -- arket enligt EXPERIENCE.md, med förlopp, notiser, "Öppna sidan" (`target="_blank"`, `rel="noopener noreferrer"`), kategorier och listrader. Formulär med `useActionState` -- FR-35, UX-DR19, UX-DR20
- [ ] `src/app/(app)/lista/page.tsx`, `src/features/shopping/ui/` (+ test) -- sidan läser vald butik och erbjudandena inuti `<Suspense>` och skickar arkets knapp som slot till rubriken. `shopping/ui` importerar aldrig `offers` -- AD-1
- [ ] `tests/integration/offers.test.ts` -- RLS för `store_offer`, `save_store_offers` (ersätt länk, sammanslagning per `label_key`, gränsen 300, vecka som är slut, vecka för långt fram, gamla veckor, en annan användares butik) och `store.offers_url`
- [ ] `tests/design/offer-checks.test.ts` -- längdgränser, avdelningar, `source` och `FOOD_CATEGORIES` mot domänen
- [ ] `tests/e2e/offers-link.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare. Före varje test tar service role bort användarens erbjudanden och sätter butikens länk till fixtursidan. Testerna kontrollerar länken i Inställningar, hämtningen och arket, "Hämta igen" för tätt, 403 och en sida utan data -- matrisen
- [ ] `docs/oppna-fragor.md` (T13, T14), `docs/beslutslogg.md` -- det manuella provet mot ica.se enligt epic-kontexten och en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): länken sparas direkt, utan granskning.** Ingen AI tolkar sidan, och trycket "Hämta" är Pontus beslut. Fel varor tas bort i 9.9.
- **Beslut (förslag): en hämtning ersätter butikens länkrader för veckan.** Sidan är hela sanningen för veckan. Text och foto läggs till i stället, eftersom de kan vara en sida i taget.
- **Beslut (förslag): unik på `label_key` i stället för på `name`.** ICA har ofta två erbjudanden på samma vara från olika märken, och båda ska synas i listan.
- **Beslut (förslag): veckan kommer från det vanligaste `validTo`.** Sidan har inget från-datum, och några erbjudanden gäller flera veckor.
- **Beslut (förslag): 15 minuter mellan hämtningar.** Det skyddar mot dubbeltryck och ligger långt under ICA:s gräns (72 per minut). Tiden räknas från den senaste länkraden, så ingen ny tabell behövs.
- **Risk: ICA nekar Matkolls User-Agent (T13).** Förstudien hämtade med en webbläsares User-Agent, och Matkoll låtsas aldrig vara en webbläsare. Nekar ICA, byggs 9.7 direkt efter den här storyn.
- **Risk: sidans form ändras.** Läsaren validerar med Zod och misslyckas hellre tydligt än gissar. Fixturen visar formen som den var vecka 44.
- **Risk: få erbjudanden kopplas till katalogen (T14).** ICA:s namn är ofta produktnamn ("Herrgård"). Mätningen avgör om 9.10 byggs.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: arket, kategorierna och raderna radbryts utan vågrät scroll, också med ett namn på 120 tecken.
- Med VoiceOver: förloppet och "Hämtade 7 erbjudanden för vecka 44." läses upp, kategorierna är rubriker och "Öppna sidan" säger att den öppnas i en ny flik.
- Ett tryck på "Hämta veckans erbjudanden" mot Pontus riktiga butik, en gång, med appens User-Agent. Status, antal, antal som inte var mat och antal kopplade skrivs i T13 och T14.
