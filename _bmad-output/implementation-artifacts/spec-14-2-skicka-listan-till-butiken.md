---
title: 'Story 14.2: Skicka listan till butiken tydligare'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/epic/14-tydligare-flode'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "Jag behöver kunna skicka inköpslistan till ica eller motsvarande affär. förstår inte hur du tänkt nu". Knappen "Skicka till ICA" kopierar bara en exporttext som ska klistras in i Pontus egen Claude in Chrome. Appen förklarar inte det, och namnet låter som att något skickas.

**Approach:** Knappen heter "Kopiera till <kedja>-varukorgen" och efter kopieringen visar ett ark de tre stegen med en länk till butikens sajt. En andra åtgärd, "Dela listan", ger en enkel text per avdelning via delningsmenyn.

## Boundaries & Constraints

**Always:** Exportformatet v1 är oförändrat (golden-testet gäller). Länken till butikens sajt kommer från en fast lista (ica.se, willys.se, coop.se, lidl.se, hemkop.se, citygross.se), öppnas i ny flik med `rel=noopener` och bara när Pontus trycker. "Visa inte igen" sparas i localStorage inom try/catch. "Dela listan" tar bara varor som inte är avbockade och inte dolda. 44 px-mål, Epic 11-utseendet.

**Never:** Ingen migration, inget nätverksanrop från Matkoll, inga ändringar i `src/features/offers/`.

</frozen-after-approval>

## Genomförande

- Knapptext: `sendButtonText` ger "Kopiera till ICA-varukorgen", eller "Kopiera till varukorgen" för Annan och utan butik. Bekräftelsetoasten finns kvar.
- `StepsSheet` ("Så funkar det" / "Så fyller du varukorgen"): tre numrerade steg, länken "Öppna ica.se" (inte för Annan) och kryssrutan "Visa inte igen". Arket öppnas efter en lyckad kopiering om Pontus inte dolt det, och alltid från länken "Så funkar det".
- `shareListText` (ren funktion i `shopping/domain/share-list.ts`, enhetstestad): avdelningar enligt listans visning, "- Gul lök 1 st", vaga varor utan mängd. `navigator.share({ text })` när det finns, annars urklipp och toasten "Listan är kopierad".
- Layout: den fasta åtgärdsraden är oförändrad (en primär, "Lägg i lagret", och den sekundära kopieringsknappen). "Dela listan" och "Så funkar det" ligger som två textknappar i en lugn rad ovanför den. Den längre knapptexten ryms inte bredvid "Lägg i lagret" på 375 px, så FixedAction staplar dem med "Lägg i lagret" överst (befintligt beteende); testerna är uppdaterade.
- `docs/varukorgsexport.md` uppdaterad.

## Verifiering

`pnpm lint`, `pnpm typecheck`, `pnpm test` (inklusive exportens golden-test) och `AI_PROVIDER=mock pnpm build` är gröna. E2E för `basket-export` (nya tester för stegen, länken och "Dela listan" med och utan `navigator.share`), `shopping`, `shopping-look` och `site-list`: 36 passerar.

## Review Triage Log

Ingen separat granskning (liten story). Ingen migration. Inga fynd att sortera.
