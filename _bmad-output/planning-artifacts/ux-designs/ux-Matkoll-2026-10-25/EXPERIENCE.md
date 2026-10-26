---
name: Matkoll
status: final
updated: 2026-10-26
sources:
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - docs/brief.md
  - docs/ux/ux-spec.md
  - docs/ux/skisser/
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/addendum.md (version 1.2)
---

# Matkoll – upplevelse

## Foundation

Den här filen och `DESIGN.md` gäller före skisserna i `docs/ux/skisser/` när de inte stämmer överens. `DESIGN.md` äger utseendet; den här filen äger struktur och beteende.

Matkoll är en webbapp, mobil först (från 375 px), som också fungerar på dator. Ingen native app. Inget komponentbibliotek; komponenterna byggs från tokens i `DESIGN.md` (teknikvalet står i `docs/autonomi.md`). Gränssnittet är på svenska och används av en person, Pontus. Ljust och mörkt läge följer systemets inställning.

Begreppen följer PRD:ns ordlista (§3) ordagrant: recept, receptbibliotek, matsedel, matsedelsrätt, inköpslista, listpost, lager, lagervara, plats, stegläge, AI-förslag, lagerförslag med flera. Från version 1.2 kommer **erbjudande** och **veckans erbjudanden** från addendumet ("Version 1.2: Veckans erbjudanden"). Ett erbjudande gäller alltid en butik och en vecka.

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
| Raden Veckans erbjudanden (1.2) | Filtret "Kan lagas nu", längst ned, ovanför "Föreslå rätter med AI" | Visar om det finns erbjudanden för vald butik, och öppnar arket | FR-35, FR-36 | Veckans erbjudanden (rad), Flöde 7 |
| Veckans erbjudanden (ark, 1.2) | "Lägg in erbjudanden" eller "Visa" på raden | Välja vecka, klistra in text eller fotografera bladet, granska, spara, ta bort | FR-34, FR-35 | Ark, Veckans erbjudanden (ark), Flöde 7 |
| Matsedel | Flik 2 | Aktuell matsedel med matsedelsrätter och portioner | FR-13 | Matsedelsrätt (komponent), Flöde 2 |
| Lägg till rätt (ark) | "Lägg till rätt" i Matsedel | Favoriter först, sedan sök i biblioteket | FR-13 | Flöde 2 |
| Tidigare matsedlar | "Tidigare" i Matsedel-rubriken | Lista; "Använd igen" skapar en ny matsedel | FR-14 | Receptrad |
| Inköpslista | Flik 3 | Listposter per butiksavdelning, egna varor, Skicka till ICA, Lägg i lagret | FR-15–FR-19, FR-26 | Skiss 3 |
| Listpostdetalj (ark) | Tryck på varunamnet (inte bocken) | Rätta mängd, se ursprung, ange produktval, ta bort egen vara | FR-17, FR-27 | Ark |
| Hemma (lager) | Flik 4 | Platskort, lagervaror med och utan mängd | FR-11, FR-12 | Skiss 4 |
| Lagervara (ark) | "+" i Hemma eller tryck på en vara | Sök katalogingrediens, mängd, enhet, plats; ta bort | FR-11 | Ark |
| Fotografera plats | Kameraknappen i Hemma | Kamera eller bildval → bildanalys | FR-24 | Flöde 3 |
| Lagerförslag | Efter bildanalys | Bekräfta, rätta eller avvisa varje förslag | FR-25 | Lagerförslag (komponent), Flöde 3 |
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
| "På erbjudande: fläskfilé, broccoli" | "Spara pengar med veckans fynd!" |
| "Matkoll hämtar inte sidor från butiker. Kopiera texten på sidan och klistra in den här." | "Ogiltig indata" |

Knappar är verb: "Spara recept", "Lägg på matsedeln", "Laga nu", "Skicka till ICA", "Lägg i lagret", "Fotografera kylen", "Läs erbjudandena", "Fotografera bladet".

**Erbjudanden i texter (1.2):** veckan skrivs "vecka 45" och, där det finns plats, med datum: "vecka 45, 4–10 nov". Butiken nämns med sitt namn. Priser visas som AI:n läste dem och räknas aldrig om. Matkoll lovar aldrig att något blir billigare.

## Component Patterns

Beteende. Utseendet beskrivs under Components i `DESIGN.md`, med samma namn och ordning. Komponenter som bara har beteende (Matsedelsrätt, Stegläge) står sist.

| Komponent | Används i | Beteende |
| --- | --- | --- |
| Flikfält / Sidomeny | Alla huvudytor | Byter yta utan att tappa scrollposition eller filter i den yta man lämnar. |
| Sökfält | Recept, Lägg till rätt, Lagervara | Söker på titel och ingrediens (även synonymer) medan man skriver, efter 200 ms paus. |
| Filterpiller | Recept | Ett valt åt gången. "Kan lagas nu" sorterar efter antal saknade varor, minst först (FR-22). Valet sparas på enheten. |
| Receptrad | Recept, Lägg till rätt, AI-förslag | Tryck öppnar receptvyn. I Lägg till rätt lägger ett tryck i stället rätten på matsedeln och stänger arket. |
| Statusetikett | Receptrad, Matsedelsrätt | Räknas om när lagret ändras (FR-8). |
| AI-etikett | AI-förslag, förhandsgranskning av AI-förslag | Följer med tills receptet sparats. Ett sparat AI-förslag får källan "AI-förslag". AI-förslag visas i en egen sektion och blandas aldrig med biblioteket. Från 1.2 står "På erbjudande: fläskfilé, broccoli" i `{typography.meta}` under titeln på ett förslag som använder veckans erbjudanden, och över förslagen står "Med veckans erbjudanden från Maxi ICA Stormarknad Östersund." när erbjudanden användes. Raden försvinner när förslaget sparas. |
| Veckans erbjudanden (rad, 1.2) | Recept, filtret "Kan lagas nu" | Ovanför "Föreslå rätter med AI", i `{typography.meta}`. Utan erbjudanden: "Inga erbjudanden inlagda." och textknappen "Lägg in erbjudanden". Med erbjudanden: "24 erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." och textknappen "Visa". Utan vald butik: "Välj en butik i inställningarna för att lägga in erbjudanden." och länken "Öppna inställningar". Raden följer vald butik och annonseras inte när sidan laddas. |
| Veckans erbjudanden (ark, 1.2) | Recept | Rubriken "Veckans erbjudanden" och butikens namn under. Två filterpiller väljer vecka ("Vecka 44" och "Vecka 45"), förvalt enligt AD-25. **Inläsning:** flikarna Text och Foto. Text har fältet "Text från butikens sida" och knappen "Läs erbjudandena". Foto har "Fotografera bladet" (bakre kameran) och "Välj bild" (också skärmbilder). **Förlopp:** "Läser erbjudandena …" eller "Tittar på bladet …" med "Avbryt". **Granskning:** "Hittade 18 erbjudanden för vecka 45." och en rad per erbjudande med namnet som i bladet, priset i `{typography.meta}` och knappen "Ta bort" (namnet "Ta bort Fläskfilé"). En granskad rad tas bort direkt, utan "Ångra", eftersom inget är sparat. "Spara 16 erbjudanden" är primärknapp. **Inlagda:** under rubriken "Inlagda för vecka 45" står de sparade erbjudandena, med "Ta bort" per rad och textknappen "Ta bort alla". Båda ger "Ångra" i den korta bekräftelsen. "Läs in fler" börjar en ny inläsning för samma vecka. |
| Hjärta | Receptrad, receptvy | Ett tryck växlar favorit och sparas direkt. Påverkar inte navigeringen. |
| Portionsväljare | Receptvy, Matsedelsrätt | − och + i steg om 1, minst 1. Mängder skalas direkt. I receptvyn påverkar valet bara visningen; i en matsedelsrätt sparas det. |
| Ingrediensrad | Receptvy, förhandsgranskning, stegläge | Visar bock (finns) eller ring (saknas). Vag mängd visar originaltexten, t.ex. "efter behov". I förhandsgranskningen får en osäker katalogkoppling ring och "Kontrollera", och en ny katalogingrediens märks "Ny". Rättad koppling sparas som synonym till katalogingrediensen. |
| Listpost | Inköpslista | Ett tryck på bocken bockar av posten, och det sparas direkt (FR-16). Ett tryck på texten öppnar listpostdetaljen. Avbockade poster stannar på sin plats tills de läggs i lagret. Varianter: **olika enheter** visar lagret bredvid, "mjöl 2 dl (hemma: 1 kg)" (FR-15); **vag mängd** vars vara saknas i lagret visas utan mängd med texten "Finns hemma?", och en avbockning betyder "har köpt den eller har den redan". |
| Platskort | Hemma | Tryck väljer plats. Listan, kameraknappens text och förvald plats för "+" och lagerförslag följer vald plats. |
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
| Erbjudanden läses (1.2) | Veckans erbjudanden | "Läser erbjudandena …" (text) eller "Tittar på bladet …" (foto) + "Avbryt". |
| Inga erbjudanden hittades (1.2) | Veckans erbjudanden | Meddelanderuta: "Hittade inga erbjudanden. Kopiera hela sidan, eller prova ett skarpare foto." Texten eller fotot står kvar. |
| Bara en länk (1.2) | Veckans erbjudanden | Meddelanderuta: "Matkoll hämtar inte sidor från butiker. Kopiera texten på sidan och klistra in den här." Ingenting hämtas och AI-tjänsten anropas inte. |
| För lång text (1.2) | Veckans erbjudanden | Under fältet: "Texten är för lång. Klistra in en del i taget." |
| Några erbjudanden gick inte att läsa (1.2) | Veckans erbjudanden | Under rubriken i granskningen: "2 erbjudanden gick inte att läsa." Vid fler än 40: "Bara de första 40 erbjudandena kom med. Läs in resten för sig." |
| Erbjudanden sparade (1.2) | Veckans erbjudanden | Kort bekräftelse: "Sparade 16 erbjudanden för vecka 45." |
| Veckan är slut (1.2) | Veckans erbjudanden | Meddelanderuta: "Veckan är slut. Välj en annan vecka och spara igen." Granskningen står kvar. |
| För många erbjudanden (1.2) | Veckans erbjudanden | Meddelanderuta: "Du kan ha högst 100 erbjudanden per vecka. Ta bort några först." |
| Erbjudanden borttagna (1.2) | Veckans erbjudanden | "Tog bort Fläskfilé." eller "Tog bort 24 erbjudanden." med "Ångra" i 5 s. |
| Erbjudandena går inte att läsa (1.2) | Recept, AI-förslag | Raden: "Det gick inte att läsa erbjudandena." Förslagen görs ändå, utan erbjudanden, och raden "Med veckans erbjudanden …" visas inte. |
| Inget förslag använder erbjudandena (1.2) | AI-förslag | Över förslagen: "Inget av förslagen använder veckans erbjudanden." |

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

### Flöde 7 – Veckans meny från reklambladet (UJ-7, version 1.2, söndag förmiddag)

1. Pontus väljer filtret "Kan lagas nu". Längst ned står "Inga erbjudanden inlagda." Pontus trycker "Lägg in erbjudanden".
2. Arket "Veckans erbjudanden" har förvalt vecka 45, eftersom det är söndag. Pontus väljer Foto och trycker "Fotografera bladet".
3. "Tittar på bladet …". Sedan: "Hittade 18 erbjudanden för vecka 45." Pontus tar bort tvättmedlet och kaffefiltren och trycker "Spara 16 erbjudanden".
4. Raden säger nu "16 erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." Pontus trycker "Föreslå rätter med AI".
5. **Klimax:** över förslagen står "Med veckans erbjudanden från Maxi ICA Stormarknad Östersund." Det första förslaget har "På erbjudande: fläskfilé, broccoli". Pontus sparar det och lägger det på matsedeln.

**Variant, text från butikens sida:** Pontus markerar all text på erbjudandesidan i webbläsaren, kopierar den och klistrar in den under Text. Om Pontus i stället klistrar in en länk säger Matkoll att den inte hämtar sidor från butiker.

## Settings

| Inställning | Beteende |
| --- | --- |
| Godkända receptsajter | Lista med domäner; lägg till (bara domännamn, valideras) och ta bort. Gäller direkt (FR-7). |
| Butik | Namn, kedja, butiks-id, adress. Förvald: Maxi ICA Stormarknad Östersund (FR-28). |
| Logga ut | Textknapp längst ned. |

Produktval (FR-27) anges per vara i listpostdetaljen och gäller för den katalogingrediensen i vald butik.

Veckans erbjudanden (1.2, FR-34) läggs in under Recept, vid AI-förslagen, och inte i Inställningar, eftersom de ändras varje vecka. De gäller vald butik.
