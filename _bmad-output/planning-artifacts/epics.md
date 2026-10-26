---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Matkoll-2026-10-25/addendum.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md
  - docs/brief.md
  - docs/autonomi.md
---

# Matkoll – epics och stories

## Översikt

Det här dokumentet delar upp kraven i PRD:n, UX-dokumenten (`DESIGN.md`, `EXPERIENCE.md`) och arkitekturen (`ARCHITECTURE-SPINE.md`, AD-1–AD-24 och AD-26) i epics och stories som går att bygga var för sig. Story-rubrikerna läses av `scripts/board.mjs` och blir kort på boarden. Epic 1–7 är version 1.0. Epic 8 är version 1.1, "Flera ställen", som kom till genom kursändringen `sprint-change-proposal-2026-10-26-flera-stallen.md`. Dess krav står i PRD-addendumet under "Version 1.1: Flera ställen". Epic 10, "Senaste fotot per plats", är ett tillägg till 1.1 som kom till genom kursändringen `sprint-change-proposal-2026-10-26-spara-foto.md`. Dess krav står i addendumet under "Tillägg till 1.1: Senaste fotot per plats". Epic 9 (veckans erbjudanden, FR34–FR36, NFR10, AD-25, UX-DR19–UX-DR20) är planerad men vilar på grenen `epic/9-erbjudanden`, så de numren är reserverade.

## Requirements Inventory

### Functional Requirements

- FR1: Pontus loggar in med engångslänk till e-post och förblir inloggad på enheten; utan inloggning omdirigeras sidor till inloggningen och serverfunktioner svarar 401; bara tillåtna e-postadresser får åtkomst.
- FR2: All data tillhör en användare och kan inte läsas eller ändras av en anonym klient eller en annan användare (RLS, automatiska tester).
- FR3: Import från länk till godkänd receptsajt: servern hämtar sidan, ej godkänd domän avvisas utan hämtning, strukturerad receptdata används i första hand, källan sparas.
- FR4: Import från inklistrad text eller foto av kokbokssida ger samma förhandsgranskning som länkimport; misslyckad länkimport erbjuder textinklistring.
- FR5: Varje importerat recept blir Matkolls format: receptrader med originaltext, mängd, enhet och katalogingrediens (vaga rader märks), koppling mot katalog inklusive synonymer eller ny katalogingrediens, steg omskrivna i samma stil, AI-svar validerade med nytt försök och begripligt fel.
- FR6: Förhandsgranskning där titel, portioner, receptrader och steg kan ändras före sparning; inget sparas före "Spara"; receptrader och kopplingar kan rättas även efter sparning.
- FR7: Godkända receptsajter läggs till och tas bort i inställningarna utan kodändring; startlista koket.se och tasteline.com; ny domän fungerar direkt.
- FR8: Receptbiblioteket kan bläddras, sökas på titel eller ingrediens och filtreras på Alla, Favoriter och Kan lagas nu; varje recept visar bild, titel, tid, portioner och lagningsstatus, som räknas om när lagret ändras.
- FR9: Ett tryck markerar eller avmarkerar favorit.
- FR10: Ett sparat recept kan ändras och tas bort; borttagning kräver bekräftelse.
- FR11: Lagervaror kan läggas till, ändras och tas bort; varje lagervara pekar på en katalogingrediens (sök även på synonymer eller skapa ny); mängd och enhet är valfria (tom mängd = obegränsad); plats föreslås från katalogen och kan ändras.
- FR12: Lagret visas per plats med tre platskort (Kyl, Frys, Skafferi) med antal; varor med mängd som rader, obegränsade som etiketter under "Finns hemma".
- FR13: Matsedel skapas och matsedelsrätter läggs till, tas bort och får ändrade portioner; en favorit läggs till med högst två tryck; förvalda portioner = receptets originalportioner; varje matsedelsrätt visar lagningsstatus.
- FR14: Tidigare matsedlar kan visas och användas som grund för en ny.
- FR15: Inköpslistan beräknas från matsedeln: skalning efter portioner, sammanslagning per katalogingrediens och enhet, obegränsade lagervaror ger ingen post, lager i samma enhet dras av, olika enheter visas sida vid sida, vaga mängder blir "finns hemma?"-poster om varan saknas.
- FR16: Listan används med en hand i butiken: grupperad per butiksavdelning, visar vilken rätt posten kommer från, bockrutor minst 44 × 44 px och avbockning sparas direkt.
- FR17: Egna varor (fritext, kopplas till katalogen om det går) kan läggas till och tas bort.
- FR18: När matsedeln ändras räknas listan om utan att avbockningar eller egna varor försvinner.
- FR19: Ett tryck lägger alla avbockade listposter i lagret (ny lagervara eller ökning av befintlig med samma enhet, på katalogingrediensens plats); de försvinner från listan.
- FR20: Receptvyn med portionsväljare som skalar mängder direkt, "X av Y hemma", status per receptrad, ingredienser ovanför steg på mobil och sida vid sida på dator, knapparna "Lägg på matsedeln" och "Laga nu".
- FR21: Stegläge med ett steg i taget i stor text och stegets receptrader; skärmen hålls tänd, med diskret notis om webbläsaren saknar stöd.
- FR22: Recepten kan rangordnas efter hur få varor som saknas.
- FR23: AI-förslag utifrån lagret, tydligt märkta och skilda från biblioteket, kan sparas via förhandsgranskningen.
- FR24: En plats kan fotograferas (eller bild väljas) från platsens vy; kameraknappen följer vald plats; bildanalysen ger lagerförslag kopplade till katalogen med vald plats som förval.
- FR25: Varje lagerförslag kan bekräftas, rättas eller avvisas; inget blir lagervara utan bekräftelse och avvisade sparas inte.
- FR26: "Skicka till ICA" kopierar en varukorgsexport till urklipp med alla icke avbockade poster (vara, mängd, enhet, produktval) och butikens namn och adress, i ett stabilt dokumenterat format för Claude in Chrome.
- FR27: Produktval (namn, förpackningsstorlek, ev. länk) kan sparas per katalogingrediens och följer med i exporten.
- FR28: Butik kan ändras i inställningarna (namn, kedja, butiks-id, adress), även till andra kedjor.

Version 1.1 (addendum, "Version 1.1: Flera ställen"):

- FR29: Ställen kan läggas till, byta namn och tas bort när de är tomma och inte valda. Namnet har 1–40 tecken och är unikt, och det får finnas högst 10 ställen. Befintligt lager hamnar på "Hemma", som är valt.
- FR30: Pontus väljer ställe med ett tryck i Hemma. Valet sparas på servern, gäller alla enheter och styr Hemma, lagningsstatusen, rangordningen, AI-förslagen, inköpslistans avdrag, "Lägg i lagret" och bildanalysen. Lagret summeras aldrig över ställen.
- FR31: Lagret på vilket ställe som helst kan ses och ändras på distans.
- FR32: Inköpslistan drar av lagret för valt ställe, visar "Lager: <namn>" med "Byt" när det finns flera ställen och behåller bockar, överstyrningar och egna varor vid byte. "Lägg i lagret" lägger på listans ställe.
- FR33: En skrivning hamnar på det ställe som vyn visade, och "Ångra" sätter tillbaka på samma ställe.
- FR37: När något från ett fotos lagerförslag har sparats i lagret sparas fotot som senaste foto av platsen på det ställe det togs för: den förminskade bilden utan metadata, tiden, avläsningen och punkterna. Ett nytt foto ersätter det förra, och ett foto vars förslag bara avvisas sparas inte.
- FR38: Hemma visar "Senaste foto av kylen: idag 15:42" med "Visa" för platsen på det ställe som visas. "Visa" öppnar fotot i arket från 6.6 med numrerade markörer och avläsningen som numrerad lista.
- FR39: Ett foto som är äldre än 30 dagar visas inte och tas bort. Pontus kan ta bort fotot efter en kontrollfråga, och foton försvinner med sitt ställe och sin användare. "Töm kylen" tar inte bort fotot.

### NonFunctional Requirements

- NFR1 Säkerhet: all hämtning från receptsajter och alla AI-anrop sker på servern; nycklar bara på servern; hämtning bara från godkända receptsajter, testat automatiskt.
- NFR2 Utbytbar AI: leverantör (lokal modell, Anthropic, OpenAI) byts via konfiguration; testleverantör (mock) gör att tester körs utan modell.
- NFR3 Responsiv: alla vyer fungerar från 375 px bredd och på dator; fyra flikar på mobil, sidomeny på dator.
- NFR4 Tillgänglighet: tryckytor minst 44 px, läsbar kontrast i ljust och mörkt läge.
- NFR5 Utseende: tokens och skärmregler från UX; inget rött; ljust och mörkt läge.
- NFR6 Språk: gränssnittet på svenska.
- NFR7 Svarstider: lista, lager och bibliotek inom en sekund; import och bildanalys visar förlopp och kan avbrytas eller göras om.
- NFR8 Tvingande kontroller: hemlighetsskanning, RLS-tester, test av domänbegränsning, lint och kodgranskning blockerar sammanslagning.
- NFR9 (1.1) Migrering och svarstider för ställen: en migration som bara lägger till, fungerar med 1.0-koden och visas i ett test lämna lagret oförändrat. Byte av ställe svarar inom en sekund.
- NFR11 (Epic 10) Integritet för platsfoton: privat bucket med RLS-tester, ingen publik eller signerad länk, ingen metadata i sparade foton (test), aldrig till AI-tjänsten igen, aldrig i repot, loggar eller säkerhetskopian, och inom Supabase gratisnivå.

### Additional Requirements

Från arkitekturen (`ARCHITECTURE-SPINE.md`):

- **Startmall (Epic 1 Story 1):** projektet skapas med `create-next-app@16.4.3` (TypeScript, Tailwind, ESLint, App Router, `src/`, pnpm, `cacheComponents: true`), med versionerna i Stack-tabellen. ESLint-zoner för lagerreglerna (AD-1), `vitest.config.ts`, Playwright, `lefthook` och `"engines": { "node": "24.x" }` läggs in direkt.
- Modulstruktur `src/features/<modul>/{ui,actions,domain,data}` med `index.ts` och `server.ts`, och tabellägarskap enligt AD-1.
- Lokal Supabase via CLI (OrbStack), `auto_expose_new_tables = false`, `enable_signup = false`, e-postmall för engångslänk och `auth/confirm` med `verifyOtp` (AD-3, AD-4).
- Varje tabell: `user_id`, RLS, grants till `authenticated` och `service_role`, sammansatt främmande nyckel för barntabeller, RLS-test (AD-4). Typer genereras efter varje migration och kontrolleras i CI (AD-5).
- `requireUser()` med `getClaims()` och kontroll mot `ALLOWED_EMAILS`; `pnpm users:sync` skapar tillåtna användare (AD-3).
- `ensure_user_defaults()` lägger in startdata (receptsajter, butik) efter inloggning (AD-21).
- Resultatform och felkoder i `src/lib/errors.ts` med svenska texter (AD-13); miljövariabler i `src/server/env.ts` med godkända namn och `.env.example` (AD-14).
- AI-port `src/server/ai/` med adaptrar `lmstudio`, `anthropic`, `openai`, `mock`, `generateText` + `Output.object`, avbrott, tidsbudget och felhantering (AD-9); `pnpm eval:ai` mot testuppsättning; röktest av Qwen3.6 med bild och JSON-schema.
- `safeFetch` med domänkontroll, DNS-kontroll, manuella omdirigeringar, tidsgräns och storleksgräns, testad mot sparade sidor från koket.se och tasteline.com (AD-11).
- Skrivfri katalogmatchning `matchIngredients` och skrivande `commitIngredients` (AD-6); enheter, mängdformatering, avdelningar och platser i `catalog/domain` (AD-12).
- Mängdlogik `aggregateNeeds`, `coverage`, `recipeStatus` och `scale` (AD-7); inköpslistan beräknas av `computeList` med överlägg (AD-8).
- Lagrets skrivoperationer `addToPantry`, `setPantryItems`, `removePantryItem`, `restorePantryItem` och `getPantrySnapshot` (AD-19).
- Referenser och borttagning med `restrict`, `cascade` inom aggregat och ögonblicksbild av recepttitel på matsedeln (AD-20); aktuell matsedel med `addToCurrentPlan` och `set_current_meal_plan()` (AD-22).
- Rendering med `cacheComponents`, sessionsläsning i `<Suspense>`, `revalidateFor(table)` (AD-18).
- Fotoförminskning i klienten (högst 1600 px och 1,5 MB), aldrig lagrade foton (AD-15).
- Exportformat `Matkoll varukorgsexport v1`, dokumenterat i `docs/varukorgsexport.md` med golden-file-test (AD-16).
- CI i GitHub Actions: lint, typkontroll, Vitest, typdrift, RLS-tester, domänbegränsning, Playwright med mock, gitleaks; skyddad `main`; en gren per epic (AD-23).
- Veckovis krypterad databasdump och driftsättning till Vercel och Supabase i Stockholm efter Epic 1–3 (AD-23; kräver Pontus konton).
- (1.1) Ställen i lagret (AD-24):
  - `pantry_site`, som ägs av `pantry`, med högst ett valt ställe;
  - `pantry_item.site_id` och en unik nyckel per ställe;
  - `getPantrySnapshot(siteId?)` för valt ställe, och skrivningar med ställets id från vyn;
  - parametern `site uuid default null` i pantry-funktionerna;
  - `ensure_pantry_defaults()`;
  - en migrering till "Hemma" som bara lägger till;
  - `revalidateFor('pantry_site')`.

### UX Design Requirements

Från `DESIGN.md` och `EXPERIENCE.md`:

- UX-DR1: Designtokens (färger ljust och mörkt, typografi, radier, avstånd) som CSS-variabler i `globals.css` med Tailwind `@theme inline`; mörkt läge via `prefers-color-scheme`; `ink-3` bara på `surface`.
- UX-DR2: App-skal med flikfält (Recept, Matsedel, Lista, Hemma) under 1024 px och sidomeny (plus Inställningar) från 1024 px; aktivt mål markerat; scrollposition och filter behålls vid flikbyte.
- UX-DR3: Gemensamma byggstenar: primär- och sekundärknapp (52 px), fast åtgärdsknapp ovanför flikfältet, filterpiller, sökfält (200 ms fördröjning), portionsväljare (− / +, minst 1), statusetiketter (mint/ljusblå), AI-etikett (sand), hjärta, rund bock (26 px synlig, 44 px tryckyta).
- UX-DR4: Ark som glider upp (dialog på dator, högst 560 px), stängs med Klar/Avbryt/svep/Esc/klick utanför, frågar "Släng ändringarna?" vid osparade ändringar, staplas aldrig.
- UX-DR5: Meddelanderuta (beständig, ljusblå, med åtgärd) och kort bekräftelse (4 s, "Ångra" i 5 s efter borttagning, live-region, en i taget).
- UX-DR6: Skelettrader efter 300 ms vid laddning; förloppstext och "Avbryt" för AI-arbete; inga helskärmssnurror.
- UX-DR7: Receptrad med bild 72 px, titel, "35 min · 4 portioner", statusetikett och hjärta.
- UX-DR8: Ingrediensrad med bock (finns) eller ring (saknas), mängd i `sky-ink` när den saknas, vag mängd som originaltext; i förhandsgranskningen "Kontrollera" och "Ny".
- UX-DR9: Listpost med bock, varunamn, "från <rätt>", mängd; avbockad genomstruken; varianter för olika enheter ("2 dl (hemma: 1 kg)") och "Finns hemma?".
- UX-DR10: Platskort (Kyl mint, Frys ljusblå, Skafferi sand) med ikon och antal, valt kort med 2 px accentram; etiketter för obegränsade varor; kameraknapp vars text följer platsen.
- UX-DR11: Lagerförslag-kort med Bekräfta, Rätta, Avvisa och "Bekräfta alla".
- UX-DR12: Stegläge i helskärm: "Steg N av M", stegets receptrader ovanför texten i 24 px, Föregående/Nästa i tumzonen, svep och piltangenter, Wake Lock med notis.
- UX-DR13: Svep vänster för "Ta bort" på listpost, lagervara och matsedelsrätt som genväg; förhandsbekräftelse bara för recept och matsedel.
- UX-DR14: Tillgänglighet: namn och tillstånd för skärmläsare, status aldrig bara med färg, synlig fokusram, logisk tabbordning, "Minska rörelse", 200 % textförstoring utan vågrät scroll, inmatningsfält minst 16 px text.
- UX-DR15: Svenska texter enligt Voice and Tone, inklusive alla tillstånd i State Patterns (tomma lägen, fel, laddning, AI otillgänglig, utan nät).
- UX-DR16: Inställningar: godkända receptsajter, butik, logga ut.
- UX-DR17 (1.1): Ställesväljare med filterpiller ovanför platskorten och "Ställen" när det finns flera ställen, annars bara "Lägg till ställe" längst ned i Hemma. Arket Ställen (lägg till, byt namn, ta bort ett tomt ställe). Raden "Lager: <namn>" i listan (med "Byt" och arket "Räkna listan mot"), matsedeln, receptvyn och biblioteket med "Kan lagas nu", bara när det finns flera ställen.
- UX-DR18 (1.1): Texter för ställen enligt EXPERIENCE.md, Voice and Tone: inga ställesnamn när det bara finns ett ställe, och annars mönstren "Lager: Stugan" och "… för Stugan.".
- UX-DR21 (Epic 10): Raden "Senaste foto av kylen: idag 15:42" med textknappen "Visa" direkt under kameraknappen i Hemma, och fotoarket från 6.6 med numrerade markörer, "AI:n läste av:" med en numrerad lista och "Ta bort fotot" med kontrollfråga.
- UX-DR22 (Epic 10): Texter för foton enligt EXPERIENCE.md: tiden som "idag 15:42", "igår 09:10" eller "24 okt 15:42", "Taget idag 15:42. Numren visar vad AI:n läste av.", "Fotot finns inte längre.", "Fotot av kylen är borttaget." och den nya underrubriken under granskningen.

### FR Coverage Map

- FR1: Epic 1 – inloggning med engångslänk och tillåtelselista
- FR2: Epic 1 – RLS och tester (varje senare tabell får egna RLS-tester i sin story)
- FR3: Epic 1 – import från länk
- FR4: Epic 1 – import från text och foto
- FR5: Epic 1 – enhetligt format och katalogkoppling
- FR6: Epic 1 – förhandsgranskning och rättning
- FR7: Epic 1 – godkända receptsajter i inställningarna
- FR8: Epic 1 (bläddra, sök, Alla/Favoriter), Epic 2 (lagningsstatus), Epic 5 (filtret Kan lagas nu)
- FR9: Epic 1 – favoriter
- FR10: Epic 1 – ändra och ta bort recept
- FR11: Epic 2 – hantera lagervaror
- FR12: Epic 2 – lagret per plats
- FR13: Epic 3 – bygga matsedel
- FR14: Epic 3 – återanvända matsedel
- FR15: Epic 3 – beräkna inköpslistan
- FR16: Epic 3 – listan i butiken
- FR17: Epic 3 – egna varor
- FR18: Epic 3 – listan räknas om med kvarstående bockar
- FR19: Epic 3 – lägga i lagret
- FR20: Epic 1 (grundläggande receptvy), Epic 4 (portioner, "X av Y hemma", dator sida vid sida), Epic 3 (knappen "Lägg på matsedeln")
- FR21: Epic 4 – stegläge
- FR22: Epic 5 – rangordning
- FR23: Epic 5 – AI-förslag
- FR24: Epic 6 – fotografera plats
- FR25: Epic 6 – bekräfta lagerförslag
- FR26: Epic 7 – Skicka till ICA
- FR27: Epic 7 – produktval
- FR28: Epic 7 – byta butik
- FR29: Epic 8 – hantera ställen
- FR30: Epic 8 – välja ställe
- FR31: Epic 8 – se ett ställes lager på distans
- FR32: Epic 8 – inköpslistan räknas mot valt ställe
- FR33: Epic 8 – skrivningar på det ställe vyn visade
- FR37: Epic 10 – spara senaste fotot per plats
- FR38: Epic 10 – visa senaste fotot i Hemma
- FR39: Epic 10 – gallring och borttagning av foton

## Epic List

### Epic 1: Receptimport och receptbibliotek
Pontus kan logga in, lägga in recept från länk, text eller foto, granska och rätta dem i Matkolls format och hitta dem i ett receptbibliotek med sökning och favoriter. Epicen lägger också grunden: projektet, inloggningen, app-skalet, AI-tjänsten och ingredienskatalogen.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8 (utom lagningsstatus och filtret Kan lagas nu), FR9, FR10, FR20 (grundläggande receptvy)

### Epic 2: Lager
Pontus kan föra in det som finns hemma per plats, med eller utan mängd, och ser direkt i receptbiblioteket vilka rätter som kan lagas och hur många varor som saknas.
**FRs covered:** FR11, FR12, FR8 (lagningsstatus)

### Epic 3: Matsedel och inköpslista
Pontus kan planera veckan med portioner, få en inköpslista per butiksavdelning där lagret är avdraget, bocka av med en hand i butiken, lägga till egna varor och lägga allt avbockat i lagret med ett tryck. Efter epicen fungerar kärnan end-to-end och molndriften är förberedd.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20 (knappen Lägg på matsedeln)

### Epic 4: Steg-för-steg
Pontus kan välja portioner i receptvyn, se vad som finns hemma och laga maten ett steg i taget med tänd skärm.
**FRs covered:** FR20, FR21

### Epic 5: Förslag
Pontus kan se vad som går att laga med det som finns hemma, rangordnat efter hur lite som saknas, och be om AI-förslag när biblioteket inte räcker.
**FRs covered:** FR8 (filtret Kan lagas nu), FR22, FR23

### Epic 6: Bildanalys
Pontus kan fotografera kylen, frysen eller skafferiet och bekräfta, rätta eller avvisa de varor AI:n föreslår innan något sparas.
**FRs covered:** FR24, FR25

### Epic 7: Varukorg
Pontus kan välja butik, spara vilka produkter hen brukar köpa och skicka inköpslistan till ICA Handla via en export som Claude in Chrome fyller varukorgen från.
**FRs covered:** FR26, FR27, FR28

### Epic 8: Flera ställen
Version 1.1. Pontus kan ha lager på flera ställen, till exempel Hemma och Stugan, välja vilket ställe som gäller och se ett ställes lager på distans. Lagningsstatusen, AI-förslagen, inköpslistans avdrag, "Lägg i lagret" och bildanalysen följer valt ställe, så att Pontus handlar rätt inför resan till stugan.
**FRs covered:** FR29, FR30, FR31, FR32, FR33, NFR9 (och avgränsningar av FR8, FR11–FR13, FR15, FR19, FR20, FR22–FR25 till valt ställe)

### Epic 10: Senaste fotot per plats
Tillägg till 1.1. Det senaste fotot av varje plats sparas privat när det har lett till en ändring i lagret, så att Pontus i efterhand kan se fotot med AI:ns avläsning och numren och avgöra om bilden tolkades rätt. Fotot finns i högst 30 dagar och försvinner med sitt ställe.
**FRs covered:** FR37, FR38, FR39, NFR11 (och ändringar av FR24, FR25 och FR29)

## Epic 1: Receptimport och receptbibliotek

Pontus kan logga in, lägga in recept från länk, text eller foto, granska och rätta dem i Matkolls format och hitta dem i ett receptbibliotek med sökning och favoriter. De första storyna lägger grunden som resten av appen bygger på.

### Story 1.1: Projektgrund med kontroller

Som Pontus,
vill jag att projektet skapas från Next.js startmall med alla tvingande kontroller på plats från början,
så att varje senare story byggs på samma struktur och inget når `main` utan att ha passerat kontrollerna.

**Acceptance Criteria:**

**Givet** ett tomt repo med planeringsdokumenten
**När** projektet skapas med `create-next-app@16.4.3` (TypeScript, Tailwind, ESLint, App Router, `src/`, pnpm)
**Så** har `package.json` versionerna i arkitekturens Stack-tabell, `"engines": { "node": "24.x" }` och skripten `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`
**Och** `next.config.ts` behåller `cacheComponents: true` från startmallen (AD-18)

**Givet** projektet
**När** utvecklaren importerar mellan lager på ett sätt som bryter mot AD-1
**Så** stoppar ESLint (`import/no-restricted-paths` med zonerna för `app`, `ui`, `actions`, `domain`, `data`, `server`) importen
**Och** zonerna och mappstrukturen `src/features`, `src/components`, `src/lib`, `src/server` finns med en README-rad per mapp

**Givet** `vitest.config.ts` med alias för `@/` och mock av `server-only`, och Playwright konfigurerat
**När** `pnpm test` och `pnpm test:e2e` körs
**Så** passerar ett exempeltest i varje

**Givet** en commit med en hemlighet eller ett lintfel
**När** `lefthook` kör före commit
**Så** stoppas commiten av `gitleaks protect --staged` respektive ESLint

**Givet** en PR mot `main`
**När** GitHub Actions kör
**Så** körs lint, typkontroll, Vitest, Playwright och gitleaks (`gitleaks/gitleaks-action@v3`), och sammanslagning blockeras om något fallerar (AD-23)
**Och** `.env.example` och `src/server/env.ts` finns med Zod-validering av de godkända variabelnamnen i AD-14

### Story 1.2: Inloggning med engångslänk

Som Pontus,
vill jag logga in med en engångslänk till min e-post och förbli inloggad på telefonen,
så att ingen annan kommer åt mina recept eller AI:n på min dator.

**Acceptance Criteria:**

**Givet** lokal Supabase via CLI med `enable_signup = false`, `auto_expose_new_tables = false` och e-postmallen för engångslänk med `token_hash` i `supabase/config.toml`
**När** `pnpm users:sync` körs med `ALLOWED_EMAILS`
**Så** finns varje tillåten adress som användare och inga andra

**Givet** att Pontus inte är inloggad
**När** hen öppnar valfri sida
**Så** omdirigeras hen till `/logga-in` med parametern `next` (bara relativa sökvägar som inte börjar med `//` godtas)

**Givet** inloggningssidan
**När** Pontus anger en tillåten adress
**Så** skickas en engångslänk (`signInWithOtp` med `shouldCreateUser: false`) och sidan visar "Om adressen har åtkomst får du en länk"
**Och** samma text visas för en adress som inte är tillåten, utan att något skickas

**Givet** engångslänken
**När** Pontus öppnar den, även i en annan webbläsare än där den begärdes
**Så** verifierar `auth/confirm` länken med `verifyOtp`, sätter sessionscookies och skickar hen till `next` eller `/recept`
**Och** sessionen förnyas av `src/proxy.ts` med `getClaims()` så att hen förblir inloggad

**Givet** en giltig session för en e-postadress som inte finns i `ALLOWED_EMAILS`
**När** en sida, action eller Route Handler anropas
**Så** nekar `requireUser()` åtkomst (`unauthorized`, 401 för Route Handlers)
**Och** ett integrationstest visar att direkt registrering mot Supabase Auth med den publika nyckeln misslyckas

**Givet** Playwright
**När** E2E-testerna startar
**Så** loggar `tests/e2e/global-setup.ts` in testanvändaren med `auth.admin.generateLink` och `verifyOtp` och sparar `storageState`, utan någon testväg i appen

### Story 1.3: App-skal, navigering och designtokens

Som Pontus,
vill jag ha appens fyra flikar och samma lugna utseende överallt, i ljust och mörkt läge,
så att jag hittar rätt direkt på mobilen och datorn.

**Acceptance Criteria:**

**Givet** tokens från `DESIGN.md`
**När** `globals.css` byggs
**Så** finns alla färger (ljust och mörkt), typografi, radier och avstånd som CSS-variabler mappade med `@theme inline`, och mörkt läge följer `prefers-color-scheme` (UX-DR1, AD-17)
**Och** ingen komponent använder hex-värden direkt (kontrolleras med en lintregel eller ett test)

**Givet** en inloggad användare på en skärm smalare än 1024 px
**När** en sida visas
**Så** finns flikfältet med Recept, Matsedel, Lista och Hemma längst ned, aktiv flik i accentfärg, och flikbyte behåller scrollposition (UX-DR2)

**Givet** en skärm från 1024 px
**När** en sida visas
**Så** ersätts flikfältet av en sidomeny med samma mål plus Inställningar, och innehållet är högst 720 px brett

**Givet** de gemensamma byggstenarna i `src/components/`
**När** de renderas
**Så** finns primär- och sekundärknapp, fast åtgärdsknapp, filterpiller, sökfält, portionsväljare, statusetiketter, AI-etikett, hjärta, rund bock, ark, meddelanderuta, kort bekräftelse och skelettrader med beteendet i `EXPERIENCE.md` (UX-DR3–UX-DR6)
**Och** alla tryckytor är minst 44 × 44 px, alla har namn och tillstånd för skärmläsare och synlig fokusram, och "Minska rörelse" stänger av animationer (UX-DR14)

**Givet** sidorna `/recept`, `/matsedel`, `/lista`, `/hemma` och `/installningar`
**När** de öppnas innan deras funktioner finns
**Så** visar de sin sidrubrik och ett tomt läge, och sessionsläsningen sker inuti `<Suspense>` (AD-18)

### Story 1.4: AI-tjänsten med testleverantör och lokal modell

Som Pontus,
vill jag att appen pratar med AI:n genom ett eget gränssnitt som går att byta och testa utan modell,
så att recept kan tolkas med LM Studio nu och med en molntjänst senare.

**Acceptance Criteria:**

**Givet** `src/server/ai/` med `AiService.parseRecipe` och schemat `AiRecipe` i `schemas.ts`
**När** `AI_PROVIDER=mock`
**Så** returnerar `parseRecipe` deterministiska svar från `tests/fixtures/ai/` och används i alla tester och i CI

**Givet** `AI_PROVIDER=lmstudio` och `LMSTUDIO_BASE_URL`
**När** `parseRecipe` anropas med recepttext
**Så** används `generateText` med `Output.object`, `createOpenAICompatible` med `supportsStructuredOutputs: true`, avstängt tänkläge och `maxRetries: 0` (AD-9)
**Och** adaptrarna `anthropic` och `openai` finns bakom samma gränssnitt

**Givet** ett ogiltigt AI-svar
**När** porten validerar det
**Så** görs högst två nya försök, och därefter returneras `ai_invalid`

**Givet** att modellen inte svarar (nätverksfel, tidsgräns för anslutning 5 s eller svar som inte är JSON)
**När** porten anropas
**Så** returneras `ai_unavailable` direkt utan nya försök, och tidsbudgeten är 45 s per försök och 110 s totalt

**Givet** en `AbortSignal` som avbryts
**När** ett anrop pågår
**Så** avbryts anropet mot modellen

**Givet** skriptet `pnpm eval:ai`
**När** det körs mot `lmstudio` med Qwen3.6-35B-A3B
**Så** skrivs en rapport över testuppsättningen, och resultatet av röktestet (text, bild och JSON-schema) loggas i arkitekturens memlog

**Givet** ESLint
**När** kod utanför `src/server/ai/` importerar `ai` eller `@ai-sdk/*`
**Så** stoppas importen

### Story 1.5: Ingredienskatalog, enheter och avdelningar

Som Pontus,
vill jag att alla ingredienser kopplas mot en gemensam katalog med enhetliga enheter,
så att "lök, hackad" och "gul lök" blir samma vara i recept, lager och inköpslista.

**Acceptance Criteria:**

**Givet** `catalog/domain/units.ts`, `sections.ts` och `locations.ts`
**När** `normalizeUnit`, `parseQuantity` och `formatQuantity` testas
**Så** blir "deciliter" `dl`, "paket" `förp`, "1,5" och "½" tal, och 1,5 dl visas "1,5 dl"; en okänd enhet ger `known: false` (AD-12)
**Och** avdelningarna och platserna är Zod-enum i den fasta ordningen, och okänd avdelning blir Övrigt

**Givet** migrationen för `ingredient` (unik på `user_id, normalized_name`) och `ingredient_synonym` (unik på `user_id, normalized`) med RLS, grants och `check` för avdelning, plats och enhet
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva (AD-4)
**Och** `database.types.ts` är genererad och CI kontrollerar att den stämmer med migrationerna (AD-5)

**Givet** `matchIngredients` med texterna "Lök, hackad" och "gul lök" och katalogen innehåller "gul lök" med synonymen "lök"
**När** funktionen anropas
**Så** returneras träffar med `confidence` `exact` eller `synonym`, och en text utan träff ger `{ kind: 'new', proposal }` byggt från AI-tipset
**Och** inget skrivs till databasen (AD-6)

**Givet** `commitIngredients` med en ny ingrediens och en rättning där Pontus valt en annan ingrediens än förslaget
**När** funktionen anropas två gånger samtidigt med samma namn
**Så** finns ingrediensen en gång, och originaltexten är sparad som synonym till den valda ingrediensen

### Story 1.6: Importera recept från inklistrad text

Som Pontus,
vill jag klistra in en recepttext och se receptet i Matkolls format,
så att jag kan lägga in recept från vilken källa som helst.

**Acceptance Criteria:**

**Givet** Recept-sidan
**När** Pontus trycker "+" i rubriken
**Så** öppnas arket Importera recept med flikarna Länk, Text och Foto, och fliken Text har ett textfält

**Givet** en inklistrad recepttext
**När** Pontus trycker "Tolka"
**Så** anropar klienten `/api/ai/import` via `src/lib/ai-client.ts`, och arket visar "Läser receptet …" med en "Avbryt"-knapp som avbryter anropet
**Och** Route Handlern anropar `recipes/actions/importRecipe` som kör `parseRecipe`, `matchIngredients` och `fromAiRecipe` och returnerar en `RecipeDraft` utan att skriva till databasen (AD-2, AD-10)

**Givet** en `RecipeDraft`
**När** förhandsgranskningen visas
**Så** syns titel, portioner, tid, receptrader och steg; osäkra kopplingar har ljusblå ring och "Kontrollera", och nya katalogingredienser märks "Ny" (UX-DR8)
**Och** titel, portioner, receptraders mängd, enhet och katalogingrediens samt stegen går att ändra

**Givet** att AI-tjänsten inte svarar eller ger ogiltiga svar
**När** importen körs
**Så** visas meddelanderutan "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" respektive "Det gick inte att tolka svaret. Försök igen eller klistra in texten." med svensk text från `src/lib/errors.ts` (AD-13)

**Givet** att Pontus stänger arket
**När** förhandsgranskningen har ändringar
**Så** frågar arket "Släng ändringarna?", och inget har sparats

### Story 1.7: Spara recept och visa receptet

Som Pontus,
vill jag spara det granskade receptet och se det i en enhetlig receptvy,
så att receptet finns kvar och ser ut som alla andra oavsett källa.

**Acceptance Criteria:**

**Givet** migrationen för `recipe`, `recipe_step` och `recipe_ingredient` enligt arkitekturens datamodell, med RLS, grants, sammansatta främmande nycklar och `cascade` inom receptet (AD-4, AD-20)
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** en förhandsgranskning
**När** Pontus trycker "Spara recept"
**Så** anropar `saveRecipe(draft)` `commitIngredients` och sparar receptet med `sourceKind`, `sourceUrl`, steg och receptrader i en transaktion (Postgres-funktion), och Pontus hamnar i receptvyn
**Och** en receptrad som Pontus kopplat om sparas med den valda ingrediensen och originaltexten som synonym

**Givet** ett sparat recept
**När** receptvyn `/recept/[id]` öppnas
**Så** visas bild (med `referrerPolicy="no-referrer"` och platshållare vid fel), titel, tid, källa via `sourceLabel()`, ingredienser med `formatQuantity` och steg i Matkolls stil
**Och** på mobil ligger ingredienserna ovanför stegen

**Givet** att sparningen misslyckas
**När** Pontus trycker "Spara recept"
**Så** visas en meddelanderuta och förhandsgranskningen finns kvar med alla ändringar

### Story 1.8: Importera recept från länk

Som Pontus,
vill jag klistra in en länk till ett recept på en godkänd sajt,
så att jag slipper kopiera receptet för hand.

**Acceptance Criteria:**

**Givet** migrationen för `recipe_site` med RLS och grants, och Postgres-funktionen `ensure_user_defaults()` som anropas från `auth/confirm`
**När** Pontus loggar in
**Så** finns koket.se och tasteline.com som aktiva receptsajter, och ett andra anrop ändrar inget (AD-21)

**Givet** `src/server/fetch/safeFetch`
**När** den anropas med en http-adress, en ej godkänd domän, en IP-adress, ett värdnamn som pekar på en privat adress eller en omdirigering till en annan domän
**Så** avvisas anropet före anslutning med rätt felkod, och detta testas i CI (AD-11)
**Och** tidsgränsen är 10 s, högst 3 omdirigeringar och högst 3 MB

**Givet** fliken Länk och en länk från urklipp om webbläsaren tillåter det
**När** Pontus tolkar en länk till koket.se eller tasteline.com
**Så** hämtar servern sidan, skickar JSON-LD och läsbar text till `parseRecipe` och visar samma förhandsgranskning som för text, med `sourceKind: url` och källans URL
**Och** testerna använder sparade sidor från båda sajterna i `tests/fixtures/sites/`

**Givet** ica.se, arla.se och coop.se
**När** en receptsida från varje sajt hämtas med `safeFetch` under utvecklingen
**Så** noteras resultatet (fungerar, blockeras, saknar receptdata) i `docs/oppna-fragor.md` (T1), och de sajter som fungerar läggs till i `ensure_user_defaults()`

**Givet** en länk till en domän som inte är godkänd
**När** Pontus tolkar den
**Så** visas "[domän] är inte en godkänd receptsajt." med knappen "Öppna inställningar", och ingen hämtning görs

**Givet** att sajten blockerar, tidsgränsen nås eller inget recept hittas
**När** importen misslyckas
**Så** visas orsaken och knappen "Klistra in text i stället", som byter till fliken Text med fokus i textfältet (FR4)

### Story 1.9: Importera recept från foto

Som Pontus,
vill jag fotografera en kokbokssida,
så att även recept från papper hamnar i biblioteket.

**Acceptance Criteria:**

**Givet** fliken Foto i arket Importera recept
**När** Pontus tar ett foto (bakre kameran på mobil) eller väljer en bild (dator)
**Så** förminskas bilden i klienten till högst 1600 px och 1,5 MB JPEG innan den skickas (AD-15)

**Givet** en uppladdad bild
**När** servern tar emot den
**Så** kontrolleras storleken (`image_too_large` vid överskridande), bilden skickas som `file`-del till `parseRecipe`, och samma förhandsgranskning visas med `sourceKind: photo`
**Och** bilden sparas aldrig, varken i databasen eller på disk

**Givet** att bilden inte innehåller något recept
**När** tolkningen är klar
**Så** visas "Det gick inte att tolka svaret. Försök igen eller klistra in texten."

### Story 1.10: Receptbiblioteket med sökning och favoriter

Som Pontus,
vill jag bläddra, söka och markera favoriter bland mina recept,
så att jag snabbt hittar det jag vill laga.

**Acceptance Criteria:**

**Givet** sparade recept
**När** Recept-sidan öppnas
**Så** visas varje recept som receptrad med bild, titel och "35 min · 4 portioner" (UX-DR7), och listan svarar inom en sekund (NFR7)

**Givet** sökfältet
**När** Pontus skriver
**Så** filtreras recepten på titel och ingrediens (även synonymer) efter 200 ms paus via en `searchRecipes`-action, och utan träff visas "Inga recept matchar." med "Rensa sökning"

**Givet** filterpillren Alla och Favoriter
**När** Pontus väljer Favoriter
**Så** visas bara favoriter, och valet sparas på enheten

**Givet** ett recept
**När** Pontus trycker på hjärtat i listan eller receptvyn
**Så** växlar favoriten direkt (optimistiskt) och sparas, utan att navigeringen påverkas (FR9)

**Givet** ett tomt bibliotek
**När** Recept-sidan öppnas
**Så** visas "Inga recept än. Klistra in en länk till ett recept du gillar." och knappen "Importera recept"

### Story 1.11: Ändra och ta bort recept

Som Pontus,
vill jag ändra ett sparat recept och ta bort recept jag inte vill ha,
så att biblioteket stämmer över tid.

**Acceptance Criteria:**

**Givet** receptvyn
**När** Pontus väljer "Ändra" i menyn (⋯)
**Så** öppnas samma formulär som förhandsgranskningen med receptets data

**Givet** ändringar i formuläret
**När** Pontus sparar
**Så** uppdaterar `updateRecipe(id, draft)` receptet, behåller id för receptrader och steg som finns kvar och sparar omkopplingar som synonymer (AD-10)

**Givet** formuläret
**När** Pontus trycker "Ta bort recept"
**Så** frågar appen "Ta bort [titel]? Det går inte att ångra.", och efter bekräftelse raderas receptet med steg och rader, och Pontus hamnar i biblioteket

### Story 1.12: Inställningar för receptsajter

Som Pontus,
vill jag lägga till och ta bort godkända receptsajter och kunna logga ut,
så att jag kan importera från nya sajter utan kodändring.

**Acceptance Criteria:**

**Givet** Inställningar (kugghjul i Recept-rubriken på mobil, längst ned i sidomenyn på dator)
**När** sidan öppnas
**Så** visas de godkända receptsajterna och knappen "Logga ut" (UX-DR16)

**Givet** fältet för ny sajt
**När** Pontus anger "https://www.Arla.se/recept"
**Så** normaliseras domänen till "arla.se" av schemat i `settings/domain`, sparas och kan användas för import direkt (FR7)
**Och** en ogiltig domän ger ett svenskt felmeddelande

**Givet** en sajt i listan
**När** Pontus tar bort den
**Så** avvisas därefter import från den domänen

**Givet** "Logga ut"
**När** Pontus trycker på den
**Så** avslutas sessionen och inloggningssidan visas

## Epic 2: Lager

Pontus kan föra in det som finns hemma per plats, med eller utan mängd, och ser direkt i receptbiblioteket vilka rätter som kan lagas och hur många varor som saknas.

### Story 2.1: Se lagret per plats

Som Pontus,
vill jag se vad som finns i kylen, frysen och skafferiet,
så att jag vet vad jag har hemma.

**Acceptance Criteria:**

**Givet** migrationen för `pantry_item` (unik på `user_id, ingredient_id, location, unit` med `nulls not distinct`), med RLS, grants och sammansatt främmande nyckel mot `ingredient` (`restrict`)
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva (AD-4, AD-19)

**Givet** Hemma-sidan
**När** den öppnas
**Så** visas tre platskort (Kyl mint, Frys ljusblå, Skafferi sand) med ikon och antal varor, och valt kort har 2 px accentram (FR12, UX-DR10)

**Givet** ett valt platskort
**När** listan visas
**Så** visas lagervaror med mängd under "Med mängd" som rader med mängden till höger (`formatQuantity`), och obegränsade under "Finns hemma" som etiketter

**Givet** en tom plats
**När** den väljs
**Så** visas "Inget i kylen än." (eller frysen/skafferiet) med "Lägg till vara"

**Givet** `pantry/data/queries.ts`
**När** `getPantrySnapshot()` anropas
**Så** returneras lagret summerat per ingrediens och enhet över platser, med flaggan `unlimited` (AD-19)

### Story 2.2: Lägga till och ändra lagervaror

Som Pontus,
vill jag lägga till och ändra varor i lagret, med eller utan mängd,
så att lagret stämmer med vad som finns hemma.

**Acceptance Criteria:**

**Givet** Hemma-sidan
**När** Pontus trycker "+" eller på en befintlig vara
**Så** öppnas arket Lagervara med vald plats förvald

**Givet** arket Lagervara
**När** Pontus söker efter en ingrediens
**Så** söks katalogen på namn och synonymer efter 200 ms paus, och en ny katalogingrediens kan skapas med namn, avdelning och plats (FR11, AD-6)
**Och** platsen föreslås från katalogingrediensen och går att ändra

**Givet** en vara utan mängd
**När** Pontus sparar
**Så** sparas den som obegränsad och visas under "Finns hemma"

**Givet** en vara med mängd och enhet
**När** Pontus sparar
**Så** sätter `setPantryItems` mängden exakt för ingrediens, plats och enhet och skapar raden vid behov (AD-19)
**Och** Hemma-sidan, receptbiblioteket och receptvyn uppdateras via `revalidateFor('pantry_item')` (AD-18)

### Story 2.3: Ta bort lagervara med ångra

Som Pontus,
vill jag ta bort en vara som tagit slut och kunna ångra mig,
så att lagret hålls aktuellt utan risk för misstag.

**Acceptance Criteria:**

**Givet** en lagervara
**När** Pontus sveper vänster på raden eller väljer "Ta bort" i arket
**Så** tar `removePantryItem` bort raden och en kort bekräftelse visar "Ångra" i 5 s (UX-DR5, UX-DR13)

**Givet** den korta bekräftelsen
**När** Pontus trycker "Ångra"
**Så** sätter `restorePantryItem` tillbaka raden med samma id (AD-19, AD-20)

### Story 2.4: Lagningsstatus i receptbiblioteket

Som Pontus,
vill jag se på varje recept om det kan lagas nu eller hur många varor som saknas,
så att jag väljer rätter utifrån det jag har hemma.

**Acceptance Criteria:**

**Givet** `pantry/domain/aggregateNeeds`, `coverage` och `recipeStatus`
**När** enhetstesterna körs
**Så** gäller reglerna i AD-7: täckt, delvis, annan enhet, saknas och vag; obegränsad vara räcker alltid; vag rad är täckt om ingrediensen finns i någon form; N räknar distinkta katalogingredienser med saknas, delvis eller annan enhet, utan vaga rader

**Givet** receptbiblioteket och receptvyn
**När** de visas
**Så** har varje recept etiketten "Kan lagas nu" (mint) eller "Saknar N varor" (ljusblå), och varje ingrediensrad i receptvyn har bock eller ring (FR8, UX-DR8)

**Givet** att lagret ändras
**När** Pontus går tillbaka till biblioteket
**Så** är statusen omräknad

## Epic 3: Matsedel och inköpslista

Pontus kan planera veckan med portioner, få en inköpslista per butiksavdelning där lagret är avdraget, bocka av med en hand i butiken, lägga till egna varor och lägga allt avbockat i lagret med ett tryck.

### Story 3.1: Lägga rätter på matsedeln

Som Pontus,
vill jag lägga rätter på veckans matsedel och välja portioner,
så att jag har en plan för veckan.

**Acceptance Criteria:**

**Givet** migrationen för `meal_plan` (partiellt unikt index på `is_current`) och `meal_plan_recipe` (`recipe_id` med `on delete set null` och `recipe_title` som ögonblicksbild), med RLS och grants (AD-4, AD-20, AD-22)
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** Matsedel-sidan utan aktuell matsedel
**När** den öppnas
**Så** visas "Ingen rätt på matsedeln än." och "Lägg till rätt"

**Givet** arket Lägg till rätt med favoriter överst och sökning i biblioteket under
**När** Pontus trycker på en favorit
**Så** anropas `addToCurrentPlan(recipeId)`, som skapar en aktuell matsedel om ingen finns (namn "Vecka <ISO-veckonummer>", går att ändra), rätten läggs till med receptets originalportioner och arket stängs; en favorit kräver alltså två tryck (FR13, SM-4)

**Givet** receptvyn
**När** Pontus trycker "Lägg på matsedeln"
**Så** läggs receptet på den aktuella matsedeln och en kort bekräftelse visas

**Givet** en matsedelsrätt
**När** Pontus ändrar portionerna med − och +
**Så** sparas portionerna (optimistiskt) och rättens lagningsstatus från `recipeStatus` visas

**Givet** en matsedelsrätt
**När** Pontus sveper vänster och tar bort den
**Så** tas den bort med "Ångra" i 5 s, och ångra återställer samma id

**Givet** ett recept som finns på den aktuella matsedeln
**När** receptet tas bort i biblioteket
**Så** anropar `deleteRecipe` först `mealplan.detachRecipe`, som tar bort rätten från den aktuella matsedeln, medan tidigare matsedlar visar "Borttaget recept"

### Story 3.2: Tidigare matsedlar

Som Pontus,
vill jag se tidigare matsedlar och använda en igen,
så att jag snabbt kan upprepa en vecka som fungerade.

**Acceptance Criteria:**

**Givet** Matsedel-sidan
**När** Pontus trycker "Tidigare"
**Så** visas tidigare matsedlar med namn och antal rätter, nyast först (FR14)

**Givet** en tidigare matsedel
**När** Pontus trycker "Använd igen"
**Så** skapas en ny aktuell matsedel med samma rätter och portioner via `set_current_meal_plan()`, och den gamla slutar vara aktuell i samma transaktion (AD-22)
**Och** rätter vars recept är borttagna följer inte med

### Story 3.3: Inköpslistan räknas fram

Som Pontus,
vill jag få en inköpslista per butiksavdelning där det jag har hemma redan är avdraget,
så att jag bara köper det som saknas.

**Acceptance Criteria:**

**Givet** `shopping/domain/computeList` och `lineKey`
**När** enhetstesterna körs
**Så** gäller FR15: mängder skalas efter portioner, samma ingrediens och enhet slås ihop över rätterna, obegränsade lagervaror ger ingen post, lager i samma enhet dras av och posten försvinner när lagret räcker, olika enheter visas som "mjöl 2 dl (hemma: 1 kg)", vaga rader blir "Finns hemma?"-poster bara om ingrediensen saknas
**Och** listnyckeln är `r:<ingredientId>:<unit|->` och innehåller aldrig täckningsstatus (AD-8)

**Givet** en aktuell matsedel
**När** Lista-sidan öppnas
**Så** visas "Inköpslista", veckan, antal rätter och varor kvar, och posterna grupperade per butiksavdelning i fast ordning med "från [rätt]" under varunamnet (FR16, UX-DR9)
**Och** sidan svarar inom en sekund (NFR7)

**Givet** att matsedel eller lager ändras
**När** listan visas igen
**Så** är den omräknad utan särskilt besked (FR18)

**Givet** ingen matsedel respektive en matsedel där allt finns hemma
**När** listan visas
**Så** visas "Lägg rätter på matsedeln så räknas listan fram." respektive "Allt finns hemma."

### Story 3.4: Bocka av i butiken

Som Pontus,
vill jag bocka av varor med tummen i butiken,
så att jag ser vad som är kvar att handla.

**Acceptance Criteria:**

**Givet** migrationen för `shopping_check` (unik på `meal_plan_id, line_key`) med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** en listpost
**När** Pontus trycker på bocken (44 × 44 px)
**Så** bockas posten av direkt (optimistiskt), sparas och visas genomstruken på sin plats (FR16)

**Givet** avbockade poster
**När** matsedeln ändras så att listan räknas om
**Så** står bockarna kvar på poster med samma listnyckel (FR18)

### Story 3.5: Egna varor

Som Pontus,
vill jag lägga till egna varor som diskmedel på listan,
så att allt jag ska handla finns på ett ställe.

**Acceptance Criteria:**

**Givet** migrationen för `shopping_custom_item` (valfri `ingredient_id`) med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** "Lägg till egen vara"
**När** Pontus skriver "diskmedel"
**Så** läggs varan till som egen rad under Övrigt, och om texten matchar en katalogingrediens kan den kopplas och hamnar då under den avdelningen (FR17)
**Och** egna varor slås aldrig ihop med receptposter, och deras listnyckel är `c:<id>`

**Givet** en egen vara
**När** Pontus bockar av eller tar bort den
**Så** sparas bocken i `shopping_check`, och borttagning kan ångras i 5 s med samma id

**Givet** att matsedeln ändras
**När** listan räknas om
**Så** står egna varor kvar (FR18)

### Story 3.6: Rätta mängd och dölja listposter

Som Pontus,
vill jag kunna rätta mängden på en listpost eller ta bort den,
så att listan stämmer när appens beräkning inte gör det.

**Acceptance Criteria:**

**Givet** migrationen för `shopping_line_override` med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** en listpost
**När** Pontus trycker på varunamnet
**Så** öppnas listpostdetaljen med mängd, ursprung och "Ta bort"

**Givet** listpostdetaljen
**När** Pontus ändrar mängden
**Så** sparas överstyrningen och `computeList` visar den rättade mängden

**Givet** en receptpost
**När** Pontus sveper vänster eller väljer "Ta bort"
**Så** döljs posten med "Ångra" i 5 s, och den förblir dold även när listan räknas om (AD-8)

### Story 3.7: Lägg i lagret efter handlingen

Som Pontus,
vill jag lägga allt jag handlat i lagret med ett tryck,
så att lagret är rätt utan att jag skriver in varorna.

**Acceptance Criteria:**

**Givet** minst en avbockad post
**När** listan visas
**Så** visas "Lägg i lagret" som fast primärknapp ovanför flikfältet

**Givet** avbockade poster
**När** Pontus trycker "Lägg i lagret"
**Så** skickas posterna till `pantry.addToPantry` på katalogingrediensens plats (ökning av rad med samma enhet, ny rad annars, vag post blir obegränsad, obegränsad vara ändras inte), egna varor utan katalogkoppling tas bort, och bockar och överstyrningar för dessa nycklar rensas (FR19, AD-8, AD-19)
**Och** en kort bekräftelse visar "Lagt N varor i lagret.", posterna försvinner från listan och lagningsstatus räknas om

**Givet** att flödet avbryts mitt i och Pontus trycker igen
**När** det körs på nytt
**Så** blir lagret detsamma som om det körts en gång

### Story 3.8: Förbered molndrift

Som Pontus,
vill jag att allt för molndriften är förberett när kärnan fungerar,
så att jag bara behöver skapa kontona och följa en checklista.

**Acceptance Criteria:**

**Givet** GitHub Actions
**När** arbetsflödena granskas
**Så** finns ett schemalagt veckoflöde som gör en krypterad `supabase db dump` med lösenfras från en hemlighet och sparar den som artefakt, och det hoppar över körningen med ett tydligt meddelande om hemligheterna saknas (AD-23)

**Givet** `docs/drift.md`
**När** Pontus läser den
**Så** beskriver den stegvis: Vercel-projekt `matkoll` i `arn1` utan Supabase-variabler i förhandsmiljöer, Supabase-projekt i `eu-north-1`, avstängd registrering, Site URL och redirect-URL, e-postmall, `pnpm users:sync` mot molnet, `supabase db push` före driftsättning, och Cloudflare Tunnel och Access för LM Studio

**Givet** att Epic 1–3 fungerar lokalt end-to-end
**När** Playwright kör flödet logga in → importera recept från text (mock) → lägg på matsedeln → bocka av → lägg i lagret
**Så** passerar testet i CI

## Epic 4: Steg-för-steg

Pontus kan välja portioner i receptvyn, se vad som finns hemma och laga maten ett steg i taget med tänd skärm.

### Story 4.1: Portioner och "X av Y hemma" i receptvyn

Som Pontus,
vill jag ändra antal portioner i receptvyn och se hur mycket som finns hemma,
så att jag vet vad jag behöver innan jag börjar laga.

**Acceptance Criteria:**

**Givet** receptvyn
**När** Pontus ändrar portionerna med − och +
**Så** skalas alla mängder direkt via `recipes/domain/scale.ts` och `formatQuantity`, utan att något sparas (FR20)

**Givet** valt antal portioner
**När** receptvyn visas
**Så** visar sammanfattningen "X av Y hemma" från `recipeStatus`, och saknade mängder visas i `sky-ink`

**Givet** en skärm från 1024 px
**När** receptvyn visas
**Så** ligger ingredienser och steg sida vid sida

### Story 4.2: Stegläge med tänd skärm

Som Pontus,
vill jag följa receptet ett steg i taget med stor text och tänd skärm,
så att jag kan laga mat med mobilen lutad mot väggen.

**Acceptance Criteria:**

**Givet** receptvyn med valt antal portioner
**När** Pontus trycker "Laga nu"
**Så** öppnas stegläget i helskärm med "Steg 1 av N", stegets receptrader (skalade) ovanför stegtexten i 24 px, och Föregående och Nästa i tumzonen (FR21, UX-DR12)
**Och** steg utan kopplade receptrader visar bara texten

**Givet** stegläget
**När** Pontus sveper eller trycker på piltangenterna på dator
**Så** byts steget, och "Minska rörelse" stänger av animationen

**Givet** en webbläsare med Screen Wake Lock
**När** stegläget är öppet
**Så** hålls skärmen tänd; låset släpps när stegläget stängs och tas igen när sidan blir synlig efter `visibilitychange` (AD-18)

**Givet** en webbläsare utan stöd eller ett fel vid låsning
**När** stegläget öppnas
**Så** visas raden "Skärmen kan släckas i den här webbläsaren." utan felmeddelande

**Givet** "Stäng"
**När** Pontus trycker på den
**Så** visas receptvyn igen

## Epic 5: Förslag

Pontus kan se vad som går att laga med det som finns hemma, rangordnat efter hur lite som saknas, och be om AI-förslag när biblioteket inte räcker.

### Story 5.1: Kan lagas nu, rangordnat

Som Pontus,
vill jag filtrera fram det som går att laga och se resten rangordnat efter hur lite som saknas,
så att jag använder det jag har innan det blir dåligt.

**Acceptance Criteria:**

**Givet** filterpillret "Kan lagas nu" i receptbiblioteket
**När** Pontus väljer det
**Så** sorteras recepten efter antal saknade varor enligt `recipeStatus`, minst först, med "Kan lagas nu" överst (FR22, FR8)

**Givet** att inget recept kan lagas nu
**När** filtret är valt
**Så** visas listan ändå i rangordning, och längst ned finns "Föreslå rätter med AI"

### Story 5.2: AI-förslag utifrån lagret

Som Pontus,
vill jag få förslag på rätter från AI:n utifrån det jag har hemma,
så att jag får nya idéer när fantasin tar slut.

**Acceptance Criteria:**

**Givet** "Föreslå rätter med AI"
**När** Pontus trycker på den
**Så** anropar klienten `/api/ai/suggest` med lagret, visar "Letar efter idéer …" och "Avbryt", och `suggestDishes` returnerar tre förslag i `AiRecipe`-schemat (FR23, AD-9)

**Givet** förslagen
**När** de visas
**Så** ligger de i en egen sektion, var och en med etiketten "AI-förslag", åtskilda från biblioteket, och de finns bara i klientens tillstånd

**Givet** ett förslag
**När** Pontus trycker "Spara"
**Så** öppnas förhandsgranskningen med `sourceKind: ai` och AI-etiketten, och efter "Spara recept" ligger receptet i biblioteket med källan "AI-förslag"

**Givet** att AI-tjänsten inte svarar
**När** förslag begärs
**Så** visas "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" med "Försök igen", och resten av biblioteket fungerar

## Epic 6: Bildanalys

Pontus kan fotografera kylen, frysen eller skafferiet och bekräfta, rätta eller avvisa de varor AI:n föreslår innan något sparas.

### Story 6.1: Fotografera en plats och få lagerförslag

Som Pontus,
vill jag fotografera kylen och få förslag på vad som finns där,
så att jag slipper skriva in varorna en och en.

**Acceptance Criteria:**

**Givet** Hemma-sidan med valt platskort
**När** sidan visas
**Så** har kameraknappen texten "Fotografera kylen", "Fotografera frysen" eller "Fotografera skafferiet" efter vald plats (FR24, UX-DR10)

**Givet** kameraknappen
**När** Pontus tar ett foto (bakre kameran på mobil, filväljare på dator)
**Så** förminskas bilden i klienten och skickas till `/api/ai/analyze`, som kontrollerar storleken, anropar `analyzeImage` och `matchIngredients` och returnerar lagerförslag med vald plats som förval, utan att skriva något (AD-2, AD-15)
**Och** under tiden visas "Tittar på bilden …" och "Avbryt"

**Givet** att bilden inte visar några varor
**När** analysen är klar
**Så** visas "Hittade inga varor på bilden. Prova ett ljusare foto eller lägg till för hand."

### Story 6.2: Bekräfta, rätta eller avvisa lagerförslag

Som Pontus,
vill jag granska varje förslag innan det hamnar i lagret,
så att lagret inte fylls med AI:ns felgissningar.

**Acceptance Criteria:**

**Givet** lagerförslag
**När** de visas
**Så** har varje förslag varunamn, mängd och plats och knapparna Bekräfta, Rätta och Avvisa, och det finns "Bekräfta alla" (UX-DR11)

**Givet** ett förslag
**När** Pontus trycker Rätta
**Så** öppnas arket Lagervara förifyllt

**Givet** bekräftade och rättade förslag
**När** Pontus sparar
**Så** anropar `confirmPantrySuggestions` `commitIngredients` och `setPantryItems`, och platskortets antal uppdateras (FR25, AD-19)
**Och** avvisade förslag sparas inte, och inga katalogingredienser skapas för dem (AD-6)

### Story 6.3: Töm en plats

Som Pontus,
vill jag kunna tömma kylen, frysen eller skafferiet med ett tryck,
så att jag kan börja om och fylla platsen på nytt med ett foto.

**Acceptance Criteria:**

**Givet** en plats med varor
**När** Pontus trycker "Töm kylen" (respektive frysen eller skafferiet)
**Så** visas en kontrollfråga med antalet varor ("Ta bort alla 14 varor i kylen?"), och först efter bekräftelse tas alla varor på platsen bort i en transaktion

**Givet** en tömd plats
**När** bekräftelsen visas
**Så** kan Pontus ångra i 5 s, och då kommer alla varor tillbaka med samma id, mängd och enhet

**Givet** en tom plats
**När** Hemma visas
**Så** finns ingen töm-knapp för den platsen

### Story 6.4: Inventera en plats med foto

Som Pontus,
vill jag att ett nytt foto av en plats jämförs med det som redan finns där,
så att lagret uppdateras med nya varor, ändrade mängder och varor som inte längre finns.

**Acceptance Criteria:**

**Givet** en plats med varor i lagret och ett nytt foto av den
**När** analysen är klar
**Så** visas förslagen i tre grupper: "Nytt" (på bilden men inte i lagret), "Ändrat" (i lagret med annan mängd) och "Syns inte längre" (i lagret men inte på bilden)

**Givet** ett förslag i gruppen "Syns inte längre"
**När** Pontus bekräftar det
**Så** tas varan bort från platsen. Ingenting tas bort utan ett tryck, eftersom AI:n kan missa varor som är skymda

**Givet** förslag i alla tre grupperna
**När** Pontus trycker "Bekräfta alla"
**Så** sparas tilläggen, ändringarna och borttagningarna i en transaktion, och borttagningarna kan ångras i 5 s

**Givet** en obegränsad vara ("Finns hemma") som inte syns på bilden
**När** förslagen visas
**Så** föreslås den också i "Syns inte längre"

### Story 6.5: Bättre bildtolkning

Som Pontus,
vill jag att fotot av kylen tolkas lika bra som när jag frågar Qwen direkt,
så att lagerförslagen får rätt varor och märken.

**Acceptance Criteria:**

**Givet** ett foto av en plats
**När** det skickas till AI:n
**Så** är bilden högst 2048 px på längsta sidan och anropet har uttryckliga sampling-inställningar (temperatur, top_p, top_k, presence penalty) med tänkläget avstängt

**Givet** AI:ns svar
**När** samma vara upprepas
**Så** slås upprepningarna ihop, och svaret avbryts aldrig av en upprepningsslinga

**Givet** varor som bara delvis syns
**När** förslagen visas
**Så** är de markerade "osäker", inte förvalda för "Bekräfta alla", och kortet visar märket som rubrik med katalogvaran under

**Givet** utvärderingen mot ett riktigt foto
**När** den körs tre gånger
**Så** ger varje körning giltigt svar utan upprepningsslinga inom 100 s

### Story 6.6: Nummer på fotot

Som Pontus,
vill jag se ett nummer på varje vara på fotot och samma nummer på förslagets kort,
så att jag kan kontrollera vad AI:n har läst av och var.

**Acceptance Criteria:**

**Givet** att förslagen från ett foto har kommit
**När** korten visas
**Så** visas de direkt, och AI:n får i ett separat anrop samma bild och de numrerade varorna och svarar med en punkt per vara, utan att avläsningen ändras

**Givet** att punkterna har kommit
**När** Pontus öppnar fotot större
**Så** har varje vara en numrerad markör på fotot, kortet har samma nummer ("Nummer 3 på fotot"), och markörerna följer med när fotot visas i full storlek

**Givet** att anropet för punkterna misslyckas, tar för lång tid eller ersätts av ett nytt foto
**När** korten visas
**Så** visas inga nummer och inget fel, och Bekräfta fungerar som förut

**Givet** utvärderingen mot ett riktigt foto
**När** den körs tre gånger
**Så** visar rapporten tiden för avläsningen, tiden för punkterna och summan per körning, och om alla varor fick en punkt

## Epic 7: Varukorg

Pontus kan välja butik, spara vilka produkter hen brukar köpa och skicka inköpslistan till ICA Handla via en export som Claude in Chrome fyller varukorgen från.

### Story 7.1: Välja butik

Som Pontus,
vill jag ange vilken butik varukorgen ska fyllas i,
så att exporten pekar på rätt butik, även om jag byter kedja.

**Acceptance Criteria:**

**Givet** migrationen för `store` (högst en `is_selected` per användare) med RLS och grants, och `ensure_user_defaults()` utökad med standardbutiken
**När** Pontus loggar in
**Så** finns Maxi ICA Stormarknad Östersund (ICA Handla, butiks-id 1003733) som vald butik, och ett andra anrop ändrar inget (AD-21)

**Givet** Inställningar
**När** Pontus öppnar Butik
**Så** visas vald butik (förvald Maxi ICA Stormarknad Östersund, ICA Handla, butiks-id 1003733) med namn, kedja, butiks-id, adress och URL (FR28)

**Givet** formuläret för butik
**När** Pontus ändrar uppgifterna eller lägger till en ny butik och väljer den
**Så** sparas den, och högst en butik är vald

### Story 7.2: Produktval per vara

Som Pontus,
vill jag spara vilken produkt jag brukar köpa för en vara,
så att varukorgen får rätt förpackning.

**Acceptance Criteria:**

**Givet** migrationen för `product_choice` (unik på `user_id, ingredient_id, store_id`) med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva

**Givet** listpostdetaljen för en receptpost eller en kopplad egen vara
**När** Pontus anger produktnamn, förpackningsstorlek och eventuell länk
**Så** sparas produktvalet för katalogingrediensen i vald butik och visas i listpostdetaljen nästa gång (FR27, AD-16)

### Story 7.3: Skicka till ICA

Som Pontus,
vill jag kopiera inköpslistan i ett format som Claude in Chrome kan fylla varukorgen från,
så att jag slipper lägga varorna i varukorgen för hand.

**Acceptance Criteria:**

**Givet** `shopping/domain/exportBasket` och `docs/varukorgsexport.md`
**När** golden-file-testet körs
**Så** börjar texten med `Matkoll varukorgsexport v1`, följt av butikens namn, kedja, butiks-id, adress och URL, poster som inte är avbockade, dolda eller vaga grupperade i avdelningsordning med mängd och produktval, och sist instruktionen ordagrant med "Beställ inte" och "rapportera varor du är osäker på i en separat lista" (FR26, AD-16)

**Givet** inköpslistan
**När** Pontus trycker den fasta knappen "Skicka till ICA" (sekundärknapp under "Lägg i lagret" när den visas)
**Så** byggs texten av redan laddad listdata och kopieras med `navigator.clipboard.writeText` direkt i tryckhändelsen, och en kort bekräftelse visar "Inköpslistan är kopierad. Klistra in den i Claude i Chrome på ICA Handla."

**Givet** att webbläsaren nekar urklipp
**När** kopieringen misslyckas
**Så** öppnas ett ark med exporttexten markerad och knappen "Kopiera"

**Givet** appen
**När** exporten skapats
**Så** gör appen aldrig något i butiken själv

## Epic 8: Flera ställen

Version 1.1. Pontus kan ha lager på flera ställen, till exempel Hemma och Stugan, och välja vilket ställe som gäller. Valet styr Hemma, lagningsstatusen, AI-förslagen, inköpslistans avdrag, "Lägg i lagret" och bildanalysen. Huvudsyftet är att Pontus handlar rätt inför resan till stugan, utan två ketchup och utan att glömma senapen. Arkitekturen står i AD-24. Storyna byggs i ordning.

### Story 8.1: Ställen i lagret med Hemma som första ställe

Som Pontus,
vill jag att lagret delas på ställen utan att det jag redan har fört in ändras,
så att jag kan lägga till stugan sedan utan att börja om.

**Acceptance Criteria:**

**Givet** migrationen för `pantry_site` (unik på `user_id, normalized_name`, högst ett `is_selected` per användare, namn på 1–40 tecken) med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva ställen (AD-4)

**Givet** ett lager med varor på alla tre platserna före migreringen
**När** migreringen körs
**Så** ligger alla lagervaror med samma id, mängd och enhet på stället "Hemma", som är valt, och `pantry_item.site_id` är `not null` med en sammansatt främmande nyckel och `on delete restrict` (NFR9, AD-24)

**Givet** den nya unika nyckeln `(user_id, site_id, ingredient_id, location, unit)`
**När** samma ingrediens sparas i kylen på två ställen
**Så** blir det två rader, och regeln "obegränsad eller mängder" gäller per ställe och plats (AD-19)

**Givet** pantry-funktionerna med den nya parametern `site uuid default null`
**När** de anropas som i 1.0, utan `site`
**Så** gäller anropet valt ställe, och alla befintliga tester passerar (AD-5)

**Givet** `getPantrySnapshot`, `listPantry` och `countPantryItems`
**När** användaren har varor på två ställen
**Så** gäller de bara valt ställe, eller det ställe som anges, och summerar aldrig över ställen (AD-24)

**Givet** en ny användare utan ställen
**När** användaren loggar in
**Så** skapar `ensure_pantry_defaults()` "Hemma" som valt ställe, och ett andra anrop ändrar inget (AD-21)

**Givet** appen efter storyn
**När** Pontus använder den
**Så** ser allt ut och fungerar som i 1.0

### Story 8.2: Välja och hantera ställen i Hemma

Som Pontus,
vill jag lägga till Stugan och byta mellan ställena i Hemma,
så att jag kan se och fylla stugans kyl, frys och skafferi, också hemifrån.

**Acceptance Criteria:**

**Givet** Hemma med ett enda ställe
**När** sidan visas
**Så** finns ingen ställesväljare, bara textknappen "Lägg till ställe" längst ned (UX-DR17)

**Givet** arket Ställen
**När** Pontus skriver "Stugan" och trycker "Lägg till"
**Så** skapas stället utan att väljas, och bekräftelsen säger "Lade till Stugan. Välj det för att se och fylla dess lager." (FR29)

**Givet** ett namn som redan finns (oavsett stora och små bokstäver), ett tomt namn, ett namn på fler än 40 tecken eller ett elfte ställe
**När** Pontus sparar
**Så** sparas inget, och texten under fältet säger varför

**Givet** två eller fler ställen
**När** Hemma visas
**Så** finns filterpiller med ställenas namn ovanför platskorten och textknappen "Ställen", och valt ställe är fyllt

**Givet** ställesväljaren
**När** Pontus trycker på Stugan
**Så** väljs stället och sparas på servern (`select_pantry_site`)
**Och** platskorten och listan visar stugans lager, med samma plats vald som förut
**Och** live-regionen säger "Valt ställe: Stugan." (FR30, FR31)

**Givet** Stugan vald på mobilen
**När** Pontus öppnar Matkoll på datorn
**Så** är Stugan vald där också

**Givet** arket Ställen
**När** Pontus byter namn på ett ställe, eller tar bort ett tomt ställe som inte är valt
**Så** sparas ändringen direkt
**Och** "Ta bort" saknas för valt ställe, för ett ställe med varor och för det sista stället (FR29)

**Givet** Stugan vald i Hemma
**När** Pontus lägger till, ändrar eller tar bort en lagervara, eller trycker "Ångra"
**Så** sparas ändringen på Stugan, också om valt ställe har bytts på en annan enhet under tiden (FR33)

### Story 8.3: Lagningsstatus, förslag och Lägg i lagret följer valt ställe

Som Pontus,
vill jag att det som kan lagas och det jag lägger i lagret gäller det ställe jag har valt,
så att stugans och hemmets lager aldrig blandas ihop.

**Acceptance Criteria:**

**Givet** ketchup bara hemma och Stugan vald
**När** Pontus öppnar ett recept med ketchup
**Så** räknas ketchup som saknad i "X av Y hemma", i lagningsstatusen i biblioteket och på matsedeln och i filtret "Kan lagas nu" (FR8, FR13, FR20, FR22, AD-7)

**Givet** Stugan vald
**När** Pontus ber om AI-förslag
**Så** utgår förslagen från stugans lager (FR23)

**Givet** två eller fler ställen
**När** receptbiblioteket med filtret "Kan lagas nu", receptvyn eller matsedeln visas
**Så** står "Lager: Stugan" som metadata
**Och** med ett enda ställe syns ingen sådan rad (UX-DR17)

**Givet** ett byte av valt ställe
**När** bytet är sparat
**Så** revalideras Hemma, Recept, Matsedel och Lista (`revalidateFor('pantry_site')`, AD-18)

**Givet** inköpslistan räknad mot Stugan, med avbockade poster
**När** Pontus trycker "Lägg i lagret"
**Så** läggs varorna på katalogingrediensens plats på Stugan (`putCheckedInPantry(siteId)` till `addToPantry`), och bekräftelsen säger "Lagt 8 varor i lagret för Stugan." (FR19, FR32, FR33)

**Givet** att valt ställe byts på en annan enhet efter att listan visades
**När** Pontus trycker "Lägg i lagret"
**Så** hamnar varorna på det ställe listan räknades mot
**Och** ett avbrutet "Lägg i lagret" som görs om lägger aldrig något två gånger (AD-8, AD-24)

### Story 8.4: Foto, inventering och tömning per ställe

Som Pontus,
vill jag fotografera och tömma stugans kyl på samma sätt som hemma,
så att stugans lager är lika aktuellt som hemmets.

**Acceptance Criteria:**

**Givet** Stugan vald och kylen vald
**När** Pontus fotograferar
**Så** skickas stället och platsen till `/api/ai/analyze`, och "I kylen nu" och jämförelsen från 6.4 gäller stugans kyl (FR24, AD-24)

**Givet** lagerförslag från ett foto av stugans kyl
**När** Pontus bekräftar, rättar eller trycker "Bekräfta alla"
**Så** sparas förslagen på Stugan, och "Syns inte längre" tar bara bort rader i stugans kyl (FR25, FR33)

**Givet** att valt ställe byts medan förslagen visas
**När** Pontus bekräftar
**Så** sparas förslagen på det ställe fotot gällde, och raden "Förslagen gäller Stugan." visas ovanför dem

**Givet** två eller fler ställen
**När** Pontus trycker "Töm kylen"
**Så** frågar arket "Ta bort alla 14 varor i kylen för Stugan?"
**Och** bara stugans kyl töms, och bekräftelsen säger "Tog bort 14 varor ur kylen för Stugan." (6.3)

**Givet** en tömning eller inventering på Stugan
**När** Pontus trycker "Ångra", också efter att ha valt Hemma
**Så** kommer raderna tillbaka på Stugan med samma id (AD-20, AD-24)

**Givet** `apply_pantry_inventory`, `empty_pantry_place` och `restore_pantry_removal`
**När** integrationstesterna körs med samma ingrediens på två ställen
**Så** ändras bara det angivna stället, och `pantry_lock()` gäller fortfarande alla användarens skrivningar

### Story 8.5: Inköpslista inför resan till ett annat ställe

Som Pontus,
vill jag räkna inköpslistan mot stugans lager innan jag åker dit,
så att jag varken köper två ketchup eller glömmer senapen.

**Acceptance Criteria:**

**Givet** två eller fler ställen
**När** inköpslistan visas
**Så** står "Lager: Hemma" och textknappen "Byt" under rubriken
**Och** med ett enda ställe syns ingen sådan rad (FR32, UX-DR17)

**Givet** "Byt"
**När** Pontus väljer Stugan i arket "Räkna listan mot"
**Så** väljs Stugan, samma val som i Hemma, och arket stängs
**Och** "Listan räknas nu mot Stugan." visas, och listan drar av stugans lager (FR30, FR32)

**Givet** ketchup hemma men inte i stugan, och senap i stugan men inte hemma
**När** listan räknas mot Stugan
**Så** står ketchup på listan men inte senap, och mot Hemma är det tvärtom (e2e)

**Givet** avbockade poster, rättade mängder, dolda poster och egna varor
**När** Pontus byter ställe
**Så** står de kvar
**Och** en avbockad post som blir täckt försvinner från listan, men är avbockad igen om den kommer tillbaka (FR18, AD-8)

**Givet** att allt på matsedeln finns i stugan
**När** listan visas
**Så** står "Allt finns i lagret för Stugan."

**Givet** listan räknad mot Stugan
**När** Pontus trycker "Skicka till ICA"
**Så** innehåller exporten listans poster för Stugan, och formatet `Matkoll varukorgsexport v1` är oförändrat (FR26, AD-16)

## Epic 10: Senaste fotot per plats

Tillägg till 1.1. Pontus bad om att det analyserade fotot sparas, "då får vi enklare att se om den tolkat rätt". Det senaste fotot av varje plats (Kyl, Frys och Skafferi, per ställe) sparas privat när det har lett till en ändring i lagret, och kan visas i Hemma med AI:ns avläsning och numren från 6.6. Fotot finns i högst 30 dagar, och bara det senaste per plats. Arkitekturen står i AD-26, och AD-15 är ändrad. Storyna byggs i ordning.

### Story 10.1: Spara senaste fotot per plats

Som Pontus,
vill jag att fotot som lagret uppdaterades från sparas,
så att jag senare kan se vad AI:n läste av.

**Acceptance Criteria:**

**Givet** migrationen för bucketen `pantry-photo` (privat, högst 1,5 MB, JPEG och PNG), dess policyer på `storage.objects` och tabellen `pantry_photo` (unik på `user_id, site_id, location`)
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare ladda upp, läsa, lista eller ta bort ett foto eller läsa och skriva raden (AD-4, AD-26, NFR11)

**Givet** lagerförslag från ett foto av kylen på Stugan
**När** Pontus bekräftar det första förslaget och det sparas i lagret
**Så** skickar klienten samma förminskade bild, stället, platsen, tiden, avläsningen och punkterna (om de har kommit) till `POST /api/pantry/photo`, och fotot sparas som senaste foto av stugans kyl (FR37)
**Och** fler bekräftelser från samma foto sparar det inte igen

**Givet** ett foto vars förslag Pontus bara avvisar, eller ett foto utan förslag
**När** granskningen är klar
**Så** sparas inget foto

**Givet** en bild med EXIF och GPS
**När** den sparas
**Så** har den sparade filen ingen metadata (inga APP1–APP15- eller COM-segment i en JPEG och inga extra chunks i en PNG), visat med ett test (AD-15, NFR11)

**Givet** ett sparat foto av kylen
**När** ett nytt foto av samma kyl sparas
**Så** finns bara det nya fotot kvar, både som rad och som fil, och det förra är borttaget med Storage-API:t

**Givet** att punkterna kommer efter att fotot har sparats
**När** de kommer
**Så** läggs de till på fotots rad med `savePlacePhotoPoints`

**Givet** att valt ställe byts medan förslagen visas
**När** Pontus bekräftar
**Så** sparas fotot på det ställe det togs för (FR33)

**Givet** att sparandet misslyckas (Storage nås inte, stället är borttaget)
**När** Pontus bekräftar
**Så** sparas förslaget i lagret som vanligt, inget fel visas, och bara felkoden loggas

### Story 10.2: Visa senaste fotot i Hemma

Som Pontus,
vill jag öppna det senaste fotot av kylen med numren och avläsningen,
så att jag kan se om bilden tolkades rätt.

**Acceptance Criteria:**

**Givet** ett sparat foto av kylen på det ställe Hemma visar
**När** Hemma visas med kortet Kyl valt
**Så** står "Senaste foto av kylen: idag 15:42" och textknappen "Visa" direkt under kameraknappen (FR38, UX-DR21)
**Och** utan sparat foto står ingen rad

**Givet** raden Senaste foto
**När** Pontus trycker "Visa"
**Så** öppnas arket "Fotot av kylen" med fotot från `GET /api/pantry/photo/[id]`, underrubriken "Taget idag 15:42. Numren visar vad AI:n läste av.", en numrerad markör på varje vara som fick en punkt och listan "AI:n läste av:" med avläsningen i nummerordning (UX-DR22)

**Givet** ett foto utan punkter
**När** arket öppnas
**Så** visas fotot utan markörer, underrubriken "Taget idag 15:42." och listan

**Givet** Stugan vald i Hemma
**När** Pontus byter till Hemma
**Så** visar raden fotot av hemmets kyl, eller ingen rad

**Givet** `GET /api/pantry/photo/[id]`
**När** den anropas utan inloggning, för en annan användares foto eller för ett foto som är borta
**Så** svarar den 401 eller 404 utan bild, och ett svar med bild har `Cache-Control: private, no-store` (NFR11)

**Givet** att fotot har tagits bort på en annan enhet
**När** Pontus trycker "Visa"
**Så** står "Fotot finns inte längre." i arket

**Givet** fotoarket
**När** Pontus trycker "Ta bort fotot" och sedan "Ta bort" i frågan "Ta bort fotot av kylen? Det går inte att ångra."
**Så** tas fotot och filen bort, arket stängs, raden försvinner och den korta bekräftelsen säger "Fotot av kylen är borttaget." (FR39)

### Story 10.3: Gallring och städning av foton

Som Pontus,
vill jag att gamla foton och foton som inte hör till något försvinner av sig själva,
så att inga bilder av mitt hem ligger kvar i onödan.

**Acceptance Criteria:**

**Givet** ett foto som är äldre än 30 dagar
**När** Hemma visas
**Så** står ingen rad för det, och `sweepPlacePhotos` tar bort raden och filen (FR39)

**Givet** en fil i bucketen utan rad i `pantry_photo` (till exempel efter en avbruten ersättning)
**När** gallringen körs
**Så** tas filen bort, och andra användares filer berörs aldrig

**Givet** ett ställe utan lagervaror men med foton
**När** Pontus tar bort stället i arket Ställen
**Så** tas ställets rader och filer bort (AD-20, AD-26)

**Givet** `pnpm users:sync --prune` och en användare som inte längre är tillåten
**När** användaren tas bort
**Så** tas användarens filer i bucketen bort först, och raderna försvinner med användaren

**Givet** "Töm kylen"
**När** kylen töms
**Så** står fotot kvar

**Givet** säkerhetskopian
**När** den körs
**Så** innehåller den inga foton och inga rader från `storage.objects` eller `pantry_photo`, och `docs/drift.md` beskriver hur bucketen och policyerna kommer tillbaka vid en återställning, provat i en tillfällig lokal stack (AD-23)

### Story 10.4: Lagersaldo och stor bokstav

En snabbfix som Pontus bad om under Epic 10. Lagersidan hette Hemma, samma sak som det första stället (Epic 8), och sparade varunamn började ibland med liten bokstav.

Som Pontus,
vill jag att lagersidan heter Lagersaldo och att varornas namn börjar med stor bokstav,
så att sidan inte förväxlas med stället Hemma och namnen ser likadana ut överallt.

**Acceptance Criteria:**

**Givet** menyn på mobil och dator
**När** Pontus ser den
**Så** heter lagersidan "Lagersaldo", rubriken och sidans titel är "Lagersaldo", och adressen är fortfarande `/hemma`

**Givet** menyn på mobil och dator
**När** Pontus ser den
**Så** heter menyvalet för inköpslistan "Inköpslista" i stället för "Lista", adressen är fortfarande `/lista`, och ingen etikett i flikfältet klipps vid 375 px med 200 % textförstoring

**Givet** stället Hemma
**När** det visas i väljaren, i arket Ställen, i raden "Lager: Hemma" eller i en bekräftelse som "Tog bort 2 varor ur kylen för Hemma."
**Så** heter stället fortfarande Hemma

**Givet** en ny vara från ett foto, ett recept, AI-förslag eller arket Lagervara, till exempel "bregott"
**När** den sparas i katalogen
**Så** är namnet "Bregott", medan det normaliserade namnet, matchningen och sökningen är oförändrade

**Givet** varor som redan finns i katalogen med liten första bokstav, till exempel "mellanmjölk" och "ägg"
**När** migrationen har körts
**Så** heter de "Mellanmjölk" och "Ägg", och inga andra kolumner eller rader har ändrats
