---
name: ux-beslut
description: UX-genomgång och skissbeslut i två steg. En agent går igenom appen och listar fynd, du väljer Gör/Senare/Nej på en beslutssida, skisser med Före/Efter godkänns på en ny sida, och först därefter byggs det. Använd när användaren vill ha en UX-genomgång, mockups att ta ställning till, eller "beslutssida".
---

# UX-beslut: genomgång, beslut, skiss, bygg

Arbetssättet kom från Pontus 2026-11-07: genomgång först, skisser innan ändringar, bygg efter beslut. Inget byggs före ett svar.

## Regler som alltid gäller
- Genomgångsagenten ändrar **ingen kod**, committar inget och öppnar ingen PR.
- Skisser baseras på den riktiga appen (tokens ur `src/app/globals.css`, ikoner ur `src/components/icons.tsx`, skärmbilder av nuläget som "Före"). Se mockup-fidelity i minnet: skissen är ett löfte, specificera varje synlig skillnad.
- Svenska i chatten och i sidornas text, engelska i kod och commits.
- Besluten finns i artifactens databas (`picks`, `decisions`). Läs dem med `ArtifactData`, bygg efter dem och skicka kommentarerna ordagrant vidare till byggagenterna.
- Merga först när CI är grön (och efter Pontus OK om inget annat är sagt).

## Välj ingång: revision eller resa
Steg 1 (genomgång av det som finns) passar när konceptet är rätt och ytan behöver putsas. Det passar INTE när själva konceptet är fel.
- **Tecken på att konceptet är fel:** användaren säger att något "känns virrigt", att många punkter "säger samma sak", att det är för mycket på skärmen, eller att appen inte "vägleder". Då ger en revision bara fler småfixar av samma röriga skärm (så gick det med Menyrådgivaren 2026-11-09: 17 överlappande fynd, därefter tre koncept A/B/C som var variationer på samma dashboard).
- **Gör i stället:** börja med användarens resa. Skriv själv resan i 4–7 steg (en sak per skärm, en primär handling, svaret först, detaljer i ett ark först när man trycker), ge en stilförebild om användaren har en (t.ex. Klarna-appen: stor fetstil, mycket luft, en pillknapp, vänlig text), och låt en design-agent rita EXAKT den resan med exempeldata och appens tokens. Rita alla stoppfall (fel, tomt, oläsligt) som egna skärmar.
- **Regel för markeringar och brickor:** en bricka får bara finnas om den ändrar ett beslut. Brus är data som visas för att den finns.
- **Beslutssidan** har då ett beslut per resteg (Godkänn / Godkänn med ändring / Bygg inte), inte en lång lista. Ge aldrig tre koncept som liknar varandra; erbjud alternativ bara när grundidéerna skiljer sig, och säg i en mening vad som skiljer.
- Fråga användaren inte om koncept A, B eller C innan du själv har prövat resan mot det användaren sade.

## Steg 1: genomgång (en agent, ändrar inget)
Starta en Agent (general-purpose, gärna Sonnet) med en lång prompt som innehåller:
- Mål: "en första tight version", mer enhetligt och tydligt, ta bort brus, ingen omdesign.
- Läs först: `AGENTS.md`, godkänd stil (`ux-designs/` och `ux-designs/mockups/`), ordlistan om den finns.
- Starta appen lokalt med testdata, ta skärmbilder på 375 px av varje sida och gå igenom 5–6 användarresor (t.ex. planera vecka → inköpslista → butik → Matvaror, importera recept, erbjudanden, foto, bjuda in, Förråd).
- Mät mot appens egen godkända stil.
- Leverera `findings.json`: per fynd `id` (UX-01…), `title`, `area`, `category` (otydligt | inkonsekvent | brus), `problem`, `proposal`, `size` (liten | mellan), `needsMockup`, `priority` (1–3), `note`, `shots` (sökvägar till skärmbilder), gärna `files` (sannolika filer).
- Markera fynd som går emot något Pontus tidigare bestämt (gul `note`).
- Förslag till ordlista (appens ord, t.ex. "erbjudande" inte "extrapris").

## Steg 2: beslutssida med många punkter
1. `Artifact` `quickstart` (intent other), ladda `artifact-design` och `artifact-capabilities`.
2. Utgå från `beslutssida-mall.html` i den här mappen: lägg fynden i `<script id="data">` (samma fält som ovan; `shots` pekar på publicerade filer, skala ned till max 640 px bredd med `sips -Z 640`).
3. Publicera med `capabilities: {"db": {}}` och skärmbilderna i `files`. Under varje fynd väljer användaren Gör / Senare / Nej och kan skriva en kommentar. Valen sparas i `picks/<UX-id>`.
4. Läs valen med `ArtifactData` (`list`, `collection: picks`). Spara Pontus kommentarer i `pontus-notes.md`.

## Steg 3: bygg det som inte behöver skiss
Dela fynden utan `needsMockup` i batchar per område (t.ex. lista/Matvaror/Matsedel, Recept, Erbjudanden, Förråd/start/inställningar). En Sonnet-agent per batch, helst egen worktree, som får `findings.json`, `pontus-notes.md` och ordlistan. De mergar inte. CI-flake "address already in use": `gh run rerun <id> --failed`.

## Steg 4: skisser för det som behöver bild
En agent gör skisser (HTML, appens egna tokens) av layoutändringarna. Skisssidan har per fynd: **Före** (skärmbild), **Efter** (ritad), **Ändringar** (lista på allt som syns annorlunda, inget annat ska ändras), och en gul ruta med öppna frågor ("Beslut 1…"). Beslutsrutorna läggs till av `skiss-beslut.js` (Godkänn / Godkänn med ändring / Bygg inte + kommentar). Publicera med `db`. Bygg först efter svar. Frågor som besvaras i chatten: skriv ner dem i beslutsunderlaget så att det syns vad som gäller.

## Fallgropar (sådant som gått fel förut)
- Beslutsrutor dubbleras om sidan sparas som HTML och öppnas igen. `skiss-beslut.js` rensar gamla rutor först; behåll det.
- Sparas sidan som en enda HTML-fil saknas skärmbilderna. För delning: bädda in bilderna som data-URI (nedskalade) och testa att "spara och öppna igen" ger rätt antal rutor och inga blanka bilder.
- Numrerade frågor i chatten blir tvetydiga. Skriv alltid ut vilken punkt ett svar gäller.
- Testa delbar kopia i en webbläsare (Playwright) innan den skickas.

## Dela som exempel
Gör en statisk kopia: lägg in sparade val som initialt tillstånd, stäng av databasen (`if (false) {`), lås knapparna (`pointer-events:none`), bädda in bilder och lägg en banderoll som förklarar arbetssättet.
