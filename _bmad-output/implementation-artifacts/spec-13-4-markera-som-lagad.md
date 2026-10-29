---
title: 'Story 13.4: Markera som lagad'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0579bed'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus lagar en rätt på matsedeln men lagret säger fortfarande att ingredienserna finns kvar, så "X av Y hemma" och inköpslistan stämmer inte förrän han räknar om själv.

**Approach:** "Markera som lagad" på varje rätt på matsedeln och i slutet av stegläget. Ett ark visar vad som dras från lagret, skalat efter rättens portioner, med ny mängd per vara som kan ändras eller hoppas över. Bekräftelsen drar av lagret och markerar rätten i en enda serveråtgärd och en transaktion. Rätten visas som "Lagad" och räknas inte in i inköpslistan. "Ångra" återställer både lagret och rätten.

## Boundaries & Constraints

**Always:** Samma matchning som "X av Y hemma" (`aggregateNeeds`, samma enhet, vald plats i lagret). Bara det som går att räkna dras av; resten står som "Kontrollera själv" och dras inte (annan enhet, ingen mängd, finns inte i lagret, obegränsad vara, rad utan katalogvara). Appen gissar aldrig och räknar aldrig om enheter (AD-12). En vara som skulle bli 0 eller mindre blir 0 (raden tas bort, ett lagersaldo är alltid över 0) med en notering. Rätten kan avmarkeras senare; avmarkeringen ändrar inte lagret, och det sägs. RLS överallt, funktionerna är security invoker med `search_path = ''` och kontrollerar `auth.uid()`. Tryckytor minst 44 px, Epic 11-utseendet.

**Never:** Ingen `supabase db reset`, ingen ändring av redan körda migreringar. Ingen konvertering mellan enheter. Ingen avdragning utan att rätten markeras, eller tvärtom.

</frozen-after-approval>

## Design

- **Databas** (`20261029170000_meal_plan_cooked.sql`): `meal_plan_recipe.cooked_at timestamptz` (null tills rätten lagats). `mark_dish_cooked(dish, site, deductions)` drar varje `{ingredient_id, unit, amount}` från användarens rader för varan och enheten på platsen (äldsta raden först, rad som når 0 tas bort), sätter `cooked_at` och returnerar de rader som rördes (före, och hur mycket som drogs) till "Ångra". `undo_dish_cooked(dish, rows)` lägger tillbaka mängderna (adderar till kvarvarande rad, annars läggs den borttagna raden in igen med sitt gamla id) och nollar `cooked_at`. Båda tar pantrets advisory lock, rör bara den inloggades rader och är körbara endast för `authenticated`.
- **Domän** (`mealplan/domain/cooked.ts`): `cookedPlan` ger `deduct` (aktuell mängd, behov, föreslagen ny mängd) och `check` ("Kontrollera själv"). `newAmountOf` läser den skrivna mängden (komma eller punkt, 0 till vad som finns hemma).
- **Åtgärder:** `markDishCooked` (en RPC, plats = vald plats), `undoDishCooked`, `unmarkDishCooked` (rör inte lagret). Alla revalidiserar Matsedel, listan, Hemma och recepten.
- **UI:** `MarkCookedButton` (knapp + ark) på rättkortet och i slutet av stegläget (receptsidan skickar den som `finish` när receptet ligger på matsedeln som orörd rätt). Kortet visar bock och "Lagad" och en textknapp "Inte lagad" med raden "Om du tar bort markeringen ändras inte lagret.".
- **Inköpslistan:** `loadShoppingList` räknar bara rätter utan `cooked_at`.

## Vid bygget

- **Migration:** `20261029170000_meal_plan_cooked.sql`, körd lokalt med `supabase migration up --local` (utan `MigrationMissingLocalError`). Databackup före körning i scratchpad `migration-13-4/data-before.sql`; `scripts/pantry-site-check.sql` före och efter under testlåset gav identiska utdata (`diff` tomt). Befintliga rader får `cooked_at = null`; Pontus lager är orört. Inte körd mot molnet.
- **AD-1:** `mark_dish_cooked` skriver i `pantry_item` från matsedelns modul eftersom avdraget och markeringen måste vara en transaktion. Funktionen är den enda platsen där matsedeln rör lagertabellen; läsning av lagret går fortfarande via pantry.
- **Plats:** avdraget görs på den valda platsen, samma som "X av Y hemma" räknar mot. Över flera platser dras inget från andra platser.
- **Flera rader för samma vara** (olika platser i huset, till exempel Kyl och Frys): summan visas som en rad i arket; avdraget tas från äldsta raden först.
- **"Ångra":** lägger tillbaka det som drogs. Har en borttagen rad under tiden gjorts om med samma nyckel vägrar funktionen (23505) och inget ändras; Pontus ser "Det gick inte att ångra. Kontrollera lagret.".
- **Borttagen rätt + Ångra** (13.1/13.2-flödet) återställer inte `cooked_at`: `restore_plan_recipe` är en körd migration som inte rörs. Rätten kommer tillbaka som ej lagad.
- **Obegränsade varor** ("finns alltid hemma") dras inte av och står under "Kontrollera själv".
- **`MealPlanView.names`** är nytt (katalognamn för arket); `DishRecipe.lines` bär `originalText` för rader utan katalogvara.
- **Tester:** enhet `cooked.test.ts`, `queries-cooked.test.ts`; integration `mealplan-cooked.test.ts` (avdrag och markering i en transaktion, alltid noll som lägst, bara egna rader, hel eller inget, dubbelmarkering, ångra, avmarkera); e2e i `mealplan.spec.ts` (avdrag, listan tappar rätten, ändra mängd, ångra, avmarkera, tryckyta 44 px). Stegläget har knappen men inget eget e2e-test; `cook-mode` är grönt.

## Review Triage Log

Ingen separat granskning ännu. lint, typecheck, `pnpm test`, `scripts/with-test-lock.sh pnpm test:integration`, `AI_PROVIDER=mock pnpm build` och e2e (`mealplan`, `cook-mode`, `shopping`, `pantry-inventory`) är gröna.

## Review Triage Log

En Sonnet-granskare. Fynd: 1 måste-fixa och 3 bra-att-ha, alla åtgärdade (migration `20261029180000_meal_plan_cooked_ledger.sql`).

- Måste-fixa: Ångra kunde köras flera gånger och litade på rader från klienten. Nu lagrar `mark_dish_cooked` en huvudbok i `meal_plan_recipe.cooked_deductions`; `undo_dish_cooked(dish)` läser den på servern, uppdaterar `where cooked_at is not null` under samma lås, återställer exakt en gång och ger MK418 när det inte finns något att ångra. "Inte lagad" rensar också huvudboken, så en gammal Ångra ger MK418 och ett vänligt felmeddelande.
- Bra-att-ha: NaN och belopp från 1 000 000 avvisas i `mark_dish_cooked`.
- Bra-att-ha: arket skickar `siteId` (platsen beloppen räknades från) i stället för vald plats på servern.
- Bra-att-ha: dubbla par (vara, enhet) avvisas.
- Tester: dubbel Ångra, gammal Ångra efter "Inte lagad", NaN/för stort belopp, dubbla par, annan användares rätt och plats.
