# Matkoll – beslutslogg

Beslut som fattats under bygget: vad, varför och vilka alternativ som fanns. Nyaste överst.

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
