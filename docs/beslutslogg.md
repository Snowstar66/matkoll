# Matkoll – beslutslogg

Beslut som fattats under bygget: vad, varför och vilka alternativ som fanns. Nyaste överst.

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
