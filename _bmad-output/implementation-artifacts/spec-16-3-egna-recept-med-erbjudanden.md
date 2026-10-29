---
title: 'Story 16.3: Dina egna recept med veckans erbjudanden'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5af179f'
---

## Intent

**Problem:** Pontus: "Kanske är receptet matchat med ngt? Eller att den matchar med tidigare recept från min receptsida och där en prioriterar hjärtmarkerade." Förslagen från erbjudandena var bara AI-rätter; hans egna recept som passar veckans varor syntes inte.

**Approach:** En ren, enhetstestad rankning utan AI körs på servern mot vald butiks erbjudanden. Resultatet visas först, som "Från dina recept", så fort Pontus ber om förslag, utan att vänta på AI-jobbet.

## Ändringar

- `suggestions/domain/own-recipes.ts`: `rankOwnRecipes`. Poäng: 10 per erbjudande receptet använder (via `ingredient_id` eller normaliserat namn, som `offersUsed`), +15 för favorit, -2 per vara att köpa (`toBuyNames`), upp till +2 per erbjudande för besparingen. Bara recept med minst ett erbjudande, högst fem, stabil ordning (favorit, titel, id).
- `suggestions/actions/own-recipes-with-offers.ts`: Server Action `ownRecipesWithOffers(storeId?)`, en ren läsning (inget AI, inget nät), tom lista utan butik, erbjudanden eller träff. `recipes/server.ts` exporterar `listRecipeRows`.
- Jobbets kontext får `storeId` (route.ts), så /recept vet vilken butik som avses, också efter omladdning.
- `use-dish-suggestions.ts`: `offersJob` (pågående eller osett erbjudandejobb, kvar medan dess rätter visas).
- `recipes/ui/own-recipes.tsx`: sektionen "Från dina recept" överst i `AiSuggestions`; kort med varför-raden (`whyText`), "x av y hemma", erbjudandenamn, "Favorit"-märke, bildytan med 16.4:s illustration, "Lägg på matsedeln" (befintlig `addToPlan`, utan förhandsvisning, toast med "Visa inköpslistan") och "Öppna receptet". Inget visas om inget recept matchar.
- Tester: enhetstester för rankningen, e2e i `offer-suggestions` (favorit först, läggs på matsedeln, listan följer). Ett inaktuellt e2e-förväntat värde ("På erbjudande: ") rättades till "Erbjudanden: ".

## Beslut

- Favorit är en stark bonus (1,5 erbjudande), inte absolut förtur: ett recept med två erbjudanden slår en favorit med ett.
- Kortet är ett vanligt (ej länk-) kort, eftersom länkkortet inte tar knappar; receptet öppnas via "Öppna receptet".
- Receptsidan `recept/[id]` är orörd. Ingen migration, inget nätverk, LM Studio anropas aldrig.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Hämtningen i `OwnRecipes` har en `current`-flagga i effektens städning, så Strict Modes dubbelkörning visar bara det senaste svaret; ett fel visar ingenting.
- Merge av epic-grenen (16.4) gav en konflikt i importerna i `ai-suggestions.tsx`; båda behölls och kortet fick `dishEmoji`.
- e2e-fel: `recipe_ingredient` kräver mängd eller `is_vague`; seedningen rättades. Den seedade makaronen är hemma, så raden blir "allt hemma eller på erbjudande".
- lint, typecheck, enhetstester, `AI_PROVIDER=mock pnpm build` och e2e `offer-suggestions`, `library`, `mealplan` gröna. Flödet kördes inte separat i `pnpm dev`.
