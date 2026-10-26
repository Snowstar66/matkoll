# Matkoll – PRD-addendum

Tekniska val och underlag som hör till arkitektur och UX snarare än till PRD:n. Källor: `docs/brief.md` och `docs/autonomi.md`.

## Teknik (från brief och arbetsregler)

| Område | Val |
| --- | --- |
| Ramverk | Next.js (App Router), TypeScript strikt läge, pnpm |
| Styling | Tailwind CSS med tokens från `docs/ux/ux-spec.md`, inget tungt komponentbibliotek |
| Databas och inloggning | Supabase (Postgres, Auth med engångslänk, RLS). Lokal Supabase via CLI under utveckling |
| Drift | Vercel, efter att Epic 1–3 fungerar lokalt |
| AI-klient | Vercel AI SDK bakom ett eget gränssnitt: `parseRecipe`, `analyzeImage`, `suggestDishes`. Leverantör via miljövariabel: `lmstudio`, `anthropic`, `openai`, `mock` |
| Testmodell | Qwen3.6-35B-A3B i LM Studio, `http://localhost:1234` lokalt, Cloudflare Tunnel + Access när appen körs på Vercel |
| Validering | Zod för alla AI-svar och formulär, med nytt försök vid ogiltigt AI-svar |
| Promptar | Samlade på ett ställe, separat från koden |
| Tester | Vitest för logik, Playwright för huvudflödena, RLS-tester mot lokal Supabase |
| CI | GitHub Actions: lint, typkontroll, tester, hemlighetsskanning, RLS-tester |

## Datamodell (utgångspunkt)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| ingredient | Normaliserat namn, synonymer, butiksavdelning, plats, standardenhet, ev. vikt per dl/st | – |
| recipe | Titel, käll-URL, originalportioner, steg, bild-URL, favorit, tid | – |
| recipe_ingredient | Originaltext, mängd, enhet, vag, ev. stegkoppling | recipe, ingredient |
| pantry_item | Mängd (null = obegränsad), enhet, plats | ingredient |
| meal_plan | Namn eller period | – |
| meal_plan_recipe | Valt antal portioner | meal_plan, recipe |
| shopping_list_item | Beräknad mängd, enhet, avbockad, egen vara, ursprung | meal_plan, ingredient |
| recipe_site | Domän, aktiv | – |
| store | Namn, kedja, butiks-id, URL, vald | – |
| product_choice | Produktnamn, förpackningsstorlek, länk | ingredient, store |

Alla tabeller har `user_id` och RLS.

## Ingrediensmatchning

Största risken enligt briefen. Utgångspunkt:
1. Exakt träff på normaliserat namn eller synonym i katalogen.
2. Annars föreslår AI-tjänsten en befintlig katalogingrediens eller en ny (namn, avdelning, plats, standardenhet), som syns i förhandsgranskningen.
3. Pontus rättning sparas som synonym, så att samma originaltext matchar rätt nästa gång.

## Varukorgsexport – formatskiss

```
Matkoll – inköpslista för Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733)
https://handla.ica.se/...

Mejeri
- Grädde, 3 dl – önskad produkt: Arla Matlagningsgrädde 15 % 5 dl
- Smör, 1 st

Frukt och grönt
- Gul lök, 2 st
...

Instruktion: lägg varorna i varukorgen. Välj närmast större förpackning när mängden inte matchar.
Rapportera varor du är osäker på i en separat lista. Beställ inte.
```

Exakt format bestäms i arkitekturen och dokumenteras så att Claude in Chrome kan följa det.

## Version 1.1: Flera ställen

Beslutad av Pontus 2026-10-26 (`docs/beslutslogg.md`, "Ordning för tilläggen efter 1.0"). Underlag: `docs/backlog-efter-1-0.md`, punkt 1, och kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-flera-stallen.md`. Byggs som Epic 8. Kraven i `prd.md` gäller som förut, med de avgränsningar som står nedan.

### Mål

Pontus har lager på mer än ett ställe, till exempel hemma och i vinterstugan. Matkoll ska komma ihåg vad som finns i stugans kyl, frys och skafferi, så att Pontus handlar rätt inför resan dit och varken köper dubbelt (två ketchup) eller saknar något (senap).

**Användarresa UJ-6. Pontus ska till stugan.** På fredagen lägger Pontus helgens rätter på matsedeln och byter till Stugan under Lista. Listan räknas nu mot stugans lager. Ketchup finns i stugan och kommer inte med, men senapen är slut och står på listan. Pontus handlar på vägen. I stugan trycker hen "Lägg i lagret", och varorna hamnar i stugans kyl och skafferi. På söndagen väljer hen Hemma igen. **Kantfall:** Pontus vill veta om det finns kaffe i stugan medan hen är hemma. Hen väljer Stugan i Hemma, ser skafferiet och väljer Hemma igen.

### Ordlista (tillägg)

- **Ställe:** ett ställe där Pontus har ett lager, till exempel Hemma eller Stugan. Varje ställe har platserna Kyl, Frys och Skafferi. Det första stället heter Hemma, och befintligt lager ligger där.
- **Valt ställe:** det ställe som gäller just nu, alltid exakt ett. Det sparas på servern och gäller på alla Pontus enheter.
- **Lager** betyder i 1.1 lagret på ett ställe. Lagret summeras aldrig över ställen.

### Nya krav

#### FR-29: Hantera ställen

Pontus kan lägga till ställen, byta namn på dem och ta bort ett ställe som är tomt.

**Konsekvenser (testbara):**
- Befintligt lager ligger efter uppdateringen på stället "Hemma", som är valt. Inga lagervaror försvinner eller ändras.
- Ett namn har 1–40 tecken och är unikt per användare, utan hänsyn till stora och små bokstäver. Det får finnas högst 10 ställen.
- Ett ställe kan tas bort bara om det inte har några lagervaror och inte är valt. Det sista stället kan aldrig tas bort.
- Varje ställe har samma tre platser (Kyl, Frys, Skafferi), och samma regler för lagervaror som i 1.0 (FR-11, AD-19).

#### FR-30: Välja ställe

Pontus kan välja vilket ställe som gäller, med ett tryck i Hemma.

**Konsekvenser (testbara):**
- Valt ställe styr Hemma, lagningsstatusen och "X av Y hemma" (FR-8, FR-13, FR-20), rangordningen och AI-förslagen (FR-22, FR-23), inköpslistans avdrag (FR-15), "Lägg i lagret" (FR-19) och bildanalysen (FR-24, FR-25).
- Valet sparas på servern direkt och gäller på alla enheter tills Pontus väljer ett annat ställe. Matkoll byter aldrig ställe på egen hand.
- När det finns fler än ett ställe syns valt ställe i Hemma, inköpslistan, matsedeln, receptvyn och receptbiblioteket med filtret "Kan lagas nu".

#### FR-31: Se ett ställes lager på distans

Pontus kan se lagret på vilket ställe som helst, var hen än är.

**Konsekvenser (testbara):**
- Att välja ett ställe i Hemma visar dess platser och lagervaror. Matkoll använder aldrig enhetens position.
- Lagervaror på ett ställe kan läggas till, ändras och tas bort på distans, på samma sätt som på plats (FR-11).

#### FR-32: Inköpslistan räknas mot valt ställe

Inköpslistan drar av lagret på valt ställe. Det syns vilket ställe det är, och stället går att byta direkt från listan.

**Konsekvenser (testbara):**
- Med Stugan vald och ketchup bara hemma kommer ketchup med på listan. Med senap i stugan kommer senap inte med.
- När det finns fler än ett ställe visar listan "Lager: Stugan" och knappen "Byt". Bytet är detsamma som att välja ställe i Hemma (FR-30).
- Avbockningar, rättade mängder, dolda poster och egna varor står kvar när stället byts (FR-18). En post som blir täckt försvinner från listan, men dess bock finns kvar och syns igen om posten kommer tillbaka.
- "Lägg i lagret" lägger varorna på det ställe som listan räknades mot. Bekräftelsen nämner stället när det finns fler än ett.
- Varukorgsexporten (FR-26) innehåller de poster som listan har för valt ställe. Formatet ändras inte.

#### FR-33: Skrivningar hamnar på det ställe som visades

Det Pontus sparar hamnar på det ställe som vyn visade när hen tryckte, även om stället har bytts på en annan enhet under tiden.

**Konsekvenser (testbara):**
- Arket Lagervara, borttagning med "Ångra", bekräftade lagerförslag, inventering, "Töm kylen" med "Ångra" och "Lägg i lagret" skickar med ställets id från vyn.
- "Ångra" sätter alltid tillbaka på det ställe som varorna togs bort från.
- Ett ställe som har tagits bort ger ett begripligt fel och ingen skrivning.

#### NFR-9: Migrering och svarstider för ställen

- Uppdateringen till 1.1 är en migration som bara lägger till. Den fungerar med 1.0-koden under driftsättningen (AD-5), och ett integrationstest visar att lagret har samma rader och mängder före och efter.
- Byte av ställe och visning av ett annat ställes lager svarar inom en sekund, som lagret i övrigt (NFR-7).

### Ändrade konsekvenser för befintliga krav

| Krav | I 1.1 |
| --- | --- |
| FR-8, FR-13, FR-20 | Lagningsstatus, "Saknar N varor" och "X av Y hemma" räknas mot valt ställe. |
| FR-11 | En lagervara hör till ett ställe och en plats. Arket Lagervara sparar på det ställe Hemma visar. Att flytta en vara till ett annat ställe ingår inte. |
| FR-12 | Platskorten och listan gäller valt ställe. |
| FR-15 | Avdraget görs mot valt ställe. |
| FR-19 | Varorna läggs på katalogingrediensens plats på det ställe som listan räknades mot. |
| FR-22, FR-23 | Rangordningen och AI-förslagen utgår från valt ställe. |
| FR-24, FR-25 | Fotot gäller en plats på valt ställe. Lagerförslag, inventering (6.4) och tömning (6.3) sparas på det stället. |

### Effektmål

SM-1 (mindre matsvinn, inga dubbelköp) gäller också i stugan. Nytt motmått: **SM-C3 Automatik i valet av ställe:** Matkoll gissar aldrig var Pontus är (ingen position och inget schema). Det skulle ge fel lager utan att det syns.

### Utanför 1.1

- Att flytta eller kopiera lagervaror mellan ställen.
- Att välja ställe automatiskt efter position eller tid.
- Att summera lagret över flera ställen, eller att räkna mot två ställen på en gång.
- En egen matsedel eller inköpslista per ställe. Den aktuella matsedeln är fortfarande en (AD-22).
- Ställen som delas med andra användare.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| pantry_site | Namn, normaliserat namn (unikt), vald (högst ett per användare) | – |
| pantry_item | Får `site_id` (inte null) | pantry_site |

Detaljerna står i arkitekturens AD-24.

## Tillägg till 1.1: Senaste fotot per plats (Epic 10)

Beslutat av Pontus 2026-10-26: Pontus ville att det analyserade fotot sparas, "då får vi enklare att se om den tolkat rätt", och valde "Båda" av två alternativ: en snabbfix direkt, där fotot visas ovanför förslagen bara i webbläsaren (klar, AD-15 gällde), och en story efter Epic 8 där det senaste fotot av varje plats sparas privat och kan visas senare. Underlag: `docs/backlog-efter-1-0.md`, avsnittet "Spara senaste fotot per plats", och kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-spara-foto.md`. Byggs som Epic 10, efter Epic 8 och före Epic 9. Kraven i `prd.md` och i avsnittet om 1.1 gäller som förut, med de ändringar som står nedan.

FR-34–FR-36, NFR-10, SM-C4 och UJ-7 är reserverade för Epic 9 (veckans erbjudanden), som vilar på grenen `epic/9-erbjudanden`. Därför börjar numren här på FR-37, NFR-11, SM-C5 och UJ-8.

### Mål

Pontus kan i efterhand se fotot som lagret uppdaterades från, med AI:ns avläsning och numren på fotot, och avgöra om bilden tolkades rätt. Fotot är privat, och bara det senaste fotot av varje plats sparas.

**Användarresa UJ-8. Vad läste den egentligen?** Ett par dagar senare ser Pontus "cappuccino" i kylen under Hemma, fast det inte finns någon. Under kameraknappen står "Senaste foto av kylen: 24 okt 15:42" och "Visa". Pontus trycker "Visa" och ser fotot med numren. Nummer 7 sitter på en burk Schysst Käk, och listan under fotot säger "7 cappuccino". Pontus stänger arket och tar bort cappuccinon. **Kantfall:** fotot är äldre än 30 dagar. Då står ingen rad, och fotot är borttaget.

### Ordlista (tillägg)

- **Senaste foto:** det foto av en plats på ett ställe som senast ledde till en ändring i lagret. Det finns högst ett per plats och ställe.
- **Avläsning:** det AI:n läste av på fotot, varorna i den ordning de lästes (Story 6.5). Numren på fotot är varornas nummer i avläsningen (Story 6.6).

### Nya krav

#### FR-37: Spara senaste fotot per plats

När Pontus har sparat något i lagret från ett fotos lagerförslag sparas fotot som senaste foto av den platsen.

**Konsekvenser (testbara):**
- Fotot sparas när den första skrivningen från fotots förslag har lyckats: Bekräfta, Rätta, "Bekräfta alla" eller "Ta bort" i inventeringen. Ett foto vars förslag bara avvisas, eller som inte gav några förslag, sparas inte.
- Det som sparas är samma förminskade bild som AI:n fick, utan EXIF, GPS och annan metadata, med tiden då fotot togs, avläsningen och punkterna för numren, när de har kommit.
- Ett nytt foto av samma plats på samma ställe ersätter det förra. Det finns aldrig mer än ett foto per plats och ställe.
- Fotot sparas på det ställe och den plats som det togs för, också om Pontus har valt ett annat ställe under tiden (FR-33).
- Sparandet sker i bakgrunden. Misslyckas det syns inget fel, och lagret påverkas inte.

#### FR-38: Visa senaste fotot i Hemma

Pontus kan se det senaste fotot av den plats Hemma visar, med numren och avläsningen.

**Konsekvenser (testbara):**
- När platsen har ett sparat foto står "Senaste foto av kylen: idag 15:42" och textknappen "Visa" under kameraknappen i Hemma.
- "Visa" öppnar fotot i samma ark som under granskningen (6.6), med en numrerad markör på varje vara som fick en punkt och en numrerad lista med avläsningen under fotot.
- Fotot visas för det ställe Hemma visar. Väljer Pontus Stugan visas stugans foton.
- Fotot hämtas bara när Pontus trycker "Visa".

#### FR-39: Fotot försvinner när det inte behövs

Ett sparat foto finns inte kvar längre än det behövs.

**Konsekvenser (testbara):**
- Ett foto som är äldre än 30 dagar visas inte och tas bort.
- Pontus kan ta bort fotot i arket, efter en kontrollfråga: "Ta bort fotot av kylen? Det går inte att ångra.".
- När ett ställe tas bort försvinner dess foton. När en användare tas bort försvinner användarens foton.
- "Töm kylen" (6.3) tar inte bort fotot. Nästa foto som sparar något ersätter det.

#### NFR-11: Integritet för platsfoton

- Fotona är privata: bara ägaren kan ladda upp, läsa och ta bort dem, och det visas med RLS-tester. Det finns ingen publik eller signerad länk till ett foto.
- Ett sparat foto har ingen metadata (EXIF, GPS, XMP), visat med ett test.
- Ett sparat foto skickas aldrig till en AI-tjänst igen, oavsett `AI_PROVIDER`.
- Foton finns aldrig i repot, i loggar eller i säkerhetskopian.
- Fotona ryms i Supabase gratisnivå (1 GB lagring): högst tre foton per ställe och högst 1,5 MB per foto, alltså högst 45 MB med tio ställen.

### Ändrade konsekvenser för befintliga krav

| Krav | Med Epic 10 |
| --- | --- |
| FR-24 | Fotot sparas inte vid analysen. Det sparas först när något från förslagen har sparats i lagret (FR-37). |
| FR-25 | Den första bekräftelsen, rättningen eller borttagningen från ett foto sparar också fotot. Avvisade förslag sparar inget foto. |
| FR-29 | Ett ställe som tas bort tar med sig sina foton. Ett ställe som bara har foton och inga lagervaror räknas som tomt. |

### Effektmål

SM-1 och SM-C2 gäller som förut. Fotot gör det lättare att lita på bildanalysen, så att Pontus använder den. Nytt motmått: **SM-C5 Fotoarkiv:** Matkoll sparar aldrig mer än det senaste fotot per plats, och aldrig längre än 30 dagar. Fler foton skulle ge mer att skydda men ingen bättre kontroll av tolkningen.

### Utanför Epic 10

- En historik med flera foton per plats.
- Att analysera ett sparat foto igen, eller att be om nya nummer på det.
- Att visa ett annat ställes foto utan att välja stället (jämför öppen fråga 6).
- Foton av kokbokssidor (Story 1.9) och, i Epic 9, av reklamblad: de sparas fortfarande aldrig.
- Att dela ett foto eller ladda ner det från appen.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| pantry_photo | Plats, sökväg till filen, bildtyp och storlek, när fotot togs, avläsning och punkter; ett per plats och ställe | pantry_site |

Filen ligger i den privata Storage-bucketen `pantry-photo`. Detaljerna står i arkitekturens AD-26.

## Tillägg till 1.1: Nytt utseende (Epic 11)

Beslutat av Pontus 2026-10-26: Pontus bad om "betydligt trevligare ux. Som ser proffsigare ut." och godkände tre skisser: Lagersaldo ("ja mycket snyggare enl din skiss"), Inköpslista ("inköpslistan börjar bli mkt bättre") och hela appen i mobilen ("ja nu börjar du verkligen hitta ux som app. bravo. håll den stilen"). Skisserna ligger i `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/`. Underlag: kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-nytt-utseende.md`. Byggs som Epic 11, efter Epic 10 och före Epic 9. Kraven i `prd.md` och i de tidigare avsnitten gäller som förut, med de ändringar som står nedan.

Numren fortsätter efter Epic 10 (FR-39, NFR-11, UJ-8). FR-34–FR-36, NFR-10 och UJ-7 är reserverade för Epic 9.

### Mål

Matkoll ser ut och känns som en välgjord app i mobilen. Varorna står i kategorier med ikon, lagret visar det Pontus har nytta av i stället för mängder, en vara tas bort med ett tryck och kan ångras, inköpslistan visar hur långt Pontus har kommit, och appen kan läggas på hemskärmen och öppnas i helskärm.

**Användarresa UJ-9. Lördagshandling med appen.** Pontus lägger Matkoll på hemskärmen och loggar in i appen med koden från mejlet. I Lagersaldo står kylens varor under Mejeri & ägg och Kött, fisk & chark, med "Arla laktosfri" under mjölken och "Tillagd för 6 dagar sedan" under gräddfilen. Pontus tar bort gräddfilen med soptunnan. I butiken bockar Pontus av, och varje vara flyttar till "I korgen" medan mätaren växer. **Kantfall:** fel vara togs bort. Pontus trycker "Ångra", och varan är tillbaka med samma rad under.

### Ordlista (tillägg)

- **Kategori:** en av nio grupper som varor visas i: Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck och Övrigt. Kategorin räknas fram ur katalogingrediensens avdelning och namn. Den sparas inte, och avdelningen är oförändrad.
- **Märke:** det som står på förpackningen, till exempel "Arla laktosfri". Valfritt på en lagervara.
- **I korgen:** de avbockade posterna i inköpslistan.

### Nya krav

#### FR-40: Kategorier med ikon

Lagervaror och listposter visas i kategorier med en ikon.

**Konsekvenser (testbara):**
- Varje vara hamnar i exakt en kategori. Frukt och grönt, Bröd, Mejeri, Frys, Dryck och Övrigt blir sina kategorier, Kött och fisk och Chark blir Kött, fisk & chark, och Skafferi blir Skafferi utom de varor vars namn är en sås eller smaksättare, som blir Såser & smaksättare.
- Kategorierna står i butikens ordning: Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt. Kategorier utan varor visas inte.
- Varje kategori har en rubrik med ikon och antal. Ikonen betyder ingenting för skärmläsare, och namnet står alltid som text.
- Exporten till ICA (FR-26) och katalogens avdelningar är oförändrade.

#### FR-41: Lagersaldo utan mängder

Pontus ser lagret per plats utan mängder, kan ta bort en vara med ett tryck och söka i platsen.

**Konsekvenser (testbara):**
- Varje lagervara är en rad under sin kategori, med namnet och en rad under: märket om det finns, annars när varan lades till ("Tillagd idag", "Tillagd igår", "Tillagd för 4 dagar sedan", "Tillagd 24 okt"). Ingen mängd visas i listan. Obegränsade varor är rader som de andra.
- Mängderna sparas och ändras som förut i arket Lagervara och används av lagningsstatusen, inköpslistan och "Kan lagas nu".
- Varje rad har en soptunna. Ett tryck tar bort varan utan kontrollfråga och visar "Tog bort Gräddfil." med "Ångra" i 5 s. "Ångra" sätter tillbaka varan med samma id, plats, mängd, märke och tid.
- Ett sökfält överst filtrerar platsens varor på namn och märke.

#### FR-42: Märke och tid på lagervaran

En lagervara har ett valfritt märke och vet när den lades till.

**Konsekvenser (testbara):**
- När Pontus bekräftar eller rättar ett lagerförslag från ett foto sparas förslagets första etikett (6.5) som märke, avkortad till 60 tecken.
- Arket Lagervara har fältet "Märke eller sort". Ett tomt fält tar bort märket.
- "Tillagd" är tiden då raden skapades. En ändrad mängd ändrar den inte. En vara som byter enhet eller plats behåller sin tid.
- "Ångra" efter en borttagning, tömning eller inventering sätter tillbaka märket och tiden.
- Märket är text från Pontus eller modellen och visas bara som text.

#### FR-43: Inköpslistan i butiken

Pontus ser hur långt handlingen har kommit, och det som redan ligger i korgen flyttas undan.

**Konsekvenser (testbara):**
- Överst står "8 varor kvar" och "6 av 14 i korgen" med en mätare. Dolda poster räknas inte.
- En avbockad post flyttas direkt till "I korgen" längst ned, som är hopfälld ("6 varor i korgen" med "Visa"). En bock där tar tillbaka posten. Bocken sparas direkt som förut (FR-16).
- Under en post står rätterna den kommer från, "Egen vara", eller för en vag post "Saknas i lagret" (med flera ställen "Saknas i Stugan").
- Ett produktval (FR-27) visas som en etikett på raden.
- Mängden står kvar på listposten, eftersom den behövs i butiken.
- "Skicka till ICA" och "Lägg i lagret" ligger fast längst ned.

#### FR-44: Matkoll på hemskärmen

Pontus kan lägga Matkoll på hemskärmen och öppna appen i helskärm.

**Konsekvenser (testbara):**
- Appen har ett webbappmanifest med namnet Matkoll, `display: standalone`, startsidan Recept, appens bakgrundsfärg som temafärg och appikoner (192 och 512 px, och en Apple-ikon på 180 px).
- Öppnad från hemskärmen på iPhone visas Matkoll utan webbläsarens fält, med appens bakgrund bakom statusraden.
- Mejlet med engångslänken har också en sexsiffrig kod, och inloggningssidan tar emot koden. Samma tillåtelselista gäller, och svaret är detsamma oavsett adress.
- Varje sida under en flik har en synlig tillbakaknapp.
- Manifestet och ikonerna nås utan inloggning. Inget annat gör det.

#### NFR-12: Utseendet håller tillgänglighetsgolvet

- Varje vy i Epic 11 fungerar vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text utan vågrät scroll, med VoiceOver och med tangentbord.
- Tryckytor är minst 44 × 44 px, också soptunnan, bockarna och hjärtat på bilden.
- Ikoner, plattor och mätare förmedlar aldrig något som inte också står i text.
- Inget rött, inga skuggor och inga gradienter i gränssnittet (`DESIGN.md`).

### Ändrade konsekvenser för befintliga krav

| Krav | Med Epic 11 |
| --- | --- |
| FR-1 | Inloggning med engångslänk eller med koden i samma mejl. |
| FR-12 | Varje lagervara är en rad under sin kategori, utan mängd. Under namnet står märket eller när varan lades till (FR-41, FR-42). Obegränsade varor visas inte längre som etiketter under "Finns hemma". |
| FR-13 | Varje matsedelsrätt visar "X av Y hemma" och en mätare i stället för statusetiketten. Portionsväljaren står kvar. |
| FR-16 | Listposter grupperas per kategori i butikens ordning i stället för per avdelning, och visar rätterna utan "från". En avbockad post flyttas till "I korgen". |

### Effektmål

Inga nya. SM-2 (inköpslistan på under 10 minuter) och SM-3 (hela veckan i appen) gynnas av en lista som är lättare att använda i butiken och en app som ligger på hemskärmen. SM-C1 gäller som förut: mängderna finns kvar i bakgrunden men visas inte i lagret.

### Utanför Epic 11

- En native app i App Store, offline, push-aviseringar och en service worker.
- En egen avdelning för såser i katalogen (öppen fråga 14).
- Märke från produktvalet vid "Lägg i lagret".
- Att sortera om kategorier, egna kategorier och en egen ikon per vara.
- Källan ("från fotot") under en lagervara och en "Ny"-etikett.
- Antal varor på knappen "Visa inköpslistan" i Matsedel.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| pantry_item | Får `label` (märke eller sort, valfri, 1–60 tecken). `created_at` behålls vid ändrad mängd, byte av enhet eller plats och "Ångra". | – |
| pantry_removal | `removed_rows` tar också med `label` och `created_at` | – |

Kategorierna sparas inte. Detaljerna står i arkitekturens AD-12, AD-19, AD-20 och AD-27.
