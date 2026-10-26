---
title: 'Story 8.4: Foto, inventering och tömning per ställe'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-1-stallen-i-lagret-med-hemma-som-forsta-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-tom-en-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 8.2 kan Pontus välja Stugan i Hemma. Men ett foto av kylen jämförs med kylen på det ställe som är valt när analysen läser lagret, och lagerförslag, inventering och "Töm kylen" sparar på det ställe som är valt när anropet kommer fram. Byts stället under tiden, i Hemma eller på en annan enhet, hamnar stugans mjölk hemma, eller så tar "Syns inte längre" bort hemmets yoghurt (FR-24, FR-25, FR-33). Med flera ställen säger "Töm kylen" inte heller vilken kyl som töms.

**Approach:**
- Fotot binds till ett ställe när det tas:
  - Klienten skickar ställets id med fotot till `/api/ai/analyze`.
  - Servern läser platsen på det stället och lämnar `site` (`{ id, name }`) i svaret.
  - Förslagen bär stället med sig i klienten. Bekräfta, Rätta, "Bekräfta alla", "Ta bort" och inventeringen skickar det till `confirmPantrySuggestions` och `confirmPantryInventory`, som skickar det vidare som `site` till `set_pantry_items` och `apply_pantry_inventory` (8.1).
  - Visar Hemma ett annat ställe än förslagens står "Förslagen gäller Stugan." ovanför dem.
- "Töm kylen" skickar Hemmas ställe till `empty_pantry_place`, och med fler än ett ställe säger texterna "… i kylen för Stugan".
- "Ångra" sätter alltid tillbaka på radernas eget ställe (`restore_pantry_removal`, 8.1).
- AI-porten och prompten är oförändrade, liksom Story 6.5:s bildtolkning.

## Boundaries & Constraints

**Always:**
- Storyn bygger på Story 6.5, som byggs på samma gren och ska vara klar först:
  - bilden är högst 2048 px och anropet har uttryckliga sampling-inställningar;
  - förslag med `confidence: "osäker"` har märket "Osäker" och kommer inte med i "Bekräfta alla";
  - kortet visar märket som rubrik med katalogvaran under.

  Inget av det ändras här. Stället följer med alla förslag, också de osäkra.
- AI-porten, `prompts/analyze-image.md`, `analyzeImageAnswer` och mocken ändras inte (AD-9). `analyzeImage` får platsen som förut och aldrig stället. Stället används bara för att läsa lagret och spara.
- Ställets id tas från vyn när fotot tas, inte när svaret kommer (FR-33, AD-24). Varje skrivning från förslagen använder förslagens ställe. "Töm kylen" använder det ställe Hemma visar när arket öppnas.
- `/api/ai/analyze` kontrollerar stället innan AI:n anropas. Ett ställe som inte finns, eller som en annan användare har, ger `pantry_site_gone` utan AI-anrop.
- "Syns inte längre", `replaceRowIds` och `removeRowIds` gäller bara rader på förslagens ställe och plats. `apply_pantry_inventory` filtrerar på `site_id` (8.1), så ett förfalskat id från ett annat ställe hoppas över tyst.
- "Ångra" efter "Töm kylen", "Ta bort" och "Bekräfta alla" sätter tillbaka raderna med samma id på deras eget ställe, också när Pontus har valt ett annat ställe under tiden (AD-20, AD-24). En återställd rad visas bara i Hemmas lista när den hör till det ställe och den plats som visas (8.2).
- Ett operations-id återanvänds bara för samma ställe och plats och bara medan dess bekräftelse visas (6.4).
- `pantry_lock()` gäller fortfarande alla användarens skrivningar på alla ställen.
- Med ett ställe är alla texter som i 1.0. Med fler används mönstret "… för Stugan." (EXPERIENCE.md, Voice and Tone).
- Lagerförslagen hålls som förut bara i klientens minne, ovanför Hemmas `<Suspense>` med nyckel, och står kvar när platsen eller stället byts. De släpps när Hemma göms (Activity).
- Alla tester och CI använder `AI_PROVIDER=mock`. E2E-specen har den egna e2e-användaren `e2e-stalle-foto@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inget nytt AI-anrop, ingen ny prompt och inget nytt fält i AI-schemat.
- Ingen skrivning använder det ställe som råkar vara valt när anropet kommer fram, när vyn har skickat ett ställe.
- Förslag, ställen och foton sparas aldrig på servern, i `localStorage`, i `sessionStorage` eller i adressen.
- Ingen automatisk borttagning, och ingen flytt av varor mellan ställen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Foto på Stugan | Stugan och Kyl valda. Stugans kyl har mjölk 2 förp och senap. Hemmas kyl har mjölk 1 l och yoghurt. `kyl.png` | Begäran har `site` och `location`. "I kylen nu" och jämförelsen gäller stugans kyl: mjölk under "Ändrat" med "nu: 2 förp → bilden: 1 förp", och senap under "Syns inte längre". Hemmas yoghurt nämns inte | N/A |
| Bekräfta alla | Samma förslag | Tillägg, ändringar och borttagningar sparas på Stugan. Hemmas kyl är orörd | N/A |
| Rätta | "Rätta mjölk" och sedan arkets "Bekräfta" | Sparas på Stugan | Som i 6.2 |
| Byt ställe medan förslagen visas | Pontus väljer Hemma i Hemma och trycker sedan Bekräfta | "Förslagen gäller Stugan." ovanför förslagen. Bekräftelsen sparas på Stugan | N/A |
| Byt ställe under analys | Pontus väljer Hemma medan stugans kyl analyseras | Svaret gäller Stugan, och raden "Förslagen gäller Stugan." visas | N/A |
| Bytt på annan enhet | Förslag för Stugan visas, och Hemma väljs på en annan enhet | Bekräftelser sparas på Stugan. Ingen rad visas förrän Hemma läses om och visar Hemma | N/A |
| Tom plats på Stugan | Stugans frys är tom men Hemmas frys har varor | Listan som i 6.1 och 6.2, utan grupper. Bekräftelser sparas på Stugan | N/A |
| Stället borttaget före foto | Stugan har tagits bort i en annan flik | AI:n anropas inte. "Stället finns inte längre. Välj ett annat ställe." i kameraytan, och sidan läses om | `pantry_site_gone` |
| Stället borttaget före Bekräfta | Stugan tas bort medan förslagen visas | Inget sparas, och förslagen står kvar. "Stället finns inte längre. Välj ett annat ställe." överst i sektionen | `pantry_site_gone` |
| Töm med flera ställen | Stugan vald, 14 varor i kylen, "Töm kylen" | Arket frågar "Ta bort alla 14 varor i kylen för Stugan?". Bara stugans kyl töms, och bekräftelsen säger "Tog bort 14 varor ur kylen för Stugan." med "Ångra" | N/A |
| Töm med ett ställe | Bara Hemma | Texterna från 6.3: "Ta bort alla 14 varor i kylen?" och "Tog bort 14 varor ur kylen." | N/A |
| Ångra efter byte | "Töm kylen" eller "Bekräfta alla" på Stugan, och Pontus väljer Hemma och trycker "Ångra" inom 5 s | Raderna kommer tillbaka på Stugan med samma id. Hemmas lista visar dem inte | Krock: "1 vara gick inte att ångra." |
| Ångra när stället tagits bort | Stugan töms, tas bort i en annan flik, och sedan "Ångra" | Raderna hoppas över | "14 varor gick inte att ångra." (`notRestoredText`) |
| Svaret på Töm försvann | Inget svar, och Hemma läses om | "Kylen kan ha tömts." med "Ångra" visas bara om Hemma fortfarande visar samma ställe och kylen ser tom ut | N/A |
| Förfalskat ställe | `site` som inte är ett uuid, eller en annan användares ställe, i fotot eller en bekräftelse | Inget läses eller skrivs | `validation` eller `pantry_site_gone` |
| Förfalskad borttagning | `removeRowIds` med en rad från Hemma när förslagen gäller Stugan | Raden tas inte bort, och resten sparas | N/A (filtreras i SQL) |
| Samma ingrediens på två ställen | Mjölk i kylen både hemma och i stugan | Inventering, tömning och "Ångra" ändrar bara det angivna stället | N/A |
| Samtidiga skrivningar | En bekräftelse på Stugan och en tömning på Hemma samtidigt, i två flikar | Båda lyckas, efter varandra (`pantry_lock()`) | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-8-context.md` -- bildanalysen och skrivningarna per ställe
- `spec-8-1-…md`, `spec-8-2-…md` -- parametern `site` i funktionerna, `MK410` och `pantry_site_gone`, `PantryRow.siteId` och väntande ändringar per ställe
- `spec-6-1-…md`, `spec-6-2-…md`, `spec-6-3-tom-en-plats.md`, `spec-6-4-inventera-en-plats-med-foto.md` (med Spec Change Log och Review Triage Log) -- generationer, operations-id, `spareOperation`, `restore_pantry_removal`, "Kylen kan ha tömts." och fokus
- `spec-6-5-battre-bildtolkning.md` och dess ändringar i `route-support.ts`, `use-pantry-analysis.ts`, `pantry-suggestion.ts`, `pantry-suggestion-list.tsx` och `kyl.analyze.json` -- 2048 px, `confidence: "säker" | "osäker"`, märket "Osäker", märket som rubrik och förvalet för "Bekräfta alla"
- `src/app/api/ai/analyze/route.ts`, `src/app/api/ai/route-support.ts` (`readImageForm`) -- formulärets fält
- `src/features/pantry/actions/analyze-place.ts` (+ test) -- `readPlace`, `compareWithPlace` och var stället kontrolleras
- `src/features/pantry/actions/confirm-pantry-suggestions.ts`, `confirm-pantry-inventory.ts`, `empty-pantry-place.ts`, `restore-pantry-removal.ts` (+ tester)
- `src/features/pantry/data/set.ts`, `inventory.ts` (`applyPantryInventoryIn`), `remove.ts` (`emptyPantryPlaceIn`, `restorePantryRemovalIn`)
- `src/features/pantry/domain/pantry-suggestion.ts` (`analyzeResultSchema`, `confirmSuggestionsSchema`, `inventoryConfirmSchema`), `places.ts` (`emptyPlaceQuestion`, `emptiedPlaceText`, `maybeEmptiedText`), `site.ts` (`siteSuffix`, 8.3)
- `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-suggestions.tsx`, `pantry-suggestion-list.tsx`, `pantry-camera.tsx`, `pantry-item-sheet.tsx` (`confirmCorrected`), `empty-place.tsx`, `pantry-removal.tsx`, `pantry-place.tsx` (+ tester)
- `src/lib/ai-client.ts` (`postAiForm`)
- `tests/integration/pantry.test.ts`, `pantry-site.test.ts` -- databastester
- `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts`, `pantry-inventory.spec.ts`, `empty-place.spec.ts`, `support.ts`, `global-setup.ts`; `tests/fixtures/ai/kyl.analyze.json` -- mockens varor

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/pantry/domain/pantry-suggestion.ts` (+ test):
  - `analyzeResultSchema` får `site: { id: uuid, name: string } | null`. `null` gäller bara en användare som ännu saknar ställen.
  - `confirmSuggestionsSchema` blir `{ siteId: uuid | null, items }`, och `inventoryConfirmSchema` får `siteId: uuid | null`. Gränserna (40 poster, 50 och 1 000 id) är oförändrade.
  - `suggestionsSiteText(name)` ger "Förslagen gäller Stugan.".

  -- FR-24, FR-25, AD-24
- [ ] `src/features/pantry/domain/places.ts` (+ test) -- `emptyPlaceQuestion(location, count, site)` och `emptiedPlaceText(location, count, site)` tar `SelectedSite | null` och lägger till `siteSuffix(site)` före punkten eller frågetecknet. Det ger "Ta bort alla 14 varor i kylen för Stugan?" och "Tog bort 14 varor ur kylen för Stugan.", och texterna från 6.3 med ett ställe -- EXPERIENCE.md, Voice and Tone
- [ ] `src/app/api/ai/analyze/route.ts` (+ test), `src/features/pantry/actions/analyze-place.ts` (+ test):
  - Formuläret får fältet `site` (`z.uuid()`). Ett fält som saknas betyder valt ställe och finns bara för en 1.0-klient under driftsättningen. Ett fält som inte är ett uuid ger `validation`.
  - `analyzePlace({ image, location, siteId })` slår upp stället med `listPantrySites()` innan `analyzeImage` anropas. Ett okänt id ger `pantry_site_gone` och inget AI-anrop.
  - `readPlace(location, siteId)` läser platsen på det stället (`listPantryIn(…, siteId)`).
  - Svaret får `site: { id, name }`.
  - Ett test låser att indata till `analyzeImage` är oförändrad (bara `image` och `place`).

  -- FR-24, AD-9, AD-24
- [ ] `src/features/pantry/data/set.ts`, `inventory.ts`, `remove.ts` (+ tester):
  - `setPantryItemsIn(…, siteId)`, `applyPantryInventoryIn(db, { …, siteId })` och `emptyPantryPlaceIn(db, location, operationId, siteId)` skickar `site`.
  - `MK410` ger detaljen `site_gone`.
  - Rader i svaren har `siteId`.

  -- AD-19
- [ ] `src/features/pantry/actions/confirm-pantry-suggestions.ts`, `confirm-pantry-inventory.ts`, `empty-pantry-place.ts` (+ tester):
  - `confirmPantrySuggestions({ siteId, items })`, `confirmPantryInventory({ …, siteId })` och `emptyPantryPlace(location, operationId, siteId)` validerar `siteId` och skickar det vidare.
  - `site_gone` ger `pantry_site_gone` utan skrivning.
  - Det nya försöket med ett nytt operations-id (`MK409`) behåller stället.

  Testerna visar att stället skickas, och att `revalidatePantryCommitted` bara anropas efter en lyckad skrivning -- FR-25, FR-33
- [ ] `src/lib/errors.ts`, `domain/pantry-suggestion.ts` -- inga nya koder. `pantry_site_gone` (8.2) läggs inte i `analyzeRetryCodes`, så den visas utan "Försök igen", eftersom ett nytt försök inte hjälper, och fotot släpps -- AD-13
- [ ] `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-camera.tsx` (+ tester):
  - `analyze(file, location, site)` skickar `site.id` i formuläret, och `KeptPhoto` får stället, så att "Försök igen" gäller samma ställe.
  - `PantryCamera` får `site` från `PantryPlace`.
  - Ett `pantry_site_gone` visas i kameraytan och läser om sidan.

  -- FR-24
- [ ] `src/features/pantry/ui/pantry-suggestions.tsx`, `pantry-suggestion-list.tsx`, `pantry-item-sheet.tsx` (+ tester):
  - Alla skrivningar från förslagen, alltså Bekräfta, arkets "Bekräfta" (`confirmCorrected`), "Bekräfta alla" och "Ta bort", skickar `result.site?.id ?? null`. "Behåll" och Avvisa skriver inget, som förut.
  - `spareOperation` och sammanslagningen av "Ta bort" gäller ställe och plats.
  - `PantrySuggestionList` får det ställe Hemma visar och visar `suggestionsSiteText(result.site.name)` under rubriken när det skiljer sig från förslagens. Raden är `role="status"` och annonseras en gång när den visas.
  - Efter "Töm" (6.3) blir jämförelsen `{ kind: "empty" }` bara när tömningen gällde förslagens ställe och plats.
  - Förslagens generation byts inte när stället byts.

  -- FR-25, FR-33, AD-20
- [ ] `src/features/pantry/ui/empty-place.tsx`, `pantry-removal.tsx`, `pantry-place.tsx` (+ tester):
  - `EmptyPlaceButton` får `site` och sparar det med operations-id:t när arket öppnas.
  - Frågan och bekräftelsen använder de nya texterna.
  - `emptyPlace(site, location, items, operationId)` och `isPending(siteId, location)` gäller ställe och plats.
  - "Kylen kan ha tömts." visas bara när Hemma fortfarande visar samma ställe.
  - "Ångra" (`restorePantryRemoval`) är oförändrad och sätter tillbaka på radernas ställe.

  -- FR-33, AD-20
- [ ] `tests/integration/pantry-site.test.ts` (utökad), med samma ingrediens i kylen på två ställen för samma användare:
  - `apply_pantry_inventory` med `site` ändrar, ersätter och tar bort bara på det stället. `remove_ids` och `replace_ids` från det andra stället hoppas över.
  - Posten i `pantry_removal` har `site_id` på varje rad.
  - `empty_pantry_place` med `site` tömmer bara det stället, och samma operations-id igen ger samma post.
  - `restore_pantry_removal` sätter tillbaka på radernas ställe när ett annat är valt, och hoppar över rader vars ställe har tagits bort.
  - Två samtidiga skrivningar på var sitt ställe, en inventering och en tömning, lyckas båda och körs efter varandra (`pantry_lock()`).
  - `MK410` ges för en annan användares ställe.

  -- AD-19, AD-20, AD-24
- [ ] `tests/e2e/pantry-camera.spec.ts`, `pantry-suggestions.spec.ts`, `pantry-inventory.spec.ts`, `empty-place.spec.ts` -- går igenom med ett ställe och texterna från 1.0. Bara förväntningar som läser begäran (fältet `site`) uppdateras.
- [ ] `tests/e2e/site-photo.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-stalle-foto@matkoll.test` (`sitePhotoEmail`, i `e2eEmails`), med `AI_PROVIDER=mock` och `kyl.png`. Före varje test seedar service role:
  - Stugan;
  - Hemmas kyl med mjölk 1 l och yoghurt 2 förp;
  - stugans kyl med mjölk 2 förp och senap (obegränsad);
  - Hemma som valt.

  Testerna kontrollerar:
  - att ett val av Stugan och ett foto av kylen ger "nu: 2 förp → bilden: 1 förp" för mjölk och senap under "Syns inte längre", men inte yoghurt, och att begäran har stugans id (`page.on("request")`);
  - att "Bekräfta alla" bara ändrar stugans rader och att Hemmas rader har samma id, mängd och enhet (service role);
  - att ett val av Hemma medan förslagen visas ger "Förslagen gäller Stugan.", och att Bekräfta sparar på Stugan;
  - att "Töm kylen" på Stugan frågar med stugans namn och antal, bara tömmer stugans kyl, och att "Ångra" efter ett val av Hemma ger raderna tillbaka på Stugan med samma id;
  - att en tom frys på Stugan ger 6.2:s lista när Hemmas frys har varor.

  -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn: att fotot binds till stället när det tas, raden "Förslagen gäller Stugan.", texterna för "Töm kylen" och att stället kontrolleras före AI-anropet.

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): fotot binds till stället när det tas, inte när svaret kommer.** Analysen kan ta upp till 100 s med den lokala modellen. Om Pontus byter ställe under tiden gäller fotot fortfarande det kylskåp som fotograferades. Klienten skickar ställets id, och servern lämnar ställets namn för raden "Förslagen gäller Stugan.".
- **Beslut (förslag): stället kontrolleras före AI-anropet.** En läsning av ställena är billig jämfört med en analys på 20–100 s, och ett foto av ett ställe som inte längre finns går inte att spara ändå.
- **Beslut (förslag): raden "Förslagen gäller Stugan." visas bara när förslagens ställe skiljer sig från det Hemma visar.** Annars säger rubriken "Lagerförslag från kylen" allt som behövs, och med ett ställe ändras inget. Bekräftelserna ("mjölk är sparad i kylen.", "Kylen är uppdaterad: …") är oförändrade, eftersom raden står ovanför korten när det behövs. Alternativ: "… för Stugan." i varje bekräftelse när det finns fler än ett ställe.
- **Beslut (förslag): förslagen står kvar när stället byts,** med samma generation. Det är samma regel som när platskortet byts (6.1), och AC:n kräver det. Den tillfälliga avgränsningen från 8.2, där förslagen sparades på valt ställe, upphör här.
- **Beslut (förslag): `site` får saknas i `/api/ai/analyze`** och betyder då valt ställe, bara för en 1.0-klient som är öppen under driftsättningen (AD-5). Den nya klienten skickar alltid fältet.
- **Beslut (förslag): `pantry_site_gone` ger ingen "Försök igen".** Ett nytt försök med samma ställe misslyckas igen, så felet läser om sidan, och Pontus väljer ett annat ställe.
- **Beslut (förslag): "Kylen kan ha tömts." kräver samma ställe.** Om Hemma har bytt ställe medan svaret saknades säger en tom kyl ingenting om stugans kyl. "Ångra" finns då inte, men posten finns kvar på servern i ett dygn (6.3).
- **Risk: 6.5 ändrar samma filer.** `use-pantry-analysis.ts`, `pantry-suggestion.ts` och `pantry-suggestion-list.tsx` ändras av båda storyna. 8.4 byggs efter att 6.5 är klar och tar in dess ändringar först. Om 6.5:s fält eller texter skiljer sig från det som står här gäller 6.5, och stället läggs till ovanpå.
- **Risk: mockens `kyl.png`.** Om 6.5 ändrar `tests/fixtures/ai/kyl.analyze.json` (till exempel med `confidence`) följer e2e-specen fixturen, men grupperna i matrisen ska vara desamma.
- Loggar innehåller bara felkoder, orsaker och antal, aldrig ställenas namn, varunamn eller AI-svar.
- **Från granskningen av 8.1:** `analyzePlace` lämnar id:t för det ställe som analyserades, och `apply_pantry_inventory` och `add_to_pantry` får det som `site`, så att en bekräftelse aldrig hamnar på ett ställe som valts under tiden.
- **Från granskningen av 8.2:**
  - "Töm kylen" skickar det ställe som visas: `emptyPantryPlace({ siteId, … })` ger `site` till `empty_pantry_place`. Gränssnittet nycklar redan väntande tömningar på ställe och plats (`emptyPlace(siteId, …)` i `pantry-removal.tsx`).
  - Bildanalysen behåller det ställe som fotot togs för. Bekräfta, Rätta (i dag ignorerar `confirmCorrected` `form.siteId`) och inventeringen skickar det stället, så att ett byte på två enheter aldrig kan skriva ett ställes foto på ett annat.
  - I 8.2 nycklas `PantrySuggestionsProvider` på valt ställe i `hemma/home-place.tsx`, så att förslagen och väntande borttagningar försvinner vid ett byte. När förslagen bär sitt ställe tas nyckeln bort, så att beslutet ovan ("förslagen står kvar när stället byts") gäller. Det som ska överleva ett byte ligger redan i `SiteSwitchProvider` ovanför nyckeln.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio, med Stugan vald: fotografera en kyl, byt till Hemma medan analysen pågår och bekräfta förslagen. Raden "Förslagen gäller Stugan." ska synas, och varorna ska hamna i stugans kyl. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- VoiceOver: "Förslagen gäller Stugan." läses upp en gång när raden visas, och frågan i arket "Töm kylen" läses med ställets namn.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raden ovanför förslagen och frågan i arket radbryts utan vågrät scroll, också med ett namn på 40 tecken.
