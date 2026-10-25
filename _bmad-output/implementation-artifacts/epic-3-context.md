# Epic 3 Context: Matsedel och inköpslista

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan planera veckan med portioner och få en inköpslista per butiksavdelning där det som finns hemma redan är avdraget. Han kan bocka av med en hand i butiken, lägga till egna varor och lägga allt avbockat i lagret med ett tryck. Epicen bygger modulerna `mealplan` (`meal_plan`, `meal_plan_recipe`) och `shopping` (`shopping_check`, `shopping_line_override`, `shopping_custom_item`) och bygger `pantry.addToPantry`. Efter epicen fungerar kärnan (Epic 1–3) end-to-end lokalt, och molndriften är förberedd så att Pontus bara behöver skapa konton och följa en checklista. Epic 2 (lager och mängdlogik) är planerad men inte byggd, så epicen bygger på det API som Epic 2:s specar beskriver. "Skicka till ICA", produktval och `product_choice` hör till Epic 7.

## Stories

- Story 3.1: Lägga rätter på matsedeln
- Story 3.2: Tidigare matsedlar
- Story 3.3: Inköpslistan räknas fram
- Story 3.4: Bocka av i butiken
- Story 3.5: Egna varor
- Story 3.6: Rätta mängd och dölja listposter
- Story 3.7: Lägg i lagret efter handlingen
- Story 3.8: Förbered molndrift

## Requirements & Constraints

- **Matsedel:** det finns en aktuell matsedel med matsedelsrätter. Rätter läggs till, tas bort (med "Ångra" i 5 s och samma id) och får ändrade portioner. Nya rätter får receptets originalportioner. Samma recept får finnas flera gånger. En favorit läggs på matsedeln med högst två tryck. Varje matsedelsrätt visar lagningsstatus. En ny matsedel heter "Vecka <ISO-veckonummer>", och namnet går att ändra. Tidigare matsedlar visas nyast först, och "Använd igen" gör en ny aktuell matsedel av en tidigare. Rätter vars recept har tagits bort följer inte med.
- **Inköpslistan räknas fram:** mängderna skalas efter portioner. Samma katalogingrediens med samma enhet slås ihop över rätterna. En obegränsad lagervara ger ingen post. Lager i samma enhet dras av, och posten försvinner när lagret räcker. Olika enheter räknas aldrig om utan visas sida vid sida ("mjöl 2 dl (hemma: 1 kg)"). En vag rad blir en "Finns hemma?"-post utan mängd, men bara om ingrediensen saknas i lagret. Ungefär rätt räcker.
- **Omräkning:** när matsedeln eller lagret ändras räknas listan om utan besked. Bockar, egna varor, rättade mängder och dolda poster står kvar så länge listnyckeln är densamma.
- **I butiken:** posterna grupperas per butiksavdelning i fast ordning och visar "från [rätt]". Bocken är 44 × 44 px och sparas direkt. En avbockad post stannar genomstruken på sin plats.
- **Egna varor:** fritext som kan kopplas till en katalogingrediens och då hamnar under dess avdelning, annars under Övrigt. En egen vara slås aldrig ihop med receptposter.
- **Lägg i lagret:** ett tryck lägger alla avbockade poster i lagret på katalogingrediensens plats. Posterna försvinner från listan, och bekräftelsen säger "Lagt N varor i lagret.". Körs flödet igen efter ett avbrott ska lagret bli detsamma som efter en körning.
- **Dataisolering:** varje ny tabell får ett RLS-test där en anonym klient och en annan användare varken kan läsa eller skriva.
- **Svarstid och plattform:** listan svarar inom en sekund. Allt fungerar från 375 px och på dator, i ljust och mörkt läge och på svenska.
- **Molndrift (3.8):** inga konton skapas i epicen. Det som kräver Pontus hamnar i checklistan i `docs/oppna-fragor.md` och i `docs/drift.md`.

## Technical Decisions

- **Moduler och ägarskap:** `src/features/mealplan/` och `src/features/shopping/` med `{ui,actions,domain,data}`, `index.ts` och `server.ts`. ESLint-zonerna för båda finns redan. En modul läser andra moduler bara via deras `index.ts` och `server.ts`:
  - recept och receptrader via `recipes/server.ts`, där en läsfunktion för flera recept-id behövs;
  - avdelning och plats via `catalog/server.ts` (`getIngredientDefaults(ids)` från Story 2.2);
  - lagret via `pantry/server.ts`.

  En klientkomponent får inte importera en annan moduls actions. Sidan skickar ned dem som props, på samma sätt som `searchIngredients`. Därför behöver `recipes/server.ts` exportera `searchRecipes`, och receptvyns "Lägg på matsedeln" får sin action från sidan. `RecipeRow` och `IngredientPicker` ligger i `recipes/ui`. Det som `mealplan` och `shopping` behöver av dem flyttas till `src/components/`.
- **Aktuell matsedel:** `meal_plan.is_current` har ett partiellt unikt index per användare. `addToCurrentPlan(recipeId, servings?)` skapar den aktuella matsedeln om den saknas och lägger alltid till en ny `meal_plan_recipe`. Bara Postgres-funktionen `set_current_meal_plan(id)` byter aktuell matsedel och gör "Använd igen", i en transaktion (`security invoker`). Lista, bockar och överstyrningar gäller den aktuella matsedeln.
- **Referenser:**
  - Barntabellerna har sammansatta FK `(meal_plan_id, user_id)` med `cascade`. Inom aggregatet ingår även överlägget.
  - `meal_plan_recipe.recipe_id` är `on delete set null` och har `recipe_title` som ögonblicksbild. Använd kolumnlistan `on delete set null (recipe_id)` så att `user_id` inte nollas, på samma sätt som `recipe_ingredient.step_id`.
  - `shopping_custom_item.ingredient_id` är valfri och har `restrict`.
  - `recipes.deleteRecipe` (Story 1.11, inte byggd än) anropar först `mealplan.detachRecipe(recipeId)`, som tar bort rätten från den aktuella matsedeln. Tidigare matsedlar visar "Borttaget recept".
  - Radering är hård. "Ångra" anropar `restore*(row)` med samma id, så create-actions tar emot ett valfritt id.
- **Mängdlogik (Epic 2):** jämför bara via `pantry/domain`. `aggregateNeeds(lines, factor)` summerar per `(ingredientId, unit)`. `coverage(need, snapshot)` returnerar `covered`, `partial`, `other-unit`, `missing` eller `vague-missing`. Status per rätt kommer från `recipeStatus(recipe, servings, snapshot)` och lagret från `getPantrySnapshot()`. Varje rätt jämförs mot hela lagret, så en rätt kan visa "Kan lagas nu" medan listan föreslår samma vara. Det är avsiktligt. Skalning får bara ske i `recipes/domain/scale.ts`. Skapa filen om Epic 4 inte har gjort det. Enheter räknas aldrig om.
- **Listan (AD-8):** `shopping/domain/computeList({ plan, recipes, snapshot, catalog, overlay })` är den enda källan till listposter för vyn, "Lägg i lagret" och senare exporten. Ingen lista lagras. `overlay = { checks, overrides, customItems }`. Listnyckeln byggs bara i `shopping/domain/lineKey.ts`: `r:<ingredientId>:<unit|->` (`-` för vag), `t:<normaliserad text>` för en receptrad utan katalogingrediens, eller `c:<custom_item.id>`. Täckningsstatus ingår aldrig i nyckeln. `ShoppingLine = { key, ingredientId?, label, amount, unit, isVague, coverage, pantryNote?, section, origins: mealPlanRecipeId[], checked, isCustom }`. Tabeller: `shopping_check(meal_plan_id, line_key)` är unik och gäller även egna varor. `shopping_line_override(meal_plan_id, line_key, amount, hidden)` håller rättad mängd och dold post. `shopping_custom_item(meal_plan_id, label, ingredient_id?, amount, unit)` håller egna varor. Vid en katalogkoppling anropar `addCustomItem` `commitIngredients`. Avdelningarna kommer från `SECTIONS`, och en okänd avdelning blir Övrigt.
- **Lägg i lagret (AD-19):** `shopping/actions/putCheckedInPantry` skickar de avbockade posterna till `pantry.addToPantry(items)`, som byggs i epicen. Den ökar en rad med samma ingrediens, plats och enhet eller skapar en ny. En obegränsad vara ändras inte, en vag post blir obegränsad och en saknad plats blir katalogens plats. Därefter tas egna varor utan katalogkoppling bort, och bockar och överstyrningar för nycklarna rensas. Flödet går över flera moduler och ska vara idempotent i stället för atomärt. Underlaget säger inte vad som händer med en avbockad egen vara som har katalogkoppling. Bestäm det i 3.7 och skriv in beslutet i `docs/beslutslogg.md`.
- **Skrivningar:** varje skrivning är en Server Action som börjar med `requireUser()`, validerar med samma Zod-schema som formuläret och returnerar `Result`. Nya felkoder heter `mealplan_<orsak>` och `shopping_<orsak>` och får svensk text i `src/lib/errors.ts`. Efter skrivningen anropas `revalidateFor(table)`. Lägg till de nya tabellerna och lägg till `/matsedel` och `/lista` för `recipe` och `pantry_item`. Bockar och portioner använder `useOptimistic`.
- **Migrationer och tester:**
  - Migrationerna skapas med `supabase migration new` och följer mönstret med en policy, `revoke all` och grants till `authenticated` och `service_role`. Generera om `database.types.ts` efter varje migration, och kör aldrig `supabase db reset`.
  - `computeList`, `lineKey` och `addToPantry` testas med Vitest bredvid koden.
  - RLS testas med `expectRlsIsolation`.
  - Varje e2e-spec får en egen e2e-användare. Lägg till den i `e2eEmails` och storage state i `global-setup.ts`.
- **Drift (3.8):** ett schemalagt veckoflöde i GitHub Actions gör en krypterad `supabase db dump` med lösenfrasen från en hemlighet och sparar den som artefakt. Om hemligheterna saknas hoppar flödet över körningen med ett tydligt meddelande. Actions pinnas på huvudversion. `docs/drift.md` beskriver stegen:
  - Vercel `matkoll` i `arn1`, utan Supabase-variabler i förhandsmiljöer.
  - Supabase i `eu-north-1` med registreringen avstängd, Site URL, redirect-URL och e-postmall.
  - `pnpm users:sync` mot molnet.
  - `supabase db push` före koddriftsättning.
  - Cloudflare Tunnel och Access för LM Studio.

  Ett Playwright-flöde med mock körs i CI: logga in → importera från text → lägg på matsedeln → bocka av → lägg i lagret.

## UX & Interaction Patterns

- **Matsedel:** en matsedelsrätt visas som ett kort i stil med receptraden, med portionsväljaren (`Stepper`, minst 1, sparas) och en statusetikett. En tom matsedel visar "Ingen rätt på matsedeln än." och "Lägg till rätt". "Tidigare" ligger i rubriken. Arket Lägg till rätt har favoriter överst och sökning i biblioteket under. Ett tryck på en rad lägger till rätten och stänger arket. Receptvyn har knappen "Lägg på matsedeln" och visar en kort bekräftelse. Förhandsbekräftelse krävs bara för att ta bort recept och matsedlar.
- **Inköpslista:** rubriken är "Inköpslista" med veckan, antal rätter och antal varor kvar. Avdelningarna är sektionsrubriker. En listpost har bock (`CheckCircle`), varunamn, "från [rätt]" i metadata och mängden till höger. En avbockad post är genomstruken i `ink-3`, och bocken är fylld med `accent`. Varianterna är "2 dl (hemma: 1 kg)" och "Finns hemma?". Där betyder en bock "har köpt den eller har den redan". Skärmläsarnamnet följer mönstret "Paprika, röd, 1 st, inte avbockad".
  - Ett tryck på varunamnet öppnar arket Listpostdetalj med mängd, ursprung och "Ta bort". Produktval kommer i Epic 7.
  - Svep vänster (svepkomponenten från Story 2.3 i `src/components/`) är en genväg till "Ta bort". Borttagningen visar `useToast` med "Ångra".
  - Tomma lägen: "Lägg rätter på matsedeln så räknas listan fram." respektive "Allt finns hemma."
- **Lägg i lagret:** visas som primärknapp i `FixedAction` ovanför flikfältet när minst en post är avbockad. I Epic 7 hamnar den ovanför "Skicka till ICA". Efter flödet visas "Lagt N varor i lagret.", och lagningsstatus räknas om.
- **Allmänt:** ark staplas aldrig, och osparade ändringar ger frågan "Släng ändringarna?". Skelettrader visas efter 300 ms. Fel visas i en blå `Notice`, aldrig i rött. Status visas aldrig bara med färg. Bakgrundsändringar annonseras i en live-region. Inmatningsfält har minst 16 px text. Texten är kort och saklig, med du-tilltal och utan utropstecken.

## Cross-Story Dependencies

- **Före epicen:** Epic 2 måste vara byggd först. Den ger `pantry_item`, `getPantrySnapshot`, `aggregateNeeds`, `coverage`, `recipeStatus`, `setPantryItems`, svepkomponenten, `IngredientPicker` i `src/components/` och `getIngredientDefaults`. Story 1.11 ger `deleteRecipe`, som 3.1 kopplar till `detachRecipe`.
- **3.1 och 3.2:** 3.1 skapar `mealplan` med båda tabellerna och `addToCurrentPlan`. 3.2 lägger till `set_current_meal_plan()`.
- **3.3:** behöver 3.1 och Epic 2. Den skapar `shopping`, `computeList` och `lineKey`, men inga tabeller.
- **3.4–3.6:** var och en lägger till sin överläggstabell och bygger på 3.3. 3.5 och 3.6 använder bockarna från 3.4.
- **3.7:** behöver 3.4–3.6 och bygger `pantry.addToPantry`.
- **3.8:** kommer sist. E2E-flödet kräver hela kärnan.
- **Senare epics:** Epic 7 bygger exporten på `computeList` och `product_choice`. Epicen byggs i en egen gren med PR till `main`, och alla kontroller och en kodgranskning krävs.
