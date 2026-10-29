---
title: 'Story 13.2: Ta bort recept'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: 'c7ab06a'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-11-andra-och-ta-bort-recept.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-13-1-soptunna-med-smart-kontrollfraga.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "Sen behöver man kunna ta bort recept. det finns inget ta bort nu vad jag kan se." Borttagningen finns (Story 1.11) men ligger längst ned i Ändra-arket, bakom menyn ⋯.

**Approach:**
- Receptvyn: en synlig soptunna "Ta bort recept" (44 px) bland rubrikens knappar, bredvid hjärtat och ⋯. Borttagningen i Ändra-arket finns kvar.
- Biblioteket (`/recept`): varje receptkort får en liten soptunna "Ta bort <titel>" till höger om texten.
- Båda använder 13.1:s smarta kontrollfråga (`useConfirmDelete`, 60 s nådetid): "Ta bort receptet <titel>? Det går inte att ångra." Ligger receptet på matsedeln står det under frågan: "Den ligger på matsedeln och tas bort därifrån."
- Efter borttagning från receptvyn går appen till biblioteket med "Receptet är borttaget."; från biblioteket försvinner kortet på stället.

## Boundaries & Constraints

**Always:** Semantiken från 1.11 är oförändrad: `deleteRecipe` tar receptet av den aktuella matsedeln (`detachRecipe`, AD-20), tidigare matsedlar behåller rätten utan recept. Ett fel visas i toasten och receptet finns kvar. Inga osynliga tecken i källkoden annat än som `\u`-escapes.

**Never:** Migration, nätverksanrop, egen generisk bekräftelsehook, ändringar i matsedelns gränssnitt (`src/features/mealplan/`, Story 13.3).

## Code Map

- `src/features/recipes/ui/recipe-delete.tsx`: `useRecipeDelete` (frågan, `deleteRecipe`, toast) ovanpå `useConfirmDelete`.
- `recipe-menu.tsx`: soptunnan i receptvyn, `onMenu`; `recipe-card.tsx`/`recipe-list.tsx`: soptunnan på kortet, `onDelete`; `library.tsx`: döljer borttagna kort, `onMenuIds`.
- `src/app/(app)/recept/page.tsx`, `[id]/page.tsx`: läser aktuell matsedel (`getCurrentPlan`) för "ligger på matsedeln".

## Vid bygget

13.1 fanns på `origin/story/13-1` redan under bygget; den mergades in och dess hook används. Tabbordningen på kortet blev länk, soptunna, hjärta (`recipes-look` uppdaterad). Soptunnans tryckspärr (400 ms) gör att testet väntar mellan två tryck.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test` (5120 gröna), `AI_PROVIDER=mock pnpm build`, e2e `recipe-edit` (nytt test för borttagning från receptvyn och biblioteket), `library`, `recipes-look`.

## Review Triage Log

Ingen separat granskning (liten story, ingen migration). Egen genomgång: nådetiden gör att en andra borttagning inom 60 s sker utan fråga, så e2e-testet laddar om sidan mellan receptvy och bibliotek; den stängda frågans text ligger kvar i DOM:en, så testet söker länkar, inte text.
