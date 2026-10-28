# Epic 9 Context: Veckans erbjudanden

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Version 1.2. Matkoll hämtar veckans erbjudanden från butikens egen erbjudandesida, med en länk per butik som Pontus sparar i Inställningar. Erbjudandena används där de gör nytta: som en etikett på inköpslistan ("Falukorv 29 kr"), som filtret "Erbjudanden" i Recept, som "Fyll på lagret" för basvaror, i AI-förslagen och i ett förslag till veckans matsedel. Där det inte finns någon länk klistrar Pontus in texten eller fotograferar reklambladet.

Pontus egna ord, 2026-10-26: "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." Pontus valde sedan funktionerna ur en lista och godkände rekommendationen i stort: etiketten på inköpslistan, filtret i Recept, "Fyll på lagret", AI-förslag med erbjudanden och en föreslagen veckomeny. Bevakningar med aviseringar väntar.

Det motsvarar UJ-7 och Flöde 7 i EXPERIENCE.md, och kraven FR-34–FR-36, FR-51–FR-54 och NFR-10 i PRD-addendumet ("Version 1.2: Veckans erbjudanden"). Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden-v2.md`, som ersätter den första planen (`…-erbjudanden.md`). Arkitekturen står i AD-25 och i tillägg till AD-1, AD-9, AD-11, AD-15, AD-18, AD-24 och AD-28. Förstudien om länkar står i `docs/erbjudanden-lankar.md`.

**Förstudien i korthet:**

- **ICA fungerar.** Adressen `https://www.ica.se/erbjudanden/<slug>-<butiks-id>/` är densamma varje vecka. En vanlig GET ger hela veckan i `window.__INITIAL_DATA__ → offers.weeklyOffers`.
  - Pontus butik, Maxi ICA Stormarknad Östersund (butiks-id 1003733, `chain = 'ICA'` i `store`), hade 213 erbjudanden vecka 44.
  - 122 av dem var inte mat ("Hem & fritid").
- **Willys, Hemköp, Coop och Lidl** har ingen länk som går att läsa utan JavaScript. Där gäller text och foto.

**Byggordning:** Epic 9 byggs efter Epic 12, på grenen `epic/9-erbjudanden-v2`, som utgår från `epic/12-asynkron-ai`. Namnen är då Lagersaldo och Inköpslista (10.4), komponenterna från 11.1 finns (Kategorirubrik, Listgrupp, Listrad, Soptunna, Mätare, Receptkort, Rättkort), och AI-flödena är jobb i en kö (AD-28). Rutterna (`/recept`, `/matsedel`, `/lista`, `/hemma`, `/installningar`) är desamma.

- 9.1–9.4 behöver bara Epic 11. De kan byggas före Epic 12 om Pontus vill få nyttan tidigare.
- 9.5–9.8 och 9.10 behöver AI-jobben från 12.4, och 9.5–9.6 det kortare svaret från 12.3.

Epicen bygger på det som redan finns:

- butikerna i `settings` (7.1): `store` med `chain`, `external_store_id` och `is_selected`, `getSelectedStore()`, `listStores()`, `save_store` och arket Butik;
- hämtningsporten `src/server/fetch/` (AD-11): `safeFetch` med domänkontroll, DNS-kontroll, omdirigeringar, 10 s och 3 MB, och `fixture-sites.ts` med `tests/fixtures/sites/manifest.json` för tester;
- den skrivfria katalogmatchningen `matchIngredients` och `normalizeIngredientText` (AD-6), och kategorierna `displayCategory(section, name)` (AD-12, Epic 11);
- inköpslistan (`computeList`, `ShoppingLine`, `addCustomItem`, produktvalen) och dess nya utseende (11.4);
- receptbiblioteket med filterpillren och receptkorten (5.1, 11.5) och matsedeln med rättkorten (11.5);
- AI-porten (`suggestDishes` med det kompakta svaret från 12.3, `runStructured`, mocken och `pnpm eval:ai`) och AI-jobben (`ai-jobs`, `POST /api/ai/jobs`, `/api/ai/jobs/photo`, `runAiJob`, `useAiJobs()`) från 12.4–12.6;
- lagret per ställe (AD-24) och `getPantrySnapshot()`.

## Stories

- Story 9.1: Veckans erbjudanden från butikens länk
- Story 9.2: Erbjudanden på inköpslistan
- Story 9.3: Filtret Erbjudanden i Recept
- Story 9.4: Fyll på lagret
- Story 9.5: AI-förslag med veckans erbjudanden
- Story 9.6: Veckans matsedel från erbjudanden och lagret
- Story 9.7: Erbjudanden från inklistrad text
- Story 9.8: Erbjudanden från foto av reklambladet
- Story 9.9: Ta bort erbjudanden
- Story 9.10: AI kopplar fler erbjudanden till katalogen (byggs bara om mätningen i 9.1 visar att det behövs)

Ordningen ger nyttan tidigt. Länken (9.1) gör att Matkoll har erbjudandena utan att Pontus gör något, och de tre användningarna utan AI (9.2–9.4) kommer före AI-flödena (9.5–9.6). Text och foto (9.7–9.8) är reserver för kedjor utan länk och för veckor då ICA nekar. **Om provet i 9.1 visar att ica.se nekar Matkolls ärliga User-Agent (T13) byggs 9.7 direkt efter 9.1**, eftersom text då är den enda vägen in.

## Bindande beslut

- **Länken per butik, beslutad av Pontus.** Den första planens beslut "ingen länk i 1.2" gäller inte längre. Pontus sparar adressen till butikens erbjudandesida i Inställningar, under butiken. Matkoll hämtar sidan när Pontus trycker på "Hämta veckans erbjudanden", aldrig av sig själv.
- **Bara godkända erbjudandesajter.**
  - Listan `OFFER_SITES` är fast i koden (`settings/domain/offers-link.ts`), skild från receptsajterna, och Pontus kan inte ändra den. I 1.2 finns en sajt: `www.ica.se`, för kedjan ICA, med sökvägen `/erbjudanden/<slug>-<siffror>/`.
  - En erbjudandesajt läggs aldrig till i `recipe_site`, och receptsajterna används aldrig för erbjudanden (AD-11).
- **Hämtningen är ärlig och sparsam.**
  - Högst en hämtning per tryck, med `safeFetch` och dess kontroller (https, domän, DNS, högst 3 omdirigeringar, 10 s, 3 MB).
  - User-Agent `Mozilla/5.0 (compatible; Matkoll/1.0; +weekly offers for personal use)`, i samma form som receptimportens. Inga andra huvuden som får Matkoll att se ut som en webbläsare: ingen `sec-ch-ua`, ingen webbläsares User-Agent, inga kakor.
  - Ett 403 eller 429, eller en sida utan erbjudandedata, ger en reserv (felkod och "Öppna sidan") och aldrig ett nytt försök.
  - En ny hämtning för samma butik nekas i 15 minuter efter en lyckad (`offers_fetched_recently`).
- **Sidan läses deterministiskt, aldrig med AI och aldrig med `eval`.**
  - `offers/domain/ica-offer-page.ts` letar upp `window.__INITIAL_DATA__ =` i ett `<script>`, plockar ut objektet med en egen läsare som håller reda på strängar och klamrar, och gör om de kända konstruktionerna utanför strängar: `undefined` → `null`, `new Map([...])` → listan.
  - Resultatet tolkas med `JSON.parse`. En okänd konstruktion ger `offers_page_changed`.
  - `eval`, `Function`, `vm` och liknande används aldrig. ESLint (`no-eval`, `no-new-func`, `no-implied-eval`) och ett test som söker i filen visar det.
- **Bara erbjudandena läses, och inget annat sparas eller loggas.**
  - Läsaren tar bara `offers.weeklyOffers`, och varje post kontrolleras med Zod. Sidans HTML och resten av objektet kastas direkt efter läsningen.
  - `publicAccessToken`, kakor, sessions-id och interna API-adresser i `env` används aldrig, sparas aldrig och loggas aldrig. Fixturen har en påhittad token, och ett test visar att den inte finns i resultatet, i databasen eller i loggarna.
  - Loggar har bara felkod och antal, aldrig adressen, varor eller priser.
- **Bara mat.** Erbjudanden i ICA:s kategorier för mat och dryck behålls: Färskvaror, Mejeri, Frukt & Grönt, Bröd, Skafferivaror, Djupfryst och Dryck. Allt annat, till exempel "Hem & fritid" och "Hälsa & skönhet", hoppas över och räknas ("122 varor som inte är mat togs inte med."). Listan `FOOD_CATEGORIES` står på ett ställe.
- **Tester anropar aldrig en butik.** Hämtningen i tester, e2e och CI går mot sparade sidor via `src/server/fetch/fixture-sites.ts`. Fixturen `tests/fixtures/sites/ica-erbjudanden.html` har ICA:s struktur och fältnamn, men påhittade varor (märken som "Gårdens" och "Havets"). Den har ett `Stammis`-erbjudande, ett med `Max 1 köp/hushåll`, ett `Köp 3 betala för 2`, ett som inte är mat, ett som gäller längre än veckan, `undefined` och `new Map([])`. Felfallen har egna sidor: ingen data, tom `weeklyOffers`, 403, 429 och en för stor sida.
- **Länken sparas direkt, utan granskning.** Ingen AI tolkar sidan, och trycket "Hämta" är Pontus beslut. En hämtning ersätter butikens tidigare hämtade erbjudanden för veckan (`source = 'link'`). Erbjudanden som Pontus har lagt in med text eller foto står kvar.
- **AI bara där den behövs.**
  - Katalogkopplingen för länken är deterministisk: `matchIngredients` på varans namn och delar av namnet.
  - Text och foto (9.7, 9.8) läses med `extractOffers` i ett AI-jobb, med granskning före sparande, som i den första planen.
  - AI för att koppla fler erbjudanden till katalogen (9.10) byggs bara om mätningen i 9.1 visar att för få kopplas (T14).
- **Ett erbjudande gäller en butik och en vecka.**
  - Veckan är måndag–söndag i svensk tid och lagras som måndagens datum. Bara den här och nästa vecka går att spara.
  - För länken är veckan den som innehåller det vanligaste `validTo`.
  - Ett erbjudande som slutar före veckans slut, eller gäller längre, sparar sitt `valid_to`. Ett erbjudande vars `valid_to` har passerat används inte.
- **Veckans erbjudanden är den senaste veckan som inte är slut**, för vald butik, som i den första planen. Veckor och butiker blandas aldrig. Veckor som är slut används aldrig och tas bort vid nästa sparande.
- **Erbjudanden skapar aldrig katalogingredienser.** Undantaget är 9.10: en koppling som Pontus bekräftar sparas som synonym med `commitIngredients`, så att samma vara hittas utan AI nästa vecka.
- **Erbjudanden ändrar inget annat.** Lagningsstatus, "Kan lagas nu", inköpslistans poster och mängder, exporten och lagret läser aldrig erbjudanden. Det enda som skrivs utanför `offers` är en egen vara i inköpslistan när Pontus trycker "Lägg på listan" (9.4), med den befintliga `addCustomItem`.
- **Matkoll lovar aldrig att något blir billigare.** Priser visas som butiken skrev dem ("2 för 119 kr", "89 kr/kg", "Stammis") och räknas aldrig om eller jämförs.

## Requirements & Constraints

- **Länken (FR-34, 9.1):**
  - `store.offers_url` (`text`, valfri), ägs av `settings`.
  - `check`: https, högst 300 tecken och inga blanktecken.
  - `settings/domain/offers-link.ts` kräver värden `www.ica.se`, sökvägen `/erbjudanden/<slug>-<siffror>/` (avslutande `/` läggs till), ingen fråga och inget fragment, och kedjan ICA.
  - För andra kedjor visas fältet inte. I stället står "Länk stöds bara för ICA än så länge."
  - `save_store` tar `offers_url`. Saknas nyckeln står värdet kvar (1.0-koden skickar den inte).
  - Migrationen fyller i `https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/` för en butik med `chain = 'ICA'`, `external_store_id = '1003733'` och tom länk, och `ensure_user_defaults()` gör samma sak för nya användare.
- **Hämtningen (9.1):**
  - Server Action `fetchStoreOffers({ storeId })`. Klienten skickar bara butikens id, aldrig adressen.
  - Fel:
    - `offers_link_missing` (ingen länk);
    - `offers_link_unsupported` (inte en godkänd sajt);
    - `offers_fetched_recently`;
    - `offers_fetch_blocked` (403, 429);
    - `offers_fetch_failed` (tidsgräns, för stor, nätfel, annan status);
    - `offers_page_changed` (ingen data eller okänd form);
    - `offers_page_old` (veckan är slut eller ligger längre fram än nästa vecka);
    - `offers_none` (inga erbjudanden på mat).
  - Svaret har antalet sparade, antalet som inte var mat, antalet som kopplades till katalogen och veckan.
- **Datamodellen (AD-25):** `store_offer` och `save_store_offers` enligt Technical Decisions. Högst 300 erbjudanden per butik och vecka (`offers_limit`). En vecka på Maxi hade 91 erbjudanden på mat.
- **Se erbjudandena (FR-35, 9.1):**
  - Arket Veckans erbjudanden öppnas från textknappen "Erbjudanden" i Inköpslistans rubrik och, från 9.3, från raden i filtret Erbjudanden.
  - Erbjudandena står i kategorier som i Lagersaldo (Kategorirubrik, Listgrupp, Listrad). Raden visar namnet som butiken skrev det och raden under med pris och villkor ("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov").
- **Etiketten på inköpslistan (FR-51, 9.2):**
  - En listpost får erbjudandeetiketten ("Falukorv 29 kr") när ett aktivt erbjudande i vald butik har samma katalogingrediens. En post utan katalogingrediens, eller en egen vara, får den när namnen är lika efter normalisering.
  - Ett erbjudande per post: det första i bladets ordning. Listpostdetaljen visar alla erbjudanden för varan.
- **Filtret Erbjudanden (FR-52, 9.3):**
  - Ett fjärde filterpiller, "Erbjudanden", efter "Kan lagas nu". Det visar recept där minst en huvudvara är på erbjudande, flest först och sedan minst saknat.
  - En huvudvara är en receptrad som inte är vag och har en katalogingrediens vars kategori inte är Såser & smaksättare.
  - Kortet visar upp till två erbjudandeetiketter och "+N".
- **Fyll på lagret (FR-53, 9.4):**
  - Överst i arket, rubriken "Fyll på lagret": erbjudanden på basvaror.
  - En basvara är en katalogingrediens som finns i lagret på något ställe just nu (också obegränsad) eller har ett produktval i butiken.
  - Raden säger var varan finns ("Finns i Hemma, inte i Stugan", med ett ställe "Finns hemma" eller "Finns inte hemma", och utan lager "Du brukar köpa Gevalia").
  - "Lägg på listan" lägger varan som egen vara på inköpslistan.
  - Kvittona i `pantry_addition` har ingen vara och tas bort efter 30 dagar, så de går inte att använda (öppen fråga 27).
- **AI-förslag (FR-36, 9.5):**
  - Jobbet `suggest` läser vald butik och veckans erbjudanden. Högst 40 varunamn och 1 000 tecken går till modellen, aldrig priser.
  - Förslagen får erbjudandeetiketter.
  - Utan erbjudanden är meddelandet exakt som efter 12.3.
- **Veckans matsedel (FR-54, 9.6):**
  - Ett nytt AI-jobb, `weekplan`. Det föreslår fem rätter (öppen fråga 28): i första hand recept ur biblioteket och högst två nya rätter, med erbjudanden och lagret.
  - Pontus väljer vilka som läggs på matsedeln. Nya rätter sparas via förhandsgranskningen som andra AI-förslag.
- **Text och foto (FR-34, 9.7, 9.8):**
  - AI-jobbet `offers` med `extractOffers`, som i den första planen. Text högst 12 000 tecken, högst 40 erbjudanden per inläsning, foto som en plats (2048 px, 1,5 MB).
  - Granskning före sparande. Inläsningarna läggs ihop per vara.
  - En text som bara är en adress till en ICA-erbjudandesida ger `offers_link`, med en knapp till Inställningar.
- **Ta bort (FR-35, 9.9):** grå soptunna per rad med "Ångra" (samma id, AD-20) och "Ta bort alla" med "Ångra". En borttagning ur länken kommer tillbaka vid nästa hämtning.
- **Ingen ny miljövariabel och ingen ändring av CI.**
- **Plattform:**
  - Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och med tangentbord (NFR-12).
  - Tryckytorna är minst 44 × 44 px, och inmatningsfält har minst 16 px text. Allt är på svenska.
  - Inget rött, inga skuggor och ingen emoji utanför kategoriplattorna.

## Technical Decisions

- **Moduler (AD-1, AD-25):**
  - `offers` (`src/features/offers/{ui,actions,domain,data}`, `index.ts`, `server.ts`) äger `store_offer`. Ingen annan modul läser eller skriver tabellen.
  - `offers/server.ts` exporterar `getActiveOffers(storeId)`, `listOffers(storeId, weekStart)` och `getLastFetch(storeId)` (React `cache`), och serverfunktionerna för jobben (`readOffers`, 9.7).
  - `offers/index.ts` exporterar typerna och `domain`: `week.ts`, `offer.ts` (texter, gränser, scheman), `ica-offer-page.ts`, `offer-name.ts`, `matching.ts` (`offersForLines`, `offersInRecipe`, `isMainLine`, `staplesOnOffer`) och `chip.ts` (`offerChip`).
  - `offers` läser butiken via `settings/server.ts` (`listStores`, `getSelectedStore`), katalogen via `catalog/server.ts` (`matchIngredients`) och hämtar via `src/server/fetch` (`safeFetch`). Det är den enda modulen utöver `recipes` som får importera `src/server/fetch` (ESLint-zon).
  - Sidorna sätter ihop (route → ui):
    - `/lista` läser erbjudandena och skickar etiketterna per listnyckel till `shopping/ui`;
    - `/recept` skickar etiketterna per recept till `recipes/ui`;
    - `/matsedel` renderar veckomenyn.
  - `shopping/ui`, `recipes/ui` och `mealplan/ui` importerar aldrig `offers`. Komponenten `OfferChip` ligger i `src/components/offer-chip.tsx`.
  - `pantry/server.ts` får `listStockedSites(ingredientIds)` för 9.4 (AD-24, tillägg). `shopping/server.ts` har redan produktvalen.
- **Datamodell (AD-4, AD-5, AD-20, AD-25):**
  - `store.offers_url` enligt ovan, i `settings` migration.
  - `store_offer`, med `id`, `user_id`, `store_id`, `week_start`, `label`, `label_key`, `name`, `ingredient_id`, `section`, `price`, `note`, `member_only`, `valid_to`, `source` och `created_at`:
    - `store_id` refererar `store (id, user_id)` och `ingredient_id` (valfri) refererar `ingredient (id, user_id)`, båda med `on delete restrict`.
    - `check`:
      - `extract(isodow from week_start) = 1`;
      - `label` 1–120 tecken och `name` 1–100 tecken;
      - `price` `null` eller 1–40 tecken, och `note` `null` eller 1–80 tecken;
      - `section` i avdelningarna (AD-12);
      - `source` i `('link', 'text', 'photo')`;
      - inga radbrytningar.
    - `label_key` är en genererad kolumn (`lower(label)` med enkla mellanslag). Unik på `(user_id, store_id, week_start, label_key)`, med indexet `(user_id, store_id, week_start)`. Två erbjudanden på falukorv från olika märken är två rader.
    - RLS med `user_id = (select auth.uid())`, `revoke all`, sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`, och ett RLS-test.
  - `save_store_offers(store uuid, week date, items jsonb, replace_source text default null)` är `security invoker` och körs i en transaktion. Den
    - nekar en vecka som är slut eller ligger längre fram än nästa vecka;
    - tar, med `replace_source = 'link'`, först bort butikens länkrader för veckan;
    - lägger till eller uppdaterar per `label_key`;
    - nekar fler än 300 per butik och vecka;
    - tar bort användarens erbjudanden för veckor som är slut.

    "Idag" räknas i `Europe/Stockholm`. Egna SQLSTATE-koder för vecka och gräns, som pantry-funktionerna. Returnerar antalet för butiken och veckan.
  - Migrationer skapas med `supabase migration new`. Typerna genereras om med `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`. Kör aldrig `supabase db reset`.
- **Veckor:**
  - Bara `offers/domain/week.ts` räknar veckor, med `Intl` och `Europe/Stockholm`, och tar `now` som argument.
  - Funktionerna är `weekStartOf`, `isWeekOver`, `importWeekDefault`, `weekOfValidTo(dates)`, `weekLabel` ("vecka 45, 4–10 nov") och `weekPillLabel` ("Vecka 45").
- **Hämtningen och läsningen (AD-11, AD-25):**
  - `safeFetch(url, { allowedDomains: OFFER_SITE_DOMAINS, signal, userAgent: OFFERS_USER_AGENT })`. Konstanten för User-Agent ligger i `src/server/fetch/` bredvid receptimportens.
  - `fetchStoreOffers` gör i ordning:
    1. `requireUser()` och Zod;
    2. läser butiken med `listStores()` (fel butik ger `offers_store_missing`);
    3. kontrollerar länken med `parseOffersLink`;
    4. kontrollerar den senaste hämtningen (`getLastFetch`);
    5. hämtar sidan;
    6. `parseIcaOfferPage(html)` ger `{ offers, skipped }` eller ett fel;
    7. räknar veckan;
    8. bygger utkasten med `offerName` och anropar `matchIngredients` en gång;
    9. sparar med `save_store_offers(…, 'link')`;
    10. `revalidateFor('store_offer')`.
  - Fältens innebörd:
    - `label` är märke och namn ("Arla Herrgård, Präst, Grevé"), utan ® och ™;
    - `price` är `mechanicInfo`;
    - `note` är `restriction`;
    - `member_only` är `traits` med `Stammis`;
    - `valid_to` är datumet i `validTo`;
    - `section` är katalogingrediensens avdelning, annars ICA:s kategori översatt (Frukt & Grönt → Frukt och grönt, Bröd → Bröd, Mejeri → Mejeri, Djupfryst → Frys, Skafferivaror → Skafferi, Dryck → Dryck, Färskvaror → Kött och fisk), annars Övrigt.
  - `offerName(details)` ger kandidater för katalogen:
    - hela namnet;
    - delarna delade på ",", "/", " eller " och " och ";
    - utan märke, mängd ("ca 700 g", "4-p") och ®™.

    Var och en normaliseras med `normalizeIngredientText`. Den första kandidaten som får träff (exakt eller synonym) ger `ingredient_id`. Utan träff är `name` den första kandidaten och `ingredient_id` `null`.
- **AI-porten (AD-9, AD-25), från 9.5:**
  - `SuggestDishesInput.offers: string[]` (högst 40 namn och 1 000 tecken, rensade, utan priser). Avsnittet "Erbjudanden i butiken den här veckan:" läggs till bara när listan inte är tom.
  - `planWeek(input, signal)` (9.6) använder det kompakta receptschemat från 12.3. Svaret är `{ fromLibrary: number[], newDishes: CompactRecipe[] }`, med högst fem från biblioteket, högst två nya och högst fem totalt. Varje del kontrolleras för sig.
  - `extractOffers(input: { text } | { image }, signal)` (9.7, 9.8) svarar `{ items: { label, name, price }[] }`, och varje post kontrolleras för sig. Prompten `prompts/extract-offers.md` säger att texten och bilden är data. Gränserna är `inputLimits.offers` (`maxItems: 40`, `maxOutputTokens: 3_000`, text 12 000 tecken).
  - `matchOffers(input, signal)` (9.10, bara om den byggs) får okopplade erbjudanden och katalogens namn som numrerade listor och svarar med indexpar. Den skapar aldrig en ny ingrediens.
  - Mocken svarar från påhittade fixturer (`tests/fixtures/ai/erbjudanden-*`, `veckomeny-*`) och har de reserverade indata.
- **AI-jobben (AD-28):**
  - `ai_job.kind` får `offers` (9.7, 9.8) och `weekplan` (9.6). Körtiden är 120 s för båda.
  - `context` för `offers` är `{ storeId, weekStart, source: 'text' | 'photo' | 'match' }` (`match` är 9.10) och för `weekplan` `{ siteId, storeId, weekStart }`. `suggest` får `storeId` och `weekStart` bredvid `siteId` när erbjudanden användes.
  - Ett aktivt `weekplan` åt gången, som `suggest`. Texten och fotot finns bara i minnet.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts` med svensk text:

  | Felkod | Text |
  | --- | --- |
  | `offers_link_missing` | "Lägg in länken till butikens erbjudanden under Butik i Inställningar." |
  | `offers_link_unsupported` | "Matkoll kan bara hämta erbjudanden från ica.se än så länge." |
  | `offers_fetched_recently` | "Erbjudandena hämtades nyss. Försök igen om en stund." |
  | `offers_fetch_blocked` | "ica.se släppte inte in Matkoll just nu. Öppna sidan och titta där, eller försök igen senare." |
  | `offers_fetch_failed` | "Det gick inte att hämta erbjudandena. Försök igen senare." |
  | `offers_page_changed` | "Sidan med erbjudanden ser inte ut som Matkoll väntar sig. Öppna sidan och titta där." |
  | `offers_page_old` | "Sidan visar inte den här eller nästa veckas erbjudanden." |
  | `offers_none` | "Hittade inga erbjudanden på mat." |
  | `offers_store_missing` | "Välj en butik i inställningarna först." |
  | `offers_week_invalid` | "Veckan är slut. Välj en annan vecka och spara igen." |
  | `offers_limit` | "Du kan ha högst 300 erbjudanden per vecka. Ta bort några först." |
  | `offers_failed` | "Det gick inte att spara erbjudandena. Försök igen." |
  | `offers_unavailable` | "Det gick inte att läsa erbjudandena." |
  | `offers_text_too_long` (9.7) | "Texten är för lång. Klistra in en del i taget." |
  | `offers_link` (9.7) | "Det här är en länk. Lägg in den under Butik i Inställningar, så hämtar Matkoll erbjudandena därifrån." |

  Från 9.7 får `offers_link_unsupported`, `offers_fetch_blocked` och `offers_page_changed` tillägget "… eller klistra in texten." och knappen "Klistra in text".

  Loggarna innehåller bara felkoder och antal.
- **Rendering (AD-18):** `revalidateFor('store_offer')` → `/recept`, `/lista` och `/matsedel` (layout). `store` revaliderar också `/lista` och `/matsedel`, eftersom erbjudandena följer vald butik. Allt läses inuti `<Suspense>`.
- **Tester:**
  - Vitest bredvid koden:
    - veckor (sommartid, årsskifte, vecka 53, `weekOfValidTo`);
    - `parseIcaOfferPage` mot fixturen och felfallen, också en sträng som innehåller `undefined` och `new Map(` och ett `}` i en sträng;
    - `offerName`, `parseOffersLink`, matchningen och etiketterna;
    - actions och klientkomponenter.
  - Integrationstester mot lokal Supabase i `tests/integration/offers.test.ts`:
    - RLS för `store_offer`;
    - `save_store_offers` (ersätt länk, sammanslagning, gränsen 300, vecka som är slut, vecka för långt fram, borttagning av gamla veckor, en annan användares butik);
    - `store.offers_url`.
  - Hämtningen testas mot fixturerna via `fixture-sites.ts`, aldrig mot ica.se. Ett test visar att `fetch` anropas en gång per tryck, och aldrig vid ett 403 eller 429.
  - Designtester i `tests/design/` låser längdgränserna, avdelningarna, `source` och `FOOD_CATEGORIES` mot domänen.
  - E2E-användare, en per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:

    | Story | E2E-användare |
    | --- | --- |
    | 9.1 | `e2e-erbjudanden-lank@matkoll.test` |
    | 9.2 | `e2e-erbjudanden-lista@matkoll.test` |
    | 9.3 | `e2e-erbjudanden-recept@matkoll.test` |
    | 9.4 | `e2e-erbjudanden-lager@matkoll.test` |
    | 9.5 | `e2e-erbjudande-forslag@matkoll.test` |
    | 9.6 | `e2e-veckomeny@matkoll.test` |
    | 9.7 | `e2e-erbjudanden-text@matkoll.test` |
    | 9.8 | `e2e-erbjudande-foto@matkoll.test` |
    | 9.9 | `e2e-erbjudanden-hantera@matkoll.test` |
    | 9.10 | `e2e-erbjudanden-koppla@matkoll.test` |

  - E2E körs med `AI_PROVIDER=mock`, och då svarar fixtursajterna. `pnpm eval:ai` mot LM Studio körs för hand, inte i CI.
- **Manuellt prov mot ica.se (9.1):** efter att storyn är byggd trycker bygget "Hämta veckans erbjudanden" en gång i den lokala appen mot Pontus butik, med appens User-Agent. Status, antal, antal som inte var mat och antal kopplade skrivs i T13 och T14. Inga varor, ingen HTML och inga huvuden sparas eller checkas in. Vid 403 eller 429 görs inget nytt försök, och 9.7 byggs direkt efter 9.1.

## UX & Interaction Patterns

- **Inställningar, Butik (9.1):**
  - Arket Butik får fältet "Länk till veckans erbjudanden" (16 px, `inputmode="url"`) med hjälptexten "Öppna butikens erbjudanden på ica.se och kopiera adressen."
  - Fel under fältet: "Ange adressen till butikens erbjudanden på ica.se, till exempel https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/."
  - För andra kedjor: "Länk stöds bara för ICA än så länge."
  - Butikskortet visar "Erbjudanden: ica.se" när länken finns.
- **Arket Veckans erbjudanden:**
  - Rubriken "Veckans erbjudanden". Under den står butiken och veckan ("Maxi ICA Stormarknad Östersund · vecka 45, 4–10 nov").
  - **Utan erbjudanden, med länk:** "Inga erbjudanden hämtade för vecka 45." och primärknappen "Hämta veckans erbjudanden". Under förloppet står "Hämtar erbjudandena från ica.se …".
  - **Utan länk:** meddelanderutan "Lägg in länken till butikens erbjudanden under Butik i Inställningar." med "Öppna inställningar". Från 9.7 finns också "Klistra in text" och "Fotografera bladet".
  - **Med erbjudanden:**
    - "91 erbjudanden · hämtade idag 07:12" med textknappen "Hämta igen";
    - från 9.4 rubriken "Fyll på lagret" med sina rader;
    - erbjudandena i kategorier, med Kategorirubrik och Listgrupp. Varje listrad har namnet som butiken skrev det och raden under med pris och villkor ("89 kr/kg · Stammis · Max 1 köp/hushåll · t.o.m. 22 nov");
    - sist textlänken "Öppna sidan på ica.se".
  - **Efter hämtningen:** den korta bekräftelsen "Hämtade 91 erbjudanden för vecka 45." En rad under rubriken säger "122 varor som inte är mat togs inte med."
  - **Fel:** i en blå meddelanderuta med "Öppna sidan" (länken öppnas i webbläsaren), aldrig i rött.
- **Inköpslistan (9.1, 9.2):**
  - Textknappen "Erbjudanden" i rubriken öppnar arket.
  - En listpost med ett erbjudande får erbjudandeetiketten ("Falukorv 29 kr", `offer-chip`) först på raden under namnet, före rätterna. Namnet för skärmläsare är "På erbjudande: Falukorv 29 kr".
  - Listpostdetaljen visar "På erbjudande hos Maxi ICA Stormarknad Östersund:" och erbjudandena med pris och villkor.
  - Exporten är oförändrad.
- **Recept (9.3):**
  - Filterpillren Alla, Favoriter, Kan lagas nu och Erbjudanden. Med Erbjudanden står raden "Recept med veckans erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." och textknappen "Visa erbjudanden" överst.
  - Korten har upp till två erbjudandeetiketter under titeln och "+1".
  - Utan erbjudanden: "Inga erbjudanden för den här veckan." och "Hämta veckans erbjudanden".
  - Utan träff: "Inget recept använder veckans erbjudanden." och, från 9.5, "Föreslå rätter med AI".
- **Fyll på lagret (9.4):**
  - Rubriken "Fyll på lagret" och raden "Erbjudanden på varor du brukar ha hemma."
  - Raden visar namnet, priset och var varan finns ("Finns i Hemma, inte i Stugan").
  - Textknappen "Lägg på listan" ger bekräftelsen "Lade kaffe på inköpslistan.", och knappen byter till "På listan".
  - Utan basvaror på erbjudande syns inte avsnittet.
- **AI-förslag (9.5):**
  - Över förslagen står "Med veckans erbjudanden från Maxi ICA Stormarknad Östersund."
  - Ett förslag får erbjudandeetiketter som receptkorten. Etiketterna följer inte med när förslaget sparas.
  - Om inget förslag använder erbjudandena: "Inget av förslagen använder veckans erbjudanden."
- **Veckans matsedel (9.6):**
  - Sekundärknappen "Föreslå veckans matsedel" i Matsedel, under "Lägg till rätt".
  - Jobbet visar "Planerar veckan … Du kan göra annat under tiden." och "Avbryt", och jobbraden "AI: Planerar veckan".
  - Resultatet heter "Förslag till veckans matsedel" och har fem rättkort med bock (förvalt på), "6 av 8 hemma" och erbjudandeetiketter.
  - Rätter ur biblioteket läggs på matsedeln med primärknappen "Lägg 3 rätter på matsedeln". Nya rätter har AI-etiketten och "Granska och spara", som öppnar förhandsgranskningen.
  - Bekräftelsen "Lade 3 rätter på matsedeln." och "Stäng förslaget".
- **Text och foto (9.7, 9.8):** arket får "Klistra in text" och "Fotografera bladet". Det är samma inläsning, granskning och sparande som i den första planen, men som AI-jobb ("Läser erbjudandena … Du kan göra annat under tiden.").
- **Ta bort (9.9):** en grå soptunna på varje rad, utan fråga. "Tog bort Falukorv." med "Ångra" i 5 s, och "Ta bort alla" med "Tog bort 91 erbjudanden." och "Ångra".
- **Texter:**
  - Veckan skrivs "vecka 45" och, där det finns plats, "vecka 45, 4–10 nov".
  - Butiken nämns med sitt namn.
  - Priser och villkor står som butiken skrev dem. Matkoll säger aldrig "billigt", "fynd" eller "spara".
  - Ingen emoji.

## Cross-Story Dependencies

- **Före epicen:** Epic 12 är ihopslagen (eller Epic 11, om 9.1–9.4 byggs före Epic 12). Det som epicen bygger på finns från 1.0 och 1.1: butikerna (7.1), `safeFetch` (1.8), katalogen (AD-6) och lagret per ställe (8.x).
- **9.1 före allt annat:** länken, tabellen, `save_store_offers`, hämtningen, läsaren, arket och ingången i Inköpslistan.
- **9.2, 9.3 och 9.4 efter 9.1,** i valfri ordning. 9.3 lägger `isMainLine` och `offersInRecipe`, som 9.5 och 9.6 använder.
- **9.5 efter 9.3 och 12.4:** etiketterna på förslagen och huvudvarorna.
- **9.6 efter 9.5:** prompten med erbjudanden, det kompakta schemat och jobben.
- **9.7 efter 9.1 och 12.4,** eller direkt efter 9.1 om ica.se nekar (T13). **9.8 efter 9.7.**
- **9.9 efter 9.1.** Granskningen i 9.7 tar bort rader före sparande. 9.9 tar bort det som är sparat.
- **9.10 efter 9.1:** byggs bara om T14 visar att färre än hälften av erbjudandena på mat kopplas till katalogen.
- **Gren:** `epic/9-erbjudanden-v2`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Den gamla grenen `epic/9-erbjudanden` är ersatt.
- **Efter epicen:** Pontus provar Flöde 7, svarar på öppna frågor 8–10 och 26–29 och läser T13 och T14.
