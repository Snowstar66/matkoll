---
title: Matkoll
status: draft
created: 2026-10-25
updated: 2026-10-26
---

# PRD: Matkoll

## 0. Dokumentets syfte

PRD:n beskriver vad Matkoll ska kunna i första versionen, i en form som UX, arkitektur och epics/stories kan bygga vidare på. Den bygger på `docs/brief.md` (vision, beslut, epics, risker, effektmål), `docs/ux/ux-spec.md` med skisserna i `docs/ux/skisser/` och arbetsreglerna i `docs/autonomi.md`, och upprepar dem inte i onödan. Begreppen i ordlistan (§3) används exakt i resten av dokumentet. Funktionerna är grupperade i §4 med globalt numrerade krav (FR-1 …). Antaganden är märkta `[ANTAGANDE]` och samlade i §10. Teknikval och datamodell finns i `addendum.md`.

## 1. Vision

Matkoll gör om utvalda recept från nätet till en inköpslista som bara innehåller det som saknas hemma.

Idag tar det manuellt arbete att gå från "det här vill jag laga" till en korrekt inköpslista: läsa ingredienser från flera receptsajter, räkna om portioner, slå ihop dubbletter och stryka det som redan finns i kyl och skafferi. Matkoll automatiserar den kedjan och föreslår dessutom rätter utifrån det som finns hemma, så att mindre mat slängs.

Appen är ett enkelt hjälpmedel, inte ett exakt system: hellre ungefär rätt och snabbt än exakt och krångligt. Varje funktion ska gå att använda utan instruktioner.

## 2. Målanvändare

### 2.1 Jobb att få gjort

- Planera veckans måltider och få en inköpslista utan att skriva av recept för hand.
- Slippa köpa det som redan finns hemma, och använda upp det som finns innan det blir dåligt.
- Snabbt återkomma till favoriträtter.
- Få idéer när fantasin tar slut.
- Laga mat från mobilen i köket utan att skärmen slocknar eller texten är för liten.

### 2.2 Inte för (v1)

En enda användare: Pontus. Inga delade hushåll, inga andra användare, ingen publik registrering.

### 2.3 Användarresor

- **UJ-1. Pontus sparar ett recept hen hittat.** På mobilen hittar Pontus ett recept på koket.se, kopierar länken och klistrar in den under Recept. Matkoll visar det tolkade receptet i enhetligt format; hen rättar en ingrediens som kopplats fel och sparar. Receptet ligger nu i biblioteket med status "Saknar 3 varor". **Kantfall:** sajten blockerar hämtningen. Matkoll säger det rakt ut och erbjuder att klistra in recepttexten i stället.
- **UJ-2. Pontus planerar veckan och handlar.** På söndagen öppnar Pontus Matsedel, lägger till två favoriter (två tryck var) och ett nytt recept, och ändrar portionerna på ett av dem. Under Lista finns en inköpslista grupperad per butiksavdelning, där det som finns hemma redan är avdraget. Hen lägger till "diskmedel" som egen vara, trycker "Skicka till ICA" och låter Claude in Chrome fylla varukorgen, eller handlar i butiken och bockar av med en hand. Hemma trycker hen "Lägg i lagret" och de avbockade varorna hamnar i lagret.
- **UJ-3. Pontus uppdaterar lagret.** Under Hemma väljer Pontus kortet Kyl och trycker "Fotografera kylen". Matkoll föreslår sex varor; hen bekräftar fyra, rättar en och avvisar en. Smör och salt ligger redan som "Finns hemma" utan mängd.
- **UJ-4. Pontus lagar mat.** Pontus öppnar ett recept, väljer fyra portioner och trycker "Laga nu". Ett steg i taget visas med stor text och stegets ingredienser; skärmen håller sig tänd.
- **UJ-5. Pontus vet inte vad hen ska laga.** Pontus filtrerar biblioteket på "Kan lagas nu" och ser rätterna rangordnade efter hur lite som saknas. Inget passar, så hen ber om AI-förslag utifrån lagret, får tre tydligt märkta förslag och sparar ett i biblioteket.

## 3. Ordlista

- **Recept** – en rätt med titel, originalportioner, receptrader, steg, ev. bild och källa. Tillhör receptbiblioteket.
- **Receptbibliotek** – alla Pontus sparade recept.
- **Favorit** – recept markerat för snabb återanvändning.
- **Källa** – den URL ett recept importerades från. Sparas alltid för länkade recept.
- **Godkänd receptsajt** – domän som receptimport får hämta från. Listan underhålls i inställningarna.
- **Receptimport** – att skapa ett recept från en länk, inklistrad text eller ett foto av en kokbokssida.
- **Förhandsgranskning** – vyn efter receptimport där receptet kan rättas innan det sparas.
- **Ingredienskatalog** – den gemensamma listan över normaliserade ingredienser med synonymer, butiksavdelning, plats och standardenhet. Byggs löpande. Receptrader, lagervaror och listposter pekar på en katalogingrediens.
- **Katalogingrediens** – en post i ingredienskatalogen, t.ex. "gul lök".
- **Receptrad** – en ingrediensrad i ett recept: originaltext, mängd, enhet och katalogingrediens. Kan vara vag.
- **Vag mängd** – mängd som inte går att räkna, t.ex. "efter smak" eller "en nypa".
- **Lager** – det som finns hemma, uppdelat på platser.
- **Lagervara** – en katalogingrediens i lagret med plats och valfri mängd och enhet.
- **Obegränsad** – lagervara utan mängd. Räknas som att den alltid räcker.
- **Plats** – Kyl, Frys eller Skafferi.
- **Matsedel** – ett urval rätter för en period, var och en med valt antal portioner.
- **Matsedelsrätt** – ett recept på en matsedel med valt antal portioner.
- **Inköpslista** – det som behöver köpas för en matsedel, efter avdrag mot lagret, plus egna varor.
- **Listpost** – en rad i inköpslistan: katalogingrediens, beräknad mängd och enhet, avbockad eller inte, ursprung (vilka matsedelsrätter).
- **Egen vara** – listpost som inte kommer från ett recept.
- **Butiksavdelning** – grupp i inköpslistan: Frukt och grönt, Bröd, Mejeri, Kött och fisk, Chark, Frys, Skafferi, Dryck, Övrigt.
- **Lagningsstatus** – för ett recept: "Kan lagas nu" om inget saknas i lagret, annars "Saknar N varor".
- **Stegläge** – visning av ett recept ett steg i taget.
- **AI-förslag** – rätt som AI föreslår utifrån lagret. Märks tydligt och ligger utanför receptbiblioteket tills det sparas.
- **Bildanalys** – AI-tolkning av ett foto av en plats som ger lagerförslag.
- **Lagerförslag** – en vara som bildanalysen föreslår. Blir lagervara först när Pontus bekräftat den.
- **Butik** – den matbutik på nätet som varukorgsexporten riktar sig till. Först: Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733).
- **Varukorgsexport** – text med inköpslistans varor (vara, mängd, ev. produktval) som kopieras för att fylla en varukorg i butiken.
- **Produktval** – den produkt Pontus brukar köpa för en katalogingrediens, t.ex. ett visst 5 dl-paket grädde.
- **AI-tjänst** – serverns gränssnitt mot språkmodellen med tre funktioner: tolka recept, analysera bild, föreslå rätter.

## 4. Funktioner

### 4.1 Inloggning och åtkomst

**Beskrivning:** Appen ligger på en publik adress men har bara en användare. All data och alla serverfunktioner kräver inloggning.

#### FR-1: Inloggning med engångslänk

Pontus kan logga in med en engångslänk till sin e-post och förbli inloggad på enheten.

**Konsekvenser (testbara):**
- Utan inloggning omdirigeras varje sida till inloggningen, och varje serverfunktion svarar 401.
- Bara e-postadresser på en tillåtelselista (konfigurerad i miljön) kan logga in. Andra adresser får ingen åtkomst. `[ANTAGANDE: tillåtelselista utöver engångslänk, eftersom adressen är publik]`

#### FR-2: Dataisolering

All data tillhör en användare och går inte att läsa eller ändra utan att vara inloggad som den användaren.

**Konsekvenser (testbara):**
- Varje tabell har en användarkolumn och Row Level Security. Automatiska tester visar att en anonym klient och en annan användare varken kan läsa eller ändra något.

### 4.2 Receptimport

**Beskrivning:** Pontus lägger in recept på tre sätt: länk, inklistrad text eller foto av en kokbokssida. Alla vägar slutar i samma förhandsgranskning och samma enhetliga format, oavsett källa. Realiserar UJ-1.

#### FR-3: Import från länk

Pontus kan klistra in en länk till en godkänd receptsajt och få ett tolkat recept.

**Konsekvenser (testbara):**
- Servern hämtar sidan; webbläsaren hämtar aldrig från receptsajter.
- Länk till en domän som inte är en godkänd receptsajt avvisas med ett tydligt meddelande, utan att servern hämtar något.
- Om sidan har strukturerad receptdata (schema.org/Recipe) används den i första hand. Saknas den, eller är den ofullständig, tolkar AI-tjänsten sidans innehåll.
- Källan sparas på receptet.

#### FR-4: Import från text och foto

Pontus kan klistra in recepttext eller fotografera en kokbokssida och få ett tolkat recept.

**Konsekvenser (testbara):**
- Inklistrad text och foto ger samma förhandsgranskning som länkimport.
- Om länkimport misslyckas (sajten blockerar, timeout, inget recept hittas) erbjuds textinklistring direkt i felmeddelandet.

#### FR-5: Enhetligt format och katalogkoppling

Varje importerat recept omvandlas till Matkolls format.

**Konsekvenser (testbara):**
- Varje receptrad har originaltext, mängd, enhet och katalogingrediens. Mängd och enhet är tomma vid vag mängd, och raden märks som vag.
- Ingredienser kopplas mot en befintlig katalogingrediens (inklusive synonymer, t.ex. "lök, hackad" → "gul lök"). Finns ingen passande skapas en ny katalogingrediens med föreslaget namn, butiksavdelning och plats.
- Stegen skrivs om i samma stil oavsett källa.
- AI-tjänstens svar valideras mot ett schema. Ogiltigt svar ger ett nytt försök, och efter upprepade fel ett begripligt felmeddelande.

#### FR-6: Förhandsgranskning och rättning

Pontus kan granska och rätta det tolkade receptet innan det sparas.

**Konsekvenser (testbara):**
- Titel, portioner, receptrader (mängd, enhet, katalogingrediens) och steg går att ändra före sparning.
- Ingenting sparas i receptbiblioteket förrän Pontus sparar.
- Receptrader och katalogkopplingar går att rätta även efter sparning.

#### FR-7: Godkända receptsajter

Pontus kan lägga till och ta bort godkända receptsajter i inställningarna utan kodändring.

**Konsekvenser (testbara):**
- Startlistan är koket.se och tasteline.com. ica.se, arla.se och coop.se läggs till om importen fungerar där.
- En ny domän går att importera från direkt efter att den lagts till.

### 4.3 Receptbibliotek

**Beskrivning:** Alla recept samlas i ett bibliotek med enhetligt utseende. Realiserar UJ-1 och UJ-5.

#### FR-8: Bläddra, söka och filtrera

Pontus kan bläddra bland recepten, söka på titel eller ingrediens och filtrera på Alla, Favoriter och Kan lagas nu.

**Konsekvenser (testbara):**
- Varje recept visar bild, titel, tid, portioner och lagningsstatus.
- Lagningsstatus räknas om när lagret ändras.

#### FR-9: Favoriter

Pontus kan markera och avmarkera ett recept som favorit med ett tryck.

#### FR-10: Ändra och ta bort recept

Pontus kan ändra ett sparat recept och ta bort det. Borttagning kräver bekräftelse.

### 4.4 Lager

**Beskrivning:** Lagret visar vad som finns hemma per plats. Mängd är frivillig, och utan mängd räknas varan som obegränsad. Inget dras av automatiskt efter matlagning. Realiserar UJ-3.

#### FR-11: Hantera lagervaror

Pontus kan lägga till, ändra och ta bort lagervaror.

**Konsekvenser (testbara):**
- En lagervara pekar alltid på en katalogingrediens. Pontus söker i katalogen (även på synonymer) eller skapar en ny katalogingrediens.
- Mängd och enhet är valfria. Tom mängd sparas som obegränsad.
- Plats föreslås från katalogingrediensen och går att ändra.

#### FR-12: Visa lagret per plats

Pontus kan se lagret per plats.

**Konsekvenser (testbara):**
- Tre platskort (Kyl, Frys, Skafferi) visar antal varor. Valt kort är markerat.
- Lagervaror med mängd visas som rader med mängden till höger. Obegränsade visas som etiketter under "Finns hemma".

### 4.5 Matsedel

**Beskrivning:** Pontus väljer rätter och portioner. Matsedeln är utgångspunkten för inköpslistan. Realiserar UJ-2.

#### FR-13: Bygga en matsedel

Pontus kan skapa en matsedel och lägga till, ta bort och ändra portioner för matsedelsrätter.

**Konsekvenser (testbara):**
- En favorit läggs på matsedeln med högst två tryck, räknat från matsedelsvyn eller receptbiblioteket.
- Nya matsedelsrätter får receptets originalportioner som förval. `[ANTAGANDE]`
- Varje matsedelsrätt visar lagningsstatus.

#### FR-14: Återanvända matsedel

Pontus kan se tidigare matsedlar och skapa en ny utifrån en tidigare.

### 4.6 Inköpslista

**Beskrivning:** Inköpslistan räknas fram från matsedeln och lagret, och används sedan i butiken eller för varukorgsexport. Realiserar UJ-2.

#### FR-15: Beräkna inköpslistan

Matkoll beräknar inköpslistan från matsedeln.

**Konsekvenser (testbara):**
- Mängder skalas efter matsedelsrättens portioner i förhållande till receptets originalportioner.
- Receptrader med samma katalogingrediens och samma enhet slås ihop till en listpost.
- Katalogingredienser som är obegränsade i lagret hamnar aldrig på listan.
- Lagervaror med mängd i samma enhet dras av, och listposten försvinner när lagret räcker.
- Olika enheter räknas inte om. Listposten visar båda sida vid sida, t.ex. "mjöl 2 dl (hemma: 1 kg)", och Pontus avgör.
- Vaga mängder blir en "finns hemma?"-post utan beräknad mängd, om katalogingrediensen inte redan finns i lagret.

#### FR-16: Använda listan i butiken

Pontus kan använda listan med en hand i butiken.

**Konsekvenser (testbara):**
- Listposter grupperas per butiksavdelning och visar vilken matsedelsrätt de kommer från.
- Bockrutorna är minst 44 × 44 px, och en avbockning sparas direkt.

#### FR-17: Egna varor

Pontus kan lägga till egna varor (fritext, kopplas till katalogen om det går) och ta bort dem.

#### FR-18: Uppdatera listan när matsedeln ändras

När matsedeln ändras räknas listan om, utan att avbockningar eller egna varor försvinner.

#### FR-19: Lägga i lagret efter handlingen

Pontus kan med ett tryck lägga alla avbockade listposter i lagret.

**Konsekvenser (testbara):**
- Varje avbockad listpost blir en lagervara (eller ökar en befintlig med samma enhet) på katalogingrediensens plats.
- Listposter som lagts i lagret försvinner från listan.

### 4.7 Receptvy och stegläge

**Beskrivning:** Receptet visas likadant oavsett källa och kan följas steg för steg i köket. Realiserar UJ-4.

#### FR-20: Receptvy

Pontus kan öppna ett recept och välja antal portioner.

**Konsekvenser (testbara):**
- Mängder skalas direkt när portionerna ändras.
- Sammanfattningen "X av Y hemma" visas, och varje receptrad visar om den finns i lagret.
- På mobil ligger ingredienserna ovanför stegen, på dator sida vid sida.
- Knapparna "Lägg på matsedeln" och "Laga nu" finns.

#### FR-21: Stegläge

Pontus kan följa ett recept ett steg i taget.

**Konsekvenser (testbara):**
- Ett steg visas åt gången med stor text, tillsammans med de receptrader som hör till steget.
- Skärmen hålls tänd så länge stegläget är öppet. Om webbläsaren inte stöder det visas en diskret notis i stället för ett fel. `[ANTAGANDE: Screen Wake Lock]`

### 4.8 Förslag utifrån lager

**Beskrivning:** Matkoll föreslår vad som kan lagas med det som finns hemma, i första hand ur receptbiblioteket. Realiserar UJ-5.

#### FR-22: Rangordning ur biblioteket

Pontus kan se recepten i biblioteket rangordnade efter hur få varor som saknas.

#### FR-23: AI-förslag

Pontus kan be om AI-förslag utifrån lagret.

**Konsekvenser (testbara):**
- AI-förslag märks tydligt som AI-genererade och blandas inte ihop med receptbiblioteket.
- Ett AI-förslag kan sparas i biblioteket via förhandsgranskningen.

### 4.9 Bildanalys av lager

**Beskrivning:** Pontus fotograferar en plats och får lagerförslag. Inget sparas utan bekräftelse. Realiserar UJ-3.

#### FR-24: Fotografera en plats

Pontus kan fotografera en plats (eller välja en bild) från vyn för den platsen.

**Konsekvenser (testbara):**
- Kameraknappen följer vald plats ("Fotografera kylen").
- Bildanalysen ger lagerförslag kopplade till katalogingredienser, med vald plats som förval.

#### FR-25: Bekräfta lagerförslag

Pontus kan bekräfta, rätta eller avvisa varje lagerförslag.

**Konsekvenser (testbara):**
- Inget lagerförslag blir lagervara förrän det bekräftats.
- Avvisade lagerförslag sparas inte.

### 4.10 Varukorgsexport

**Beskrivning:** Inköpslistan kan föras över till butikens varukorg på nätet. Matkoll beställer aldrig. Pontus granskar varukorgen och väljer själv att beställa eller att använda den som lista i butiken. Steg 1 och 2 från briefen ingår. Steg 3, en inbyggd agent, ingår inte.

#### FR-26: Skicka till ICA

Pontus kan trycka "Skicka till ICA" längst ned i inköpslistan.

**Konsekvenser (testbara):**
- En varukorgsexport kopieras till urklipp. Den innehåller per icke avbockad listpost: vara, mängd och enhet, och produktval om ett sådant finns, plus butikens namn och adress.
- Exporten har ett stabilt, dokumenterat format som Claude in Chrome kan följa för att fylla varukorgen och rapportera osäkra matchningar separat.

#### FR-27: Produktval

Pontus kan spara vilken produkt hen brukar köpa för en katalogingrediens (namn, förpackningsstorlek, ev. länk). Produktvalet följer med i varukorgsexporten.

#### FR-28: Byta butik

Pontus kan ändra butik i inställningarna (namn, kedja, butiks-id, adress), även till andra kedjor.

## 5. Tvärgående krav (NFR)

- **NFR-1 Säkerhet:** All hämtning från receptsajter och alla anrop till AI-tjänsten sker i serverfunktioner. Nycklar finns bara på servern. Serverfunktionen hämtar bara från godkända receptsajter, och det testas automatiskt.
- **NFR-2 Utbytbar AI:** AI-tjänsten kan byta leverantör (lokal modell, Anthropic, OpenAI) via konfiguration, utan kodändring i funktionerna. Det finns en testleverantör (mock) så att tester körs utan modell.
- **NFR-3 Responsiv:** Alla vyer fungerar på mobil (från 375 px bredd) och dator. Mobil har fyra flikar längst ned (Recept, Matsedel, Inköpslista, Lagersaldo; flikarna hette Lista och Hemma före Story 10.4), dator en sidomeny.
- **NFR-4 Tillgänglighet:** Tryckytor minst 44 px och läsbar kontrast i både ljust och mörkt läge.
- **NFR-5 Utseende:** Designtokens och skärmregler från `docs/ux/ux-spec.md`. Inget rött. Ljust och mörkt läge.
- **NFR-6 Språk:** Gränssnittet är på svenska.
- **NFR-7 Svarstider (ungefärliga):** Lista, lager och receptbibliotek svarar inom en sekund. Receptimport och bildanalys får ta längre tid men visar förlopp, och går att avbryta eller göra om.
- **NFR-8 Tvingande kontroller:** Hemlighetsskanning, RLS-tester, test av domänbegränsning, lint och kodgranskning blockerar sammanslagning (se brief, AAS-styrning).

## 6. Begränsningar och skydd

- **Kostnad:** AI-tjänsten nås bara bakom inloggning. Under testfasen körs modellen lokalt på Pontus Mac, som måste vara igång.
- **Upphovsrätt:** Instruktionstexter och bilder från receptsajter används bara för eget bruk. Det måste kontrolleras innan appen öppnas för andra.
- **Butikens villkor:** Automatisk ifyllnad av varukorgen kan strida mot butikens villkor (ej kontrollerat). Matkoll gör därför aldrig något i butiken själv.

## 7. Utanför målbilden

- Flera användare och delat hushåll.
- Automatiskt lageravdrag efter matlagning eller inköp.
- Native app och dela-meny på iOS.
- Beställning i butiken utan att Pontus granskat varukorgen, och en inbyggd agent som fyller varukorgen (steg 3).
- Exakt enhetsomräkning, näringsvärden och kostnadsberäkning.

## 8. MVP-omfång

### 8.1 Ingår

- Epic 1–3 som fungerande kärna: receptimport och receptbibliotek, lager, matsedel och inköpslista (FR-1 till FR-19).
- Därefter Epic 4–6: receptvy och stegläge, förslag och bildanalys (FR-20 till FR-25).
- Epic 7, steg 1–2: varukorgsexport och produktval (FR-26 till FR-28).

### 8.2 Ingår inte

- Steg 3 i Epic 7 (inbyggd agent). Byggs bara om steg 1–2 inte räcker.
- Molndrift med extern AI-leverantör. AI-tjänsten är förberedd för det, men valet görs när appen ska användas av fler.

### 8.3 Efter 1.0

- **Version 1.1, Flera ställen (Epic 8):** lagret delas på ställen, till exempel Hemma och Stugan, och inköpslistan räknas mot det valda stället. Kraven FR-29–FR-33 och NFR-9, och de avgränsningar av befintliga krav som 1.1 ger, står i `addendum.md` under "Version 1.1: Flera ställen".
- **Senaste fotot per plats (Epic 10, tillägg till 1.1):** det senaste fotot av varje plats sparas privat när det har lett till en ändring i lagret och kan visas i Hemma med AI:ns avläsning och numren, i högst 30 dagar. Kraven FR-37–FR-39 och NFR-11 står i `addendum.md` under "Tillägg till 1.1: Senaste fotot per plats".
- **Nytt utseende (Epic 11, tillägg till 1.1):** appen ser ut och känns som en app i mobilen enligt tre skisser som Pontus godkände: kategorier med ikon, Lagersaldo utan mängder men med märke eller tid och en soptunna, en inköpslista med framsteg och "I korgen", kort i Recept och Matsedel, och Matkoll på hemskärmen med inloggning med kod. Kraven FR-40–FR-44 och NFR-12 står i `addendum.md` under "Tillägg till 1.1: Nytt utseende".
- **Snabbare och asynkron AI (Epic 12, tillägg till 1.1):** AI-flödena mäts och snabbas upp, och bildanalys, AI-förslag och receptimport körs som AI-jobb i bakgrunden, ett i taget i en kö, så att Pontus kan fortsätta i appen och få en kort bekräftelse och ett märke på fliken när ett resultat är klart. Kraven FR-45–FR-50 och NFR-13 står i `addendum.md` under "Tillägg till 1.1: Snabbare och asynkron AI".
- **Version 1.2, Veckans erbjudanden (Epic 9):** Matkoll hämtar veckans erbjudanden från butikens länk, som Pontus sparar i Inställningar (i 1.2 ica.se), eller läser dem ur inklistrad text eller ett foto av reklambladet. Erbjudandena visas som etiketter på inköpslistan, i filtret Erbjudanden i Recept, i "Fyll på lagret", i AI-förslagen och i ett förslag till veckans matsedel. Kraven FR-34–FR-36, FR-51–FR-54 och NFR-10 står i `addendum.md` under "Version 1.2: Veckans erbjudanden".

## 9. Effektmål

Bedöms enkelt efter fyra veckors användning, enligt briefens AAS-avsnitt.

**Primära**
- **SM-1 Mindre matsvinn:** Pontus köper sällan dubbelt och slänger märkbart mindre. Validerar FR-11, FR-15, FR-22.
- **SM-2 Tid för inköpslistan:** veckans inköpslista är klar på under 10 minuter. Validerar FR-3 till FR-6, FR-13, FR-15.
- **SM-3 Hela veckan i appen:** en vecka av riktiga måltider planeras i appen och ger en inköpslista som används i butiken utan manuell efterbearbetning. Validerar FR-13 till FR-19, FR-26.

**Sekundära**
- **SM-4 Snabbt till favoriter:** en favorit läggs på matsedeln med högst två tryck. Gäller från första versionen. Validerar FR-9, FR-13.
- **SM-5 Variation:** minst en ny rätt per vecka. Validerar FR-3, FR-23.

**Motmått (optimeras inte)**
- **SM-C1 Exakthet i mängder:** att jaga exakt enhetsomräkning eller exakta lagermängder gör appen krångligare och motverkar SM-2. Ungefär rätt räcker.
- **SM-C2 Antal bekräftelsesteg:** fler kontrollfrågor kan ge färre fel men långsammare flöden. Bekräftelse krävs bara där fel annars sparas tyst (förhandsgranskning, lagerförslag).

## 10. Öppna frågor och antaganden

### 10.1 Öppna frågor

1. Behöver inköpslistan fungera utan nät i butiken? Antagande för v1: nät krävs.
2. Vilka recept och kylskåpsfoton ska ingå i AI-testuppsättningen (10–20 recept)? Förslag tas fram av utvecklingen och bekräftas av Pontus.
3. Klarar ica.se, arla.se och coop.se serverhämtning? Testas tidigt i Epic 1.
4. Vilken molnleverantör för AI när appen ska användas av fler? Den billigaste som klarar testuppsättningen.

### 10.2 Antaganden

- §4.1 FR-1: tillåtelselista för e-post utöver engångslänk.
- §4.5 FR-13: nya matsedelsrätter får receptets originalportioner som förval.
- §4.6 FR-15: vaga mängder blir "finns hemma?"-poster bara om katalogingrediensen saknas i lagret.
- §4.6 FR-18: omräkning behåller avbockningar och egna varor.
- §4.7 FR-21: Screen Wake Lock används för tänd skärm, med en notis som reserv.
- §10.1: nät krävs i butiken i v1.
