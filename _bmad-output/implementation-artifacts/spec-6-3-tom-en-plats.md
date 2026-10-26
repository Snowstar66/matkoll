---
title: 'Story 6.3: Töm en plats'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ibland stämmer lagret för en plats så dåligt att det är enklare att börja om, till exempel efter en storstädning av kylen eller när frysen har tinats av. I dag måste Pontus ta bort varorna en och en med svep eller i arket Lagervara. Hen vill kunna tömma kylen, frysen eller skafferiet med ett tryck och sedan fylla platsen på nytt med ett foto (6.1, 6.2).

**Approach:** Under listan på Hemma finns textknappen "Töm kylen" (eller "Töm frysen", "Töm skafferiet") när platsen har varor.
- Knappen öppnar ett ark med kontrollfrågan "Ta bort alla 14 varor i kylen?".
- Arkets "Töm kylen" anropar Server Actionen `emptyPantryPlace(location)`. Den anropar Postgres-funktionen `empty_pantry_place`, som under `pantry_lock()` tar bort alla användarens rader på platsen i en transaktion och returnerar dem.
- Den korta bekräftelsen "Tog bort 14 varor ur kylen." har "Ångra" i 5 s. "Ångra" anropar `restorePantryItems(rows)`, som sätter tillbaka alla rader med samma id, mängd, enhet och plats i en transaktion (`restore_pantry_items`), med samma konfliktregler som `restore_pantry_item` (AD-19, AD-20).
- En tom plats har ingen töm-knapp.

## Boundaries & Constraints

**Always:**
- Ingenting tas bort förrän Pontus har bekräftat i arket. Arkets fokus börjar på "Avbryt" (`initialFocus="close"`), som när en matsedel tas bort.
- Tömningen sker i en transaktion (`empty_pantry_place`):
  - Funktionen är `security invoker`, har `set search_path = ''` och nekar en anropare utan `auth.uid()` (`42501`).
  - Den tar `pantry_lock()`, så att den aldrig blandas med `set_pantry_items`, `restore_pantry_item` eller `add_to_pantry` för samma användare.
  - Den tar bara bort användarens egna rader på den angivna platsen, och returnerar dem som de var.
  - Bara `authenticated` får köra den.
- "Ångra" sätter tillbaka raderna med samma id (AD-20), i en transaktion (`restore_pantry_items`) under `pantry_lock()`:
  - En rad hoppas över om id:t redan finns, eller om platsen nu har en rad med samma nyckel eller av den andra sorten (obegränsad eller med mängd). Det är samma villkor som i `restore_pantry_item` (Story 2.3).
  - De andra raderna sätts tillbaka.
- Server Actions (AD-2):
  - `emptyPantryPlace` och `restorePantryItems` är Server Actions (`"use server"`) som börjar med `requireUser()`.
  - De validerar indata med Zod och litar inte på något från klienten.
  - De anropar `revalidateFor("pantry_item")` efter en lyckad skrivning (AD-18), så att platskorten, lagningsstatus, matsedeln och inköpslistan räknas om.
- Bara `pantry` skriver `pantry_item` (AD-1). Katalogingredienser tas aldrig bort (AD-20).
- Fel (AD-13) visas i en blå `Notice` i arket. Fel vid "Ångra" visas i en toast med `role="alert"`, som i 2.3.
- Alla tester och CI använder `AI_PROVIDER=mock`. E2E-specen har den egna e2e-användaren `e2e-tom-plats@matkoll.test`.
- Migrationen skapas med `supabase migration new`, och typerna genereras om med `pnpm db:types`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen töm-knapp för en tom plats, och ingen töm-knapp i felvägen när lagret inte går att läsa.
- Ingen mjuk radering och ingen papperskorg. Raderingen är hård, och "Ångra" är vägen tillbaka (AD-20).
- Ingen tömning av flera platser på en gång, och ingen "Töm allt".
- Ingen AI anropas.
- `removePantryItem` anropas inte en gång per rad. Tömningen är ett anrop och en transaktion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Knappen | Kyl har 14 varor | Under listan finns textknappen "Töm kylen". För Frys "Töm frysen" och för Skafferi "Töm skafferiet" | N/A |
| Tom plats | Inga varor på platsen | Ingen töm-knapp. "Inget i kylen än." och "Lägg till vara" som i dag | N/A |
| Kontrollfrågan | "Töm kylen" | Arket "Töm kylen" med "Ta bort alla 14 varor i kylen?" och "Du kan ångra direkt efteråt.". Foten har "Töm kylen" (primär), och huvudet har "Avbryt" med fokus | N/A |
| En vara | Kyl har 1 vara | "Ta bort 1 vara i kylen?" | N/A |
| Avbryt | "Avbryt", Esc, svep nedåt eller tryck utanför | Arket stängs, inget tas bort, och fokus går tillbaka till "Töm kylen" | N/A |
| Bekräfta | Arkets "Töm kylen" | Knappen visar "Tar bort …", och arket kan inte stängas. Sedan stängs arket, listan visar "Inget i kylen än.", kortet Kyl visar "0 varor", och "Tog bort 14 varor ur kylen." visas med "Ångra" i 5 s. Fokus går till kameraknappen "Fotografera kylen" | N/A |
| Andra platser | Frys har 3 varor | Frys har fortfarande 3 varor | N/A |
| Ångra | "Ångra" inom 5 s | Alla 14 rader kommer tillbaka med samma id, mängd, enhet och plats. Listan och kortet Kyl visar dem igen | N/A |
| Ångra med krock | Pontus har hunnit lägga till "mjölk 1 förp" i kylen, och "mjölk 2 förp" fanns bland de borttagna | De andra 13 kommer tillbaka. "1 vara gick inte att ångra." visas | `pantry_restore_failed` loggas med antalet |
| Ångra misslyckas helt | Databasfel vid "Ångra" | "Det gick inte att ångra." Varorna förblir borttagna | `pantry_restore_failed` |
| Fel vid tömning | `empty_pantry_place` nekar | "Det gick inte att ta bort varorna. Försök igen." i arket. Arket står kvar, och inget är borttaget | `pantry_empty_failed` (loggas med orsak) |
| Inget svar | Nätverket försvinner under anropet | Samma text i arket, och sidan läses om med `router.refresh()` | `pantry_empty_failed` |
| Redan tom | En annan flik har tömt platsen | Arket stängs, och "Kylen är redan tom." visas utan "Ångra" | N/A, svaret är `ok` med 0 rader |
| Fler varor än i frågan | En annan flik har lagt till en vara under tiden | Alla varor på platsen tas bort, och bekräftelsen säger det verkliga antalet ("Tog bort 15 varor ur kylen.") | N/A |
| Förfalskad indata | Okänd plats | Inget tas bort | `validation` |
| Förfalskad ångra | Rader som inte är användarens, fel form eller fler än 1 000 | Inget sätts tillbaka | `validation`, eller RLS |
| Utloggad | Sessionen har gått ut | Sidan laddas om och skickar till inloggning | `unauthorized` |
| Lagerförslag kvar | Förslag från kylen visas, och kylen töms | Förslagen står kvar men utan raden "I kylen nu" | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-6-context.md` -- moduler, regler och UX för epicen (skriven före 6.3 och 6.4, men reglerna gäller)
- `spec-2-3-ta-bort-lagervara-med-angra.md` -- mönstret för borttagning med "Ångra", inklusive dess Review Triage Log (batchning, optimistiskt läge och `router.refresh()` när svaret försvinner)
- `supabase/migrations/20261026005054_pantry_restore_item.sql`, `20261026010657_pantry_lock.sql` -- `restore_pantry_item`, dess konfliktvillkor och `pantry_lock()`
- `src/features/pantry/data/remove.ts` (+ test) -- `removePantryItemIn`, `restorePantryItemIn` och `toPantryRow`. Nya `emptyPantryPlaceIn` och `restorePantryItemsIn`
- `src/features/pantry/actions/remove-pantry-item.ts`, `restore-pantry-item.ts` (+ tester) -- mönster för `requireUser`, Zod, felhantering och `revalidateFor`
- `src/features/pantry/ui/pantry-removal.tsx` (+ test) -- `PantryRemovalProvider`, `applyPantryChanges`, ändringarna per rad (`begin`, `settle`, `drop`) och `restoreAll`
- `src/features/pantry/ui/pantry-place.tsx`, `pantry-list.tsx`, `location-cards.tsx` -- var knappen ligger och hur kortets antal räknas (`shown.length`)
- `src/features/pantry/ui/pantry-suggestions.tsx`, `use-pantry-analysis.ts` -- `editSuggestions` och `cameraButtonRef`, för fokus och "I kylen nu" efter tömningen
- `src/features/mealplan/ui/previous-plan.tsx` -- mönstret för en kontrollfråga i ett ark (`Sheet` med `closeLabel="Avbryt"`, `initialFocus="close"` och `preventClose`)
- `src/components/sheet.tsx`, `toast.tsx` (`toastWithUndoDurationMs`), `button.tsx`, `notice.tsx`
- `src/features/pantry/domain/places.ts` (+ test) -- `definite`, `itemCountText`, `removedItemsText`
- `src/lib/errors.ts`, `src/lib/revalidate.ts` (`pantry_item`)
- `tests/integration/pantry.test.ts`, `support.ts` -- databastester mot lokal Supabase
- `tests/e2e/pantry.spec.ts`, `support.ts`, `global-setup.ts` -- e2e-mönster, e2e-användare och seedning med service role

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_pantry_empty_place.sql` (`supabase migration new pantry_empty_place`), `src/lib/supabase/database.types.ts` (`pnpm db:types`) -- två nya funktioner, båda `security invoker` med `set search_path = ''`, `revoke all … from public, anon, authenticated, service_role` och `grant execute … to authenticated`:
  - `empty_pantry_place(place text) returns setof public.pantry_item` nekar `auth.uid()` som är `null` (`42501`) och en plats utanför Kyl, Frys och Skafferi (`22023`). Den tar `pantry_lock()`, gör `delete … where user_id = caller and location = place returning *` och ger raderna i id-ordning.
  - `restore_pantry_items(items jsonb) returns setof public.pantry_item` nekar `null`-anropare och allt som inte är en icke-tom array (`22023`), och ett element utan id. Den tar `pantry_lock()` och sätter sedan in varje rad med sitt id, sin ingrediens, plats, mängd och enhet. En rad hoppas över om id:t redan finns, eller om platsen har en rad för samma ingrediens med samma enhet eller där någon av dem är obegränsad (samma villkor som `restore_pantry_item`). Den ger de rader som sattes in.

  Kommentaren överst förklarar låset, varför rader hoppas över i stället för att neka hela "Ångra", och att en främmande ingrediens ger `23503` via främmande nyckel och RLS
  -- AD-19, AD-20
- [ ] `src/features/pantry/data/remove.ts` (+ test) -- två nya funktioner:
  - `emptyPantryPlaceIn(db, location)` validerar platsen med `locationSchema` (`invalid_location`) och anropar `empty_pantry_place`. Fel blir `empty_failed <code>`. Den ger `{ rows: PantryRow[]; unrestorable: number }`, där en rad som inte går att tolka räknas i `unrestorable`. Den är ändå borttagen, men kan inte sättas tillbaka (som i `removePantryItemIn`).
  - `restorePantryItemsIn(db, rows)` validerar med `z.array(pantryRowSchema).min(1).max(maxRestoreItems)` (`invalid_row`), där `maxRestoreItems = 1000` motsvarar `pantryPageSize`. Den anropar `restore_pantry_items` och ger de rader som sattes tillbaka. Fel blir `restore_failed <code>`.

  -- AD-19, AD-20
- [ ] `src/features/pantry/actions/empty-pantry-place.ts`, `restore-pantry-items.ts` (+ tester) -- Server Actions:
  - `emptyPantryPlace(location)`: `requireUser`, `locationSchema` (`validation`), `emptyPantryPlaceIn` och `revalidateFor("pantry_item")`. Den ger `Result<{ rows: PantryRow[]; removed: number }>`, där `removed` också räknar de rader som inte går att sätta tillbaka. `PantryDataError` loggas med orsak och ger `pantry_empty_failed`.
  - `restorePantryItems(rows)`: `requireUser`, schemat (`validation`), `restorePantryItemsIn` och `revalidateFor("pantry_item")`, också när rader hoppades över. Den ger `Result<{ restored: number; skipped: number }>`. `PantryDataError` loggas och ger `pantry_restore_failed`.

  Testerna täcker utloggad, ogiltig plats, ogiltiga rader, fler än 1 000 rader, databasfel, att revalidering bara sker efter en skrivning, att `skipped` räknas och att loggarna bara innehåller koder, orsaker och antal, aldrig varunamn
  -- AD-2, AD-13, AD-18
- [ ] `src/lib/errors.ts` -- ny kod `pantry_empty_failed` med texten "Det gick inte att ta bort varorna. Försök igen." och en kommentar om när den används -- AD-13
- [ ] `src/features/pantry/domain/places.ts` (+ test) -- nya texthjälpare:
  - `emptyPlaceButtonText(location)` ger "Töm kylen", "Töm frysen" eller "Töm skafferiet", och är också arkets titel och knapp;
  - `emptyPlaceQuestion(location, count)` ger "Ta bort alla 14 varor i kylen?" eller "Ta bort 1 vara i kylen?";
  - `emptyPlaceUndoHint` är "Du kan ångra direkt efteråt.";
  - `emptiedPlaceText(location, count)` ger "Tog bort 14 varor ur kylen." eller "Tog bort 1 vara ur kylen.";
  - `alreadyEmptyText(location)` ger "Kylen är redan tom.", "Frysen är redan tom." eller "Skafferiet är redan tomt.";
  - `notRestoredText(count)` ger "1 vara gick inte att ångra." eller "2 varor gick inte att ångra.".

  Exporteras från `index.ts`
  -- EXPERIENCE.md, Voice and Tone
- [ ] `src/features/pantry/ui/pantry-removal.tsx` (+ test) -- `PantryRemovalProvider` får `emptyPlace(location, items): Promise<Result<…>>`:
  - Den anropar `emptyPantryPlace`. Vid `ok` läggs en ändring `remove` in för varje returnerad rad, så att listan är tom direkt och inte blinkar innan servern har kommit ikapp.
  - Bekräftelsen `emptiedPlaceText` visas med "Ångra" (5 s). Tömningen får en egen bekräftelse och slås aldrig ihop med enstaka borttagningar.
  - "Ångra" lägger in ändringar `restore` och anropar `restorePantryItems` en gång med alla rader. Rader som hoppades över tas bort ur ändringarna, och `notRestoredText` visas med `role="alert"`.
  - Med 0 rader visas `alreadyEmptyText` utan "Ångra".
  - Om svaret försvinner (kastar) blir det `pantry_empty_failed` eller `pantry_restore_failed`, och sidan läses om med `router.refresh()`.

  Felet vid tömning lämnas till arket. Testerna täcker att listan töms direkt, "Ångra" med alla rader i ett anrop, delvis "Ångra", att "Ångra" misslyckas, 0 rader och ett svar som försvinner
  -- AD-19, AD-20, 2.3
- [ ] `src/features/pantry/ui/empty-place.tsx` (+ test), `pantry-place.tsx` -- `EmptyPlaceButton({ location, count, items })` är en `Button` (variant text) med `emptyPlaceButtonText`, och den visas under `PantryList` bara när `count > 0`. Den öppnar ett `Sheet`:
  - titeln är `emptyPlaceButtonText`, och `closeLabel` är "Avbryt" med `initialFocus="close"`;
  - texten är `emptyPlaceQuestion` och `emptyPlaceUndoHint`;
  - foten har en `Notice` med `role="alert"` vid fel och den primära knappen `emptyPlaceButtonText`, som visar "Tar bort …" och har `preventClose` medan anropet pågår.

  Vid `ok` stängs arket, och fokus går till kameraknappen via `cameraButtonRef` från `usePantrySuggestions`. Förslag från samma plats får `current: null` via `editSuggestions`, eftersom platsen är tom. `count` är `shown.length` i `PantryPlace`, alltså samma antal som kortet visar. Testerna täcker att knappen saknas för en tom plats, texten för 1 och 14 varor, att Avbryt inte anropar något, "Tar bort …", fel i arket och fokus efteråt
  -- UX-DR4, EXPERIENCE.md, Ark
- [ ] `tests/integration/pantry.test.ts` (utökad) -- med två användare mot lokal Supabase:
  - `empty_pantry_place` tar bara bort den egna användarens rader på platsen och returnerar dem med id;
  - en annan användares rader och användarens andra platser är orörda;
  - `restore_pantry_items` sätter tillbaka alla med samma id;
  - en rad som krockar (samma nyckel, eller obegränsad mot mängd) hoppas över, och de andra sätts tillbaka;
  - ett id som redan finns hoppas över;
  - en annan användares ingrediens ger `23503` eller nekas av RLS;
  - `anon` får inte köra någon av funktionerna.

  -- AD-19, AD-20
- [ ] `tests/e2e/empty-place.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-tom-plats@matkoll.test` (`emptyPlaceEmail`, med storage state), med `AI_PROVIDER=mock`. Före varje test tömmer service role användarens lager och seedar katalogingredienserna "mjölk", "ost", "smör" och "ärtor" och lagervarorna "mjölk 2 förp", "ost 1 förp" och "smör" (obegränsad) i Kyl och "ärtor 1 förp" i Frys. Testet kontrollerar:
  - att Skafferi saknar töm-knapp;
  - att "Töm kylen" ger frågan "Ta bort alla 3 varor i kylen?" med fokus på "Avbryt", och att "Avbryt" inte tar bort något;
  - att "Töm kylen" i arket ger "Tog bort 3 varor ur kylen.", "Inget i kylen än.", "0 varor" på kortet Kyl, "1 vara" på kortet Frys och ingen töm-knapp;
  - att "Ångra" ger tre rader tillbaka med samma id som före tömningen (jämförs med service role) och att "Töm kylen" syns igen.

  -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): en kontrollfråga trots att tömningen går att ångra.** EXPERIENCE.md kräver bekräftelse i förväg bara för det som inte går att ångra. Här kräver AC både en kontrollfråga och "Ångra". Det är rimligt, eftersom många varor försvinner på en gång och ett feltryck på en textknapp annars är dyrt om bekräftelsen hinner försvinna. Texten följer mönstret "Ta bort …?" utan "Är du säker?", och "Du kan ångra direkt efteråt." ersätter "Det går inte att ångra.".
- **Beslut (förslag): knappen är en textknapp under listan,** inte en knapp vid platskorten eller i sidhuvudet. Den används sällan, och kameraknappen ska vara det som syns först. Den saknas i felvägen, där listan inte går att läsa och antalet därför är okänt.
- **Beslut (förslag): en ny Postgres-funktion i stället för en `delete` från klienten,** så att tömningen tar `pantry_lock()` och aldrig blandas med en `set_pantry_items` eller `add_to_pantry` som pågår samtidigt. Alternativ: `db.from("pantry_item").delete().eq("location", …)` som `removePantryItemIn`, som är en transaktion men inte tar låset.
- **Beslut (förslag): servern tar bort alla rader på platsen, inte bara de som visades.** Om en annan flik har lagt till en vara under tiden tas den också bort, och bekräftelsen säger det verkliga antalet. "Töm kylen" betyder att kylen blir tom. "Ångra" sätter tillbaka allt som togs bort. Alternativ: att klienten skickar de id den visade, vilket kan lämna kvar en vara i en kyl som Pontus trodde var tom.
- **Beslut (förslag): "Ångra" sätter tillbaka det som går och hoppar över krockar,** i en transaktion. Om Pontus har hunnit lägga till samma vara på platsen står den nya kvar, och "1 vara gick inte att ångra." visas. Det skyddar regeln om antingen obegränsad eller mängd på samma sätt som `restore_pantry_item`. Alternativ: allt eller inget, där en enda krock skulle lämna 13 varor borttagna.
- **Beslut (förslag): en ny batchfunktion `restore_pantry_items`** i stället för 14 anrop till `restore_pantry_item`, så att "Ångra" är ett anrop och en transaktion. Konfliktvillkoret är detsamma. Om det går utan att ändra beteendet bryts det ut i en gemensam SQL-hjälpfunktion som båda funktionerna använder, som låset i `pantry_lock()`. Batchfunktionen kan också användas av 6.4.
- **Beslut (förslag): tömningen är inte optimistisk.** Arket visar "Tar bort …" tills svaret kommer, så att ett fel kan visas i arket med varorna kvar. Efter `ok` göms raderna direkt via `PantryRemovalProvider`, så att listan inte blinkar medan revalideringen kommer.
- **Beslut (förslag): fokus går till kameraknappen efter tömningen,** eftersom nästa steg i storyn är att fotografera platsen. Alternativ: "Lägg till vara" i den tomma platsen.
- **Beslut (förslag): bekräftelsen säger "Tog bort 14 varor ur kylen."** och nämner platsen, i stället för `removedItemsText`, som räknar upp namn för en eller två varor och inte säger var.
- **Beslut (förslag): lagerförslag från den tömda platsen står kvar** men får `current: null`, så att "I kylen nu" inte visar något som är borttaget. "Ångra" ger inte tillbaka raden "I kylen nu". Det är bara extra information, och ett nytt foto ger den igen.
- **Beslut (förslag): ny felkod `pantry_empty_failed`** med texten "Det gick inte att ta bort varorna. Försök igen.". Den visas i arket, där frågan redan säger vilken plats det gäller. `pantry_remove_failed` talar om en vara och saknar "Försök igen".
- **AD-19 utökas:** `pantry` får två nya skrivoperationer, `emptyPantryPlace(location)` och `restorePantryItems(rows)`. Det skrivs in i `docs/beslutslogg.md` när storyn är byggd.
- Loggning sker bara med felkod, orsak och antal, aldrig med varunamn eller mängder.
- Storyn byggs på grenen `epic/7-varukorg` och följer med i PR #45 (beslutsloggen 2026-10-26).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: töm kylen, ångra, töm igen och fotografera kylen. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- VoiceOver: frågan läses upp när arket öppnas, fokus står på "Avbryt", och bekräftelsen med "Ångra" annonseras.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: knappen, arket och bekräftelsen får plats utan vågrät scroll, och tryckytorna är minst 44 × 44 px.
