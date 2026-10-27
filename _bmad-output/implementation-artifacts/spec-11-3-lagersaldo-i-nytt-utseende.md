---
title: 'Story 11.3: Lagersaldo i nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: 'fbe221d180c822da13cbdb9b5f225ebb645866c7'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-2-marke-och-tid-pa-lagervaror.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-se-lagret-per-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagersaldo.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill se lagret i kategorier med ikon, utan mängder, och kunna ta bort en vara med ett tryck: "ta bort mängd i listan", "en soptunna på varje iaf som raderar utan kontrollfråga" (FR-40, FR-41). I dag delas platsen i "Med mängd" och "Finns hemma", och en vara tas bort med svep eller i arket.

**Approach:**
- Lagersaldos lista visar platsens varor under kategorirubriker (11.1) i listgrupper, en rad per vara med raden under: märket, annars "Tillagd …" (11.2).
- Varje rad har en soptunna som tar bort direkt, med "Tog bort Gräddfil." och "Ångra" i 5 s. Svepet tas bort.
- Ett sökfält överst filtrerar platsen.
- Allt annat i Lagersaldo (ställesväljaren, platskorten, kameraknappen, Senaste foto, "Töm kylen", "Lägg till ställe") står kvar.

## Boundaries & Constraints

**Always:**
- Kategorin är `displayCategory(item.section, item.name)`. Kategorierna står i `CATEGORIES`-ordning, och varorna inom en kategori i svensk bokstavsordning (`localeCompare('sv')`).
- Raden under är `pantryMetaText(item, now)`: märket om det finns, annars "Tillagd idag", "Tillagd igår", "Tillagd för N dagar sedan" (2–13), "Tillagd 24 okt" (14 dagar eller äldre, samma år) eller "Tillagd 24 okt 2025". Dagar räknas i Europe/Stockholm, som `photoTimeText` i 10.2.
- Varken mängd, enhet eller "Finns hemma"-etiketter syns i listan. Obegränsade varor är rader som de andra.
- Ett tryck på raden (utom soptunnan) öppnar arket Lagervara som förut. Raden är en knapp med namnet "Mellanmjölk, Arla laktosfri".
- Soptunnan anropar samma borttagning som i dag (`usePantryRemoval`, `removePantryItem`, `restorePantryItem` med samma id, märke och tid). Borttagningen visas direkt (optimistiskt). Misslyckas den kommer varan tillbaka och meddelanderutan visar `pantry_remove_failed`.
- Bekräftelsen säger "Tog bort Gräddfil." med "Ångra" i 5 s (`toastWithUndoDurationMs`). En ny borttagning ersätter bekräftelsen, och den förra står fast.
- Efter soptunnan går fokus till nästa varas soptunna, annars den föregående, annars sökfältet, annars "Lägg till vara".
- Sökfältet "Sök i kylen", "Sök i frysen" eller "Sök i skafferiet" (`SearchField`, minst 16 px text) står överst i listan när platsen har varor. Det filtrerar på namn och märke, utan skillnad på stora och små bokstäver och på å/ä/ö som vanligt, utan fördröjning. Kategorier utan träff döljs, och antalen visar träffarna.
- Sökningen töms när plats eller ställe byts. Den står kvar när Pontus byter flik och kommer tillbaka (React Activity).
- Ingen träff: "Inget i kylen matchar." och knappen "Rensa sökning", som tömmer fältet och sätter fokus i det.
- Platskortens antal och "Töm kylen" gäller hela platsen, inte sökningen.
- En tom plats visar som förut "Inget i kylen än." med "Lägg till vara" och "Fotografera kylen", och inget sökfält.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och tangentbord. Tryckytor minst 44 × 44 px.
- E2E-specen har den egna e2e-användaren `e2e-utseende-lager@matkoll.test`.

**Never:**
- Ingen kontrollfråga för soptunnan.
- Inget svep i Lagersaldo.
- Ingen ändring av hur mängder sparas eller räknas (lagningsstatusen, inköpslistan och "Kan lagas nu" är oförändrade).
- Ingen sökning över flera platser eller ställen.
- Inget rött, ingen "Ny"-etikett och ingen källa ("från fotot").

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Kylen | Mellanmjölk (märke "Arla laktosfri"), Gräddfil (6 dagar), Ägg (idag), Kycklingfilé (igår), Senap (märke "Johnny's"), Gurka (24 dagar, samma år) | Mejeri & ägg 3 (Gräddfil "Tillagd för 6 dagar sedan", Mellanmjölk "Arla laktosfri", Ägg "Tillagd idag"), Kött, fisk & chark 1 ("Tillagd igår"), Frukt & grönt 1 ("Tillagd 2 okt") och Såser & smaksättare 1 ("Johnny's"), i butikens ordning: Frukt & grönt, Mejeri & ägg, Kött, fisk & chark, Såser & smaksättare | N/A |
| Obegränsad vara | Salt utan mängd i Skafferi | Raden "Salt" under Såser & smaksättare, utan etikett "Finns hemma" | N/A |
| Mängd | Mjölk 2 l | Ingen mängd syns i listan, men arket visar 2 l | N/A |
| Öppna | Tryck på raden Mellanmjölk | Arket Lagervara med mängd, enhet, plats och märke | N/A |
| Soptunna | Tryck på soptunnan vid Gräddfil | Raden försvinner, "Tog bort Gräddfil." med "Ångra", fokus på nästa soptunna | N/A |
| Ångra | "Ångra" inom 5 s | Gräddfil tillbaka med "Tillagd för 6 dagar sedan" | "Det gick inte att ångra." (alert) |
| Två borttagningar | Soptunnan vid Gräddfil och sedan vid Ägg | Bekräftelsen säger "Tog bort Ägg.", Gräddfil förblir borttagen | N/A |
| Fel vid borttagning | Servern svarar `pantry_remove_failed` | Gräddfil tillbaka, meddelanderutan "Det gick inte att ta bort varan." | `pantry_remove_failed` |
| Sista varan | Soptunnan vid den enda varan | "Inget i kylen än." och fokus på "Lägg till vara" | N/A |
| Sök | "mjö" i "Sök i kylen" | Bara Mellanmjölk, under Mejeri & ägg med antalet 1 | N/A |
| Sök på märke | "johnny" | Senap | N/A |
| Ingen träff | "xyz" | "Inget i kylen matchar." och "Rensa sökning" | N/A |
| Byt plats | Sökning "mjö", tryck på Frys | Fältet är tomt, frysens varor visas | N/A |
| Byt flik och tillbaka | Sökning "mjö", Recept, Lagersaldo | Sökningen och träffarna står kvar | N/A |
| Byt ställe | Sökning, välj Stugan | Fältet är tomt | N/A |
| Tom plats | Frysen utan varor | "Inget i frysen än." utan sökfält | N/A |
| VoiceOver | Rotorn på rubriker | Kategorierna går att hoppa mellan, "Mejeri & ägg, rubrik nivå 2", "3 varor" | N/A |
| 200 % text | Långt namn och långt märke | Namnet radbryts, märket får "…", soptunnan står kvar till höger | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md`
- `mockups/lagersaldo.html` -- målet
- `src/features/pantry/ui/pantry-list.tsx` (+ tester), `pantry-removal.tsx`, `pantry-place.tsx`, `pantry-item-sheet.tsx`, `empty-place.tsx`
- `src/features/pantry/domain/pantry-item.ts` (`splitPantryItems`), `places.ts` (`emptyPlaceText`, `definite`)
- `src/features/pantry/domain/place-photo.ts` (`photoTimeText` från 10.2) -- mönster för tid i svensk tid
- `src/components/` -- `CategoryHeader`, `ListGroup`, `ListRow`, `TrashButton` (11.1), `SearchField`, `EmptyState`, `toast.tsx`, `swipe-row.tsx`
- `src/features/catalog` -- `displayCategory`, `CATEGORIES`
- `tests/e2e/` -- specar som letar efter "Med mängd", "Finns hemma" eller svepet i Lagersaldo (`grep -rln "Med mängd\|Finns hemma" tests/e2e`)

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/pantry-meta.ts` (+ test) -- `pantryMetaText(item, now)` enligt Boundaries, `groupPantryByCategory(items)`, `filterPantry(items, query)` och `noMatchText(location)` ("Inget i kylen matchar.") -- FR-41, UX-DR28
- [x] `src/features/pantry/ui/pantry-list.tsx` (+ test) -- kategorier med `CategoryHeader`, `ListGroup` och `ListRow` med `TrashButton`. `splitPantryItems`, "Med mängd", "Finns hemma" och `SwipeRow` försvinner härifrån. Fokusflyttningen efter borttagning följer Boundaries -- FR-41, UX-DR24
- [x] `src/features/pantry/ui/pantry-search.tsx` (+ test) -- sökfältet och tillståndet, nollställt vid ny plats eller nytt ställe (nyckel), bevarat under Activity
- [x] `src/features/pantry/ui/pantry-removal.tsx` (+ test) -- texten "Tog bort Gräddfil." och fokus till nästa soptunna
- [x] `src/features/pantry/domain/pantry-item.ts` -- ta bort `splitPantryItems` om inget annat använder den
- [x] Befintliga e2e-specar -- uppdatera de som letar efter "Med mängd", "Finns hemma" eller svepet i Lagersaldo
- [x] `tests/e2e/pantry-look.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-lager@matkoll.test`. Service role seedar kylen i matrisen med märken och `created_at`. Testerna kontrollerar kategorierna och ordningen, raden under, att ingen mängd syns, soptunnan och "Ångra" med samma rad under, sökningen och att den töms vid byte av plats, vid 375 px
- [x] `docs/oppna-fragor.md` -- raden om svep i "Att prova på riktig telefon" ersätts med soptunnan
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given Lagersaldo vid 375 px i ljust och mörkt läge, when den jämförs med `mockups/lagersaldo.html`, then har den samma uppbyggnad (skärmbilder utanför repot, i granskningen).

## Implementation Notes

- **Beslut (förslag): butikens ordning också i Lagersaldo.** Skissen visade Mejeri först i kylen, men en ordning överallt är lättare att lära sig.
- **Beslut (förslag): märket före tiden.** En rad räcker. Tiden syns för varor utan märke, vilket ofta är det som lades till för hand.
- **Beslut (förslag): svepet tas bort.** Soptunnan gör samma sak synligt, och svepet kunde få Safari att gå bakåt nära kanten.
- **Beslut (förslag): sökningen filtrerar i klienten.** Platsens varor finns redan i sidan, och en plats har sällan fler än 50 varor.
- **Risk: fokus efter borttagning.** Raden försvinner direkt, så fokus måste flyttas innan den tas bort ur DOM. Följ mönstret i `pantry-list.tsx` (`focusAfter`).
- **Risk: tiden i tester.** Använd en fast `now` i domäntesterna och seeda `created_at` relativt till testets tid i e2e.

## Spec Change Log

### Vid bygget

- **Byggd på `fbe221d`** (`baseline_commit`): epicgrenen med 11.1, 11.2 och 11.6 ihopslagna. 11.4 och 11.5 byggs samtidigt i andra worktrees.
- **Besluten (förslag) är godkända** som de stod: butikens ordning, märket före tiden, svepet borta och sökningen i klienten.
- **`photoTimeText` finns inte:** Story 10.2 är inte byggd. `addedText` i `pantry-meta.ts` räknar kalenderdagar i Europe/Stockholm med `Intl.DateTimeFormat`, som `planDateText` i matsedeln, och månaderna skrivs som där ("okt", "mars"). Testerna har en fast `now` och prövar dygnsgränsen, nyår och bytet till sommar- och vintertid.
- **Sökfältet saknade ett sätt att söka utan fördröjning.** `SearchField` fick `delayMs` (standard 200 ms som förut, 0 i Lagersaldo). Ändringen är bakåtkompatibel för 11.4 och 11.5.
- **En ny borttagning ersätter bekräftelsen** (`pantry-removal.tsx`): bara den senaste varan kan ångras. "Töm kylen" samlar fortfarande en enskild borttagning som visas i sin bekräftelse ("Tog bort 3 varor ur kylen."), som i 6.3, så att den inte går förlorad. En enskild borttagning efter "Töm kylen" ersätter däremot den bekräftelsen, och de tömda raderna står kvar som borttagna. `removedItemsText` ("Mjölk är borttagen.") står kvar för lagerförslagen och Inköpslistan; Lagersaldo använder nya `removedItemText` ("Tog bort Gräddfil."), också för "Ta bort" i arket.
- **Fokus efter soptunnan:** `focusAfterRemoval(bin, listan)` flyttar till nästa soptunna, annars den föregående, innan raden försvinner. Finns ingen annan soptunna i listan går fokus, när raden är borta, till sökfältet (platsen har fler varor som sökningen döljer), annars till "Lägg till vara". `focusAfterRemoval`:s egen reserv (listans rubrik, sidans `h1`) används inte, eftersom specen säger sökfältet och "Lägg till vara". Efter "Ta bort" i arket går fokus som förut till nästa varas rad.
- **Radens namn för skärmläsare** är "Mellanmjölk Arla laktosfri", utan kommatecken, enligt beslutet i 11.1 (raderna är block, så VoiceOver pausar). Raden har `aria-haspopup="dialog"` som i README-mönstret. Två rader med samma namn (samma vara i två enheter) får raden under med i soptunnans namn: "Ta bort Mjölk, Arla".
- **Två knappar heter "Rensa sökning"** när inget matchar: krysset i fältet och textknappen i det tomma läget, som specen säger. Testerna skiljer dem på synlig text.
- **Sökningen nollställs** genom att `PantryPlace` nycklar listan på ställe och plats (sidans `Suspense` är redan nycklad likadant). Sökningen är tillstånd i listan, så React Activity bevarar den. Kortens antal och "Töm kylen" gäller hela platsen. Sökningen tar högst 100 tecken.
- **`splitPantryItems`** användes bara av listan och är borttagen, med sitt test och sin export.
- **E2E:** ny `pantry-look.spec.ts` med `e2e-utseende-lager@matkoll.test`. De befintliga specarna letade efter mängder i raderna, "Med mängd", "Finns hemma", taggarna, svepet och "Mjölk är borttagen.". De läser nu namnen och "Tillagd idag", och mängderna kontrolleras i tabellen (service role) eller i arket Lagervara: `pantry`, `empty-place`, `pantry-camera`, `pantry-suggestions`, `pantry-inventory`, `pantry-sites`, `site-photo`, `pantry-status`, `put-in-pantry` och `core-flow`. Mellan två tryck på soptunnor i e2e väntar testet 450 ms, som mellan två riktiga tryck (dubbeltrycksskyddet på 400 ms).
- **200 % text:** vid 375 px med `html { font-size: 200% }` ingen vågrät scroll. Vid 188 px bredd (375 px med 200 % zoom) radbryts listan utan att gå utanför, men platskorten (Skafferi, oförändrade sedan Epic 8) går 59 px utanför. Det rör inte storyn och står under öppna frågor (T8).
- **Kontrollerna** (integration och e2e under `scripts/with-test-lock.sh`): `pnpm lint`, `pnpm typecheck` och `pnpm test` (215 filer, 4 378 tester) lyckas. `pnpm test:integration` ger 455 av 455. `AI_PROVIDER=mock pnpm build` lyckas, och `CI=1 pnpm test:e2e` ger 275 av 275 (hela sviten mot produktionsbygget).
- **Skärmbilder** vid 375 px i ljust och mörkt läge (listan, bekräftelsen, sökningen och ingen träff), vid 1280 px, med 200 % text och vid 188 px, utanför repot. Uppbyggnaden följer `mockups/lagersaldo.html`: sökfältet, kategorirubrikerna med platta och antal, listgrupperna med märket eller tiden och en grå soptunna per rad, och "Tog bort Gräddfil." med "Ångra".
- **Manuella kontroller** (iPhone, VoiceOver) är inte gjorda. De står i `docs/oppna-fragor.md` under "Att prova på riktig telefon".

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: tryck på soptunnan och "Ångra". Varan ska komma tillbaka med samma rad under. Tryck på soptunnan nära skärmkanten: Safari ska inte gå bakåt.
- VoiceOver: kategorierna i rotorn under Rubriker, raden "Mellanmjölk, Arla laktosfri, knapp", "Ta bort Gräddfil, knapp" och bekräftelsen med "Ångra".
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: ingen vågrät scroll.
