---
title: 'Story 2.3: Ta bort lagervara med ångra'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `src/components/swipe-row.tsx` (+ test i jsdom) -- svep vänster visar en åtgärdsknapp (pekarhändelser, tröskel, återgång), knappen nås även med tangentbord och har namn för skärmläsare, ingen animation vid "Minska rörelse" -- UX-DR13
- [ ] `src/features/pantry/data/`, `actions/remove-pantry-item.ts`, `actions/restore-pantry-item.ts` (+ tester) -- `removePantryItem(id)` returnerar raden; `restorePantryItem(row)` sätter in med samma id (fel om nyckeln är upptagen → `pantry_restore_failed`); `requireUser`, Zod, `revalidateFor('pantry_item')` -- AD-19, AD-20
- [ ] `src/features/pantry/ui/` -- svep på rader, "Ta bort" i arket, optimistisk borttagning med `useOptimistic`, kort bekräftelse med Ångra -- matrisen
- [ ] `tests/integration/pantry.test.ts` (utökad) -- ta bort och sätt tillbaka med samma id; upptagen nyckel nekas; RLS -- matrisen
- [ ] `tests/e2e/pantry.spec.ts` (utökad) -- svep (pekare) och ta bort, Ångra, ta bort via arket, tangentbordsväg -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
