---
title: 'Kursändring: snabbare och asynkron AI (Epic 12)'
date: 2026-10-26
status: godkänd (headless enligt docs/autonomi.md; planen godkänd av Pontus 2026-10-26, "ja planera det så")
trigger: 'Pontus 2026-10-26: "Vi borde få till prestandan i qwen kommandona om det går. Kanske göra dem asynkrona om det går, och att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara. Om det inte riskerar ngt."'
scope: Moderate
branch: epic/12-asynkron-ai
---

# Kursändring: snabbare och asynkron AI (Epic 12)

Läge: batch och headless. Pontus godkände planen i två steg: först fart (snabba vinster som mäts före och efter), sedan AI-anrop som körs i bakgrunden medan Pontus använder appen. Alla val i det här förslaget går att ändra senare, så enligt grundregeln i `docs/autonomi.md` fattas de utan att fråga. Valen står i `docs/beslutslogg.md` och frågorna i `docs/oppna-fragor.md`.

## 1. Sammanfattning av ändringen

### Vad som utlöste ändringen

Pontus skrev 2026-10-26: "Vi borde få till prestandan i qwen kommandona om det går. Kanske göra dem asynkrona om det går, och att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara. Om det inte riskerar ngt."

I dag väntar Pontus på varje AI-anrop med "Tittar på bilden …" eller "Letar efter idéer …". Anropet lever i sidans förfrågan: lämnar Pontus sidan, eller trycker "Avbryt", stoppas det. Det går inte att fotografera kylen och sedan frysen medan den första bilden tolkas, eller att läsa in ett recept medan rättförslagen tas fram.

Pontus godkände den här planen ("ja planera det så"):

1. **Fart först, mätt före och efter:** väck modellen när en sida med AI öppnas, ställ in LM Studio efter mätning, kortare svar för AI-förslag och den första rätten så fort den är klar.
2. **AI i bakgrunden:** servern svarar direkt med ett jobb, kör AI:n i bakgrunden och sparar resultatet privat. Jobben står i kö och körs ett i taget. Appen säger till när ett resultat är klart. Ett resultat som har blivit inaktuellt sparas aldrig automatiskt.

### Typ av ändring

Nya önskemål från Pontus om fart och arbetssätt. Inget som är byggt är fel. En regel i `EXPERIENCE.md` ändras: "siffermärken på flikar" var förbjudna och tillåts nu, bara för klara AI-jobb. En regel i arkitekturen ändras: AI-resultat lever inte längre bara i klienten, utan i en privat jobbtabell tills Pontus har sett dem (AD-2, AD-9).

### Byggordning

Epic 11 ("Nytt utseende") är planerad på grenen `epic/11-nytt-utseende` och byggs först. Epic 12 byggs efter Epic 11, och före Epic 9 (vilar). Texterna här använder namnen från Story 10.4: Lagersaldo och Inköpslista.

### Underlag

Kontrollerat i koden på `epic/11-nytt-utseende` (`22a0feb`), i `node_modules` och på webben 2026-10-26:

- **AI-porten (`src/server/ai/`):** `runStructured` i `run.ts` anropar `generateText` med `Output.object`, med 100 s per försök och 115 s totalt (AD-9), högst två nya försök och en hälsokontroll mot LM Studio (`GET /models`, 5 s) före första försöket. `lmstudio.ts` stänger av tänkläget (`reasoningEffort: "none"`) och ger bilder Qwens sampling med temperatur 0.
- **Rutterna (`src/app/api/ai/`):** `analyze`, `locate`, `suggest`, `import` och `import/photo`. Alla har `maxDuration = 120` (`locate` 60), skickar `request.signal` hela vägen till modellen och svarar först när AI:n är klar. Ingen av dem skriver (AD-2).
- **Låset i 6.6 (`pantry/actions/ai-runs.ts`):** en karta per användare i serverprocessen. En bildanalys stoppar allt som pågår för samma användare (som då svarar `ai_superseded`). Ett uppslag av nummer (`locate`) ger vika för en analys. `suggestFromPantry` har en egen karta: ett nytt förslag stoppar det förra. Låset gäller bara i en process, och importen tar det inte.
- **Analysen (`analyzePlace`):** läser stället före AI:n (8.4), jämför avläsningen med platsens varor ("I kylen nu", 6.4) direkt efter AI:n och lämnar svaret till klienten. Klienten skickar sedan samma foto till `/api/ai/locate` för numren (6.6) och till `/api/pantry/photo` när något bekräftas (10.1).
- **AI-förslagen (`suggestFromPantry`):** läser valt ställes lager, ber om exakt tre rätter i `AiRecipe`-schemat och matchar varje rad mot katalogen. Varje receptrad har `originalText`, `amount`, `unit`, `isVague`, `hint` (namn, avdelning, plats och enhet) och `stepIndexes`. T5: 1 300–2 000 token svar och 30–90 s, och "Föreslå andra rätter" är ett andra anrop med titlarna att undvika.
- **Uppmätt 2026-10-26:** ett foto av kylen tog 65 s kall och 20 s varm (T6). `lms ps` visar `qwen/qwen3.6-35b-a3b` laddad med kontext 8 192, PARALLEL 4 och ingen TTL, så modellen laddas aldrig ur. Med PARALLEL 4 delar samtidiga anrop på farten: under en utvärdering tog ett AI-förslag mer än 100 s.
- **LM Studio CLI:** `lms load` tar `--context-length`, `--parallel`, `--ttl` och `--speculative-draft-mtp` (kontrollerat med `lms load --help`, utan att något ändrades).
- **Next.js 16.4.3, `after()`** (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`): körs efter att svaret har skickats, i Route Handlers med tillgång till `cookies()` och `headers()`, och "will run for the platform's default or configured max duration of your route". På Vercel används `waitUntil`. Med `next start` körs `after()` klart, också vid en kontrollerad avstängning.
- **Vercel** (`vercel.com/docs/functions/configuring-functions/duration`, hämtad 2026-10-26): med Fluid compute är standard och tak 300 s på Hobby och 800 s på Pro. CPU debiteras inte medan funktionen väntar på I/O.
- **AI SDK 7.0.153** (`node_modules/ai/docs/07-reference/01-ai-sdk-core/28-output.mdx` och `ai-sdk.dev/docs/reference/ai-sdk-core/output`): `streamText` med `Output.array({ element })` ger `elementStream`, där varje element är komplett och validerat mot schemat när det kommer. `partialOutputStream` ger bara färdiga element för en lista. Om LM Studio strömmar ett svar med JSON-schema i praktiken är inte prövat (T8).

## 2. Konsekvensanalys

### 2.1 Checklista

| # | Punkt | Status | Not |
| --- | --- | --- | --- |
| 1.1 | Utlösande story | [x] | Pontus användning efter Epic 6–8 och mätningarna i T5 och T6. Ingen story är fel. |
| 1.2 | Problemformulering | [x] | AI-anropen är långsamma (20–90 s) och låser sidan. Pontus vill att de går fortare och körs i bakgrunden, utan risk. |
| 1.3 | Underlag | [x] | Avsnitt 1. |
| 2.1 | Pågående epic | [x] | Epic 10 byggs och Epic 11 är planerad. Epic 12 rör inte deras stories och byggs efter Epic 11. |
| 2.2 | Ändringar på epic-nivå | [x] | Ny Epic 12 med sju stories. |
| 2.3 | Kommande epics | [x] | Epic 9 (vilar): läsningen av reklamblad (9.1–9.3) blir ett AI-jobb av samma slag när den tas upp igen. Inget i dess krav ändras. |
| 2.4 | Ogiltiga eller nya epics | [x] | Inga ogiltiga. En ny. |
| 2.5 | Ordning | [x] | Epic 12 efter Epic 11, före Epic 9. |
| 3.1 | PRD | [!] | Nya krav FR-45–FR-50, NFR-13 och UJ-10 i addendumet. NFR-7, FR-3, FR-4, FR-23 och FR-24 får ändrade konsekvenser. Numren efter Epic 11 (FR-44, NFR-12, UJ-9) och Epic 9 (FR-36, NFR-10, UJ-7). |
| 3.2 | Arkitektur | [!] | Ny AD-28, "AI-jobb och kön". Tillägg i AD-1, AD-2, AD-4, AD-9, AD-10, AD-13, AD-14, AD-15, AD-18, AD-23 och AD-26. |
| 3.3 | UX | [!] | `EXPERIENCE.md`: jobbraden, arket AI-jobb, flikmärket, den korta bekräftelsen för klara jobb, nya tillstånd och texter, ändrad regel om siffermärken, Flöde 10. `DESIGN.md`: komponenterna Jobbrad och Flikmärke. UX-DR29–UX-DR31. |
| 3.4 | Andra artefakter | [!] | En migration (12.4), typer, `docs/lm-studio.md` (ny), utvärderingen (`pnpm eval:ai`), säkerhetskopian (utesluter `ai_job`), en miljövariabel bara för mocken (`AI_MOCK_DELAY_MS`). |
| 4.1 | Direkt justering | Gångbar | Ny epic inom den befintliga strukturen. Medel insats, medel risk (avsnitt 3). |
| 4.2 | Återställning | Inte gångbar | Inget behöver göras om. |
| 4.3 | MVP-översyn | Inte gångbar | Lägger till. |
| 4.4 | Vald väg | [x] | Alternativ 1: direkt justering med en ny Epic 12. |
| 5.1–5.5 | Förslagets delar | [x] | Avsnitt 1–5. |
| 6.1–6.2 | Granskning | [x] | Förslaget stämmer med de uppdaterade dokumenten. |
| 6.3 | Godkännande | [x] | Pontus godkände planen ("ja planera det så"). Detaljerna är headless enligt grundregeln: allt går att ändra, och inget kräver Pontus konton eller hemligheter. |
| 6.4 | `sprint-status.yaml` | [x] | `epic-12: backlog`, sju stories och `epic-12-retrospective: optional`. |
| 6.5 | Överlämning | [x] | Avsnitt 5. |

### 2.2 Epics

- **Epic 1–11:** inget byggt beteende försvinner. AI-flödena (import i 1.6, 1.8 och 1.9, förslag i 5.2, bildanalys i 6.1, 6.4 och 6.6) körs i bakgrunden i stället för i sidans förfrågan (avsnitt 2.3).
- **Epic 9 (vilar):** när den tas upp igen läses reklambladen som AI-jobb.
- **Epic 12 (ny):** sju stories i ordning (avsnitt 4.4).

### 2.3 Påverkan på stories som redan är byggda

| Byggt i | Beteende nu | Med Epic 12 |
| --- | --- | --- |
| 1.4 | `AiService` med `parseRecipe`, `analyzeImage`, `suggestDishes`, `locateItems` | Också `warmUp(kind)` (12.2) och en strömmande variant av `suggestDishes` (12.7). Inget annat i porten ändras. |
| 1.6, 1.8, 1.9 | Arket Importera recept väntar på svaret. "Avbryt" stoppar. | Inläsningen blir ett AI-jobb. Pontus kan stänga arket och läsa in fler recept. När receptet är klart: kort bekräftelse, märke på Recept och förhandsgranskningen via "Visa". |
| 5.2 | "Letar efter idéer …" och "Avbryt". Tre förslag på en gång. | Ett AI-jobb. Pontus kan lämna Recept. Förslagen kommer ett i taget (12.7) med kortare svar (12.3). |
| 6.1, 6.4 | "Tittar på bilden …" och "Avbryt". Svaret jämförs med platsens varor direkt. | Ett AI-jobb per foto. Pontus kan fotografera nästa plats direkt. Jämförelsen ("Nytt", "Ändrat", "Syns inte längre") görs när resultatet hämtas, mot lagret som det är då. |
| 6.6 | Numren i ett andra anrop från klienten. Låset i `ai-runs.ts`. | Numren är andra steget i samma jobb, på servern. Kön ersätter låset (avsnitt 3, "Låset i 6.6 och kön"). |
| 8.4 | Fotot binds till stället när det tas. | Oförändrat: jobbet bär stället. Ett resultat för ett annat ställe än det valda visas med raden "Förslagen gäller Stugan." som förut. |
| 10.1 | Klienten skickar fotot till `/api/pantry/photo` vid första bekräftelsen. | Oförändrat så länge fliken har fotot kvar i minnet. Efter en omladdning finns fotot inte kvar, och då sparas inget senaste foto (avsnitt 3). |
| 1.3, 11.1 | Flikfältet utan märken | Flikmärke på Recept och Lagersaldo med antalet klara AI-resultat som Pontus inte har sett. En jobbrad ovanför flikfältet när något pågår. |

### 2.4 PRD

- **Nya krav** (addendumet, "Tillägg till 1.1: Snabbare och asynkron AI"):
  - FR-45: snabbare AI, mätt före och efter;
  - FR-46: AI-jobb i bakgrunden;
  - FR-47: kön;
  - FR-48: besked när ett resultat är klart;
  - FR-49: inaktuella resultat;
  - FR-50: första rätten direkt.
- **NFR-13:** integritet och tålighet för AI-jobb.
- **Ändrade konsekvenser:** NFR-7, FR-3, FR-4, FR-23 och FR-24.
- **Användarresa UJ-10:** "Kylen, frysen och ett recept på en gång".
- **Effektmål:** inget nytt. SM-2 och SM-3 gynnas.
- **Utanför Epic 12:** pushaviseringar, en annan modell eller molnleverantör, AI-jobb som överlever längre än en funktions tak (Vercel Workflows eller köer), parallella jobb mot modellen och att spara indata till ett jobb.
- `prd.md` §8.3 får en punkt som hänvisar till addendumet.

### 2.5 Arkitektur

- **AD-28 (ny), "AI-jobb och kön":** tabellen `ai_job`, Postgres-funktionerna, rutterna, körningen i `after()`, kön, tidsgränserna, inaktuella resultat, pollningen och integriteten.
- **Tillägg:**
  - AD-1: modulen `ai-jobs` äger `ai_job`;
  - AD-2: jobbrutterna skriver bara `ai_job`;
  - AD-4: RLS-test för `ai_job`;
  - AD-9: `warmUp`, strömning bara för `suggestDishes`, `maxDuration = 300` för jobbrutterna, `request.signal` stoppar inte längre modellen;
  - AD-10: `suggestDishes` ber om ett kompaktare svar som porten gör om till `AiRecipe`;
  - AD-13: nya felkoder;
  - AD-14: `AI_MOCK_DELAY_MS`, bara för mocken;
  - AD-15: ett foto i kö finns bara i funktionens minne, aldrig i `ai_job`;
  - AD-18: `ai_job` revalideras inte;
  - AD-23: säkerhetskopian tar inte med `ai_job`;
  - AD-26: inget senaste foto efter en omladdning.
- `.memlog.md`: beslutet loggat.

### 2.6 UX

- **EXPERIENCE.md:**
  - IA: Jobbraden och arket AI-jobb;
  - Voice and Tone: texter för jobb, kö och klara resultat;
  - Component Patterns: Jobbrad, AI-jobb (ark), Flikmärke, Kort bekräftelse för ett klart jobb, AI-förslag som kommer ett i taget;
  - State Patterns: i kö, pågår, klart, gick inte, avbrutet, inaktuellt, för lång kö och resultatet borta;
  - Interaction Primitives: siffermärken tillåts bara för klara AI-jobb;
  - Accessibility Floor och Flöde 10.
- **DESIGN.md:** komponenterna Jobbrad (`job-row`) och Flikmärke (`tab-badge`), med befintliga tokens.

### 2.7 Kod och drift (ingen kod ändras i den här kursändringen)

- **Migration (12.4):** tabellen `ai_job` med RLS, grants och Postgres-funktionerna i AD-28. Typerna genereras om.
- **Nya rutter:** `POST /api/ai/warm` (12.2), `POST /api/ai/jobs`, `POST /api/ai/jobs/photo`, `GET /api/ai/jobs` och `GET /api/ai/jobs/[id]` (12.4–12.6). De gamla rutterna tas bort i den story som flyttar flödet.
- **LM Studio:** ingen ändring under planeringen. 12.1 mäter och skriver `docs/lm-studio.md` med rekommenderade inställningar. Bygget får ändra inställningarna för att mäta, men återställer dem, och Pontus väljer (öppen fråga 20).
- **Säkerhetskopian:** utesluter raderna i `ai_job`.
- **Miljövariabler:** bara `AI_MOCK_DELAY_MS`, som läses av mocken och aldrig sätts i Vercel.

## 3. Rekommenderad väg

**Alternativ 1, direkt justering:** en ny Epic 12 med sju stories i ordning.

| Alternativ | Insats | Risk | Bedömning |
| --- | --- | --- | --- |
| 1. Ny Epic 12: fart först, sedan jobb och kö per flöde | Medel | Medel | Vald |
| 1b. Bara fart (12.1–12.3 och 12.7 utan jobb) | Liten | Låg | Inte vald. Det gör anropen kortare men låser fortfarande sidan. Pontus bad om båda. |
| 1c. Bara jobb, utan att mäta och snabba upp | Medel | Medel | Inte vald. Ett långsamt jobb i bakgrunden är fortfarande långsamt, och kön blir längre. |
| 1d. En extern kö (Vercel Workflows, Queues, Inngest) | Stor | Medel | Inte vald. Indata (foton) skulle behöva sparas för att en annan process ska kunna köra jobbet, och AD-15 förbjuder det. Kräver nya konton. |
| 2. Återställning | – | – | Inte gångbar |
| 3. MVP-översyn | – | – | Inte gångbar |

### Beslut inom alternativ 1

| Fråga | Vald | Alternativ | Varför |
| --- | --- | --- | --- |
| Ordning | Mätning och snabba vinster (12.1–12.3), sedan jobbtabellen och kön med AI-förslag som första flöde (12.4), bildanalysen (12.5), importen (12.6) och sist strömningen av den första rätten (12.7) | Jobben först | Pontus bad om fart först. Mätningen ger också tiderna som kön dimensioneras efter. |
| Var körs jobbet? | I `after()` i samma förfrågan som tog emot jobbet. Servern svarar direkt med jobbet (202), och funktionen lever vidare till sitt tak. | En separat arbetare som hämtar jobb ur tabellen; en extern kö | Indata (fotot, recepttexten) finns bara i den förfrågans minne och sparas aldrig (AD-15). Inget nytt konto, ingen ny tjänst, och samma sak fungerar lokalt med `next start` och på Vercel. |
| Hur länge får ett jobb leva? | Jobbrutterna får `maxDuration = 300` (taket på Vercel Hobby). Ett jobb måste börja senast 300 s − 5 s marginal − jobbets körtid efter att det togs emot: körtiden är 120 s för förslag och bildanalys och 130 s för import, så kötiden är högst 175 respektive 165 s. Hinner det inte börja får det `ai_queue_timeout`. | 120 s som i dag; Pro med 800 s | 300 s är taket på Hobby. Det räcker för ett jobb som kör och ett eller två som väntar med tiderna i T5 och T6. Väntan kostar nästan ingen CPU (Fluid compute). |
| Kön | Ett jobb i taget per användare, i Postgres: ett partiellt unikt index tillåter bara en rad med `status = 'running'` per användare. Den väntande förfrågan frågar `claim_ai_job` varje sekund tills det är dess tur. Äldst först. Högst tre aktiva jobb (ett som körs och två i kö); ett fjärde får `ai_queue_full`. | Ett lås i processen som i 6.6; ingen kö (jobben körs samtidigt) | Pontus Mac kör ett Qwen-jobb i taget effektivt. Ett index i databasen gäller över flikar, enheter och serverinstanser, vilket låset i processen inte gör. |
| Ett jobb som dör | Varje jobb har `expires_at`: för ett jobb i kö den sista tiden det får börja, för ett jobb som körs start + körtid + 10 s. Ett jobb vars tid har gått visas som `ai_job_lost` ("AI-jobbet avbröts. Försök igen.") och stoppar aldrig kön: `claim_ai_job` och `enqueue_ai_job` markerar det som misslyckat. | Hjärtslag; att en annan förfrågan tar över jobbet | En funktion som dör kan inte göra något mer, och indata finns inte kvar för någon annan att köra. Fasta tider är enklast och ger en övre gräns. |
| Dubbla jobb | Klienten skickar en `clientKey` (uuid) per tryck. Samma nyckel ger samma jobb. Ett nytt AI-förslag när ett redan är aktivt ger det aktiva jobbet. Ett nytt foto av samma plats på samma ställe ersätter ett äldre foto av den platsen som är i kö eller körs (`superseded`). Importer kan köas efter varandra. | Ingen kontroll; ett lås per sort | Dubbeltryck och nya försök efter nätfel ger aldrig två jobb. Det som är meningslöst att köra två gånger stoppas, resten köas. |
| Pollning eller Supabase Realtime | Pollning: `GET /api/ai/jobs` varannan sekund medan något jobb är aktivt och fliken syns, en gång när fliken visas igen och en gång när appen laddas. Ingen pollning annars. | Supabase Realtime (Postgres Changes) | Realtime kräver Supabase-klienten i webbläsaren, vilket AD-2 förbjuder, och en publikation och RLS för Realtime som också måste testas i CI. Pollning är en vanlig Route Handler med `requireUserForRoute()`, en användare och några dussin förfrågningar per jobb. |
| Besked när ett jobb är klart | En kort bekräftelse ("3 rättförslag är klara." med "Visa", 8 s) och ett flikmärke med antalet klara resultat som Pontus inte har sett, på Recept (förslag, import) eller Lagersaldo (bildanalys). Ett resultat räknas som sett när det har visats. Ingen kort bekräftelse när Pontus redan är på sidan där resultatet visas. | Bara märket; en pushavisering | Pontus vill kunna klicka runt och få resultaten när de är klara. Märket finns kvar om bekräftelsen missas. Push kräver en service worker (AD-27). |
| "2 i kö" | En jobbrad ovanför flikfältet (i sidomenyn på dator) när något jobb är aktivt: "AI: Tittar på fotot av kylen · 2 i kö". Ett tryck öppnar arket AI-jobb med varje jobb, dess läge och "Avbryt" eller "Visa". | Bara i flödet som startade jobbet | Pontus ska se att arbetet pågår också på andra sidor. |
| Inaktuella resultat | Ingenting från AI sparas någonsin automatiskt, inte heller i Epic 12: Pontus bekräftar eller sparar som förut (AD-2). Ett nytt foto av samma plats gör det äldre jobbet `superseded`: det visas aldrig. Ett byte av ställe gör inte en bildanalys inaktuell (8.4: fotot hör till stället), men förslagen visas med "Förslagen gäller Stugan.". Ett byte av ställe gör AI-förslagen inaktuella: de visas med "Förslagen bygger på lagret för Hemma." och "Föreslå igen". Jämförelsen med platsens varor görs när resultatet hämtas. En import blir aldrig inaktuell. | Att kasta alla resultat när något ändras | Det som ändrar vad resultatet betyder märks, och det som gör resultatet meningslöst tas bort. Inget blir fel tyst. |
| Låset i 6.6 och kön | `ai-runs.ts` och kartan i `suggestFromPantry` tas bort. Kön gör samma sak i databasen: ett jobb i taget per användare. Analysen stoppar inte längre andra sorters jobb, bara ett äldre foto av samma plats. Numren (6.6) är andra steget i samma jobb: jobbet räknas som pågående tills numren är klara, högst 30 s till, och resultatet visas så fort avläsningen finns. Numren hoppas över när ett nyare foto av samma plats väntar eller när tiden inte räcker. | Behålla låset bredvid kön | Två regler för samma sak skulle kunna säga emot varandra. Numren i samma jobb gör att fotot inte behöver skickas två gånger, och att två modellanrop aldrig går samtidigt. |
| Avbryt | "Avbryt" sätter jobbet till `cancelled` med en Server Action. Den förfrågan som kör jobbet läser dess läge var tredje sekund och avbryter modellen, också om "Avbryt" kom till en annan serverinstans. | Bara `request.signal` som i dag | Förfrågan som startade jobbet har redan svarat, så dess signal kan inte längre stoppa något. |
| Foton | Ett foto finns bara i minnet i den förfrågan som tog emot det, medan jobbet väntar och körs. Det sparas aldrig i `ai_job`, på disk eller i loggar (AD-15). Klienten behåller fotot i minnet för granskningen, numren och det senaste fotot (10.1) tills resultatet har stängts. Efter en omladdning finns det inte kvar: korten fungerar, men fotoarket och det senaste fotot saknas för det jobbet. | Spara fotot tillfälligt i Storage | AD-15 och AD-26: foton sparas bara som senaste foto efter en bekräftelse. Att förlora fotot efter en omladdning är en liten förlust. |
| Hur länge finns resultatet? | Tills Pontus stänger eller sparar det, och högst 24 timmar. Gallras vid nästa jobb. Raderna tas aldrig med i säkerhetskopian. | 7 dagar; tills Pontus öppnar det | Ett resultat är ett förslag att ta ställning till nu, inte data att spara. Öppen fråga 19. |
| Modul | En ny modul `ai-jobs` äger `ai_job` och är allmän: den vet inget om recept, lager eller förslag. Rutterna sätter ihop jobbet med modulens serverfunktion (`analyzePlace`, `importRecipe`, `suggestFromPantry`). Klienten använder `src/lib/ai-jobs-client.ts`. | Varje modul med en egen jobbtabell | En kö kräver en tabell. Rutterna är det lager som redan får använda alla moduler. |
| Det som går att kontrollera utan AI | Kontrolleras innan jobbet läggs i kö och ger fel direkt: inloggning, indata, stället (8.4), tomt lager (5.2), domänlistan för en länk (1.8). | Allt i jobbet | Pontus ska inte vänta i kön för att få veta att länken inte är godkänd. |
| Väckning av modellen | `POST /api/ai/warm` när Lagersaldo (bild) eller Recept (text) öppnas, högst en gång per sort och fem minuter. Servern svarar direkt och skickar i bakgrunden ett anrop med flödets egen systemprompt, minimal indata och `maxOutputTokens: 1`. Inte när ett jobb är aktivt. Bara LM Studio; mocken och molnleverantörerna gör inget. Behålls bara om mätningen i 12.2 visar att det första riktiga anropet blir minst 20 % snabbare. | Väck vid varje sidbyte; låt bli | Ett kallt foto tog 65 s och ett varmt 20 s. Modellen laddas aldrig ur, så det är oklart vad som är kallt (T9). Mätningen avgör. |
| LM Studio | 12.1 mäter PARALLEL 1 mot 4, kall och varm modell och spekulativ avkodning (`--speculative-draft-mtp`), och skriver `docs/lm-studio.md` med rekommendationen. Utgångspunkten är PARALLEL 1, kontext 8 192 och ingen TTL, eftersom appen ändå kör ett jobb i taget. Bygget återställer inställningarna efter mätningen; Pontus väljer. | Ändra direkt | Det är Pontus dator. Med kön finns inget att vinna på fyra samtidiga anrop från appen, men mätningen ska visa det. |
| Kortare AI-förslag | Ett kompaktare svar för `suggestDishes`: receptraden har `text`, `amount`, `unit`, `name` och `stepIndexes`, och avdelning, plats och enhet bara för en vara som inte finns i lagret (`new`). `isVague` räknas fram (`amount` är `null`). Porten gör om svaret till `AiRecipe`, så `fromAiRecipe` och resten är oförändrade (AD-10). Målet är minst 25 % färre token och högst 40 s i median med varm modell, utan sämre utvärdering. | Två förslag i stället för tre; färre steg; korta nycklar i JSON | Det mesta av svaret är katalogförslag för varor som redan finns i katalogen. Antalet rätter och stegen står kvar så länge målet nås. Öppen fråga 21. |
| Strömning | `streamText` med `Output.array` och `elementStream` bara för `suggestDishes`. Varje färdig rätt matchas mot katalogen och läggs till i jobbets resultat, och klienten visar den vid nästa pollning. Först ett prov mot LM Studio: strömmar inte svaret med JSON-schema, avslutas storyn med mätningen och beslutet. | Strömma till klienten med SSE | Jobbet i bakgrunden och pollningen finns redan, och en ny rätt syns inom två sekunder. Ingen ny transport. |

**Insats:** medel. 12.4 och 12.5 är störst.
**Risk:** medel. Det nya är kön och att arbete fortsätter efter svaret. Riskerna och hur de hanteras:

| Risk | Hantering |
| --- | --- |
| Funktionen dör mitt i ett jobb (tak, krasch, ny driftsättning) | `expires_at` per jobb. Jobbet visas som `ai_job_lost` och stoppar aldrig kön. |
| Ett jobb i kö hinner aldrig börja | Högst tre aktiva jobb. Kötiden har en gräns (175 eller 165 s), och sedan `ai_queue_timeout` med "Försök igen". |
| Dubbla jobb | `clientKey`, ett AI-förslag åt gången och `superseded` för ett äldre foto av samma plats. |
| Flera flikar och enheter | Kön, lägena och "sett" ligger i databasen. Varje flik pollar och visar samma sak. |
| Två serverinstanser | Det partiella unika indexet och `claim_ai_job` med radlås. "Avbryt" går via databasen. |
| Integritet | Inga foton och ingen recepttext i `ai_job` eller i loggar, RLS-test, raderna utesluts ur säkerhetskopian, resultat högst 24 h. |
| Sessionen i `after()` | `cookies()` fungerar i `after()` i en Route Handler enligt dokumentationen. Det prövas först i 12.4 (T10). Annars får modulens serverfunktion användaren som argument. |
| Strömningen fungerar inte mot LM Studio | Prov först i 12.7. Annars visas alla tre rätter på en gång som efter 12.3. |
| Väckningen hjälper inte | Mäts i 12.2 och tas bort om den inte ger minst 20 %. |

**Tidsplan:** Epic 12 byggs story för story i grenen `epic/12-asynkron-ai` när Epic 11 är ihopslagen.

## 4. Ändringar i detalj

Alla ändringar nedan är införda i dokumenten.

### 4.1 PRD

- `addendum.md`: nytt avsnitt **"Tillägg till 1.1: Snabbare och asynkron AI (Epic 12)"** med mål, UJ-10, ordlista, FR-45–FR-50, NFR-13, ändrade konsekvenser, vad som ligger utanför och datamodellen.
- `prd.md` §8.3: en ny punkt som hänvisar till addendumet.

**Exempel, NFR-7:**

```
FÖRE: Receptimport och bildanalys får ta längre tid men visar förlopp, och går att avbryta eller göra om.
EFTER (addendum, ändrade konsekvenser): Receptimport, bildanalys och AI-förslag körs som AI-jobb. Att starta ett jobb svarar inom en sekund, och resten av appen går att använda medan det körs. Förloppet syns i jobbraden, och jobbet går att avbryta där eller i flödet.
```

Skäl: "att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara" (Pontus, 2026-10-26).

### 4.2 Arkitektur (`ARCHITECTURE-SPINE.md`)

- Frontmatter: `scope` omfattar Epic 12, `binds` får FR-45–FR-50 och NFR-13, och `sources` får den här kursändringen.
- Tillägg märkta "(Epic 12)" i AD-1, AD-2, AD-4, AD-9, AD-10, AD-13, AD-14, AD-15, AD-18, AD-23 och AD-26.
- **AD-28 (ny), AI-jobb och kön.**
- Modultabellen, källträdet, datamodellen, Capability Map och Deferred.
- `.memlog.md`: beslutet loggat.

### 4.3 UX

- `EXPERIENCE.md`: Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor och Flöde 10.
- `DESIGN.md`: frontmatter (`job-row`, `tab-badge`) och Components.

### 4.4 Epics (`epics.md`)

Ny `## Epic 12: Snabbare och asynkron AI` med:

1. **Story 12.1: Mät AI-tiderna och ställ in LM Studio.** Utvärderingen mäter kall och varm modell per flöde, PARALLEL 1 mot 4 och spekulativ avkodning. `docs/lm-studio.md` med rekommendationen.
2. **Story 12.2: Väck modellen i förväg.** `warmUp` i porten, `POST /api/ai/warm` från Lagersaldo och Recept, mätt före och efter.
3. **Story 12.3: Kortare svar för AI-förslag.** Det kompakta svaret, omgjort till `AiRecipe` i porten, mätt före och efter.
4. **Story 12.4: AI-jobb i kö, med AI-förslag först.** `ai_job`, kön, körningen i `after()`, pollningen, jobbraden, arket AI-jobb, den korta bekräftelsen och flikmärket. AI-förslagen är det första flödet.
5. **Story 12.5: Bildanalys i bakgrunden.** Analysen och numren som ett jobb, `superseded` för ett äldre foto av samma plats, jämförelsen vid hämtning och fotot kvar i klienten. Låset i 6.6 tas bort.
6. **Story 12.6: Receptimport i bakgrunden.** Text, länk och foto som jobb, flera i kö.
7. **Story 12.7: Första rätten direkt.** Strömning av AI-förslagen, en rätt i taget, om provet mot LM Studio går igenom.

Översikten, Requirements Inventory (FR45–FR50, NFR13, UX-DR29–UX-DR31), FR Coverage Map och Epic List är uppdaterade.

### 4.5 Sprintstatus

```yaml
  epic-12: backlog
  12-1-mät-ai-tiderna-och-ställ-in-lm-studio: backlog
  12-2-väck-modellen-i-förväg: backlog
  12-3-kortare-svar-för-ai-förslag: backlog
  12-4-ai-jobb-i-kö-med-ai-förslag-först: backlog
  12-5-bildanalys-i-bakgrunden: backlog
  12-6-receptimport-i-bakgrunden: backlog
  12-7-första-rätten-direkt: backlog
  epic-12-retrospective: optional
```

### 4.6 Epic-kontext och spec-utkast

- `_bmad-output/implementation-artifacts/epic-12-context.md`, i samma form som `epic-11-context.md`.
- Spec-utkast med status `draft`: `spec-12-1-mat-ai-tiderna-och-stall-in-lm-studio.md`, `spec-12-2-vack-modellen-i-forvag.md`, `spec-12-3-kortare-svar-for-ai-forslag.md`, `spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md`, `spec-12-5-bildanalys-i-bakgrunden.md`, `spec-12-6-receptimport-i-bakgrunden.md` och `spec-12-7-forsta-ratten-direkt.md`.

## 5. Överlämning

- **Omfattning:** Moderate. En ny epic, en ny AD och tillägg i elva, men ingen ny plan för hela appen.
- **Mottagare:** utvecklingen (`bmad-build`), story för story i ordningen 12.1 → 12.7, utan att fråga mellan storyna. Spec-utkasten färdigställs när storyn påbörjas.
- **Gren:** `epic/12-asynkron-ai`, skapad från `epic/11-nytt-utseende`. När Epic 11 är ihopslagen slås `main` in i grenen innan 12.1 börjar. PR till `main`, med alla sex kontroller och en kodgranskning (AD-23). Planeringsdokumenten följer med i epic-grenen.
- **Mätningar:** 12.1, 12.2, 12.3 och 12.7 kräver LM Studio på Pontus Mac (`AI_PROVIDER=lmstudio pnpm eval:ai`). Bygget får ändra LM Studio för att mäta, med `lms load`, men skriver ned inställningarna före och återställer dem efteråt. Siffrorna skrivs i `docs/lm-studio.md`, T5, T6 och beslutsloggen.
- **E2E-användare (en per spec):** `e2e-ai-varm@matkoll.test` (12.2), `e2e-ai-jobb@matkoll.test` (12.4), `e2e-ai-foto@matkoll.test` (12.5), `e2e-ai-import@matkoll.test` (12.6) och `e2e-ai-strom@matkoll.test` (12.7). 12.1 och 12.3 har inga e2e-tester utöver de befintliga.
- **Klart betyder:**
  - Varje snabb vinst är mätt före och efter, och bara de som hjälper finns kvar.
  - Pontus kan starta en bildanalys, ett AI-förslag och en import, gå till en annan sida och få en kort bekräftelse och ett flikmärke när varje resultat är klart.
  - Jobben körs ett i taget, jobbraden säger "2 i kö", och "Avbryt" fungerar för ett jobb i kö och ett som körs.
  - Ett äldre foto av samma plats visas aldrig, och inget resultat sparas utan att Pontus bekräftar.
  - Inget foto och ingen recepttext finns i `ai_job` eller i loggar, visat med tester.
  - Ett jobb vars funktion dör stoppar aldrig kön längre än sin tidsgräns.
  - Alla sex kontroller passerar.
- **Pontus:** inga konton eller hemligheter behövs. Pontus väljer LM Studios inställningar efter `docs/lm-studio.md` (öppen fråga 20). Fem frågor till efter användning står i `docs/oppna-fragor.md` (17–21), och tre tekniska osäkerheter (T8–T10) utreds under bygget.
