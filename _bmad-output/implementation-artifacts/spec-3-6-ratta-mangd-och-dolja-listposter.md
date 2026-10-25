---
title: 'Story 3.6: Rätta mängd och dölja listposter'
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

**Problem:** Appens beräkning stämmer inte alltid. Pontus behöver kunna rätta mängden på en listpost eller ta bort en post hen inte behöver, utan att ändringen försvinner när listan räknas om.

**Approach:** Tabellen `shopping_line_override(meal_plan_id, line_key, amount, hidden)` (AD-8) håller rättad mängd och dold post per listnyckel. Ett tryck på varunamnet öppnar arket Listpostdetalj med mängd, ursprung och "Ta bort". `computeList` tillämpar överstyrningen, så rättelsen och den dolda posten står kvar så länge nyckeln är densamma. För en egen vara ändrar detaljen raden i `shopping_custom_item` direkt och "Ta bort" tar bort varan som i 3.5.

## Boundaries & Constraints

**Always:** Bara `shopping` läser och skriver `shopping_line_override` (AD-1). Migrationen följer AD-4 (`user_id default auth.uid()`, RLS med en policy, `revoke all`, grants till `authenticated` och `service_role`, aldrig `anon`). `shopping_line_override(id, user_id, meal_plan_id, line_key, amount numeric null, hidden boolean not null default false, created_at, updated_at)`: unik på `(meal_plan_id, line_key)`; `amount` > 0 när den finns; `check` att `line_key` är en receptnyckel (`r:…`); sammansatt FK `(meal_plan_id, user_id)` mot `meal_plan` med `on delete cascade` (AD-20). I `computeList` ersätter `amount` den beräknade mängden i postens enhet (enheten ligger i nyckeln och ändras aldrig, AD-12), och `hidden` tar bort posten ur resultatet; en överstyrning utan matchande post ignoreras och ligger kvar. En vag post ("Finns hemma?") har ingen mängd att rätta; detaljen visar bara ursprung och "Ta bort". Dölja är en upsert som behåller en rättad mängd; `hideLine` returnerar raden som den var före (eller `null`), och `restoreLine(previous)` sätter tillbaka exakt den raden med samma id eller tar bort raden om det inte fanns någon (AD-20). Överstyrningar gäller den aktuella matsedeln (`shopping_plan_changed` som i 3.4, AD-22). Arket följer EXPERIENCE: stängs med "Klar"/"Avbryt", svep nedåt, Esc eller tryck utanför; osparade ändringar ger "Släng ändringarna?"; ark staplas aldrig. Mängden tolkas med `parseQuantity` och visas med `formatQuantity`. Actions: `requireUser()`, samma Zod-schema som formuläret, `Result`, `shopping_<orsak>`, `revalidateFor('shopping_line_override')` → `/lista`. Kör aldrig `supabase db reset`.

**Never:** Inget produktval i listpostdetaljen (Epic 7). Ingen ändring av enhet på en receptpost. Ingen vy för dolda poster; en dold post kommer tillbaka bara med "Ångra" eller på en ny matsedel. Ingen överstyrning för egna varor (de har egen mängd i `shopping_custom_item`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna detaljen | Tryck på varunamnet "Grädde" (inte bocken) | Arket Listpostdetalj: "Grädde", mängd "3" med enheten "dl", "Från Krämig kycklinggryta, Linssoppa", "(hemma: …)" vid annan enhet, och "Ta bort" | N/A |
| Rätta mängd | Ändra till "2", "Spara" | Arket stängs; posten visar "Grädde 2 dl"; detaljen visar "Beräknat: 3 dl" | Ogiltig mängd ("två", "0"): "Ange ett tal större än 0." vid fältet; inget sparas |
| Rättelsen står kvar | Lagret eller portionerna ändras, nyckeln är densamma | Posten visar fortfarande den rättade mängden | N/A |
| Återställ | "Använd beräknad mängd" i detaljen | Den rättade mängden tas bort; posten visar den beräknade mängden igen | N/A |
| Vag post | Tryck på "Salt – Finns hemma?" | Detaljen visar ursprung och "Ta bort", inget mängdfält | N/A |
| Dölj via svep | Svep vänster på "Grädde", "Ta bort" | Posten försvinner direkt; "Grädde är borttagen." med "Ångra" i 5 s | Fel: posten kommer tillbaka och "Det gick inte att ta bort varan." |
| Dölj via detaljen | "Ta bort" i detaljen | Arket stängs; samma bekräftelse | N/A |
| Ångra | "Ångra" inom 5 s | Posten kommer tillbaka med den rättade mängd den hade före | "Det gick inte att ångra." |
| Dold vid omräkning | Matsedeln ändras, posten har samma nyckel | Posten förblir dold (AD-8) | N/A |
| Ny nyckel | Behovet byter enhet (t.ex. en ny rätt med mjöl i g) | Den nya nyckeln `r:<mjöl>:g` visas; den dolda `r:<mjöl>:dl` förblir dold | N/A |
| Egen vara | Tryck på "diskmedel" | Detaljen visar text, mängd och enhet (valfria) och katalogkoppling; "Spara" ändrar raden; "Ta bort" tar bort varan med Ångra som i 3.5 | `shopping_save_failed` |
| Stäng med ändringar | Ändrad mängd, stäng arket | "Släng ändringarna?" | N/A |
| Varor kvar | En post döljs | "varor kvar" i rubriken räknar inte dolda poster | N/A |
| Annan användare | Läser eller skriver A:s överstyrningar | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `src/features/shopping/` -- från 3.3–3.5: `computeList`, `line-key.ts`, bockar, egna varor, `ShoppingLineRow`
- `src/components/sheet.tsx` (`isDirty`, "Släng ändringarna?"), `swipe-row.tsx` (2.3), `toast.tsx`, `field.tsx`, `button.tsx`
- `src/features/catalog/` -- `parseQuantity`, `formatQuantity`
- `src/lib/revalidate.ts`, `src/lib/errors.ts`
- `tests/e2e/shopping.spec.ts` -- e2e-användaren `shoppingEmail`

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_shopping_line_override.sql` och `pnpm db:types` -- tabellen enligt Boundaries, `updated_at` sätts vid update -- AD-4, AD-8, AD-20
- [ ] `src/features/shopping/domain/` (+ test) -- `lineAmountFormSchema` (mängd via `parseQuantity` > 0); `computeList` tillämpar `overlay.overrides` (rättad mängd ersätter, dold tas bort, `computedAmount` med för detaljens "Beräknat") -- AD-8
- [ ] `src/features/shopping/data/`, `actions/set-line-amount.ts`, `clear-line-amount.ts`, `hide-line.ts`, `restore-line.ts`, `update-custom-item.ts` (+ tester) -- `requireUser`, Zod, aktuell matsedel via `mealplan`, upsert på `(meal_plan_id, line_key)`, `revalidateFor` -- AD-2, AD-20
- [ ] `src/lib/revalidate.ts` -- `shopping_line_override` → `/lista` -- AD-18
- [ ] `src/features/shopping/ui/line-detail-sheet.tsx` -- arket Listpostdetalj enligt matrisen, `useActionState`; tryck på varunamnet öppnar det; svep vänster med "Ta bort" på receptposter -- UX, UX-DR13
- [ ] `tests/integration/shopping.test.ts` (utökad) -- `expectRlsIsolation('shopping_line_override', …)`; unik nyckel; `check` nekar `c:`-nyckel; dölj och återställ med samma id; cascade med matsedeln -- AD-4
- [ ] `tests/e2e/shopping.spec.ts` (utökad) -- rätta mängd och se den efter ändrade portioner, återställ, dölj med svep och ångra, dölj via detaljen och se posten dold efter omräkning, ändra en egen vara -- matrisen

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
