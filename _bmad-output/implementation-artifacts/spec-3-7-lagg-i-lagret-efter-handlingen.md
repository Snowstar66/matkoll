---
title: 'Story 3.7: Lägg i lagret efter handlingen'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter handlingen stämmer inte lagret förrän Pontus skrivit in varje vara. Hen vill lägga allt som är avbockat i lagret med ett tryck.

**Approach:** `pantry.addToPantry(items)` byggs (AD-19) som en atomär Postgres-funktion i `pantry`. "Lägg i lagret" (`shopping/actions/putCheckedInPantry`) räknar fram listan på servern med `computeList`, skickar de avbockade posterna till `addToPantry` på katalogingrediensens plats, tar bort de avbockade egna varorna och rensar bockar och överstyrningar för de nycklarna (AD-8). Flödet går över två moduler och är idempotent i stället för atomärt (AD-1): varje post bär en idempotensnyckel, så en ny körning efter ett avbrott ökar aldrig lagret två gånger.

## Boundaries & Constraints

**Always:** `addToPantry(items)` ägs av `pantry` och skriver bara `pantry`s tabeller (AD-1, AD-19): för varje post ökas raden med samma `(ingredient_id, location, unit)` eller skapas en ny; är ingrediensen redan obegränsad (någon rad utan enhet, på vilken plats som helst) ändras inget; en post utan mängd (vag post) blir obegränsad lagervara; saknad plats blir katalogingrediensens plats via `catalog.getIngredientDefaults` (AD-1). Funktionen är idempotent per post: varje post har en `key`, och en kvittotabell `pantry_addition(user_id, key, created_at)`, unik på `(user_id, key)`, skrivs i samma transaktion som ökningen; finns kvittot redan hoppas posten över. Nyckeln är id:t på postens rad i `shopping_check`, som är stabilt tills bocken rensas. Kvitton äldre än 30 dagar tas bort i funktionen. `pantry_addition` följer AD-4 (`user_id default auth.uid()`, RLS med en policy, `revoke all`, grants till `authenticated` och `service_role`, aldrig `anon`). `putCheckedInPantry({ planId })`: `requireUser()`, Zod, aktuell matsedel via `mealplan` (`shopping_plan_changed` annars, AD-22), listan räknas fram på servern med `computeList` (klientens poster används aldrig), avbockade receptposter och avbockade egna varor med katalogkoppling skickas till `addToPantry` med postens mängd och enhet (rättad mängd från 3.6 om den finns, vag post utan mängd), därefter tar en atomär Postgres-funktion i `shopping` bort de avbockade egna varorna och rensar `shopping_check` och `shopping_line_override` för de skickade nycklarna (AD-8). Ordningen är alltid lagret först, rensningen sedan. Efteråt `revalidateFor('pantry_item')`, `revalidateFor('shopping_check')`, `revalidateFor('shopping_custom_item')` och `revalidateFor('shopping_line_override')`, så att lista, matsedel, bibliotek, receptvy och Hemma räknas om (AD-18). Felkoder `pantry_<orsak>` och `shopping_<orsak>`. "Lägg i lagret" är primärknapp i `FixedAction` ovanför flikfältet och visas bara när minst en post är avbockad; knappen är inaktiv medan flödet pågår. Den korta bekräftelsen visas ovanför knappen. Kör aldrig `supabase db reset`.

**Never:** Ingen omräkning mellan enheter (AD-12). Ingen "Skicka till ICA" (Epic 7). Ingen förhandsbekräftelse (EXPERIENCE: bara för recept och matsedel). Ingen "Ångra" för hela flödet. Inga skrivningar till `pantry_item` utanför `pantry`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Knappen | Ingen post avbockad / minst en avbockad | Ingen knapp / "Lägg i lagret" som primärknapp ovanför flikfältet | N/A |
| Ökning | Avbockad "Grädde 3 dl"; Kyl har grädde 2 dl | Kyl får grädde 5 dl | N/A |
| Ny rad | Avbockad "Mjöl 2 dl (hemma: 1 kg)" | Ny rad mjöl 2 dl i katalogens plats (Skafferi); raden 1 kg är orörd | N/A |
| Ny vara | Avbockad "Paprika 2 st", ingen paprika i lagret | Ny rad paprika 2 st i Kyl (katalogens plats) | N/A |
| Vag post | Avbockad "Salt – Finns hemma?" | Salt blir obegränsad lagervara i katalogens plats | N/A |
| Redan obegränsad | Avbockad post för en ingrediens som redan är obegränsad | Lagret ändras inte; posten räknas ändå som lagd | N/A |
| Rättad mängd | "Grädde" rättad till 1 dl (3.6), avbockad | Lagret ökar med 1 dl; överstyrningen rensas | N/A |
| Egen vara med koppling | Avbockad "kaffe" kopplad till Kaffe, utan mängd | Kaffe blir obegränsad lagervara i katalogens plats; den egna varan tas bort från listan | N/A |
| Egen vara med koppling och mängd | Avbockad "kaffe 2 förp" kopplad till Kaffe | Lagret ökar med 2 förp kaffe; den egna varan tas bort | N/A |
| Egen vara utan koppling | Avbockad "diskmedel" | Inget läggs i lagret; varan tas bort från listan | N/A |
| Bekräftelse | 8 poster till lagret | "Lagt 8 varor i lagret." (en post: "Lagt 1 vara i lagret."); posterna försvinner från listan; lagningsstatus räknas om | N/A |
| Bara okopplade egna varor | Endast "diskmedel" avbockad | "Tog bort 1 vara från listan." | N/A |
| Ej avbockade | Poster utan bock, dolda poster | Rörs inte och står kvar | N/A |
| Posten kommer tillbaka | Rättad mängd mindre än behovet | Efter flödet räknas posten om och kan visas igen, utan bock, med det som fortfarande saknas; avsiktligt (AD-8) | N/A |
| Avbrott efter lagret | Lagret är uppdaterat men rensningen misslyckas; Pontus trycker igen | Blå `Notice` "Det gick inte att lägga allt i lagret. Försök igen."; nästa körning hoppar över poster med kvitto och rensar; lagret blir detsamma som efter en körning | `shopping_put_in_pantry_failed`, idempotens via `pantry_addition` |
| Avbrott i lagret | `addToPantry` misslyckas | Inget ändras i lagret (en transaktion); bockarna står kvar; samma `Notice` | `pantry_add_failed` |
| Dubbeltryck | Två tryck i rad eller från två enheter | Lagret ökar en gång | Kvitto per nyckel |
| Matsedeln byts | Gammal flik, matsedeln har bytts | "Matsedeln har bytts. Listan är uppdaterad." | `shopping_plan_changed` |
| Annan användare | Läser eller skriver A:s kvitton | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `src/features/pantry/` -- Epic 2: `pantry_item` (unik `(user_id, ingredient_id, location, unit)` med `nulls not distinct`), `set_pantry_items`, `getPantrySnapshot`, `revalidateFor('pantry_item')`; se `spec-2-1-*` och `spec-2-2-*`
- `src/features/catalog/server.ts` -- `getIngredientDefaults(ids)` (plats)
- `src/features/shopping/` -- från 3.3–3.6: `computeList`, bockar (`shopping_check` med id), egna varor, överstyrningar
- `src/features/mealplan/server.ts` -- `getCurrentPlan()`
- `src/components/fixed-action.tsx` (`FixedAction`, `fixedActionOffsetVar`), `toast.tsx`, `notice.tsx`, `button.tsx`
- `src/lib/revalidate.ts`, `src/lib/errors.ts`
- `docs/beslutslogg.md` -- två beslut, se Implementation Notes
- `tests/e2e/support.ts`, `global-setup.ts` -- ny e2e-användare

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_pantry_add.sql` och `pnpm db:types` -- `pantry_addition` enligt Boundaries; `add_to_pantry(items jsonb)` (`security invoker`, en transaktion): kvitto `on conflict do nothing returning`, sedan hoppa över om obegränsad, obegränsad rad för post utan mängd, annars `insert … on conflict (user_id, ingredient_id, location, unit) do update set amount = pantry_item.amount + excluded.amount`; returnerar antal behandlade poster; städar gamla kvitton -- AD-1, AD-4, AD-19
- [ ] `src/features/pantry/domain/` (+ test) -- `addToPantryItemSchema` (`key`, `ingredientId`, `amount` > 0 eller null, `unit` i `UNITS` eller null, `location` i `LOCATIONS` eller saknas) -- AD-12
- [ ] `src/features/pantry/data/`, `server.ts` (+ test) -- `addToPantry(items)`: `requireUser`, Zod, plats från `catalog.getIngredientDefaults` när den saknas, anropar `add_to_pantry`; exporteras från `pantry/server.ts` -- AD-19
- [ ] `supabase/migrations/<tid>_shopping_clear.sql` och `pnpm db:types` -- `clear_put_in_pantry(plan_id uuid, keys text[], custom_item_ids uuid[])` (`security invoker`): tar bort egna varor, bockar och överstyrningar för nycklarna i en transaktion -- AD-1, AD-8
- [ ] `src/features/shopping/actions/put-checked-in-pantry.ts` (+ test) -- flödet enligt Boundaries; returnerar `{ added, removed }` för bekräftelsen -- AD-8, AD-19, FR19
- [ ] `src/lib/errors.ts` -- `pantry_add_failed` ("Det gick inte att lägga varorna i lagret. Försök igen."), `shopping_put_in_pantry_failed` ("Det gick inte att lägga allt i lagret. Försök igen.") -- AD-13
- [ ] `src/features/shopping/ui/` -- "Lägg i lagret" i `FixedAction` när minst en post är avbockad (räknat på optimistiska bockar), inaktiv under flödet, bekräftelse "Lagt N varor i lagret." / "Lagt 1 vara i lagret." / "Tog bort N varor från listan.", `Notice` vid fel -- UX
- [ ] `docs/beslutslogg.md` -- besluten i Implementation Notes -- spårbarhet
- [ ] `tests/integration/pantry.test.ts` (utökad) -- `expectRlsIsolation('pantry_addition', …)`; `add_to_pantry` ökar, skapar, lämnar obegränsad orörd, gör vag post obegränsad; samma nyckel två gånger ger en ökning -- AD-19
- [ ] `tests/integration/shopping.test.ts` (utökad) -- hela flödet mot riktiga tabeller; körning, avbrott efter lagret (rensningen misslyckas) och ny körning ger samma lager som en körning -- AD-8
- [ ] `tests/e2e/support.ts`, `global-setup.ts` -- `putInPantryEmail` ("e2e-lagg-i-lagret@matkoll.test") i `e2eEmails` med egen storage state -- egen e2e-användare
- [ ] `tests/e2e/put-in-pantry.spec.ts` -- egen e2e-användare; data med service role: knappen syns först efter en bock, "Lägg i lagret" med receptpost, vag post, kopplad och okopplad egen vara, bekräftelsen, posterna borta, Hemma visar varorna, receptet visar "Kan lagas nu" -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (redan taget):** en avbockad egen vara som är kopplad till en katalogingrediens läggs i lagret som en receptpost, på ingrediensens standardplats (med sin mängd och enhet, eller som obegränsad om den saknar mängd), och tas sedan bort från listan. En egen vara utan katalogkoppling tas bara bort. Underlaget (AD-8, epic-3-context) lämnade frågan öppen. Beslutet ska skrivas in i `docs/beslutslogg.md` när storyn byggs.
- **Idempotens:** kvittotabellen `pantry_addition` med bockens id som nyckel är den här specens förslag på hur AD-1:s krav på idempotens uppfylls. Utan den ökar en ny körning efter ett avbrott lagret två gånger när en rättad mängd är mindre än behovet. Skriv in mekanismen i `docs/beslutslogg.md` tillsammans med beslutet ovan.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellen och funktionerna finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
