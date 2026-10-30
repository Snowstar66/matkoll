---
title: 'Story 13.9: Veckoöversikt och kopiera vecka'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd83d771'
---

## Avsikt

Pontus om Matsedels rubrik efter 13.7: "Den här övre delen skulle kunna göras som en lite miniöversikt. Med ikoner för veckor som också har en siffra hur många rätter som redan är inplanerade för den veckan. Det räcker med aktuell vecka och 2 veckor framåt. Man ska kunna gå tillbaka till historiska veckor också men det behöver inte ha jättefokus. En historisk vecka borde man kunna kopiera rakt av till en vecka om man var nöjd med den."

Acceptanskriterier: se Story 13.9 i `epics.md`.

## Lösning

- Veckoöversikt: `WeekNav` är nu en rad med tre flikar (`week-tile`): "v. 44", "Denna vecka"/"Nästa"/"Om 2 v" och 🍽 antal, eller dämpat "–". Vald flik har accentfärg och `aria-current="page"`; tillgängligt namn "Vecka 45, nästa vecka, 3 rätter" (`weekTileName`). En vecka längre fram (`?vecka=`) får en fjärde, vald flik. Länkarna är vanliga `?vecka=`-länkar som förut.
- Antalen kommer från en fråga, `getWeekCountsIn` (`meal_plan` med inbäddad `meal_plan_recipe(count)` för de visade veckorna). Går den inte att läsa visas "–" och sidan fungerar som vanligt.
- Rubriken: "Tidigare"-knappen, ‹ ›, "Idag" och den synliga "Vecka 45"-etiketten är borta. "Tidigare veckor" är en liten länk under flikarna, "Lager: …" är kvar. Veckans namn finns kvar som `sr-only`-rubrik för skärmläsare. `PreviousPlansLink` togs bort.
- Kopiera: på en tidigare veckas sida (`/matsedel/tidigare/[id]`) finns "Kopiera till …" som öppnar ett ark med Denna vecka, Nästa vecka och Om 2 veckor. Server Action `copyPlan` anropar `copy_meal_plan(source_plan, target_week)`, sedan går appen till målveckan med "Kopierade 5 rätter till vecka 46". "Använd igen" finns kvar: den gör en ny aktuell matsedel av planen och ersätter inget som "Kopiera till …" gör.
- Rätter utan recept (`recipe_id` null) hoppas över, inte titel-bara: en rätt utan recept saknar ingredienser och kan inte lagas eller köpas för, `add_to_plan` kräver recept, och "Använd igen" gör likadant. Sidan säger redan hur många som inte följer med. Har inga rätter recept kvar får man "Inga rätter med recept att kopiera." och inget ändras.
- Migrering `20261030010000_copy_meal_plan.sql` (bara tillägg): `copy_meal_plan(source_plan uuid, target_week date) returns integer`, security invoker, `search_path = ''`, `auth.uid()` kontrolleras mot planens `user_id` (annars P0002), körbar bara för `authenticated`. Den anropar `add_to_plan` per rätt (nytt id, samma recept, titel, portioner och veckodag, i ordning), så att låsning, veckoregler (måndag, denna vecka till 12 veckor fram: 22023) och tillägg efter befintliga rätter är de beprövade. En plan kopieras inte till sin egen vecka (22023). Allt i en transaktion.
- Ny felkod `mealplan_copy_failed` och `mealplan_copy_nothing`.

## Verifiering

- Enhetstester: `week-nav.test.tsx`, `week-overview.test.ts`, uppdaterat `meal-plan-content.test.tsx`.
- Integration `tests/integration/mealplan-copy.test.ts`: kopierar med portioner, veckodagar och ordning; lägger till efter befintliga rätter; hoppar över borttagna recept och vägrar utan något kvar; bara egna planer, felaktig vecka, anonym.
- E2E: nytt test i `tests/e2e/mealplan.spec.ts` (flikar med antal, byte av vecka, kopiera tidigare vecka till nästa med veckodagar, 44 px, ingen sidled), befintliga test uppdaterade för flikarna och "Tidigare veckor"; `recipes-look.spec.ts` använder "+" som rubrikens åtgärd.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build`, `pnpm db:types` (oförändrad utöver `copy_meal_plan`).

## Review Triage Log

Ingen separat granskare (liten story, snabb variant): egen genomgång. Migreringen är liten och följer den granskade `add_to_plan`-mönstret (security invoker, `search_path = ''`, grant bara till `authenticated`, tillägg utan att något befintligt ändras); lokal data säkerhetskopierades före körning. Inga must-fix. Noterat: kopiering från en vecka som själv ligger i nutid eller framtid via adress går inte att nå i appen (bara tidigare veckor har sida), men funktionen tillåter det utom till samma vecka.
