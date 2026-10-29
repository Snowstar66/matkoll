---
title: 'Story 1.14: Hitta recept från Lägg till'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/main'
---

## Intent

**Problem:** Pontus hittar inte möjligheten att surfa in på t.ex. koket.se för att hitta ett recept att lägga till. "Spara i Matkoll" (Story 1.13) finns bara i Inställningar.

**Approach:** Arket Importera recept får avsnittet "Hitta recept på nätet" under flikarna: en länk per godkänd sajt (Story 1.12) som öppnar sajtens startsida i en ny flik, och en rad som pekar på bokmärket Spara i Matkoll och på länkfältet.

## Ändringar

- `import-sheet.tsx`: `FindRecipes` (länk per sajt, `target="_blank"`, `rel="noopener noreferrer"`, tillgängligt namn "Öppna koket.se i en ny flik", `min-h-tap`). "Spara i Matkoll" leder till `/installningar#spara-i-matkoll` (lämnar arket och frågar först om det finns osparade ändringar, som "Öppna inställningar"); "här" öppnar fliken Länk med fokus i fältet. Utan godkända sajter: en rad med länk till `#godkanda-receptsajter`.
- `recipes-view.tsx`: läser sajterna med `listRecipeSites()` som ett löfte (`sites`) som arket väntar på i en `<Suspense>`, så sidan blockeras inte (AD-18). Ett fel ger raden "inga sajter".
- `save-to-matkoll.tsx`: `id="spara-i-matkoll"` (med `scroll-mt-4`) och tipset "Tips: dra knappen till bokmärkesfältet (visa det med ⌘⇧B i Chrome)." överst.
- `epics.md`, `sprint-status.yaml`, ett nytt e2e-prov i `settings.spec.ts`.

## Beslut

- Matkoll hämtar ingenting från sajterna; länkarna är vanliga länkar. Ingen migration, inget nätverk.
- Sajterna skickas som löfte från servern i stället för att hämtas i klienten, så ingen extra begäran behövs.

## Review Triage Log

Ingen separat granskning: liten UI-story utan migration eller nytt dataflöde. Egen genomgång:

- Ankaret `#spara-i-matkoll` fanns inte: tillagt på avsnittet.
- Länken till Inställningar får inte tappa osparad förhandsgranskning: går via samma bekräftelse som "Öppna inställningar".
- Kontrollerat: 44 px-mål, 375 px, mörkt läge (samma färgtokens som övriga sheetet).
