---
title: 'Story 16.4: Ett snyggt recept när förslaget sparas'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5076590'
---

## Intent

**Problem:** Pontus: "Se till att det blir ett attraktivt matsedelrecept när det lagts till. Kanske även bild krävs. Och instruktioner." Ett sparat AI-förslag hade bara ett generiskt bokikon-fält som bild, och det syntes inte att det var byggt kring veckans erbjudanden.

**Approach:** Kontrollera först att stegen, tiden och portionerna överlever sparandet, ge sedan receptet en illustration (emoji för huvudråvaran, ingen riktig bild) och en rad om vilka erbjudanden det byggdes kring.

## Kontroll: tappas instruktionerna?

Nej. Spåret AI-svar till vy är helt: `compactDish.steps` (minst ett steg) -> `fromCompactDish` -> `fromAiRecipe` (tomma steg tas bort, radernas stegindex följer med) -> `recipeDraftSchema` -> `toSaveRecipeArgs` (`steps`, `original_servings`, `total_minutes`) -> `save_recipe` -> `getRecipe` -> "Steg" i receptvyn med numrering. Enhetstest i `saved-recipe.test.ts` låser det (stegen i ordning, tid, portioner, `source_kind: ai`). Det som saknades var utseendet, inte innehållet.

## Ändringar

- `src/features/recipes/domain/dish-emoji.ts` (+ test): `dishEmoji(title)`, en liten uttrycklig lista i prioritetsordning (taco, fisk/lax, kyckling, korv, nöt/fläsk, soppa/gryta, pasta, ris, potatis, vegetariskt, annars 🍽️), och `offerSavedText` ("Sparad från veckans erbjudanden: falukorv, ketchup"). Rättens titel avgör, så kort, förslag och receptvy visar samma emoji.
- `src/components/recipe-image.tsx`: valfri `emoji` visas, `aria-hidden`, i stället för bokikonen när bild saknas eller inte laddas (`data-testid="recipe-illustration"`).
- Receptvyn: 96 px emoji i den 260 px höga ytan, på den mintfärgade ytan från designtokens. Raden om erbjudanden under källan (`recipe-offers`). Ingredienser och numrerade steg var redan på plats.
- `RecipeCard` tar `emoji`; biblioteket (`recipe-list.tsx`) och AI-förslagskortet (bara bildytan i `ai-suggestions.tsx`) använder den. Remsan är kvar på 64 px.
- Erbjudandena: `suggest-from-pantry.ts` lägger `offerNames` (max 10, 100 tecken) på förslagets utkast, och `recipeDraftSchema` tar `offerNames` valfritt, så de följer med `saveRecipe` oförändrad.
- Migrationen `20261029190000_recipe_offer_names.sql`: kolumnen `recipe.offer_names text[] not null default '{}'` (max 10) och `save_recipe` skriver den. Inget befintligt fält (anteckning, källa) fanns: `source_url` får bara hållas för länkar. Läses av `getRecipe` (`SavedRecipe.offerNames`). `database.types.ts` ny.

## Migration

Bara additiv. Databackup (`supabase db dump --data-only --schema public`) till scratchpad `migration-16-4/data.sql`. `pantry-site-check.sql` kört efter: 0 felkod, 65 `pantry_item`-rader lika med dumpen. `supabase migration up` lokalt; `db reset` aldrig körd.

## Kontroller

`pnpm lint`, `pnpm typecheck`, `pnpm test` (5166) gröna. `AI_PROVIDER=mock pnpm build` ok. E2e `recipe`, `recipes-look`, `offer-suggestions`: 34 gröna mot `next start`; spara-testet (utökat med illustration, steg och erbjudanderad) grönt även mot `next dev` (Strict Mode). Mörkt läge och 375 px: ytan använder samma tokens och mått som förut, och `recipes-look` kontrollerar att inget vänder sidled.

## Review Triage Log

Ingen separat granskning (migrationen är additiv och datakontrollerad). Egen genomgång:
- Titelbaserad emoji i stället för titel plus ingredienser: biblioteket läser inte ingredienstexter, och samma val överallt ger samma emoji. Tas ingen riktig träff blir det 🍽️.
- `offerNames` är valfritt i utkastet och `SavedRecipe`, så äldre recept och andra importvägar är oförändrade (tom lista, ingen rad).
- Story 16.2 rör korttexterna; här är bara bildytan ändrad.
