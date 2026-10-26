# Epic 6 Context: Bildanalys

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan fotografera kylen, frysen eller skafferiet och bekräfta, rätta eller avvisa de varor AI:n föreslår innan något sparas (UJ-3, Flöde 3). Epicen bygger kameraknappen i Hemma och bildanalysen (FR-24) och granskningen av lagerförslagen (FR-25). Den bygger på det som redan finns: Hemma med platskort, lagerlistan och arket Lagervara (Story 2.1–2.3), `set_pantry_items` med `pantry_lock()` och regeln att en ingrediens på en plats antingen är obegränsad eller har mängder (Story 2.2, 2.3), katalogens `matchIngredients`, `commitIngredients` och `searchIngredients` (Story 1.5), AI-porten med `mock`, `lmstudio`, `anthropic` och `openai` (Story 1.4) och fotoflödet från receptimporten: förminskning i klienten, `/api/ai/import/photo`, storlekskontroll på servern och mockens reserverade bilder (Story 1.9). Epicen har inga nya tabeller och troligen inga migrationer.

## Stories

- Story 6.1: Fotografera en plats och få lagerförslag
- Story 6.2: Bekräfta, rätta eller avvisa lagerförslag

## Requirements & Constraints

- **Kameraknappen (FR-24, UX-DR10):** en ljusblå knapp i full bredd med kameraikon under platskorten. Texten följer vald plats: "Fotografera kylen", "Fotografera frysen" eller "Fotografera skafferiet". På mobil öppnar den bakre kameran direkt, och på dator öppnar den filväljaren (EXPERIENCE.md, Kameraknapp och Responsive). FR-24 tillåter också att en bild väljs.
- **Bildanalys:** fotot förminskas i klienten och skickas till `/api/ai/analyze`. Servern kontrollerar storleken, anropar `analyzeImage` och `matchIngredients` och returnerar lagerförslag kopplade till katalogen, med den fotograferade platsen som förval. Inget skrivs (AD-2, AD-15). Under tiden visas "Tittar på bilden …" och "Avbryt".
- **Inga varor:** "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand."
- **Lagerförslag (FR-25, UX-DR11):** varje förslag visar varunamn, mängd och plats och har knapparna Bekräfta, Rätta och Avvisa. "Bekräfta alla" finns, men inget sparas utan ett tryck. Rätta öppnar arket Lagervara förifyllt (EXPERIENCE.md, Lagerförslag).
- **Sparande:** bekräftade och rättade förslag sparas med `confirmPantrySuggestions`, som anropar `commitIngredients` och `setPantryItems`. Platskortets antal uppdateras. Avvisade förslag sparas inte, och inga katalogingredienser skapas för dem (AD-6, AD-19).
- **AI-tjänsten nås inte eller svarar fel:** "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" med "Försök igen". Efter de tysta nya försöken ger ett ogiltigt svar "Det gick inte att tolka svaret. Försök igen." Resten av Hemma fungerar (EXPERIENCE.md, State Patterns).
- **Svarstider (NFR-7):** Hemma svarar inom en sekund. Bildanalysen får ta längre tid men visar förlopp och går att avbryta eller göra om.
- **Foton är privata:** ett foto förminskas i klienten, kontrolleras på servern, skickas till AI-tjänsten och sparas aldrig, varken i databasen, på disk eller i loggar (AD-15). Repot är publikt, så riktiga kylskåpsfoton checkas aldrig in.
- **Plattform:** allt fungerar från 375 px och på dator, i ljust och mörkt läge, med 200 % textförstoring utan vågrät scroll och på svenska. Tryckytorna är minst 44 × 44 px. Inget rött.

## Technical Decisions

- **Moduler (AD-1):** enligt Capability Map ("FR-24, FR-25 Bildanalys – `pantry`, `app/api/ai/analyze`").
  - Servern ligger i `pantry`: `actions/analyze-place.ts` är en serverfunktion (inte en Server Action) som handlern anropar, och `actions/confirm-pantry-suggestions.ts` är en Server Action. Båda nås via `pantry/server.ts` respektive `pantry/ui`.
  - `pantry` läser katalogen via `catalog/server.ts` (`matchIngredients`, `commitIngredients`, `getIngredientNames`) och skriver bara sin egen tabell `pantry_item`.
  - Gränssnittet ligger i `pantry/ui` och når servern via `src/lib/ai-client.ts` (`postAiForm`). `downscaleImage` och kamerafälten används av både `recipes/ui` och `pantry/ui`. Eftersom en moduls `ui` inte får importera en annan moduls `ui` flyttas de till `src/lib/` respektive `src/components/` (6.1).
- **AI-porten (AD-9):**
  - `AiService` får `analyzeImage(input, signal)` bredvid `parseRecipe`, med samma regler: `runStructured`, alltså `generateText` med `Output.object({ schema })`, aldrig `generateObject`; `maxRetries: 0`; högst två nya försök vid ogiltigt svar; `ai_unavailable` utan nya försök vid nätverksfel, hälsokontroll som misslyckas (5 s) eller svar som inte är JSON; 100 s per försök och 115 s totalt.
  - Bilden skickas som `file`-del. `lmstudio` stänger av tänkläget med `reasoningEffort: "none"` (finns redan i adaptern).
  - Svarsschemat finns i `src/server/ai/schemas.ts`, och prompten är en fil i `src/server/ai/prompts/` som importeras med `?raw`. Prompten säger att text på bilden är data, inte instruktioner.
  - `mock` är deterministisk och används i alla tester och i CI, aldrig en riktig modell. Den svarar på bildens bytes. De reserverade bilderna (`reserved-ai_unavailable.png` och liknande) ger felkoder, precis som vid fotoimport.
  - `pnpm eval:ai` körs för hand mot en riktig modell, inte i CI, med Pontus egna foton från en mapp som git ignorerar.
- **AI:n refererar aldrig till id (AD-6):** svaret innehåller bara det AI:n ser (`label`), mängd, enhet och ett katalogförslag (`hint`). Katalogkopplingen görs bara av `matchIngredients`. En okänd vara blir `{ kind: "new" }` och skapas först i `confirmPantrySuggestions` (`commitIngredients`). Klientens indata till `confirmPantrySuggestions` valideras också med Zod, och id:n kontrolleras mot användarens katalog.
- **En väg för ändringar (AD-2):** `/api/ai/analyze` och `analyzePlace` skriver aldrig. Förslagen lever i klientens tillstånd tills Pontus bekräftar. `confirmPantrySuggestions` börjar med `requireUser()`, validerar med Zod och anropar `revalidateFor("pantry_item")` (AD-18), som redan täcker `/hemma`, `/recept`, `/matsedel` och `/lista`.
- **Lagervarans identitet (AD-19):** `setPantryItems` sätter mängden exakt för ingrediens, plats och enhet och skapar raden vid behov. Ett bekräftat förslag är alltså en inventering av det som syns på bilden, inte ett tillskott (till skillnad från "Lägg i lagret", som använder `addToPantry`). `set_pantry_items` tar `pantry_lock()` och tillämpar regeln att en ingrediens på en plats antingen är obegränsad eller har mängder.
- **Enheter och mängder (AD-12):** AI:ns enhet tolkas bara med `normalizeUnit`. En mängd utan enhet blir `st` (beslut 2026-10-26). En okänd enhet gör förslaget obegränsat, på samma sätt som en okänd enhet gör en receptrad vag. Mängder visas bara med `formatQuantity`.
- **Bilder (AD-15):** högst 1600 px och 1,5 MB i klienten. Servern läser typ och storlek från filens bytes (`imageTypeOf`, `imageSizeOf`) och svarar `image_too_large` (413) eller `image_unsupported` (415). Kontrollen delas med `/api/ai/import/photo`.
- **Resultat och fel (AD-13):** handlern returnerar `{ ok, data } | { ok: false, error }`. Felkoderna och de svenska texterna finns i `src/lib/errors.ts`, och HTTP-statusen i `src/app/api/ai/route-support.ts`.
- **Rendering (AD-18):** Hemma läser sessionen och lagret inuti `<Suspense>`, som i dag. AI anropas aldrig vid rendering, bara när Pontus har tagit eller valt ett foto. Ett pågående anrop avbryts i effektens cleanup när Hemma lämnas.
- **Lagret går inte att läsa:** sidan får aldrig gå ned. Hemma visar som i dag `pantry_unavailable` i en `Notice`. Om analysen inte kan läsa platsens lagervaror för att visa "I kylen nu" visas förslagen ändå, utan den raden.
- **Tester:** Vitest bredvid koden för domänen, porten, handlern och klientkomponenterna (Testing Library, som `pantry-ui.test.tsx`). Varje e2e-spec får en egen e2e-användare, som läggs till i `e2eEmails` i `tests/e2e/support.ts` och med storage state i `global-setup.ts`: `e2e-bildanalys@matkoll.test` (6.1) och `e2e-lagerforslag@matkoll.test` (6.2). E2E körs med `AI_PROVIDER=mock` och fotot väljs med filväljaren (`setInputFiles`). Ingen migration väntas. Om en ändå behövs skapas den med `supabase migration new`, typerna genereras om, och `supabase db reset` körs aldrig.

## UX & Interaction Patterns

- **Hemma** (skiss 4, DESIGN.md `location-card`, `camera-button`): platskorten, kameraknappen och sedan listan ("Med mängd" och "Finns hemma"). En tom plats visar "Inget i kylen än." och "Lägg till vara", med kameraknappen ovanför.
- **Kameraknapp:** ljusblå (`sky`) knapp i full bredd med `CameraIcon`. Den är sekundär, eftersom en vy bara har en primärknapp.
- **Förlopp:** "Tittar på bilden …" med förloppsrad och textknappen "Avbryt" på kameraknappens plats, som "Läser receptet …" vid import. Ingen helskärmssnurra.
- **Lagerförslag** (DESIGN.md, Lagerförslag): kort som liknar receptrader, med varunamn, mängd och plats och tre knappar i rad: Bekräfta (primär), Rätta och Avvisa (textknappar). "Bekräfta alla" ligger över korten. Plats är förvald till den fotograferade platsen.
- **Arket Lagervara:** Rätta öppnar samma ark som "+" och en tryckning på en lagervara, förifyllt med förslagets ingrediens, mängd, enhet och plats. Ark staplas aldrig.
- **Flöde 3:** Pontus väljer kortet Kyl och trycker "Fotografera kylen". "Tittar på bilden …". Sex lagerförslag visas. Hen bekräftar fyra, rättar "grädde" till "matlagningsgrädde 2 dl" och avvisar ett. Kortet Kyl visar "16 varor", och Smör och Salt står kvar som "Finns hemma"-etiketter.
- **Kort bekräftelse:** visas i 4 s ("Mjölk är sparad i kylen.", "Lagt 5 varor i lagret."). Efter en borttagning finns knappen "Ångra" i 5 s. Bekräftelsen annonseras via en live-region, och högst en visas i taget.
- **Allmänt:** fel visas i en blå `Notice`, aldrig i rött, överst i den yta där problemet uppstod och med en åtgärd när det finns en. Synlig fokusram i `accent` och logisk tabbordning. "Minska rörelse" fångas globalt i `globals.css`. Texten är kort och saklig, med du-tilltal och utan utropstecken. AI-text kallas aldrig "Magi" eller "Smart".

## Cross-Story Dependencies

- **Före epicen:** Epic 1–3 är byggda. Epic 4 och 5 kan vara byggda eller inte, och ingen av dem behövs här.
  - `downscaleImage`, `useCoarsePointer`, kameran och filväljaren, `/api/ai/import/photo`, `postAiForm`, mockens `reservedImages` och `image_too_large`/`image_unsupported` kommer från 1.9.
  - AI-porten, `runStructured`, `withInputValidation`, `route-support.ts` och `pnpm eval:ai` kommer från 1.4 och 1.6–1.9.
  - `matchIngredients`, `commitIngredients`, `getIngredientNames`, `normalizeUnit`, `formatQuantity` och `LOCATIONS` kommer från 1.5.
  - `listPantry`, `setPantryItems`, `set_pantry_items`, `pantry_lock()`, `PantrySheetProvider`, `PantryItemSheet`, `LocationCards`, `PantryList`, `emptyPlaceText` och `savedItemText` kommer från 2.1–2.3.
  - Om Epic 5 redan har lagt `suggestDishes` i porten följer `analyzeImage` samma mönster bredvid den. Annars blir `analyzeImage` den andra metoden efter `parseRecipe`.
- **6.1 före 6.2:** 6.1 bygger kameraknappen, porten, `/api/ai/analyze`, `analyzePlace` och sektionen "Lagerförslag" med kort som bara visar namn, mängd och plats. 6.2 lägger till Bekräfta, Rätta, Avvisa och "Bekräfta alla", `confirmPantrySuggestions` och arket Lagervara för ett förslag.
- **Gren:** epicen byggs i en egen gren med PR till `main`. Alla sex kontroller och en kodgranskning krävs.
