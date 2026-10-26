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

## Tillägg till 1.1: Snabbare och asynkron AI (Epic 12)

Beslutat av Pontus 2026-10-26: "Vi borde få till prestandan i qwen kommandona om det går. Kanske göra dem asynkrona om det går, och att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara. Om det inte riskerar ngt." Pontus godkände planen ("ja planera det så"): först fart, mätt före och efter, sedan AI-anrop som körs i bakgrunden. Underlag: kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-asynkron-ai.md`. Byggs som Epic 12, efter Epic 11 och före Epic 9. Kraven i `prd.md` och i de tidigare avsnitten gäller som förut, med de ändringar som står nedan.

Numren fortsätter efter Epic 11 (FR-44, NFR-12, UJ-9). FR-34–FR-36, NFR-10 och UJ-7 är reserverade för Epic 9.

### Mål

AI-flödena går fortare, och de låser inte appen. Pontus startar en bildanalys, ett AI-förslag eller en receptimport och kan fortsätta i appen medan AI:n arbetar. Resultaten kommer när de är klara, ett jobb i taget, och inget sparas utan att Pontus bekräftar.

**Användarresa UJ-10. Kylen, frysen och ett recept på en gång.** Lördag förmiddag fotograferar Pontus kylen i Lagersaldo. "Tittar på bilden … Du kan göra annat under tiden." Pontus väljer Frys och fotograferar frysen. Jobbraden säger "AI: Tittar på fotot av kylen · 1 i kö". Pontus går till Recept och klistrar in en länk från koket.se. "2 i kö". Efter en halv minut säger en kort bekräftelse "14 förslag från fotot av kylen är klara." med "Visa", och Lagersaldo får märket 1. Pontus läser klart receptet först, går sedan till Lagersaldo och bekräftar förslagen. Frysens förslag och receptet kommer efter varandra. **Kantfall:** Pontus fotograferar kylen igen innan det första fotot är klart. Det första jobbet ersätts och visas aldrig.

### Ordlista (tillägg)

- **AI-jobb:** en bildanalys, ett AI-förslag eller en receptimport som körs i bakgrunden. Ett jobb är i kö, pågår, är klart, gick inte, är avbrutet eller är ersatt.
- **Kö:** de AI-jobb som väntar på sin tur. Matkoll kör ett jobb i taget.
- **Inaktuellt resultat:** ett resultat som gäller något som har ändrats sedan jobbet startade, till exempel ett annat valt ställe.

### Nya krav

#### FR-45: Snabbare AI, mätt före och efter

AI-flödena går fortare, och varje förbättring är mätt före och efter mot LM Studio på Pontus Mac.

**Konsekvenser (testbara):**
- Utvärderingen (`pnpm eval:ai`) mäter varje flöde med kall och varm modell och skriver tiderna i en rapport. Mätningen finns i `docs/lm-studio.md`, med rekommenderade inställningar för LM Studio (samtidiga anrop, kontext, TTL och spekulativ avkodning).
- När Pontus öppnar Lagersaldo eller Recept väcks modellen i bakgrunden, högst en gång per fem minuter, och aldrig medan ett AI-jobb pågår. Väckningen finns bara kvar om mätningen visar att det första anropet blir minst 20 % snabbare.
- AI-förslagen ber om ett kortare svar. Målet är minst 25 % färre token och högst 40 s i median med varm modell, med lika bra förslag i utvärderingen.

#### FR-46: AI-jobb i bakgrunden

Pontus kan starta en bildanalys, ett AI-förslag eller en receptimport och fortsätta använda appen medan AI:n arbetar.

**Konsekvenser (testbara):**
- Att starta ett jobb svarar inom en sekund. Det som går att kontrollera utan AI (indata, stället, ett tomt lager, en länk som inte är godkänd) ger fel direkt, innan jobbet startar.
- Pontus kan byta sida, stänga arket och ladda om appen utan att jobbet stoppas. Efter en omladdning visas jobben och resultaten igen.
- Resultatet sparas privat tills Pontus har stängt eller sparat det, och högst 24 timmar.
- Pontus kan avbryta ett jobb i kö eller ett som pågår.

#### FR-47: Kön

AI-jobben körs ett i taget, i den ordning de startades.

**Konsekvenser (testbara):**
- Pontus kan ha högst tre aktiva jobb: ett som pågår och två i kö. Ett fjärde ger "Det finns redan tre AI-jobb. Vänta tills ett är klart."
- När något jobb är aktivt visar en jobbrad på alla sidor vad som pågår och hur många som står i kö ("AI: Tittar på fotot av kylen · 2 i kö"). Ett tryck visar alla jobb.
- Kön gäller alla flikar och enheter där Pontus är inloggad.
- Ett jobb som inte hinner börja inom sin tidsgräns, eller vars körning har avbrutits av servern, visas som avbrutet med "Försök igen" och stoppar aldrig kön.
- Ett dubbeltryck eller ett nytt försök efter ett nätfel ger aldrig två jobb. Ett nytt AI-förslag när ett redan pågår visar det som pågår.

#### FR-48: Besked när ett resultat är klart

Pontus får veta när ett resultat är klart, också på en annan sida.

**Konsekvenser (testbara):**
- En kort bekräftelse säger vad som är klart, med "Visa": "3 rättförslag är klara.", "14 förslag från fotot av kylen är klara.", "Receptet Krämig kycklinggryta är inläst." Ett jobb som inte gick säger det: "Det gick inte att läsa receptet."
- Fliken där resultatet visas (Recept för förslag och import, Lagersaldo för bildanalys) får ett märke med antalet klara resultat som Pontus inte har sett. Märket försvinner när resultatet har visats, på alla enheter.
- Är Pontus redan på sidan där resultatet visas, visas resultatet direkt utan kort bekräftelse.

#### FR-49: Inaktuella resultat

Ett resultat som har blivit inaktuellt sparas aldrig utan att Pontus ser det.

**Konsekvenser (testbara):**
- Inget från AI sparas automatiskt. Pontus bekräftar lagerförslag och sparar recept som förut.
- Ett nytt foto av samma plats på samma ställe ersätter ett äldre som är i kö eller pågår. Det äldre visas aldrig och ger ingen bekräftelse.
- Förslag från ett foto gäller det ställe som fotot togs för, också om Pontus har valt ett annat ställe (FR-33), och visas med "Förslagen gäller Stugan.".
- AI-förslag som togs fram för ett annat ställe än det valda visas med "Förslagen bygger på lagret för Hemma." och "Föreslå igen".
- Jämförelsen med platsens varor ("Nytt", "Ändrat", "Syns inte längre") görs mot lagret som det är när Pontus öppnar resultatet.

#### FR-50: Första rätten direkt

AI-förslagen visas en rätt i taget, så snart varje rätt är klar.

**Konsekvenser (testbara):**
- Den första rätten syns innan de andra är klara, med "Letar efter fler …" under.
- En rätt som inte håller (fel schema, en titel som ska undvikas, för få varor från lagret) visas aldrig. Minst en giltig rätt räcker för ett klart jobb.
- Kravet gäller bara om LM Studio kan strömma ett svar med JSON-schema (prövas först). Annars visas alla rätter på en gång.

#### NFR-13: Integritet och tålighet för AI-jobb

- Jobben är privata: bara ägaren kan läsa, starta, avbryta och ta bort dem, och det visas med RLS-tester.
- Ett foto eller en inklistrad recepttext sparas aldrig i ett jobb, på disk eller i loggar. Fotot finns bara i serverns minne medan jobbet väntar och körs. Loggar har bara felkoder, sorter, antal och jobbets id.
- Jobbens rader tas aldrig med i säkerhetskopian.
- Ett jobb vars server dör stoppar aldrig kön längre än jobbets tidsgräns (högst fem minuter).
- Två serverinstanser kör aldrig två jobb för samma användare samtidigt.

### Ändrade konsekvenser för befintliga krav

| Krav | Med Epic 12 |
| --- | --- |
| NFR-7 | Receptimport, bildanalys och AI-förslag körs som AI-jobb. Att starta ett jobb svarar inom en sekund, och resten av appen går att använda medan det körs. Förloppet syns i jobbraden, och jobbet går att avbryta där eller i flödet. |
| FR-3, FR-4 | Inläsningen fortsätter när arket stängs. Pontus kan läsa in flera recept efter varandra, och förhandsgranskningen öppnas med "Visa". |
| FR-23 | Förslagen kommer en rätt i taget (FR-50) och kan tas fram medan Pontus gör annat. |
| FR-24 | Analysen fortsätter när Pontus lämnar Lagersaldo, och flera platser kan fotograferas efter varandra. Numren på fotot (6.6) är en del av samma jobb. |

### Effektmål

Inga nya. SM-2 (inköpslistan på under 10 minuter) och SM-3 (hela veckan i appen) gynnas av att AI-flödena inte låser appen. SM-C2 gäller som förut: AI-resultat kräver fortfarande Pontus bekräftelse.

### Utanför Epic 12

- Pushaviseringar och besked när appen är stängd (kräver en service worker, AD-27).
- En annan modell, en annan dator eller en molnleverantör för AI (öppen fråga 3).
- Jobb som lever längre än en servers tak (Vercel Workflows, en extern kö) och jobb som körs vidare utan förfrågan.
- Flera samtidiga jobb mot modellen.
- Att spara ett jobbs indata, till exempel för att köra om det senare.
- Strömning av bildanalysen och importen.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| ai_job | Sort, läge, nyckel mot dubbla jobb, sammanhang (ställe och plats, källa), resultat eller felkod, tider (skapad, startad, klar, sista tid och sett) | – |

Indata sparas aldrig. Detaljerna står i arkitekturens AD-28.

## Version 1.2: Veckans erbjudanden (Epic 9)

Beslutat av Pontus 2026-10-26: "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." Pontus valde sedan funktionerna som använder erbjudandena och godkände rekommendationen i stort. Underlag: kursändringen `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden-v2.md`, som ersätter den första planen, och förstudien `docs/erbjudanden-lankar.md`. Byggs som Epic 9, efter Epic 12. Kraven i `prd.md` och i de tidigare avsnitten gäller som förut, med de ändringar som står nedan.

Epic 9 behåller de nummer som var reserverade (FR-34–FR-36, NFR-10, UJ-7). De nya kraven fortsätter efter Epic 12: FR-51–FR-54.

### Mål

Matkoll vet vad som är på erbjudande i Pontus butik den här veckan, utan att Pontus skriver av något, och använder det där det gör nytta: på inköpslistan, i Recept, för att fylla på lagret, i AI-förslagen och i ett förslag till veckans matsedel. För ICA hämtas erbjudandena från butikens egen sida med ett tryck. För andra kedjor klistrar Pontus in texten eller fotograferar reklambladet.

**Användarresa UJ-7. Pontus planerar veckan efter erbjudandena.**

1. På söndagen öppnar Pontus Inköpslistan, trycker "Erbjudanden" och sedan "Hämta veckans erbjudanden".
2. Efter några sekunder står 91 erbjudanden från Maxi ICA Stormarknad Östersund i kategorier. Överst under "Fyll på lagret" står kaffe: "49 kr · Finns i Hemma, inte i Stugan". Pontus trycker "Lägg på listan", eftersom resan till stugan är nästa helg.
3. I Matsedel trycker Pontus "Föreslå veckans matsedel" och går till Recept under tiden.
4. Förslaget kommer: fem rätter, tre ur biblioteket och två nya, med etiketter som "Falukorv 29 kr". Pontus lägger tre på matsedeln och sparar en av de nya.
5. I Inköpslistan står "Falukorv 29 kr" under falukorven.

**Kantfall:** ica.se svarar inte eller har ändrat sidan. Matkoll säger det, gör inget nytt försök och erbjuder "Öppna sidan" och "Klistra in text".

### Ordlista (tillägg)

- **Erbjudande:** en vara som en butik säljer till ett särskilt pris under en vecka. Det har namnet som butiken skrev det, varan i grundform och priset och villkoren som text ("2 för 119 kr", "Stammis", "Max 1 köp/hushåll"). Ett erbjudande kopplas till en katalogingrediens när det går, annars bara till varans namn.
- **Veckans erbjudanden:** de erbjudanden som gäller för vald butik och en vecka (måndag–söndag, svensk tid). Det är den senaste vecka som har lagts in och som inte är slut.
- **Länk till erbjudanden:** adressen till butikens erbjudandesida, sparad per butik i Inställningar. I 1.2 bara ica.se.
- **Basvara:** en vara som finns i lagret på något ställe, eller som har ett produktval i butiken.
- **Erbjudandeetikett:** den lilla etiketten "Falukorv 29 kr" på en listpost, ett receptkort eller ett AI-förslag.

### Nya krav

#### FR-34: Lägga in veckans erbjudanden

Pontus kan spara en länk till butikens erbjudandesida och hämta veckans erbjudanden med ett tryck. Utan länk kan Pontus klistra in text eller fotografera reklambladet.

**Konsekvenser (testbara):**
- Länken sparas per butik i Inställningar. I 1.2 godkänns bara erbjudandesidor på ica.se (`/erbjudanden/<butik>-<id>/`), och för andra kedjor visas ingen länk.
- "Hämta veckans erbjudanden" hämtar sidan en gång per tryck. Bara mat sparas, för butiken och veckan. Matkoll hämtar aldrig av sig själv.
- En ny hämtning för samma vecka ersätter de förra hämtade erbjudandena, och erbjudanden från text eller foto står kvar.
- Om butiken nekar, inte svarar eller har ändrat sidan sparas inget, och Matkoll säger det med "Öppna sidan" utan att försöka igen.
- Text och foto läses av AI-tjänsten i ett AI-jobb. Pontus granskar listan och tar bort det som inte ska med, och inget sparas förrän Pontus trycker "Spara". Flera inläsningar för samma vecka läggs ihop.
- Erbjudanden skapar aldrig nya katalogingredienser.

#### FR-35: Se och ta bort veckans erbjudanden

Pontus kan se de erbjudanden som gäller för vald butik och vecka, ta bort ett och ta bort alla.

**Konsekvenser (testbara):**
- Erbjudandena står i kategorier som i Lagersaldo, med pris och villkor som butiken skrev dem.
- En borttagning kan ångras i den korta bekräftelsen. Ett borttaget erbjudande från länken kommer tillbaka vid nästa hämtning.
- Erbjudanden för en vecka som är slut, eller vars sista dag har passerat, används aldrig.

#### FR-36: AI-förslag med veckans erbjudanden

AI-förslagen (FR-23) prioriterar rätter som använder varor på erbjudande i vald butik den här veckan.

**Konsekvenser (testbara):**
- Utan erbjudanden är AI-förslagen som förut.
- Med erbjudanden får AI-tjänsten varornas namn bredvid lagret, aldrig priser. Ett förslag som använder varor på erbjudande har erbjudandeetiketter.
- Förslagen utgår fortfarande från lagret på valt ställe, med minst två varor hemma per förslag.
- Om erbjudandena inte går att läsa visas förslagen ändå, utan erbjudanden.

#### FR-51: Erbjudanden på inköpslistan

En listpost vars vara är på erbjudande i vald butik den här veckan får en erbjudandeetikett.

**Konsekvenser (testbara):**
- Etiketten säger vara och pris ("Falukorv 29 kr") och läses "På erbjudande: Falukorv 29 kr" av skärmläsaren.
- Listpostdetaljen visar alla erbjudanden på varan.
- Listans poster, mängder, ordning och bockar och varukorgsexporten är oförändrade.

#### FR-52: Filtret Erbjudanden i Recept

Pontus kan se de recept som använder veckans erbjudanden.

**Konsekvenser (testbara):**
- Filtret "Erbjudanden" visar recept där minst en huvudvara är på erbjudande. Kryddor, såser och vaga rader räknas inte.
- Recepten står med flest erbjudanden först och sedan minst saknat, och korten har erbjudandeetiketter.
- De andra filtren, lagningsstatusen och rangordningen är oförändrade.

#### FR-53: Fyll på lagret

Pontus ser när basvaror är på erbjudande och var de finns.

**Konsekvenser (testbara):**
- Avsnittet "Fyll på lagret" visar erbjudanden på basvaror, med var varan finns och saknas ("Finns i Hemma, inte i Stugan").
- "Lägg på listan" lägger varan som egen vara på inköpslistan, en gång också vid dubbeltryck.
- Lagret summeras aldrig över ställen.

#### FR-54: Förslag till veckans matsedel

Pontus kan be om ett förslag till veckans matsedel utifrån erbjudandena och lagret.

**Konsekvenser (testbara):**
- Förslaget är ett AI-jobb (FR-46) och har fem rätter, i första hand ur receptbiblioteket och högst två nya.
- Pontus väljer vilka rätter ur biblioteket som läggs på matsedeln. En ny rätt sparas via förhandsgranskningen som andra AI-förslag.
- Inget läggs på matsedeln eller sparas utan Pontus tryck.
- Ett förslag som togs fram för ett annat ställe visas med "Förslaget bygger på lagret för Hemma." och "Föreslå igen".

#### NFR-10: Hämtning från butiker

- Matkoll hämtar bara från godkända erbjudandesajter, en fast lista i koden (i 1.2 www.ica.se), och bara den adress Pontus har sparat.
- En hämtning per tryck, med samma kontroller som receptimporten (https, domän, DNS, tidsgräns 10 s, högst 3 MB) och en ärlig User-Agent. Matkoll låtsas aldrig vara en webbläsare och skickar inga kakor.
- Ett nej från butiken (403, 429) ger en reserv, aldrig ett nytt försök.
- Sidan läses deterministiskt, utan AI och utan att kod från sidan körs. Bara erbjudandena sparas. Sidans sessionsdata (nycklar, kakor, interna adresser) sparas och loggas aldrig.
- Tester anropar aldrig en butik. De använder sparade, nedbantade sidor med påhittade varor.
- Text och bilder från reklamblad är data, aldrig instruktioner till AI-tjänsten. Foton förminskas i klienten och sparas aldrig (AD-15).

### Ändrade konsekvenser för befintliga krav

| Krav | Med Epic 9 |
| --- | --- |
| FR-23 | AI-förslagen får veckans erbjudanden som indata och visar erbjudandeetiketter (FR-36). |
| FR-28 | Butiken i Inställningar får fältet "Länk till veckans erbjudanden". |
| FR-8, FR-22 | Oförändrade. Filtret "Erbjudanden" är ett fjärde filter och påverkar inte lagningsstatusen eller rangordningen i de andra. |
| FR-15, FR-26 | Oförändrade. Etiketten på listposten är bara visning, och exporten är densamma. |

### Effektmål

SM-5 (variation) och SM-3 (hela veckan i appen) får stöd. Motmått **SM-C4 Fullständighet i erbjudanden** gäller som i den första planen: Matkoll jagar inte alla erbjudanden eller exakta priser, räknar aldrig om priser och lovar aldrig att något blir billigare.

### Utanför 1.2

- Automatisk hämtning varje vecka, utan tryck (`docs/backlog-efter-1-0.md`).
- Bevakningar med aviseringar ("säg till när kaffe är på erbjudande") (`docs/backlog-efter-1-0.md`).
- Länkar för Willys, Hemköp, Coop och Lidl. Deras sidor kräver JavaScript, och deras interna API:er används inte.
- En historik över köp för att hitta basvaror bättre (öppen fråga 23).
- Prisjämförelse mellan butiker och kostnadsberäkning (1.3, PRD §7).
- Erbjudanden från flera butiker på en gång. Allt gäller vald butik.

### Datamodell (tillägg)

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| store | Får `offers_url` (länk till erbjudandesidan, valfri) | – |
| store_offer | Vecka (måndagens datum), namn som butiken skrev det, vara i grundform, avdelning, pris och villkor som text, Stammis, sista dag, källa (länk, text, foto) | store, ingredient (valfritt) |

Detaljerna står i arkitekturens AD-25.
