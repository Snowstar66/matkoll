---
title: 'Story 9.12: Välj erbjudanden till inköpslistan'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: 'c68abb8'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-11-hur-bra-ar-erbjudandet.md'
  - '{project-root}/docs/erbjudanden-lankar.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus skrev: "Jag vill också kunna välja vilka [erbjudanden] jag ska lägga i min inköpslista." Veckans erbjudanden går bara att titta på; vill han köpa något måste han skriva in det själv.

**Approach:**
- Raden blir en tydlig produktrad (Pontus: "kanske går listan göras lite roligare/snyggare också"): rensat namn ("Aubergine" för "ICA. Spanien Aubergine"), land och märke smått under, priset fetstilt i en piller till höger, ordinarie pris genomstruket under, rabattmärket "−20 %" och "Toppklipp −33 %" från 30 %.
- Varje rad i erbjudandelistan får en kryssruta (namnet är erbjudandets text). Ikryssade erbjudanden läggs med en knapp, "Lägg N i inköpslistan", som egna varor ("egna varor", Story 3.5) på den aktuella matsedelns lista.
- Varan är erbjudandets katalogvara när erbjudandet matchats (länken `ingredient_id`), annars erbjudandets namn som fri text. Texten får en kort notering: "Havregryn (Erbjudande: 89 kr/kg)".
- Samma erbjudande två gånger blir en vara: varans id görs av erbjudandets id. Rader som redan ligger på listan visar "På listan" och kan inte kryssas.
- En toast bekräftar ("Lade 2 erbjudanden i inköpslistan.") och länkar till Inköpslista.

## Boundaries & Constraints

**Always:**
- Egna varor återanvänds: `add_shopping_custom_item` via `addCustomItemIn` (matsedelslås, aktuell plan, samma id ger samma rad). Ingen ny migration, ingen ändring av tabeller.
- Ingen gissning: ett erbjudande utan katalogmatch blir fri text, aldrig en länkad vara på gissning.
- Kryssrutor och knapp har minst 44 px tryckyta och namn för skärmläsare; "På listan" syns som text, inte bara färg.
- Epic 11-komponenter (`ListRow`, `CheckCircle`, `Badge`, `Sheet`, `Button`). Inga osynliga tecken i källkoden annat än som `\u`-escapes. Ingen hämtning från ica.se.
- Moduler: arket i `offers` importerar inte `shopping` (AD-1). Sidan (`app/(app)/lista/list-offers.tsx`) läser planen och vad som ligger på listan från `shopping/server` och skickar `listing` (plan, `onList`, åtgärden) till arket.

**Never:**
- Ingen ändring av `src/server/ai/` eller förslagskoden (9.5 byggs parallellt); i `offers-sheet.tsx` bara listan och åtgärden.
- Ingen påverkan på matsedelns recept, lagret eller katalogen (listan skriver aldrig till katalogen).

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| Inget kryssat | Arket öppnas | Kryssrutor, ingen knapp |
| Två kryssade | "Havets Laxfilé", "Odlarna Gul lök" | Knappen "Lägg 2 i inköpslistan"; efter tryck två egna varor, toast, raderna visar "På listan" |
| Matchat erbjudande | `ingredient_id` satt | Egen vara länkad till katalogvaran, text "Namn (Erbjudande: pris)" |
| Ej matchat | `ingredient_id` null | Egen vara som fri text |
| Läggs igen | Samma erbjudande | En vara (id av erbjudandets id) |
| Redan på listan | Varan finns på planen | "På listan", ofylld och avstängd kryssruta |
| Ingen aktuell matsedel | Ingen plan | Inga kryssrutor, listan som förut |
| Fel vid sparande | Databasen nekar | Varning i arket, kryssen kvar, nytt försök lägger resten |
| Matsedeln har bytts | `shopping_plan_changed` | Meddelandet, sidan läses om |

## Code Map

- `src/features/offers/domain/offer.ts` -- `offerListItem`, `addToListText`, `addedToListText`
- `src/features/offers/ui/offers-list.tsx` -- `selection`: kryssruta, "På listan"
- `src/features/offers/ui/offers-sheet.tsx` -- val, `listing`, knapp i arkets sidfot, toast
- `src/features/shopping/actions/add-keyed-items.ts`, `domain/keyed-item.ts`, `data/keyed-item-id.ts`, `server.ts` (`getKeyedItemsOnList`)
- `src/app/(app)/lista/list-offers.tsx` -- sätter ihop `listing`
- Tester: enhet (åtgärd, schema, id, ark), `tests/e2e/offers-link.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] Shopping: åtgärden `addKeyedItems`, id av nyckel, `getKeyedItemsOnList`
- [x] Offers: `offerListItem`, kryssrutor i listan, knapp, toast
- [x] Sidan: `listing` till arket
- [x] Tester: enhet och e2e

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && AI_PROVIDER=mock pnpm build && CI=1 scripts/with-test-lock.sh pnpm test:e2e tests/e2e/offers-link.spec.ts`, when de körs, then lyckas alla.
- Given epics.md Story 9.12, when den läses mot koden, then är varje kriterium uppfyllt.

## Vid bygget

- **Notering i texten, inte i eget fält.** Egna varor har ingen fri notering (bara text, mängd, enhet), och en migration behövs inte för det här. Noteringen "(Erbjudande: 89 kr/kg)" står därför i varans text. Pontus kan ändra den som vilken egen vara som helst.
- **Knappen i arkets sidfot, inte `FixedAction`.** `FixedAction` fäster knappen vid fönstrets nederkant bakom ett modalt ark; arkets egen sidfot (`Sheet footer`) är platsen för en åtgärd i ett ark och visas först när något är kryssat.
- **"Lägg i listan" är inte "köpt":** varan är en vanlig egen vara, utan koppling till erbjudandet efter att den lagts, så att den kan ändras och tas bort som andra egna varor. "På listan" bygger på varans id; tas varan bort på listan går erbjudandet att välja igen.
- **Toastens länk** ("Inköpslista", `show`) går till `/lista`; arket har redan stängts.

- **Produktraden.** `offerDisplay` (ren visningsfunktion, ändrar inte lagrad text) tar ett inledande "ICA"/"KRAV" och inledande länder (en känd lista, "Nederländerna/Belgien", "Italien och Spanien") från namnet och visar dem smått under; en etikett som bara är märke och land lämnas som den är. Priset står i en piller av mint (inte accent: accent på mint ger bara 4,1:1, och DESIGN.md säger det). Kryssrutans namn är "Aubergine, 12 kr per st, spara 20 %". `DESIGN.md` har mönstret `offer-row`. Ingen emoji per vara: det finns ingen emojikartläggning för varor eller avdelningar att återanvända.
- **Arket stängs efter tillägg**, så att toasten och dess länk "Inköpslista" går att nå (arket är modalt och låg ovanpå toasten); öppnas arket igen visar raderna "På listan".
- **Rader hämtade före 9.11** saknar ordinarie pris (och oftast besparing) tills Pontus trycker "Hämta igen"; raden visar då bara priset.

## Spec Change Log

## Review Triage Log

Granskningen gjordes av Claude direkt (tokensnål loop, ingen migration): åtgärden återanvänder `addCustomItemIn` (matsedelslås, plankontroll, samma id ger samma rad), indata valideras med zod (högst 100 varor, text 1-200 tecken, katalog-id som uuid) och databasen nekar en annan användares katalogvara. Inget behövde rättas.
