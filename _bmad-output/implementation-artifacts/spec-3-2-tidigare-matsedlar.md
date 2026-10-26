---
title: 'Story 3.2: Tidigare matsedlar'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En vecka som fungerade går inte att upprepa. Pontus vill se tidigare matsedlar och använda en igen.

**Approach:** "Tidigare" i Matsedel-rubriken visar tidigare matsedlar, nyast först. "Använd igen" skapar en ny aktuell matsedel med samma rätter och portioner via Postgres-funktionen `set_current_meal_plan`, som byter aktuell matsedel i en transaktion (AD-22). Rätter vars recept är borttagna följer inte med.

## Boundaries & Constraints

**Always:** Bara `set_current_meal_plan()` byter aktuell matsedel och gör "Använd igen" (AD-22, `security invoker`, en transaktion). Den nya matsedeln får namnet "Vecka <ISO-vecka>" och samma rätter och portioner i samma ordning; rader med `recipe_id` null hoppas över. Actions: `requireUser()`, Zod, `Result`, `revalidateFor('meal_plan')`. Borttagning av en tidigare matsedel kräver förhandsbekräftelse ("Ta bort Vecka 42? Det går inte att ångra."). Kör aldrig `supabase db reset`.

**Never:** Ingen redigering av en tidigare matsedel utöver borttagning. Ingen sammanslagning av matsedlar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lista | "Tidigare" | Tidigare matsedlar (inte den aktuella), nyast först, med namn och antal rätter | Inga: "Inga tidigare matsedlar än." |
| Visa | Tryck på en tidigare matsedel | Dess rätter och portioner; borttagna recept visas som "Borttaget recept: [titel]" | N/A |
| Använd igen | "Använd igen" | Ny aktuell matsedel med samma rätter och portioner; den förra aktuella blir tidigare; Pontus hamnar på Matsedel med "Matsedeln är skapad." | Allt eller inget |
| Borttagna recept | Tidigare matsedel med ett borttaget recept | Rätten följer inte med | N/A |
| Ta bort | "Ta bort matsedel" och bekräfta | Matsedeln med rätter, bockar och egna varor raderas | Avbryt: inget händer |
| Ny vecka | Aktuell matsedel från förra veckan | Fortsätter vara aktuell tills Pontus väljer "Använd igen" eller "Ny matsedel" | N/A |
| Ny matsedel | "Ny matsedel" i Tidigare | Tom aktuell matsedel; den förra blir tidigare | N/A |

</frozen-after-approval>

## Code Map

- `src/features/mealplan/` -- från 3.1: tabeller, `getCurrentPlan`, `addToCurrentPlan`, `isoWeekName`, UI
- `supabase/migrations/*_mealplan.sql` -- mönster; partiellt unikt index på `is_current`
- `src/components/` -- `Sheet` (bekräftelse), `EmptyState`, toast

## Tasks & Acceptance

**Execution:**
- [ ] ny migration (+ `pnpm db:types`) -- `set_current_meal_plan(source_id uuid null)`: med källa kopieras rätterna (utan borttagna recept) till en ny aktuell matsedel; utan källa skapas en tom; den förra aktuella sätts till `is_current = false` först -- AD-22
- [ ] `src/features/mealplan/data/`, `actions/` (+ tester) -- `listPreviousPlans()`, `getPlan(id)`, `reusePlan(id)`, `newPlan()`, `deletePlan(id)` -- AD-22
- [ ] `src/app/(app)/matsedel/tidigare/page.tsx`, `src/app/(app)/matsedel/tidigare/[id]/page.tsx`, `src/features/mealplan/ui/` -- listan, detaljen, "Använd igen", "Ny matsedel", "Ta bort matsedel" med bekräftelse; "Tidigare" i Matsedel-rubriken -- UX
- [ ] `tests/integration/mealplan.test.ts` (utökad) -- byte av aktuell i en transaktion, kopiering utan borttagna recept, högst en aktuell, radering med cascade, RLS -- matrisen
- [ ] `tests/e2e/mealplan.spec.ts` (utökad) -- tidigare lista, använd igen, ny matsedel, ta bort med bekräftelse -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
