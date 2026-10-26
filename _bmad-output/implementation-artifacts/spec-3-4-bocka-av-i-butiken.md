---
title: 'Story 3.4: Bocka av i butiken'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** I butiken ser Pontus inte vad som redan ligger i korgen. Hen behöver bocka av med tummen och se vad som är kvar.

**Approach:** Tabellen `shopping_check` (AD-8) sparar en bock per matsedel och listnyckel. Varje listpost får en bock (`CheckCircle`, 44 × 44 px) som växlar optimistiskt och sparas direkt. `computeList` sätter `checked` från överlägget, så bocken står kvar när listan räknas om och nyckeln är densamma.

## Boundaries & Constraints

**Always:** Bara `shopping` läser och skriver `shopping_check` (AD-1). Migrationen följer AD-4: `user_id uuid not null default auth.uid() references auth.users on delete cascade`, RLS med en policy `user_id = (select auth.uid())`, `revoke all` och `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`. `shopping_check(id, user_id, meal_plan_id, line_key, created_at)` är unik på `(meal_plan_id, line_key)`; sammansatt FK `(meal_plan_id, user_id)` mot `meal_plan (id, user_id)` med `on delete cascade` (matsedeln äger sitt överlägg, AD-20); `check` att `line_key` har formen `r:<uuid>:<enhet|->` eller `c:<uuid>`. Nyckeln valideras med `lineKeySchema` från `shopping/domain/line-key.ts`. Bockar gäller den aktuella matsedeln (AD-22): actionen tar emot `planId` och jämför med `mealplan.getCurrentPlan()`; är den inte längre aktuell returneras `shopping_plan_changed`. Att bocka av är idempotent (`insert … on conflict do nothing`), att ta bort bocken likaså. Actions: `requireUser()`, Zod, `Result`, felkoder `shopping_<orsak>`, `revalidateFor('shopping_check')` som revaliderar `/lista`. Bocken använder `useOptimistic` (Consistency Conventions). En bock utan matchande post ignoreras av `computeList` och tas inte bort. Kör aldrig `supabase db reset`.

**Never:** Ingen omsortering eller flytt av avbockade poster; de stannar på sin plats tills de läggs i lagret (EXPERIENCE: Listpost). Ingen "Lägg i lagret" (3.7). Ingen "Avbocka alla".

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bocka av | Tryck på bocken vid "Paprika, röd 1 st" | Bocken fylls med `accent` direkt, texten blir genomstruken i `ink-3`, posten står kvar på sin plats; "varor kvar" minskar med 1 | N/A |
| Sparas | Ladda om sidan | Posten är fortfarande avbockad | N/A |
| Ta bort bock | Tryck igen | Posten är inte längre avbockad | N/A |
| Fel vid sparning | Databasfel | Bocken går tillbaka och blå `Notice` "Det gick inte att spara bocken." | `shopping_check_failed` |
| Omräkning, samma nyckel | Avbockad "Grädde 3 dl", portionerna ändras så att behovet blir 4 dl | "Grädde 4 dl" är fortfarande avbockad | N/A |
| Omräkning, posten försvinner | Avbockad post blir täckt av lagret | Posten visas inte; bocken ligger kvar och gäller om posten kommer tillbaka | N/A |
| Matsedeln byts | Bock på matsedel A, "Använd igen" gör B aktuell | Listan för B har inga bockar; A:s bockar följer A | N/A |
| Gammal sida | Bock från en flik där matsedeln hunnit bytas | "Matsedeln har bytts. Listan är uppdaterad." och listan laddas om | `shopping_plan_changed` |
| Dubbeltryck | Två snabba tryck från två enheter som bockar av samma post | En rad i `shopping_check` | Unik nyckel, `on conflict do nothing` |
| Skärmläsare | Fokus på bocken | Namnet följer "Paprika, röd, 1 st, inte avbockad" / "…, avbockad"; "Finns hemma?"-poster: "Salt, finns hemma?, inte avbockad" | N/A |
| Annan användare | Läser eller skriver A:s bockar | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `src/features/shopping/` -- från 3.3: `computeList`, `lineKey`, `getShoppingList`, `ShoppingLineRow`
- `src/features/mealplan/server.ts` -- `getCurrentPlan()`; `meal_plan` har unik `(id, user_id)` för sammansatt FK (3.1)
- `supabase/migrations/*_mealplan.sql`, `*_recipes.sql` -- mönster för tabell, RLS, grants och sammansatt FK
- `src/components/check-circle.tsx` (`CheckCircle` med `label`), `notice.tsx`
- `src/lib/revalidate.ts`, `src/lib/errors.ts`
- `tests/integration/support.ts` (`expectRlsIsolation`)
- `tests/e2e/shopping.spec.ts` -- från 3.3, med e2e-användaren `shoppingEmail`

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_shopping_check.sql` (`supabase migration new … < /dev/null`, `supabase migration up`) och `pnpm db:types` -- `shopping_check` enligt Boundaries, index på `(user_id, meal_plan_id)` -- AD-4, AD-8, AD-20
- [ ] `src/features/shopping/data/checks.ts` (+ `queries.ts`) -- `listChecks(planId)` för överlägget, `setCheck(planId, key)` och `clearCheck(planId, key)` -- AD-1
- [ ] `src/features/shopping/domain/compute-list.ts` (+ test) -- `overlay.checks` sätter `checked`; bock utan post ignoreras -- AD-8
- [ ] `src/features/shopping/actions/set-checked.ts` (+ test) -- `setChecked({ planId, key, checked })`: `requireUser`, `lineKeySchema`, aktuell matsedel via `mealplan`, skrivning, `revalidateFor('shopping_check')` -- AD-2, AD-22
- [ ] `src/lib/revalidate.ts` -- `shopping_check` → `/lista` -- AD-18
- [ ] `src/lib/errors.ts` -- `shopping_check_failed` ("Det gick inte att spara bocken."), `shopping_plan_changed` ("Matsedeln har bytts. Listan är uppdaterad.") -- AD-13
- [ ] `src/features/shopping/ui/` -- bocken i `ShoppingLineRow` med `useOptimistic`, genomstruken text i `ink-3`, skärmläsarnamn, "varor kvar" räknar bara poster som inte är avbockade; tryck på bocken och varunamnet är skilda tryckytor -- FR16, UX-DR9
- [ ] `tests/integration/shopping.test.ts` (utökad) -- `expectRlsIsolation('shopping_check', …)`; unik nyckel; `check` nekar felaktig nyckel; FK nekar annans matsedel; cascade när matsedeln raderas -- AD-4
- [ ] `tests/e2e/shopping.spec.ts` (utökad) -- bocka av, ladda om, ta bort bock, bocken står kvar efter ändrade portioner -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellen finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
