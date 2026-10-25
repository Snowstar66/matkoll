---
title: 'Story 3.5: Egna varor'
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

**Problem:** Allt Pontus ska handla kommer inte från recepten. Diskmedel och kaffe behöver också stå på listan.

**Approach:** Tabellen `shopping_custom_item` (AD-8) håller egna varor per matsedel, med valfri katalogkoppling. "Lägg till egen vara" tar fritext och föreslår katalogingredienser medan Pontus skriver; en kopplad vara hamnar under ingrediensens avdelning, annars under Övrigt. `computeList` lägger till egna varor som egna poster med nyckeln `c:<id>`, och de slås aldrig ihop med receptposter. Bock sparas i `shopping_check` (3.4), och borttagning kan ångras.

## Boundaries & Constraints

**Always:** Bara `shopping` läser och skriver `shopping_custom_item` (AD-1). Migrationen följer AD-4 (`user_id default auth.uid()`, RLS med en policy, `revoke all`, grants till `authenticated` och `service_role`, aldrig `anon`). `shopping_custom_item(id, user_id, meal_plan_id, label, ingredient_id null, amount numeric null, unit text null, created_at)`: `label` inte tom; `amount` > 0 när den finns; `unit` i `UNITS` (`check`); `amount` och `unit` är antingen båda satta eller båda null (`check`), eftersom en lagerrad utan enhet betyder obegränsad (AD-19); sammansatt FK `(meal_plan_id, user_id)` mot `meal_plan` med `on delete cascade` (inom aggregatet) och `(ingredient_id, user_id)` mot `ingredient` med `on delete restrict` (mellan moduler, AD-20). Katalogkopplingen följer AD-6: förslag via `catalog.searchIngredients` (sök-action som prop från sidan, AD-1) och `addCustomItem` anropar `commitIngredients` när en koppling valts, så att texten sparas som synonym när den skiljer sig. Egen vara: nyckel `c:<id>` från `line-key.ts`, `isCustom: true`, `label` är Pontus text, avdelning från katalogingrediensen eller Övrigt, ingen täckningsjämförelse mot lagret och aldrig sammanslagning med receptposter (AD-8). Egna varor hör till den aktuella matsedeln (AD-22) och står kvar när den räknas om (FR18). Radering är hård; `removeCustomItem(id)` returnerar raden och `restoreCustomItem(row)` sätter tillbaka den med samma id; `addCustomItem` tar emot ett valfritt id (AD-20). Bocken på en egen vara ligger kvar vid borttagning, så att "Ångra" även ger tillbaka bocken. Actions: `requireUser()`, samma Zod-schema som formuläret, `Result`, `shopping_<orsak>`, `revalidateFor('shopping_custom_item')` → `/lista`. Svep vänster använder `SwipeRow` från 2.3; borttagningen visar `useToast` med "Ångra" i 5 s. Kör aldrig `supabase db reset`.

**Never:** Ingen ny katalogingrediens skapas från en egen vara (bara koppling till en befintlig). Ingen listpostdetalj eller ändring av mängd (3.6). Inga egna varor utan aktuell matsedel; matsedlar skapas bara av `mealplan` (AD-22).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lägg till okopplad | "Lägg till egen vara", skriv "diskmedel", "Lägg till" | Arket stängs; posten "diskmedel" står under Övrigt utan mängd | N/A |
| Förslag | Skriv "kaff" | Katalogträffar visas medan Pontus skriver (200 ms paus); att välja "Kaffe" kopplar varan | N/A |
| Kopplad | Välj "Kaffe" (avdelning Skafferi) | Posten står under Skafferi; texten sparas som synonym om den skiljer sig från namnet | N/A |
| Med mängd | "diskmedel", mängd "2", enhet "förp" | Posten visar "2 förp" till höger | Ogiltig mängd: "Ange ett tal större än 0." vid fältet |
| Ingen sammanslagning | Egen vara kopplad till grädde och receptpost "Grädde 3 dl" | Två poster: receptposten och den egna varan | N/A |
| Tom text | "Lägg till" utan text | "Skriv vad du vill lägga till." vid fältet; inget sparas | `validation` |
| Bocka av | Bocken på "diskmedel" | Sparas i `shopping_check` med nyckeln `c:<id>` | `shopping_check_failed` |
| Ta bort | Svep vänster på "diskmedel", "Ta bort" | Posten försvinner direkt; "diskmedel är borttagen." med "Ångra" i 5 s | Fel: posten kommer tillbaka och "Det gick inte att ta bort varan." (`shopping_remove_failed`) |
| Ångra | "Ångra" inom 5 s | Posten kommer tillbaka med samma id, samma avdelning och samma bock | "Det gick inte att ångra." (`shopping_restore_failed`) |
| Omräkning | Portioner eller lager ändras | Egna varor står kvar oförändrade | N/A |
| Ny matsedel | "Använd igen" eller "Ny matsedel" (3.2) | Egna varor följer den förra matsedeln och visas inte på den nya listan | N/A |
| Ingen matsedel | Ingen aktuell matsedel | "Lägg till egen vara" visas inte; tomt läge som i 3.3 | N/A |
| Allt hemma | Alla receptposter täckta, en egen vara finns | Den egna varan visas; "Allt finns hemma." visas bara när det inte finns några poster alls | N/A |
| Annan användare | Läser eller skriver A:s egna varor, eller kopplar till A:s ingrediens | Inga rader / nekas | RLS, sammansatt FK |

</frozen-after-approval>

## Code Map

- `src/features/shopping/` -- från 3.3–3.4: `computeList`, `line-key.ts`, bockar, `ShoppingLineRow`
- `src/features/catalog/server.ts` -- `searchIngredients` (sök-action), `commitIngredients`, `getIngredientDefaults`
- `src/components/ingredient-picker.tsx` -- gemensam väljare från 2.2; återanvänd sökdelen eller bygg ett enklare förslagsfält på samma sätt
- `src/components/swipe-row.tsx` (2.3), `toast.tsx` (`useToast`, `onUndo`), `sheet.tsx`, `field.tsx`
- `src/lib/revalidate.ts`, `src/lib/errors.ts`
- `tests/e2e/shopping.spec.ts` -- e2e-användaren `shoppingEmail`

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_shopping_custom_item.sql` och `pnpm db:types` -- tabellen enligt Boundaries, index på `(user_id, meal_plan_id)` -- AD-4, AD-6, AD-20
- [ ] `tests/design/` -- `unit`-listan i migrationen är exakt `UNITS` -- drift
- [ ] `src/features/shopping/domain/custom-item.ts` (+ test) -- `customItemFormSchema` (text trimmad och inte tom, valfri `ingredientId`, mängd via `parseQuantity` > 0 eller tom, enhet i `UNITS`; mängd och enhet anges båda eller ingen, annars "Välj en enhet." vid fältet) -- AD-12
- [ ] `src/features/shopping/domain/compute-list.ts` (+ test) -- `overlay.customItems` ger poster med `c:<id>`, avdelning från katalogen eller Övrigt, aldrig sammanslagna; bock via `c:<id>` -- AD-8
- [ ] `src/features/shopping/data/`, `actions/add-custom-item.ts`, `remove-custom-item.ts`, `restore-custom-item.ts` (+ tester) -- `requireUser`, Zod, aktuell matsedel via `mealplan` (`shopping_plan_changed` som i 3.4), `commitIngredients` vid koppling, `revalidateFor('shopping_custom_item')` -- AD-2, AD-6, AD-20
- [ ] `src/lib/revalidate.ts` -- `shopping_custom_item` → `/lista` -- AD-18
- [ ] `src/lib/errors.ts` -- `shopping_save_failed` ("Det gick inte att spara varan. Försök igen."), `shopping_remove_failed`, `shopping_restore_failed` -- AD-13
- [ ] `src/features/shopping/ui/` -- knappen "Lägg till egen vara" under listan, arket med textfält (minst 16 px) och förslag, valfri mängd och enhet, `isDirty` och "Släng ändringarna?"; svep vänster med "Ta bort" och Ångra på egna varor -- FR17, UX-DR13
- [ ] `tests/integration/shopping.test.ts` (utökad) -- `expectRlsIsolation('shopping_custom_item', …)`; FK nekar annans ingrediens; cascade med matsedeln; `restore` med samma id -- AD-4
- [ ] `tests/e2e/shopping.spec.ts` (utökad) -- lägg till "diskmedel" under Övrigt, koppla till en katalogingrediens och se avdelningen, bocka av, ta bort och ångra, står kvar efter ändrade portioner -- matrisen

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
