# Matkoll – Produktbrief

Oct 25, 2026 · @Pontus

## Vision och problem

Matkoll gör om utvalda recept från nätet till en inköpslista som bara innehåller det som saknas hemma.

Idag krävs manuellt arbete för att gå från "det här vill jag laga" till en korrekt inköpslista: läsa ingredienser från flera receptsajter, räkna om portioner, slå ihop dubbletter och stryka det som redan finns i skafferi och kyl. Appen automatiserar den kedjan och kan dessutom föreslå rätter utifrån det som finns hemma.

## Mål och avgränsning

Första versionen är ett personligt test med en enda användare (Pontus), byggt som webbapp för mobil och dator.

| Område | Beslut |
| --- | --- |
| Användare | En användare. Inget delat hushåll. |
| Plattform | Responsiv webbapp, mobil och dator. Publiceras på Vercel. |
| Backend | Supabase för databas och inloggning. |
| Portioner | Anges per vald rätt. Inköpslistan skalas därefter. |
| Lager | Mängd är valfri. Tom mängd betyder obegränsat. |
| Lageravdrag | Inget automatiskt avdrag. Varor tas bort manuellt. |

**Designprincip:** appen är ett enkelt hjälpmedel, inte ett exakt system. Hellre ungefär rätt och snabbt än exakt och krångligt. Varje funktion ska gå att använda utan instruktioner. Bra funktioner från befintliga appar (t.ex. Sously och SmakShare) får gärna lånas.

Framgång bedöms mot effektmålen under AAS-styrning nedan.

## Funktionsområden

Sju epics, i föreslagen byggordning. Epic 1–3 ger en fungerande kärna; 4–7 bygger vidare på den.

### Epic 1: Receptimport och receptbibliotek

- Användaren klistrar in en receptlänk från en godkänd receptsajt. Startlistan är koket.se och tasteline.com, med ica.se, arla.se och coop.se som föreslagna tillägg om importen fungerar där. Nya sajter läggs till i appens inställningar utan kodändring.
- Servern hämtar sidan och läser i första hand strukturerad receptdata (schema.org/Recipe).
- AI omvandlar receptet till ett eget enhetligt format: mängd, enhet och ingrediens separeras, ingredienserna kopplas mot katalogen och stegen skrivs om i samma stil.
- Saknas strukturerad data tolkar AI hela sidan som reserv. Recept kan också läggas in genom att klistra in text eller fotografera en kokbokssida.
- Käll-länken sparas alltid i databasen, även om den inte visas.
- Användaren kan granska och rätta ingredienser efter import.
- Alla recept sparas i ett eget receptbibliotek. Bra recept markeras som favoriter för snabb återanvändning.

### Epic 2: Lager (skafferi och kyl)

- Lägga till, ändra och ta bort varor manuellt.
- Mängd och enhet är valfria. Tom mängd betyder obegränsat.
- Varor kopplas till en gemensam ingredienskatalog så att de kan matchas mot recept.

### Epic 3: Matsedel och inköpslista

- Välja rätter till en matsedel och ange antal portioner per rätt. Tidigare matsedlar kan återanvändas.
- Inköpslistan skalar ingredienser efter portioner, slår ihop samma ingrediens från flera rätter och drar av det som finns i lagret.
- Varor med obegränsat lager tas alltid bort från listan.
- Listan grupperas efter butiksavdelning och poster kan bockas av. Egna varor som inte kommer från recept kan läggas till. Efter handlingen läggs avbockade varor till i lagret med ett tryck.

### Epic 4: Recept och steg-för-steg

- Visa valt recept med ingredienser skalade efter valt antal portioner.
- Stegvis läge med ett steg i taget, anpassat för mobil i köket. Skärmen hålls tänd under matlagningen.

### Epic 5: Förslag utifrån lager

- Föreslå rätter som kan lagas med det som finns hemma, rangordnade efter hur lite som saknas. Varje recept i biblioteket visar om det kan lagas nu eller hur många varor som saknas.
- Förslag söks i första hand i receptbiblioteket. AI-genererade förslag är ett komplement, märks tydligt och kan sparas i biblioteket.

### Epic 6: Bildanalys av lager

- Fotografera skafferi eller kyl med mobilkameran.
- AI identifierar varor och föreslår lagerposter.
- Användaren bekräftar, rättar eller avvisar varje förslag innan något sparas.

### Epic 7: Varukorg i matbutik

- När matsedeln är klar fylls en varukorg i matbutiken på nätet med inköpslistans varor. Första butik är Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733). Butiken ska kunna bytas i appens inställningar, även till andra kedjor.
- Pontus granskar varukorgen och väljer sedan att beställa eller att använda den som inköpslista i butiken. Agenten beställer aldrig själv.
- Varje ingrediens matchas mot en verklig produkt och förpackningsstorlek, t.ex. 3 dl grädde mot ett 5 dl-paket.
- Steg 1: knappen "Skicka till ICA" kopierar listan (vara, mängd, ev. önskad produkt). Claude in Chrome fyller varukorgen i Pontus inloggade webbläsare och rapporterar osäkra matchningar separat. Steg 2: appen sparar vilken produkt Pontus brukar köpa per ingrediens, och valen följer med i exporten. Steg 3: en inbyggd agent byggs bara om steg 1–2 inte räcker; den skulle troligen behöva köras på Pontus dator, eftersom inloggning med BankID inte går att automatisera rimligt och ICA såvitt känt saknar öppet API.
- Risk: butikens webbplats kan ändras, och automatisering kan strida mot butikens villkor (ej kontrollerat). Hur stabilt Claude in Chrome hanterar ICA Handla måste testas.

## UX-riktning

Vald riktning: lugn och elegant som Mela, organiserad som Crouton, rak som Mealime. Principerna kopieras, inte utseendet; Matkoll får eget namn, egna färger och egna ikoner.

| Förebild | Vad som lånas |
| --- | --- |
| Mela | Enhetligt receptformat, förhandsgranskning före sparning, lugn layout där matbilderna står för färgen |
| Crouton | Samlingar och favoriter, översiktlig veckomatsedel |
| Mealime | Rakt flöde: välj rätter → inköpslista, utan omvägar |

### Navigering

Fyra flikar längst ned på mobilen och en sidomeny på datorn: **Recept**, **Matsedel**, **Lista** och **Hemma** (lagret).

### Skärmprinciper

- **Recept:** stor bild, titel, portionsväljare. På mobil ligger ingredienser ovanför stegen; på dator sida vid sida. Alla recept har samma typsnitt och struktur oavsett källa.
- **Import:** förhandsgranskning av det tolkade receptet med möjlighet att rätta innan sparning.
- **Matsedel:** en favorit läggs till med högst två tryck. Varje rätt visar om den kan lagas nu.
- **Lista:** grupperad efter butiksavdelning, stora bockrutor som går att träffa med en hand i butiken. Knappen "Skicka till ICA" längst ned.
- **Laga mat:** ett steg i taget med stor text, stegets ingredienser synliga och skärmen tänd.
- **Hemma:** tre platskort överst (Kyl i mint, Frys i ljusblått, Skafferi för torrvaror i sand) med ikon och antal varor; valt kort markeras med ram. Appen föreslår plats automatiskt utifrån ingredienskatalogen. Kameraknappen följer vald plats ("Fotografera kylen"). Varor med mängd visas som rader med mängden till höger; varor utan mängd visas som etiketter under rubriken "Finns hemma".

### Visuell stil

Apple-känsla: systemtypsnittet (San Francisco på Apple-enheter, Inter som reserv), ljus grågrön bakgrund (#F5F7F4), grön accent (#3E7C62) och pastelltoner i mint (#DDEFE5), ljusblått (#DCE9F6) och sand (#F1ECE2). Inget rött. Mycket luft, rundade kort och ljust och mörkt läge. Skisser: se docs/ux/. Inga dekorationer som inte hjälper användaren.

## Datamodell

Ingredienskatalogen är navet: både receptrader och lagerposter pekar på den, annars går det inte att matcha recept mot lager.

| Tabell | Innehåll | Kopplas till |
| --- | --- | --- |
| ingredient | Normaliserat namn, synonymer, butiksavdelning, standardenhet, ev. vikt per dl/st | – |
| recipe | Titel, käll-URL, originalportioner, instruktionssteg, bild-URL | – |
| recipe\_ingredient | Originaltext, mängd, enhet, ev. "efter smak" | recipe, ingredient |
| pantry\_item | Mängd (null = obegränsat), enhet, plats (skafferi/kyl/frys) | ingredient |
| meal\_plan | Namn eller period | – |
| meal\_plan\_recipe | Valt antal portioner | meal\_plan, recipe |
| shopping\_list\_item | Beräknad mängd, enhet, avbockad | meal\_plan, ingredient |

Alla tabeller får en användarkolumn och Row Level Security i Supabase, även om det bara finns en användare. Det kostar lite nu och skyddar data mot den publika adressen.

## Teknisk arkitektur

All hämtning från receptsajter och alla AI-anrop går via serverfunktioner på Vercel, aldrig direkt från webbläsaren.

```
Webbläsare (mobil/dator)
   │ HTTPS
   ▼
Vercel – Next.js
   ├─ Gränssnitt (sidor för lager, recept, listor)
   └─ Serverfunktioner (receptimport, bildanalys, inköpslisteberäkning)
         ├─▶ Supabase (Postgres, inloggning, Row Level Security)
         ├─▶ Receptsajter (koket.se, tasteline.com m.fl.)
         └─▶ AI-tjänst (lokal Qwen via Cloudflare Tunnel, senare moln-API)
```

Skälen är två: webbläsaren får inte hämta sidor från andra domäner, och AI-nyckeln måste ligga på servern. Ramverket är Next.js, som passar Vercel naturligt.

## AI-upplägg

Under testfasen körs AI lokalt på Pontus dator via en tunnel; leverantören ska kunna bytas mot Anthropic eller OpenAI utan omskrivning.

| Område | Upplägg |
| --- | --- |
| Testmodell | Qwen3.6-35B-A3B i LM Studio, med stöd för både text och bild |
| Utbytbarhet | Ett eget gränssnitt med tre funktioner: tolka recept, analysera bild, föreslå rätter. Leverantören styrs av en miljövariabel på Vercel. |
| Klientbibliotek | Vercel AI SDK, som stöder OpenAI, Anthropic och OpenAI-kompatibla servrar som LM Studio |
| Strukturerade svar | Alla svar valideras mot ett schema (t.ex. Zod), med nytt försök vid fel |
| Promptar | Samlade på ett ställe, separat från koden, eftersom de kan behöva justeras per leverantör |
| Testuppsättning | 10–20 riktiga recept och några kylskåpsfoton med förväntat resultat, körs vid varje leverantörsbyte |
| Tunnel | Cloudflare Tunnel från MacBooken, utgående förbindelse utan öppna portar i routern. Skyddad med Cloudflare Access och hemlig token; bara Vercels serverfunktion får anropa modellen. Macen hålls vaken och ansluten till laddare. |

Verifierat: modellen tolkar kylskåpsbilder i LM Studio och tänkläget är avstängt. Datorn måste vara igång när appen används.

## Risker och kända svårigheter

Största risken är ingrediensmatchningen; den avgör om inköpslistan går att lita på.

| Risk | Konsekvens | Hantering |
| --- | --- | --- |
| Ingrediensmatchning ("gul lök", "lök, hackad", "schalottenlök") | Fel varor dras av eller hamnar dubbelt på listan | AI-normalisering vid import mot katalogen, med manuell rättning |
| Enhetskonvertering (dl mjöl mot kg mjöl) | Mängder kan inte jämföras | Ingen exakt omräkning. Olika enheter visas sida vid sida, t.ex. "mjöl 2 dl (hemma: 1 kg)", och Pontus avgör |
| Vaga mängder ("en nypa", "efter smak") | Kan inte räknas | Behandlas som "finns hemma?"-fråga, inte som mängd |
| Receptsajter blockerar serverhämtning | Import misslyckas för vissa sajter | Testa varje sajt tidigt; reserv: klistra in recepttext |
| Strukturerad receptdata saknas eller är ofullständig | Sämre import | AI-tolkning av sidan som reserv |
| Bildanalys gissar fel eller missar varor | Felaktigt lager | Alltid bekräftelsesteg innan sparning |
| Upphovsrätt på instruktionstexter och bilder | Juridisk risk vid spridning | Oproblematiskt för eget bruk; kontrollera innan appen öppnas för andra |
| Dela-meny saknas för webbappar på iOS | Sämre importflöde på iPhone | Inklistrad länk; ev. iOS-genväg senare |
| AI-kostnad och missbruk av nyckel | Oväntade kostnader | Nyckeln bara på servern, bakom inloggning |

## AAS-styrning (lättviktig)

Projektet följer AAS i lättviktig form: tvingande säkerhetskontroller och en kort Framing, inget mer förrän appen eventuellt ska användas av fler.

### Framing

- Riskprofil: utgår från tabellen Risker och kända svårigheter ovan.
- Effektmål enligt tabellen nedan. Målen är Pontus; indikatorer och tidsram är förslag och bedöms enkelt, inte exakt.

| Effektmål | Enkel indikator (förslag) | Tidsram (förslag) |
| --- | --- | --- |
| 1. Mindre matsvinn: inte köpa det som redan finns hemma, och få förslag som äter upp råvarulagret | Pontus köper sällan dubbelt och slänger märkbart mindre | Efter 4 veckors användning |
| 2. Spara tid på inköpslistor | Veckans inköpslista är klar på under 10 minuter | Efter 4 veckors användning |
| 3. Större variation när fantasin tar slut (lägre prioritet; väntas komma av sig själv med strukturen) | Minst en ny rätt per vecka | Efter 4 veckors användning |
| 4. Snabbt återkomma till favoriträtter | En favorit läggs på matsedeln med högst två tryck | Från första versionen |
| 5. Hela veckan i appen | En vecka av riktiga måltider planeras i appen och ger en inköpslista som används i butiken utan manuell efterbearbetning | Efter 4 veckors användning |

### Tvingande kontroller

Kontrollerna körs automatiskt och blockerar sammanslagning eller driftsättning om de fallerar.

| Kontroll | Vad den skyddar | När den körs |
| --- | --- | --- |
| Hemlighetsskanning | AI-nyckel och Supabase-nycklar hamnar aldrig i repot eller klientkoden | Vid varje commit och i CI |
| Tester av Row Level Security | Data kan inte läsas eller ändras utan inloggning | I CI |
| Domänbegränsning för hämtning | Serverfunktionen hämtar bara från godkända receptsajter | I koden, med test i CI |
| Lint | Kodkvalitet och konsekvent stil | Vid varje commit och i CI |
| Kodgranskning | AI-genererad kod granskas innan sammanslagning | Före varje sammanslagning |

### Startpunkt

Repot skapas från claude-bmad-template, så att BMAD-agenter och projektstruktur finns på plats från början.

### Ingår inte nu

Evidence Pack, portföljflöde och formell värdebedömning. De tas in om appen blir en riktig produkt.

## Utanför scope och öppna frågor

Utanför första versionen:

- Flera användare och delat hushåll
- Automatiskt lageravdrag efter matlagning eller inköp
- Native app och dela-meny på iOS
- Beställning i matbutik utan att Pontus granskat varukorgen

Öppna frågor:

- [ ] Molnleverantör när appen ska användas av fler: den billigaste som klarar testuppsättningen.
