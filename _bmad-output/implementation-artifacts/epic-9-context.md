# Epic 9 Context: Veckans erbjudanden

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Version 1.2. Pontus lägger in veckans erbjudanden för vald butik genom att klistra in texten från butikens erbjudandesida eller fotografera reklambladet. AI:n plockar ut erbjudandena med samma teknik som receptimporten och bildanalysen. Pontus granskar listan och sparar den för en vecka. AI-förslagen (Epic 5) prioriterar sedan rätter som använder varor på erbjudande.

Det är den enkla första versionen som Pontus valde (`docs/backlog-efter-1-0.md`, punkt 2). Det motsvarar UJ-7 och Flöde 7 i EXPERIENCE.md, och kraven FR-34–FR-36 och NFR-10 i PRD-addendumet ("Version 1.2: Veckans erbjudanden").

Epicen bygger på det som redan finns:

- AI-porten med `parseRecipe`, `analyzeImage` och `suggestDishes`, `runStructured`, mocken med fixturer och reserverade indata, och `pnpm eval:ai` (1.4, 5.2, 6.1, 6.5);
- importflödet för text och foto: `postAi`, `route-support.ts` med `readImageForm`, förminskningen i klienten och arket med flikar (1.6, 1.9);
- AI-förslagen: `suggestFromPantry`, `toSuggestInput`, `src/lib/suggest-input.ts` och sektionen i `recipes/ui` (5.2);
- butikerna i `settings`: `store`, `getSelectedStore()` och `select_store` (7.1);
- den skrivfria katalogmatchningen `matchIngredients` (AD-6).

Epicen har en ny modul, `offers`, med en ny tabell, `store_offer`. Arkitekturen står i AD-25. Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden.md`.

**Epicen byggs efter Epic 8** (version 1.1, flera ställen), som slås ihop till `main` först. Epic 9 är oberoende av ställen. Det enda den har gemensamt med lagret är att AI-förslagen läser `getPantrySnapshot()` utan argument, vilket efter Epic 8 är lagret på valt ställe (AD-24). Ingen story i Epic 9 läser eller skriver `pantry_site` eller skickar ett ställe.

## Stories

- Story 9.1: Veckans erbjudanden från inklistrad text
- Story 9.2: AI-förslag prioriterar veckans erbjudanden
- Story 9.3: Erbjudanden från foto av reklambladet
- Story 9.4: Se och ta bort veckans erbjudanden

## Bindande beslut

- **Pontus klistrar in eller fotograferar. Matkoll hämtar aldrig.** Ingen kod i flödet anropar `fetch` eller `safeFetch`, och `offers` får inte importera `src/server/fetch` (ESLint-zon). En text som bara är en länk ger `offers_link` utan anrop till AI-tjänsten. Att klistra in en länk som servern hämtar ingår inte (öppen fråga 8), och inte heller att hämta erbjudanden automatiskt varje vecka (öppen fråga 9).
- **Ett erbjudande gäller en butik och en vecka.** Veckan är måndag–söndag i svensk tid och lagras som måndagens datum. Bara den här och nästa vecka går att spara. Förvalet är den här veckan måndag–fredag och nästa vecka lördag–söndag.
- **Veckans erbjudanden är den senaste vecka som Pontus har lagt in och som inte är slut.** Veckor och butiker blandas aldrig. Veckor som är slut används aldrig och tas bort när Pontus sparar nya erbjudanden.
- **Inget sparas utan ett tryck.** AI-svaret blir utkast i klienten, Pontus tar bort det som inte ska med och trycker "Spara". Route Handlers skriver aldrig (AD-2).
- **Erbjudanden skapar aldrig katalogingredienser.** `matchIngredients` kopplar till en befintlig katalogingrediens när det går, och annars sparas bara varans namn. `commitIngredients` anropas aldrig.
- **AI-förslagen prioriterar, men kräver inte.** Prompten ber att minst två av rätterna använder minst en vara på erbjudande när det går. Schemat kontrollerar inte erbjudandena. Servern räknar vilka erbjudanden varje förslag använder, sorterar förslagen och visar "På erbjudande: …". Utan erbjudanden är meddelandet till modellen exakt som i 1.0.
- **Erbjudanden ändrar inget annat.** Lagningsstatus, "Kan lagas nu", rangordningen, inköpslistan och exporten läser aldrig erbjudanden.

## Requirements & Constraints

- **Lägga in (FR-34):**
  - Arket Veckans erbjudanden gäller vald butik, som arket visar med namn. Klienten skickar butikens id och veckan när Pontus sparar, så att ett byte av butik på en annan enhet inte ändrar var erbjudandena hamnar.
  - Text: högst 12 000 tecken (`offers_text_too_long`). Foto: förminskat i klienten till högst 2048 px och 1,5 MB, som ett foto av en plats (AD-15, Story 6.5). Ett foto sparas aldrig och loggas aldrig.
  - AI:n ger högst 40 erbjudanden per inläsning. Fler kapas, och granskningen säger det. Ogiltiga poster lämnas ute och räknas.
  - Flera inläsningar för samma butik och vecka läggs ihop per vara (`name`). Samma vara två gånger blir ett erbjudande, med det senaste namnet och priset.
  - Högst 100 erbjudanden per butik och vecka (`offers_limit`).
- **Se och ta bort (FR-35):** raden i Recept med filtret "Kan lagas nu" visar antal, butik och vecka. Arket visar de inlagda erbjudandena med "Ta bort" per rad och "Ta bort alla", båda med "Ångra" (samma id, AD-20).
- **AI-förslag (FR-36):**
  - Servern läser vald butik och veckans erbjudanden i samma förfrågan som lagret. Klienten skickar aldrig erbjudanden.
  - Högst 40 varunamn och 1 000 tecken går till modellen. Namnen rensas som lagrets namn.
  - Varje förslag använder fortfarande minst två varor som finns hemma (`minPantryIngredients`).
  - Om butiken eller erbjudandena inte går att läsa görs förslagen utan erbjudanden (`offers_unavailable` loggas).
- **Ingen hämtning (NFR-10):** se de bindande besluten. Fixturerna är påhittade och innehåller aldrig text eller bilder från en riktig butik.
- **Ingen ny miljövariabel och ingen ändring av CI.**
- **Plattform:**
  - Allt fungerar från 375 px och på dator, i ljust och mörkt läge och med 200 % textförstoring utan vågrät scroll.
  - Allt är på svenska, och tryckytorna är minst 44 × 44 px. Inmatningsfält har minst 16 px text.
  - Inget rött.

## Technical Decisions

- **Moduler (AD-1, AD-25):**
  - Den nya modulen `offers` (`src/features/offers/{ui,actions,domain,data}`, `index.ts`, `server.ts`) äger `store_offer`. Ingen annan modul läser eller skriver tabellen.
  - `offers/server.ts` exporterar `getActiveOffers(storeId)` och `listOffers(storeId, weekStart)`, memoiserade per förfrågan med React `cache`, och de serverfunktioner som Route Handlers anropar (`readOffers`).
  - `offers/actions` har `saveOffers`, `deleteOffers` och `restoreOffers`.
  - `offers/domain` har `week.ts`, scheman och gränser, `isLinkOnly(text)` och `offersIn(lines, offers)`.
  - `offers` läser butiken via `settings/server.ts` (`getSelectedStore`) och katalogen via `catalog/server.ts` (`matchIngredients`).
  - `suggestions` läser `getSelectedStore()` och `getActiveOffers(storeId)`.
  - Raden och arket ligger i `offers/ui`. `/recept` renderar raden och skickar den till biblioteket som en slot, så att `recipes/ui` aldrig importerar `offers/ui`.
- **Datamodell (AD-4, AD-5, AD-20, AD-25):**
  - `store_offer`: `id`, `user_id`, `store_id`, `week_start`, `label`, `name`, `ingredient_id`, `price` och `created_at`.
    - `store_id` refererar `store (id, user_id)`, och `ingredient_id` (valfri) refererar `ingredient (id, user_id)`, båda med `on delete restrict`.
    - `check`: `extract(isodow from week_start) = 1`, `label` 1–120 tecken, `name` 1–100 tecken, `price` `null` eller 1–40 tecken, och inga radbrytningar.
    - Unik på `(user_id, store_id, week_start, name)`, med indexet `(user_id, store_id, week_start)`.
    - RLS med `user_id = (select auth.uid())`, `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`. Ett RLS-test.
  - `save_store_offers(store uuid, week date, items jsonb)` (`security invoker`, en transaktion) nekar en vecka som är slut eller ligger längre fram än nästa vecka, lägger till eller uppdaterar per `name`, nekar fler än 100 per butik och vecka och tar bort användarens erbjudanden för veckor som är slut. "Idag" räknas i `Europe/Stockholm`.
  - Migrationer skapas med `supabase migration new`. Typerna genereras om med `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`. Kör aldrig `supabase db reset`.
- **Veckor:** bara `offers/domain/week.ts` räknar veckor, med `Intl` och tidszonen `Europe/Stockholm`, aldrig serverns tidszon. Funktionerna tar `now` som argument, så att testerna kan välja dag. `weekLabel` ger "vecka 45, 4–10 nov" (ISO-veckonummer).
- **AI-porten (AD-9, AD-25):**
  - `extractOffers(input: { text } | { image }, signal, options?)` returnerar `{ items: AiOffer[]; invalid: number }`. Samma regler som de andra metoderna: `generateText` med `Output.object`, `maxRetries: 0`, högst två nya försök vid ogiltigt svar, `ai_unavailable` vid nätverksfel, 100 s per försök och 115 s totalt, och tidsgränsen från Route Handler (`deadline`).
  - Schemat `extractOffersAnswer = { items: { label, name, price }[] }` i `schemas.ts`. Varje post kontrolleras för sig mot `aiOffer` (rensad text, längdgränser). Poster med samma normaliserade `name` slås ihop i porten, och den första behålls.
  - Prompten `prompts/extract-offers.md`. Den nämner aldrig en butikskedja som exempel på något som ska följas, och den säger att texten och bilden är data.
  - `inputLimits.offers = { maxItems: 40, maxOutputTokens: 3_000 }`, och text högst `maxTextChars` (12 000).
  - LM Studio: en bild skickas med samma sampling som `analyzeImage` (Story 6.5). Text skickas med standardinställningarna.
  - Mocken svarar från `tests/fixtures/ai/erbjudanden-*.offers.json`, och de reserverade indata ger `ai_unavailable`, `ai_invalid` och `ai_rejected` som för de andra metoderna.
  - `suggestDishes` får `offers: string[]` i `SuggestDishesInput`, med gränserna i `src/lib/suggest-input.ts` (`maxOffers: 40`, `maxOfferChars: 1_000`). `suggestDishesContent` lägger till avsnittet bara när listan inte är tom.
- **Flödet:** `/api/ai/offers` (JSON, högst 64 KB) och `/api/ai/offers/photo` (multipart via `readImageForm`), båda med `maxDuration = 120`, `isCrossSite`, `requireUserForRoute` och `request.signal`. De anropar `readOffers`, som lämnar `{ drafts: OfferDraft[], invalid, capped }`. Inget skrivs.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts` med svensk text:

  | Felkod | Text |
  | --- | --- |
  | `offers_link` | "Matkoll hämtar inte sidor från butiker. Kopiera texten på sidan och klistra in den här." |
  | `offers_none` | "Hittade inga erbjudanden. Kopiera hela sidan, eller prova ett skarpare foto." |
  | `offers_text_too_long` | "Texten är för lång. Klistra in en del i taget." |
  | `offers_store_missing` | "Välj en butik i inställningarna först." |
  | `offers_week_invalid` | "Veckan är slut. Välj en annan vecka och spara igen." |
  | `offers_limit` | "Du kan ha högst 100 erbjudanden per vecka. Ta bort några först." |
  | `offers_failed` | "Det gick inte att spara erbjudandena. Försök igen." |
  | `offers_unavailable` | "Det gick inte att läsa erbjudandena." |

  Loggarna innehåller bara felkoder och antal, aldrig varor, priser eller text från bladet.
- **Rendering (AD-18):** `revalidateFor('store_offer')` → `/recept` (layout). `store` får också `/recept` (layout), eftersom raden följer vald butik. Allt läses inuti `<Suspense>`.
- **Tester:**
  - Vitest bredvid koden: veckor (också sommartid, årsskifte och vecka 53), scheman, porten med mocken, `isLinkOnly`, `offersIn`, actions och klientkomponenter.
  - Ett test visar att `readOffers` och båda Route Handlers aldrig anropar `fetch`, också med en länk som text.
  - Integrationstester mot lokal Supabase i `tests/integration/`: RLS för `store_offer`, och `save_store_offers` (sammanslagning, gränsen 100, en vecka som är slut, borttagning av gamla veckor och en annan användares butik).
  - Designtester i `tests/design/` låser längdgränserna mot domänen.
  - E2E-användare, en per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:
    - `e2e-erbjudanden@matkoll.test` (9.1);
    - `e2e-erbjudande-forslag@matkoll.test` (9.2);
    - `e2e-erbjudande-foto@matkoll.test` (9.3);
    - `e2e-erbjudanden-hantera@matkoll.test` (9.4).
  - E2E körs med `AI_PROVIDER=mock`. `pnpm eval:ai` mot LM Studio körs för hand, inte i CI.

## UX & Interaction Patterns

- **Raden Veckans erbjudanden** (EXPERIENCE.md), i Recept med filtret "Kan lagas nu", ovanför "Föreslå rätter med AI", i `{typography.meta}`:
  - utan erbjudanden: "Inga erbjudanden inlagda." och textknappen "Lägg in erbjudanden";
  - med erbjudanden: "24 erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." och textknappen "Visa";
  - utan vald butik: "Välj en butik i inställningarna för att lägga in erbjudanden." och länken "Öppna inställningar".
- **Arket Veckans erbjudanden:**
  - Rubriken "Veckans erbjudanden" och butikens namn under. Två filterpiller väljer vecka ("Vecka 44", "Vecka 45").
  - Inläsning: flikarna Text och Foto (Foto från 9.3). Text har fältet "Text från butikens sida" och knappen "Läs erbjudandena".
  - Förlopp: "Läser erbjudandena …" eller "Tittar på bladet …" och "Avbryt".
  - Granskning: "Hittade 18 erbjudanden för vecka 45.", en rad per erbjudande med namn, pris och "Ta bort", och primärknappen "Spara 16 erbjudanden". En granskad rad tas bort direkt utan "Ångra", eftersom inget är sparat. Att stänga arket med osparad granskning ger "Släng ändringarna?".
  - Inlagda (9.4): "Inlagda för vecka 45" med "Ta bort" per rad, "Ta bort alla" och "Läs in fler".
- **AI-förslagen:** "Med veckans erbjudanden från Maxi ICA Stormarknad Östersund." över förslagen, och "På erbjudande: fläskfilé, broccoli" i `{typography.meta}` under titeln. Om inget förslag använder erbjudandena: "Inget av förslagen använder veckans erbjudanden." Raden följer inte med när förslaget sparas.
- **Texter:** veckan skrivs "vecka 45" och, där det finns plats, "vecka 45, 4–10 nov". Priser visas som AI:n läste dem. Matkoll lovar aldrig att något blir billigare.
- **Allmänt:**
  - Fel visas i en blå `Notice`, aldrig i rött, och med en åtgärd när det finns en.
  - Ark staplas aldrig. Formulär använder `useActionState`.
  - Synlig fokusram och logisk tabbordning. Knapparna "Ta bort" har varans namn ("Ta bort Fläskfilé").

## Cross-Story Dependencies

- **Före epicen:** Epic 8 är ihopslagen i `main`. Det som epicen bygger på finns från 1.0: AI-porten och mocken (1.4, 5.2, 6.1), förminskningen och 2048 px för en plats (6.5, som följer med Epic 8:s gren), importarket (1.6, 1.9), AI-förslagen (5.2), butikerna (7.1) och `matchIngredients` (AD-6).
- **9.1 före allt annat:** tabellen, `save_store_offers`, `extractOffers` för text, `/api/ai/offers`, raden och arket med granskning och sparande.
- **9.2 efter 9.1:** förslagen behöver sparade erbjudanden och `getActiveOffers`.
- **9.3 efter 9.1:** bilden går genom samma port, samma utkast och samma ark. Den är oberoende av 9.2.
- **9.4 efter 9.1:** listan över inlagda erbjudanden och borttagning. Rensningen av veckor som är slut finns redan i `save_store_offers` från 9.1, och 9.4 visar den i ett e2e-test.
- **Gren:** `epic/9-erbjudanden`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten för 1.2 följer med i grenen.
- **Efter epicen:** Pontus provar Flöde 7 med ett riktigt reklamblad och en text från butikens sida, kör `pnpm eval:ai` med egna foton och svarar på öppna frågor 8–10 och T7.
