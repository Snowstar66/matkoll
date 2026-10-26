---
title: 'Story 3.7: Lägg i lagret efter handlingen'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '7db83788be4446b4369b228bde9df265f1683867'
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
- [x] `supabase/migrations/<tid>_pantry_add.sql` och `pnpm db:types` -- `pantry_addition` enligt Boundaries; `add_to_pantry(items jsonb)` (`security invoker`, en transaktion): kvitto `on conflict do nothing returning`, sedan hoppa över om obegränsad, obegränsad rad för post utan mängd, annars `insert … on conflict (user_id, ingredient_id, location, unit) do update set amount = pantry_item.amount + excluded.amount`; returnerar antal behandlade poster; städar gamla kvitton -- AD-1, AD-4, AD-19
- [x] `src/features/pantry/domain/` (+ test) -- `addToPantryItemSchema` (`key`, `ingredientId`, `amount` > 0 eller null, `unit` i `UNITS` eller null, `location` i `LOCATIONS` eller saknas) -- AD-12
- [x] `src/features/pantry/data/`, `server.ts` (+ test) -- `addToPantry(items)`: `requireUser`, Zod, plats från `catalog.getIngredientDefaults` när den saknas, anropar `add_to_pantry`; exporteras från `pantry/server.ts` -- AD-19
- [x] `supabase/migrations/<tid>_shopping_clear.sql` och `pnpm db:types` -- `clear_put_in_pantry(plan_id uuid, keys text[], custom_item_ids uuid[])` (`security invoker`): tar bort egna varor, bockar och överstyrningar för nycklarna i en transaktion -- AD-1, AD-8
- [x] `src/features/shopping/actions/put-checked-in-pantry.ts` (+ test) -- flödet enligt Boundaries; returnerar `{ added, removed }` för bekräftelsen -- AD-8, AD-19, FR19
- [x] `src/lib/errors.ts` -- `pantry_add_failed` ("Det gick inte att lägga varorna i lagret. Försök igen."), `shopping_put_in_pantry_failed` ("Det gick inte att lägga allt i lagret. Försök igen.") -- AD-13
- [x] `src/features/shopping/ui/` -- "Lägg i lagret" i `FixedAction` när minst en post är avbockad (räknat på optimistiska bockar), inaktiv under flödet, bekräftelse "Lagt N varor i lagret." / "Lagt 1 vara i lagret." / "Tog bort N varor från listan.", `Notice` vid fel -- UX
- [x] `docs/beslutslogg.md` -- besluten i Implementation Notes -- spårbarhet
- [x] `tests/integration/pantry.test.ts` (utökad) -- `expectRlsIsolation('pantry_addition', …)`; `add_to_pantry` ökar, skapar, lämnar obegränsad orörd, gör vag post obegränsad; samma nyckel två gånger ger en ökning -- AD-19
- [x] `tests/integration/shopping.test.ts` (utökad) -- hela flödet mot riktiga tabeller; körning, avbrott efter lagret (rensningen misslyckas) och ny körning ger samma lager som en körning -- AD-8
- [x] `tests/e2e/support.ts`, `global-setup.ts` -- `putInPantryEmail` ("e2e-lagg-i-lagret@matkoll.test") i `e2eEmails` med egen storage state -- egen e2e-användare
- [x] `tests/e2e/put-in-pantry.spec.ts` -- egen e2e-användare; data med service role: knappen syns först efter en bock, "Lägg i lagret" med receptpost, vag post, kopplad och okopplad egen vara, bekräftelsen, posterna borta, Hemma visar varorna, receptet visar "Kan lagas nu" -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (redan taget):** en avbockad egen vara som är kopplad till en katalogingrediens läggs i lagret som en receptpost, på ingrediensens standardplats (med sin mängd och enhet, eller som obegränsad om den saknar mängd), och tas sedan bort från listan. En egen vara utan katalogkoppling tas bara bort. Underlaget (AD-8, epic-3-context) lämnade frågan öppen. Beslutet ska skrivas in i `docs/beslutslogg.md` när storyn byggs.
- **Idempotens:** kvittotabellen `pantry_addition` med bockens id som nyckel är den här specens förslag på hur AD-1:s krav på idempotens uppfylls. Utan den ökar en ny körning efter ett avbrott lagret två gånger när en rättad mängd är mindre än behovet. Skriv in mekanismen i `docs/beslutslogg.md` tillsammans med beslutet ovan.

- **Regler från Epic 2:**
  - `add_to_pantry` tar `pantry_lock()`.
  - Regeln från 2.2 ska hålla: en ingrediens på en plats är antingen obegränsad eller har mängder.
  - En vag post blir obegränsad bara om ingrediensen saknas helt, vilket är det enda fallet då listan visar "Finns hemma?".
  - Om raderna med mängd ändå finns på platsen följer funktionen `set_pantry_items` regel: den obegränsade raden ersätter dem.
- **Regler från 3.3–3.6:**
  - Mängden som läggs i lagret är postens köpmängd. För styckenheter är den avrundad uppåt (3.3), och en rättad mängd används som den står (3.6).
  - Textposter (`t:`) saknar katalogingrediens. De läggs inte i lagret, men deras bockar och överstyrningar rensas.
  - Egna varor kopplas utan synonymer (3.5).
  - Alla skrivande funktioner i `shopping` tar `meal_plan_lock()` och kontrollerar att matsedeln är aktuell.
- **Efter granskningen (beslut):**
  - Textposter (`t:`) kan inte läggas i lagret. Deras bockar rensas inte utan står kvar, och en avbockad textpost räknas inte när knappen ska visas. Det ersätter regeln ovan om att deras bockar och överstyrningar rensas.
  - Bockar rensas på id, inte på listnyckel: de skickade postens bockar och bockar med kvitto vars post inte längre syns. Överstyrningar rensas bara för receptposter som skickades i körningen, så en dold post förblir dold.
  - Kvittot lever lika länge som bocken: `pantry.forgetPantryAdditions(keys)` tar bort kvittona efter en lyckad rensning. Gallringen efter 30 dagar finns kvar som skyddsnät. `authenticated` får inte uppdatera `pantry_addition`.
  - En misslyckad rensning prövas en gång till innan `shopping_put_in_pantry_failed`. `getShoppingList` ger `pendingClear`, antalet bockar med kvitto vars post inte syns, och knappen visas även då.
  - En summa över lagrets maxgräns kapas strax under den (999 999,999), både i `add_to_pantry` och innan posten skickas. En post som ändå inte kan skickas (okänd ingrediens, ogiltig enhet) hoppas över och behåller sin bock, och resten läggs i. Då visas "Det gick inte att lägga allt i lagret.".
  - `add_to_pantry` nekar mängd ≤ 0, mängd utan enhet eller enhet utan mängd, och okänd enhet eller plats med 22023. `addToPantryIn` slår upp varje ingrediens i katalogen, även när platsen är given.
  - Byts matsedeln efter att lagret skrivits visas "Varorna är lagda i lagret, men matsedeln har bytts." (`shopping_put_in_pantry_plan_changed`). Kommer inget svar visas "Det gick inte att nå servern. Försök igen.". Knappen är inaktiv medan en bock sparas.
- **Görs inte (från granskningen):**
  - Bekräftelsen räknar inte med RPC:ns antal behandlade poster. Den säger vad Pontus skickade.
  - En befintlig rads plats föredras inte framför katalogens plats, eftersom matrisen anger katalogens plats.
  - En vara kan läggas i två gånger om Pontus tar bort och sätter bocken igen mellan en misslyckad körning och omförsöket, eftersom kvittot följer bocken. Det är ovanligt.
  - Två körningar exakt samtidigt kan lägga i en vara två gånger, om den andra läste bockarna före den förstas rensning men når lagret först efter att kvittona glömts. Det kräver tryck från två enheter i samma ögonblick.

## Spec Change Log

- `pantry_addition` har en primärnyckel `id`, som AD-4 och `expectRlsIsolation` kräver.
- Ny läsfunktion `pantry.findPantryAdditions(keys)`. Vid en ny körning efter ett avbrott kan en post som lagret nu täcker ha försvunnit från listan. Dess bock rensas ändå, eftersom den har ett kvitto.
- `addToPantry` ger ett `Result` i stället för att kasta.
- Läsfel innan något har skrivits ger `pantry_add_failed`.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- Rensningen:
  - Bockar rensas på id, inte på nyckel.
  - Överstyrningar rensas bara för de nycklar som skickades, så att döljningar behålls.
- Kvitton:
  - Kvitton glöms när rensningen har lyckats (`forgetPantryAdditions`).
  - Det går inte längre att uppdatera kvitton.
- Om rensningen misslyckas:
  - Rensningen görs om en gång automatiskt.
  - Knappen visas också när det finns `pendingClear`.
- Mängder:
  - Mängder begränsas till maxvärdet.
  - En post som inte går att lägga i lagret hoppas över och behåller sin bock.
- Indatakontroll i `add_to_pantry`, och alla ingredienser kontrolleras mot katalogen.
- Meddelanden:
  - Ett eget meddelande när lagret skrevs men matsedeln byttes.
  - Ett neutralt meddelande när svaret försvinner.
- Knappen är avstängd medan bockar sparas.
- `t:`-bockar lämnas orörda. Det ändrar den tidigare anteckningen: textposter kan inte hamna i lagret, så de förblir avbockade.
- Städning av död kod.
- Nya tester.

**Reject:**
- Att räkna med RPC:ns antal hanterade poster. Bekräftelsen räknar det Pontus skickade.
- Att föredra platsen där en befintlig rad ligger. Matrisen säger katalogens plats.
- Att skydda mot dubbel ökning när Pontus avmarkerar och bockar om mellan ett avbrutet försök och nästa. Det är sällsynt, och kvittot följer bocken.

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellen och funktionerna finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
