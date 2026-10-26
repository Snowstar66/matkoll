---
title: 'Story 2.3: Ta bort lagervara med ångra'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: 'e0accd9a63b201be116ab4724e3541f976fa6e66'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Varor tar slut, och Pontus behöver kunna ta bort dem snabbt utan risk för misstag.

**Approach:** En lagervara tas bort genom att svepa vänster på raden eller med "Ta bort" i arket. `removePantryItem` returnerar den borttagna raden, och en kort bekräftelse med "Ångra" i 5 s låter `restorePantryItem` sätta tillbaka den med samma id (AD-19, AD-20). Svepet byggs som en gemensam komponent, eftersom listposter och matsedelsrätter ska använda den i Epic 3.

## Boundaries & Constraints

**Always:** Radering är hård; ångra sätter tillbaka raden med samma id (AD-20). Ingen fråga i förväg (EXPERIENCE: förhandsbekräftelse bara för recept och matsedel). Svepet är en genväg; samma åtgärd finns i arket. Svepkomponenten ligger i `src/components/`, fungerar med pekare och mus, har en knapp som nås med tangentbord och skärmläsare, och respekterar "Minska rörelse". Actions: `requireUser()`, Zod, `Result`, `revalidateFor('pantry_item')`. Kort bekräftelse via `useToast().showToast(text, { onUndo })`.

**Never:** Ingen borttagning av katalogingredienser. Ingen mjuk radering.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Svep | Svep vänster på "Mjölk 1 l" | Knappen "Ta bort" visas; tryck tar bort raden direkt (optimistiskt) och visar "Mjölk är borttagen." med "Ångra" | N/A |
| Arket | "Ta bort" i arket Lagervara | Arket stängs; samma bekräftelse | N/A |
| Etikett | Obegränsad vara tas bort via arket | Etiketten försvinner; samma bekräftelse | N/A |
| Ångra | "Ångra" inom 5 s | Raden kommer tillbaka med samma id, mängd, enhet och plats | Om platsen redan har en ny rad med samma nyckel: "Det gick inte att ångra." och raden förblir borttagen |
| Tangentbord | Fokus på raden, öppna åtgärden | "Ta bort" nås utan svep | N/A |
| Fel vid borttagning | Databasfel | Raden kommer tillbaka och "Det gick inte att ta bort varan." | N/A |
| Annans rad | Främmande id | Inget tas bort | RLS / `pantry_remove_failed` |

</frozen-after-approval>

## Code Map

- `src/features/pantry/` -- från 2.1–2.2: tabell, lista, arket Lagervara, `set_pantry_items`
- `src/components/toast.tsx` (`useToast`, `onUndo`), `sheet.tsx`, `button.tsx`
- `src/lib/errors.ts`, `src/lib/revalidate.ts`

## Tasks & Acceptance

**Execution:**
- [x] `src/components/swipe-row.tsx` (+ test i jsdom) -- svep vänster visar en åtgärdsknapp (pekarhändelser, tröskel, återgång), knappen nås även med tangentbord och har namn för skärmläsare, ingen animation vid "Minska rörelse" -- UX-DR13
- [x] `src/features/pantry/data/`, `actions/remove-pantry-item.ts`, `actions/restore-pantry-item.ts` (+ tester) -- `removePantryItem(id)` returnerar raden; `restorePantryItem(row)` sätter in med samma id (fel om nyckeln är upptagen → `pantry_restore_failed`); `requireUser`, Zod, `revalidateFor('pantry_item')` -- AD-19, AD-20
- [x] `src/features/pantry/ui/` -- svep på rader, "Ta bort" i arket, optimistisk borttagning med `useOptimistic`, kort bekräftelse med Ångra -- matrisen
- [x] `tests/integration/pantry.test.ts` (utökad) -- ta bort och sätt tillbaka med samma id; upptagen nyckel nekas; RLS -- matrisen
- [x] `tests/e2e/pantry.spec.ts` (utökad) -- svep (pekare) och ta bort, Ångra, ta bort via arket, tangentbordsväg -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Ångra nekas om platsen nu har samma nyckel eller den andra sortens rad (obegränsad eller med mängd). Det skyddar regeln från 2.2.
- En återställd rad får ett nytt `created_at`. Id, mängd, enhet och plats är desamma.
- Knappen "Ta bort" som visas vid svep har färgerna `bg-sky text-sky-ink`, eftersom appen inte använder rött.
- Etiketter för obegränsade varor går inte att svepa. De tas bort i arket.

## Spec Change Log

- Tasks: det optimistiska läget håller id per rad i `useState` i stället för `useOptimistic`. Då försvinner inte borttagna och återställda rader innan servern har kommit ikapp (granskningen, iteration 1).

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- En rad som går att radera men inte att tolka räknas som borttagen, utan Ångra.
- Om svaret på ett anrop försvinner hämtas listan på nytt.
- När Ångra nekas revalideras listan.
- Fel vid borttagning och Ångra visas i en toast, inte i en notis som hör till en viss plats.
- Flera borttagningar i samma toast ångras tillsammans.
- Dolda och återställda rader hålls kvar tills servern har kommit ikapp, så att inget blinkar.
- En optimistisk återställning som krockar med en annan rad hoppas över.
- Fokus flyttas efter en borttagning.
- Pekarhanteringen i SwipeRow:
  - reagerar bara på primär pekare
  - nollställs alltid när dragningen slutar
  - avbryter dragningen om musknappen har släppts
  - flyttar fokus vid Esc till ett element som går att tabba till
- Låset ligger i en gemensam SQL-hjälpfunktion.
- Arket kontrolleras efter en flytt.
- Nya e2e-fall: svepet startar mitt på raden, kontroll efter Ångra när allt har landat, flera borttagningar och fel-toasten.

**Defer:**
- en kortkommando-åtgärd för skärmläsare, som ska kontrolleras med VoiceOver på riktig enhet (finns i checklistan)
- ett avstånd från skärmkanten för svepet

**Reject:**
- att en rad som inte hittas räknas som lyckad, eftersom matrisen kräver `pantry_remove_failed`
- en regel på tabellnivå
- en ångra-token, eftersom RLS ändå begränsar
- att återställa `created_at`

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
