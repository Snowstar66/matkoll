---
title: 'Story 13.8: Välj dag och sedan recept'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ef1ade7'
---

## Avsikt

Pontus: "Jag tänker att jag också borde kunna stå i matsedeln. Markera en dag. och sen klicka på recept och lägga in ett recept på just den dagen."

Acceptanskriterier: se Story 13.8 i `epics.md`.

## Lösning

- Läget är bara adressen: `/recept?planera=2026-11-04` (och `/recept/<id>?planera=…`). `planningTarget` (mealplan/domain/planning.ts) tolkar datumet till veckans måndag och veckodag; ogiltigt, passerat eller mer än 12 veckor fram ger vanligt Recept.
- Matsedel: dagens rubrik får länken "Välj recept" (dagar med rätter), och arket "Lägg till rätt" (tryck på en "Ledig"-rad) har "Välj recept" under dagväljaren.
- Recept: `PlanningBar` ("Lägger på onsdag 4 nov · Avbryt"), snabbknapp "Lägg på onsdag" på receptkorten (`quickAction` i RecipeCard, lyft över kortlänken), receptsidans primärknapp, AI-förslag och "Från dina recept". Alla använder `AddToPlanButton`/`addToCurrentPlan` med `weekStart` och veckodag.
- Efter tillägg: `router.push` till `/matsedel?vecka=…&dag=3`, bekräftelsen "Lagt på matsedeln, onsdag." och dagen markeras 3 sekunder (`data-highlight`). Läget är slut eftersom adressen byts.
- Ingen migrering: `add_to_plan` tar redan vecka och dag (13.5, 13.7).

## Verifiering

- Enhetstester för `planning.ts`; e2e "picks a day, then a recipe" i `tests/e2e/mealplan.spec.ts` (nästa vecka, onsdag, Välj recept, Lägg på onsdag, rätten på onsdag nästa vecka; Avbryt).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build`, e2e för mealplan, recipe, library och offer-suggestions.

## Review Triage Log

Ingen separat granskare (liten story, snabb variant): egen genomgång. Inga must-fix. Noterat: receptsidans inloggningsomdirigering behåller inte `?planera` (utgången session, sällsynt) och planeringsfältet visas bara i biblioteket, inte på receptsidan, där knappens text anger dagen.
