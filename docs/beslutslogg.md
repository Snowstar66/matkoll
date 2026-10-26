# Matkoll – beslutslogg

Beslut som fattats under bygget: vad, varför och vilka alternativ som fanns. Nyaste överst.

## 2026-10-26 – Välja butik (Story 7.1)

- **Beslut:**
  - **Flera butiker redan i v1-gränssnittet.** Inställningar → Butik visar den valda butiken som ett kort och de andra under "Andra butiker" med "Välj". En ny butik läggs till utan att den gamla skrivs över. Bara `is_selected` pekar ut den butik som v1 använder (beslutet "Ordning för tilläggen efter 1.0").
  - **Kedjan är en fast lista:** `ICA`, `Willys`, `Coop`, `Lidl`, `Hemköp`, `City Gross` och `Annan` (`STORE_CHAINS`). Listan är `store_chain_check` i databasen och låses mot domänen med ett designtest (`tests/design/settings-checks.test.ts`), som också låser fältens längdgränser.
  - **Standardbutikens kedja är "ICA".** "ICA Handla" är ICA:s webbutik, dit URL:en leder. Kortet visar "ICA · butiks-id 1003733".
  - **Standardbutikens URL är `https://handlaprivatkund.ica.se/stores/1003733` och adressen är tom.** Ingen av dem har kunnat kontrolleras utan att anropa ICA. Pontus kontrollerar dem i sin webbläsare (ny punkt i checklistan i `docs/oppna-fragor.md`).
  - **`ensure_user_defaults()` lägger bara in butiken när användaren saknar butik,** med `on conflict do nothing` utan mål. En standardbutik som Pontus har ändrat kommer alltså aldrig tillbaka, och två samtidiga inloggningar ger en butik. Migrationen lägger in samma butik för befintliga användare.
  - **En ny butik väljs som förval** ("Använd för varukorgen" ikryssad), och rutan kan kryssas ur.
  - **Butiker kan inte tas bort i v1,** eftersom produktvalen (7.2) refererar butiken med `on delete restrict`.
  - **Att byta kedja på en befintlig butik är tillåtet.** Hjälptexten under Kedja i "Ändra butik" säger: "Byter du kedja, lägg hellre till en ny butik, så behåller den här sina produktval."
  - **Butiks-id är valfritt.** Två butiker utan id kolliderar inte, eftersom `null` räknas som olika i den unika nyckeln `(user_id, chain, external_store_id)`.
  - **"Välj" sparas direkt utan fråga** och visar "Maxi ICA Stormarknad Östersund är vald." Kortet byter optimistiskt och går tillbaka med en `Notice` om valet misslyckas.
  - **Sektionen Butik har en egen `<Suspense>` och felväg,** så att ett fel i `store` inte döljer receptsajterna eller "Logga ut".
  - **Tillagt vid bygget:**
    - Namn, butiks-id och adress sparas på en rad: kontrolltecken och radbrytningar blir mellanslag, och flera mellanslag blir ett. Tabellens kontroller nekar kontrolltecken, så att exportens radformat (7.3) aldrig bryts.
    - URL:en sparas som den skrevs, men med `https://` i gemener. Den ska ha ett värdnamn och inga mellanslag (`store_url_check`). Över 2048 tecken ger "Texten får vara högst 2048 tecken.".
    - Ett val av den butik som redan är vald ändrar inget. Att ändra den valda butiken utan "Använd för varukorgen" behåller valet.
    - Efter ett misslyckat val eller sparande läses butikerna om med `router.refresh()`.
    - Formulärets fält saknar `maxLength`, så att "Texten får vara högst N tecken." går att se.
  - **Ändrat efter granskningen** (migrationen `*_settings_store_hardening.sql`):
    - En ny butiks id väljs i klienten (`newStoreId()`, med `crypto.getRandomValues` där `crypto.randomUUID` saknas) och behålls under hela arkets öppning, också när ett fält ändras. `save_store` ändrar raden med samma id, så ett nytt försök efter ett förlorat svar ger aldrig två butiker. Om id:t redan tillhör en annan användare (`23505` på `store_pkey`) försöker actionen en gång till med ett nytt id.
    - `save_store` får ett uttryckligt läge: `add` från "Ny butik" lägger till (eller ändrar användarens butik med samma id), och `change` från "Ändra butik" ändrar bara. En butik som inte finns ger då `P0002`, alltså "Butiken finns inte längre.", och läggs aldrig till igen.
    - `save_store` och `select_store` tar först ett lås per användare (`store_lock()`, `pg_advisory_xact_lock(hashtextextended('store:' || user_id, 0))`). Samtidiga tillägg och val körs alltså efter varandra och krockar aldrig i en unik nyckel, och det sista vinner. Prefixet `store:` skiljer nyckeln från andra modulers lås.
    - Om användaren inte har någon vald butik blir en sparad butik vald, också utan "Använd för varukorgen".
    - `authenticated` har inte längre `delete` på `store`, eftersom butiker inte tas bort i v1. Select, insert och update finns kvar för funktionerna, som körs som anroparen.
    - Den unika nyckeln är ett uttrycksindex på `(user_id, chain, lower(external_store_id))` med samma namn, så "AB12" och "ab12" i samma kedja är samma butik. Butiks-id, namn och adress måste vara trimmade.
    - Tabellens kontroller nekar också U+2028/U+2029 och bidi-tecknen U+202A–U+202E och U+2066–U+2069. `oneLine` tar bort bidi-tecknen och gör radavgränsarna till mellanslag, och ett test visar att det som `oneLine` lämnar går att spara.
    - En okänd kedja i en rad läses som "Annan" och loggas (`settings_store_unknown_chain`), så att en rad aldrig döljer de andra.
    - Varje butik under "Andra butiker" har "Ändra" bredvid "Välj". Arket behåller butiken det öppnades med, så att en omläsning bakom arket aldrig gör "Ändra butik" till "Ny butik", och arket stängs om butiken försvinner.
    - Alla "Välj" är inaktiva medan ett val sparas, och ett svar för en butik som inte längre är det senaste valet ändrar inget. Fokus flyttas till kortets rubrik först när valet har sparats, och inte alls om det misslyckas.
  - **Inte gjort, efter granskningen:** att begränsa migrationens backfill till tillåtna användare. Bara tillåtna användare kan finnas, eftersom registreringen är avstängd och `users:sync` styr `auth.users`.
- **Varför:** FR-28, beslutet "Ordning för tilläggen efter 1.0" (flera butiker och produktval per butik), AD-1 (atomära byten i `settings` egna funktioner), AD-4, AD-18, AD-21 och PRD 6 (Matkoll gör aldrig något i butiken själv; URL:en hämtas aldrig).
- **Alternativ:**
  - En enda redigerbar butik i gränssnittet och flera rader bara i databasen.
  - Kedja som fritext, som är enklare men måste tolkas inför en prisjämförelse.
  - "ICA Handla" som kedja, men då blir kedjan och webbutiken samma sak.
  - Lämna standardbutikens URL tom.
  - `on conflict` på `(chain, external_store_id)` i `ensure_user_defaults()`, som skulle ta tillbaka en ändrad standardbutik.
  - "Ta bort" för en butik som inte är vald och saknar produktval.

## 2026-10-26 – Bekräfta, rätta eller avvisa lagerförslag (Story 6.2)

- **Beslut:**
  - Varje tryck sparar direkt. Bekräfta, "Bekräfta alla" och arkets "Bekräfta" anropar Server Actionen `confirmPantrySuggestions` på en gång, och det finns ingen separat knapp för att spara. Det passar Flöde 3, där Pontus står framför den öppna kylen, och ger färre steg (SM-C2).
  - Ett bekräftat förslag sätter mängden exakt (`setPantryItems`, AD-19) för ingrediens, plats och enhet. Ett foto visar vad som finns nu, så det är en inventering och inget tillskott. Raden "I kylen nu: 2 förp" från 6.1 visar vad som skrivs över. En annan enhet för samma vara på platsen står kvar som en egen rad, eftersom enheter aldrig räknas om (AD-7).
  - Inga synonymer sparas från lagerförslag, inte heller när Pontus väljer en annan ingrediens i Rätta. `label` är AI:ns gissning, inte text som Pontus har skrivit. Befintliga id skickas som `{ kind: "match", confidence: "exact" }` till `commitIngredients`, som kontrollerar att de finns i katalogen (`unknown_ingredient`), och en ny ingrediens skickas med sitt eget namn som text, så att ingen synonym uppstår.
  - Rätta sparar via `confirmPantrySuggestions`, inte via `savePantryItem`, så att samma regel om synonymer och samma felkod gäller. Arket använder samma formulär och samma validering (`pantryItemFormSchema`). En ny ingrediens från arket får formulärets plats som standardplats.
  - Dubbletter slås ihop på servern (`mergeConfirmations`) per ingrediens (id eller normaliserat nytt namn), plats och enhet, med summerad mängd (högst 999 999,999). En post med mängd vinner över en post utan mängd för samma ingrediens och plats, annars skulle `set_pantry_items` låta den senare ta bort den förra. En ny ingrediens behåller den första postens namn, avdelning, standardplats och standardenhet. Schemat tar emot `proposalId` från 6.1 men behöver det inte, eftersom samma normaliserade namn ändå blir en ingrediens.
  - Ny felkod `pantry_confirm_failed`: "Det gick inte att lägga förslagen i lagret. Försök igen." Den loggas med orsak (`catalog_<kod>` eller lagrets felkod), aldrig med namn eller mängder. Nya katalogingredienser kan finnas kvar efter ett sparfel i lagret, och ett nytt försök återanvänder dem (`on conflict` i `commit_ingredients`). Ett anrop utan svar ger samma text i klienten.
  - Avvisa tar bort förslaget ur klientens tillstånd utan fråga och visar "ketchup är avvisad." med "Ångra" i 5 s. En ny bekräftelse ersätter den, och "Ångra" gäller bara den senaste. "Ångra" sätter tillbaka förslaget på sitt index i listan som den ser ut nu och ger dess Bekräfta fokus. Avvisade förslag skickas aldrig till servern.
  - Bekräfta är primär på varje kort (DESIGN.md, Lagerförslag), trots "högst en primärknapp per vy". "Bekräfta alla" är därför sekundär och ligger under rubriken. Den visas så länge det finns förslag, också när bara ett är kvar, och skickar alla som inte har avvisats.
  - Ett anrop i taget. Alla knappar för förslag är inaktiva medan en bekräftelse sparas, och de kort som sparas visar "Sparar …" i stället för "Bekräfta". Spärren är en ref, så att ett dubbeltryck inte hinner skicka två anrop.
  - Arket för ett förslag har "Bekräfta" (primär) och "Avvisa" (text, utan fråga) i stället för "Lägg till vara" och "Ta bort". Titeln är fortfarande "Lagervara", och arket är samma ark som "+" öppnar.
  - **Tillagt vid bygget:**
    - Fel visas i en `Notice` (`role="alert"`) överst i sektionen "Lagerförslag", och fokus går tillbaka till knappen som trycktes. Felet försvinner vid nästa bekräftelse eller avvisning och när nya förslag kommer. I arket stannar felet i arket.
    - Förslagen har en generation som byts när ett nytt svar ersätter dem och när Hemma lämnas. En bekräftelse som svarar efter det, eller ett "Ångra" efter det, ändrar inte de nya förslagen.
    - `confirmCorrected(id, form, onSaved)` tar en tredje parameter: arket stängs i samma uppdatering som kortet försvinner, så att arket först lämnar tillbaka fokus och listan sedan flyttar det till nästa korts Bekräfta.
    - Felets namn i providern är `confirmError`, eftersom `error` redan är analysens fel.
    - Bekräftelsen efter flera förslag räknar förslagen som bekräftades ("Lagt 4 varor i lagret."), efter ett förslag `savedItemText` med förslagets namn och plats.
  - **Ändrat efter granskningen:**
    - Servern slår ihop posterna igen efter `commitIngredients`, på de id:n katalogen gav (`mergePantrySets`). Ett nytt namn som visar sig vara en ingrediens som redan finns i anropet ("gurka") blir alltså en rad med summerad mängd, och regeln om antingen obegränsad eller mängd gäller också då.
    - Arket är bundet till sitt förslag: Rätta sparar förslagens generation i arkets mål. Om ett nyare foto har ersatt förslagen när Pontus trycker "Bekräfta" eller "Avvisa" stängs arket med "Förslaget finns inte längre.", och inget skickas eller tas bort.
    - Dubbeltryck: arket har en egen spärr, och en krock med en annan bekräftelse gör ingenting (inget fel). Arkets knappar är inaktiva medan en bekräftelse sparas. Om Avvisa inte gjorde något står arket kvar.
    - Rätta behåller förvalen: så länge en ny ingrediens har samma namn som i förslaget behåller den förslagets `proposalId`, standardplats och standardenhet, med arkets avdelning. Rätta och sedan Bekräfta skapar alltså samma katalogingrediens som Bekräfta direkt.
    - "Ångra" sätter tillbaka förslaget efter det förslag som låg före, annars före det som låg efter, annars på samma plats. Ett "Ångra" medan en bekräftelse sparas görs när den har svarat. En bekräftelse som svarar efter att nya förslag har kommit tar inget ur listan, visar ingen ruta om förslag som inte längre finns och ger bara den neutrala bekräftelsen "Lagt 1 vara i lagret." (eller fler).
    - Efter en bekräftelse uppdateras raden "I kylen nu" på de förslag som är kvar för samma ingrediens och plats.
    - Varje förslag kontrolleras i klienten mot bekräftelsens schema. Ett förslag som inte klarar det, eller som servern nekar (`validation` med förslagets index i `fields`), får texten "Förslaget går inte att spara som det är. Rätta eller avvisa det." på kortet, och dess Bekräfta är inaktiv. "Bekräfta alla" hoppar över det, så att ett trasigt förslag aldrig stoppar resten.
    - Providern flyttar fokus, inte listan. En flytt som inte kan göras medan listan och kameraknappen är borta (ett annat platskort laddas) görs när de monteras igen, om fokus då inte är någon annanstans.
    - Ett anrop som inte har svarat inom 30 s räknas som misslyckat, så att knapparna fungerar igen. Ett sent svar ändrar inget; att sätta samma mängd igen ger samma resultat.
    - Sparfel i lagret loggas med `reason` (felets meddelande) och `detail`.
  - **Inte gjort, efter granskningen:** att behandla ett foto som en inventering av alla enheter (rader i andra enheter syns redan i "I kylen nu"; en senare idé), och att räkna bekräftelsen efter sammanslagna rader (den räknar de förslag Pontus bekräftade).
- **Varför:** FR-25 (inget sparas utan ett tryck), AD-2 (en väg för ändringar, Zod och `requireUser`), AD-6 (katalogen skrivs bara av `catalog`, och AI:ns text blir aldrig synonym), AD-19 (`set_pantry_items` med `pantry_lock()` och regeln om antingen obegränsad eller mängd) och EXPERIENCE.md (borttagningar ångras i den korta bekräftelsen, ingen fråga i förväg).
- **Alternativ:**
  - Markera förslag och spara allt med en knapp (ett steg till, och markeringarna försvinner om Pontus lämnar sidan).
  - `addToPantry`, som ökar och skulle dubbelräkna varje gång kylen fotograferas igen.
  - Spara rättelsen som synonym, som förhandsgranskningen av recept gör.
  - Rätta via `savePantryItem`.
  - Återanvända `pantry_save_failed`, som talar om en vara.
  - Bekräfta som sekundär och "Bekräfta alla" som den enda primärknappen.
  - En fråga före Avvisa.

## 2026-10-26 – Fotografera en plats och få lagerförslag (Story 6.1)

- **Beslut:**
  - Servern ligger i `pantry` och heter `analyzePlace` (`pantry/actions/analyze-place.ts`), en serverfunktion som `/api/ai/analyze` anropar, inte en Server Action. Den förväxlas inte med portens `analyzeImage`. Gränssnittet ligger i `pantry/ui` (`PantrySuggestionsProvider`, `PantryCamera`, `PantrySuggestionList`), eftersom 6.2 använder arket Lagervara.
  - `downscaleImage` flyttas till `src/lib/downscale-image.ts` och `useCoarsePointer` till `src/components/use-coarse-pointer.ts`, så att både `recipes/ui` och `pantry/ui` använder samma förminskning. Fotoimporten beter sig som förut.
  - Bildkontrollen i `/api/ai/import/photo` bryts ut till `readImageForm(request, fields)` i `src/app/api/ai/route-support.ts`, som båda handlerna använder. Fotoimportens tester går igenom oförändrade.
  - Lagerförslagen hålls i klientens minne av `PantrySuggestionsProvider`, som ligger ovanför Hemmas `<Suspense>` med nyckel och själv saknar nyckel. De finns kvar när platskortet byts och försvinner vid omladdning och när Hemma lämnas. När sidan göms efter en navigering (React Activity) avbryts analysen, och förslagen och fotot släpps. Inget sparas i `localStorage`, `sessionStorage` eller adressen (AD-2, AD-15). **Ändrat efter granskningen:** det förminskade fotot finns i minnet bara medan ett fel visas som "Försök igen" kan hjälpa (`ai_unavailable`, `ai_invalid`, `ai_rejected`, `catalog_unavailable`). Det släpps vid svar, tomt svar, "Avbryt" och andra fel.
  - Ett nytt foto ersätter förslagen först när svaret kommer. "Avbryt" och fel behåller de gamla. Ett svar med en tom lista ersätter dem också och visar "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand." (`role="status"`) med textknappen "Lägg till vara" (ny variant `text` av `AddPantryItemButton`).
  - Förslagen har den fotograferade platsen, också om Pontus byter kort under analysen. Rubriken säger "Lagerförslag från kylen".
  - En ny katalogingrediens från ett foto får den fotograferade platsen som standardplats, och avdelning och standardenhet från `hint` (via `matchIngredients`). **Ändrat efter granskningen:** AI:ns text är opålitlig. Ett nytt namn måste därför vara en kort grundform: högst 40 tecken och fyra ord, bara bokstäver, siffror, blanksteg, bindestreck och vanliga skiljetecken (`.,'’&%/()`), och inget som liknar en webbadress (`isUsableNewName`). Annars tas förslaget bort. `label` används bara för matchningen, och etiketter och namn på över 200 tecken gör varan ogiltig. Samma nya ingrediens i flera enheter får ett gemensamt `proposalId` ("n1"), så att 6.2 skapar den en gång.
  - Mängder: AI:ns enhet tolkas med `normalizeUnit`. En mängd utan enhet blir `st`, och en okänd enhet ("tub") eller en mängd från 1 000 000 gör förslaget obegränsat ("Finns hemma"). Samma ingrediens och enhet slås ihop med summerad mängd, och en vara utan mängd går upp i en med mängd. Olika enheter ger egna förslag (AD-7). **Ändrat efter granskningen:** mängden avrundas först som den visas (`displayAmount`), och en mängd som blir 0 räknas som ingen mängd. Alla mängder, också platsens mängd som fylls i, hålls under 1 000 000 (högst 999 999,999). Har en av varorna i en grupp en mängd som inte går att behålla (okänd enhet, för stor), blir hela förslaget obegränsat, så att det inte räknas för lågt.
  - En vara som redan är obegränsad på platsen förblir obegränsad i förslaget. Ett förslag utan mängd får platsens mängd när varan har mängd i exakt en enhet där. Förslag vars vara finns på platsen visar "I kylen nu: 2 förp" eller "I kylen nu: finns hemma". Går platsens lagervaror inte att läsa loggas `pantry_unavailable`, och förslagen visas utan raden.
  - Ingen säkerhetsgrad visas. Kortet visar namn, mängd, plats, "Ny" när en katalogingrediens kommer att skapas och raden "I kylen nu". Knapparna kommer i 6.2.
  - **Ändrat efter granskningen, högst 25 varor** (förslaget var 40): prompten säger det, och servern behåller AI:ns första 25 och loggar antalet som togs bort (`analyze_items_trimmed`). JSON-schemat har ingen `maxItems`. Mätt mot Qwen3.6 i LM Studio (kontext 8 192): prompt, schema och en bild på 1600 px är 777 token, och en vara är ungefär 60 token svar. 40 varor hade blivit 2 400–3 000 token, alltså vid gränsen `maxOutputTokens: 3000` och nära 100 s. 25 varor är ungefär 1 500 token, så gränsen 3 000 behålls med marginal. 25 förslag är redan många att granska.
  - **Ändrat efter granskningen, varje vara för sig:** JSON-schemat till modellen beskriver bara formen (fält och typer, inga gränser eller standardvärden), så att strikta scheman tar det. Bara ett svar som är trasigt som helhet ger nya försök och `ai_invalid`. Varje vara kontrolleras sedan för sig mot `aiPantryItem` (`parseAnalyzeItems`). En ogiltig vara tas bort och räknas, och en mängd 0 blir ingen mängd. Servern kontrollerar också varje färdigt förslag mot `pantrySuggestionSchema` och tar bort ett som inte klarar det (`analyze_output_invalid` med antal). Borttagna varor loggas som `analyze_items_dropped` med `{ unmatched, unnamed, unusable, invalid }`, bara antal. Svaret har fältet `dropped`. Om AI:n såg varor men inga blev förslag visas "Det gick inte att tolka varorna på bilden. Ta en ny bild eller lägg till för hand." i stället för "Hittade inga varor på bilden …".
  - Tidsbudget: samma `defaultLimits` som importen (100 s per försök, 115 s totalt) och `maxOutputTokens: 3000`. **Tillagt vid bygget, som i 5.2:** handlern ger `analyzePlace` en tidsgräns, och modellen får tiden som är kvar minus 5 s för läsningarna efter den (`RunOptions.deadline`, nu gemensam för `suggestDishes` och `analyzeImage`; `minSuggestRunMs` heter nu `minRunMs`). **Ändrat efter granskningen:** tidsgränsen är 3 s före `maxDuration`, alltså 117 s, så att svaret hinner ut. Med mindre än 2 s kvar startas ingen läsning som svaret behöver (`ai_unavailable`), och läsningen av platsens lagervaror hoppas över (förslagen kommer utan "I kylen nu").
  - En ny analys från samma person stoppar den förra. Ett avbrott stoppas efter AI-svaret, efter matchningen och före platsens lagervaror. **Ändrat efter granskningen:** den stoppade analysen svarar med den nya koden `ai_superseded` (409, "En nyare bild analyseras."), som klienten behandlar som "Avbryt", utan fel och utan "Försök igen". Låset finns bara i serverprocessen. Med flera serverinstanser (Vercel) kan två analyser från samma person köras samtidigt, och då hjälper bara klientens egen avbrytning.
  - Tomt svar är `ok` med en tom lista, ingen felkod. `ai_rejected` får en egen text för bilder: "AI-tjänsten tog inte emot bilden. Ta en ny bild eller försök igen senare." "Försök igen" finns för `ai_unavailable`, `ai_invalid`, `ai_rejected` och `catalog_unavailable`, aldrig för en bild som inte går att läsa eller är för stor.
  - Kameraknappen står alltid under platskorten, också på en tom plats och under felet när lagret inte går att läsa. På mobil finns "Välj bild" under den.
  - **Ändrat efter granskningen, fokus:** när förslag kommer flyttas fokus till rubriken bara om fokus fortfarande är i kameraytan eller ingenstans. Annars, till exempel i arket Lagervara, stannar fokus, och kamerans live-region säger "6 lagerförslag från kylen.". Efter ett fel eller ett tomt svar går fokus till kameraknappen, med samma villkor. `downscaleImage` och anropet ligger i try/catch: ett kast ger `image_unsupported` respektive `ai_unavailable`, och analysen avslutas.
  - **Ändrat efter granskningen, integritet:** en PNG som redan ryms skickas utan sina metadata-bitar (`stripPngMetadata` behåller bara IHDR, PLTE, tRNS, IDAT, IEND, gAMA, cHRM och sRGB). Alla andra bilder kodas om via canvas, vilket tar bort EXIF och GPS. `pnpm eval:ai` tar bort metadata ur varje foto (`stripJpegMetadata`, `stripPngMetadata`, annars `sips` och sedan borttagning). Den skickar bara egna foton till LM Studio på den här datorn, om inte `EVAL_ALLOW_REMOTE_PHOTOS=1` är satt. `runStructured` loggar bara kod, orsak och HTTP-status, aldrig felobjektet eller indata. Ett test visar att ett misslyckat `analyzeImage` inte loggar något av bilden.
  - Mockens fixturbilder (`kyl.png`, `tom-hylla.png`) är syntetiska: förpackningar ritade med CSS och etiketter, renderade med `scripts/render-pantry-image.mjs`. Riktiga foton för `pnpm eval:ai` läggs i den git-ignorerade mappen `tests/eval/photos/` med `<namn>.expected.json`. En bild som är större än klienten skickar förminskas med macOS `sips` i en tillfällig mapp som tas bort.
  - **Ändrat efter utvärderingen:** prompten säger att `amount` och `unit` hör ihop, i första hand antal förpackningar med `förp` eller antal styck med `st`. Den första körningen mot Qwen gav "Vispgrädde 3 dl" som 1 dl och "Smör 500 g" som 1 g.
- **Varför:** AD-2 och AD-15 (inget skrivs, och fotot finns bara i minnet), AD-6 (katalogkopplingen görs bara av `matchIngredients`), AD-9 (samma körregler som importen och förslagen) och AD-19 (att bekräfta sätter mängden exakt i 6.2, så Pontus ska se vad som skrivs över). Ett foto visar vad som finns där, så den fotograferade platsen är rätt förval.
- **Alternativ:**
  - En kopia av förminskningen i `pantry/ui`, som skulle kunna glida isär från importens.
  - Förslagen i `sessionStorage`, så att de överlever en omladdning.
  - Lägga nya förslag efter de gamla och slå ihop dubbletter.
  - `hint.location` som standardplats för en ny ingrediens, som AD-6 beskriver för recept.
  - Låta ett förslag utan mängd vara obegränsat och lita på raden "I kylen nu".
  - Fältet `confidence` i schemat och en markering på osäkra förslag.
  - Ett svar med fler än 25 varor som ogiltigt.
  - 40 varor med `maxOutputTokens` höjd till ungefär 4 000 (ryms i kontexten, men svaret tar nära 100 s).
  - `.catch()` per vara i Zod-schemat. Det ger `"default": null` i JSON-schemat, vilket strikta leverantörer kan neka.
  - Ett tomt svar som behåller de förra förslagen.

## 2026-10-26 – AI-förslag utifrån lagret (Story 5.2)

- **Beslut:**
  - Servern läser lagret från sessionen, och klienten skickar bara `avoidTitles` till `/api/ai/suggest`. Indata är då alltid aktuella och går inte att förfalska, och kroppen blir liten (högst 4 KB).
  - `suggestDishesAnswerFor(avoidTitles)` kräver exakt tre förslag med olika titlar och ingen titel ur `avoidTitles`, med `superRefine`. Titlarna jämförs normaliserade (`normalizeTitle`: trimmade, ett blanksteg mellan orden, gemener med `sv-SE`). Antalet kontrolleras där och inte med `.length(3)`, eftersom strikta JSON-scheman inte klarar `minItems` eller `maxItems` över 1. Felet har en sökväg, så att `schemaFeedback` kan säga till modellen vad som var fel. Prompten säger "exakt tre".
  - Tidsbudget och svarslängd: samma `defaultLimits` som importen (100 s per försök, 115 s totalt). Prompten begränsar varje rätt till högst 10 rader och 6 korta steg, `maxOutputTokens` är 4 000 och lagret högst 120 rader och 4 000 tecken, så att allt ryms i 8 192 token.
  - **Ändrat efter granskningen, tidsgräns:** handlern ger `suggestFromPantry` en tidsgräns (`maxDuration`, 120 s, från att anropet kom). Modellen får tiden som är kvar minus 5 s för läsningarna efter den, högst 115 s. Med mindre än 10 s kvar anropas den inte (`ai_unavailable`). Ett anrop som avbryts stoppas efter lagret, efter AI-svaret och före de sista katalognamnen, och loggas som `info`.
  - **Ändrat efter granskningen, en körning per person:** medan en körning pågår stoppar en ny begäran från samma person den förra (låset finns i serverprocessen). Ett andra fönster eller ett dubbeltryck håller alltså aldrig den lokala modellen upptagen två gånger.
  - Lagret till AI:n: "Lagret:" med en rad per katalogingrediens och enhet i namnordning ("gul lök: 3 st", "mjölk: 1,5 l"), och "finns" för en vara som alltid räcker. En vara som både är obegränsad och har mängder blir bara "finns". Titlarna att undvika står under "Föreslå inte:" med en rad per titel ("- Pannkakor"). Prompten säger att båda listorna är data, inte instruktioner. Mängden avrundas som den visas (`displayAmount`, minst 0,01) och skrivs med decimalkomma, utan exponent. **Ändrat efter granskningen:** namn och enheter rensas från kontroll- och formattecken och radavgränsare, och blanksteg slås ihop, så att ett namn aldrig kan bryta raden och starta ett eget avsnitt. Namn kortas till 100 kodpunkter, och en post som porten inte skulle ta emot hoppas över. Radformen, gränserna och kontrollen finns på ett ställe, `src/lib/suggest-input.ts` (`pantryLine`, `pantryLinesLength`, `isValidPantryEntry`), som både domänen och porten använder. Över gränserna tas resten bort och loggas som `info` med antalet. Inga id, platser eller datum skickas, och inga recept. Titlarna att undvika får inga kontrolltecken, blanksteg slås ihop, och klienten kortar dem till serverns gräns.
  - **Prövat och återtaget efter granskningen:** lagret och titlarna som JSON-block. Med JSON tog Qwen längre tid och gav förvanskade titlar ("Gyrok kyckling med pasta"), så raderna behölls. Rensningen av namnen ger samma skydd mot inskjutna rader.
  - Ett förslag som inte klarar `recipeDraftSchema` efter `fromAiRecipe` tas bort och loggas som `ai_invalid` med `reason: "draft"`, index och felens sökvägar och koder, aldrig innehållet. Resten visas. Inga giltiga ger `ai_invalid`.
  - **Ändrat efter granskningen:** ett förslag som efter `matchIngredients` använder färre än två ingredienser som finns hemma tas också bort, och loggas som `ai_invalid` med `reason: "pantry"`, index och antal.
  - Tomt lager ger den nya koden `suggest_empty_pantry` (422) utan AI-anrop, med texten "Lagret är tomt. Lägg till varor i Hemma, så kan AI:n föreslå rätter." och länken "Öppna Hemma". **Ändrat efter granskningen:** ett lager med varor där inget namn går att läsa är ett läsfel, `catalog_unavailable` med "Försök igen", inte ett tomt lager.
  - `ai_rejected` får en egen text för förslag: "AI-tjänsten tog inte emot förfrågan. Försök igen senare." Den ligger i `suggestions/domain`. **Ändrat efter granskningen:** `validation` får också en egen text med "Försök igen": "Det gick inte att be om förslag. Försök igen."
  - "Föreslå andra rätter" skickar de visade titlarna och sedan de sparade som `avoidTitles`, högst tre. Ett svar med en sådan titel ger ett nytt försök med förklaring till modellen. Nya förslag ersätter de gamla först när de kommer. "Avbryt" och fel behåller de gamla, och felet står ovanför dem.
  - Förslagen ligger i en hook (`useDishSuggestions`) som `Library` håller, så de finns kvar när pillren byts, så länge `/recept` är öppen. Ett pågående anrop avbryts när biblioteket avmonteras eller göms efter en navigering, och knappen är då tillbaka när sidan visas igen. Ett svar på ett anrop som har avbrutits eller ersatts används aldrig. Förlopp och "Avbryt" finns kvar under ett anrop även om en sökning misslyckas, men knappen erbjuds inte under en misslyckad sökning. Ett sparat förslag tas bort ur sektionen.
  - Kortet är ingen länk. Det visar titel, "35 min · 4 portioner", etiketten "AI-förslag", "Med: " och högst fem ingrediensnamn (katalognamnet för en kopplad rad, annars `hint.name`, varje namn en gång, som de är skrivna) och knappen "Spara" (skärmläsarnamn "Spara <titel>"). Inget förslag har status före sparning.
  - Sektionen ligger under biblioteket i filtret "Kan lagas nu", med rubriken "AI-förslag" (h2) som får fokus när förslag kommer. Under anropet står "Letar efter idéer …" med förloppsrad i en `role="status"`, och textknappen "Avbryt" står på knappens plats. Efter "Avbryt" är knappen tillbaka med fokus. Fel visas i en `Notice` med `role="alert"`, med "Försök igen" för `ai_unavailable`, `ai_invalid`, `ai_rejected`, `pantry_unavailable` och `catalog_unavailable`. Knappen för nya förslag finns kvar bredvid felet.
  - Arket heter "Spara AI-förslag" och har AI-etiketten överst (`RecipePreview` fick prop:en `badge`, som anroparen bestämmer, så att "Ändra" på ett sparat AI-recept inte får den). **Ändrat efter granskningen:** varje förslag får sitt `recipeId` när det kommer, så att ett ark som öppnas igen efter ett förlorat svar sparar med samma id och aldrig gör en kopia. "Spara recept" är den enda primärknappen.
  - Mockens reserverade indata för förslag är en lagervara vars normaliserade namn är `matkoll-mock: ai_unavailable`, `ai_invalid` eller `ai_rejected` (samma texter som för importen). Annars svarar mocken med den första av `suggest-dishes.response.json` och `suggest-dishes-andra.response.json` som inte har någon titel att undvika, eller `ai_invalid`. Förslagens fixturer läses för sig, så att en trasig fixtur aldrig stoppar importen.
  - Serverfunktionen heter `suggestFromPantry` och ligger i den nya modulen `suggestions`. Gränssnittet ligger i `recipes/ui` och når servern bara via `postAi`.
  - **Från granskningen av 5.1:** `AiSuggestions` får hookens tillstånd (`dishes`) i stället för bara `onSuggest`. Utan det visas inget, som förut.
  - **Från granskningen av 5.1, tomt bibliotek:** ett tomt bibliotek visar som förut bara "Inga recept än." med "Importera recept". AI-förslag finns i filtret "Kan lagas nu", och filtret finns först när det finns recept.
  - **Från granskningen av 5.1, lagret går inte att läsa:** knappen visas ändå. Servern läser lagret på nytt när Pontus trycker. Om det fortfarande inte går visas "Det gick inte att läsa lagret. Försök igen." med "Försök igen", och AI:n anropas inte.
- **Varför:** AD-2 och AD-6 (servern skriver inget, och katalogkopplingen görs bara av `matchIngredients`), AD-9 (samma körregler som importen) och EXPERIENCE.md (AI-etiketten följer med tills receptet sparats, och förslagen blandas aldrig med biblioteket). Ett lager som läses på nytt kan ha blivit läsbart sedan sidan laddades, så knappen behöver inte döljas.
- **Alternativ:**
  - Klienten skickar lagret, som den inte har på receptsidan i dag.
  - Hela svaret blir `ai_invalid` när ett förslag är ogiltigt.
  - Den gemensamma `ai_rejected`-texten, som ber om en kortare text.
  - Ett tryck på kortet öppnar en skrivskyddad vy.
  - "Föreslå rätter med AI" i det tomma biblioteket.
  - Dölja knappen när lagret inte gick att läsa när sidan laddades.
  - Lagret och titlarna som JSON-block (prövat efter granskningen och återtaget, se ovan).
  - Svara 429 på en andra begäran i stället för att stoppa den förra.

## 2026-10-26 – Kan lagas nu, rangordnat (Story 5.1)

- **Beslut:**
  - Filtret "Kan lagas nu" visar alla recept, inte bara de som kan lagas nu, sorterade på `missingCount` (N från `recipeStatus`), minst först. Pillrets namn beskriver vad som står överst. Inget recept döljs, och listan har inga rubriker eller grupper. Listans skärmläsarnamn är "Recept, minst saknat först".
  - Lika N står nyast först (`createdAt` fallande) och sedan efter id, som servern ordnar biblioteket. Ordningen står uttryckligen i jämförelsen och bygger inte på att sorteringen är stabil. Ett `missingCount` som inte är ett ändligt tal ≥ 0 räknas som saknad status.
  - Rangordningen görs i `filterRecipes` i `recipes/domain`, inte i modulen `suggestions`. Biblioteket äger filtervalet och `missingCount`, och sorteringen görs på ett värde som redan finns i klienten, utan nytt anrop. Modulen `suggestions` skapas i 5.2 för serverdelen av AI-förslag.
  - "Föreslå rätter med AI" hör till filtret och ska stå längst ned, inte bara när inget kan lagas nu, och också efter en sökning, även utan träffar. Den visas inte när sökningen misslyckades, eftersom felrutan då är vägen vidare. Knappen är en sekundärknapp i full bredd, eftersom biblioteket inte har någon primärknapp. Den ligger utanför resultatytan, så den tonas inte ned medan en sökning pågår.
  - **Ändrat efter granskningen:** knappen visas inte i 5.1. `AiSuggestions` visar den bara när den får `onSuggest`, och biblioteket skickar den först i 5.2. Det ersätter förslaget att visa en knapp som inte gör något, så att en död knapp aldrig syns, inte ens i epicgrenen.
  - **Ändrat efter granskningen:** servern säger om lagret gick att läsa. `listLibrary` (för Recept) och `searchLibrary` (sökningen i biblioteket) ger `pantryUnavailable` när `pantrySnapshotOrNull` gav `null`. `listRecipes` och `searchRecipes` är oförändrade, så att Matsedel inte påverkas. Biblioteket gissar alltså inte utifrån att raderna saknar status.
  - När lagret inte går att läsa visas recepten i vanlig ordning, med texten "Det gick inte att läsa lagret, så recepten är inte rangordnade." överst. Den visas bara i filtret "Kan lagas nu", i en `role="status"`-yta som finns kvar så länge filtret är valt, så att texten läses upp när den kommer. Listans skärmläsarnamn är då "Recept", så att det inte påstår en rangordning som inte finns. Vid en sökning visas texten bara när varken listan eller sökningen kunde läsa lagret, eftersom raderna tar status från listan när den har receptet.
  - Rader som saknar status fast lagret gick att läsa (till exempel ett nytt recept som bara finns i sökningens svar) hamnar sist, utan texten, och listan räknas som rangordnad.
  - Valet sparas som `"cookable"` under samma nyckel, `matkoll.recept.filter`. Ett gammalt eller okänt värde blir Alla.
- **Varför:** AC säger att recepten sorteras "med 'Kan lagas nu' överst" och att listan visas i rangordning även när inget kan lagas. I Flöde 5 finns det recept, men inget lockar, så knappen behövs också när något kan lagas nu. DESIGN.md tillåter högst en primärknapp per vy.
- **Alternativ:**
  - Bara recept med N = 0, med de övriga under en egen rubrik.
  - Favoriter först, eller färst rader först, inom samma N.
  - Rangordningen i `suggestions/domain/rank.ts`, importerad via `suggestions/index.ts` enligt Capability Map.
  - Visa knappen redan i 5.1 utan funktion (det första förslaget).
  - Gissa att lagret inte gick att läsa när alla synliga rader saknar status (det första förslaget).
  - Samma text som annars när lagret inte går att läsa ("Det gick inte att läsa lagret. Försök igen.") med "Försök igen" som laddar om sidan.

## 2026-10-26 – Stegläge med tänd skärm (Story 4.2)

- **Beslut:**
  - Stegläget är en native modal `<dialog>` i helskärm i receptvyn, utan egen adress. Valt antal portioner och scrollpositionen finns kvar när det stängs. Sidan bakom blir inert och scrollar inte medan stegläget är öppet. Webbläsarens bakåt lämnar receptet som vanligt. Om sidan göms av en navigering i appen stängs stegläget och låset släpps, utan att fokus flyttas, så att det inte är öppet när Pontus kommer tillbaka.
  - Stegläget öppnas alltid på steg 1 och minns inte var Pontus var mellan öppningarna. Om receptet läses om medan det är öppet stannar det på samma steg (efter stegets id), och om steget har tagits bort stannar det på samma plats. Om receptet tappar alla steg stängs stegläget.
  - "Laga nu" visas inte när receptet saknar steg, men visas även utan "Lägg på matsedeln". Den väntar medan en rätt läggs på matsedeln, så att bekräftelsen inte döljs bakom stegläget.
  - En rad visas på sitt första steg (`stepId`, beslut 2026-10-25). Stegen visas i ordning efter position.
  - **Ändrat efter granskningen:** rader utan steg, eller vars steg har tagits bort, visas på steg 1 under rubriken "Övriga ingredienser", efter stegets egna rader. Om ingen rad har något steg (AI:n kopplade inga) visar steg 1 alla rader, utan rubriken. Det ersätter förslaget att inte visa dem i stegläget, eftersom en rad annars kunde saknas helt där.
  - Stegraderna ser ut som i receptvyn: bock eller ring, mängd i `sky-ink` när den saknas och "hemma: …", i brödtext. Bara stegtexten är 24 px.
  - Wake Lock:
    - Stödet kontrolleras med `"wakeLock" in navigator`.
    - Saknat stöd och en nekad begäran visar båda raden "Skärmen kan släckas i den här webbläsaren." överst, som text i `meta` och `ink-2` utan ikon och utan `role="alert"`. Raden döljs när ett senare försök lyckas.
    - En begäran som nekas medan sidan är dold visar inte raden. Nästa `visibilitychange` försöker igen.
    - Om sidan blir synlig medan en begäran pågår görs ett nytt försök när den är klar, om den inte gav något lås.
    - Om systemet släpper låset medan sidan är synlig (till exempel vid strömsparläge) görs ett nytt försök. Om det misslyckas, eller om låset släpps igen innan sidan visas nästa gång, visas raden.
    - Ett lås som kommer efter att stegläget stängts släpps direkt. Inget loggas.
  - Svep: ett pekardrag som först rör sig mer än 8 px vågrätt än lodrätt räknas som svep, och ett svep på minst 48 px byter steg. Ett lodrätt drag scrollar steget. Svepet gäller stegets innehåll, inte knapparna. Ett drag med musen som markerade text byter inte steg. Ett drag som aldrig fick sitt slut glöms när en ny pekare börjar, när ingen knapp är nedtryckt eller när pekaren lämnar steget.
  - Tangenter: ArrowLeft och ArrowRight byter steg var fokus än är, också efter ett tryck på stegtexten. En nedhållen tangent byter bara ett steg. Med Alt, Ctrl, Cmd eller Skift görs inget, så att webbläsarens kortkommandon fungerar.
  - Föregående och Nästa blir `aria-disabled` vid gränserna i stället för att Nästa blir "Klar" på sista steget. "Stäng", Esc och webbläsarens egen stängning är vägarna ut, och då går fokus tillbaka till "Laga nu".
  - "Steg N av M" får fokus när stegläget öppnas. Vid varje stegbyte läses "Steg N av M: <stegtext>" upp från en dold live-region, och fokus stannar där det är. Stegbytet är en kort övergång (180 ms) som bara körs utan "Minska rörelse".
  - "Lägg på matsedeln" (primär) och "Laga nu" (sekundär) ligger i samma rad i den fasta åtgärdsknappen, och "Lägg på matsedeln" tar resten av bredden. Med stor text bryts de till en rad var, och utrymmet längst ned på sidan mäts så att det räcker för båda raderna. "Lägg på matsedeln" behåller sin bredd medan rätten läggs på. Föregående och Nästa bryts på samma sätt.
- **Varför:** EXPERIENCE.md säger att "Stäng" går tillbaka till receptvyn och att valet av portioner bara gäller visningen, så en egen adress skulle kräva att portionerna gick via den. Ett steg utan kopplade rader ska bara visa texten, men granskningen visade att rader utan steg annars inte syntes alls i stegläget. Raden om skärmen är inget fel enligt EXPERIENCE.md. DESIGN.md tillåter en primärknapp per vy. Granskningen av 4.2 visade också att piltangenterna slutade fungera efter ett tryck på texten och att ett avbrutet drag kunde ligga kvar.
- **Alternativ:**
  - `/recept/[id]/laga?portioner=6`, så att bakåt stänger stegläget.
  - Inte visa rader utan steg i stegläget (det första förslaget).
  - En svepgräns som andel av bredden (20 %), utöver 48 px.
  - "Klar" på sista steget, som också stänger.
  - En blå meddelanderuta när skärmen kan släckas.

## 2026-10-26 – Sammanslagning till main med Vercel kopplat

- **Beslut (Pontus):** epic-PR:erna slås ihop till `main` även nu när repot är kopplat till Vercel-projektet `matkoll`.
- **Varför det är ofarligt:** Production saknar miljövariabler, så produktionsbygget misslyckas och inget publiceras. Den första riktiga publiceringen sker när Pontus lägger in variablerna enligt `docs/drift.md`.
- **Alternativ:** att vänta och bygga vidare på grenar ovanpå varandra. Det ger stora PR:er.

## 2026-10-26 – Portioner och "X av Y hemma" i receptvyn (Story 4.1)

- **Beslut:**
  - Valt antal portioner gäller bara medan sidan är öppen. Det sparas inte per recept, på enheten eller i adressen, och väljaren börjar på receptets egna portioner när sidan öppnas igen. Väljaren börjar om bara när receptets portioner eller radernas mängder sparas om med "Ändra". Hjärtat, titeln, stegen och lagret behåller valet, fast hjärtat ger receptet en ny `updated_at`.
  - "X av Y hemma" räknas per katalogingrediens, som bockarna. Y är antalet distinkta katalogingredienser i receptet, även de som bara har vaga rader. X är de ingredienser där varje behov täcks för valda portioner. Rader utan katalogingrediens räknas inte. En vag rad vars vara saknas räknas därför i Y men inte i X, fast den inte räknas i N. Sammanfattningen visas inte när Y är 0 eller när lagret inte går att läsa.
  - "Lägg på matsedeln" skickar alltid de portioner som visas, även när de är receptets egna. Om portionerna ändras efter ett misslyckat försök får nästa försök ett nytt id för rätten.
  - Ingen avrundning till hela styck i receptvyn: "0,25 st" visas som det står. Avrundningen uppåt gäller bara inköpslistan.
  - En rad utan katalogingrediens men med mängd visar originaltexten oskalad och "×faktor" till höger när faktorn inte är 1, som inköpslistans textposter. Faktorn visas med högst två decimaler och aldrig mindre än "×0,01".
  - Metaraden i receptvyn visar bara tiden ("35 min"), eftersom portionsväljaren visar portionerna. Utan tid finns ingen metarad. Biblioteket och matsedeln behåller "35 min · 4 portioner".
  - Portionsväljaren går från 1 till 1000, samma gräns som matsedelsrätten. Ett recept för fler än 1000 portioner börjar på 1000, med mängderna skalade till det.
  - Statusen och de skalade raderna räknas med samma faktor (`recipes.scaleFactor` och `pantry.recipeStatusForFactor`).
  - En mängd jämförs med lagret med samma avrundning som den visas med (två decimaler, `catalog.displayAmount`). En rad som behöver 3,333 dl när 3,33 dl finns hemma räknas som täckt, så att raden aldrig visar "3,33 dl" som saknad bredvid "hemma: 3,33 dl". Det gäller också inköpslistan, som inte längre ber om "<0,01 dl".
  - Sidan skickar bara lagret för receptets egna ingredienser till webbläsaren.
  - Statusetiketten och "X av Y hemma" står bredvid portionsväljaren, under källan, eftersom båda följer portionerna. De läses upp tillsammans när de ändras (`aria-live="polite"`). "X av Y hemma" är vanlig text i `ink-2`, inte en etikett, så att den inte blandas ihop med statusetiketten.
- **Varför:** EXPERIENCE.md säger att valet i receptvyn bara påverkar visningen. Siffran ska motsvara bockarna i listan, och skiss 2 räknar "olivolja efter behov" som en av nio. Ett aktivt val i receptvyn går före förvalet i FR-13. Fritext kan inte skalas utan tolkning. Granskningen av 4.1 visade att hjärtat nollställde valet och att en rad kunde stå som saknad bredvid samma mängd hemma.
- **Alternativ:**
  - `?portioner=6` i adressen, så att valet följer med vid omladdning och delning.
  - Räkna bort ingredienser med bara vaga rader ur Y, så att Y − X alltid är N.
  - Alltid lägga på matsedeln med receptets egna portioner.
  - Låta väljaren gå över 1000 för ett större recept. Då skulle matsedeln inte kunna ta emot de portioner som visas.
  - Visa det som fattas ("saknas 0,01 dl") i stället för att jämföra med visad avrundning.
  - Visa "X av Y hemma" som en mintfärgad etikett, som i skiss 2.

## 2026-10-26 – Ordning för tilläggen efter 1.0

- **Beslut (Pontus):** först görs version 1.0 klar (Epic 1–7). Därefter kommer:
  - 1.1: flera ställen, till exempel hemmet och vinterstugan, med inköpslistan räknad mot det ställe Pontus ska till.
  - 1.2: menyförslag utifrån veckans erbjudanden, i en enkel version med inklistrad eller fotograferad reklam.
  - 1.3: jämförelse mellan butiker, med en utredning först.

  Detaljerna står i `docs/backlog-efter-1-0.md`.
- **Följd för Epic 7:** butiksmodellen ska klara flera butiker och produktval per butik, så att jämförelsen inte kräver ombyggnad.

## 2026-10-26 – Säkerhetskopia och återställning (Story 3.8)

- **Beslut:**
  - `backup.yml` körs måndag och torsdag 03:17 UTC och för hand, bara på `main`. Den dumpar schema (`supabase db dump`) och data (`--data-only --use-copy`) och skriver `manifest.txt` (commit, CLI-version, körda migrationer) och `counts.txt` (`scripts/backup-counts.sql`). Datadumpen tar redan med `auth` (även `auth.users`), så schemat behöver inte läggas till. Utelämnas gör `storage.buckets_vectors` och `storage.vector_indexes` (som i Supabase egen guide; `postgres` får inte skriva till dem vid återläsning) och `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims`, `auth.one_time_tokens`, `auth.flow_state` och `auth.audit_log_entries`. `mfa_amr_claims` pekar på sessionerna och följer därför med dem ut. Roller dumpas inte: Matkoll har inga egna, och rolldumpen gick inte att läsa in.
  - Repovariabeln `BACKUP_ENABLED`: utan den hoppar en körning utan hemligheter över med en notis och blir grön; med `true` blir den röd. Lösenfrasen måste ha minst 32 tecken och ingen radbrytning, och `SUPABASE_DB_URL` måste ha lösenord. Felen nämner bara problemet.
  - Lösenordet i `SUPABASE_DB_URL` maskeras (som det står och avkodat). CLI:t och `psql` får adressen utan lösenord och lösenordet i `PGPASSWORD`, som båda läser. Lösenfrasen ges till `gpg` på stdin från `printf` (inbyggt i skalet).
  - Innan uppladdningen kontrolleras att filerna har innehåll och att `data.sql` har `auth.users`, och varje `.gpg`-fil dekrypteras och jämförs med originalet (`--no-symkey-cache`, så att jämförelsen inte bygger på en sparad lösenfras). Artefakterna sparas i 90 dagar; Pontus laddar ner en kopia i månaden.
  - Återställning sker till ett nytt projekt med `supabase db push` från en commit vars migrationer stämmer med manifestet, sedan `data.sql` med `psql` och `session_replication_role = replica`, en jämförelse med `counts.txt` och till sist `db push` från `main`. `schema.sql` används bara som jämförelse.
  - `SUPABASE_DB_URL` ska vara Session pooler-strängen.
  - Preview i Vercel får `SITE_URL` och `AI_PROVIDER=mock` men inga Supabase-variabler. Kontrollerat lokalt: bygget lyckas och sidorna svarar 503. Om förhandsversionerna ska finnas kvar avgör Pontus (öppen fråga 4).
  - Actions pinnas på huvudversion som i `ci.yml`, inte på commit-SHA; SHA-pinning är en senare härdning.
- **Varför:** provat lokalt mot en andra, tillfällig Supabase-stack: återläsning av `schema.sql` gav `anon` rättigheter till alla tabeller (dumpen saknar migrationernas `revoke`) och ingen migrationshistorik, medan `db push` plus data gav samma radantal, policyer och rättigheter som originalet, fungerande inloggning och RLS. Granskningen av 3.8: en tyst överhoppning efter att molnet satts upp, en svag lösenfras, en okontrollerad dump och okrypterade sessioner i säkerhetskopian skulle inte märkas förrän vid en återställning. GitHubs maskiner saknar IPv6, som Supabase direkta anslutning kräver.
- **Alternativ:**
  - Återläsa `schema.sql` direkt och rätta rättigheterna efteråt.
  - Ta med en rolldump, som i Supabase guide.
  - Läsa `BACKUP_ENABLED` som hemlighet, eller låta saknade hemligheter alltid ge rött.
  - Stänga av förhandsversioner i Vercel helt.

## 2026-10-26 – Lägg i lagret efter granskningen

- **Beslut:**
  - Textposter (`t:`) kan inte läggas i lagret, så deras bockar rensas inte. De står kvar avbockade och räknas inte när knappen ska visas. Det ersätter beslutet nedan om att deras bockar rensas.
  - Bockar rensas på id: de skickade posternas bockar och bockar med kvitto vars post inte längre syns. En bock som satts på en annan enhet under tiden har ett nytt id och står kvar. Överstyrningar rensas bara för receptposter som skickades i körningen, så en dold post förblir dold.
  - Kvittot lever lika länge som bocken. Efter en lyckad rensning tas kvittona för de rensade bockarna bort (`pantry.forgetPantryAdditions`). Gallringen efter 30 dagar finns kvar som skyddsnät. Kvitton kan inte ändras, bara skrivas och tas bort.
  - En misslyckad rensning prövas en gång till. Om lagret är skrivet men listan inte rensad visar listan knappen även utan avbockad post (`pendingClear`), så att omförsöket alltid går att nå.
  - En summa över lagrets maxgräns kapas till 999 999,999. En post som ändå inte kan läggas i (okänd ingrediens, ogiltig enhet) hoppas över och behåller sin bock. Resten läggs i, och listan visar "Det gick inte att lägga allt i lagret.". Postgres-funktionen nekar själv ogiltiga mängder, enheter och platser.
  - Om matsedeln byts efter att lagret skrivits visas "Varorna är lagda i lagret, men matsedeln har bytts.". Om inget svar kommer visas "Det gick inte att nå servern. Försök igen.". Knappen är inaktiv medan en bock sparas, så att servern ser samma bockar som Pontus.
- **Varför:** granskningen av 3.7. Rensning på nyckel kunde ta bort en bock eller en döljning som körningen inte gällde. Kvitton som bara gallrades efter 30 dagar höll kvar nycklar som inte längre skyddade något. Efter ett avbrott där alla poster täcktes av lagret fanns ingen knapp att trycka på igen.
- **Alternativ:**
  - Rensa på listnyckel enligt AD-8:s ordalydelse.
  - Låta kvitton leva i 30 dagar. Det stänger också ett smalt fönster där två enheter som trycker i samma ögonblick kan lägga i en vara två gånger.
  - Låta hela körningen misslyckas när en post inte kan läggas i.

## 2026-10-26 – Lägg i lagret: kopplade egna varor och idempotens

- **Beslut:**
  - En avbockad egen vara som är kopplad till en katalogingrediens läggs i lagret som en receptpost, på ingrediensens standardplats. Den läggs i med sin mängd och enhet, eller som obegränsad lagervara om den saknar mängd. Sedan tas den bort från listan. En egen vara utan katalogkoppling tas bara bort från listan.
  - Flödet går över två moduler och är idempotent i stället för atomärt (AD-1). `pantry.addToPantry` skriver ett kvitto i tabellen `pantry_addition` för varje post, i samma transaktion som ökningen. Kvittot är unikt på `(user_id, key)`, och nyckeln är id:t på postens bock i `shopping_check`, som är stabilt tills bocken rensas. En post vars nyckel redan har ett kvitto hoppas över, så en ny körning efter ett avbrott, ett dubbeltryck eller ett tryck från en annan enhet ökar lagret en gång. Kvitton äldre än 30 dagar tas bort när funktionen körs.
  - Lagret skrivs alltid först och listan rensas sedan, i en egen transaktion i `shopping` (`clear_put_in_pantry`). Om rensningen misslyckas står bockarna kvar, och nästa körning hoppar över posterna med kvitto och rensar dem. En bock vars post inte längre finns på listan (lagret räcker nu) rensas också om lagret har ett kvitto för den. Då blir både lagret och listan desamma som efter en körning.
  - Posten läggs i med den mängd listan visar: köpmängden, avrundad uppåt i styckenheter, eller den rättade mängden som den står. En vag post blir obegränsad. Om ingrediensen redan är obegränsad på någon plats ändras inget, men posten räknas ändå som lagd. Följer en obegränsad post på en plats där det finns rader med mängd ersätter den raderna där, enligt regeln i `set_pantry_items`.
  - Receptrader utan katalogingrediens (`t:`) läggs inte i lagret. Deras bockar och överstyrningar rensas, så de står kvar på listan utan bock. (Ändrat efter granskningen, se ovan: bockarna står kvar.)
  - Bekräftelsen räknar posterna som gick till lagret: "Lagt 8 varor i lagret." / "Lagt 1 vara i lagret.". Om bara okopplade egna varor var avbockade blir den "Tog bort N varor från listan.". Knappen "Lägg i lagret" behåller sin text och är inaktiv medan flödet pågår.
  - Ett fel innan lagret skrivits, även när listan eller lagret inte går att läsa, ger "Det gick inte att lägga varorna i lagret. Försök igen." (`pantry_add_failed`). Ett fel efter att lagret skrivits ger "Det gick inte att lägga allt i lagret. Försök igen." (`shopping_put_in_pantry_failed`). Båda visas i en blå `Notice` ovanför listan.
- **Varför:** underlaget (AD-8, epic-3-context) lämnade öppet vad som händer med en kopplad egen vara. En kopplad vara har en ingrediens och en plats, så den hör hemma i lagret som en receptpost. Utan kvitto skulle en ny körning efter ett avbrott öka lagret två gånger, till exempel när en rättad mängd är mindre än behovet och posten kommer tillbaka. Bockens id är stabilt och unikt per avbockning. Utan kontrollen av kvitton för bockar som inte längre syns på listan skulle en sådan bock ligga kvar och gälla igen om posten kom tillbaka.
- **Alternativ:**
  - Behandla alla egna varor som okopplade och bara ta bort dem.
  - Idempotensnyckel från listnyckeln och matsedeln i stället för bockens id. Den skulle hindra att samma vara läggs i igen efter en ny avbockning på samma matsedel.
  - Ett atomärt flöde i en enda Postgres-funktion som skriver båda modulernas tabeller (bryter mot AD-1).

## 2026-10-26 – Dolda varor och rättelser efter granskningen

- **Beslut:**
  - När den aktuella matsedeln har dolda poster visar listan textknappen "Dolda varor (N)" under "Lägg till egen vara". Den öppnar arket "Dolda varor". Där står varje dold post med namn och mängd, räknade som om de inte var dolda och med en eventuell rättad mängd, tillsammans med "Visa igen". "Visa igen" visar posten igen och behåller den rättade mängden. Arket stängs när inget längre är dolt.
  - En dold nyckel som inte ger någon post just nu visas inte. Det gäller när lagret räcker eller när behovet har bytt enhet. Den räknas inte i N och ligger kvar dold tills nyckeln kommer tillbaka.
  - En rättelse sparar också den mängd som listan räknade fram då. Om den framräknade mängden senare ändras visar posten båda: "2 dl (beräknat 4 dl)", och med lager i annan enhet "2 dl (beräknat 4 dl, hemma: 1 kg)".
  - "Ångra" efter att en post dolts:
    - Om raden har ändrats efter döljningen, till exempel rättats i en annan flik, sätts bara den dolda flaggan tillbaka och den nya mängden står kvar.
    - En post som döljs en gång till ger alltid "Ångra" som visar den igen.
    - Ett förlorat svar vid döljning prövas en gång till.
    - Om raden före inte går att läsa visas bekräftelsen utan "Ångra".
  - Om en egen vara har tagits bort någon annanstans medan detaljen var öppen stängs arket, listan läses om och "Varan finns inte längre." visas (`shopping_item_gone`). En koppling utan känt namn visas som "Kopplad till okänd ingrediens".
  - Mängdfältet i detaljen fylls med den exakta mängden. Om Pontus skriver in den framräknade mängden tas en rättelse bort, och finns ingen rättelse stängs bara arket. Om posten försvinner från listan medan detaljen är öppen stängs arket.
- **Varför:** granskningen av 3.6. Specen saknade en väg tillbaka till en dold post utom "Ångra" och en ny matsedel. En dold post utan behov har ingen mängd att visa, och den skulle bara förvirra.
- **Alternativ:**
  - Visa dolda nycklar utan post med sitt senast kända namn.
  - Skriva över en samtidig rättelse vid "Ångra".
  - Inte visa att den framräknade mängden har ändrats.

## 2026-10-26 – Rättad mängd och dolda listposter

- **Beslut:**
  - En rättad mängd ersätter den beräknade i postens enhet och används som Pontus skrev den. Den avrundas inte uppåt i en enhet som räknar hela saker, så "1,5 st" står kvar som 1,5 st. Posten behåller täckningen och "hemma: 1 kg". Detaljen visar den beräknade mängden som "Beräknat: 3 dl" och textknappen "Använd beräknad mängd", som tar bort rättelsen direkt och stänger arket.
  - En överstyrning utan post gör ingenting och ligger kvar. Det gäller när lagret räcker eller när behovet har bytt enhet och därmed nyckel. Den gäller igen om nyckeln kommer tillbaka. Den raderas med matsedeln, och 3.7 rensar den för avbockade nycklar. En dold post som en vag rad har vikts in i döljer också den vaga raden.
  - Receptrader utan katalogingrediens (`t:`) och vaga poster går att dölja men inte att rätta. Databasens check släpper därför igenom både `r:`- och `t:`-nycklar men nekar `c:`. En mängd tillåts bara på en `r:`-nyckel med enhet. Specen nämner bara `r:`, men en `t:`-post är också en receptpost och ska kunna tas bort.
  - Alla poster kan svepas. En receptpost döljs och en egen vara tas bort. "Ta bort" finns även i detaljen, och båda ger samma bekräftelse med "Ångra". Poster som tas bort medan bekräftelsen visas slås ihop i den.
  - Detaljen har varans namn som rubrik. En receptpost med mängd har fältet "Mängd" med enheten bredvid, "Spara", "Ta bort" och "Avbryt". En post utan mängd har bara ursprung, "Ta bort" och "Klar". "Spara" med oförändrad mängd stänger bara arket. Ursprunget skrivs "Från Krämig kycklinggryta, Linssoppa", och "(hemma: 1 kg)" visas när det finns annan enhet hemma. Fel vid sparande ger `shopping_save_failed`.
  - En egen varas detalj är samma formulär som "Lägg till egen vara", med "Spara" och "Ta bort". Varan behåller sitt id och därmed sin bock, och textfältet får inte fokus direkt.
  - Live-regionen annonserar inte en rättad mängd. Den annonserar inte heller en post som Pontus själv tagit bort eller ångrat, så länge listan visas (Story 3.6).
- **Varför:** specen bestämmer inte hur rättelsen förhåller sig till avrundningen och lagret eller vad som händer när nyckeln försvinner. En rättelse är Pontus egen mängd och ska inte ändras av appen. En `t:`-post som inte går att ta bort skulle bli kvar på listan för alltid.
- **Alternativ:** avrunda även rättade mängder uppåt; ta bort överstyrningar vars nyckel saknas; bara `r:`-nycklar, enligt specens text.

## 2026-10-26 – Egna varor på inköpslistan

- **Beslut:**
  - "Lägg till egen vara" är en sekundärknapp under listan. Den visas så fort det finns en aktuell matsedel, även utan rätter, men inte utan matsedel. Efter "Lägg till" stängs arket utan kort bekräftelse, och posten syns i listan.
  - Arket har fältet "Vara" med upp till fem katalogförslag under sig, 200 ms efter att Pontus slutat skriva. Ett valt förslag fyller fältet med ingrediensens namn och visar "Kopplad till Kaffe" och textknappen "Ta bort kopplingen". Texten går att ändra efteråt utan att kopplingen försvinner. Medan varan är kopplad visas inga förslag, och om sökningen misslyckas står "Förslag går inte att visa just nu." under fältet.
  - Listan skriver aldrig till katalogen. En kopplad egen vara sparar bara `ingredient_id` till en ingrediens som redan finns, och ingen synonym sparas, även om texten skiljer sig från namnet. Det avviker från AD-6 och arkitekturen, som låter `addCustomItem` anropa `commitIngredients` (beslut efter granskningen av 3.5).
  - En egen varas id behålls bara så länge formuläret är oförändrat. Ändras ett fält efter ett misslyckat försök blir det ett nytt id, och databasen nekar ett nytt försök med samma id men annat innehåll.
  - Mängd utan enhet ger "Välj en enhet." vid Enhet, och enhet utan mängd ger "Ange ett tal större än 0." vid Mängd. Mängden ska vara under 1 000 000 ("Ange ett tal under 1 000 000.") och texten högst 200 tecken ("Texten får vara högst 200 tecken.").
  - Bara egna varor kan svepas bort. En egen vara visar ingen "från [rätt]". När "Ångra" bara lyckas för en del av flera varor namnger felet de andra: "Det gick inte att ångra diskmedel.". En matsedel utan rätter men med egna varor visar "Vecka 44 · 1 vara kvar". Att lägga till eller ta bort en egen vara annonseras inte som en omräkning i live-regionen, eftersom borttagningen har en egen bekräftelse.
  - Egna varor läggs till, tas bort och ångras bara på den aktuella matsedeln, under matsedelslåset. Annars visas "Matsedeln har bytts. Listan är uppdaterad." och listan läses om. En matsedel med bara egna varor räknas inte som tom, så den blir en tidigare matsedel vid byte, och egna varor följer inte med vid "Använd igen".
  - Om egna varor inte går att läsa visas `shopping_unavailable` (Story 3.5).
- **Varför:** specen säger inte var knappen ligger, vad ett valt förslag gör med texten eller vad enhet utan mängd ger. Ett förslag träffar oftast på en del av namnet ("kaff"), så namnet är en bättre text än det Pontus hunnit skriva. Utan synlig koppling skulle en ändrad text tyst hamna under fel avdelning. En synonym från en fritext i butiken kan peka om en befintlig synonym och påverka hur recept matchas, och den sparades före kontrollen av matsedeln. Ett återanvänt id för en ändrad vara skulle tyst ge tillbaka den gamla varan.
- **Alternativ:** behålla Pontus text när ett förslag väljs; ta bort kopplingen när texten ändras; spara texten som synonym via `commitIngredients` (AD-6 som skriven); visa listan utan egna varor när de inte går att läsa.

## 2026-10-26 – Inköpslistans poster: hela styck, vaga rader och okopplade rader

- **Beslut:**
  - I en enhet som räknar hela saker (st, förp, klyfta, kruka, knippe, skiva) avrundas det som ska köpas uppåt till ett heltal, så 1,5 st blir 2 st. Jämförelsen med lagret använder det exakta behovet, och listnyckeln ändras inte.
  - Om en ingrediens saknas och har både en vag rad och en rad med mängd blir det en enda post: posten med mängd. Den vaga radens rätter läggs till i "från [rätt]", och ingen "Finns hemma?"-post visas.
  - En receptrad utan katalogingrediens skalas aldrig. Posten får i stället en faktor som är summan av rätternas skalfaktorer, avrundad till en decimal, och den visas när den inte är 1: "2 citroner ×2", "×1,5".
  - När katalogen saknar namn heter posten som radens text utan mängd och enhet. Som sista utväg heter den "Okänd vara".
  - En rätt vars recept är borttaget räknas inte, och listan säger "1 rätt med borttaget recept räknas inte." / "N rätter med borttagna recept räknas inte.". Räknas ingen rätt visas texten för tom matsedel (Story 3.3).
- **Varför:** man köper inte en halv paprika. "Salt 1 tsk" och "Salt – Finns hemma?" på samma lista säger samma sak två gånger. En okopplad rad som "2 citroner" ser annars likadan ut för 4 som för 8 portioner. "Allt finns hemma." får inte visas när ingen rätt har räknats (granskningen av 3.3).
- **Alternativ:** visa decimaler i alla enheter; behålla den vaga posten bredvid posten med mängd; skala texten i den okopplade raden, vilket kräver tolkning av fritext.

## 2026-10-26 – Inköpslistan när lagret inte går att läsa, och omräkning medan listan är öppen

- **Beslut:** om lagret inte går att läsa visas inköpslistan ändå, med hela behovet och utan avdrag. Överst står en blå `Notice` med `role="status"` och texten "Det gick inte att läsa lagret, så inget är avdraget från listan.". Den visas bara när någon rätt räknas. Utan aktuell matsedel läses lagret inte alls. Om matsedeln, recepten eller katalogen inte går att läsa visas bara `shopping_unavailable`. När listan räknas om medan den visas annonserar en live-region "Inköpslistan är omräknad. N varor kvar.". Texten töms efter 5 s och när listan döljs. Listan som visas när Pontus öppnar fliken annonseras inte. "från [rätt]" visar varje rätts titel en gång, även när samma recept står två gånger på matsedeln (Story 3.3).
- **Varför:** i butiken är en lista utan avdrag bättre än ingen lista, men den får inte se avdragen ut. Matrisen säger inte vad live-regionen säger. En rätt som står två gånger ska inte ge "från Linssoppa, Linssoppa".
- **Alternativ:** `shopping_unavailable` även när bara lagret fattas; ingen text i live-regionen, bara uppdaterad rubrikrad.

## 2026-10-26 – Tidigare matsedlar

- **Beslut:** "Ny matsedel" är en sekundärknapp överst i Tidigare och visar, liksom "Använd igen", "Matsedeln är skapad." på Matsedel. Ingen av dem frågar i förväg, eftersom den förra matsedeln finns kvar som tidigare. En tidigare matsedel visas utan bild och status, med titel (länk till receptet) och portioner. Efter "Ta bort matsedel" hamnar Pontus i Tidigare med "Matsedeln är borttagen.". Den aktuella matsedeln går inte att ta bort därifrån, och dess adress under Tidigare leder till Matsedel. "Använd igen" kopierar rätternas sparade titlar, som när en rätt läggs till, och läser inte recepten igen. Datumet i listan skrivs med fasta svenska månadsförkortningar ("26 okt 2026"), så att servern och webbläsarna skriver likadant (Story 3.2).
- **Varför:** underlaget säger inte var "Ny matsedel" ligger eller vad som visas efter borttagning. Förhandsbekräftelse krävs bara för det som inte går att ångra (EXPERIENCE.md). `set_current_meal_plan` arbetar i databasen, och modulen läser inte recepttabellerna (AD-1).
- **Alternativ:** "Ny matsedel" i Matsedel-rubriken; nya titlar via `recipes.getRecipesByIds` vid "Använd igen"; `Intl` med "okt." som månadsförkortning.

## 2026-10-26 – Tidigare matsedlar efter granskningen

- **Beslut:** en aktuell matsedel utan rätter tas bort i stället för att bli tidigare när en ny blir aktuell. "Använd igen" går inte att trycka på när ingen rätt har kvar sitt recept, och databasen nekar en sådan källa. En tidigare matsedel tas bort under matsedelslåset, och en som redan är borta räknas som borttagen. Ett nytt försök med ett id som hunnit bli en tidigare matsedel nekas. Nya texter: "Matsedeln finns inte längre.", "Matsedlarna har ändrats.", "1 rätt med borttaget recept följer inte med." / "N rätter med borttagna recept följer inte med." och "Alla recept på matsedeln är borttagna, så den går inte att använda igen." (Story 3.2).
- **Varför:** granskningen av 3.2. Tomma matsedlar i Tidigare går inte att använda igen och gör listan svårläst. "Använd igen" och "Ta bort" av samma matsedel ska aldrig krocka.
- **Alternativ:** behålla tomma matsedlar; skapa en tom matsedel när inget går att använda igen.

## 2026-10-26 – Matsedelsrätten och arket Lägg till rätt

- **Beslut:** en matsedelsrätt har en synlig textknapp "Ta bort" bredvid portionsväljaren, utöver svep vänster. Arket Lägg till rätt visar Favoriter, sökfältet och under det övriga recept (de som inte är favoriter) tills Pontus söker; då visas sökträffarna i stället. Ett tryck på ett recept stänger arket och visar "Lagt på matsedeln.", som i receptvyn. Statusen på en rätt räknas i webbläsaren med `recipeStatus`, så att den följer portionsväljaren direkt (Story 3.1).
- **Varför:** svepet är en genväg och åtgärden ska finnas på ett annat sätt också (EXPERIENCE.md), men en matsedelsrätt har inget detaljark. Utan en lista under sökfältet hittar Pontus inga recept i arket utan favoriter och utan att minnas namnet.
- **Alternativ:** ett detaljark för matsedelsrätten med "Ta bort"; bara sökfältet under favoriterna.

## 2026-10-26 – Receptrader utan katalogingrediens i lagningsstatus

- **Beslut:** en receptrad som saknar katalogingrediens (`ingredientId = null`) jämförs inte med lagret och räknas inte i N i "Saknar N varor". Receptvyn visar raden med originaltexten och en neutral markering, ett grått streck som skärmläsaren läser som "jämförs inte med lagret", i stället för bock eller ring. Ett recept vars övriga rader finns hemma visas som "Kan lagas nu" (Story 2.4).
- **Varför:** lagervaror pekar alltid på en katalogingrediens, så en rad utan koppling har inget att jämföras med. Om raden räknades som saknad skulle receptet visa "Saknar 1 vara" som Pontus aldrig kan åtgärda i Hemma.
- **Alternativ:** räkna raden som saknad, så att receptet aldrig blir "Kan lagas nu" förrän raden kopplas; eller jämföra originaltexten med lagervarornas namn, vilket bryter mot att bara katalogen matchar (AD-6).

## 2026-10-26 – Mängd utan enhet räknas som styck

- **Beslut:** en mängd utan enhet, till exempel receptraden "1 purjolök", räknas som `st`. I lagret får en mängd alltid en enhet: utan vald enhet sparas `st`. Lagningsstatus och inköpslistan jämför receptrader utan enhet som `st`, och listnyckeln blir `r:<id>:st`.
- **Varför:** lagret och listan måste kunna jämföra "1 purjolök" i receptet med "2 purjolökar" hemma. `-` i listnyckeln är reserverat för vaga rader.
- **Alternativ:** en egen "ingen enhet"-nyckel; den hade krockat med vaga rader och obegränsade lagervaror.

## 2026-10-26 – Receptrader utan katalogingrediens på inköpslistan

- **Beslut:** en receptrad som saknar katalogingrediens blir en post under Övrigt med radens originaltext. Mängden räknas inte om och lagret dras inte av. Listnyckeln är `t:<normaliserad text>`, så samma text från flera rätter slås ihop. I lagningsstatus räknas raden fortfarande inte (Story 2.4).
- **Varför:** en rad som faller bort tyst kan betyda att något saknas när Pontus kommer hem från butiken. Att visa den neutralt är bättre.
- **Alternativ:** ingen post, vilket är enklare men gör att det kan saknas varor; eller kräva att varje rad kopplas till en katalogingrediens innan receptet sparas.

## 2026-10-26 – Logga ut gäller bara den här enheten

- **Beslut:** "Logga ut" i Inställningar avslutar sessionen i den här webbläsaren (`scope: "local"`). Pontus är fortfarande inloggad på andra enheter.
- **Varför:** att logga ut på datorn ska inte logga ut telefonen mitt i handlingen.
- **Alternativ:** global utloggning av alla enheter. Kan läggas till som en egen knapp om det behövs.

## 2026-10-25 – Receptsajter stängs av, raderas inte

- **Beslut:** en godkänd receptsajt tas aldrig bort ur `recipe_site`; Pontus stänger av den (`is_active = false`). `ensure_user_defaults()` lägger bara till saknade sajter och aktiverar aldrig en avstängd. Story 1.12 bygger inställningarna så.
- **Varför:** annars skulle en borttagen standardsajt komma tillbaka vid nästa inloggning.
- **Alternativ:** radering med en "borttagen"-markering; mer komplext.

## 2026-10-25 – Längre tidsgräns för AI-tolkning

- **Beslut:** varje AI-försök får 100 s och hela tolkningen 115 s (tidigare 45 s respektive 110 s). Ett nytt försök vid ogiltigt svar görs bara om tiden räcker.
- **Varför:** Qwen3.6 i LM Studio (ca 45 token/s) behövde 40–56 s för fulla recept från koket.se, ica.se och arla.se; med 45 s fick ungefär hälften `ai_unavailable`. 115 s ryms i routens `maxDuration` (120 s) och Vercels gräns (300 s).
- **Alternativ:** kortare AI-svar eller snabbare modell; kan prövas senare.

## 2026-10-25 – En ingrediensrad kopplas till ett steg

- **Beslut:** en receptrad sparar bara sitt första steg (`recipe_ingredient.step_id`), även om AI:n kopplar raden till flera steg. Stegläget (Epic 4) visar raden vid första användningen.
- **Varför:** datamodellen har ett `step_id`, och det räcker för att visa vad som behövs när.
- **Alternativ:** en kopplingstabell rad–steg; tas upp om stegläget behöver det.

## 2026-10-25 – Grenskydd på main

- **Beslut:** `main` är skyddad. Lint, typecheck, test, e2e och gitleaks måste passera, grenen måste vara à jour, allt går via PR och skyddet gäller även administratörer. Force push och radering är avstängda. Inga godkännanden krävs på GitHub (en användare); kodgranskningen görs av BMAD:s granskningssteg (AD-23).
- **Följd:** även dokumentändringar går via en gren och PR. Planeringsdokumenten committades till `main` innan skyddet sattes.
- **Alternativ:** skydd utan att gälla administratörer – då kan en push gå förbi kontrollerna utan att det märks.

## 2026-10-25 – Epics och stories

Epics och stories: `_bmad-output/planning-artifacts/epics.md` (7 epics, 33 stories). Beslut:

- **Briefens sju epics behålls**, så att de stämmer med boardens Epic-fält. Grunden (projekt, inloggning, app-skal, AI-tjänst, katalog) ligger som de fem första storyna i Epic 1. Alternativ: en separat grund-epic – ger ingen användarnytta på egen hand.
- **Lagningsstatus i biblioteket byggs i Epic 2** (när lagret finns), och filtret "Kan lagas nu" med rangordning i Epic 5. Briefen lägger båda i Epic 5; flytten gör att kärnan (Epic 1–3) visar status direkt.
- **Receptvyn finns redan i Epic 1** (efter sparning), och portioner, "X av Y hemma" och stegläge kommer i Epic 4.
- **Story 3.8 förbereder molndriften** (säkerhetskopiering, driftbeskrivning, ett flöde från början till slut i CI) utan Pontus konton.
- **Tabeller skapas i den story som först behöver dem**, t.ex. butikstabellen först i Epic 7.

## 2026-10-25 – Arkitektur

Arkitektur: `_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md` (23 beslut, AD-1–AD-23). Granskad av fyra oberoende granskare; rapporterna ligger i `reviews/`. De viktigaste besluten:

- **Modulär monolit** med en modul per område (katalog, recept, lager, matsedel, inköpslista, förslag, inställningar). Varje tabell har en ägarmodul. Alternativ: lager per teknik (alla sidor, all databaskod) – ger mer koppling mellan områden.
- **Inköpslistan räknas fram vid varje visning** från matsedeln och lagret; bara bockar, ändrade mängder, dolda poster och egna varor sparas. Varför: listan kan aldrig bli inaktuell (FR-18). Alternativ: lagrad lista som byggs om vid ändring (addendum) – risk för glapp.
- **"Finns hemma" räknas på ett ställe** (`coverage`, `recipeStatus`), så att bibliotek, matsedel, receptvy och lista är överens. En matsedelsrätt kan visa "Kan lagas nu" medan listan föreslår samma vara när två rätter delar den; det är avsiktligt.
- **Förhandsgranskning och bildanalys skriver inget.** Nya katalogingredienser skapas först när Pontus sparar eller bekräftar (FR-6, FR-25).
- **Inloggning:** registrering avstängd i Supabase och e-postadressen kontrolleras mot tillåtelselistan vid varje anrop. Varför: den publika nyckeln gör annars att vem som helst kan skapa konto och nå AI:n på Macen.
- **Recept med inbyggd receptdata (JSON-LD) tolkas ändå av AI:n.** Varför: koket.se blandar in rubriker och tasteline.com saknar mängder.
- **Okänd enhet gör raden vag** (blir "finns hemma?") i stället för att räknas som "st".
- **Foton förminskas i mobilen** till högst 1,5 MB före uppladdning (Vercels gräns är 4,5 MB) och sparas aldrig.
- **Katalogingredienser slås inte ihop i v1.**
- **TypeScript 5 och ESLint 9** i stället för senaste 7 och 10, eftersom Next.js startmall låser dem.
- **Moln i Stockholm** (Vercel `arn1`, Supabase `eu-north-1`). Veckovis krypterad säkerhetskopia via GitHub Actions, som också hindrar att gratisprojektet pausas.

## 2026-10-25 – UX: DESIGN.md och EXPERIENCE.md

UX: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/`. Beslut utöver UX-specen:

- **Mörkt läge** har egna härledda färger i samma färgfamiljer, och alla textpar är kontrollerade mot 4,5:1. Läget följer systemets inställning; det finns ingen växlare i appen. Alternativ: växlare i inställningarna (skjuts upp).
- **`ink-3` bara på vita ytor.** Mot sidbakgrunden ger den 4,28:1, vilket är under kravet. Text direkt på bakgrunden använder `ink-2`.
- **Inga skuggor**; djupet kommer från bakgrund mot vit yta, som i skisserna.
- **Import** startar från "+" i Recept-rubriken, i ett ark med flikarna Länk, Text och Foto.
- **Matsedel** (ej skissad): kort som receptraderna, med portionsväljare och status. "Lägg till rätt" visar favoriter först, så att en favorit kräver två tryck (SM-4).
- **Stegläge** (ej skissat): helskärm, 24 px stegtext, stegets ingredienser ovanför och Föregående/Nästa i tumzonen.
- **Inställningar** nås via kugghjul i Recept-rubriken på mobil och längst ned i sidomenyn på dator. Produktval anges per vara i listpostdetaljen.
- **Fel och varningar** visas i blått. Borttagning ångras via en kort bekräftelse; förhandsbekräftelse krävs bara för att ta bort recept och matsedlar.
- **Brytpunkt för dator** är 1024 px.

## 2026-10-25 – PRD: tolkningar av briefen

PRD: `_bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md`. Beslut som inte står uttryckligen i briefen:

- **Tillåtelselista för e-post** utöver engångslänk (FR-1). Varför: adressen är publik och det finns bara en användare. Alternativ: öppen registrering med RLS (vem som helst kan skapa konto och använda AI:n).
- **Vaga mängder** ("efter smak", "en nypa") blir en "finns hemma?"-post i listan, bara om varan saknas i lagret (FR-15). Varför: briefens risktabell; undviker brus för salt och peppar.
- **Olika enheter räknas inte om**; listposten visar båda sida vid sida (FR-15). Från briefens risktabell. Alternativ: omräkning via vikt per dl/st (skjuts upp).
- **Listan räknas om när matsedeln ändras** men behåller avbockningar och egna varor (FR-18). Varför: annars tappas arbete i butiken.
- **Förvalda portioner** på matsedeln = receptets originalportioner (FR-13).
- **Tänd skärm** via Screen Wake Lock, med en notis när webbläsaren saknar stöd (FR-21).
- **"Skicka till ICA"** kopierar en varukorgsexport till urklipp; appen gör aldrig något i butiken själv (FR-26). Steg 3 (inbyggd agent) ingår inte.
- **Nät krävs i butiken** i v1 (öppen fråga om offline).

## 2026-10-25 – GitHub-repot är publikt

- **Beslut:** `Snowstar66/matkoll` får vara publikt, trots att `autonomi.md` säger privat. Beslutat av Pontus.
- **Varför:** Pontus val; inget i underlaget är känsligt.
- **Konsekvens:** hemlighetsskanningen (vid commit och i CI) är extra viktig, eftersom allt som pushas blir synligt direkt. Inga hemligheter, personuppgifter eller riktiga ICA-uppgifter utöver butiks-id får committas.
- **Alternativ:** privat repo (ursprunglig standard i `autonomi.md`).

## 2026-10-25 – Lokal utvecklingsmiljö

- **Beslut:** OrbStack som Docker-motor för lokal Supabase. `gh`, `pnpm` (via corepack) och Supabase CLI installerade i `~/.local/bin`, eftersom Homebrew saknas och `/usr/local/bin` kräver administratörsrättigheter.
- **Varför:** OrbStack är lättare än Docker Desktop på Mac. Kubernetes och Linux-maskiner i OrbStack behövs inte.
- **OrbStack-inställningar:** start vid inloggning på; `docker.expose_ports_to_lan` och `machines.expose_ports_to_lan` av, så att lokal Supabase (med standardlösenord) inte nås från andra på samma nätverk.
- **Alternativ:** Docker Desktop; Supabase i molnet redan under utveckling (skulle frångå ordningen i `autonomi.md`).
