---
name: Matkoll
status: final
updated: 2026-10-26
sources:
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - docs/brief.md
  - docs/ux/ux-spec.md
  - docs/ux/skisser/
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/addendum.md (version 1.1)
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-spara-foto.md (Epic 10)
---

# Matkoll – upplevelse

## Foundation

Den här filen och `DESIGN.md` gäller före skisserna i `docs/ux/skisser/` när de inte stämmer överens. `DESIGN.md` äger utseendet; den här filen äger struktur och beteende.

Matkoll är en webbapp, mobil först (från 375 px), som också fungerar på dator. Ingen native app. Inget komponentbibliotek; komponenterna byggs från tokens i `DESIGN.md` (teknikvalet står i `docs/autonomi.md`). Gränssnittet är på svenska och används av en person, Pontus. Ljust och mörkt läge följer systemets inställning.

Begreppen följer PRD:ns ordlista (§3) ordagrant: recept, receptbibliotek, matsedel, matsedelsrätt, inköpslista, listpost, lager, lagervara, plats, stegläge, AI-förslag, lagerförslag med flera. Från version 1.1 kommer **ställe** och **valt ställe** från addendumet ("Version 1.1: Flera ställen"). Ett ställe (Hemma, Stugan) har platserna Kyl, Frys och Skafferi, och ordet "plats" betyder fortfarande bara dem.

## Information Architecture

| Yta | Nås från | Syfte | PRD | Underlag |
| --- | --- | --- | --- | --- |
| Inloggning | Varje sida utan session | E-post → engångslänk | FR-1 | State Patterns |
| Recept (receptbibliotek) | Flik 1, startsida | Bläddra, söka, filtrera, favoriter, lagningsstatus | FR-8, FR-9, FR-22 | Skiss 1 |
| Importera recept (ark) | "+" i Recept-rubriken | Flikar Länk / Text / Foto | FR-3, FR-4 | Flöde 1, State Patterns |
| Förhandsgranskning | Efter import, eller "Spara" på ett AI-förslag | Rätta titel, portioner, receptrader, katalogkoppling, steg; spara | FR-5, FR-6, FR-23 | Skiss 2 (layout), Flöde 1 |
| Receptvy | Tryck på receptrad | Portioner, "X av Y hemma", ingredienser, steg, knappar | FR-20 | Skiss 2 |
| Ändra recept | "Ändra" i receptvyns meny (⋯) | Samma formulär som förhandsgranskningen; "Ta bort recept" längst ned | FR-6, FR-10 | Förhandsgranskning |
| Stegläge (Laga nu) | "Laga nu" i receptvyn | Ett steg i taget, skärmen tänd | FR-21 | Stegläge (komponent), Interaction Primitives, Responsive, Flöde 4, `{typography.step}` |
| AI-förslag | Filtret "Kan lagas nu", längst ned: "Föreslå rätter med AI" | Tre märkta förslag utifrån lagret | FR-23 | Flöde 5, AI-etikett |
| Matsedel | Flik 2 | Aktuell matsedel med matsedelsrätter och portioner | FR-13 | Matsedelsrätt (komponent), Flöde 2 |
| Lägg till rätt (ark) | "Lägg till rätt" i Matsedel | Favoriter först, sedan sök i biblioteket | FR-13 | Flöde 2 |
| Tidigare matsedlar | "Tidigare" i Matsedel-rubriken | Lista; "Använd igen" skapar en ny matsedel | FR-14 | Receptrad |
| Inköpslista | Flik 3 | Listposter per butiksavdelning, egna varor, Skicka till ICA, Lägg i lagret | FR-15–FR-19, FR-26 | Skiss 3 |
| Listpostdetalj (ark) | Tryck på varunamnet (inte bocken) | Rätta mängd, se ursprung, ange produktval, ta bort egen vara | FR-17, FR-27 | Ark |
| Hemma (lager) | Flik 4 | Platskort, lagervaror med och utan mängd | FR-11, FR-12 | Skiss 4 |
| Lagervara (ark) | "+" i Hemma eller tryck på en vara | Sök katalogingrediens, mängd, enhet, plats; ta bort | FR-11 | Ark |
| Fotografera plats | Kameraknappen i Hemma | Kamera eller bildval → bildanalys | FR-24 | Flöde 3 |
| Lagerförslag | Efter bildanalys | Bekräfta, rätta eller avvisa varje förslag | FR-25 | Lagerförslag (komponent), Flöde 3 |
| Ställesväljare (1.1) | I Hemma, ovanför platskorten, när det finns fler än ett ställe | Välja ställe: vilket lager Hemma visar och vad allt räknas mot | FR-30, FR-31 | Ställesväljare |
| Ställen (ark, 1.1) | "Ställen" i ställesväljaren, eller "Lägg till ställe" längst ned i Hemma när det bara finns ett ställe | Lägga till, byta namn och ta bort tomma ställen | FR-29 | Ark, Ställen |
| Byt ställe (ark, 1.1) | "Byt" på raden "Lager: Stugan" i Inköpslistan | Välja vilket ställe listan räknas mot. Det är samma val som i Hemma. | FR-32 | Ark, Flöde 6 |
| Senaste foto (rad, Epic 10) | I Hemma, direkt under kameraknappen, när platsen har ett sparat foto | Visa när platsen senast fotograferades, och öppna fotot | FR-38 | Senaste foto |
| Fotot av kylen (ark, Epic 10) | "Visa" på raden Senaste foto | Det sparade fotot med numren och AI:ns avläsning; ta bort fotot | FR-38, FR-39 | Ark, Fotoark |
| Inställningar | Kugghjul i Recept-rubriken (mobil), längst ned i sidomenyn (dator) | Godkända receptsajter, butik, logga ut | FR-7, FR-28 | Settings |

Ytor utan skiss (Matsedel, Stegläge, ark, inställningar och mörkt läge) byggs från tabellerna här och komponenterna i `DESIGN.md`.

## Voice and Tone

Kort, saklig och vänlig svenska. Du-tilltal. Inga utropstecken, inga emojis, ingen teknisk jargong. Säg vad som hände och vad Pontus kan göra.

| Gör | Gör inte |
| --- | --- |
| "Saknar 3 varor" | "3 ingredienser saknas i ditt lager!" |
| "Kan lagas nu" | "Du har allt du behöver 🎉" |
| "koket.se släppte inte in oss. Klistra in recepttexten i stället." | "Fel 403: Forbidden" |
| "ica.se är inte en godkänd receptsajt. Lägg till den i inställningarna." | "Ogiltig URL" |
| "Läser receptet …" / "Tittar på bilden …" | Bara en snurra |
| "Ta bort Krämig kycklinggryta? Det går inte att ångra." | "Är du säker?" |
| "Lagt 8 varor i lagret." | "Åtgärden lyckades" |
| "AI-förslag" som etikett | "Magi", "Smart", gnistor |
| "Lager: Stugan" | "Du befinner dig i Stugan" |
| "Lagt 8 varor i lagret för Stugan." | "Varorna har flyttats till stugan!" |

Knappar är verb: "Spara recept", "Lägg på matsedeln", "Laga nu", "Skicka till ICA", "Lägg i lagret", "Fotografera kylen".

**Ställen i texter (1.1):** när det bara finns ett ställe nämns det aldrig, och alla texter är som i 1.0. När det finns fler än ett ställe används två mönster, så att texten fungerar med vilket namn som helst (också "Hemma") utan böjning:
- en etikett med kolon: "Lager: Stugan";
- "för" + namnet: "Lagt 8 varor i lagret för Stugan.", "Ta bort alla 14 varor i kylen för Stugan?".

Matkoll skriver aldrig att Pontus *är* på ett ställe, bara vilket lager som gäller.

**Foton i texter (Epic 10):** tiden skrivs "idag 15:42", "igår 09:10" eller "24 okt 15:42", i svensk tid. Platsen står i bestämd form som i 1.0 ("fotot av kylen"), och stället nämns inte, eftersom Hemma redan visar vilket ställe som gäller. Texterna säger vad AI:n läste av, aldrig att den "såg" eller "förstod" något.

| Gör | Gör inte |
| --- | --- |
| "Senaste foto av kylen: idag 15:42" | "Din senaste kylbild 📷" |
| "AI:n läste av:" | "Det här såg AI:n" |
| "Ta bort fotot av kylen? Det går inte att ångra." | "Är du säker?" |

## Component Patterns

Beteende. Utseendet beskrivs under Components i `DESIGN.md`, med samma namn och ordning. Komponenter som bara har beteende (Matsedelsrätt, Stegläge) står sist.

| Komponent | Används i | Beteende |
| --- | --- | --- |
| Flikfält / Sidomeny | Alla huvudytor | Byter yta utan att tappa scrollposition eller filter i den yta man lämnar. |
| Sökfält | Recept, Lägg till rätt, Lagervara | Söker på titel och ingrediens (även synonymer) medan man skriver, efter 200 ms paus. |
| Filterpiller | Recept | Ett valt åt gången. "Kan lagas nu" sorterar efter antal saknade varor, minst först (FR-22). Valet sparas på enheten. |
| Receptrad | Recept, Lägg till rätt, AI-förslag | Tryck öppnar receptvyn. I Lägg till rätt lägger ett tryck i stället rätten på matsedeln och stänger arket. |
| Statusetikett | Receptrad, Matsedelsrätt | Räknas om när lagret ändras (FR-8). |
| AI-etikett | AI-förslag, förhandsgranskning av AI-förslag | Följer med tills receptet sparats. Ett sparat AI-förslag får källan "AI-förslag". AI-förslag visas i en egen sektion och blandas aldrig med biblioteket. |
| Hjärta | Receptrad, receptvy | Ett tryck växlar favorit och sparas direkt. Påverkar inte navigeringen. |
| Portionsväljare | Receptvy, Matsedelsrätt | − och + i steg om 1, minst 1. Mängder skalas direkt. I receptvyn påverkar valet bara visningen; i en matsedelsrätt sparas det. |
| Ingrediensrad | Receptvy, förhandsgranskning, stegläge | Visar bock (finns) eller ring (saknas). Vag mängd visar originaltexten, t.ex. "efter behov". I förhandsgranskningen får en osäker katalogkoppling ring och "Kontrollera", och en ny katalogingrediens märks "Ny". Rättad koppling sparas som synonym till katalogingrediensen. |
| Listpost | Inköpslista | Ett tryck på bocken bockar av posten, och det sparas direkt (FR-16). Ett tryck på texten öppnar listpostdetaljen. Avbockade poster stannar på sin plats tills de läggs i lagret. Varianter: **olika enheter** visar lagret bredvid, "mjöl 2 dl (hemma: 1 kg)" (FR-15); **vag mängd** vars vara saknas i lagret visas utan mängd med texten "Finns hemma?", och en avbockning betyder "har köpt den eller har den redan". |
| Platskort | Hemma | Tryck väljer plats. Listan, kameraknappens text och förvald plats för "+" och lagerförslag följer vald plats. Från 1.1 gäller korten och antalen valt ställe. |
| Ställesväljare (1.1) | Hemma | Visas när det finns fler än ett ställe: en rad med filterpiller med ställenas namn i den ordning de skapades, ovanför platskorten, och sist textknappen "Ställen". Valt ställe är fyllt. Ett tryck väljer stället direkt (optimistiskt), sparar valet på servern och visar dess platser. Vald plats (`?plats=`) behålls. Live-regionen säger "Valt ställe: Stugan.". Om valet inte går att spara går pillret tillbaka, och meddelanderutan visas. Raden radbryts och scrollar aldrig i sidled. Med ett enda ställe visas ingen väljare, utan textknappen "Lägg till ställe" längst ned i Hemma, under "Töm kylen". |
| Ställen (ark, 1.1) | Hemma | En rad per ställe med namn, antal varor ("12 varor") och "Valt" för valt ställe. Ett tryck på namnet ger ett textfält för nytt namn och "Spara". "Ta bort" finns bara för ett tomt ställe som inte är valt. Det tas bort direkt, utan fråga och utan "Ångra", eftersom inget går förlorat, och bekräftelsen säger "Tog bort Stugan.". Under listan finns fältet "Nytt ställe" (platshållare "Till exempel Stugan") och knappen "Lägg till". Ett nytt ställe väljs inte automatiskt, och bekräftelsen säger "Lade till Stugan. Välj det för att se och fylla dess lager.". |
| Raden "Lager" (1.1) | Inköpslista, Matsedel, receptvy, Recept med filtret "Kan lagas nu" | Visas bara när det finns fler än ett ställe: "Lager: Stugan" i `{typography.meta}` under sidrubriken (i receptvyn under "X av Y hemma"). I Inköpslistan finns textknappen "Byt" bredvid, och den öppnar arket Byt ställe. Raden annonseras inte när sidan laddas. |
| Byt ställe (ark, 1.1) | Inköpslista | Rubriken "Räkna listan mot". En rad per ställe, och valt ställe är markerat med bock. Ett tryck väljer stället (samma som i Hemma), stänger arket och visar "Listan räknas nu mot Stugan.". Listan räknas om. Bockar, rättade mängder, dolda poster och egna varor står kvar. |
| Senaste foto (Epic 10) | Hemma | Visas direkt under kameraknappen när platsen på det ställe Hemma visar har ett sparat foto som är yngre än 30 dagar: "Senaste foto av kylen: idag 15:42" i `{typography.meta}` och textknappen "Visa" (namn för skärmläsare: "Visa senaste foto av kylen"). Ingen miniatyr: fotot hämtas först vid "Visa". Raden följer vald plats och valt ställe. Saknas fotot visas ingen rad. Raden annonseras inte när sidan laddas. |
| Fotoark (Epic 10) | Hemma | Samma ark som fotot under granskningen (6.6): rubriken "Fotot av kylen", fotot som passar skärmen och växlar till full storlek vid tryck, och en numrerad markör på varje vara som fick en punkt. Underrubriken säger "Taget idag 15:42. Numren visar vad AI:n läste av.", eller bara "Taget idag 15:42." när punkterna saknas. Under fotot står "AI:n läste av:" och en numrerad lista med avläsningen, så att varje markör har en text. Sist textknappen "Ta bort fotot", som ersätter arket med frågan "Ta bort fotot av kylen? Det går inte att ångra." och knapparna "Ta bort" och "Avbryt". Efter borttagningen stängs arket, raden försvinner, och den korta bekräftelsen säger "Fotot av kylen är borttaget.". Arket stängs med "Stäng", Esc, svep nedåt eller tryck utanför, och fokus går tillbaka till "Visa". |
| Etikett för obegränsad vara | Hemma | Tryck öppnar arket Lagervara. |
| Kameraknapp | Hemma | Texten följer platsen: "Fotografera kylen / frysen / skafferiet". Öppnar bakre kameran på mobil och filväljaren på dator. |
| Fast åtgärdsknapp | Inköpslista, receptvy | Syns alltid. I inköpslistan blir "Lägg i lagret" primärknapp ovanför "Skicka till ICA" när minst en post är avbockad. |
| Ark | Importera recept, Lägg till rätt, Listpostdetalj, Lagervara, bekräftelser | Stängs med "Klar", "Avbryt", svep nedåt, Esc eller tryck utanför. Osparade ändringar ger frågan "Släng ändringarna?". Ark staplas aldrig: ett ark som öppnar en ny uppgift ersätter det första. |
| Meddelanderuta | Alla | Beständig. Visas överst i ytan där problemet uppstod, med en åtgärd när det finns en. Försvinner när problemet är löst. |
| Kort bekräftelse | Alla | Visas i 4 s efter en lyckad åtgärd ("Lagt 8 varor i lagret.", "Inköpslistan är kopierad."). Efter borttagning med knappen "Ångra" i 5 s. Annonseras via live-region. Högst en i taget. |
| Lagerförslag | Efter bildanalys | Varje förslag har Bekräfta, Rätta (öppnar arket Lagervara förifyllt) och Avvisa. "Bekräfta alla" finns, men inget sparas utan ett tryck. Plats är förvald till den plats som fotograferades. |
| Matsedelsrätt | Matsedel | Kort som Receptrad, med portionsväljare och statusetikett. Ändrade portioner räknar om inköpslistan. |
| Stegläge | Stegläge | Helskärm. "Steg 1 av 6", stegets receptrader ovanför stegtexten i `{typography.step}`, knapparna Föregående och Nästa i tumzonen. Skärmen hålls tänd med Screen Wake Lock. "Stäng" går tillbaka till receptvyn. |

## State Patterns

Gemensamma tillstånd först, sedan per yta i IA-ordning.

| Tillstånd | Yta | Hantering |
| --- | --- | --- |
| Inte inloggad | Alla | Omdirigering till Inloggning. Efter länkklick tillbaka till sidan man försökte nå. |
| Laddar | Alla listor | Skelettrader i kortens form, efter 300 ms. Inga helskärmssnurror. |
| Utan nät | Alla | Meddelanderuta: "Ingen anslutning. Ändringar sparas inte just nu." Offline ingår inte i v1. |
| AI-svar ogiltigt | Import, bildanalys, AI-förslag | Nytt försök sker tyst. Efter upprepade fel: "Det gick inte att tolka svaret. Försök igen." Vid import läggs "eller klistra in texten" till. |
| AI-tjänsten nås inte | Import, bildanalys, AI-förslag | "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" + "Försök igen". Resten av appen fungerar. |
| E-post inte tillåten | Inloggning | Samma besked som för en tillåten adress ("Om adressen har åtkomst får du en länk"), så att listan över tillåtna adresser inte avslöjas. |
| Tomt bibliotek | Recept | "Inga recept än. Klistra in en länk till ett recept du gillar." + knappen "Importera recept". |
| Ingen träff | Recept | "Inga recept matchar." + "Rensa sökning". |
| Inget kan lagas nu | Recept, filtret Kan lagas nu | Listan visas ändå, minst saknat först, och längst ned "Föreslå rätter med AI". |
| Länk i urklipp | Importera recept | Fliken Länk föreslår länken från urklipp när webbläsaren tillåter det; annars är fältet tomt. |
| Import pågår | Importera recept | "Läser receptet …" med förloppsrad och "Avbryt" (NFR-7). |
| Import blockeras, tar för lång tid eller hittar inget recept | Importera recept | Meddelanderuta med orsaken och knappen "Klistra in text i stället", som byter till fliken Text med fokus i textfältet (FR-4). |
| Domänen är inte godkänd | Importera recept | Meddelanderuta: "[domän] är inte en godkänd receptsajt." + "Öppna inställningar". Ingen hämtning görs. |
| AI-förslag hämtas | AI-förslag | "Letar efter idéer …" + "Avbryt". |
| Wake Lock saknas | Stegläge | Diskret rad överst: "Skärmen kan släckas i den här webbläsaren." Visas inte som fel (FR-21). |
| Tom matsedel | Matsedel | "Ingen rätt på matsedeln än." + "Lägg till rätt". |
| Tom inköpslista | Inköpslista | Med matsedel: "Allt finns hemma." Utan matsedel: "Lägg rätter på matsedeln så räknas listan fram." |
| Matsedeln ändrad | Inköpslista | Listan räknas om utan besked; avbockningar och egna varor står kvar (FR-18). |
| Export kopierad | Inköpslista | Kort bekräftelse: "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla." |
| Urklipp nekat | Inköpslista | Ark med exporttexten markerad och knappen "Kopiera". |
| Lagt i lagret | Inköpslista | Kort bekräftelse "Lagt N varor i lagret." Posterna försvinner från listan, och lagningsstatus räknas om. |
| Tom plats | Hemma | "Inget i kylen än." + "Lägg till vara" och "Fotografera kylen". |
| Bildanalys pågår | Lagerförslag | "Tittar på bilden …" + "Avbryt". |
| Inga lagerförslag | Lagerförslag | "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand." |
| Ett ställe (1.1) | Alla | Som i 1.0. Ingen ställesväljare, ingen rad "Lager" och inga ställesnamn i texterna. Bara "Lägg till ställe" längst ned i Hemma. |
| Nytt, tomt ställe (1.1) | Hemma | Platskorten visar "0 varor", och den tomma platsen visar som förut "Inget i kylen än." med "Lägg till vara" och "Fotografera kylen". |
| Valt ställe har bytts på en annan enhet (1.1) | Alla | Nästa sidladdning visar det nya stället. En skrivning som startades i den gamla vyn sparas ändå på det ställe vyn visade (FR-33). |
| Stället finns inte längre (1.1) | Hemma, Inköpslista, Lagerförslag | Meddelanderuta: "Stället finns inte längre. Välj ett annat ställe." Inget sparas. |
| Namnet finns redan (1.1) | Ställen | Under fältet: "Det finns redan ett ställe som heter Stugan." |
| För många ställen (1.1) | Ställen | Under fältet: "Du kan ha högst 10 ställen." Fältet och "Lägg till" är inaktiva. |
| Stället kan inte tas bort (1.1) | Ställen | Ingen "Ta bort". För valt ställe står "Valt", och för ett ställe med varor står antalet. Raden förklarar inget mer. |
| Tom inköpslista med flera ställen (1.1) | Inköpslista | Med matsedel: "Allt finns i lagret för Stugan." |
| Lagt i lagret med flera ställen (1.1) | Inköpslista | "Lagt 8 varor i lagret för Stugan." |
| Fotot under granskningen (Epic 10) | Lagerförslag | Underrubriken i fotoarket säger "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något." i stället för "… Det sparas inte.". |
| Fotot sparas (Epic 10) | Lagerförslag | Inget syns. Fotot sparas i bakgrunden efter den första bekräftelsen, och raden Senaste foto visas när Hemma läses om. Misslyckas sparandet visas inget fel. |
| Inget sparat foto (Epic 10) | Hemma | Ingen rad. Det gäller också en plats vars foto är äldre än 30 dagar. |
| Fotot finns inte längre (Epic 10) | Fotoark | I stället för fotot: "Fotot finns inte längre.". Raden försvinner när Hemma läses om. |
| Fotot laddas (Epic 10) | Fotoark | Arket har fotots storlek från början, så att det inte hoppar. Markörerna visas när fotot är laddat. |
| Fotot kan inte tas bort (Epic 10) | Fotoark | Meddelanderuta i arket: "Det gick inte att ta bort fotot. Försök igen.". Fotot står kvar. |
| Töm en plats med flera ställen (1.1) | Hemma | Frågan: "Ta bort alla 14 varor i kylen för Stugan?". Bekräftelsen: "Tog bort 14 varor ur kylen för Stugan." |

## Interaction Primitives

- Tryck för att göra något. Viktiga handlingar har alltid en synlig knapp.
- Svep vänster på en listpost, lagervara eller matsedelsrätt för att visa "Ta bort". Svepet är en genväg; samma åtgärd finns i detaljarket. Borttagningen kan ångras i den korta bekräftelsen.
- Stegläge: svep vänster eller höger byter steg, men knapparna Föregående och Nästa finns alltid.
- Bekräftelse i förväg krävs bara för det som inte går att ångra: ta bort recept och ta bort matsedel. Övriga borttagningar kan ångras i den korta bekräftelsen.
- **Används inte:** dra och släpp för omsortering, långtryck som enda väg till en funktion, karuseller, aviseringar, siffermärken på flikar.

## Accessibility Floor

Kontrast och storlekar finns i `DESIGN.md`.

- Alla tryckytor är minst 44 × 44 px, även bockar, hjärtan, − och + (NFR-4).
- Varje interaktivt element har ett namn och ett tillstånd för skärmläsare: "Paprika, röd, 1 st, inte avbockad", "Favorit, på".
- Status förmedlas aldrig bara med färg: "Kan lagas nu" och "Saknar N varor" är text, och bock och ring har olika form.
- Tangentbord fungerar på dator: synlig fokusram i `{colors.accent}`, logisk tabbordning, Esc stänger ark.
- Ändringar som sker i bakgrunden (listan räknas om, kort bekräftelse) annonseras via en live-region.
- "Minska rörelse" stänger av arkens glidanimation och animationen vid stegbyte.
- Sidan fungerar med 200 % textförstoring utan vågrät scroll.

## Inspiration & Anti-patterns

- **Från Mela:** samma receptformat oavsett källa; förhandsgranskning före sparning.
- **Från Crouton:** favoriter som snabbaste vägen; översiktlig matsedel.
- **Från Mealime:** rakt flöde från valda rätter till inköpslista utan mellansteg.
- **Undviks:** exakta lagermängder och omräkning mellan enheter, eftersom det gör appen krångligare utan att listan blir bättre (PRD motmått SM-C1); bekräftelsesteg som inte förhindrar att fel sparas tyst (SM-C2); receptsajternas layout och reklam; rött som varningsfärg.

## Responsive & Platform

Den enda källan för vad som ändras vid brytpunkten (`{spacing.breakpoint-desktop}` i `DESIGN.md`).

| | Mobil | Dator |
| --- | --- | --- |
| Navigering | Flikfält längst ned | Sidomeny till vänster |
| Receptvy | Bild, portioner, ingredienser, sedan steg | Ingredienser och steg sida vid sida |
| Ark | Glider upp nedifrån | Dialog i mitten |
| Kamera | Bakre kameran direkt | Filväljare |
| Stegläge | Helskärm | Helskärm; piltangenterna byter steg |

iPhone Safari är huvudmålet. Innehållet håller sig innanför säkerhetsmarginalerna, och inmatningsfält har minst 16 px text så att sidan inte zoomar.

## Key Flows

### Flöde 1 – Spara ett recept (UJ-1, Pontus på soffan med mobilen)

1. Pontus hittar ett recept på koket.se, kopierar länken och öppnar Matkoll.
2. Hen trycker på "+" i Recept-rubriken. Arket öppnas på fliken Länk med länken ifylld.
3. "Läser receptet …" i några sekunder.
4. Förhandsgranskningen visar receptet i Matkolls format. Raden "1 lök, hackad" har ljusblå ring och "Kontrollera".
5. Hen trycker på raden och byter katalogingrediens till "gul lök".
6. **Klimax:** hen trycker "Spara recept" och hamnar i receptvyn med etiketten "Saknar 3 varor". Receptet ser ut som alla andra.

### Flöde 2 – Planera veckan och handla (UJ-2, söndag kväll och måndag i butiken)

1. Pontus öppnar Matsedel och trycker "Lägg till rätt".
2. Arket visar Favoriter överst. Hen trycker på Krämig kycklinggryta, och rätten ligger på matsedeln efter två tryck. Hen gör likadant med en favorit till.
3. Hen söker fram ett nytt recept, lägger till det och ändrar portionerna till 6 med +.
4. Under Lista ligger inköpslistan grupperad per butiksavdelning, med det som finns hemma redan avdraget.
5. Hen trycker "Lägg till egen vara" och skriver "diskmedel".
6. Hen trycker "Skicka till ICA". Exporten kopieras, och hen klistrar in den i Claude i Chrome på ICA Handla.
7. Alternativt handlar hen i butiken och bockar av med tummen, avdelning för avdelning.
8. **Klimax:** hemma trycker hen "Lägg i lagret". "Lagt 8 varor i lagret." Listan är tom och recepten byter till "Kan lagas nu".

### Flöde 3 – Uppdatera lagret med kameran (UJ-3, Pontus framför öppen kyl)

1. Pontus öppnar Hemma och väljer kortet Kyl.
2. Hen trycker "Fotografera kylen" och tar en bild.
3. "Tittar på bilden …"
4. Sex lagerförslag visas. Hen bekräftar fyra, rättar "grädde" till "matlagningsgrädde 2 dl" och avvisar ett.
5. **Klimax:** kortet Kyl visar "16 varor", och Smör och Salt står kvar som "Finns hemma"-etiketter.

### Flöde 4 – Laga mat (UJ-4, Pontus i köket med mobilen lutad mot väggen)

1. Pontus öppnar Krämig kycklinggryta och väljer 4 portioner.
2. Hen trycker "Laga nu".
3. Stegläget visar steg 1 av 6 i stor text.
4. Hen trycker Nästa med en ren knoge.
5. **Klimax:** skärmen är fortfarande tänd vid steg 5, tjugo minuter senare.

### Flöde 5 – Vad ska jag laga? (UJ-5, Pontus en tisdag utan plan)

1. Pontus väljer filtret "Kan lagas nu".
2. Recepten visas efter hur lite som saknas. Inget lockar.
3. Längst ned trycker hen "Föreslå rätter med AI".
4. Tre förslag visas, alla märkta "AI-förslag".
5. **Klimax:** hen trycker "Spara" på ett förslag, granskar det i förhandsgranskningen och det läggs i biblioteket med etiketten "Kan lagas nu".

### Flöde 6 – Handla inför resan till stugan (UJ-6, version 1.1, fredag eftermiddag)

1. Pontus lägger helgens tre rätter på matsedeln som vanligt.
2. Under Lista står "Lager: Hemma · Byt". Hen trycker "Byt" och väljer Stugan i arket "Räkna listan mot".
3. "Listan räknas nu mot Stugan." Ketchup försvinner från listan, eftersom den finns i stugans kyl, och senap kommer med, eftersom den är slut där.
4. Pontus handlar på vägen och bockar av.
5. I stugan trycker hen "Lägg i lagret". "Lagt 9 varor i lagret för Stugan."
6. **Klimax:** under Hemma står Stugan som valt ställe, och i kylen finns det hen just köpte. Lagret hemma är orört.
7. På söndagen väljer hen Hemma i ställesväljaren igen.

**Variant, se stugans lager hemifrån:** i Hemma trycker Pontus på pillret Stugan, ser att kaffet är slut i skafferiet och trycker på Hemma igen. Valet gäller hela appen tills det byts, så raden "Lager: Stugan" syns i listan, matsedeln och receptvyn under tiden.

### Flöde 8 – Läste den rätt? (UJ-8, Epic 10, Pontus vid köksbänken)

Flöde 7 hör till Epic 9 (veckans erbjudanden), som vilar.

1. På lördagen fotograferar Pontus kylen, trycker "Bekräfta alla" och går vidare.
2. Ett par dagar senare ser Pontus "cappuccino" under Kyl i Hemma, fast det inte finns någon.
3. Under "Fotografera kylen" står "Senaste foto av kylen: 24 okt 15:42". Pontus trycker "Visa".
4. Fotot öppnas med numren. Under fotot står "AI:n läste av:" och listan. Nummer 7 sitter på en burk Schysst Käk, och i listan står "7 cappuccino".
5. **Klimax:** Pontus ser var felet kom ifrån, stänger arket och tar bort cappuccinon, eller rättar den till rätt vara.
6. Nästa gång Pontus fotograferar kylen och bekräftar något ersätter det nya fotot det gamla.

**Variant, ta bort fotot:** någon syns på fotot. Pontus trycker "Ta bort fotot" i arket och "Ta bort" i frågan. "Fotot av kylen är borttaget.", och raden försvinner.

## Settings

| Inställning | Beteende |
| --- | --- |
| Godkända receptsajter | Lista med domäner; lägg till (bara domännamn, valideras) och ta bort. Gäller direkt (FR-7). |
| Butik | Namn, kedja, butiks-id, adress. Förvald: Maxi ICA Stormarknad Östersund (FR-28). |
| Logga ut | Textknapp längst ned. |

Produktval (FR-27) anges per vara i listpostdetaljen och gäller för den katalogingrediensen i vald butik.

Ställen (1.1, FR-29) hanteras i Hemma, i arket Ställen, och inte i Inställningar, eftersom de hör till lagret.
