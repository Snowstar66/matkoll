# Epic 5 Context: Förslag

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan se vad som går att laga med det som finns hemma, rangordnat efter hur lite som saknas, och be om AI-förslag när biblioteket inte räcker (UJ-5, Flöde 5). Epicen bygger filtret "Kan lagas nu" i receptbiblioteket (FR-8, FR-22) och AI-förslag utifrån lagret (FR-23). Den bygger på det som redan finns: lagningsstatus per receptrad i biblioteket (`missingCount` från `recipeStatus`, Story 2.4), filterpillren och det sparade filtervalet (Story 1.10), AI-porten med `mock`, `lmstudio`, `anthropic` och `openai` (Story 1.4) och import, förhandsgranskning och `saveRecipe` (Story 1.6–1.9). Epicen har inga nya tabeller och inga migrationer.

## Stories

- Story 5.1: Kan lagas nu, rangordnat
- Story 5.2: AI-förslag utifrån lagret

## Requirements & Constraints

- **Filtret "Kan lagas nu" (FR-8, FR-22):** det tredje filterpillret efter Alla och Favoriter. Ett piller är valt åt gången, och valet sparas på enheten (EXPERIENCE.md, Filterpiller). Filtret visar alla recept, sorterade efter antal saknade varor (N i "Saknar N varor"), minst först. Recept som kan lagas nu (N = 0) står alltså överst.
- **Inget kan lagas nu:** listan visas ändå i rangordning, och längst ned finns "Föreslå rätter med AI" (EXPERIENCE.md, State Patterns).
- **AI-förslag (FR-23):** "Föreslå rätter med AI" anropar `/api/ai/suggest`. Under tiden visas "Letar efter idéer …" och "Avbryt". Svaret är tre förslag i `AiRecipe`-schemat.
  - Förslagen ligger i en egen sektion, var och en med den sandfärgade etiketten "AI-förslag". De blandas aldrig med biblioteket och finns bara i klientens tillstånd tills de sparas (AD-10, EXPERIENCE.md, AI-etikett).
  - "Spara" öppnar förhandsgranskningen med `sourceKind: ai` och AI-etiketten. Efter "Spara recept" ligger receptet i biblioteket med källan "AI-förslag" (`sourceLabel`).
- **AI-tjänsten nås inte:** "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" med "Försök igen". Resten av biblioteket fungerar (EXPERIENCE.md, State Patterns). Ett ogiltigt svar ger efter de tysta nya försöken "Det gick inte att tolka svaret. Försök igen."
- **Svarstider (NFR-7):** biblioteket och filtret svarar inom en sekund, och rangordningen görs utan nytt anrop. AI-förslag får ta längre tid men visar förlopp och går att avbryta eller göra om.
- **Plattform:** allt fungerar från 375 px och på dator, i ljust och mörkt läge, med 200 % textförstoring utan vågrät scroll och på svenska. Tryckytorna är minst 44 × 44 px.

## Technical Decisions

- **Moduler (AD-1):**
  - Filtret och rangordningen ligger i `recipes` (`recipes/domain/recipe-list.ts` och `recipes/ui/library.tsx`), eftersom biblioteket äger filtervalet och `RecipeListItem.missingCount`.
  - Servern för AI-förslag ligger i den nya modulen `suggestions` (Capability Map: "FR-22, FR-23 Förslag – `suggestions`, `app/api/ai/suggest`"). Modulen äger inga tabeller och läser via andra moduler: lagret via `pantry/server.ts` (`getPantrySnapshot`), namnen och matchningen via `catalog/server.ts` (`getIngredientNames`, `matchIngredients`) och `fromAiRecipe` och scheman via `recipes/index.ts`.
  - Gränssnittet för förslagen ligger i `recipes/ui`, eftersom det använder `RecipePreview` och `saveRecipe`, och `ui` får inte importera en annan moduls `ui`. Det når servern bara via `src/lib/ai-client.ts` (`postAi`).
- **Rangordning (AD-7):** N kommer bara från `recipeStatus` via `withStatus`, för receptets egna portioner. Biblioteket skalar aldrig. Rangordningen räknar inget själv, utan sorterar på `missingCount`. Vaga rader och rader utan katalogingrediens räknas inte i N (beslut 2026-10-26), och en mängd utan enhet jämförs som `st`. X och Y från Story 4.1 ändrar inte N.
- **Lagret går inte att läsa:** `pantrySnapshotOrNull` ger `null`, och `missingCount` är då `null` på alla rader. Biblioteket visas ändå, utan status (Story 2.4). Filtret kan då inte rangordna och visar recepten i vanlig ordning med en förklaring.
- **AI-porten (AD-9):**
  - `AiService` får `suggestDishes(input, signal)` bredvid `parseRecipe`, med samma regler: `generateText` med `Output.object({ schema })`, aldrig `generateObject`; `maxRetries: 0`; högst två nya försök vid ogiltigt svar; `ai_unavailable` utan nya försök vid nätverksfel, hälsokontroll som misslyckas (5 s) eller svar som inte är JSON; 100 s per försök och 115 s totalt.
  - `lmstudio` stänger av tänkläget med `reasoningEffort: "none"` (finns redan i adaptern).
  - Svarsschemat finns i `src/server/ai/schemas.ts`, och prompten är en fil i `src/server/ai/prompts/` som importeras med `?raw`.
  - `mock` är deterministisk och används i alla tester och i CI, aldrig en riktig modell. Reserverade indata (`matkoll-mock: <kod>`) gör att mocken svarar med en felkod.
  - `pnpm eval:ai` körs för hand mot en riktig modell, inte i CI.
- **Ett receptformat (AD-10):** `suggestDishes` returnerar samma `AiRecipe` som `parseRecipe`. Varje förslag blir ett `RecipeDraft` med `fromAiRecipe(aiRecipe, matches, { kind: "ai" })`. AI-svaret innehåller bara namn och katalogförslag (`hint`), aldrig id. Katalogkopplingen görs av `matchIngredients` (AD-6), och nya katalogingredienser skapas först när Pontus sparar (`commitIngredients` i `saveRecipe`).
- **En väg för ändringar (AD-2):** `/api/ai/suggest` skriver aldrig till databasen. Förslagen lever i klienten tills Pontus sparar via `saveRecipe`, som redan revaliderar biblioteket. `revalidateFor` ändras inte.
- **Resultat och fel (AD-13):** handlern returnerar `{ ok, data } | { ok: false, error }`. Felkoderna och de svenska texterna finns i `src/lib/errors.ts`, och HTTP-statusen i `src/app/api/ai/route-support.ts`.
- **Rendering (AD-18):** sidan läser sessionen och recepten inuti `<Suspense>`. AI anropas aldrig vid rendering, bara när Pontus trycker. Ett pågående anrop avbryts i effektens cleanup när komponenten försvinner.
- **Tester:** Vitest bredvid koden för domänen, porten, handlern och klientkomponenterna (Testing Library, som `library.test.tsx`). Varje e2e-spec får en egen e2e-användare, som läggs till i `e2eEmails` i `tests/e2e/support.ts` och med storage state i `global-setup.ts`: `e2e-kan-lagas@matkoll.test` (5.1) och `e2e-ai-forslag@matkoll.test` (5.2). E2E körs med `AI_PROVIDER=mock`. Ingen migration behövs. Kör aldrig `supabase db reset`.

## UX & Interaction Patterns

- **Filterpiller** (skiss 1, DESIGN.md `filter-pill`): Alla, Favoriter och Kan lagas nu. Valt piller fylls med `accent`. Pillren är en radiogrupp där piltangenterna byter val (`FilterPills`, finns).
- **Receptrad:** bild, titel, "35 min · 4 portioner", statusetikett ("Kan lagas nu" i mint eller "Saknar N varor" i ljusblått) och hjärta. Status visas aldrig bara med färg.
- **AI-förslag** (Flöde 5, ej skissat): sektionen ligger under biblioteket i filtret "Kan lagas nu". Varje förslag har etiketten "AI-förslag" i sand (`AiBadge`, finns). EXPERIENCE.md säger "AI-förslag" som etikett, aldrig "Magi", "Smart" eller gnistor.
- **Flöde 5:** Pontus väljer "Kan lagas nu". Recepten visas efter hur lite som saknas, men inget lockar. Längst ned trycker hen "Föreslå rätter med AI". Tre förslag visas, alla märkta "AI-förslag". Hen trycker "Spara" på ett, granskar det i förhandsgranskningen, och det läggs i biblioteket med etiketten "Kan lagas nu".
- **Förlopp:** "Letar efter idéer …" med förloppsrad och "Avbryt", som "Läser receptet …" vid import. Ingen helskärmssnurra.
- **Allmänt:** fel visas i en blå `Notice`, aldrig i rött, överst i den yta där problemet uppstod och med en åtgärd när det finns en. Synlig fokusram i `accent` och logisk tabbordning. "Minska rörelse" fångas globalt i `globals.css`. Texten är kort och saklig, med du-tilltal och utan utropstecken.

## Cross-Story Dependencies

- **Före epicen:** Epic 1–4 är byggda.
  - `withStatus`, `RecipeListItem.missingCount`, `pantrySnapshotOrNull` och `RecipeStatusBadge` kommer från 2.4.
  - `FilterPills`, `useRecipeFilter`, `parseRecipeFilter` och `filterRecipes` kommer från 1.10.
  - AI-porten, `runStructured`, `postAi`, `route-support.ts` och mocken med reserverade indata kommer från 1.4 och 1.6–1.9.
  - `fromAiRecipe`, `recipeImportSchema`, `RecipePreview`, `saveRecipe` och `sourceLabel` (med "AI-förslag") kommer från 1.6–1.7.
  - `recipe.source_kind` tillåter redan `'ai'`.
  - Epic 4 lägger X och Y till `recipeStatus` och ersätter `getRecipeWithStatus` med `getRecipeWithPantry`. Inget av det ändrar N eller biblioteket.
- **5.1 före 5.2:** 5.1 bygger filtret, rangordningen och knappen "Föreslå rätter med AI" längst ned. 5.2 kopplar knappen till `/api/ai/suggest` och bygger sektionen, förhandsgranskningen och felen.
- **Senare epics:** Epic 6 lägger till `analyzeImage` i samma port med samma mönster som `suggestDishes`.
- **Gren:** epicen byggs i en egen gren med PR till `main`. Alla sex kontroller och en kodgranskning krävs.
