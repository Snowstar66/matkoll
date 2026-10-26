---
title: 'Story 6.2: Bekräfta, rätta eller avvisa lagerförslag'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Bildanalysen gissar ibland fel, till exempel en annan vara, fel mängd eller något som inte är mat. Om förslagen hamnade i lagret direkt skulle lagret fyllas med felgissningar, och lagningsstatus och inköpslistan skulle bli fel. Pontus vill granska varje förslag och bara spara det hen har godkänt.

**Approach:** Varje kort i sektionen "Lagerförslag" från 6.1 får knapparna Bekräfta, Rätta och Avvisa, och sektionen får "Bekräfta alla".
- Bekräfta och "Bekräfta alla" anropar Server Actionen `confirmPantrySuggestions` med de valda förslagen. Den validerar med Zod, slår ihop dubbletter, skapar nya katalogingredienser med `commitIngredients` och sätter mängderna exakt med `setPantryItems` (AD-6, AD-19). Sedan revaliderar den Hemma, så att platskortets antal uppdateras.
- Rätta öppnar arket Lagervara förifyllt med förslaget. Arkets "Bekräfta" sparar det rättade förslaget med samma action.
- Avvisa tar bort förslaget ur klientens tillstånd, med "Ångra". Inget skrivs och ingen katalogingrediens skapas.

## Boundaries & Constraints

**Always:**
- Inget lagerförslag blir lagervara utan ett tryck på Bekräfta, "Bekräfta alla" eller arkets "Bekräfta" (FR-25). Varje tryck sparar direkt.
- `confirmPantrySuggestions` (AD-2):
  - är en Server Action (`"use server"`) som börjar med `requireUser()`;
  - validerar hela indata med `confirmSuggestionsSchema` och litar inte på något från klienten;
  - anropar `commitIngredients` och sedan `setPantryItems` och därefter `revalidateFor("pantry_item")`.
- Katalogen skrivs bara av `catalog` (AD-6):
  - nya ingredienser skapas med `commitIngredients` först här;
  - befintliga id skickas som `{ kind: "match", confidence: "exact" }`, så att `commitIngredients` kontrollerar att de finns i användarens katalog (`unknown_ingredient`) utan att spara synonymer.
- Lagret skrivs bara med `setPantryItems` (AD-19): mängden sätts exakt för ingrediens, plats och enhet, och raden skapas vid behov. `set_pantry_items` tar `pantry_lock()` och tillämpar regeln att en ingrediens på en plats antingen är obegränsad eller har mängder. Allt eller inget för lagret.
- Avvisade förslag skickas aldrig till servern. Inga katalogingredienser, synonymer eller lagerrader skapas för dem (AD-6, FR-25).
- Arket Lagervara är samma ark som "+" och en tryckning på en lagervara använder. Ark staplas aldrig.
- Fel (AD-13) visas i en blå `Notice` överst i sektionen "Lagerförslag". Förslagen står kvar efter ett fel.
- Alla tester och CI använder `AI_PROVIDER=mock`, aldrig en riktig modell. E2E-specen har den egna e2e-användaren `e2e-lagerforslag@matkoll.test`.
- Ingen migration väntas, eftersom `set_pantry_items` och `commit_ingredients` redan finns. Om en ändå behövs skapas den med `supabase migration new` och typerna genereras om. Kör aldrig `supabase db reset`.

**Never:**
- Ingen synonym sparas från ett lagerförslag, inte heller när Pontus väljer en annan ingrediens i Rätta.
- `addToPantry` används inte. Ett bekräftat förslag sätter mängden och ökar den inte.
- Inga förslag sparas på servern, i `localStorage`, `sessionStorage` eller i adressen.
- Ingen fråga i förväg vid Avvisa, eftersom den går att ångra.
- Ingen AI anropas vid bekräftelse.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Förslag visas | Sex förslag från kylen | Varje kort har namn, mängd och "Kyl" och knapparna Bekräfta (primär), Rätta och Avvisa (textknappar), med skärmläsarnamnen "Bekräfta mjölk", "Rätta mjölk" och "Avvisa mjölk". "Bekräfta alla" (sekundär) ligger under rubriken | N/A |
| Bekräfta befintlig vara | "mjölk 1 förp", och Kyl har "mjölk 2 förp" | Raden blir "mjölk 1 förp". Kortet försvinner, och "mjölk är sparad i kylen." visas. Kyl har samma antal | N/A |
| Bekräfta ny vara | "ägg 6 st" (Ny) | Katalogingrediensen "ägg" skapas med Kyl som standardplats, och raden "ägg 6 st" skapas. Kortet Kyl räknar en vara till | N/A |
| Bekräfta obegränsad | "ketchup" med "Finns hemma" | Etiketten "ketchup" under "Finns hemma" i kylen | N/A |
| Bekräfta alla | Fyra förslag kvar | Ett anrop med alla fyra. "Lagt 4 varor i lagret." Sektionen försvinner, fokus går till kameraknappen, och platskortet visar det nya antalet | N/A |
| Rätta | "Rätta grädde" | Arket Lagervara öppnas med den nya ingrediensen "grädde", mängden "1", enheten förp och platsen Kyl. Foten har "Bekräfta" (primär) och "Avvisa" (text) | N/A |
| Rätta och bekräfta | Pontus byter till den nya ingrediensen "matlagningsgrädde", 2 dl, och trycker "Bekräfta" | Raden "matlagningsgrädde 2 dl". Ingen katalogingrediens "grädde" och ingen synonym skapas. Arket stängs, kortet försvinner, och "matlagningsgrädde är sparad i kylen." visas | `validation` vid fältet, som i arket i dag |
| Rätta till annan plats | Pontus väljer Frys i arket | Raden hamnar i frysen, och kortet Frys räknar en vara till | N/A |
| Stäng arket oförändrat | Esc eller "Avbryt" utan ändringar | Arket stängs, och förslaget står kvar oförändrat | N/A |
| Stäng arket ändrat | Ändrad mängd, och arket stängs | "Släng ändringarna?". "Släng" behåller förslaget som det var | N/A |
| Avvisa | "Avvisa ketchup" på kortet eller i arket | Kortet försvinner, och "ketchup är avvisad." visas med "Ångra" i 5 s. Inget anrop till servern | N/A |
| Ångra | "Ångra" efter Avvisa | Förslaget kommer tillbaka på sin plats i listan | N/A |
| Fokus | Efter Bekräfta eller Avvisa på ett kort | Fokus går till nästa korts Bekräfta, annars föregående korts, annars kameraknappen | N/A |
| Sparar | Medan ett anrop pågår | Alla knappar för förslag är inaktiva, och det berörda kortet visar "Sparar …" | N/A |
| Samma vara två gånger | "Bekräfta alla" med två förslag som Pontus rättat till samma ingrediens, plats och enhet | Ett förslag med summerad mängd sätts, under 1 000 000 | N/A |
| Obegränsad och mängd | Två förslag för samma ingrediens och plats, ett utan mängd | Det med mängd sparas | N/A |
| Sparfel i lagret | `set_pantry_items` nekar | "Det gick inte att lägga förslagen i lagret. Försök igen." Förslagen står kvar. Nya katalogingredienser kan finnas kvar, och ett nytt försök återanvänder dem | `pantry_confirm_failed` (loggas med orsak) |
| Sparfel i katalogen | `commitIngredients` kastar `CatalogDataError`, också `unknown_ingredient` | Samma text. Lagret ändras inte | `pantry_confirm_failed` |
| Förfalskad indata | Tom lista, fler än 40, okänd enhet eller plats, negativ mängd, mängd utan enhet eller ett id som inte är ett uuid | Inget skrivs | `validation` |
| Okänt id | Ett uuid som inte finns i användarens katalog | Inget skrivs i lagret | `pantry_confirm_failed` (`unknown_ingredient` loggas) |
| Utloggad | Sessionen har gått ut | Sidan laddas om och skickar till inloggning | `unauthorized` |
| Lagret går inte att läsa efter sparning | Hemma visar `pantry_unavailable` | Förslagen som är kvar och kameraknappen visas under `Notice` | N/A |
| Sista förslaget | Det sista kortet bekräftas eller avvisas | Sektionen försvinner, och fokus går till kameraknappen. "Ångra" efter Avvisa visar sektionen igen | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-6-context.md`, `spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md` -- förslagens form (`PantrySuggestion`), providern och sektionen
- `src/features/pantry/domain/pantry-suggestion.ts` (+ test, från 6.1) -- `pantrySuggestionSchema`, texthjälpare. Nytt `confirmSuggestionsSchema`, `mergeConfirmations`, `confirmItemFromSuggestion`, `confirmItemFromForm`
- `src/features/pantry/domain/pantry-item-form.ts` -- `pantryItemFormSchema`, `pantryItemSetSchema`, `collapseName`, `maxPantryAmount`, `maxIngredientNameLength`, `formFieldErrors`
- `src/features/pantry/domain/places.ts` (+ test) -- `savedItemText`, `definite`. Nya `confirmedItemsText` och `rejectedItemText`
- `src/features/pantry/actions/set-pantry-item.ts` (+ test) -- mönster: `requireUser`, `commitIngredients`, `setPantryItemsIn`, felhantering och `revalidateFor`
- `src/features/pantry/data/set.ts`, `supabase/migrations/20261026010657_pantry_lock.sql` -- `set_pantry_items`, `pantry_lock()` och regeln om antingen obegränsad eller mängd
- `src/features/catalog/server.ts` (`commitIngredients`, `CatalogDataError`), `src/features/catalog/data/commit.ts` -- `unknown_ingredient` och reglerna för synonymer
- `src/features/pantry/ui/pantry-item-sheet.tsx` (+ test) -- `PantrySheetTarget`, `initialValues`, `choose`, `toInput`, foten, `PantrySheetProvider`, `usePantrySheet`
- `src/features/pantry/ui/pantry-suggestions.tsx`, `pantry-suggestion-list.tsx`, `pantry-camera.tsx` (från 6.1) -- providern, sektionen och kameraknappen
- `src/features/pantry/ui/pantry-removal.tsx` -- mönster för kort bekräftelse med "Ångra" och fokus efter borttagning
- `src/components/toast.tsx` (`useToast`), `button.tsx`, `notice.tsx`, `sheet.tsx`
- `src/lib/errors.ts`, `src/lib/revalidate.ts` (`pantry_item`)
- `src/app/(app)/hemma/page.tsx`, `home-content.tsx` -- providerordningen
- `tests/e2e/pantry-camera.spec.ts` (6.1), `pantry.spec.ts`, `support.ts`, `global-setup.ts` -- e2e-mönster och seedning med service role

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/pantry/domain/pantry-suggestion.ts` (+ test), `index.ts` -- domänen för bekräftelse:
  - `confirmSuggestionsSchema` är en lista med 1–40 poster. Varje post har:
    - `ingredient`: `{ kind: "existing", ingredientId: uuid }` eller `{ kind: "new", name, section, location, defaultUnit }`, där `name` går genom `collapseName`, inte får normaliseras till tom text och har högst 100 tecken;
    - `location`, `amount` (positivt och under `maxPantryAmount`, eller `null`) och `unit` (`unitSchema` eller `null`), där mängd och enhet är båda `null` eller båda satta.
  - `mergeConfirmations(items)` är ren:
    - poster grupperas på ingrediens (id eller normaliserat nytt namn) och plats;
    - om gruppen har någon post med mängd tas posterna utan mängd bort;
    - samma enhet summeras och kapas till 999 999,999;
    - en ny ingrediens behåller den första postens avdelning och standardenhet.
  - `confirmItemFromSuggestion(suggestion)` och `confirmItemFromForm(form: PantryItemForm)` ger en post. En ny ingrediens i formuläret får formulärets plats som standardplats.

  Testerna täcker gränser, sammanslagning, att obegränsad och mängd inte blandas och att posterna behåller sin ordning
  -- AD-6, AD-12, AD-19
- [ ] `src/features/pantry/domain/places.ts` (+ test) -- `confirmedItemsText(n)` ("Lagt 1 vara i lagret." eller "Lagt 4 varor i lagret.") och `rejectedItemText(name)` ("ketchup är avvisad.") -- EXPERIENCE.md, Kort bekräftelse
- [ ] `src/lib/errors.ts` -- ny kod `pantry_confirm_failed` med texten "Det gick inte att lägga förslagen i lagret. Försök igen." -- AD-13
- [ ] `src/features/pantry/actions/confirm-pantry-suggestions.ts` (+ test) -- `confirmPantrySuggestions(items)` är en Server Action (`"use server"`). Den gör i tur och ordning:
  1. `requireUser`;
  2. `confirmSuggestionsSchema.safeParse` (`validation`);
  3. `mergeConfirmations`;
  4. `commitIngredients` med en post per sammanslagen post: ny som `{ text: name, ingredient: { kind: "new", proposal } }` och befintlig som `{ text: "", ingredient: { kind: "match", ingredientId, confidence: "exact" } }`;
  5. `setPantryItems` med id:na i samma ordning;
  6. `revalidateFor("pantry_item")`.

  Den returnerar `Result<{ count }>`. `CatalogDataError` och `PantryDataError` loggas med orsak och ger `pantry_confirm_failed`, och andra fel kastas. Testerna täcker:
  - utloggad, ogiltig indata och tom lista;
  - att bara de skickade posterna når `commitIngredients`, så att ett avvisat förslag aldrig gör det;
  - att ingen post skickas som `chosen`, så att inga synonymer skapas;
  - `unknown_ingredient`, att lagret inte skrivs när katalogen fallerar och sparfel i lagret;
  - sammanslagning före anropen;
  - att revalidering bara sker efter lyckad sparning.

  -- FR-25, AD-1, AD-2, AD-6, AD-19
- [ ] `src/features/pantry/ui/pantry-suggestions.tsx` (+ test) -- providern får:
  - `confirm(ids)`, som anropar `confirmPantrySuggestions` med `confirmItemFromSuggestion`, tar bort förslagen vid `ok` och visar `savedItemText` för ett förslag eller `confirmedItemsText` för flera;
  - `confirmCorrected(id, form)` för arket;
  - `reject(id)`, som tar bort förslaget lokalt och visar `rejectedItemText` med "Ångra", som sätter tillbaka förslaget på sitt index;
  - `saving` och `error`.

  Ett anrop i taget. `unauthorized` ger `router.refresh()`
  -- FR-25
- [ ] `src/features/pantry/ui/pantry-suggestion-list.tsx` (+ test) -- varje kort får en rad med knappar som får radbrytas: Bekräfta (`Button` primary), Rätta och Avvisa (`Button` text), med `aria-label` "Bekräfta <namn>", "Rätta <namn>" och "Avvisa <namn>". Under rubriken finns "Bekräfta alla" (secondary). En `Notice` med `role="alert"` för `error` står överst i sektionen. Knapparna är inaktiva medan `saving` gäller, och det berörda kortet visar "Sparar …". Efter Bekräfta eller Avvisa går fokus till nästa korts Bekräfta, annars föregående korts, annars kameraknappen (via ref från `PantryCamera`). Efter "Bekräfta alla" går fokus till kameraknappen -- UX-DR11
- [ ] `src/features/pantry/ui/pantry-item-sheet.tsx` (+ test) -- arket får målet `PantrySheetTarget` `{ kind: "suggestion"; suggestion: PantrySuggestion }`.
  - `initialValues` fyller i ingrediensen (befintlig med namn, eller ny med namn och avdelning), mängden med decimalkomma, enheten och platsen.
  - `choose` ändrar inte platsen för ett förslag, på samma sätt som för en befintlig vara.
  - Foten har "Bekräfta" (primär, "Sparar …" under anropet) och "Avvisa" (text, utan fråga).
  - När formuläret skickas valideras det med `pantryItemFormSchema` och sparas med `confirmCorrected`. Vid `ok` stängs arket och kortet tas bort, och `savedItemText` visas. Vid fel stannar arket med `Notice`.
  - `usePantrySheet` får `openSuggestion(suggestion)`. `PantrySheetProvider` ligger inuti `PantrySuggestionsProvider` och får `confirmCorrected` och `reject` därifrån.

  -- FR-25, EXPERIENCE.md, Lagerförslag
- [ ] `src/app/(app)/hemma/page.tsx`, `home-content.tsx` (+ test) -- providerordningen `PantrySuggestionsProvider` › `PantrySheetProvider` (från 6.1) behålls. Felvägen visar förslagen med knappar
- [ ] `tests/e2e/pantry-suggestions.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-lagerforslag@matkoll.test`, med `AI_PROVIDER=mock` och fixturen `kyl.png` från 6.1. Med service role seedar testet katalogingredienserna "mjölk" (Mejeri, Kyl, förp) och "smör" och lagervarorna "mjölk 2 förp" och "smör" (obegränsad) i Kyl. Det kontrollerar:
  - sex kort med namn, mängd, "Kyl" och Bekräfta, Rätta och Avvisa, samt "Bekräfta alla";
  - Bekräfta mjölk, som ger raden "mjölk 1 förp", bekräftelsen och att Kyl fortfarande visar "2 varor";
  - Rätta grädde, som ger arket förifyllt med "1", förp och Kyl, där Pontus väljer den nya ingrediensen "matlagningsgrädde" med 2 dl och trycker "Bekräfta", vilket ger raden "matlagningsgrädde 2 dl" och "3 varor";
  - Avvisa ketchup, sedan "Ångra", så att kortet är tillbaka, och sedan Avvisa igen;
  - "Bekräfta alla", som ger "Lagt 3 varor i lagret.", att sektionen försvinner, "5 varor" i kortet Kyl och att smör står kvar under "Finns hemma";
  - med service role: ingen katalogingrediens "ketchup" eller "grädde", ingen lagerrad för dem och inga rader i `ingredient_synonym` för användaren.

  -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): varje tryck sparar direkt.** Bekräfta, "Bekräfta alla" och arkets "Bekräfta" anropar `confirmPantrySuggestions` på en gång, och det finns ingen separat knapp för att spara. AC:ns "När Pontus sparar" läses som varje sådant tryck. Det passar Flöde 3, där Pontus står framför den öppna kylen, och det ger färre steg (SM-C2). Det motsvarar också arket Lagervara, där "Lägg till vara" sparar. Alternativ: markera först och spara allt med en knapp, vilket ger ett steg till och en risk att markeringarna försvinner om Pontus lämnar sidan.
- **Beslut (förslag): ett bekräftat förslag sätter mängden exakt** (`setPantryItems`, AD-19) för ingrediens, plats och enhet. Ett foto visar vad som finns nu, så det är en inventering och inget tillskott. Raden "I kylen nu: 2 förp" från 6.1 visar vad som skrivs över. Om en annan enhet finns på platsen för samma vara står den kvar som en egen rad, eftersom enheter aldrig räknas om (AD-7). Pontus kan rätta det i arket. Alternativ: `addToPantry`, som ökar och skulle dubbelräkna varje gång kylen fotograferas igen.
- **Beslut (förslag): inga synonymer från lagerförslag.** `label` är AI:ns gissning om vad som syns, inte text som Pontus har skrivit. Om "grädde" sparades som synonym till "matlagningsgrädde" när Pontus rättar skulle receptrader med "grädde" kopplas fel framöver. Befintliga id skickas därför som `match` till `commitIngredients`, som ändå kontrollerar att de finns i katalogen. Alternativ: spara rättelsen som synonym, som förhandsgranskningen av recept gör (AD-6).
- **Beslut (förslag): Rätta sparar via `confirmPantrySuggestions`,** inte via `savePantryItem`. AC kräver att rättade förslag går samma väg, och då gäller samma regel om synonymer och samma felkod. Arket använder ändå samma formulär och samma validering (`pantryItemFormSchema`).
- **Beslut (förslag): dubbletter slås ihop på servern** per ingrediens, plats och enhet, med summerad mängd. Om en post i gruppen har mängd vinner den över en post utan mängd. Annars skulle `set_pantry_items` i samma anrop låta den senare posten ta bort den förra, på grund av regeln om antingen obegränsad eller mängd.
- **Beslut (förslag): ny felkod `pantry_confirm_failed`,** med texten "Det gick inte att lägga förslagen i lagret. Försök igen.". `pantry_save_failed` talar om en vara, och här kan det gälla flera. Katalogen och lagret är skilda moduler (AD-1), så nya katalogingredienser kan finnas kvar efter ett sparfel i lagret. Ett nytt försök återanvänder dem, eftersom `commit_ingredients` har `on conflict` (som i `savePantryItem`).
- **Beslut (förslag): Avvisa går att ångra i 5 s,** med "ketchup är avvisad." och "Ångra" (EXPERIENCE.md: borttagningar kan ångras i den korta bekräftelsen). En ny avvisning ersätter bekräftelsen, och "Ångra" gäller bara den senaste. Förslaget sätts tillbaka på sitt index i listan som den ser ut nu.
- **Beslut (förslag): flera primärknappar.** DESIGN.md anger Bekräfta som primär på varje kort, vilket går emot "högst en primärknapp per vy". Komponentbeskrivningen gäller. "Bekräfta alla" är därför sekundär, så att den inte konkurrerar med korten. Alternativ: Bekräfta som sekundär och "Bekräfta alla" som den enda primärknappen.
- **Beslut (förslag): "Bekräfta alla" visas så länge det finns förslag,** också när bara ett är kvar, så att knappen inte flyttar sig. Den skickar alla förslag som inte har avvisats.
- **Beslut (förslag): ett anrop i taget.** Alla knappar för förslag är inaktiva medan en bekräftelse sparas, så att ett dubbeltryck inte sparar samma förslag två gånger och så att Avvisa inte krockar med ett anrop som pågår. Att sätta samma mängd två gånger ger ändå samma resultat.
- **Beslut (förslag): arket för ett förslag har "Bekräfta" och "Avvisa"** i stället för "Lägg till vara" och "Ta bort", så att samma ord används på kortet och i arket. Arkets titel är fortfarande "Lagervara".
- Platskortens antal uppdateras genom `revalidateFor("pantry_item")`, som också räknar om lagningsstatus i biblioteket, matsedeln och inköpslistan (AD-18). Det kort som räknar de visade varorna (`PantryPlace`) följer med.
- Loggning sker bara med felkod och orsak, aldrig med varunamn eller mängder.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Flöde 3 på riktig iPhone mot LM Studio: fotografera kylen, bekräfta några, rätta ett och avvisa ett. Kortet Kyl ska visa rätt antal, och obegränsade varor ska stå kvar som "Finns hemma". Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
- VoiceOver: "Bekräfta mjölk", "Rätta mjölk" och "Avvisa mjölk" går att nå, och bekräftelserna läses upp.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: korten och deras tre knappar radbryts utan vågrät scroll, och tryckytorna är minst 44 × 44 px.
