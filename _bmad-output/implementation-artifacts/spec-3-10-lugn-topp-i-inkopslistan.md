---
title: 'Story 3.10: Lugn topp i inköpslistan'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f91488c'
---

## Avsikt

Pontus om inköpslistans topp efter 13.7: "lite stökigt ux". En stor listruta "Vecka 44 · Denna vecka", en stor "Byt" tätt under och en tom lista för veckan trots att nästa vecka hade två rätter, så att listan såg trasig ut.

Acceptanskriterier: se Story 3.10 i `epics.md`.

## Lösning

- Listrutan (`week-picker.tsx`) är borttagen. `WeekNav` (Matsedels flikar, Story 13.9) återanvänds med två nya egenskaper: `basePath` (`/lista`) och `showHistory` (`false`, "Tidigare veckor" finns bara i Matsedel). Samma adress `?vecka=`, samma fjärde flik för en vecka längre fram.
- Antalen är antal rätter per vecka (`getWeekCounts`, en fråga), inte varor kvar att köpa: det vore en listräkning per vecka. Går frågan inte att läsa visas "–" och ingen annan vecka erbjuds.
- "Lager: Hemma · Byt" (`ListSiteLine`) är en metarad under flikarna: punkt emellan, "Byt" som `compact`-knapp (liten text, 44 px träffyta, `-mx-1` så texten följer vänsterkanten). Namnet "Byt lager för listan" är kvar.
- Tomt: `ShoppingListContent` bygger `empty` (text och knapp) som `ShoppingList` visar när veckan saknar rätter: "Vecka 44 har inga rätter än." med "Visa vecka 45 (2 rätter)" till första av de tre veckorna som har rätter, annars den gamla texten med "Gå till Matsedel". "Allt finns hemma" är oförändrat. Utan plan visas som förut inte "Lägg till egen vara" (en egen vara hör till en plan, AD-22).
- Ingen migrering, inget nätverk.

## Verifiering

- Enhetstest: `week-nav.test.tsx` (basePath, utan historik). Befintliga tester oförändrade.
- E2E: `mealplan.spec.ts` flyttar listan med flikarna i stället för listrutan; nytt test där en tom vecka (fem veckor fram) erbjuder veckan med rätter. `shopping`, `shopping-look`, `basket-export` gröna.

## Review Triage Log

Ingen separat granskare (liten story, snabb variant): egen genomgång. Noterat: antal rätter i stället för varor kvar är ett medvetet val av kostnadsskäl. Inga must-fix.
