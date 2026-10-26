---
title: 'Story 6.4: Inventera en plats med foto'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-tom-en-plats.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** I 6.1 och 6.2 blir ett foto bara en lista med förslag att lägga till. När kylen redan har varor i lagret syns inte vad som har ändrats, och varor som är slut ligger kvar tills Pontus tar bort dem en och en. Pontus vill hålla kyl, frys och skafferi aktuella med ett nytt foto. Ett foto av en plats som redan har varor ska därför jämföras med det som finns där. Ingenting får tas bort utan ett tryck, eftersom AI:n kan missa varor som är skymda.

**Approach:** AI-anropet ändras inte (samma prompt, samma schema och samma port). Jämförelsen är ren domänlogik på servern.
- `analyzePlace` läser redan platsens rader (6.1). Den nya rena funktionen `compareWithPlace` jämför förslagen med raderna per katalogingrediens och ger svaret ett fält `inventory`:
  - **"Nytt":** förslag för en ingrediens som inte finns på platsen.
  - **"Ändrat":** förslag för en ingrediens som finns på platsen med en annan mängd eller enhet. Kortet visar "nu: 2 förp → bilden: 1 förp".
  - **"Syns inte längre":** ingredienser på platsen som inget förslag matchar, också obegränsade ("Finns hemma").
  - **Oförändrat:** förslag som redan stämmer. De visas inte som kort, bara som en rad med antalet.
- Sektionen "Lagerförslag" visar de tre grupperna. "Nytt" och "Ändrat" har Bekräfta, Rätta och Avvisa som i 6.2, och "Syns inte längre" har "Ta bort" och "Behåll".
- Varje tryck sparar via den nya Server Actionen `confirmPantryInventory`. Den anropar Postgres-funktionen `apply_pantry_inventory`, som under `pantry_lock()` gör tillägg, ändringar och borttagningar i en transaktion och returnerar de borttagna raderna.
- "Bekräfta alla" sparar allt som är kvar i ett anrop. Borttagningarna kan ångras i 5 s med `restorePantryItems` från 6.3, som sätter tillbaka raderna med samma id.
- En plats utan varor fungerar exakt som i 6.1 och 6.2.

## Boundaries & Constraints

**Always:**
- Ingenting tas bort från lagret utan ett tryck på "Ta bort", "Bekräfta alla", eller Bekräfta på ett kort i "Ändrat" vars text visar vad som ersätts (FR-25, beslutsloggen 2026-10-26). Analysen skriver aldrig (AD-2).
- AI-porten är oförändrad: `prompts/analyze-image.md`, `analyzeImageAnswer`, `inputLimits.analyze` och mocken ändras inte (AD-9). Jämförelsen görs efter `toPantrySuggestions` och är en ren funktion utan databas och modell.
- AC: en obegränsad vara på platsen som inget förslag matchar hamnar i "Syns inte längre".
- `confirmPantryInventory` (AD-2):
  - är en Server Action (`"use server"`) som börjar med `requireUser()`;
  - validerar hela indata med Zod och litar inte på något från klienten;
  - skapar nya katalogingredienser med `commitIngredients` som i 6.2 (befintliga id som `match`/`exact`, inga synonymer, AD-6);
  - anropar `apply_pantry_inventory` och sedan `revalidateFor("pantry_item")`.
- `apply_pantry_inventory` (AD-19):
  - är `security invoker`, har `set search_path = ''`, tar `pantry_lock()` och körs bara av `authenticated`;
  - tar bara bort användarens egna rader på den fotograferade platsen;
  - sätter mängderna med samma regler som `set_pantry_items`, med regeln att en ingrediens på en plats antingen är obegränsad eller har mängder;
  - är allt eller inget.
- "Ångra" efter en borttagning sätter tillbaka raderna med samma id, mängd, enhet och plats via `restorePantryItems` (6.3). En rad som krockar hoppas över (AD-20).
- Fel (AD-13) visas i en blå `Notice` överst i sektionen "Lagerförslag". Förslagen står kvar efter ett fel.
- Alla tester och CI använder `AI_PROVIDER=mock`. E2E-specen har den egna e2e-användaren `e2e-inventering@matkoll.test`.
- Migrationen skapas med `supabase migration new`, och typerna genereras om med `pnpm db:types`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen borttagning görs automatiskt, inte heller när AI:n är säker eller när "Syns inte längre" bara har en vara.
- Inga nya AI-anrop, ingen ny prompt och inget nytt fält i AI-schemat.
- Inga förslag eller jämförelser sparas på servern, i `localStorage`, `sessionStorage` eller i adressen.
- Ingen synonym sparas. `addToPantry` används inte.
- Ingen fråga i förväg vid "Ta bort", "Behåll" eller Avvisa, eftersom de går att ångra.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tom plats | Frys har inga varor, och Pontus fotograferar frysen | Samma lista som i 6.1 och 6.2, utan grupper | N/A |
| Grupper | Kyl har mjölk 2 förp, smör (obegränsad), ägg 6 st, yoghurt 2 förp och senap (obegränsad). `kyl.png` ger mjölk 1 förp, grädde 1 förp, smör, ägg 6 st, gurka 2 st och ketchup | "Lagerförslag från kylen" och "2 varor stämmer med lagret.". Under "Nytt" finns grädde, gurka och ketchup. Under "Ändrat" finns mjölk med "nu: 2 förp → bilden: 1 förp". Under "Syns inte längre" finns senap ("I kylen nu: finns hemma") och yoghurt ("I kylen nu: 2 förp"). Inget är ändrat i lagret | N/A |
| Allt stämmer | Alla förslag stämmer med platsen, och inget saknas | Inga kort. "Allt i kylen stämmer med bilden." i kameraytan (`role="status"`) | N/A |
| Ta bort | "Ta bort yoghurt" | Kortet försvinner, raden tas bort, och "yoghurt är borttagen." visas med "Ångra" i 5 s. Kortet Kyl räknar en vara mindre | N/A |
| Ångra borttagning | "Ångra" inom 5 s | Raden kommer tillbaka med samma id, mängd och enhet. Kortet kommer inte tillbaka | Krock: "1 vara gick inte att ångra." |
| Behåll | "Behåll senap" | Kortet försvinner, inget skrivs, och "senap står kvar i kylen." visas med "Ångra", som sätter tillbaka kortet | N/A |
| Bekräfta ändrat | "Bekräfta mjölk" | Raden blir "mjölk 1 förp". "mjölk är sparad i kylen." visas | N/A |
| Ändrat i annan enhet | Platsen har "mjölk 2 förp", och bilden visar "mjölk 1 l" | Kortet visar "nu: 2 förp → bilden: 1 l". Bekräfta ger bara "mjölk 1 l" på platsen, och raden i förp ersätts | N/A |
| Två enheter på bilden | Bilden ger mjölk 1 förp och mjölk 1 l, och platsen har mjölk 2 förp | Två kort under "Ändrat". När båda är bekräftade, ett i taget, har platsen "1 förp" och "1 l" | N/A |
| Bekräfta alla | Förslag i alla tre grupperna | Ett anrop och en transaktion. "Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna." visas med "Ångra" i 5 s. Sektionen försvinner, och fokus går till kameraknappen | N/A |
| Ångra efter Bekräfta alla | "Ångra" inom 5 s | De borttagna raderna kommer tillbaka med samma id. Tillägg och ändringar står kvar | Krock: "1 vara gick inte att ångra." |
| Allt eller inget | `apply_pantry_inventory` nekar, till exempel för ett okänt id | Inget läggs till, ändras eller tas bort. "Det gick inte att uppdatera lagret. Försök igen." Förslagen står kvar | `pantry_inventory_failed` (loggas med orsak) |
| Rätta | "Rätta mjölk" under "Ändrat" | Arket Lagervara förifyllt som i 6.2. Arkets "Bekräfta" sparar via `confirmPantryInventory` | Som i 6.2 |
| Avvisa | "Avvisa mjölk" under "Ändrat" | Kortet försvinner med "Ångra", och "mjölk 2 förp" står kvar | N/A |
| Varor som inte gick att tolka | `dropped > 0`, eller AI:n gav 25 varor eller fler | Under "Syns inte längre" står "Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort." | N/A |
| Matchad men namnlös vara | En AI-vara matchade en ingrediens på platsen, men förslaget togs bort (`unnamed`) | Ingrediensen hamnar inte i "Syns inte längre" | N/A |
| Platsen går inte att läsa | `listPantry` kastar, eller tiden är nära deadline | Listan som i 6.1 och 6.2 utan grupper, med raden "Det gick inte att jämföra med lagret i kylen." | `pantry_unavailable` loggas, svaret är `ok` |
| Raden är redan borta | En annan flik har tagit bort yoghurt | "Ta bort yoghurt" ger "yoghurt är redan borttagen." utan "Ångra" | N/A |
| Sparar | Medan ett anrop pågår | Alla knappar i sektionen är inaktiva, och de berörda korten visar "Sparar …" | N/A |
| Förfalskad indata | Fler än 40 poster, fler än 1 000 rader att ta bort, en tom begäran eller id som inte är uuid | Inget skrivs | `validation` |
| Förfalskad borttagning | Ett rad-id från en annan plats eller användare | Raden tas inte bort, och resten sparas | N/A (filtreras i SQL) |
| Utloggad | Sessionen har gått ut | Sidan laddas om och skickar till inloggning | `unauthorized` |
| Byt kort under analys | Pontus väljer Frys medan kylen analyseras | Grupperna gäller kylen, och rubriken säger "Lagerförslag från kylen" | N/A |
| Kylen töms (6.3) med förslag kvar | "Töm kylen" medan grupperna visas | Förslagen blir en vanlig lista som för en tom plats, och "Syns inte längre" försvinner | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-6-context.md` -- moduler, port, regler och UX (skriven före 6.3 och 6.4, men reglerna gäller)
- `spec-6-1-…md`, `spec-6-2-…md` (inklusive Spec Change Log och Review Triage Log) -- `dropped`, högst 25 varor, `ai_superseded`, generationsbundna ark, validering per index, ny sammanslagning på de faktiska id:na och fokus i providern
- `spec-6-3-tom-en-plats.md` -- `restorePantryItems`, `restore_pantry_items`, `notRestoredText` och förslagens `current` efter "Töm"
- `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `toPantrySuggestions`, `stockByIngredient`, `PlaceStock`, `pantrySuggestionSchema`, `analyzeResultSchema`, `mergeConfirmations`, `mergePantrySets`, `withConfirmedStock`, `currentAmountText` och `isConfirmable`
- `src/features/pantry/actions/analyze-place.ts` (+ test) -- `readPlace`, matchningarna, `dropped`, deadline och var `compareWithPlace` anropas
- `src/features/pantry/actions/confirm-pantry-suggestions.ts` (+ test) -- katalogsteget som bryts ut och delas
- `src/features/pantry/data/set.ts`, `remove.ts`, `supabase/migrations/20261026010657_pantry_lock.sql` -- `set_pantry_items`, `pantry_lock()`, `toPantryRow` och regeln om antingen obegränsad eller mängd
- `src/features/pantry/ui/pantry-suggestions.tsx` (+ test), `use-pantry-analysis.ts` -- `usePantryReview`, `latestSuggestions`, `editSuggestions`, `takeOut`, `reject`, `putBack`, `focusAfter`, `confirmWithin` och `EmptyAnswer`
- `src/features/pantry/ui/pantry-suggestion-list.tsx` (+ test), `pantry-camera.tsx` (+ test), `pantry-item-sheet.tsx` (`confirmCorrected`, `openSuggestion`)
- `src/features/pantry/domain/places.ts` -- `definite`, `savedItemText`, `rejectedItemText` och `removedItemsText`
- `src/components/toast.tsx`, `button.tsx`, `notice.tsx`, `badges.tsx`
- `src/lib/errors.ts`, `src/lib/revalidate.ts` (`pantry_item`)
- `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts` -- seedar redan varor i Kyl och påverkas därför. `support.ts`, `global-setup.ts` -- e2e-användare. `tests/fixtures/ai/kyl.analyze.json` -- mockens sex varor
- `tests/integration/pantry.test.ts` -- databastester

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/place-inventory.ts` (+ test), `index.ts` -- ren domän för jämförelsen:
  - `placeInventorySchema` är `{ kind: "empty" } | { kind: "unread" } | { kind: "compared"; missing: MissingItem[]; incomplete: boolean }`.
  - `MissingItem` är `{ id: "m1" …, ingredientId, name, location, rows: { id: uuid; amount; unit }[] (minst 1), stock: PlaceStock }`, en post per ingrediens. Listan har högst 1 000 poster.
  - `pantrySuggestionSchema` får `change: "new" | "changed" | "unchanged" | null` (`null` utanför jämförelsen) och `replaces: uuid[]` (högst 50, tom utanför jämförelsen).
  - `compareWithPlace(suggestions, placeItems, { seenIngredientIds, incomplete })` gör följande:
    - `placeItems` som är `null` ger `unread`, och en tom lista ger `empty`. Förslagen får då `change: null`.
    - Förslagen grupperas per ingrediens (id, eller "new"). En ny katalogingrediens eller en ingrediens som platsen saknar blir `new`.
    - Annars jämförs bildens mängder för ingrediensen (alla dess förslag: obegränsad, eller mängd per enhet) med platsens `PlaceStock`. Lika ger `unchanged`, och olika ger `changed`. Mängderna jämförs efter `roundSum`.
    - `replaces` är id:na för platsens rader av samma ingrediens vars enhet inte finns bland bildens enheter för den ingrediensen. Där ingår också en obegränsad rad när bilden har mängder, och tvärtom.
    - `missing` är platsens ingredienser som inget förslag har och som inte finns i `seenIngredientIds`. Raderna samlas per ingrediens, obegränsade ingår, och listan sorteras på namn med `localeCompare("sv")`.
  - `groupSuggestions(result)` ger `{ added, changed, unchanged: number, missing, compared: boolean }` för klienten.
  - `inventoryRequest({ location, suggestions, missing })` bygger indata till `confirmPantryInventory`: posterna, `replaceRowIds` (förslagens `replaces`) och `removeRowIds` (radernas id i `missing`).

  Testerna täcker:
  - de tre grupperna och oförändrat;
  - obegränsad mot mängd i båda riktningarna;
  - flera enheter på bilden och på platsen, samt `replaces`;
  - att en obegränsad rad hamnar i `missing` (AC);
  - att flera rader av en ingrediens blir en post;
  - `seenIngredientIds`, `empty` och `unread`;
  - att 6.1:s regler (obegränsad förblir obegränsad, och en mängd tas från platsen) ger `unchanged` i stället för falska ändringar.

  -- AD-6, AD-12, AD-19
- [x] `src/features/pantry/domain/pantry-suggestion.ts` (+ test), `places.ts` (+ test) -- `analyzeResultSchema` får `inventory: placeInventorySchema`. Nya texter:
  - `changeText(current, suggestion)` ger "nu: 2 förp → bilden: 1 förp" eller "nu: finns hemma → bilden: 1 förp". Pilen är `aria-hidden`, och skärmläsaren får "I kylen nu: 2 förp. På bilden: 1 förp.";
  - `unchangedCountText(n)` ger "1 vara stämmer med lagret." eller "2 varor stämmer med lagret.";
  - `allUnchangedText(location)` ger "Allt i kylen stämmer med bilden.";
  - `keptItemText(name, location)` ger "senap står kvar i kylen.";
  - `inventoryAppliedText(location, { added, changed, removed })` ger "Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.", där delar som är 0 utelämnas;
  - `incompleteComparisonText` är "Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.";
  - `unreadPlaceText(location)` ger "Det gick inte att jämföra med lagret i kylen.";
  - `alreadyRemovedText(name)` ger "yoghurt är redan borttagen.".

  -- EXPERIENCE.md, Voice and Tone
- [x] `src/features/pantry/actions/analyze-place.ts` (+ test) -- efter `toPantrySuggestions` anropas `compareWithPlace` med:
  - `placeItems`: raderna från `readPlace`, eller `null` när läsningen misslyckades eller hoppades över nära deadline;
  - `seenIngredientIds`: alla matchade id, också de vars förslag föll bort;
  - `incomplete`: `true` när något föll bort, när listan kapades eller när AI:n gav `maxPantrySuggestions` varor eller fler.

  Förslag som inte passerar schemat filtreras som i dag, före jämförelsen. AI-anropet och dess indata är oförändrade, och ett test låser det. Testerna täcker `empty`, `unread`, `compared`, `seenIngredientIds` och att inget skrivs
  -- AD-2, AD-9
- [x] `supabase/migrations/<ts>_pantry_apply_inventory.sql` (`supabase migration new pantry_apply_inventory`), `database.types.ts` (`pnpm db:types`) -- `apply_pantry_inventory(place text, items jsonb, replace_ids uuid[], remove_ids uuid[]) returns jsonb`. Den är `security invoker`, har `set search_path = ''`, `revoke`/`grant` som `set_pantry_items` och gör i tur och ordning:
  1. nekar `null`-anropare (`42501`), en okänd plats, `items` som inte är en array och en begäran utan både poster och borttagningar (`22023`);
  2. tar `pantry_lock()`;
  3. tar bort rader i `replace_ids` som är användarens, ligger på `place`, har en ingrediens som en post på `place` har och inte har samma nyckel som någon post, så att en rad som posten ändå sätter behåller sitt id;
  4. tar bort rader i `remove_ids` som är användarens, ligger på `place` och har en ingrediens som ingen post på `place` har, med `returning`;
  5. anropar `public.set_pantry_items(items)` när `items` inte är tom;
  6. returnerar `{ "set": [...], "removed": [...] }` med radernas id, ingrediens, plats, mängd och enhet.

  Ett id som inte uppfyller villkoren hoppas över tyst. Ett fel någonstans rullar tillbaka allt
  -- AD-19, AD-20
- [x] `src/features/pantry/data/inventory.ts` (+ test) -- `applyPantryInventoryIn(db, { place, items, replaceRowIds, removeRowIds })` validerar (`invalid_items`), anropar funktionen och tolkar svaret med `pantryItemSetSchema` och `pantryRowSchema`. En borttagen rad som inte går att tolka räknas men kan inte ångras. Fel blir `apply_failed <code>` -- AD-19
- [x] `src/features/pantry/actions/commit-confirmations.ts`, `confirm-pantry-suggestions.ts` (+ test) -- bryt ut steg 3–4 i `confirmPantrySuggestions` (`mergeConfirmations` och `commitIngredients`, med kontrollen av `missing_id`) och sammanslagningen efter katalogen (`mergePantrySets`) till en server-only-hjälpare. `confirmPantrySuggestions` använder den, och dess tester går igenom oförändrade -- AD-1, AD-6
- [x] `src/features/pantry/actions/confirm-pantry-inventory.ts` (+ test) -- `confirmPantryInventory({ location, items, replaceRowIds, removeRowIds })` är en Server Action. Den gör i tur och ordning:
  1. `requireUser`;
  2. validerar med `inventoryConfirmSchema`: 0–40 poster, högst 50 och 1 000 id och minst något att göra. Felet `validation` har index per post som i 6.2;
  3. anropar hjälparen från föregående task;
  4. anropar `applyPantryInventoryIn`;
  5. anropar `revalidateFor("pantry_item")`.

  Den returnerar `Result<{ set: number; removed: PantryRow[]; removedCount: number }>`. `CatalogDataError` och `PantryDataError` loggas med orsak och ger `pantry_inventory_failed`. Testerna täcker:
  - utloggad och ogiltig indata;
  - en begäran med bara borttagningar, utan anrop till katalogen;
  - att lagret inte skrivs när katalogen fallerar;
  - att inga synonymer skapas;
  - att revalidering bara sker efter lyckad sparning;
  - loggar utan namn.

  -- FR-25, AD-2, AD-6, AD-19
- [x] `src/lib/errors.ts` -- ny kod `pantry_inventory_failed` med texten "Det gick inte att uppdatera lagret. Försök igen." -- AD-13
- [x] `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-suggestions.tsx` (+ test) -- tillståndet och granskningen:
  - Analysen håller `inventory` bredvid förslagen och får `editMissing(generation, edit)` på samma sätt som `editSuggestions`. `EmptyAnswer` får `"unchanged"` för ett svar där allt stämmer.
  - Granskningen väljer väg efter `inventory.kind`. Vid `compared` sparar Bekräfta, arkets "Bekräfta" och "Bekräfta alla" med `confirmPantryInventory` (via `inventoryRequest`), och annars med `confirmPantrySuggestions` som i 6.2.
  - `replaces` följer bara med när arkets ingrediens och plats är förslagets egna.
  - Nya `removeMissing(id)` och `keepMissing(id)`.
  - Efter en sparning med borttagna rader visas bekräftelsen med "Ångra", som anropar `restorePantryItems` en gång med raderna. Fler "Ta bort" medan bekräftelsen visas slås ihop, som i 2.3. Rader som hoppas över ger `notRestoredText`.
  - "Behåll" fungerar som Avvisa, med `putBack` för kortet.
  - Ett anrop i taget och `confirmTimeoutMs`. Svarar servern med färre borttagna rader än begärt ges `alreadyRemovedText` för ett kort. Fokus följer de synliga korten i ordningen Nytt, Ändrat och Syns inte längre.
  - Efter "Töm" (6.3) på den fotograferade platsen blir `inventory` `{ kind: "empty" }` och förslagens `change` och `replaces` nollställs.

  -- FR-25, AD-20
- [x] `src/features/pantry/ui/pantry-suggestion-list.tsx` (+ test), `pantry-camera.tsx` (+ test) -- vid `compared` visar sektionen, under rubriken och "Bekräfta alla":
  - `unchangedCountText` när något är oförändrat;
  - tre undergrupper med h3 "Nytt", "Ändrat" och "Syns inte längre", där en tom grupp inte visas.

  Korten:
  - "Nytt"-korten är som i 6.2.
  - "Ändrat"-korten visar `changeText` i stället för "I kylen nu".
  - "Syns inte längre"-korten visar namnet och `currentAmountText`, och knapparna "Ta bort" (`Button` primary, `aria-label` "Ta bort yoghurt") och "Behåll" (text, "Behåll yoghurt"). `incompleteComparisonText` står under gruppens rubrik när `incomplete` gäller.

  Vid `unread` visas `unreadPlaceText` under rubriken. Kameraytan visar `allUnchangedText` med `role="status"` för `"unchanged"`. Vid `empty` och `unread` ser listan ut som i 6.2
  -- UX-DR11, EXPERIENCE.md, Lagerförslag
- [x] `tests/integration/pantry.test.ts` (utökad) -- `apply_pantry_inventory` med två användare:
  - tillägg, ändringar och borttagningar i ett anrop;
  - allt eller inget när en post nekas (`23503`);
  - att `remove_ids` och `replace_ids` för en annan plats eller användare hoppas över;
  - att en borttagning för en ingrediens som också sätts i samma anrop hoppas över;
  - att `replace_ids` med samma nyckel som en post behåller raden och dess id;
  - att regeln om antingen obegränsad eller mängd gäller;
  - att `restore_pantry_items` (6.3) sätter tillbaka de borttagna med samma id;
  - att `anon` nekas.

  -- AD-19, AD-20
- [x] `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts` (och deras komponenttester) -- de seedar varor i Kyl och hamnar därför i jämförelsen. Förväntningarna uppdateras så att specarnas syfte behålls:
  - smör visas inte som kort, utan räknas i "stämmer med lagret";
  - mjölk visar `changeText` i stället för "I kylen nu";
  - de fall som prövar 6.2:s vanliga lista fotograferar en tom plats eller seedar en annan plats.

  -- 6.1, 6.2
- [x] `tests/e2e/pantry-inventory.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-inventering@matkoll.test` (`inventoryEmail`, med storage state), med `AI_PROVIDER=mock` och `kyl.png`. Före varje test seedar service role katalogingredienserna "mjölk", "smör", "ägg" (st), "yoghurt" och "senap" och i Kyl lagervarorna "mjölk 2 förp", "smör" (obegränsad), "ägg 6 st", "yoghurt 2 förp" och "senap" (obegränsad). Frys är tom. Testerna kontrollerar:
  - grupperna och texterna i matrisen, och att lagret är oförändrat efter analysen (service role);
  - "Behåll senap", sedan "Ångra", så att kortet är tillbaka;
  - "Bekräfta alla", som ger "Kylen är uppdaterad: 3 nya, 1 ändrad och 2 borttagna.", att sektionen försvinner, "6 varor" i kortet Kyl, "mjölk 1 förp" och att yoghurt och senap saknas;
  - "Ångra", som ger yoghurt och senap tillbaka med samma id som före (service role) och "8 varor", medan mjölk står kvar som 1 förp;
  - i ett eget test: "Ta bort yoghurt" och sedan "Ångra", så att raden har samma id;
  - att `kyl.png` för den tomma frysen ger listan från 6.2 utan grupper.

  -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): en plats utan varor fungerar som i 6.1 och 6.2.** Det finns inget att jämföra med, så alla förslag skulle hamna i "Nytt". Grupperna visas inte, och 6.2:s väg (`confirmPantrySuggestions`) används oförändrad.
- **Beslut (förslag): jämförelsen sker per katalogingrediens, inte per enhet.** "Ändrat" betyder att bildens mängder för ingrediensen skiljer sig från platsens. Bekräfta gör att platsen får bildens mängder för ingrediensen, och rader i andra enheter ersätts (`replaces`). Ett foto räknas alltså som en inventering av alla enheter, vilket löser det som 6.2 lämnade till senare ("Defer" i 6.2:s Review Triage Log). Det tar bort rader, men bara efter ett tryck på ett kort som visar "nu: 2 förp → bilden: 1 l", och enheter räknas aldrig om (AD-7). Ersatta rader följer inte med i "Ångra", på samma sätt som en bekräftelse i 6.2 inte går att ångra. Alternativ: jämförelse per enhet, där "mjölk 1 l" skulle bli "Nytt" och "mjölk 2 förp" "Syns inte längre" för samma kartong.
- **Beslut (förslag): `replaces` beräknas på servern mot hela bildens enheter för ingrediensen,** inte per anrop. Då ger två kort för samma ingrediens (förp och l), som bekräftas ett i taget, samma resultat som "Bekräfta alla". SQL kontrollerar att varje rad hör till en ingrediens som sätts på platsen, så en förfalskad lista kan inte ta bort något annat utan "Ångra".
- **Beslut (förslag): oförändrade förslag visas inte som kort,** bara som "2 varor stämmer med lagret.". Att bekräfta dem ändrar inget, och fler kort gör granskningen långsammare (SM-C2). 6.1:s regler, att en obegränsad vara förblir obegränsad och att en vara utan mängd får platsens mängd, gör att osäkra AI-mängder blir "oförändrat" i stället för falska ändringar (Flöde 3: smör står kvar som "Finns hemma"). Om allt stämmer visas "Allt i kylen stämmer med bilden." i kameraytan.
- **Beslut (förslag): "Syns inte längre" kan avvisas en och en med "Behåll",** som Avvisa i 6.2: kortet försvinner, inget skrivs, och "Ångra" sätter tillbaka kortet. Knappen för att bekräfta heter "Ta bort" och inte "Bekräfta", så att verbet säger vad som händer. Det finns ingen Rätta på dessa kort. Pontus kan trycka "Behåll" och ändra varan i listan.
- **Beslut (förslag): ett "Syns inte längre"-kort gäller en ingrediens** och tar bort alla dess rader på platsen ("I kylen nu: 2 förp, 1 l").
- **Beslut (förslag): varor som AI:n nämnde men som föll bort ger aldrig ett förslag om borttagning när ingrediensen är känd.** Det gäller till exempel `unnamed` och förslag som inte passerade schemat. Matchningen ger då ingrediensens id, och det läggs i `seenIngredientIds`. Varor utan koppling (`unmatched`, `unusable`, ogiltiga eller kapade) går inte att knyta till en rad. Därför sätts `incomplete`, och gruppen visar "Några varor på bilden gick inte att tolka. Kontrollera innan du tar bort.". "Bekräfta alla" tar ändå med borttagningarna, eftersom de syns och går att ångra. Alternativ: att "Bekräfta alla" hoppar över borttagningarna när `incomplete` gäller.
- **Risk: varor som AI:n inte ser.** En skymd vara, en vara bakom en dörr eller en vara i en ogenomskinlig låda hamnar i "Syns inte längre". Det är just därför inget tas bort utan ett tryck, och "Behåll" och "Ångra" finns.
- **Risk: taket på 25 varor.** Prompten och porten är oförändrade (högst 25 varor från AI:n). En plats med fler olika varor får därför falska förslag i "Syns inte längre". `incomplete` sätts när AI:n gav 25 varor, och texten varnar. Om det blir ett problem i praktiken läggs frågan i `docs/oppna-fragor.md` (högre tak, flera foton per plats eller jämförelse per hylla). Storyn ändrar inte prompten.
- **Risk: matchning mot en annan katalogingrediens.** Om "Arla mellanmjölk" matchar "mjölk" och platsen har "mellanmjölk" blir det ett par med "Nytt" och "Syns inte längre". Pontus avvisar och behåller. Synonymer sparas inte från foton (6.2), så paret kan komma igen.
- **Beslut (förslag): "Bekräfta alla" sparar allt i ett anrop och en transaktion** (`apply_pantry_inventory`). Den skickar alla kort i "Nytt" och "Ändrat" som går att bekräfta och alla kort i "Syns inte längre" som är kvar. En borttagning för en ingrediens som också sätts i samma anrop hoppas över i SQL, så att en motsägelsefull begäran aldrig tar bort det som just har lagts till.
- **Beslut (förslag): "Ångra" efter "Bekräfta alla" sätter bara tillbaka borttagningarna** (AC), inte tillägg och ändringar. Bekräftelsen räknar upp allt ("3 nya, 1 ändrad och 2 borttagna"), så det kan läsas som att allt ångras. Om Pontus tycker att det är otydligt ändras texten till "Kylen är uppdaterad. 2 varor är borttagna.". Korten för de borttagna varorna kommer inte tillbaka efter "Ångra", eftersom raderna syns i listan igen.
- **Beslut (förslag): en ny Server Action och en ny Postgres-funktion,** i stället för att utöka `confirmPantrySuggestions`. 6.2:s väg och tester lämnas orörda för en tom plats. Katalogsteget delas via en hjälpare. `set_pantry_items` anropas inifrån `apply_pantry_inventory`, så att reglerna för att sätta mängder bara finns på ett ställe. Advisory-låset kan tas flera gånger i samma transaktion.
- **Beslut (förslag): ny felkod `pantry_inventory_failed`** med texten "Det gick inte att uppdatera lagret. Försök igen.". `pantry_confirm_failed` talar om att lägga förslag i lagret, vilket inte passar en borttagning.
- **Beslut (förslag): rader som redan är borta hoppas över** i stället för att neka hela anropet. En annan flik kan ha tagit bort varan. Det verkliga antalet syns i bekräftelsen.
- **Beslut (förslag): märket "Ny" på ett kort** (ny katalogingrediens, 6.1) behålls också under rubriken "Nytt". Det betyder något annat (att en ingrediens skapas i katalogen), och skärmläsaren läser det som en del av kortet. Om Pontus tycker att det är förvirrande ändras märket till "Ny i katalogen".
- **AD-19 utökas:** `pantry` får skrivoperationen `confirmPantryInventory`, som sätter, ersätter och tar bort i en transaktion. Det skrivs in i `docs/beslutslogg.md` när storyn är byggd.
- Loggning sker bara med felkod, orsak och antal, aldrig med varunamn, mängder eller AI-svar.
- Storyn bygger på 6.3 (`restorePantryItems`) och byggs efter den, på grenen `epic/7-varukorg` i PR #45 (beslutsloggen 2026-10-26).

## Spec Change Log

- Två rader i den frysta matrisen ändras efter granskningen. Pontus har delegerat sådana beslut.
  - **Ångra borttagning:** kortet kommer tillbaka efter Ångra, medan matrisen sa att det inte gör det. Annars går det inte att välja Behåll i samma granskning.
  - **Bekräfta alla:** borttagningarna tas bara med när jämförelsen är fullständig. En ny katalogingrediens på bilden gör jämförelsen ofullständig, och då måste Pontus trycka "Ta bort" på varje vara. Det skyddar mot att AI:n tömmer lagret på något den bara kallat vid ett annat namn.

- Ångra använder operationsposten från 6.3. Här är `restore_pantry_removal(operation_id)` istället för `restorePantryItems`.
  - `apply_pantry_inventory` sparar de borttagna raderna i `pantry_removal` i samma transaktion och returnerar `undoable`.
  - Flera "Ta bort" i rad delar samma operations-id.
  - Rader som ersätts när Pontus bekräftar "Ändrat" sparas inte för Ångra, eftersom ändringar står kvar enligt matrisen.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- "Syns inte längre" och tomma foton:
  - Korten "Syns inte längre" ligger kvar när alla andra kort är hanterade.
  - Ett tomt foto av en plats med varor ger förslag i "Syns inte längre".
- Jämförelsen:
  - Bara förslag för den fotograferade platsen jämförs.
  - Jämförelsen räknas som ofullständig när varor föll bort eller kortades av, eller när en ny ingrediens föreslås. Då tar "Bekräfta alla" inte med borttagningarna.
  - "Allt stämmer" visas bara när jämförelsen är fullständig.
  - En bekräftad ingrediens lämnar "Syns inte längre".
  - Okänd mängd ersätter aldrig uppmätta rader.
- Skrivningen:
  - En rättad enhet skickar alla rader av ingrediensen.
  - Gränsen för `replaceRowIds` gäller sammanlagt för alla förslag.
  - Fel efter commit ger ok med en varning.
  - Hoppade ersättningar loggas.
- Ångra:
  - Ångra väntar medan en sparning pågår.
  - En batch återanvänds bara för samma plats och bara medan dess toast lever.
  - `spareOperation` rättas.
  - Toasten räknar bara det aktuella anropets borttagningar, och ångra-knappen heter "Ångra borttagning".
  - Kort som ångras kommer tillbaka.
  - "Töm" följt av Ångra markerar jämförelsen som oläst.
- `pantry_removal`: `created_at` uppdateras och ägandet kontrolleras.
- Id:n får prefix.
- Nya tester:
  - "Bekräfta alla" slås ihop med en borttagning
  - förfalskade ersättnings-id:n

**Reject:**
- att andra toasts ersätter ångra-toasten, som i 2.3, 6.2 och 6.3
- att "finns hemma" aldrig blir Ändrat, vilket är ett beslut

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera en kyl som redan finns i lagret. Grupperna ska vara rimliga, skymda varor ska hamna i "Syns inte längre" utan att tas bort, och "Bekräfta alla" följt av "Ångra" ska ge tillbaka borttagningarna. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- `AI_PROVIDER=lmstudio pnpm eval:ai` med egna foton av en plats där lagret är känt: hur många falska "Syns inte längre" ger en vanlig kyl? Resultatet noteras i `docs/oppna-fragor.md` om det är fler än ett par.
- VoiceOver: grupprubrikerna går att navigera till, "nu: 2 förp → bilden: 1 förp" läses som "I kylen nu: 2 förp. På bilden: 1 förp.", och "Ta bort yoghurt" och "Behåll yoghurt" går att nå.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: grupperna, korten och knapparna radbryts utan vågrät scroll, och tryckytorna är minst 44 × 44 px.
