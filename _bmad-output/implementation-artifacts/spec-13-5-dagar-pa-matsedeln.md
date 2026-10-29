---
title: 'Story 13.5: Dagar på matsedeln'
type: 'feature'
created: '2026-10-29'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e858f28'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Matsedeln är en lång lista utan dagar. Pontus ser inte veckan i överblick och vet inte vad som ska lagas när (förslag från 13.3).

**Approach:** Varje rätt kan ligga på en veckodag (måndag till söndag) eller sakna dag. Matsedeln visas som sju dagssektioner med rätterna under, och rätter utan dag ligger sist under "Ingen dag än". Varje rätt får "Flytta till dag", och "Lägg till rätt" får ett val av dag. Flera rätter kan ligga samma dag.

## Boundaries & Constraints

**Always:** Befintliga matsedlar behåller alla rätter, som hamnar under "Ingen dag än" (kolumnen är null). Ordningen inom en dag är matsedelns egen (`position`). Inköpslistan, "Markera som lagad", portioner, soptunnan och tidigare veckor fungerar som förut; inköpslistan läser aldrig dagen. RLS överallt, funktioner security invoker med `search_path = ''`, grants bara till `authenticated` och `service_role`. Tryckytor minst 44 px, Epic 11-utseendet, mörkt läge, 375 px utan sidled.

**Never:** Ingen `supabase db reset`, ingen ändring av redan körda migreringar. Ingen dag sätts på befintliga rätter.

</frozen-after-approval>

## Design

- **Databas** (`20261029200000_meal_plan_weekday.sql`): `meal_plan_recipe.weekday smallint` (1 = måndag ... 7 = söndag, null = ingen dag) med check `weekday is null or weekday between 1 and 7`. `add_to_current_plan` får `dish_weekday smallint default null` (den gamla funktionen släpps och den nya skapas, så anropet förblir entydigt). `restore_plan_recipe` (Ångra efter borttagning) läser och återställer `weekday` (`create or replace`).
- **Domän** (`mealplan/domain/meal-plan.ts`): `weekday` på `PlanRecipe`, `groupByWeekday` (alltid sju dagar, "Ingen dag än" sist och bara när den har rätter), `todayWeekday` (Stockholm), `defaultWeekday`, texterna `addedOnDayText` och `movedText`.
- **Åtgärder:** `setWeekday` (ny; `meal_plan_recipe.update`, RLS och användar-id), `addToCurrentPlan` tar `weekday` (1-7, `null` = ingen dag, utelämnad = standardvalet nedan).
- **Veckovyn** (`meal-plan-list.tsx`): en sektion per dag. Idag märks med en liten accentfärgad "Idag". En tom dag är en tunn rad med dagens namn och "Ledig"; ett tryck öppnar "Lägg till rätt" på den dagen. Flytt visas direkt (`useOptimistic`) och sparas med `setWeekday`.
- **Flytta till dag** (`move-to-day-button.tsx`): textknapp på rättkortet som öppnar ett litet ark med de sju dagarna och "Ingen dag"; rättens dag är markerad. Ett tryck flyttar och stänger.
- **Lägg till rätt:** arket har ett val "Dag" (sju dagar och "Ingen dag"), förvalt till standarddagen.
- **Standarddag:** första dagen från och med idag till söndag utan rätt, annars ingen dag. Skäl: veckan fylls dag för dag utan extra steg, och valet syns och kan ändras i arket. "Ingen dag" som standard hade lämnat alla nya rätter utan dag och gjort funktionen till ett extra steg varje gång. Vägarna utan ark (AI-förslag, "Från dina recept", receptsidan) skickar ingen dag, och servern räknar fram samma standard.
- **Tidigare veckor:** en rätt med dag visar "Fredag · 4 portioner".

## Vid bygget

- **Migration:** `20261029200000_meal_plan_weekday.sql`, körd lokalt med `supabase migration up --local` (utan `MigrationMissingLocalError`). Databackup före körning i scratchpad `migration-13-5/data-before.sql`; `scripts/pantry-site-check.sql` före och efter under testlåset gav identiska utdata (`diff` tomt). Alla fyra befintliga rader fick `weekday = null`. Inte körd mot molnet.
- **Avvikelse:** "Använd igen" (`set_current_meal_plan`) kopierar inte dagarna; den nya matsedeln börjar utan dagar och rätterna hamnar under "Ingen dag än". Funktionen är en körd migration och rörs inte i den här storyn.
- **Avvikelse:** tomma dagar är en enda rad (dagens namn och "Ledig") i stället för rubrik plus rad, så att rätter utan dag inte hamnar långt ner på sidan.
- **Ångra efter "Ta bort"** återställer dagen. "Markera som lagad" och dess Ångra rörs inte.
- **Ordning** inom en dag är `position`; en flytt ändrar inte `position`.
- **`comparePlanRecipes`** tar nu bara `id` och `position`, så `groupByWeekday` kan använda den.
- **Typer:** `database.types.ts` är genererad om med `pnpm db:types`.
- **Strict Mode:** `pnpm dev` på port 3295 startade rent och /matsedel leder till inloggning utan fel; sidan med data är provad bara i produktionsbygget (e2e), eftersom inloggning kräver en användare.
- **Tester:** enhet (`meal-plan.test.ts`, `actions.test.ts`, `meal-plan-ui.test.tsx`); integration (`mealplan.test.ts`: dag vid tillägg, flytt, check 1-7, annan användares rätt, Ångra, gammal rad utan dag); e2e (`mealplan.spec.ts`: veckovyn, Flytta till dag, tryck på ledig dag, listan opåverkad, tryckytor, ingen sidled vid 375 px).

## Review Triage Log

Ingen separat granskning ännu; migrationsgranskning följer. lint, typecheck, `pnpm test`, `scripts/with-test-lock.sh pnpm test:integration`, `AI_PROVIDER=mock pnpm build` och e2e (`mealplan`, `cook-mode`, `shopping`, `offer-suggestions`) är gröna.
