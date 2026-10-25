# Matkoll – beslutslogg

Beslut som fattats under bygget: vad, varför och vilka alternativ som fanns. Nyaste överst.

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
