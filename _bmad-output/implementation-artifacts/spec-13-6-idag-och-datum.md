---
title: 'Story 13.6: Idag och datum på matsedeln'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2d46c82'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus om veckovyn från 13.5: "markera idag snyggare. Lägg kanske även till dagens datum lite diskret". Dagsrubrikerna var versaler och "IDAG" i accentfärgad versal skrek.

**Approach:** Dagens namn står med stor begynnelsebokstav och lugn storlek, datumet diskret efter ("Måndag · 26 okt"). Idag får ett tunt accentstreck till vänster och en liten "Idag"-pill; en tom dag får dessutom lätt accenttonad bakgrund. Bara för innevarande vecka, `aria-current="date"`.

## Boundaries & Constraints

**Always:** Allt annat som i 13.5 ("Ingen dag än", "Flytta till dag", "Markera som lagad", portioner, soptunna, "Lägg till rätt", "Ledig"-raderna som öppnar "Lägg till rätt"). Mörkt läge, 375 px utan sidled (även vid 200 % text), tryckytor minst 44 px.

**Never:** Ingen migrering, inget nätverk.

</frozen-after-approval>

## Design

- **Domän:** `weekdayDateText(date, weekday)` i `meal-plan.ts` ("26 okt"), måndag–söndag i Europe/Stockholm, ren kalenderaritmetik på Stockholms datum.
- **Vy** (`meal-plan-list.tsx`): gemensam rubrik (dag, datum, pill) för både tom dag och dag med rätter; datum och idag räknas bara i webbläsaren (`useSyncExternalStore`) så serverns sida inte avviker. Streck: `border-l-4 border-accent`; pill: `bg-accent/15 text-accent`; tom idag-rad: `border-accent bg-accent/10`.
- **Tester:** enhet för `weekdayDateText` (veckogränser, månads- och årsskifte, vecka med sommartidsbyte hösten och våren), UI-test för rubrik, `aria-current` och pill, e2e för datum, ingen versalisering, en idag-sektion och ingen sidled vid 375 px.

## Vid bygget

- **Avvikelse:** matsedelsvyn visar alltid den aktuella matsedeln, och `MealPlanView` bär inget skapandedatum; datumen räknas därför från innevarande vecka, inte från matsedelns skapandedag. Tidigare veckor (3.2) visar som förut sin skapandedag och rör inte vyn.
- Skärmbild vid 375 px (ljust) tagen på e2e-servern med rätter på måndag och sparad i scratchpad, inte incheckad.

## Review Triage Log

Ingen separat granskning (liten stil-story). Egen genomgång: datumet och pillen radbryts vid stor text (`flex-wrap`), pillen och datumet är text utan egen tryckyta, och tomma-dag-knappen behåller `min-h-tap`. Inget behövde rättas. lint, typecheck, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e (`mealplan`, `recipes-look`) är gröna.
