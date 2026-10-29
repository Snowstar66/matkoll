---
title: 'Story 16.1: Spara och lägga på matsedeln fungerar från förslagen'
type: 'bugfix'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e1135f6'
---

## Intent

**Problem:** Pontus: på AI-förslagen från veckans erbjudanden (/recept) händer inget när han trycker "Spara" eller "Lägg på matsedeln", ingen POST syns i dev-loggen, och ett förslag går inte att ta bort.

**Approach:** Hitta orsaken, laga den i roten, lägg en soptunna på varje förslagskort och en e2e-regression för vägen bort och tillbaka.

## Rotorsak

`Sheet` (`src/components/sheet.tsx`) stänger `<dialog>` i effektens städning. Förhandsgranskningen `AiSuggestionSheet` monteras med `open` redan sant (kortets `key` ger en ny instans för varje öppning). Under `next dev` kör React Strict Mode effekten, städar och kör den igen: städningens `dialog.close()` köar ett `close`-event, som kommer efter att effekten visat dialogen på nytt. Handlern tolkade det som ett stängning från webbläsaren (`open` är ju sant) och anropade `onClose`, så ark som monteras öppna stängdes direkt. Förhandsgranskningen blinkade förbi, aldrig något att trycka "Spara recept" i, alltså ingen POST. I produktionsbygget finns ingen dubbel effekt, så de befintliga e2e-testerna (CI körs mot `next start`) såg aldrig felet. Reproducerat med `pnpm dev`; väg bort och tillbaka (Activity) var inte orsaken.

## Ändringar

- `src/components/sheet.tsx`: `close`-eventet ignoreras när dialogen redan är öppen igen.
- `src/features/recipes/ui/recipe-card.tsx`, `ai-suggestions.tsx`: soptunna "Ta bort förslaget <titel>" på varje förslagskort, utan fråga, fokus flyttas enligt `focusAfterRemoval`. När sista kortet är borta försvinner sektionen.
- `src/features/recipes/ui/use-dish-suggestions.ts`: `remove` uppdaterar tillståndet funktionellt, och ett borttaget förslags titel undviks av "Föreslå andra rätter". Det sista borttagna stänger jobbets resultat (dismiss) som vid sparat.
- `tests/e2e/offer-suggestions.spec.ts`: tre nya tester (Spara och Lägg på matsedeln direkt, efter /matsedel och /lagersaldo, samt borttagning).

Ingen migration.

## Review Triage Log

Ingen separat granskning (enligt uppdraget). Egen genomgång:
- Fixen i `Sheet` rör alla ark: en riktig stängning från webbläsaren (bakåtgest, Esc) sker med dialogen stängd, så den fortsätter fungera. Befintliga sheet-enhetstester (5135 totalt) gröna.
- Soptunnans 400 ms-skydd (`trashPressGuardMs`) gör att snabba tryck hoppas över; testet väntar mellan borttagningarna. Medvetet kvar.
- E2e kör i produktionsläge; felet syns bara i dev. Enhetstest för Strict Mode lades inte till, regressionen täcks av e2e i dev-körning (verifierad röd före, grön efter).
