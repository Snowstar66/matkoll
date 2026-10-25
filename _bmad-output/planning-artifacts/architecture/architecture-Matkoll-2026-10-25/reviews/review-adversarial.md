---
title: 'Adversariell granskning – ARCHITECTURE-SPINE.md (Matkoll)'
reviewed: _bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md
against: _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md (+ addendum.md, EXPERIENCE.md)
lens: 'Två enheter en nivå ned som båda följer varje AD ordagrant men ändå bygger inkompatibelt'
date: 2026-10-25
---

# Adversariell granskning av arkitekturryggraden

## Omdöme

**Inte redo för parallellt byggande av epics.** Lagerregler, säkerhet (AD-3, AD-4, AD-11, AD-14) och AI-porten är skarpa. Hålen sitter i de **delade datakontrakten**: ryggraden namnger ägare och funktioner (`resolveIngredient`, `coverage`, `computeList`, `line_key`, `RecipeDraft`) men låser inte deras signaturer, nycklar, sidoeffekter eller skrivsemantik. Två agenter som bygger Epic 1, 2, 3, 6 och 7 var för sig kan följa varje AD och ändå leverera delar som inte passar ihop. Sex fynd är höga och bör stängas innan första story startar. Fynd 1–4 hindrar bygget av Epic 1–3, som är kärnan.

| # | Allvar | Kort | Berörda AD |
| --- | --- | --- | --- |
| 1 | Hög | `resolveIngredient` har okänd signatur, sidoeffekter och AI-väg | AD-6, AD-9, AD-10 |
| 2 | Hög | Listpostens identitet (`line_key`) och överlägget är ofullständiga | AD-8, AD-16 |
| 3 | Hög | Lagervarans identitet och skrivsemantik (lägg till, öka eller ersätt) | AD-6, AD-7, AD-8 |
| 4 | Hög | `coverage` säger inte om behov summeras före jämförelsen | AD-7, AD-8 |
| 5 | Hög | Läsvägen mellan moduler motsäger sig själv, och portar når inte sina data | AD-1, AD-9, AD-10, AD-11 |
| 6 | Hög | Referensintegritet: sammanslagning i katalogen, borttagna recept, FK-regler | AD-4, AD-6, AD-8 |
| 7 | Medel | Startdata per användare (receptsajter, butik) saknar ägare | AD-4, AD-5, AD-11 |
| 8 | Medel | Flerstegsskrivningar över moduler är inte atomära | AD-1, AD-2, AD-8 |
| 9 | Medel | Produktval: två möjliga ägare och ingen nyckel | AD-1, AD-16 |
| 10 | Medel | `recipe.source` blandar URL och typ | AD-10 |
| 11 | Medel | Aktuell matsedel: skapas automatiskt? dubbletter? byte av aktuell? | AD-8 |
| 12 | Medel | Omvalidering efter skrivning täcker inte härledda vyer | Konvention "Cache och uppdatering", AD-7 |
| 13 | Medel | "Ångra" efter borttagning: mjuk eller hård radering | AD-4, AD-7 |
| 14 | Medel | Får Route Handlers under `api/ai/*` skriva? | AD-2, AD-9 |
| 15 | Medel | Enhetsnormalisering (`"deciliter"` → `dl`) saknar en enda funktion | AD-12 |
| 16 | Låg | Kapplöpning ger dubbletter i katalogen (ingen unik nyckel på `ingredient`) | AD-6 |
| 17 | Låg | Enhetskolumnens databastyp, felkodsregistret och "förp/paket" | AD-12, AD-13 |

---

## Höga fynd

### 1. `resolveIngredient` – signatur, sidoeffekter och AI-väg är olåsta

**Allvar:** Hög

**Enhet A – Epic 1, story "Förhandsgranskning" (FR-5, FR-6).** UX kräver att förhandsgranskningen visar katalogkopplingen med "Kontrollera" och "Ny" innan något sparas. Agenten anropar därför `catalog.resolveIngredient(text)` i `/api/ai/import` för varje rad och lägger `ingredientId` i `RecipeDraft`. AD-6 säger att funktionen "skapar annars en ny katalogingrediens", så varje förhandsgranskning skapar katalogposter, även för recept som aldrig sparas. För steget "AI-förslag" lägger agenten till `AiService.matchIngredient` i porten.

**Enhet B – Epic 1, story "Spara recept" (en annan agent).** Följer AD-10 ordagrant: `saveRecipe(draft)` "kopplar varje rad via `catalog.resolveIngredient`". Den löser alltså om varje rad från originaltexten och skriver över Pontus rättning i förhandsgranskningen. Rättningen sparas inte heller som synonym, eftersom `resolveIngredient(text)` inte tar emot något val.

**Enhet C – Epic 6, "Lagerförslag" (FR-24, FR-25).** Anropar `resolveIngredient` i `/api/ai/analyze` för att koppla förslagen. Avvisade lagerförslag har då redan skapat katalogingredienser, vilket bryter mot FR-25 ("Avvisade lagerförslag sparas inte").

**Enhet D – Epic 2, "Lagervara-arket" (FR-11).** Ska kunna "skapa en ny katalogingrediens" med namn, avdelning och plats. Det går inte via `resolveIngredient(text)`, så agenten bygger en egen `catalog.createIngredient`. Den anropar inte AI-steget, så samma text kan ge olika resultat i lager och import.

**Varför alla följer AD:erna:** AD-6 anger ordningen och ägaren men inte om funktionen är ren eller skriver, vad den tar emot och returnerar, när AI-steget körs (AiService har ingen sådan metod i AD-9) eller hur en rättning kommer in.

**Föreslagen AD (ersätter regeltexten i AD-6):**

> **AD-6 – Ingredienskatalogen äger matchningen.** Bara `catalog` skriver `ingredient` och `ingredient_synonym`. Matchning sker i två steg:
> 1. `catalog.matchIngredients(items: { text: string; hint?: IngredientHint }[]): IngredientMatch[]` är **skrivfri**. Den matchar i ordningen normaliserat namn, sedan synonym. Utan träff returneras `{ kind: 'new', proposal: { name, aisle, location, defaultUnit } }`, byggd från `hint`. `hint` kommer från AI-svaret som redan finns: `parseRecipe` och `analyzeImage` returnerar för varje rad ett förslag på katalognamn, avdelning, plats och enhet. Det finns inget separat AI-anrop för matchning, och `AiService` har bara de tre metoderna i AD-9. Svaret är `{ kind: 'match', ingredientId, confidence: 'exact' | 'synonym' | 'ai' }` eller `{ kind: 'new', proposal }`.
> 2. `catalog.commitIngredients(choices: IngredientChoice[]): Map<originalText, ingredientId>` anropas **bara** från en sparande action (`saveRecipe`, `confirmPantrySuggestions`, `upsertPantryItem`, `addCustomItem`). Den skapar nya katalogingredienser och sparar originaltexten som synonym när Pontus valt en annan ingrediens än förslaget.
>
> Förhandsgranskning, bildanalys och AI-förslag anropar bara steg 1. Ingenting skrivs till katalogen förrän Pontus sparar eller bekräftar. `RecipeDraft`-rader bär `ingredient: IngredientMatch | { kind: 'chosen', ingredientId }`, och `saveRecipe` respekterar raden som den är. Den matchar inte om.

---

### 2. Listpostens identitet (`line_key`) och överlägget är ofullständiga

**Allvar:** Hög

**Enhet A – Epic 3, story "Avbockning" (FR-16, FR-18).** Läser AD-8 ("ingrediens + enhet + typ") och bygger `line_key = \`${ingredientId}:${unit}:${coverageStatus}\``, där typ betyder `partial`, `missing`, `other-unit` eller `vague-missing`. När lagret ändras från `missing` till `partial` byter posten nyckel och bocken försvinner, i strid med FR-18.

**Enhet B – Epic 3, story "Egna varor" (FR-17, en annan agent).** Egna varor saknar ofta ingrediens ("diskmedel"), så agenten lägger en kolumn `checked boolean` på `shopping_custom_item` i stället för en rad i `shopping_check`. En egen vara "mjölk" som kopplats till katalogen visas som en separat rad bredvid receptens "mjölk 3 dl", eftersom `computeList(plan, recipes, pantry)` inte tar emot egna varor.

**Enhet C – Epic 3, story "Listpostdetalj" (EXPERIENCE.md: "Rätta mängd", svep "Ta bort" på listpost).** AD-8 lagrar bara bockar och egna varor, så en rättad mängd eller en borttagen beräknad post har ingenstans att ta vägen. Agenten skapar `shopping_line_override` och tillämpar den i UI-lagret.

**Enhet D – Epic 7, `exportBasket` (FR-26).** Är ren och tar `computeList`-utdata. Den ser inte överstyrningarna från enhet C och inte bockarna i enhet B:s kolumn. Exporten innehåller då poster som Pontus tagit bort eller redan bockat av, och fel mängder.

**Varför alla följer AD:erna:** AD-8 säger inte vad "typ" är, hur nyckeln serialiseras, hur `null`-enhet skrivs, hur egna varor bockas av eller slås ihop, eller hur mängdrättning och borttagning lagras. Signaturen för `computeList` utelämnar överlägg och katalog, men listan grupperas per avdelning enligt FR-16.

**Föreslagen AD (ersätter regeltexten i AD-8):**

> **AD-8 – Inköpslistan räknas fram vid läsning.** `shopping/domain/computeList(input: ShoppingInput): ShoppingLine[]` är den enda källan till listposter för vyn, "Lägg i lagret" och `exportBasket`. `ShoppingInput = { plan, recipes, pantry, catalog (namn, avdelning per ingredientId), overlay }`. `overlay = { checks: Set<LineKey>, customItems, overrides: Map<LineKey, { amount: number | null } | 'hidden'> }`.
> **`LineKey`** byggs bara av `shopping/domain/lineKey.ts`:
> - receptpost: `r:<ingredientId>:<unit|'-'>`, där vag mängd ger `'-'`. Täckningsstatus ingår **aldrig**.
> - egen vara: `c:<shopping_custom_item.id>`.
>
> Alla bockar, även för egna varor, ligger i `shopping_check(meal_plan_id, line_key)`, unik på `(meal_plan_id, line_key)`. Egna varor slås aldrig ihop med receptposter. De visas som egna rader i katalogingrediensens avdelning, eller i Övrigt om de saknar ingrediens. Rättad mängd och dold post lagras i `shopping_line_override(meal_plan_id, line_key, amount numeric null, hidden bool)`. `ShoppingLine` har `{ key, ingredientId?, label, amount, unit, isVague, coverage, pantryNote?, aisle, origins: mealPlanRecipeId[], checked, isCustom }`. Vyn, `putCheckedInPantry` och `exportBasket` får bara läsa `ShoppingLine[]`. Ingen av dem tillämpar överlägg själv.

---

### 3. Lagervarans identitet och skrivsemantik

**Allvar:** Hög

**Enhet A – Epic 2, "Lagervara-arket" (FR-11).** "+" skapar alltid en ny `pantry_item`. Det kan alltså finnas två rader "mjölk 1 l, Kyl". Det strider inte mot någon AD.

**Enhet B – Epic 3, "Lägg i lagret" (FR-19: "ökar en befintlig med samma enhet").** Agenten anropar en pantry-action och väntar sig "öka om det finns, annars skapa". Vilken plats som gäller är oklart: katalogingrediensens plats enligt FR-19, eller den plats där varan redan finns? Om smör redan är obegränsat (mängd `null`), blir `null + 1 st` då `1 st`, så att varan slutar vara obegränsad, eller förblir den `null`?

**Enhet C – Epic 6, "Bekräfta lagerförslag" (FR-25).** Ett foto visar vad som finns **nu**, så rätt semantik är "sätt" och inte "lägg till". Om agenten återanvänder B:s action räknas mjölken dubbelt varje gång kylen fotograferas. Om den bygger en egen `setPantryItem` finns två skrivvägar med olika regler för samma tabell.

**Enhet D – `coverage.ts` (AD-7).** Får in lagret, men i vilken form? En rad per ingrediens, flera rader per ingrediens (flera platser eller enheter) eller summerade per enhet? A skapar flera rader, och B och C antar en.

**Varför alla följer AD:erna:** Ingen AD anger den unika nyckeln för `pantry_item` eller vilka skrivoperationer lagret har. AD-8 säger bara att B "skriver lagervaror via `pantry`-actions".

**Föreslagen AD (ny):**

> **AD-18 – Lagervarans identitet och skrivoperationer.** `pantry_item` är unik på `(user_id, ingredient_id, location, unit)`, med `unit` `null` för obegränsad (`unique nulls not distinct`). `pantry` exporterar exakt tre skrivoperationer, och alla andra moduler använder dem:
> - `addToPantry(items)`: ökar en befintlig rad med samma ingrediens, plats och enhet. Annars skapas en rad. Om ingrediensen redan finns som obegränsad på någon plats ändras ingenting. Plats som saknas sätts till katalogingrediensens plats. (Används av "Lägg i lagret".)
> - `setPantryItems(items)`: sätter mängden exakt och skapar raden vid behov. (Används av lagervara-arket och bekräftade lagerförslag.)
> - `removePantryItem(id)`.
>
> `pantry` exporterar läsfunktionen `getPantrySnapshot(): PantrySnapshot`, som är `Map<ingredientId, { unlimited: boolean; amounts: { unit, amount }[] }>`, summerad över platser. `coverage` tar bara emot `PantrySnapshot`.

---

### 4. `coverage`: summeras behoven före jämförelsen?

**Allvar:** Hög

**Enhet A – Epic 3, `computeList` (FR-15).** Summerar skalade behov per `(ingrediens, enhet)` över hela matsedeln och anropar `coverage` en gång. Två rätter som behöver 2 dl grädde var, med 3 dl hemma, ger listposten "grädde 1 dl".

**Enhet B – Epic 3, "Matsedelsrätt" med lagningsstatus (FR-13), byggd av en annan agent.** Anropar `coverage` per receptrad mot hela lagret, precis som receptbiblioteket gör. Båda rätterna visas som "Kan lagas nu", medan listan säger att grädde ska köpas.

**Enhet C – Epic 5, rangordning (FR-22).** Räknar "saknade varor" per receptrad (två rader med lök räknas två gånger), medan Epic 1:s "Saknar N varor" räknar per katalogingrediens. Samma recept får olika N i biblioteket och i "Kan lagas nu".

**Varför alla följer AD:erna:** AD-7 gör `coverage` till den enda jämförelsen men säger inte vad som jämförs (rad, summa per recept eller summa per matsedel) eller hur N räknas. Det är just den skillnad som AD-7 ska förhindra.

**Föreslagen skärpning (läggs till i AD-7):**

> Behov summeras per `(ingredientId, unit)` **innan** `coverage` anropas. Det görs bara med `pantry/domain/aggregateNeeds(lines, portionsFactor)`. Lagningsstatus för ett recept eller en matsedelsrätt beräknas av `pantry/domain/recipeStatus(recipe, servings, snapshot)`. Den jämför receptets egna summerade behov mot hela lagret och fördelar inte lagret mellan rätter. "Saknar N" är antalet **distinkta katalogingredienser** med status `missing`, `partial` eller `other-unit`. `vague-missing` räknas inte. Rangordningen (FR-22) och "X av Y hemma" (FR-20) använder `recipeStatus`. Inköpslistan summerar över hela matsedeln. Att listan och statusetiketten kan skilja sig när två rätter delar en vara är avsiktligt, och UI:t visar det inte som ett fel.

---

### 5. Läsvägen mellan moduler motsäger sig själv, och portar når inte sina data

**Allvar:** Hög

**Motsägelse i ryggraden:** AD-1 säger att andra moduler går via "dess `actions` eller exporterade läsfunktioner". Raden under diagrammet säger att `index.ts` exporterar bara `domain` och `actions`, "aldrig dess `data`". Läsfunktioner bor i `data`.

**Enhet A – Epic 3, `shopping/actions/putCheckedInPantry`.** Behöver recept, lager och matsedel. Enligt diagrammet läser agenten dem via de andra modulernas **Server Actions** (`pantry/actions/listPantry`, med `"use server"`). Varje exporterad funktion i en `"use server"`-fil blir en publik POST-slutpunkt, så lagret går att läsa via en ny väg utanför Server Components.

**Enhet B – Epic 2, pantry.** Följer AD-1:s "exporterade läsfunktioner" och exporterar `getPantry` från `pantry/data` via `index.ts`. ESLint-regeln från diagrammet stoppar enhet A från att importera den. De två epics går inte att slå ihop utan att lint-regeln ändras.

**Enhet C – Epic 1, `src/server/fetch` (AD-11).** Måste läsa `recipe_site`. Enligt diagrammet får portar bara bero på `env`, inte på `lib/supabase` eller `settings`. En agent låter porten fråga Supabase direkt, vilket bryter mot diagrammet men fungerar. En annan låter `recipes/actions` skicka med listan. Testerna i CI för domänkontrollen ser olika ut beroende på vilket val agenten gjorde.

**Enhet D – Epic 1 och Epic 5, AI-svar.** AD-10 kräver att parseRecipe och suggestDishes "returnerar en `RecipeDraft`". AD-9 kräver att schemat ligger "i porten", och porten får inte importera `recipes/domain`. Epic 1 och Epic 5 bygger därför var sitt portschema och var sin mappning till `RecipeDraft`, med olika regler för vaga mängder och okända enheter.

**Föreslagen AD (ersätter sista meningen under diagrammet och skärper AD-1, AD-9 och AD-11):**

> En modul exporterar via `index.ts`: sin `domain`, sina **skrivande** actions och sina **läsfunktioner** från `data/queries.ts` (märkt `server-only`, utan `"use server"`). Andra modulers `data/*` i övrigt, och deras `ui`, får inte importeras. Server Actions används aldrig för att läsa.
> Portar (`src/server/*`) importerar aldrig `lib/supabase` eller `features/*`. Allt de behöver från databasen skickas in som argument, t.ex. `safeFetch(url, { allowedDomains })`. Domänlistan läses av anroparen via `settings`-läsfunktionen.
> AI-portens svarsscheman (`src/server/ai/schemas.ts`) är den gemensamma formen för AI-svar. `recipes/domain/fromAiRecipe(aiRecipe): RecipeDraft` är den **enda** mappningen. Den används för import från länk (även JSON-LD), text och foto och för AI-förslag. `parseRecipe` och `suggestDishes` returnerar samma `AiRecipe`-schema.

---

### 6. Referensintegritet: sammanslagning i katalogen, borttagna recept, FK-regler

**Allvar:** Hög

**Enhet A – Epic 1, catalog "slå ihop" (AD-6 nämner sammanslagning).** Får bara skriva sina egna tabeller (AD-1). Agenten slår ihop genom att radera förlorarens `ingredient` och förlitar sig på FK:erna.

**Enhet B – Epic 2, migrationen för `pantry_item`.** Väljer `ingredient_id ... on delete cascade` (samma mönster som `user_id` i AD-4). När katalogen slår ihop "lök" med "gul lök" försvinner lagervarorna. Epic 1:s `recipe_ingredient` har kanske `on delete restrict`, så sammanslagningen misslyckas med ett generiskt fel. `shopping_check.line_key` och `shopping_line_override` innehåller `ingredientId` som text, och de raderna blir föräldralösa utan att något märks.

**Enhet C – Epic 1, "Ta bort recept" (FR-10) mot Epic 3:s `meal_plan_recipe`.** Epic 3 väljer `restrict` för att skydda tidigare matsedlar (FR-14). Epic 1:s borttagning ger då ett FK-fel som inte är någon kod i `errors.ts`. Väljer Epic 3 i stället `cascade`, ändras gamla matsedlar och den aktuella inköpslistan utan besked.

**Enhet D – Epic 1, "Ändra recept" (FR-6, FR-10).** Om redigeringen återanvänder `saveRecipe` och raderar och skapar `recipe_ingredient` på nytt, får raderna nya id. Epic 4:s stegkoppling (addendum: "ev. stegkoppling", FR-21) refererar rad-id och tappas.

**Föreslagen AD (ny):**

> **AD-19 – Referenser och borttagning.** FK mellan feature-tabeller är `on delete restrict`. Bara `user_id` har `cascade` (AD-4). En borttagning som berör en annan modul görs av ägarmodulen genom att anropa den andra modulens exporterade action **före** sin egen radering:
> - Recept: `mealplan.detachRecipe(recipeId)` tar bort raden från **aktuell** matsedel och behåller den i tidigare matsedlar via `meal_plan_recipe.recipe_snapshot_title`. Därefter raderas receptet. Tidigare matsedlar visar "Borttaget recept".
> - Sammanslagning i katalogen: `catalog.mergeIngredients(from, to)` sätter `ingredient.merged_into_id = to` och anropar `repointIngredient(from, to)` som recipes, pantry, shopping och product_choice exporterar. Shopping skriver om `line_key` i sina överläggstabeller. `from` raderas inte.
>
> Redigering av ett sparat recept sker med `updateRecipe(id, draft)`, som behåller `recipe_ingredient.id` för rader som finns kvar. Stegkoppling i `RecipeDraft` anges med radindex, och `saveRecipe` och `updateRecipe` översätter index till id.

---

## Medelhöga fynd

### 7. Startdata per användare saknar ägare

**Enheter:** Epic 1 "Godkända receptsajter" (FR-7) mot Epic 7 "Byta butik" (FR-28) och Epic 1 auth.
**Krock:** AD-4 kräver `user_id not null default auth.uid()` på varje tabell, också `recipe_site` och `store`. Ryggraden säger att `recipe_site` "seedas" med koket.se och tasteline.com, men `seed.sql` körs utan inloggad användare och inte alls vid `supabase db push`. Epic 1 seedar för en hårdkodad testanvändare, så import fungerar lokalt men aldrig i molnet. Epic 7 lägger standardbutiken (Maxi ICA 1003733) i `auth/callback` vid första inloggning. Startdata skapas då på två sätt, och import i molnet saknar godkända sajter.
**Föreslagen AD:**
> **AD-20 – Startdata per användare.** `auth`-modulens `ensureUserDefaults()` anropas i `auth/callback` efter lyckad inloggning och är idempotent (`insert … on conflict do nothing`). Den anropar exporterade `seedDefaults()` i `settings` (koket.se, tasteline.com, standardbutik) och i andra moduler som behöver startdata. `seed.sql` innehåller bara testanvändare och anropar samma funktioner.

### 8. Flerstegsskrivningar över moduler är inte atomära

**Enheter:** Epic 3 "Lägg i lagret" (AD-8) mot Epic 2 pantry-reglerna (fynd 3).
**Krock:** AD-8 kräver lagerskrivning och rensning av överlägget "i samma action". supabase-js har inga transaktioner. Agent A skriver en Postgres-funktion `put_checked_in_pantry()` som rör både `pantry_item` och `shopping_check`. Den följer AD-1 i bokstaven (SQL ligger inte i någon `data`-mapp) men kringgår pantry-reglerna i TypeScript, som obegränsad vara och ökning. Agent B gör två anrop efter varandra. Ett avbrott i mitten och ett nytt tryck lägger varorna i lagret två gånger.
**Föreslagen AD (tillägg till AD-1):**
> Skrivningar som måste vara atomära görs med en Postgres-funktion (`security invoker`) i ägarmodulens migration, som anropas via ägarens `data`. En funktion skriver bara sin egen moduls tabeller. Flöden över moduler görs idempotenta i stället: "Lägg i lagret" skickar `ShoppingLine.key` och mängd, och pantry-skrivningen och rensningen av bockarna ska ge samma resultat om de upprepas (bockar rensas först efter lyckad skrivning, och `addToPantry` tar emot en `requestId` som avvisar dubbletter).

### 9. Produktval: två möjliga ägare och ingen nyckel

**Enheter:** Epic 7, story "Produktval" (anges i listpostdetaljen, alltså i `shopping/ui`) mot Epic 7, story "Byta butik" (`settings`).
**Krock:** Kartan anger `shopping/domain/exportBasket` och `settings`, men ingen modul äger `product_choice`. Shopping-agenten lägger tabellen i `shopping/data`. Settings-agenten, som äger `store`, lägger den i `settings/data` för att kunna kopiera produktval vid butiksbyte. Nyckeln saknas också: `(ingredient, store)` enligt EXPERIENCE.md eller bara `(ingredient)` enligt FR-27. Med två rader för samma par väljer exporten godtyckligt.
**Föreslagen AD (tillägg till AD-16):**
> `product_choice` ägs av `shopping` och är unik på `(user_id, ingredient_id, store_id)`. `settings` äger `store`, med högst en `is_selected`, och exporterar `getSelectedStore()`. Vid butiksbyte följer inga produktval med. `exportBasket(lines: ShoppingLine[], store: Store, choices: Map<ingredientId, ProductChoice>)` exporterar bara rader där `checked = false`. Exporttexten byggs på servern i en action och returneras som sträng.

### 10. `recipe.source` blandar URL och typ

**Enheter:** Epic 1, import från text och foto, mot Epic 4, receptvy, och Epic 5, AI-förslag.
**Krock:** Ryggraden anger "käll-URL eller `ai`". Textimport sparar `null` hos en agent och `'text'` hos en annan. Epic 4 renderar `source` som `<a href>` och länkar till `ai` eller `text`. UX vill att källan heter "AI-förslag".
**Föreslagen AD (tillägg till AD-10):**
> `recipe.source_kind` är en enum `url | text | photo | ai`, och `recipe.source_url` är satt bara när typen är `url` (check constraint). `RecipeDraft` bär båda fälten. Visningstexten väljs bara i `recipes/domain/sourceLabel()`.

### 11. Aktuell matsedel: skapas automatiskt, dubbletter, byte av aktuell

**Enheter:** Epic 4, receptvyns knapp "Lägg på matsedeln" (FR-20), och Epic 1:s bibliotek (FR-13: "två tryck … från receptbiblioteket") mot Epic 3 mealplan.
**Krock:** Epic 4 anropar `mealplan.addRecipe(recipeId)` och väntar sig att en matsedel skapas om ingen finns. Epic 3 kräver `planId`. Samma recept två gånger blir två rader hos en agent och fler portioner hos en annan. Det påverkar `ShoppingLine.origins`. Vid "Använd igen" (FR-14) ska den gamla matsedeln sluta vara aktuell. Med två separata uppdateringar bryts det partiella unika indexet om de körs i fel ordning.
**Föreslagen AD (ny eller tillägg till AD-8):**
> `mealplan` exporterar `addToCurrentPlan(recipeId, servings?)`. Den skapar en aktuell matsedel om ingen finns. Samma recept får förekomma flera gånger, en rad per tillfälle. `origins` refererar till `meal_plan_recipe.id`. Byte av aktuell matsedel görs bara med Postgres-funktionen `set_current_meal_plan(id)`. Inköpslistan, bockar och överstyrningar gäller alltid den aktuella matsedeln.

### 12. Omvalidering efter skrivning täcker inte härledda vyer

**Enheter:** Epic 2 och Epic 6, lagerskrivningar, mot Epic 1:s bibliotek och Epic 3:s lista och matsedel.
**Krock:** Konventionen säger "revalidatePath för de rutter som visar datan". Pantry-agenten tolkar det som `/hemma`. Lagningsstatus i `/recept` och `/matsedel`, och listan i `/lista`, är härledda från lagret och blir inaktuella i klientens router-cache. Det bryter mot FR-8, som kräver att lagningsstatus räknas om när lagret ändras.
**Föreslagen konvention:**
> `src/lib/revalidate.ts` har en tabell från ändrad tabell till rutter (t.ex. `pantry_item → /hemma, /recept, /recept/[id], /matsedel, /lista`). Actions anropar `revalidateFor('pantry_item')` och aldrig `revalidatePath` direkt.

### 13. "Ångra" efter borttagning: mjuk eller hård radering

**Enheter:** Epic 2, svep för att ta bort lagervara, mot Epic 3, svep för att ta bort egen vara eller matsedelsrätt (EXPERIENCE.md: "Ångra" i 5 s).
**Krock:** Pantry-agenten inför `deleted_at`. Shopping-agenten raderar och skapar raden på nytt vid ångra, med nytt id. `getPantrySnapshot` filtrerar bort mjukt raderade rader, men det unika indexet från fynd 3 krockar när varan läggs till igen inom 5 s. Ett nytt id för en egen vara gör att `line_key c:<id>` tappar sin bock.
**Föreslagen AD:**
> Radering är alltid hård. "Ångra" anropar `restoreX(snapshot)` med **samma id**, och create-actions tar emot ett valfritt id för detta. Ingen tabell har `deleted_at`.

### 14. Får Route Handlers under `api/ai/*` skriva?

**Enheter:** Epic 1, `/api/ai/import`, som returnerar ett utkast utan att skriva (AD-10), mot Epic 6, `/api/ai/analyze`.
**Krock:** AD-2 undantar "AI-arbete" från regeln om Server Actions. Epic 6 tolkar undantaget som att handlern får skriva och lagrar lagerförslagen i `pantry_suggestion` så att de finns kvar efter omladdning. Det motsäger FR-25 och AD-15 i andan, men inte i bokstaven.
**Föreslagen skärpning (AD-2 och AD-9):**
> Route Handlers under `api/ai/*` skriver aldrig till databasen och anropar bara skrivfria funktioner (t.ex. `catalog.matchIngredients`). Resultatet lever i klienten tills Pontus sparar eller bekräftar via en Server Action.

### 15. Enhetsnormalisering saknar en enda funktion

**Enheter:** Epic 1, promptar och JSON-LD-tolkning, mot Epic 2, lagerformuläret, och Epic 6, bildanalysens prompt.
**Krock:** AD-12 listar tillåtna koder men anger ingen funktion som översätter fritext. Epic 1 mappar "deciliter" i prompten, och Epic 6 har en egen alias-tabell där "liter" blir `l`, medan Epic 1 ger "liter" → `st` enligt regeln om okända enheter. Samma vara hamnar i olika enheter och slås inte ihop.
**Föreslagen skärpning (AD-12):**
> `catalog/domain/units.ts` exporterar `normalizeUnit(raw: string): { unit: Unit; known: boolean }` med alla alias. Alla AI-svar och formulär går genom den. Prompter kräver att AI:n returnerar råtext för enheten.

---

## Låga fynd

### 16. Kapplöpning ger dubbletter i katalogen

**Enheter:** Två importer som körs samtidigt, eller ett recept med "lök" på två rader, i Epic 1.
**Krock:** AD-6 gör bara `ingredient_synonym` unik. Om två anrop först letar och sedan skapar samma ingrediens samtidigt, blir det två "gul lök".
**Fix (AD-6):** `ingredient` är unik på `(user_id, normalized_name)`. `commitIngredients` gör `insert … on conflict (user_id, normalized_name) do update set … returning id` och tar bort dubbletter inom samma anrop.

### 17. Små tolkningsglapp

- **Enhetskolumnens typ:** en migration gör `text` med en check-constraint, en annan gör en Postgres-`enum`. *Fix:* `text` med check, genererad från `units.ts` i samma migration som listan ändras.
- **`errors.ts`:** Epic 1 lägger till `fetch_too_large` och Epic 6 `image_too_large`, med olika `message` för samma situation. *Fix:* felkoder namnges `<område>_<orsak>`, och den svenska texten ligger i en tabell i `errors.ts`, inte i varje action.
- **"förp" och "paket"** är båda giltiga och slås aldrig ihop, alltså samma problem som AD-12 ska förhindra. *Fix:* behåll en av dem och gör den andra till alias i `normalizeUnit`.
- **Egna varor utan livsmedelskoppling ("diskmedel") vid "Lägg i lagret":** FR-11 kräver en katalogingrediens. *Fix (AD-8):* egna varor utan `ingredient_id` läggs aldrig i lagret. De tas bort från överlägget.

---

## Förslag till ordning

1. Stäng fynd 1, 2, 3, 4 och 5 innan Epic 1 startar. De låser `RecipeDraft`, katalogens API och pantryns läs- och skrivkontrakt, som Epic 1–3 delar.
2. Stäng fynd 6, 7 och 8 innan Epic 3 startar.
3. Övriga fynd kan stängas i den epic som först berörs, men de ska skrivas in i ryggraden innan dess story startar.
