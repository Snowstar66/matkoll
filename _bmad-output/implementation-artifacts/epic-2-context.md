# Epic 2 Context: Lager

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan föra in det som finns hemma i Kyl, Frys och Skafferi, med eller utan mängd, och ändra eller ta bort det med ångra. Receptbiblioteket och receptvyn visar sedan direkt om ett recept kan lagas nu eller hur många varor som saknas. Epicen bygger modulen `pantry` med tabellen `pantry_item`, lagrets skrivoperationer och mängdlogiken (`aggregateNeeds`, `coverage`, `recipeStatus`). Matsedeln, inköpslistan (Epic 3), "X av Y hemma" och portioner (Epic 4), filtret "Kan lagas nu" med rangordning (Epic 5) och bildanalysen (Epic 6) bygger alla på den. Kameraknappen och lagerförslag hör till Epic 6. "Lägg i lagret" (`addToPantry`) hör till Epic 3.

## Stories

- Story 2.1: Se lagret per plats
- Story 2.2: Lägga till och ändra lagervaror
- Story 2.3: Ta bort lagervara med ångra
- Story 2.4: Lagningsstatus i receptbiblioteket

## Requirements & Constraints

- **Lagervara:** varje lagervara pekar på en katalogingrediens. Pontus söker i katalogen på namn och synonymer, eller skapar en ny katalogingrediens med namn, avdelning och plats. Mängd och enhet är valfria. Utan mängd blir varan **obegränsad** och räcker alltid. Platsen föreslås från katalogingrediensen och kan ändras.
- **Visning per plats:** tre platskort med antal varor. Varor med mängd visas som rader med mängden till höger. Obegränsade visas som etiketter under "Finns hemma".
- **Borttagning:** ingen fråga i förväg. Bekräftelsen visar "Ångra" i 5 s, och ångra ger tillbaka raden med samma id.
- **Lagningsstatus:** varje recept i biblioteket och receptvyn visar "Kan lagas nu" eller "Saknar N varor". Varje ingrediensrad i receptvyn visar bock (finns) eller ring (saknas). Statusen räknas om när lagret ändras. Varje recept jämförs mot hela lagret, utan att lagret fördelas mellan rätter.
- **Ungefär rätt räcker:** inga exakta lagermängder, ingen omräkning mellan enheter och inget automatiskt avdrag efter matlagning.
- **Dataisolering:** `pantry_item` får RLS-test: varken en anonym klient eller en annan användare får läsa eller skriva.
- **Svarstid:** Hemma och biblioteket svarar inom en sekund. Allt fungerar från 375 px bredd och på dator, i ljust och mörkt läge och på svenska.

## Technical Decisions

- **Modul och ägarskap:** `src/features/pantry/{ui,actions,domain,data}` med `index.ts` (typer och domain, säker i klienten) och `server.ts` (`server-only`). ESLint-zonen för `pantry` finns redan. Bara `pantry` läser och skriver `pantry_item`. Katalogdata (namn, plats) hämtas via `catalog/server.ts` och läses aldrig direkt från `ingredient`. I dag exporterar katalogen `searchIngredients` (Server Action som sidan skickar ned till klientkomponenten), `commitIngredients` och `getIngredientNames`. Platsen för en ingrediens kräver en ny exporterad läsfunktion i `catalog`. `recipes` får statusen genom att anropa `pantry` via dess `index.ts` och `server.ts`.
- **Tabell:** `pantry_item(id, user_id, ingredient_id, location, amount numeric null, unit null, created_at)`. Den är unik på `(user_id, ingredient_id, location, unit)` med `nulls not distinct`, och obegränsad vara har `unit` och `amount` `null`. Den sammansatta främmande nyckeln `(ingredient_id, user_id)` mot `ingredient(id, user_id)` har `on delete restrict`. Följ mönstret i katalogmigrationen: `user_id default auth.uid()` med cascade mot `auth.users`, en policy `user_id = (select auth.uid())` för alla operationer, `revoke all` och sedan grants till `authenticated` och `service_role` (aldrig `anon`). Lägg `check`-listor för `location` och `unit` som är identiska med `LOCATIONS` och `UNITS`. Skapa migrationen med `supabase migration new` och generera sedan om `database.types.ts`. CI fäller typdrift. En atomär skrivning görs som Postgres-funktion med `security invoker`.
- **Skrivoperationer (de enda):** `setPantryItems(items)` sätter mängden exakt för ingrediens, plats och enhet och skapar raden vid behov. Den används av arket Lagervara och senare av lagerförslag. `removePantryItem(id)` returnerar den borttagna raden. `restorePantryItem(row)` sätter tillbaka den med samma id, så create-vägen tar emot ett valfritt id. `addToPantry(items)` ökar en rad eller skapar den, men ändrar inget om ingrediensen redan är obegränsad. Den byggs för Epic 3 och betyder något annat än `set`. En ny katalogingrediens skapas bara i den sparande actionen, via `commitIngredients` med `{ kind: 'new', proposal: { name, section, location, defaultUnit } }`.
- **Läsning:** `listPantry(location)` används av vyn. `getPantrySnapshot(): Map<ingredientId, { unlimited, amounts: { unit, amount }[] }>` summerar över platser och är det enda som `coverage` tar emot.
- **Mängdlogiken i `pantry/domain`, och bara där:** `aggregateNeeds(lines, factor)` summerar behov per `(ingredientId, unit)`. `coverage(need, snapshot)` returnerar `covered`, `partial` (kvarvarande mängd), `other-unit` (lagrets mängder), `missing` eller `vague-missing`. En vag rad är täckt om ingrediensen finns i någon form. `recipeStatus(recipe, servings, snapshot)` ger status och N, där N är antalet distinkta katalogingredienser med `missing`, `partial` eller `other-unit`. Vaga rader räknas inte. Skalning efter portioner får bara finnas i `recipes/domain/scale.ts`, som inte finns ännu. Biblioteket använder originalportionerna. Hur receptrader utan katalogingrediens (`ingredientId = null`) ska räknas står inte i underlaget. Bestäm det i 2.4 och skriv in det i beslutsloggen.
- **Enheter och mängder:** använd bara `normalizeUnit`, `parseQuantity` (klarar "1,5" och "½") och `formatQuantity` från `catalog`. Avrundning sker bara i `formatQuantity`. Platser kommer från `LOCATIONS` och `locationSchema`.
- **Actions och fel:** varje skrivning är en Server Action som börjar med `requireUser()` och validerar med samma Zod-schema som formuläret. Den returnerar `Result` från `src/lib/errors.ts`. Nya felkoder heter `pantry_<orsak>` och får en svensk text. Efter skrivningen anropas `revalidateFor('pantry_item')`. Lägg till `pantry_item` i `src/lib/revalidate.ts` med `/hemma` och `/recept` som layout, så att `/recept/[id]` följer med. `/matsedel` och `/lista` läggs till när de visar lagret.
- **Rendering:** sidor läser via `server.ts` i en komponent inom `<Suspense>` efter `requireUserOrRedirect`, som `hemma/page.tsx` gör i dag. Ingen `'use cache'`. Formulär använder `useActionState`, växlingar `useOptimistic`.
- **Tester:** domänfunktionerna testas med Vitest bredvid koden. Testa reglerna för täckt, delvis, annan enhet, saknas, vag och obegränsad. RLS testas med `expectRlsIsolation('pantry_item', …)` i `tests/integration/`, och en katalogingrediens skapas först med ägarens klient. Utöka `tests/design/catalog-checks.test.ts` eller ett motsvarande test så att `check`-listorna jämförs. E2E skrivs med Playwright och `AI_PROVIDER=mock` i `tests/e2e/`.

## UX & Interaction Patterns

- **Hemma:** tre platskort i rad: Kyl (mint), Frys (ljusblå) och Skafferi (sand). Varje kort har ikon (`FridgeIcon`, `FreezerIcon` och `PantryIcon` finns), namn och "12 varor". Valt kort har 2 px ram i `accent`. Ett tryck väljer plats, och listan och förvald plats för "+" följer valet. Rubrikerna "Med mängd" och "Finns hemma" är sektionsrubriker. Obegränsade varor visas som runda etiketter (mint och mint-ink), och ett tryck öppnar arket. En tom plats visar "Inget i kylen än." (eller frysen eller skafferiet) och "Lägg till vara".
- **Arket Lagervara:** öppnas med "+" eller ett tryck på en vara. Vald plats är förvald. Arket innehåller sökning i katalogen (`SearchField`, 200 ms), mängd, enhet och plats, och "Ta bort" för en befintlig vara. Arket staplas aldrig. Osparade ändringar ger "Släng ändringarna?" (`Sheet` med `isDirty`). Inmatningsfält har minst 16 px text. `IngredientPicker` ligger i `recipes/ui` och kan inte importeras från `pantry`. Flytta den gemensamma delen till `src/components/`, eller bygg en egen.
- **Svep vänster för "Ta bort":** svepet är en genväg och samma åtgärd finns i arket. Det finns ingen svepkomponent än. Bygg den i `src/components/`, eftersom listposter och matsedelsrätter ska använda den i Epic 3. Kort bekräftelse ges med `useToast().showToast(text, { onUndo })`, som redan visar "Ångra" i 5 s och använder en live-region.
- **Status:** "Kan lagas nu" visas med `StatusBadge status="ok"` och "Saknar N varor" med `status="missing"`. Ingrediensraden får grön bock i `accent` eller blå ring i `sky-ink`, och mängden visas i `sky-ink` när den saknas. En vag rad visar originaltexten. Status förmedlas aldrig bara med färg. Bock och ring har olika form och skärmläsarnamn.
- **Text:** kort, saklig svenska med du-tilltal, utan utropstecken. Inget rött används. Fel visas i en ljusblå `Notice`. Tryckytor är minst 44 px. Laddning visas med `Skeleton` efter 300 ms.

## Cross-Story Dependencies

- 2.1 skapar tabellen, modulen, `listPantry` och `getPantrySnapshot`. 2.2 och 2.3 bygger på den. 2.2 lägger till `revalidateFor('pantry_item')` och den nya katalogfunktionen för plats. 2.3 återanvänder arket från 2.2. 2.4 behöver snapshot från 2.1, men inte 2.2 eller 2.3.
- 2.4 lägger status på receptlistan från Story 1.10 (`listRecipes` och `searchRecipesIn` i `recipes/data/queries.ts`, `RecipeListItem`, pågår på `epic/1-receptimport`) och på `IngredientRow` i `recipes/ui/recipe-view.tsx`. Listan behöver receptraderna, eller en färdig status, per recept.
- Senare epics använder detta. Epic 3 använder `addToPantry`, snapshot och `coverage` i `computeList`, samt status per matsedelsrätt. Epic 4 använder `recipeStatus` för "X av Y hemma" och `scale.ts`. Epic 5 använder N för filtret och rangordningen. Epic 6 använder `setPantryItems`, arket Lagervara förifyllt (Rätta) och kameraknappen på Hemma. Håll funktionernas signaturer enligt arkitekturen.
- Epicen byggs i en egen gren med PR till `main`. Alla kontroller och en kodgranskning krävs.
