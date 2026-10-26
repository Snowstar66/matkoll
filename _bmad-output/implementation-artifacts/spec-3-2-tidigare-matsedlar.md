---
title: 'Story 3.2: Tidigare matsedlar'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '3922da45aaf6568f807e229997afc7d668ae7ed4'
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
- [x] ny migration (+ `pnpm db:types`) -- `set_current_meal_plan(source_id uuid null)`: med källa kopieras rätterna (utan borttagna recept) till en ny aktuell matsedel; utan källa skapas en tom; den förra aktuella sätts till `is_current = false` först -- AD-22
- [x] `src/features/mealplan/data/`, `actions/` (+ tester) -- `listPreviousPlans()`, `getPlan(id)`, `reusePlan(id)`, `newPlan()`, `deletePlan(id)` -- AD-22
- [x] `src/app/(app)/matsedel/tidigare/page.tsx`, `src/app/(app)/matsedel/tidigare/[id]/page.tsx`, `src/features/mealplan/ui/` -- listan, detaljen, "Använd igen", "Ny matsedel", "Ta bort matsedel" med bekräftelse; "Tidigare" i Matsedel-rubriken -- UX
- [x] `tests/integration/mealplan.test.ts` (utökad) -- byte av aktuell i en transaktion, kopiering utan borttagna recept, högst en aktuell, radering med cascade, RLS -- matrisen
- [x] `tests/e2e/mealplan.spec.ts` (utökad) -- tidigare lista, använd igen, ny matsedel, ta bort med bekräftelse -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Namnet förblir "Vecka <ISO-vecka>" enligt specen. I listan "Tidigare" visas också datumet då matsedeln skapades, till exempel "skapad 26 okt 2026", så att två "Vecka 44" från olika år går att skilja åt (från granskningen av 3.1).
- Bygg vidare på 3.1:
  - `meal_plan_lock()`
  - `restore_plan_recipe` (återställer bara till den aktuella matsedeln)
  - dish-id som skapas i klienten
  - portionsgränsen 1–1000 i databasen

## Spec Change Log

- `set_current_meal_plan(new_plan_id, plan_name, source_id)` tar emot id och namn. Det gör att ett nytt försök inte ger en dubblett (samma princip som i 3.1) och att namnet bara räknas fram av `isoWeekName`. Actions: `reusePlan(id, newPlanId?)` och `newPlan(newPlanId?)`.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.
- **Patch:**
  - Ett nytt försök med ett id som inte längre är aktuellt nekas (55000).
  - Radering går via `delete_meal_plan` med låset. En matsedel som redan är borttagen räknas som borttagen.
  - Permanenta fel nollställer id:t och skickar Pontus vidare.
  - "Använd igen" är avstängt när ingen rätt kan följa med. En notis visar hur många rätter med borttaget recept som inte följer med.
  - En tom aktuell matsedel raderas vid byte i stället för att sparas som tidigare.
  - Skydd mot dubbelklick.
  - Detaljsidan har rubrik i laddningsläget.
  - `generateMetadata` fångar bara `MealPlanDataError`.
  - Fokus på "Avbryt" i bekräftelsen.
  - `set_current_meal_plan` sätter `user_id` uttryckligen.
  - Nya tester för routing, felvägar och radering.
- **Defer:**
  - sidindelning av Tidigare
  - att skilja två matsedlar åt som har samma namn och samma dag
- **Reject:**
  - `user_id`-filter vid läsning (RLS räcker, samma som i resten av appen)
  - mjuk 404 inuti Suspense (samma mönster som receptsidorna)
  - röd knapp (appen använder inte rött)
  - att återkalla direkta skrivningar av `is_current`

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
