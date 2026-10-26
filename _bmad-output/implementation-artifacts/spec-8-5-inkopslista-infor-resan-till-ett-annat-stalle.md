---
title: 'Story 8.5: Inköpslista inför resan till ett annat ställe'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: 'c6b2f84706215a2e5c3ad722a862849ad13ff7a7'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-3-lagningsstatus-forslag-och-lagg-i-lagret-foljer-valt-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-inkopslistan-raknas-fram.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-6-ratta-mangd-och-dolja-listposter.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-3-skicka-till-ica.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Det här är huvudsyftet med 1.1. På fredagen vill Pontus handla inför resan till stugan, men inköpslistan drar av det lager som är valt, och det syns inte vilket det är. Utan att gå till Hemma och byta ställe köper Pontus då en andra ketchup, som redan finns i stugan, och glömmer senapen, som finns hemma men inte där (FR-32, UJ-6, Flöde 6).

**Approach:**
- När det finns fler än ett ställe visar Inköpslistan "Lager: Hemma" och textknappen "Byt" under rubriken.
- "Byt" öppnar arket "Räkna listan mot" (`pantry/ui`) med en rad per ställe, där valt ställe har en bock.
- Ett tryck väljer stället med samma `selectPantrySite` som i Hemma (8.2), stänger arket och visar "Listan räknas nu mot Stugan.". Listan räknas om mot stugans lager (8.1, 8.3).
- Bockar, rättade mängder, dolda poster och egna varor ligger under listnycklar utan ställe, så de står kvar.
- Den tomma listan säger "Allt finns i lagret för Stugan.".
- Exporten innehåller listans poster för valt ställe, i samma format.

## Boundaries & Constraints

**Always:**
- "Byt" är samma val som i Hemma (beslutsloggen 2026-10-26, modell A). Listan har inget eget ställe, och valet gäller hela appen tills Pontus byter igen.
- Raden och arket ligger i `pantry/ui` och renderas av `/lista` (route → ui, AD-24). `shopping/ui` importerar dem inte. `ShoppingList` får bara `site` som data för sina texter.
- Raden "Lager: <namn>" (`{typography.meta}`) och "Byt" visas bara när `siteCount > 1`. Med ett ställe, eller när stället inte går att läsa, är allt som i 1.0: ingen rad, och "Allt finns hemma." (UX-DR17). Raden annonseras inte när sidan laddas.
- Raden och listan läses i samma förfrågan (`getShoppingList` lämnar `site`, 8.3), så raden namnger alltid det ställe som listan räknades mot.
- Arket "Räkna listan mot" har en rad per ställe i skapad ordning, med en bock på valt ställe och radioknappssemantik.
  - Ett tryck anropar `selectPantrySite`. Raden visar att den sparar, och de andra raderna är inaktiva så länge.
  - När svaret har kommit, och listan därmed är omräknad, stängs arket. "Listan räknas nu mot Stugan." visas som kort bekräftelse.
  - Ett tryck på valt ställe stänger bara arket.
  - Vid fel visas en blå `Notice` i arket, och arket står kvar.
- Listans egen annonsering "Inköpslistan är omräknad. …" görs inte när det som ändrats är stället. Bekräftelsen säger det i stället, så att skärmläsaren inte får två texter.
- Stället ingår aldrig i listnycklar, bockar, överstyrningar, egna varor, produktval eller exporten (AD-8, AD-16). `computeList`, `exportBasket` och formatet `Matkoll varukorgsexport v1` ändras inte.
- En avbockad post som blir täckt efter ett byte försvinner från listan, men bocken finns kvar på servern och syns igen om posten kommer tillbaka (FR-18). Ingen bock, överstyrning eller dold post tas bort av ett byte. 3.7:s städning av kvitton gäller som förut.
- Arket stängs när Inköpslistan göms efter en navigering (React Activity). Ark staplas aldrig, och tryckytorna är minst 44 × 44 px.
- E2E-specen har den egna e2e-användaren `e2e-stalle-lista@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inget eget ställe för listan eller matsedeln (öppen fråga 7) och ingen visning via adressen (öppen fråga 6).
- Ingen summering över ställen, och ingen lista som räknas mot två ställen.
- Ingen ändring av listnycklar, `shopping_check`, `shopping_line_override`, `shopping_custom_item`, `product_choice` eller exportens format.
- Matkoll väljer aldrig ställe på egen hand, till exempel efter position eller veckodag (SM-C3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Raden | Hemma och Stugan, Hemma valt | Under rubriken: "Lager: Hemma" och textknappen "Byt" | N/A |
| Ett ställe | Bara Hemma | Ingen rad. Listan är som i 1.0 | N/A |
| Byt till Stugan | "Byt", sedan Stugan i "Räkna listan mot" | Arket stänger, "Listan räknas nu mot Stugan." visas, raden säger "Lager: Stugan", och Hemma visar Stugan som valt | N/A |
| Ketchup och senap | Ketchup hemma men inte i stugan, och senap i stugan men inte hemma. Matsedeln behöver båda | Mot Stugan står ketchup på listan men inte senap. Mot Hemma är det tvärtom | N/A |
| Bockar står kvar | Korv avbockad, ingen av platserna har korv | Korv är avbockad efter bytet | N/A |
| Täckt bock | Senap avbockad mot Hemma, och Pontus byter till Stugan | Senap försvinner från listan. Tillbaka till Hemma: senap är avbockad igen | N/A |
| Rättad mängd | Korv rättad till 8 st | Korv visar 8 st efter bytet | N/A |
| Dold post | Salt dold ("Dolda varor (1)") | Salt är fortfarande dold efter bytet | N/A |
| Egen vara | "Kaffe" tillagd som egen vara | Kaffe står kvar efter bytet | N/A |
| Allt finns | Allt på matsedeln finns i stugan | "Allt finns i lagret för Stugan." | N/A |
| Allt finns, ett ställe | Bara Hemma, allt finns | "Allt finns hemma." | N/A |
| Tryck på valt ställe | Hemma är valt, och Pontus trycker på Hemma | Arket stänger, och inget sparas | N/A |
| Valet misslyckas | Servern svarar inte eller nekar | Arket står kvar med en `Notice`: "Det gick inte att spara stället. Försök igen." Listan är oförändrad | `pantry_site_failed` |
| Stället borttaget | Stugan togs bort i en annan flik innan trycket | "Stället finns inte längre. Välj ett annat ställe." i arket, och arket läses om | `pantry_site_gone` |
| Skicka till ICA | Listan räknad mot Stugan, "Skicka till ICA" | Exporten har listans poster för Stugan (ketchup, inte senap) och börjar med `Matkoll varukorgsexport v1` | N/A |
| Lägg i lagret | Listan räknad mot Stugan | "Lagt 8 varor i lagret för Stugan." och varorna på Stugan (8.3) | N/A |
| Bytt på annan enhet | Listan visar "Lager: Hemma", och Stugan väljs på en annan enhet | Raden och listan visar Stugan nästa gång listan läses. "Lägg i lagret" i den gamla vyn lägger på Hemma (8.3) | N/A |
| Listan göms | Pontus går till Matsedel med arket öppet | Arket stängs | N/A |
| Lagret går inte att läsa | Snapshoten eller stället kastar | Listan visas som i 1.0 med "Det gick inte att läsa lagret, så inget är avdraget från listan." och utan rad "Lager" | `pantry_unavailable` loggas |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-8-context.md` -- listan, "Byt", arket och texterna
- `spec-8-2-…md` -- `selectPantrySite`, `pantry_site_gone`, `pantry_site_failed` och `revalidateFor("pantry_site")`, som revaliderar `/lista`
- `spec-8-3-…md` -- `getShoppingList` med `site`, `siteLineText`, `siteSuffix` och "Lägg i lagret" mot listans ställe
- `spec-3-3-…md`, `spec-3-4-bocka-av-i-butiken.md`, `spec-3-5-egna-varor.md`, `spec-3-6-…md`, `spec-3-7-…md` -- listnycklar, bockar, egna varor, överstyrningar, dolda poster och kvitton
- `spec-7-3-skicka-till-ica.md` -- exporten och formatet
- `src/app/(app)/lista/page.tsx`, `shopping-list-content.tsx` -- var raden renderas
- `src/features/shopping/ui/shopping-list.tsx` (`useRecountAnnouncement`, `signatureOf`, `useChecks`), `send-basket.tsx`, `put-in-pantry.tsx` (+ tester)
- `src/features/shopping/domain/list-text.ts` (`allAtHomeText`, `recountedText`) (+ test), `export-basket.ts`
- `src/features/pantry/server.ts` (`listPantrySites`), `domain/site.ts`, `ui/site-switch.tsx`, `ui/sites-sheet.tsx` (8.2) -- mönster för val och ark
- `src/components/sheet.tsx`, `button.tsx`, `notice.tsx`, `toast.tsx`, `icons.tsx` (bock)
- `tests/e2e/shopping.spec.ts`, `basket-export.spec.ts`, `put-in-pantry.spec.ts`, `support.ts`, `global-setup.ts` -- seeds, urklipp och e2e-användare

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/site.ts` (+ test), `index.ts` -- nya texter:
  - `switchListTitle`: "Räkna listan mot";
  - `switchListButtonText`: "Byt", med `aria-label` "Byt lager för listan";
  - `listCountedAgainstText(name)`: "Listan räknas nu mot Stugan.".

  -- EXPERIENCE.md, Voice and Tone
- [x] `src/features/pantry/ui/list-site-line.tsx` (+ test) -- `ListSiteLine({ site, sites })` (klient):
  - Den visar `siteLineText(site)` och textknappen "Byt", och ingenting när `siteCount <= 1`.
  - "Byt" öppnar arket Byt ställe (`Sheet`, titel "Räkna listan mot"). Arket har en `role="radiogroup"` med en rad per ställe, där valt ställe har `aria-checked="true"` och en bock.
  - Ett tryck på ett annat ställe anropar `selectPantrySite` i en transition. Raden visar att den sparar, och de andra raderna är inaktiva.
  - Ett lyckat svar stänger arket och visar `listCountedAgainstText` som kort bekräftelse. Ett fel visar `Notice` i arket, och `pantry_site_gone` läser om sidan.
  - Ett tryck på valt ställe stänger arket.
  - Arket stängs när sidan göms (Activity). Fokus går tillbaka till "Byt".

  -- FR-30, FR-32, UX-DR17
- [x] `src/app/(app)/lista/shopping-list-content.tsx` -- läser `listPantrySites()` bredvid `getShoppingList()`, i samma förfrågan, och renderar `ListSiteLine` med listans `site` direkt under sidrubriken, före `ShoppingList`. Ett fel när ställena läses ger ingen rad, och listan visas ändå -- AD-18, AD-24
- [x] `src/features/shopping/domain/list-text.ts` (+ test) -- `allInStockText(siteName: string | null)` ger "Allt finns i lagret för Stugan." eller "Allt finns hemma." och ersätter `allAtHomeText` -- EXPERIENCE.md, State Patterns
- [x] `src/features/shopping/ui/shopping-list.tsx` (+ test):
  - Den tomma listan med matsedel använder `allInStockText`, med namnet bara när `site.siteCount > 1`.
  - `useRecountAnnouncement` får `site?.id`. När stället skiljer sig från det senast visade annonseras inget, men det visade läget uppdateras ändå.
  - Bockar, överstyrningar och egna varor hanteras som förut.

  Testerna täcker ingen annonsering vid byte av ställe, annonseringen vid en annan omräkning och texterna -- FR-32, FR-18
- [x] `tests/e2e/site-list.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-stalle-lista@matkoll.test` (`siteListEmail`, i `e2eEmails`), med behörighet till urklippet som i `basket-export.spec.ts`. Före varje test seedar service role:
  - katalogingredienserna "ketchup", "senap" och "korv";
  - receptet "Korv med bröd" med ketchup 1 förp, senap 1 förp och korv 4 st, på den aktuella matsedeln;
  - Stugan;
  - ketchup 1 förp på Hemma och senap 1 förp på Stugan;
  - Hemma som valt.

  Bockar, överstyrningar och egna varor tas bort. Testerna kontrollerar:
  - "Lager: Hemma" och "Byt", med senap och korv på listan men inte ketchup;
  - att "Byt" och Stugan stänger arket, ger "Listan räknas nu mot Stugan." och "Lager: Stugan", med ketchup och korv men inte senap, och att Hemma visar Stugan som valt;
  - att en avbockad korv, korv rättad till 8 st, en dold post och egna varan "Kaffe" står kvar efter bytet;
  - att senap som bockats av mot Hemma försvinner mot Stugan och är avbockad igen mot Hemma;
  - "Allt finns i lagret för Stugan." när stugan har alla tre;
  - att det kopierade ur "Skicka till ICA" mot Stugan börjar med `Matkoll varukorgsexport v1` och har ketchup men inte senap;
  - i ett eget test, när Stugan har tagits bort: ingen rad, och "Allt finns hemma." när allt finns.

  -- matrisen, FR-26, FR-32
- [x] `tests/e2e/shopping.spec.ts`, `basket-export.spec.ts`, `put-in-pantry.spec.ts` -- går igenom oförändrade, med ett ställe.
- [x] `docs/beslutslogg.md` -- en post för storyn: att arket väntar på svaret innan det stänger, att listans annonsering inte görs vid byte av ställe och texten "Byt lager för listan". Under "Checklista för Pontus" i `docs/oppna-fragor.md` läggs en punkt: "Prova Flöde 6 inför nästa resa till stugan: byt till Stugan under Lista, handla, tryck Lägg i lagret i stugan och välj Hemma igen på söndagen. Svara sedan på frågorna 6 och 7."

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): arket väntar på svaret innan det stänger,** i stället för att välja optimistiskt som pillren i Hemma. Server Actionen revaliderar `/lista` i samma anrop (`revalidateFor("pantry_site")`), så när svaret kommer är listan redan omräknad. Pontus ser aldrig "Lager: Stugan" ovanför en lista som är räknad mot Hemma. Raden visar att den sparar, och NFR-7 kräver svar inom en sekund.
- **Beslut (förslag): raden renderas av sidan, inte av `ShoppingList`.** AD-24 säger att `shopping/ui` inte importerar ställesväljaren. Sidan sätter ihop `pantry/ui` och `shopping/ui`, och `ShoppingList` får bara `site` som data för den tomma listans text och annonseringen.
- **Beslut (förslag): bekräftelsen ersätter listans annonsering vid ett byte av ställe.** Utan det skulle skärmläsaren få både "Listan räknas nu mot Stugan." och "Inköpslistan är omräknad. 5 varor kvar.". Antalet varor står i listans sammanfattning.
- **Beslut (förslag): `aria-label` för "Byt" är "Byt lager för listan".** Knappens synliga text är bara "Byt" (EXPERIENCE.md), som är otydlig för en skärmläsare utan raden bredvid.
- **Beslut (förslag): ett tryck på valt ställe stänger arket utan anrop.** Det är ofarligt och ger ingen bekräftelse, eftersom inget har ändrats.
- **Beslut (förslag): "Allt finns hemma." står kvar med ett ställe.** Med flera ställen blir det "Allt finns i lagret för Stugan.", också för Hemma ("Allt finns i lagret för Hemma."), så att texten fungerar med alla namn utan böjning (Voice and Tone).
- **Risk: bockar på täckta poster.** En bock på en post som blir täckt finns kvar i `shopping_check` tills matsedeln byts. Den syns inte och räknas inte i "N varor kvar", och den hamnar inte i "Lägg i lagret", eftersom servern räknar om listan mot listans ställe (8.3). Den kommer tillbaka om stället byts tillbaka, vilket AC:n kräver.
- **Risk: valet gäller hela appen.** När Pontus har räknat listan mot Stugan visar Hemma, Recept och Matsedel också Stugan tills Pontus väljer Hemma igen. Raden "Lager: Stugan" påminner (8.3). Om det blir ett problem i praktiken gäller öppna frågor 6 och 7, och AD-24 tillåter ett eget ställe för listan utan ombyggnad.
- Loggar innehåller bara felkoder, aldrig ställenas namn eller listans poster.

## Spec Change Log

### Vid bygget

- **Besluten (förslag) godkändes som de står,** utom ett tryck på valt ställe, som ändrades efter granskningen (se nedan). Ingen migration.
- **Arket stänger i en transition efter svaret.** `setSheetOpen(false)` och bekräftelsen görs i `startTransition` (från `react`), medan bytets egen transition fortfarande pågår. React lägger då ihop dem med routerns transition för den revaliderade sidan, så att arket stänger samtidigt som den omräknade listan visas. Ett andra anrop till samma `useTransition` inifrån den asynkrona funktionen blev aldrig klart i testmiljön, så det används inte. Vad som sparas hålls i ett eget tillstånd (`savingId`), inte i transitionens `isPending`, så att arket aldrig låses av en transition som inte blir klar.
- **Raderna i arket är vanliga knappar i en lista,** inte radioknappar som Boundaries säger (efter granskningen). Ett val sparar och stänger arket, så radioknappssemantik med piltangenter blev fel. Valt ställe har `aria-current="true"` och bocken, och alla rader ligger i den vanliga tabbordningen. Arkets knapp i rubriken heter "Avbryt", eftersom den stänger utan att ändra något.
- **Ett tryck på valt ställe sparar också** (efter granskningen), i stället för att bara stänga arket som matrisen och beslutet säger. Sidan kan vara inaktuell efter ett byte på en annan enhet, och `selectPantrySite` gör samma sak två gånger utan skada. Bekräftelsen säger då "Listan räknas nu mot Hemma.".
- **Raden ligger under rubriken med `-mt-4 mb-4`.** `ShoppingList` drar upp sin sammanfattning med `-mt-4`, så raden lägger tillbaka samma avstånd under sig. Då ligger knappens tryckyta på 44 px aldrig under sammanfattningen. "Byt" har storleken för textknappar, inte `{typography.meta}`, eftersom `cx` inte slår ihop klasser.
- **"Byt" väntar på hydreringen** (`useHydrated`), som pillren i Hemma, och på det listan sparar (efter granskningen).
- **`ShoppingListView` i `src/app/(app)/lista/`** (efter granskningen) är en klientkomponent som sidan renderar. Den sätter ihop `ListSiteLine` (`pantry/ui`) och `ShoppingList` (`shopping/ui`), som fortfarande aldrig importerar varandra (AD-24). Genom den får `ShoppingList` två saker utöver `site`, vilket Boundaries inte nämner:
  - `onBusyChange`, så att "Byt" väntar medan "Lägg i lagret" eller en bock sparas;
  - `isQuietSwitch`, så att listan bara tiger om ett byte som gjordes i arket.
- **`ShoppingListContent` läser ställena med `listPantrySites()` bredvid `getShoppingList()`** med `Promise.allSettled`. Listan hanteras först, också omdirigeringen vid `unauthorized`. Ett fel när ställena läses ger aldrig ett fel på sidan, bara ingen rad. Ett `PantryDataError` loggas inte en gång till, eftersom `getShoppingList` redan loggar det som `pantry_unavailable`, men andra fel loggas som `pantry_sites_unavailable` med bara felets namn.
- **Raden och arket visar samma ställe:** listans ställe, med antalet ställen från `sites`. När listan saknar ställe men ställena gick att läsa, visas valt ställe ur `sites`, så att listan kan bytas bort från ett ställe vars lager inte går att läsa. Om listan och ställena inte stämmer överens läses sidan om, en gång.
- **Ett borttaget ställe:** med tre eller fler ställen står arket kvar med "Stället finns inte längre. Välj ett annat ställe.", och det borttagna stället försvinner ur arket när sidan har lästs om. Med bara ett ställe kvar försvinner raden och arket. Meddelandet kommer då som kort bekräftelse (`role="alert"`), och fokus går till sidrubriken.
- **E2E:**
  - "Dolda varor" prövas med ketchup, som är täckt på Hemma och dold. Mot Stugan saknas den, men den står kvar som dold ("Dolda varor (1)").
  - Specen seedar också butiken Maxi ICA Stormarknad Östersund för "Skicka till ICA". Bockar, överstyrningar och egna varor läggs in med service role.

## Review Triage Log

Iteration 1. Tre granskare gick igenom 0d022e8. Ingen migration.

**Patch:**
- **Arket följer raden:** när raden försvinner, för att stället inte går att läsa eller för att bara ett ställe är kvar efter en omläsning, stängs arket och dess meddelande glöms. Arket öppnas aldrig igen av sig självt. Försvann raden för att det valda stället var borttaget, kommer meddelandet som kort bekräftelse, och fokus går till sidrubriken, aldrig till `<body>`.
- **Svar som inte kommer:**
  - Kastar anropet, eller kommer inget svar inom 20 sekunder (`selectTimeoutMs`), läses sidan om. Visar den då det tryckta stället har valet sparats: meddelandet glöms, arket stänger och bekräftelsen visas. Annars visas `pantry_site_failed`.
  - Läses sidan inte om inom 10 sekunder (`refreshWaitMs`) visas felet ändå, så att arket aldrig blir låst och "Avbryt" fungerar igen.
- **Listan gömd under sparandet:** ett fel kommer då som kort bekräftelse (`role="alert"`). En lyckad växling bekräftas inte på en annan sida.
- **Alltid spara:** ett tryck på det ställe som visas som valt anropar också `selectPantrySite`, eftersom sidan kan vara inaktuell.
- **Vanliga knappar:** raderna är knappar i en lista, med `aria-current="true"` och bocken på valt ställe, och utan egen hantering av piltangenter. Raden som sparas visar "Sparar …", och alla rader väntar. En spärr som sätts direkt vid trycket gör att ett andra tryck eller Enter inte ger ett andra anrop.
- **"Byt" väntar på "Lägg i lagret"** och på bockar som sparas (`ShoppingListView`, `onBusyChange`).
- **Läsningen av ställena stoppar aldrig listan:** `Promise.allSettled`, med listan först. Varje fel ger ingen rad, och oväntade fel loggas. Raden visar valt ställe ur `sites` när listan saknar ställe.
- **Annonseringen:** listan tiger bara om ett byte som gjordes i arket (`isQuietSwitch`, en gång per byte). Ett byte någon annanstans, alltså på en annan enhet, i Hemma eller efter ett borttaget ställe, annonseras som "Listan räknas nu mot Hemma. 2 varor kvar." (`siteRecountedText`).
- **`unauthorized`:** arket stängs innan sidan läses om.
- **Nya tester:**
  - ett kontraktstest att `revalidateFor("pantry_site")` revaliderar `/lista`;
  - `ListSiteLine`:
    - svar som går förlorade;
    - tidsgränserna;
    - borttaget ställe med två och tre ställen;
    - dubbeltryck och Enter;
    - gömd lista;
    - raden som försvinner och kommer tillbaka;
    - listan och ställena som inte stämmer överens;
  - `ShoppingListView`: ett byte från arket annonseras en gång, ett byte någon annanstans annonseras, och "Byt" väntar på en bock;
  - e2e:
    - ett ställe som tas bort med service role medan arket är öppet;
    - senap avbockad mot Hemma, sedan byte till Stugan och "Lägg i lagret", med exakt vad som hamnar i Stugans lager.
- **E2E-specen:** bekräftelserna hittas på sin text (`filter({ hasText })`), och en tidigare bekräftelse får försvinna före nästa byte. Den tomma annonseringen läses direkt efter bekräftelsen, utan nya försök.

**Avvisat:**
- Kopplingen mellan radens `-mt-4 mb-4` och sammanfattningens `-mt-4` i `ShoppingList`. Den är kosmetisk och täcks av e2e-kontrollen att sidan inte scrollar i sidled.

**Kvar som känd begränsning:**
- Om en ändring från en annan enhet, till exempel en rättad mängd, råkar komma i samma rendering som ett byte från arket, annonseras den inte. Listan räknas då om mot ett annat lager, och det går inte att skilja ändringarna åt. Tystnaden gäller bara den rendering där stället byts.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raden "Lager: Stugan · Byt" radbryts utan vågrät scroll, också med ett namn på 40 tecken, och arket "Räkna listan mot" får plats med tio ställen.
- Med VoiceOver: "Byt lager för listan" går att nå, arket läses som en grupp av radioknappar med valt ställe markerat, och efter ett byte läses bara "Listan räknas nu mot Stugan." upp.
- Flöde 6 i sin helhet på telefonen: lägg tre rätter på matsedeln, byt till Stugan under Lista, bocka av, tryck "Lägg i lagret" och se varorna i stugans kyl i Hemma. Välj sedan Hemma igen. Ketchup och senap ska hamna rätt. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
