# Epic 4 Context: Steg-för-steg

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan välja antal portioner i receptvyn och se direkt hur mycket som finns hemma. Hen kan sedan laga maten ett steg i taget, med stor text och tänd skärm, med mobilen lutad mot väggen (UJ-4, Flöde 4). Epicen gör färdigt receptvyn (FR-20) och bygger stegläget (FR-21). Allt ligger i modulen `recipes` och bygger på det som redan finns: `recipes/domain/scale.ts` (Story 3.3), mängdlogiken i `pantry/domain` (Story 2.4) och receptvyn med bock och ring per rad och "Lägg på matsedeln" (Story 1.7, 2.4 och 3.1). Epicen har inga nya tabeller och inga migrationer.

## Stories

- Story 4.1: Portioner och "X av Y hemma" i receptvyn
- Story 4.2: Stegläge med tänd skärm

## Requirements & Constraints

- **Portioner i receptvyn (FR-20):** portionsväljaren har − och + i steg om 1, minst 1. Mängderna skalas direkt. I receptvyn påverkar valet bara visningen, och inget sparas (EXPERIENCE.md, Portionsväljare). I en matsedelsrätt sparas portionerna, vilket redan är byggt i 3.1.
- **"X av Y hemma" (FR-20):** sammanfattningen visas för valt antal portioner, och varje receptrad visar om den finns i lagret. En saknad mängd visas i `sky-ink`. Status visas aldrig bara med färg. Bocken och ringen har olika form och ett namn för skärmläsare.
- **Layout (FR-20):** på mobil kommer bild, portioner, ingredienser och sedan steg. Från 1024 px ligger ingredienser och steg sida vid sida (EXPERIENCE.md, Responsive & Platform). Knapparna är "Lägg på matsedeln" (primär) och "Laga nu" (sekundär) (`docs/ux/ux-spec.md`, skiss 2). DESIGN.md tillåter högst en primärknapp per vy.
- **Stegläge (FR-21, UX-DR12):** helskärm med "Steg 1 av N" och stegets receptrader, skalade, ovanför stegtexten i `{typography.step}` (24 px, vikt 500, radhöjd 1,4). Knapparna Föregående och Nästa ligger i tumzonen. Ett steg utan kopplade receptrader visar bara texten. Svep åt vänster eller höger byter steg, men knapparna finns alltid. På dator byter piltangenterna steg. "Minska rörelse" stänger av animationen vid stegbyte. "Stäng" går tillbaka till receptvyn.
- **Tänd skärm (FR-21, AD-18):** stegläget håller skärmen tänd med Screen Wake Lock. Låset släpps när stegläget stängs och tas igen vid `visibilitychange` när sidan blir synlig. Om webbläsaren saknar stöd, eller om låset inte går att ta, visas en diskret rad överst: "Skärmen kan släckas i den här webbläsaren." Raden är inget fel (EXPERIENCE.md, State Patterns). Wake Lock kräver https. `localhost` räknas som säker miljö.
- **Plattform:** allt fungerar från 375 px och på dator, i ljust och mörkt läge, med 200 % textförstoring utan vågrät scroll och på svenska. Tryckytorna är minst 44 × 44 px.

## Technical Decisions

- **Modul (AD-1):** receptvyn och stegläget ligger i `src/features/recipes/ui/` (Capability Map: "FR-20, FR-21 Receptvy, stegläge – `recipes/ui` (Wake Lock i klienten, https krävs)"). Lagret läses bara via `pantry`:
  - ögonblicksbilden via `recipes/data/pantry-snapshot.ts` (`pantrySnapshotOrNull`, som anropar `pantry/server.ts`);
  - `recipeStatus`, `isShort`, `atHomeText` och typerna via `pantry/index.ts`, som är säker för klienten.

  Klientkomponenter får andra modulers actions som props från sidan. Det gäller till exempel `mealplan.addToCurrentPlan`.
- **Skalning (AD-7, AD-12):** skalning sker bara med `scaleFactor(servings, originalServings)` och `scaleLines(lines, factor)` i `recipes/domain/scale.ts`. En vag rad och en rad utan mängd skalas inte. Mängderna avrundas bara i `formatQuantity` (högst två decimaler och decimalkomma). Enheter räknas aldrig om.
  - Avrundningen uppåt till hela styck (st, förp, klyfta, kruka, knippe, skiva) gäller bara det som ska köpas på inköpslistan (beslut 2026-10-26). Den gäller inte receptvyn eller stegläget.
  - En receptrad utan katalogingrediens skalas aldrig. På inköpslistan får den i stället en multiplikator ("×2", "×1,5", beslut 2026-10-26).
- **Status (AD-7):** `recipeStatus(recipe, servings, snapshot)` är den enda källan till "Saknar N varor", "X av Y hemma" och täckningen per rad, nycklad på rad-id.
  - Behoven summeras per `(ingredientId, unit)` med `aggregateNeeds` och jämförs med `coverage`. Ögonblicksbildens summor avrundas till 1e-6.
  - N räknar distinkta katalogingredienser med `missing`, `partial` eller `other-unit`. Vaga rader räknas aldrig i N.
  - En rad utan katalogingrediens jämförs inte och räknas inte. Den visas med ett neutralt streck och skärmläsarnamnet "jämförs inte med lagret" (beslut 2026-10-26).
  - En mängd utan enhet jämförs som `st` (beslut 2026-10-26).
  - Varje recept jämförs mot hela lagret.
  - I dag ger `recipeStatus` bara `missingCount` och `lines`. 4.1 lägger till X och Y.
- **Statusen räknas i webbläsaren:** precis som för matsedelsrätten (3.1, beslut 2026-10-26) räknas statusen i klienten utifrån ögonblicksbilden. Då följer den portionsväljaren direkt, utan anrop till servern. `PantrySnapshot` är en `Map`, och den skickas redan som prop till en klientkomponent i `mealplan`.
- **Lagret går inte att läsa:** receptsidan visas ändå, utan statusetikett, markeringar och "X av Y hemma" (`pantry_unavailable` loggas, Story 2.4). Skalning och stegläge fungerar som vanligt.
- **Steg och receptrader:** `recipe_ingredient.step_id` pekar på radens första steg. En rad som AI:n kopplar till flera steg sparar bara det första, och stegläget visar raden vid första användningen (beslut 2026-10-25 i `docs/beslutslogg.md`). `SavedRecipeLine.stepId` finns redan i `getRecipe`. När ett steg tas bort blir `step_id` null.
- **Rendering (AD-18):** sidan läser id och session inuti `<Suspense>`. Komponenter med effekter städar upp i effektens cleanup. Wake Lock-låset släpps där och tas igen vid `visibilitychange`. Inga nya skrivningar, så `revalidateFor` ändras inte. `pantry_item` revaliderar redan `/recept` som layout.
- **Tester:** Vitest bredvid koden för domänen (`recipeStatus`) och klientkomponenterna (Testing Library, som `recipe-view.test.tsx`). Varje e2e-spec får en egen e2e-användare, som läggs till i `e2eEmails` i `tests/e2e/support.ts` och med storage state i `global-setup.ts`. Ingen migration behövs. Kör aldrig `supabase db reset`.

## UX & Interaction Patterns

- **Receptvyn** (skiss 2, `docs/ux/skisser/2-receptvy.html`): bild överst och titel med hjärta och meny. Under dem ligger en rad med portionsväljaren ("4 portioner" mellan − och +) och sammanfattningen "7 av 9 hemma". Statusetiketten ("Kan lagas nu" i mint eller "Saknar N varor" i ljusblått) står kvar (Flöde 1: "hamnar i receptvyn med etiketten 'Saknar 3 varor'").
  - Ingrediensraden har en grön bock i `accent` (finns) eller en blå ring i `sky-ink` (saknas), och mängden står till höger, i `sky-ink` när den saknas. En vag mängd visar originaltexten. "hemma: 1 kg" visas under en mängd i annan enhet eller en delvis täckt mängd.
  - Knapparna "Lägg på matsedeln" (primär) och "Laga nu" (sekundär) ligger i den fasta åtgärdsknappen (`FixedAction`) längst ned.
- **Portionsväljaren** (`Stepper` i `src/components/`): − och + har skärmläsarnamnen "Färre portioner" och "Fler portioner", och värdet står i en `output` med `aria-live="polite"` ("1 portion" / "N portioner"). En knapp vid gränsen är `aria-disabled` och ligger kvar i tabbordningen.
- **Stegläget** (ej skissat, beslut 2026-10-25): helskärm med "Steg N av M", stegets ingrediensrader ovanför texten i 24 px och Föregående och Nästa i tumzonen. Sektionen "Ingrediensrad" i EXPERIENCE.md gäller också i stegläget, så raderna har bock eller ring. Raden om Wake Lock står överst. "Stäng" finns alltid. Flöde 4: Pontus väljer 4 portioner, trycker "Laga nu", stegläget visar steg 1 av 6 i stor text, hen trycker Nästa med en ren knoge, och skärmen är fortfarande tänd vid steg 5 tjugo minuter senare.
- **Allmänt:** fel visas i en blå `Notice`, aldrig i rött. Status visas aldrig bara med färg. Det finns en synlig fokusram i `accent` och en logisk tabbordning. Esc stänger. "Minska rörelse" fångas globalt i `globals.css`. Texten är kort och saklig, med du-tilltal och utan utropstecken.

## Cross-Story Dependencies

- **Före epicen:** Epic 1–3 är byggda.
  - `getRecipe` ger steg och rader med `stepId`.
  - `recipeStatus`, `pantrySnapshotOrNull` och receptvyns markeringar kommer från 2.4.
  - `scale.ts` kommer från 3.3.
  - `AddToPlanButton` och `mealplan.addToCurrentPlan(recipeId, servings?, id)` kommer från 3.1. Actionen tar redan emot portioner.
  - `Stepper`, `FixedAction`, `Button` och `Notice` finns i `src/components/`.
- **4.1 före 4.2:** 4.1 gör receptvyn till en klientdel med valt antal portioner, skalade rader och status för portionerna. 4.2 lägger till "Laga nu" och stegläget och använder samma skalade rader och samma status.
- **Senare epics:** Epic 5 rangordnar efter `recipeStatus` (N). X och Y från 4.1 ändrar inte N.
- **Gren:** epicen byggs i en egen gren med PR till `main`. Alla sex kontroller och en kodgranskning krävs.
