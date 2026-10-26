# Matkoll – idéer efter version 1.0

Pontus idéer 2026-10-26, bedömda och ordnade. Version 1.0 är Epic 1–7 enligt `epics.md`. Idéerna nedan byggs efter 1.0 som egna epics, och var och en går först genom BMAD:s kursändring ("correct course"), så att PRD, arkitektur och epics uppdateras.

## 1. Flera ställen, till exempel hemmet och vinterstugan (föreslås som 1.1)

- **Vad:** lagret delas upp på ställen. Varje ställe har sin egen kyl, frys och sitt eget skafferi. Pontus väljer vilket ställe som gäller: det styr Hemma, lagningsstatusen, avdraget på inköpslistan och "Lägg i lagret".
- **Svårighet:** medel. Det kräver ingen extern data, men berör `pantry` (en ny kolumn för ställe och regler per ställe), statusen i receptbiblioteket, inköpslistan och bildanalysen (Epic 6).
- **Varför först:** idén är den enklaste att införa och har ingen risk utanför appen.
- **Huvudsyftet (Pontus, 2026-10-26):** att komma ihåg vad som finns i stugans kyl, frys och skafferi, så att Pontus handlar rätt inför resan dit och varken köper dubbelt (två ketchup) eller saknar något (senap). Det betyder:
  - Inköpslistan ska kunna räknas mot det ställe Pontus ska till, inte mot hemmet.
  - Det ska gå att se ett ställes lager utan att vara på plats.
  - "Lägg i lagret" lägger varorna på det valda stället.
- Ordningen nedan är beslutad av Pontus 2026-10-26.

## Spara senaste fotot per plats (beslutat av Pontus 2026-10-26, efter Epic 8)

- **Vad:** det senaste fotot av varje plats (Kyl, Frys och Skafferi, per ställe) sparas privat och kan visas senare. Då går det att se i efterhand om bilden tolkades rätt.
- **Varför en egen story:** AD-15 säger att foton aldrig sparas. Storyn börjar därför med en kursändring (BMAD correct-course) som ändrar AD-15 och bestämmer lagring (privat bucket i Supabase Storage med RLS), hur länge fotot sparas, att EXIF tas bort och vad som händer när stället eller platsen töms.
- **Redan nu (snabbfix):** fotot visas ovanför förslagen medan Pontus granskar dem, bara i telefonen och utan att sparas. Det följer AD-15.
- **Ordning:** efter Epic 8, före 1.2.
- **Planerad som Epic 10 (2026-10-26):** tre stories, 10.1 spara, 10.2 visa och 10.3 gallra och städa. Fotot sparas i en privat bucket i Supabase Storage när något från dess förslag har sparats i lagret, utan metadata, högst ett per plats och ställe och högst 30 dagar, och det visas i Hemma med numren och avläsningen. AD-15 är ändrad, och AD-26 är ny. Underlag: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-spara-foto.md` och `_bmad-output/implementation-artifacts/epic-10-context.md`. Byggs i grenen `epic/10-spara-foto`, före Epic 9.

## 2. Menyförslag utifrån veckans erbjudanden (föreslås som 1.2)

- **Vad:** AI-förslagen (Epic 5) prioriterar varor som är på erbjudande i en vald butik den här veckan.
- **Enkel första version:** Pontus klistrar in en länk till butikens erbjudanden, eller fotograferar reklambladet. AI:n plockar ut erbjudandena, med samma teknik som receptimport och bildanalys, och förslagen tar hänsyn till dem.
- **Svårare variant:** att hämta erbjudandena automatiskt varje vecka från ICA, Willys, Coop och Lidl. Det kräver att varje kedjas webbplats utreds, och det kan gå sönder när de ändrar sina sidor.
- **Svårighet:** låg till medel i den enkla versionen, hög i den automatiska.
- **Planerad som Epic 9, andra planen (2026-10-26):** Pontus vill hellre "ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade". Förstudien (`docs/erbjudanden-lankar.md`) visar att ICA:s erbjudandesida per butik går att läsa med en hämtning, men inte Willys, Hemköp, Coop och Lidl. Epic 9 har nu tio stories:
  1. 9.1, länk per butik och hämtning med ett tryck;
  2. 9.2, etiketten på inköpslistan ("Falukorv 29 kr");
  3. 9.3, filtret Erbjudanden i Recept;
  4. 9.4, "Fyll på lagret";
  5. 9.5, AI-förslag med erbjudanden;
  6. 9.6, förslag till veckans matsedel;
  7. 9.7 och 9.8, text och foto som reserver;
  8. 9.9, ta bort;
  9. 9.10, AI-koppling till katalogen, bara om den behövs.

  Underlag: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-erbjudanden-v2.md` och `_bmad-output/implementation-artifacts/epic-9-context.md`. Byggs efter Epic 12, i grenen `epic/9-erbjudanden-v2`.
- **Väntar, efter Epic 9:**
  - **Automatisk hämtning:** veckans erbjudanden hämtas av sig själv, till exempel på söndag morgon, utan att Pontus trycker. Det kräver ett schemalagt jobb med egen nyckel (inte Pontus session), regler för hur ofta butiken får anropas och att felen syns för Pontus utan att någon tittar. Öppen fråga 9.
  - **Bevakningar med aviseringar:** Pontus väljer varor ("säg till när kaffe är på erbjudande"), och Matkoll säger till när de är det. Det kräver automatisk hämtning och pushaviseringar (service worker, AD-27, och tillstånd på iPhone).
  - **Fler kedjor med länk:** Willys, Hemköp, Coop och Lidl bygger erbjudandena i webbläsaren. Deras interna API:er används inte. Prövas igen om de får sidor som går att läsa.

## 3. Jämföra butiker för en färdig inköpslista (föreslås som 1.3, med en utredning först)

- **Vad:** inköpslistan prisas i flera butiker (Lidl, Willys, Coop och flera ICA-butiker), och appen visar var det blir billigast.
- **Svårighet:** hög.
  - **Pris per butik:** kedjorna har inga öppna API:er. Priser finns i deras e-handel, ibland per butik, men inte för Lidl, som saknar e-handel för mat i Sverige.
  - **Villkor:** att hämta priser kan strida mot kedjornas användarvillkor.
  - **Matchning:** varje vara på listan ("grädde 3 dl") måste kopplas till en produkt i varje butik. Det blir AI-stött och ungefärligt.
- **Första steg:** en utredning (BMAD deep recon) av vilka kedjor som går att läsa priser från, och på vilka villkor. Därefter en prototyp med en eller två kedjor.
- **Förberedelse redan nu:** Epic 7 ("Välja butik", "Produktval per vara") byggs så att datamodellen klarar flera butiker och produktval per butik. Då behöver jämförelsen inte bygga om något.

## Föreslagen väg

1. Gör klart 1.0, alltså Epic 4–7 som planerat. Epic 7 får en butiksmodell som klarar flera butiker.
2. 1.1: flera ställen, och därefter att spara senaste fotot per plats (planerad som Epic 10).
3. 1.2: erbjudanden. Planerad som Epic 9 med länk per butik, och text och foto som reserver (andra planen, grenen `epic/9-erbjudanden-v2`). Byggs efter Epic 10–12, som finslipar det som finns.
4. Utredning, och därefter 1.3: butiksjämförelse.
