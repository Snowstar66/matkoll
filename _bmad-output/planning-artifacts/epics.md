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

Det här dokumentet delar upp kraven i PRD:n, UX-dokumenten (`DESIGN.md`, `EXPERIENCE.md`) och arkitekturen (`ARCHITECTURE-SPINE.md`, AD-1–AD-28) i epics och stories som går att bygga var för sig. Story-rubrikerna läses av `scripts/board.mjs` och blir kort på boarden. Epic 1–7 är version 1.0. Epic 8 är version 1.1, "Flera ställen", som kom till genom kursändringen `sprint-change-proposal-2026-10-26-flera-stallen.md`. Dess krav står i PRD-addendumet under "Version 1.1: Flera ställen". Epic 10, "Senaste fotot per plats", är ett tillägg till 1.1 som kom till genom kursändringen `sprint-change-proposal-2026-10-26-spara-foto.md`. Dess krav står i addendumet under "Tillägg till 1.1: Senaste fotot per plats". Epic 11, "Nytt utseende", kom till genom kursändringen `sprint-change-proposal-2026-10-26-nytt-utseende.md` efter att Pontus godkände tre mobilskisser. Dess krav står i addendumet under "Tillägg till 1.1: Nytt utseende", och skisserna ligger i `ux-designs/ux-Matkoll-2026-10-25/mockups/`. Epic 11 byggs efter Epic 10. Epic 12, "Snabbare och asynkron AI", kom till genom kursändringen `sprint-change-proposal-2026-10-26-asynkron-ai.md` efter att Pontus godkände planen. Dess krav står i addendumet under "Tillägg till 1.1: Snabbare och asynkron AI", och den byggs efter Epic 11. Epic 9, "Veckans erbjudanden" (version 1.2), kom till genom kursändringen `sprint-change-proposal-2026-10-26-erbjudanden-v2.md`, som ersätter den första planen. Pontus vill hämta erbjudandena från en länk per butik och valde funktionerna som använder dem. Dess krav står i addendumet under "Version 1.2: Veckans erbjudanden". Epic 9 behåller sina reserverade nummer (FR34–FR36, NFR10, AD-25, UX-DR19–UX-DR20) och får FR51–FR54 och UX-DR32–UX-DR33. Den byggs efter Epic 12 och står sist i dokumentet.

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

Epic 11 (addendum, "Tillägg till 1.1: Nytt utseende"):

- FR40: Lagervaror och listposter visas i nio kategorier med ikon och antal, i butikens ordning. Kategorin räknas fram ur avdelningen (Kött och fisk och Chark blir en, och såser och smaksättare skiljs från Skafferi på namnet) och sparas aldrig. Exporten och avdelningarna är oförändrade.
- FR41: Lagersaldo visar varje lagervara som en rad utan mängd, med märket eller "Tillagd …" under namnet, en soptunna som tar bort direkt med "Ångra" i 5 s och ett sökfält för platsen. Mängderna finns kvar i arket och för lagningsstatusen.
- FR42: En lagervara har ett valfritt märke (från fotots första etikett eller fältet "Märke eller sort") och vet när den lades till. "Ångra" sätter tillbaka märket och tiden.
- FR43: Inköpslistan visar "8 varor kvar" och "6 av 14 i korgen" med en mätare, flyttar avbockade poster till en hopfälld "I korgen", visar rätterna, "Egen vara" eller "Saknas i <ställe>" under posten och produktvalet som etikett, och har "Skicka till ICA" och "Lägg i lagret" fast längst ned.
- FR44: Matkoll kan läggas på hemskärmen och öppnas i helskärm (manifest, appikoner, temafärg), loggas in med en sexsiffrig kod från samma mejl som länken, och har en synlig tillbakaknapp på varje sida under en flik.
- FR45: AI-flödena mäts med kall och varm modell före och efter varje förbättring, med rekommenderade inställningar för LM Studio i `docs/lm-studio.md`. Modellen väcks i bakgrunden när Lagersaldo eller Recept öppnas (om mätningen visar minst 20 % vinst), och AI-förslagen ber om ett kortare svar (minst 25 % färre token, högst 40 s i median varmt).
- FR46: Bildanalys, AI-förslag och receptimport är AI-jobb: att starta ett svarar inom en sekund, Pontus kan byta sida, stänga arket och ladda om utan att jobbet stoppas, kan avbryta det, och resultatet finns privat tills det stängs eller sparas, högst 24 timmar.
- FR47: AI-jobben körs ett i taget i den ordning de startades, högst tre aktiva, över flikar och enheter. En jobbrad visar vad som pågår och "2 i kö". Ett jobb som inte hinner börja eller vars server dör stoppar aldrig kön, och dubbeltryck ger aldrig två jobb.
- FR48: När ett resultat är klart säger en kort bekräftelse vad som är klart, med "Visa", och fliken där det visas (Recept eller Lagersaldo) får ett märke med antalet osedda resultat.
- FR49: Inget från AI sparas automatiskt. Ett nytt foto av samma plats ersätter det äldre, som aldrig visas. Förslag från ett foto gäller fotots ställe. AI-förslag för ett annat ställe visas med "Förslagen bygger på lagret för Hemma." Jämförelsen med platsens varor görs när resultatet öppnas.
- FR50: AI-förslagen visas en rätt i taget så snart varje rätt är klar, om LM Studio kan strömma ett svar med JSON-schema.

Epic 9 (addendum, "Version 1.2: Veckans erbjudanden"):

- FR34: Pontus sparar en länk till butikens erbjudandesida per butik i Inställningar (i 1.2 bara ica.se), och Matkoll hämtar veckans erbjudanden när Pontus trycker "Hämta veckans erbjudanden": en hämtning per tryck, bara mat, sparat för butiken och veckan. Utan länk, eller när butiken nekar, klistrar Pontus in texten eller fotograferar reklambladet och granskar det AI:n läste innan något sparas.
- FR35: Veckans erbjudanden för vald butik visas i kategorier med pris och villkor, och de kan tas bort ett i taget eller alla, med "Ångra". Veckor som är slut används aldrig.
- FR36: AI-förslagen prioriterar rätter med varor på erbjudande och visar dem med erbjudandeetiketter. Utan erbjudanden är förslagen som förut.
- FR51: En listpost i inköpslistan vars vara är på erbjudande i vald butik den här veckan får en erbjudandeetikett ("Falukorv 29 kr"). Listan, mängderna och exporten är oförändrade.
- FR52: Filtret "Erbjudanden" i Recept visar recept där minst en huvudvara är på erbjudande, flest först, med erbjudandeetiketter på korten.
- FR53: "Fyll på lagret" visar erbjudanden på basvaror (varor i lagret på något ställe eller med produktval), var de finns och saknas, och lägger en vara på inköpslistan med ett tryck.
- FR54: Pontus kan be om ett förslag till veckans matsedel som ett AI-jobb: fem rätter, i första hand ur biblioteket och högst två nya, utifrån erbjudandena och lagret, och väljer själv vilka som läggs på matsedeln.

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
- NFR10 (1.2) Hämtning från butiker: bara från godkända erbjudandesajter (i 1.2 www.ica.se), en hämtning per tryck med `safeFetch` och en ärlig User-Agent, inget nytt försök vid 403 eller 429, sidan läses deterministiskt utan `eval`, bara erbjudandena sparas och inget från sidans sessionsdata sparas eller loggas, och tester anropar aldrig en butik. Text och bild från reklamblad är data, och foton sparas aldrig.
- NFR11 (Epic 10) Integritet för platsfoton: privat bucket med RLS-tester, ingen publik eller signerad länk, ingen metadata i sparade foton (test), aldrig till AI-tjänsten igen, aldrig i repot, loggar eller säkerhetskopian, och inom Supabase gratisnivå.
- NFR12 (Epic 11) Utseendet håller tillgänglighetsgolvet: 375 px och 1280 px, ljust och mörkt läge, 200 % text utan vågrät scroll, VoiceOver och tangentbord, tryckytor minst 44 × 44 px, och ikoner, plattor och mätare säger aldrig något som inte står i text. Inget rött, inga skuggor, inga gradienter.
- NFR13 (Epic 12) Integritet och tålighet för AI-jobb: privata jobb med RLS-tester, inga foton eller recepttexter i jobb, på disk eller i loggar, jobbens rader aldrig i säkerhetskopian, ett jobb vars server dör stoppar aldrig kön längre än sin tidsgräns, och två serverinstanser kör aldrig två jobb för samma användare samtidigt.

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
- (Epic 12) AI-jobb och kön (AD-28):
  - modulen `ai-jobs` äger `ai_job`, med högst ett jobb som körs per användare (partiellt unikt index);
  - `enqueue_ai_job`, `claim_ai_job`, `set_ai_job_result`, `finish_ai_job`, `cancel_ai_job`, `mark_ai_job_seen` och `dismiss_ai_job`;
  - `POST /api/ai/jobs` och `/api/ai/jobs/photo` med `maxDuration = 300`, jobbet i `after()` med egen signal och tidsgräns, indata bara i minnet;
  - pollning med `GET /api/ai/jobs` och `src/lib/ai-jobs-client.ts`, ingen Supabase-klient i webbläsaren;
  - `warmUp` och strömmande `suggestDishes` i porten (AD-9), kompakt svar för förslagen (AD-10);
  - säkerhetskopian utesluter `ai_job` (AD-23).
- (Epic 9) Veckans erbjudanden (AD-25, och tillägg i AD-1, AD-9, AD-11, AD-15, AD-18, AD-24 och AD-28):
  - `store.offers_url` i `settings`, kontrollerad mot den fasta listan `OFFER_SITES`;
  - modulen `offers`, som äger `store_offer` (butik, vecka som måndagens datum, namn som butiken skrev det, vara i grundform, valfri katalogingrediens, avdelning, pris, villkor, Stammis, sista dag och källa);
  - `save_store_offers` ersätter länkens rader, lägger ihop per namn, tar högst 300 per vecka och tar bort veckor som är slut;
  - `fetchStoreOffers` med `safeFetch` och `parseIcaOfferPage` utan `eval`, och fixturer via `fixture-sites.ts`;
  - `matchIngredients` för katalogkopplingen, aldrig `commitIngredients` utom bekräftade kopplingar i 9.10;
  - `OfferChip` i `src/components`, och etiketterna sätts ihop av sidorna (route → ui);
  - `listStockedSites` i `pantry` för "Fyll på lagret";
  - AI-jobben `offers` (`extractOffers`) och `weekplan` (`planWeek`), och `offers` i `suggestDishes`;
  - `revalidateFor('store_offer')`.

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
- UX-DR19 (Epic 9): Länken under Butik i Inställningar, arket Veckans erbjudanden (hämta, erbjudandena i kategorier, "Fyll på lagret", text och foto, granskning, soptunna med "Ångra" och "Ta bort alla"), textknappen "Erbjudanden" i Inköpslistans rubrik och filterpillret "Erbjudanden" i Recept med sin rad.
- UX-DR20 (Epic 9): Texter för erbjudanden enligt EXPERIENCE.md: veckan som "vecka 45, 4–10 nov", pris och villkor som butiken skrev dem, "Hämtade 91 erbjudanden för vecka 45.", "Med veckans erbjudanden från <butik>." och felen för länken, med "Öppna sidan".
- UX-DR21 (Epic 10): Raden "Senaste foto av kylen: idag 15:42" med textknappen "Visa" direkt under kameraknappen i Hemma, och fotoarket från 6.6 med numrerade markörer, "AI:n läste av:" med en numrerad lista och "Ta bort fotot" med kontrollfråga.
- UX-DR22 (Epic 10): Texter för foton enligt EXPERIENCE.md: tiden som "idag 15:42", "igår 09:10" eller "24 okt 15:42", "Taget idag 15:42. Numren visar vad AI:n läste av.", "Fotot finns inte längre.", "Fotot av kylen är borttaget." och den nya underrubriken under granskningen.
- UX-DR23 (Epic 11): Kategorirubrik med ikonplatta (emoji, dold för skärmläsare), kategorins namn och antal, i butikens ordning, i Lagersaldo och Inköpslista. Plattornas färger och tokens enligt DESIGN.md (`category-tile`, `tile-clay`, `tile-lilac`).
- UX-DR24 (Epic 11): Lagersaldo enligt skissen `mockups/lagersaldo.html`: listgrupper med listrader utan mängd, raden under med märket eller "Tillagd …", en grå soptunna utan fråga och "Tog bort Gräddfil." med "Ångra" i 5 s, inget svep, och sökfältet "Sök i kylen".
- UX-DR25 (Epic 11): Inköpslistan enligt skissen `mockups/inkopslista.html`: framstegsraden, runda bockar, mängden efter namnet, raden under, produktetiketten, korgraden "6 varor i korgen" med "Visa" och de två fasta knapparna i en rad.
- UX-DR26 (Epic 11): Receptkort med bilden överst och statusetiketten och hjärtat på bilden (en kolumn i mobilen, två från 1024 px), rättkort med 56 px bild, "6 av 8 hemma" och mätare, och "Visa inköpslistan" längst ned i Matsedel, enligt `mockups/matkoll-mobil.html`.
- UX-DR27 (Epic 11): Matkoll på hemskärmen: appikonen (morot), helskärm med appens bakgrund bakom statusraden, tillbakaknappar, inloggning med koden och raden om hemskärmen i Inställningar.
- UX-DR28 (Epic 11): Texter enligt EXPERIENCE.md, Voice and Tone och State Patterns för Epic 11 ("Tillagd …", "Tog bort …", "8 varor kvar", "Saknas i Stugan", "Egen vara", "Allt ligger i korgen", "Koden stämmer inte eller har gått ut. Skicka en ny länk."). Emoji bara i kategoriplattorna.
- UX-DR29 (Epic 12): Jobbraden ovanför flikfältet (överst i sidomenyn på dator) med "AI: Tittar på fotot av kylen · 2 i kö", och arket AI-jobb med varje jobbs läge, "Avbryt" och "Visa", enligt `EXPERIENCE.md` och `DESIGN.md` (`job-row`).
- UX-DR30 (Epic 12): Flikmärket i `{colors.accent}` på Recept och Lagersaldo med antalet osedda AI-resultat (`tab-badge`), och den korta bekräftelsen med "Visa" i 8 s för ett klart jobb, utan bekräftelse på resultatets egen sida.
- UX-DR31 (Epic 12): Texter och tillstånd för AI-jobb enligt EXPERIENCE.md, Voice and Tone och State Patterns: "Du kan göra annat under tiden.", "I kö, 1 före.", "3 rättförslag är klara.", "Det finns redan tre AI-jobb. Vänta tills ett är klart.", "AI-jobbet avbröts. Försök igen.", "Resultatet finns inte längre.", "Förslagen bygger på lagret för Hemma." och "Letar efter fler …".
- UX-DR32 (Epic 9): Erbjudandeetiketten (`offer-chip`, mint) med "Falukorv 29 kr" på listposter, receptkort och AI-förslag, med namnet "På erbjudande: …" för skärmläsare.
- UX-DR33 (Epic 9): Förslaget till veckans matsedel i Matsedel: knappen "Föreslå veckans matsedel", jobbet, rättkort med bock och erbjudandeetiketter, "Lägg 3 rätter på matsedeln" och "Granska och spara" för nya rätter.

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
- FR34: Epic 9 – länk (9.1), text (9.7) och foto (9.8)
- FR35: Epic 9 – se (9.1) och ta bort (9.9) erbjudanden
- FR36: Epic 9 – AI-förslag med erbjudanden (9.5)
- FR37: Epic 10 – spara senaste fotot per plats
- FR38: Epic 10 – visa senaste fotot i Hemma
- FR39: Epic 10 – gallring och borttagning av foton
- FR40: Epic 11 – kategorier med ikon (11.1, används i 11.3 och 11.4)
- FR41: Epic 11 – Lagersaldo utan mängder (11.3)
- FR42: Epic 11 – märke och tid på lagervaran (11.2, visas i 11.3)
- FR43: Epic 11 – inköpslistan i butiken (11.4)
- FR44: Epic 11 – Matkoll på hemskärmen (11.6)
- FR45: Epic 12 – snabbare AI, mätt före och efter (12.1, 12.2, 12.3)
- FR46: Epic 12 – AI-jobb i bakgrunden (12.4, och per flöde i 12.5 och 12.6)
- FR47: Epic 12 – kön och jobbraden (12.4)
- FR48: Epic 12 – besked när ett resultat är klart (12.4)
- FR49: Epic 12 – inaktuella resultat (12.4 för förslag, 12.5 för foton)
- FR50: Epic 12 – första rätten direkt (12.7)
- FR51: Epic 9 – erbjudanden på inköpslistan (9.2)
- FR52: Epic 9 – filtret Erbjudanden i Recept (9.3)
- FR53: Epic 9 – Fyll på lagret (9.4)
- FR54: Epic 9 – veckans matsedel (9.6)

## Epic List

### Epic 1: Receptimport och receptbibliotek
Pontus kan logga in, lägga in recept från länk, text eller foto, granska och rätta dem i Matkolls format och hitta dem i ett receptbibliotek med sökning och favoriter. Epicen lägger också grunden: projektet, inloggningen, app-skalet, AI-tjänsten och ingredienskatalogen.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8 (utom lagningsstatus och filtret Kan lagas nu), FR9, FR10, FR20 (grundläggande receptvy)

#### Story 1.14: Hitta recept från Lägg till

Som Pontus,
vill jag kunna surfa in på koket.se eller en annan godkänd receptsajt direkt från Lägg till recept,
så att jag hittar nya recept utan att lämna appen för att leta efter sajten.

**Acceptance Criteria:**

**Givet** arket Importera recept
**När** det är öppet och det finns godkända receptsajter
**Så** visar avsnittet "Hitta recept på nätet" en kompakt knapp per sajt (t.ex. "koket.se") som öppnar sajtens startsida i en ny flik (`target="_blank"`, `rel="noopener"`), med tillgängligt namn "Öppna koket.se i en ny flik" och minst 44 px tryckyta, och Matkoll hämtar inget från sajten

**Givet** avsnittet "Hitta recept på nätet"
**När** Pontus läser raden under knapparna
**Så** står "Hittat ett recept? Använd bokmärket Spara i Matkoll på datorn, eller kopiera länken och klistra in den här.", där "Spara i Matkoll" leder till `/installningar#spara-i-matkoll` (avsnittet finns och sidan scrollar dit) och "här" öppnar fliken Länk med fokus i länkfältet

**Givet** inga godkända receptsajter
**När** arket är öppet
**Så** visas en kort rad med länk till listan över godkända receptsajter i Inställningar i stället för knappar

**Givet** avsnittet "Spara i Matkoll" i Inställningar
**När** Pontus öppnar det
**Så** står överst "Tips: dra knappen till bokmärkesfältet (visa det med ⌘⇧B i Chrome)."

**Givet** en skärm på 375 px och mörkt läge
**När** avsnittet visas
**Så** blir det inget sidled och kontrasten håller

## Epic 2: Lager
Pontus kan föra in det som finns hemma per plats, med eller utan mängd, och ser direkt i receptbiblioteket vilka rätter som kan lagas och hur många varor som saknas.
**FRs covered:** FR11, FR12, FR8 (lagningsstatus)

### Epic 3: Matsedel och inköpslista
Pontus kan planera veckan med portioner, få en inköpslista per butiksavdelning där lagret är avdraget, bocka av med en hand i butiken, lägga till egna varor och lägga allt avbockat i lagret med ett tryck. Efter epicen fungerar kärnan end-to-end och molndriften är förberedd.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20 (knappen Lägg på matsedeln)

#### Story 3.9: Avbockade syns och kan ångras

Som Pontus,
vill jag se det jag bockat av överstruket och kunna ångra en felbockning,
så att jag inte tappar en vara i butiken.

**Acceptance Criteria:**

**Givet** att jag bockat av varor i inköpslistan
**När** jag ser listan
**Så** ligger de längst ned under "I korgen (N)", överstrukna och dämpade med ikryssade rutor, och sektionen är öppen från början med "Dölj"/"Visa" vars val kommer ihåg per enhet

**Givet** att jag just bockat av en vara
**När** bekräftelsen visas
**Så** står där "Gul lök i korgen" med "Ångra", och "Ångra" bockar av varan igen så att den ligger kvar i sin kategori

**Givet** en avbockad vara i "I korgen"
**När** jag trycker på dess ruta
**Så** bockas den av och hamnar tillbaka i sin kategori

**Givet** inköpslistan och erbjudandearket
**När** jag ser rutorna
**Så** är de samma fyrkantiga `Checkbox` med 44 px träffyta, och förloppskortet, papperskorgen, svepet, "Lägg i lagret" och kopiera till varukorg fungerar som förut (avbockade varor lämnas utanför exporten)

## Epic 4: Steg-för-steg
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

### Epic 11: Nytt utseende
Tillägg till 1.1. Matkoll ser ut och känns som en app i mobilen, enligt tre skisser som Pontus godkände: varorna i kategorier med ikon, Lagersaldo utan mängder men med märke eller tid och en soptunna, en inköpslista med framsteg och "I korgen", kort i Recept och Matsedel, och Matkoll på hemskärmen med inloggning med kod.
**FRs covered:** FR40, FR41, FR42, FR43, FR44, NFR12 (och ändringar av FR1, FR12, FR13 och FR16)

### Epic 12: Snabbare och asynkron AI
Tillägg till 1.1. AI-flödena mäts och snabbas upp, och bildanalys, AI-förslag och receptimport körs som AI-jobb i bakgrunden, ett i taget i en kö. Pontus kan fortsätta i appen och får en kort bekräftelse och ett märke på fliken när ett resultat är klart. Inget från AI sparas utan Pontus bekräftelse.
**FRs covered:** FR45, FR46, FR47, FR48, FR49, FR50, NFR13 (och ändringar av NFR7, FR3, FR4, FR23 och FR24)

### Epic 9: Veckans erbjudanden
Version 1.2. Matkoll hämtar veckans erbjudanden från butikens länk, som Pontus sparar i Inställningar, och använder dem där de gör nytta: en etikett på inköpslistan, filtret Erbjudanden i Recept, "Fyll på lagret", AI-förslagen och ett förslag till veckans matsedel. Utan länk klistrar Pontus in texten eller fotograferar reklambladet. Byggs efter Epic 12.
**FRs covered:** FR34, FR35, FR36, FR51, FR52, FR53, FR54, NFR10 (och FR23, som får erbjudanden som indata)

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

### Story 1.13: Spara i Matkoll från receptsajten

Som Pontus,
vill jag skicka ett recept från koket.se eller en annan godkänd sajt till Matkoll med ett tryck,
så att jag slipper kopiera och klistra in länken.

**Acceptance Criteria:**

**Givet** adressen `/recept/importera?url=<receptets adress>`
**När** Pontus öppnar den inloggad
**Så** startar importen från länk direkt (samma regler som Story 1.8 och godkända sajter i 1.12) och förhandsgranskningen visas, och en sajt som inte är godkänd ger samma tydliga meddelande som förut

**Givet** Inställningar
**När** Pontus öppnar avsnittet "Spara i Matkoll"
**Så** finns ett bokmärke att dra till bokmärkesfältet på datorn, en kort instruktion för en iOS-genväg via Dela-menyn, och Android kan dela till Matkoll när appen är installerad (Web Share Target i manifestet)

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

## Epic 11: Nytt utseende

Tillägg till 1.1. Pontus bad om "betydligt trevligare ux. Som ser proffsigare ut." och godkände tre skisser: Lagersaldo ("ja mycket snyggare enl din skiss"), Inköpslista ("inköpslistan börjar bli mkt bättre") och hela appen i mobilen ("ja nu börjar du verkligen hitta ux som app. bravo. håll den stilen"). Skisserna ligger i `ux-designs/ux-Matkoll-2026-10-25/mockups/`, och `DESIGN.md` och `EXPERIENCE.md` gäller när de inte stämmer överens. Epic 11 byggs efter Epic 10, där Story 10.4 redan byter namn till Lagersaldo och Inköpslista. Arkitekturen står i AD-27 och i tillägg till AD-3, AD-12, AD-17, AD-19 och AD-20. Storyna byggs i ordning, och varje story håller tillgänglighetsgolvet (NFR12): 44 px tryckytor, 200 % text, 375 px bredd, mörkt läge, VoiceOver och React Activity.

### Story 11.1: Gemensam grund för nytt utseende

Som Pontus,
vill jag att varor visas i tydliga kategorier med ikon i samma stil överallt,
så att appen ser ut och känns som en app.

**Acceptance Criteria:**

**Givet** katalogens avdelningar och en varas namn
**När** `displayCategory(section, name)` anropas
**Så** ger den en av nio kategorier i butikens ordning (Frukt & grönt, Bröd, Mejeri & ägg, Kött, fisk & chark, Frys, Skafferi, Såser & smaksättare, Dryck, Övrigt), Kött och fisk och Chark ger samma kategori, och en vara i Skafferi som heter till exempel "senap", "sojasås" eller "svartpeppar" ger Såser & smaksättare, visat med ett tabelltest (FR40, AD-12)
**Och** ingenting sparas, och exporten och avdelningarna är oförändrade

**Givet** tokens i `DESIGN.md`
**När** `globals.css` läses
**Så** finns `tile-clay` och `tile-lilac` i ljust och mörkt läge och de nya måtten, och testet för tokens och kontrast passerar utan hex utanför `globals.css` (AD-17, UX-DR23)

**Givet** komponenterna Kategorirubrik, Listgrupp, Listrad, Soptunna och Mätare i `src/components`
**När** de renderas vid 375 px, med 200 % text och i mörkt läge
**Så** ser de ut som i skisserna, ikonen och mätaren är dolda för skärmläsare, rubriken är ett `h2` med antalet som text, och soptunnan har en tryckyta på 44 × 44 px och namnet "Ta bort <vara>" (NFR12)

**Givet** flikfältet
**När** det visas
**Så** har Inköpslista en kundvagn och Lagersaldo ett kylskåp som ikon, och aktiv flik är markerad som förut

### Story 11.2: Märke och tid på lagervaror

Som Pontus,
vill jag att en lagervara kommer ihåg märket och när den lades till,
så att listan kan visa något mer användbart än mängden.

**Acceptance Criteria:**

**Givet** migrationen som lägger till `pantry_item.label`
**När** den körs på ett lager med varor
**Så** står alla rader kvar med samma id, mängd och `created_at`, `label` är `null`, och RLS-testerna passerar (AD-4, AD-5, AD-19)

**Givet** ett lagerförslag från ett foto med etiketten "Arla Mellanmjölk laktosfri 1,5 l"
**När** Pontus bekräftar eller rättar det
**Så** sparas etiketten som märke, avkortad till 60 tecken (FR42)

**Givet** arket Lagervara
**När** Pontus skriver i fältet "Märke eller sort" och sparar, eller tömmer det
**Så** sparas märket, eller tas bort

**Givet** en lagervara som lades till för fyra dagar sedan
**När** Pontus ändrar mängden, enheten eller platsen
**Så** står `created_at` kvar

**Givet** en borttagen vara, en tömd plats eller en inventering
**När** Pontus trycker "Ångra"
**Så** kommer raderna tillbaka med samma id, märke och `created_at` (AD-20)

**Givet** "Lägg i lagret" från inköpslistan
**När** en ny vara läggs till
**Så** får den inget märke, och en befintlig varas märke står kvar

### Story 11.3: Lagersaldo i nytt utseende

Som Pontus,
vill jag se lagret i kategorier utan mängder och ta bort en vara med ett tryck,
så att det går snabbt att hålla lagret rätt.

**Acceptance Criteria:**

**Givet** kylen med Mellanmjölk (märket "Arla laktosfri"), Gräddfil (tillagd för sex dagar sedan), Kycklingfilé och Senap
**När** Lagersaldo visas
**Så** står varorna under Mejeri & ägg, Kött, fisk & chark och Såser & smaksättare i butikens ordning, med antal i rubriken, och under namnen "Arla laktosfri" och "Tillagd för 6 dagar sedan" (FR40, FR41, UX-DR24)
**Och** ingen mängd syns i listan, och obegränsade varor är rader som de andra

**Givet** en rad
**När** Pontus trycker på raden
**Så** öppnas arket Lagervara med mängd, enhet, plats och märke

**Givet** soptunnan vid Gräddfil
**När** Pontus trycker på den
**Så** försvinner varan direkt utan fråga, "Tog bort Gräddfil." visas med "Ångra" i 5 s, och fokus går till nästa varas soptunna
**Och** "Ångra" sätter tillbaka varan med samma rad under

**Givet** kylen med 14 varor
**När** Pontus skriver "mjö" i "Sök i kylen"
**Så** visas bara Mellanmjölk under Mejeri & ägg, och med "xyz" visas "Inget i kylen matchar." och "Rensa sökning"
**Och** sökningen töms när Pontus byter plats eller ställe, men står kvar när Pontus byter flik och kommer tillbaka

**Givet** Lagersaldo vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text
**När** sidan visas och används med VoiceOver
**Så** radbryts allt utan vågrät scroll, kategorierna går att hoppa mellan som rubriker, och raden läses som "Mellanmjölk, Arla laktosfri" (NFR12)

### Story 11.4: Inköpslistan i nytt utseende

Som Pontus,
vill jag se hur mycket som är kvar och få det som redan ligger i korgen ur vägen,
så att det går fort i butiken.

**Acceptance Criteria:**

**Givet** en lista med 14 poster varav 6 avbockade
**När** Inköpslistan visas
**Så** står "8 varor kvar" och "6 av 14 i korgen" med en mätare överst, posterna står under sina kategorier i butikens ordning, och "6 varor i korgen" med "Visa" står under listan (FR43, UX-DR25)

**Givet** posten Citron
**När** Pontus bockar av den
**Så** flyttas den direkt till I korgen, bocken sparas som förut, live-regionen säger "Citron i korgen.", och fokus går till nästa posts bock
**Och** en bock under I korgen tar tillbaka posten till sin kategori

**Givet** posten Matlagningsgrädde från två rätter, en egen vara och en vag post (senap) som saknas i stugans lager
**När** listan räknas mot Stugan
**Så** står "Korv stroganoff · Kycklinggryta", "Egen vara" och "Saknas i Stugan · Korv stroganoff" under posterna, och mängden står efter namnet

**Givet** ett produktval "Scan Falukorv" för falukorv i vald butik
**När** listan visas
**Så** står "Scan Falukorv" som en ljusblå etikett på raden (FR27)

**Givet** att minst en post är avbockad
**När** listan visas
**Så** ligger "Skicka till ICA" och "Lägg i lagret" i en rad längst ned, och med 200 % text ovanpå varandra
**Och** utan avbockade poster finns bara "Skicka till ICA"

**Givet** listan vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text och VoiceOver
**När** Pontus handlar
**Så** fungerar allt utan vågrät scroll, bockarna har 44 × 44 px och namnet "Citron, 1 st, inte avbockad", och mätaren är dold för skärmläsare (NFR12)

### Story 11.5: Recept och Matsedel i nytt utseende

Som Pontus,
vill jag se recepten och matsedeln som kort med stora bilder,
så att det är lätt att välja vad vi ska äta.

**Acceptance Criteria:**

**Givet** receptbiblioteket
**När** det visas
**Så** är varje recept ett kort med bilden överst, "Kan lagas nu" eller "Saknar 2 varor" nere till vänster och hjärtat nere till höger på bilden, och titeln och "35 min · 4 portioner" under (UX-DR26)
**Och** ett tryck på kortet öppnar receptet, ett tryck på hjärtat växlar favorit utan att öppna det, och ett recept utan bild får platshållaren

**Givet** en skärm som är minst 1024 px bred
**När** Recept visas
**Så** står korten i två kolumner

**Givet** en matsedel med Kycklinggryta (6 av 8 hemma)
**När** Matsedel visas
**Så** har rätten ett kort med 56 px bild, "6 av 8 hemma" och en mätare till tre fjärdedelar, och portionsväljaren står kvar och räknar om (FR13)
**Och** "Visa inköpslistan" längst ned går till Inköpslistan

**Givet** Recept och Matsedel vid 375 px, i mörkt läge, med 200 % text och VoiceOver
**När** de används
**Så** finns ingen vågrät scroll, hjärtat har 44 × 44 px, status står som text och mätaren är dold för skärmläsare (NFR12)

### Story 11.6: Matkoll på hemskärmen

Som Pontus,
vill jag lägga Matkoll på hemskärmen och öppna den som en app,
så att den känns som en riktig app i mobilen.

**Acceptance Criteria:**

**Givet** appen
**När** `/manifest.webmanifest` hämtas utan inloggning
**Så** svarar den med namnet Matkoll, `display: standalone`, `start_url: /recept`, appens bakgrundsfärg och ikoner på 192 och 512 px, och ikonerna och Apple-ikonen (180 px) nås också utan inloggning (FR44, AD-27)
**Och** ingen annan sida eller data nås utan inloggning

**Givet** sidans `head`
**När** den renderas
**Så** finns `apple-mobile-web-app-title` "Matkoll", `apple-mobile-web-app-status-bar-style` och länkarna till manifestet och Apple-ikonen

**Givet** mejlet med engångslänken
**När** Pontus skriver in koden på inloggningssidan
**Så** loggas Pontus in och kommer till sidan i `next`, och en fel eller gammal kod ger "Koden stämmer inte eller har gått ut. Skicka en ny länk." (FR1, AD-3)
**Och** en adress som inte är tillåten får samma svar och ingen session

**Givet** receptvyn, en tidigare matsedel och Inställningar
**När** de visas
**Så** har de en synlig "Tillbaka"

**Givet** Inställningar i Safari på iPhone, utanför hemskärmsappen
**När** sidan visas
**Så** står en rad om hur Matkoll läggs på hemskärmen, och i hemskärmsappen syns den inte

**Givet** en riktig iPhone
**När** Pontus lägger Matkoll på hemskärmen och öppnar den
**Så** öppnas appen i helskärm med moroten som ikon och appens bakgrund bakom statusraden, i ljust och mörkt läge (Flöde 9, manuellt prov)

### Story 11.7: Egen ikon och Snowstar

Som Pontus,
vill jag ha en egen ikon (burken med bocken) och se att appen kommer från Snowstar,
så att Matkoll känns som min egen app.

**Acceptance Criteria:**

**Givet** manifestet
**När** ikonerna hämtas
**Så** är `any` 192 och 512 en rundad grön ruta med burken, `maskable` 512 en kantlös grön ruta med burken på 80 % och Apple-ikonen (180 px) en kantlös ruta utan genomskinlighet
**Och** `favicon.ico` har 32 och 48 px med en förenklad burk och tjockare bock

**Givet** inloggningssidan och Inställningar
**När** de visas
**Så** står "Matkoll · av Snowstar" längst ned i liten dämpad text (`text-ink-3`)

## Epic 12: Snabbare och asynkron AI

Tillägg till 1.1. Pontus skrev 2026-10-26: "Vi borde få till prestandan i qwen kommandona om det går. Kanske göra dem asynkrona om det går, och att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara. Om det inte riskerar ngt." Pontus godkände planen ("ja planera det så"): först fart, mätt före och efter, sedan AI-jobb i bakgrunden, ett i taget i en kö. Epic 12 byggs efter Epic 11. Arkitekturen står i AD-28 och i tillägg till AD-1, AD-2, AD-4, AD-9, AD-10, AD-13, AD-14, AD-15, AD-18, AD-23 och AD-26. Storyna byggs i ordning. Mätningarna i 12.1, 12.2, 12.3 och 12.7 görs mot LM Studio på Pontus Mac, och siffrorna skrivs i `docs/lm-studio.md`, T5, T6 och beslutsloggen. Inget från AI sparas utan Pontus bekräftelse.

### Story 12.1: Mät AI-tiderna och ställ in LM Studio

Som Pontus,
vill jag veta hur lång tid varje AI-flöde tar och vilka inställningar i LM Studio som går snabbast,
så att varje förbättring kan mätas före och efter.

**Acceptance Criteria:**

**Givet** utvärderingen (`pnpm eval:ai`)
**När** den körs mot LM Studio
**Så** mäter den varje flöde (bildanalys med nummer, AI-förslag, import av text och länk) med kall modell (efter minst 15 minuter utan anrop) och varm modell, och rapporten har tid, token in och ut och token per sekund per körning (FR45)

**Givet** LM Studio med PARALLEL 4 och med PARALLEL 1
**När** flödena körs ett i taget, som kön kommer att köra dem, och två samtidigt
**Så** visar rapporten tiderna för båda, och spekulativ avkodning (`--speculative-draft-mtp`) är prövad om modellen stöder den

**Givet** mätningen
**När** den är klar
**Så** finns `docs/lm-studio.md` med de uppmätta tiderna, de rekommenderade inställningarna (samtidiga anrop, kontext, TTL, spekulativ avkodning) och kommandot för att ladda modellen så, och LM Studio har samma inställningar som före mätningen

**Givet** att bygget ändrar LM Studio för att mäta
**När** det görs
**Så** skrivs inställningarna ned före (`lms ps`), och de återställs efteråt

### Story 12.2: Väck modellen i förväg

Som Pontus,
vill jag att modellen redan är vaken när jag tar ett foto eller ber om förslag,
så att det första anropet inte tar tre gånger så lång tid.

**Acceptance Criteria:**

**Givet** att Pontus öppnar Lagersaldo eller Recept
**När** sidan visas
**Så** anropar klienten `POST /api/ai/warm` med `image` eller `text`, högst en gång per sort och fem minuter, servern svarar direkt (202), och AI-porten skickar i bakgrunden ett anrop med flödets systemprompt, minimal indata och `maxOutputTokens: 1` (FR45, AD-9)

**Givet** att ett AI-anrop eller AI-jobb redan pågår för Pontus
**När** väckningen begärs
**Så** görs inget

**Givet** `AI_PROVIDER=mock`, `anthropic` eller `openai`
**När** väckningen begärs
**Så** anropas ingen modell

**Givet** mätningen från 12.1 med kall modell
**När** det första riktiga anropet görs efter väckningen
**Så** är det minst 20 % snabbare än utan väckning, annars tas väckningen bort och beslutet loggas

### Story 12.3: Kortare svar för AI-förslag

Som Pontus,
vill jag att AI-förslagen kommer fortare,
så att jag inte väntar en och en halv minut på tre rätter.

**Acceptance Criteria:**

**Givet** `suggestDishes`
**När** modellen tillfrågas
**Så** svarar den med det kompakta schemat (receptrad med `text`, `amount`, `unit`, `name`, `stepIndexes`, och `new` bara för varor som inte finns i lagret), och porten gör om svaret till `AiRecipe` så att förhandsgranskningen och sparandet är oförändrade (FR45, AD-10)

**Givet** utvärderingen `tests/eval/suggest-dishes.eval.ts` före och efter
**När** den körs mot LM Studio med varm modell
**Så** ger svaret minst 25 % färre token, medianen är högst 40 s, och lika många förslag är giltiga och använder minst två varor från lagret

**Givet** att målet inte nås med tre rätter
**När** mätningen visar det
**Så** prövas färre rader och steg per rätt, och valet och siffrorna står i beslutsloggen

### Story 12.4: AI-jobb i kö, med AI-förslag först

Som Pontus,
vill jag kunna be om rättförslag och fortsätta använda appen medan AI:n arbetar,
så att jag inte behöver vänta vid en snurra.

**Acceptance Criteria:**

**Givet** migrationen för `ai_job`
**När** den körs
**Så** finns tabellen med RLS, grants, det partiella unika indexet för `running` och Postgres-funktionerna i AD-28, och RLS-testerna visar att en annan användare varken kan läsa, avbryta eller ta över ett jobb (AD-4, AD-28, NFR13)

**Givet** "Föreslå rätter med AI"
**När** Pontus trycker
**Så** svarar `POST /api/ai/jobs` inom en sekund med jobbet, Recept visar "Letar efter idéer … Du kan göra annat under tiden." och "Avbryt", jobbraden visas, och förslagen körs i bakgrunden (FR46)

**Givet** ett jobb som pågår
**När** Pontus går till Inköpslista
**Så** säger en kort bekräftelse "3 rättförslag är klara." med "Visa" när förslagen är klara, och Recept får märket 1, som försvinner när förslagen har visats (FR48, UX-DR30)

**Givet** tre aktiva jobb
**När** Pontus startar ett fjärde
**Så** visas "Det finns redan tre AI-jobb. Vänta tills ett är klart." och inget startas (FR47)

**Givet** två jobb
**När** de körs
**Så** körs de ett i taget, jobbraden säger "· 1 i kö", och "Avbryt" fungerar både för jobbet i kö och för det som pågår, också från en annan flik (FR47, UX-DR29)

**Givet** ett jobb vars server dör
**När** dess tidsgräns har gått
**Så** visas "AI-jobbet avbröts. Försök igen.", och nästa jobb i kö startar

**Givet** att Pontus byter valt ställe medan förslagen tas fram
**När** de visas
**Så** står "Förslagen bygger på lagret för Hemma." och "Föreslå igen" över dem (FR49)

**Givet** ett dubbeltryck eller ett nytt försök med samma nyckel
**När** jobbet startas
**Så** finns ett jobb, inte två

**Givet** jobbet och loggarna
**När** de granskas
**Så** finns inget lager, ingen recepttext och inget foto i `ai_job.context` eller i loggarna, bara felkoder, sorter, antal och jobbets id (NFR13)

### Story 12.5: Bildanalys i bakgrunden

Som Pontus,
vill jag kunna fotografera kylen och sedan frysen direkt, och göra annat medan fotona tolkas,
så att jag kan inventera hela köket i ett svep.

**Acceptance Criteria:**

**Givet** ett foto av kylen
**När** Pontus tar det
**Så** svarar `POST /api/ai/jobs/photo` inom en sekund, Lagersaldo visar "Tittar på bilden … Du kan göra annat under tiden." och "Avbryt", och Pontus kan fotografera frysen direkt, som hamnar i kö (FR46, FR47)

**Givet** att avläsningen är klar
**När** jobbet fortsätter med numren
**Så** visas korten direkt, numren kommer när de är klara, och nästa jobb i kö startar först efter numren (högst 30 s till) (AD-28)

**Givet** ett nytt foto av samma plats på samma ställe
**När** det förra är i kö, pågår eller väntar på bekräftelse
**Så** ersätts det förra, som aldrig visas och inte ger någon bekräftelse (FR49)

**Givet** ett resultat för kylen
**När** Pontus öppnar det efter att ha ändrat i kylen
**Så** jämförs avläsningen med kylen som den är nu ("Nytt", "Ändrat", "Syns inte längre"), och förslagen gäller fotots ställe med "Förslagen gäller Stugan." när ett annat ställe är valt (FR49, AD-24)

**Givet** fotot och jobbet
**När** jobbet väntar och körs
**Så** finns fotot bara i serverns minne och i klientens minne, aldrig i `ai_job`, på disk eller i loggar, och efter en omladdning fungerar korten men inget senaste foto sparas (AD-15, AD-26, NFR13)

**Givet** låset i `ai-runs.ts` och rutterna `/api/ai/analyze` och `/api/ai/locate`
**När** storyn är klar
**Så** är de borttagna, och kön är den enda regeln för att modellen kör ett jobb i taget

### Story 12.6: Receptimport i bakgrunden

Som Pontus,
vill jag kunna läsa in flera recept efter varandra och stänga arket medan de läses,
så att jag kan samla recept utan att vänta på vart och ett.

**Acceptance Criteria:**

**Givet** arket Importera recept med en länk, en text eller ett foto
**När** Pontus trycker "Läs in"
**Så** svarar servern inom en sekund, arket visar "Läser receptet … Du kan göra annat under tiden.", och Pontus kan stänga arket eller läsa in nästa recept (FR46)

**Givet** en länk från en domän som inte är godkänd, eller en text som är för lång
**När** Pontus trycker "Läs in"
**Så** visas felet direkt, och inget jobb startas

**Givet** att ett recept är inläst
**När** Pontus är på en annan sida
**Så** säger en kort bekräftelse "Receptet Krämig kycklinggryta är inläst." med "Visa", Recept får märket 1, och "Visa" öppnar förhandsgranskningen (FR48)

**Givet** ett foto av en kokbokssida
**När** det står i kö och körs
**Så** finns fotot bara i serverns minne, och aldrig i `ai_job` eller i loggar (AD-15, NFR13)

**Givet** rutterna `/api/ai/import` och `/api/ai/import/photo`
**När** storyn är klar
**Så** är de borttagna

### Story 12.7: Första rätten direkt

Som Pontus,
vill jag se den första rätten så fort den är klar,
så att jag kan börja läsa medan de andra tas fram.

**Acceptance Criteria:**

**Givet** ett prov mot LM Studio med `streamText`, `Output.array` och det kompakta schemat från 12.3
**När** det körs
**Så** visar provet om varje rätt kommer innan svaret är klart, och utfallet står i T9 och beslutsloggen. Kommer den inte före, avslutas storyn med mätningen och utan strömning (FR50)

**Givet** att strömningen fungerar
**När** Pontus ber om förslag
**Så** visas varje rätt så fort den är klar, med "Letar efter fler …" och "Avbryt" sist, och en ny rätt annonseras för skärmläsare (FR50, UX-DR31)

**Givet** en rätt som inte håller (fel schema, en titel att undvika, för få varor från lagret)
**När** den kommer
**Så** visas den aldrig, och jobbet är klart med de rätter som höll, eller gör ett nytt försök när ingen höll

**Givet** mätningen med varm modell
**När** den körs tre gånger
**Så** syns den första rätten efter högst 40 % av tiden för alla tre

### Story 12.8: Magisk AI-vy

Som Pontus,
vill jag se att AI:n arbetar medan ett jobb pågår,
så att väntan känns lugn och spännande i stället för tom.

**Acceptance Criteria:**

**Givet** ett jobb som körs
**När** arket AI-jobb är öppet
**Så** visas överst en lugnt roterande kub med partiklar, en statusrad som byts var 2,5 s med mjuk toning (olika texter för förslag, foto och import), och tiden hittills mot den vanliga tiden ("12 s av ca 35 s")

**Givet** att statusraden byts
**När** en skärmläsare lyssnar
**Så** läses inte varje rad upp; en stabil status ändras bara när jobbets tillstånd ändras

**Givet** att inget jobb körs men något är klart
**När** arket är öppet
**Så** står bilden still med en bock och "Klart!", och klara jobb visas som förut

**Givet** "Minska rörelse"
**När** arket är öppet
**Så** står allt stilla och statusraden är en fast text

**Givet** 375 px och mörkt läge
**När** arket visas
**Så** blir ingenting för brett, knapparna har kvar 44 px och bilden läses i båda lägena

## Epic 9: Veckans erbjudanden

Version 1.2. Pontus skrev 2026-10-26: "Jag vill helst kunna ladda in veckans erbjudanden via en länk … lägga in dom i inställningar för de affärer jag har konfigurerade." Förstudien (`docs/erbjudanden-lankar.md`) visar att ICA:s erbjudandesida per butik har samma adress varje vecka och går att läsa med en vanlig hämtning, medan Willys, Hemköp, Coop och Lidl kräver JavaScript. Pontus valde sedan funktionerna som använder erbjudandena. Kursändringen står i `sprint-change-proposal-2026-10-26-erbjudanden-v2.md` och ersätter den första planen. Arkitekturen står i AD-25 och i tillägg till AD-1, AD-9, AD-11, AD-15, AD-18, AD-24 och AD-28. Epic 9 byggs efter Epic 12. Storyna byggs i ordning, men om ica.se nekar Matkolls User-Agent (T13) byggs 9.7 direkt efter 9.1. Story 9.10 byggs bara om mätningen i 9.1 visar att den behövs (T14). Varje story håller tillgänglighetsgolvet (NFR12).

### Story 9.1: Veckans erbjudanden från butikens länk

Som Pontus,
vill jag spara länken till butikens erbjudanden i Inställningar och hämta veckans erbjudanden med ett tryck,
så att Matkoll vet vad som är på erbjudande utan att jag skriver av något.

**Acceptance Criteria:**

**Givet** butiken Maxi ICA Stormarknad Östersund (ICA, butiks-id 1003733)
**När** migrationen har körts
**Så** har butiken länken `https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/`, och arket Butik har fältet "Länk till veckans erbjudanden" (FR34, UX-DR19)
**Och** en adress som inte är en erbjudandesida på ica.se nekas med ett besked under fältet, och för andra kedjor står "Länk stöds bara för ICA än så länge."

**Givet** migrationen för `store_offer` med RLS och grants
**När** RLS-testerna körs
**Så** kan varken en anonym klient eller en annan användare läsa eller skriva erbjudanden (AD-4, AD-25)

**Givet** arket Veckans erbjudanden, öppnat med "Erbjudanden" i Inköpslistans rubrik
**När** Pontus trycker "Hämta veckans erbjudanden"
**Så** hämtas sidan en gång med `safeFetch` och Matkolls egen User-Agent, bara erbjudanden på mat sparas för butiken och veckan, och arket visar dem i kategorier med pris och villkor (FR34, FR35, NFR10)
**Och** den korta bekräftelsen säger "Hämtade 91 erbjudanden för vecka 45.", och raden under rubriken "122 varor som inte är mat togs inte med."

**Givet** sidans data i `window.__INITIAL_DATA__` med `undefined` och `new Map([])`
**När** den läses
**Så** läses den deterministiskt utan `eval`, bara `offers.weeklyOffers` används, och `publicAccessToken`, kakor och interna adresser finns aldrig i databasen, svaret eller loggarna (NFR10)

**Givet** att sidan svarar 403 eller 429, saknar data eller har en okänd form
**När** Pontus trycker "Hämta veckans erbjudanden"
**Så** görs inget nytt försök, inget sparas, och en meddelanderuta säger vad som hände, med "Öppna sidan"

**Givet** erbjudanden som hämtades för en kvart sedan
**När** Pontus trycker "Hämta igen"
**Så** ersätts butikens hämtade erbjudanden för veckan, och erbjudanden från text eller foto står kvar
**Och** ett nytt tryck inom 15 minuter ger "Erbjudandena hämtades nyss. Försök igen om en stund." utan hämtning

**Givet** ett erbjudande vars vara finns i katalogen och ett som inte gör det
**När** de sparas
**Så** kopplas det första till katalogingrediensen med `matchIngredients`, det andra sparas med sitt namn, och katalogen är oförändrad (AD-6)

**Givet** testerna
**När** de körs
**Så** går hämtningen mot sparade sidor via `fixture-sites.ts`, och ingen test anropar ica.se

### Story 9.2: Erbjudanden på inköpslistan

Som Pontus,
vill jag se på inköpslistan vilka varor som är på erbjudande den här veckan,
så att jag vet vad som är billigt när jag planerar och handlar.

**Acceptance Criteria:**

**Givet** listposten Falukorv och ett erbjudande på falukorv i vald butik
**När** Inköpslistan visas
**Så** står erbjudandeetiketten "Falukorv 29 kr" först på raden under namnet, och skärmläsaren säger "På erbjudande: Falukorv 29 kr" (FR51, UX-DR32)

**Givet** en post utan katalogingrediens eller en egen vara med samma namn som ett erbjudande
**När** listan visas
**Så** får den också etiketten

**Givet** listposten Falukorv
**När** Pontus trycker på texten
**Så** visar listpostdetaljen alla erbjudanden på varan med pris och villkor

**Givet** etiketter på listan
**När** Pontus trycker "Skicka till ICA"
**Så** är exporten byte för byte som utan erbjudanden, och listans poster, mängder och ordning är oförändrade (AD-8, AD-16)

### Story 9.3: Filtret Erbjudanden i Recept

Som Pontus,
vill jag se vilka av mina recept som använder veckans erbjudanden,
så att jag kan laga det som är billigt den här veckan.

**Acceptance Criteria:**

**Givet** Recept
**När** sidan visas
**Så** finns pillren Alla, Favoriter, Kan lagas nu och Erbjudanden (FR52)

**Givet** erbjudanden på falukorv, gul lök och laxfilé
**När** Pontus väljer Erbjudanden
**Så** visas recept där minst en huvudvara är på erbjudande, flest erbjudanden först och sedan minst saknat, med raden "Recept med veckans erbjudanden från Maxi ICA Stormarknad Östersund, vecka 45." och "Visa erbjudanden"
**Och** korten har upp till två erbjudandeetiketter och "+N" (UX-DR32)

**Givet** ett recept där bara en krydda eller en vag rad är på erbjudande
**När** filtret visas
**Så** kommer receptet inte med

**Givet** erbjudanden
**När** Pontus väljer Alla, Favoriter eller Kan lagas nu
**Så** är ordning, status och kort som utan erbjudanden (AD-7)

### Story 9.4: Fyll på lagret

Som Pontus,
vill jag se när varor jag brukar ha hemma eller i stugan är på erbjudande,
så att jag kan fylla på när det är billigt.

**Acceptance Criteria:**

**Givet** kaffe i Hemma men inte i Stugan och ett erbjudande på kaffe
**När** arket Veckans erbjudanden visas
**Så** står kaffet överst under "Fyll på lagret" med "49 kr · Finns i Hemma, inte i Stugan" (FR53)

**Givet** en vara som inte finns i lagret men har ett produktval i butiken
**När** den är på erbjudande
**Så** står den under "Fyll på lagret" med "Du brukar köpa Gevalia"

**Givet** "Lägg på listan" vid kaffet och en aktuell matsedel
**När** Pontus trycker
**Så** läggs kaffet som egen vara på inköpslistan, en gång också vid dubbeltryck, och bekräftelsen säger "Lade kaffe på inköpslistan."

**Givet** lagret på flera ställen
**När** basvarorna räknas
**Så** läses bara vilka ställen varan finns på, aldrig summerade mängder (AD-24)

### Story 9.5: AI-förslag med veckans erbjudanden, direkt på matsedeln

Som Pontus,
vill jag att AI föreslår rätter med veckans erbjudanden som bas, och kunna lägga en rätt jag gillar på matsedeln i ett steg,
så att jag får alla varor på inköpslistan utom de jag redan har hemma.

**Acceptance Criteria:**

**Givet** arket Veckans erbjudanden utan erbjudanden
**När** Pontus ser knappen "Föreslå rätter från veckans erbjudanden"
**Så** är den avstängd och en rad säger att erbjudandena ska hämtas först

**Givet** veckans erbjudanden
**När** Pontus trycker på knappen
**Så** startar ett AI-jobb av sorten `suggest` med `mode: "offers"`, klienten skickar bara läget, och AI-tjänsten får varornas namn under "Erbjudanden i butiken den här veckan:" (högst 40, aldrig priser) bredvid lagret (FR36, AD-25, AD-28)

**Givet** inga erbjudanden eller ingen vald butik på servern
**När** jobbet ska startas
**Så** köas inget jobb, och felet är `offers_none` eller `offers_store_missing`

**Givet** förslagen
**När** de visas
**Så** visar varje kort rätten, erbjudandena den använder ("På erbjudande: Falukorv") och "5 av 6 hemma"

**Givet** ett förslag
**När** Pontus trycker "Lägg på matsedeln"
**Så** öppnas förhandsgranskningen som vanligt, och dess huvudknapp "Spara och lägg på matsedeln" sparar receptet, lägger rätten sist på aktuell matsedel och bekräftar "Lagt på matsedeln." med "Visa inköpslistan"

**Givet** rätten på matsedeln
**När** Pontus öppnar inköpslistan
**Så** har den bara varorna som inte finns hemma

**Givet** inga erbjudanden för butiken
**När** Pontus ber om vanliga AI-förslag
**Så** får AI-tjänsten exakt samma meddelande som efter Story 12.3 (FR36)

### Story 9.6: Veckans matsedel från erbjudanden och lagret

Som Pontus,
vill jag få ett förslag till veckans matsedel som utgår från erbjudandena och det som finns hemma,
så att veckan planeras på några tryck.

**Acceptance Criteria:**

**Givet** Matsedel
**När** Pontus trycker "Föreslå veckans matsedel"
**Så** startar ett AI-jobb av sorten `weekplan` som svarar inom en sekund, Matsedel visar "Planerar veckan … Du kan göra annat under tiden." och "Avbryt", och jobbraden visar det (FR54, AD-28)

**Givet** att jobbet är klart
**När** förslaget visas
**Så** står fem rättkort under "Förslag till veckans matsedel", i första hand recept ur biblioteket och högst två nya rätter med AI-etiketten, med "6 av 8 hemma" och erbjudandeetiketter (UX-DR33)

**Givet** förslaget med tre rätter ur biblioteket ibockade
**När** Pontus trycker "Lägg 3 rätter på matsedeln"
**Så** läggs de på den aktuella matsedeln, och bekräftelsen säger "Lade 3 rätter på matsedeln."

**Givet** en ny rätt i förslaget
**När** Pontus trycker "Granska och spara"
**Så** öppnas förhandsgranskningen som för ett AI-förslag, och inget sparas utan "Spara" (AD-2, AD-10)

**Givet** att Pontus byter valt ställe medan förslaget tas fram
**När** det visas
**Så** står "Förslaget bygger på lagret för Hemma." och "Föreslå igen"

### Story 9.7: Erbjudanden från inklistrad text

Som Pontus,
vill jag klistra in texten från en butiks erbjudandesida när det inte finns någon länk,
så att också andra butiker än ICA kan användas.

**Acceptance Criteria:**

**Givet** arket Veckans erbjudanden
**När** Pontus väljer "Klistra in text", klistrar in texten och trycker "Läs erbjudandena"
**Så** startar ett AI-jobb av sorten `offers`, och texten finns bara i serverns minne (FR34, AD-28)

**Givet** att jobbet är klart
**När** granskningen visas
**Så** står "Hittade 18 erbjudanden för vecka 45." med en rad per erbjudande och "Ta bort", och inget sparas före "Spara 16 erbjudanden"

**Givet** sparade erbjudanden för veckan
**När** Pontus läser in en text till och sparar
**Så** läggs erbjudandena ihop, och samma erbjudande blir ett

**Givet** en text som bara är en adress till en ICA-erbjudandesida
**När** Pontus trycker "Läs erbjudandena"
**Så** startar inget jobb, och beskedet säger att länken ska läggas in under Butik i Inställningar

### Story 9.8: Erbjudanden från foto av reklambladet

Som Pontus,
vill jag fotografera reklambladet eller välja en skärmbild,
så att jag kan lägga in erbjudanden också när jag inte har texten.

**Acceptance Criteria:**

**Givet** arket Veckans erbjudanden
**När** Pontus väljer "Fotografera bladet" eller "Välj bild"
**Så** förminskas fotot i klienten till högst 2048 px och 1,5 MB, skickas till `/api/ai/jobs/photo` som ett jobb av sorten `offers` och sparas aldrig (FR34, AD-15, AD-28)

**Givet** ett påhittat reklamblad i mockens fixturer
**När** jobbet är klart
**Så** visas samma granskning som för text, och "Spara" fungerar som i 9.7

**Givet** ett foto utan erbjudanden
**När** jobbet är klart
**Så** visas "Hittade inga erbjudanden på mat." och inget sparas

### Story 9.9: Ta bort erbjudanden

Som Pontus,
vill jag ta bort ett erbjudande som blev fel, eller alla för veckan,
så att etiketterna och förslagen bara bygger på rätt erbjudanden.

**Acceptance Criteria:**

**Givet** ett erbjudande i arket
**När** Pontus trycker på den grå soptunnan
**Så** tas det bort utan fråga, "Tog bort Falukorv." visas med "Ångra" i 5 s, och "Ångra" sätter tillbaka det med samma id (FR35, AD-20)

**Givet** veckans erbjudanden
**När** Pontus trycker "Ta bort alla"
**Så** tas veckans alla erbjudanden för butiken bort, och "Ångra" sätter tillbaka dem

**Givet** ett borttaget erbjudande som kom från länken
**När** Pontus hämtar igen
**Så** kommer det tillbaka, och raden under "Hämta igen" säger det

### Story 9.10: AI kopplar fler erbjudanden till katalogen

Som Pontus,
vill jag att erbjudanden med produktnamn ("Herrgård") kopplas till rätt vara i katalogen,
så att etiketterna, filtret och "Fyll på lagret" hittar dem.

Byggs bara om mätningen i 9.1 (T14) visar att färre än hälften av erbjudandena på mat får en katalogingrediens.

**Acceptance Criteria:**

**Givet** hämtade erbjudanden utan katalogingrediens
**När** Pontus trycker "Koppla fler till katalogen" i arket
**Så** startar ett AI-jobb som föreslår en befintlig katalogingrediens per erbjudande, utan att skapa nya (AD-6, AD-28)

**Givet** förslagen
**När** Pontus granskar dem och trycker "Spara kopplingar"
**Så** kopplas erbjudandena, och varje bekräftad koppling sparas som synonym i katalogen, så att samma vara hittas utan AI nästa vecka

**Givet** ett förslag som Pontus bockar ur i granskningen
**När** kopplingarna sparas
**Så** sparas inget för det erbjudandet

### Story 9.11: Hur bra är erbjudandet

Som Pontus,
vill jag se hur bra rabatt eller erbjudande varje vara i veckans lista är,
så att jag ser de bästa först och inte behöver räkna själv.

**Acceptance Criteria:**

**Givet** en hämtad vecka där ICA anger ordinarie pris eller en procentrabatt
**När** Pontus öppnar arket Veckans erbjudanden
**Så** står under varan till exempel "89 kr/kg · Ord. 111,90 kr · spara 20 %", och för "25% rabatt" och "Köp 3 betala för 2" står "spara 25 %" respektive "spara 33 %"
**Och** när ordinarie pris eller jämförbar enhet saknas visas ingenting om besparingen, aldrig en gissning

**Givet** ett erbjudande med minst 30 % besparing
**När** listan visas
**Så** har raden märket "Toppklipp"

**Givet** erbjudanden där minst ett har en besparing
**När** Pontus väljer "Bäst rabatt"
**Så** visas en lista med störst besparing först och okända sist, och "Efter avdelning" är kvar som standard

**Givet** migrationen
**När** den körs på befintliga data
**Så** får gamla rader null, `scripts/pantry-site-check.sql` ger samma utskrift före och efter, och `save_store_offers` är fortfarande `security invoker` med samma grants

**Givet** en hämtning
**När** den är klar
**Så** loggas antalet erbjudanden med ordinarie pris (`withRegularPrice`), aldrig varunamn

### Story 9.12: Välj erbjudanden till inköpslistan

Som Pontus,
vill jag välja vilka av veckans erbjudanden jag lägger i min inköpslista,
så att jag slipper skriva in dem själv.

**Acceptance Criteria:**

**Givet** arket Veckans erbjudanden med en aktuell matsedel
**När** arket visar erbjudandena
**Så** har varje rad en kryssruta med erbjudandets text som namn och minst 44 px tryckyta, och knappen "Lägg N i inköpslistan" visas när minst ett är kryssat

**Givet** ett eller flera kryssade erbjudanden
**När** Pontus trycker "Lägg N i inköpslistan"
**Så** läggs de som egna varor på listan: katalogvaran när erbjudandet är matchat, annars erbjudandets namn som fri text, med noteringen "(Erbjudande: 89 kr/kg)"
**Och** en toast säger "Lade N erbjudanden i inköpslistan." och länkar till Inköpslista

**Givet** ett erbjudande som lagts på listan
**När** det läggs igen, eller arket öppnas på nytt
**Så** blir det ingen dubblett, och raden visar "På listan" med en ofylld, avstängd kryssruta

**Givet** att sparandet misslyckas
**När** Pontus trycker knappen
**Så** står ett felmeddelande i arket och kryssen finns kvar

**Givet** ingen aktuell matsedel
**När** arket visas
**Så** har raderna inga kryssrutor och listan fungerar som förut

**Givet** bygget
**När** det granskas
**Så** finns ingen ny migration, `src/server/ai/` är orört och arket i erbjudandemodulen importerar inte inköpslistan

**Givet** arket Veckans erbjudanden
**När** raderna visas
**Så** står produktnamnet rensat från märke och ursprungsland ("Aubergine" för "ICA. Spanien Aubergine") med landet och märket smått under, priset fetstilt i en piller till höger, ordinarie pris genomstruket under det, och rabattmärket "−20 %" (från 30 % "Toppklipp −33 %")
**Och** kryssrutans namn lyder "Aubergine, 12 kr per st, spara 20 %", raden håller 375 px utan sidscroll och finns i mörkt läge

### Story 9.13: Erbjudanden från flera butiker

Som Pontus,
vill jag hämta veckans erbjudanden från flera av mina butiker, alla eller bara de jag väljer,
så att jag ser vad som är billigast och vilken butik varje erbjudande gäller.

**Acceptance Criteria:**

**Givet** minst två butiker med länk
**När** arket Veckans erbjudanden öppnas
**Så** står en kryssruta per butik (alla ikryssade, 44 px tryckyta) och knapparna "Hämta valda (N)" och "Hämta alla"; med en butik med länk ser arket ut som förut

**Givet** en hämtning från flera butiker
**När** den körs
**Så** hämtas butikerna en efter en, aldrig samtidigt, var och en med sin egen spärr (15 minuter) och 403/429-paus
**Och** en butik som är spärrad eller blockerad hoppas över med eget meddelande ("Maxi: …") medan de andra hämtas, och resultatet visas per butik

**Givet** erbjudanden från flera butiker
**När** listan visas
**Så** har varje rad en liten butiksetikett ("Maxi", "Krokom") i kedjans färgtoken (ICA, och en neutral för andra kedjor), och filterpiller överst: "Alla" och en per butik
**Och** "Bäst rabatt" sorterar över butikerna, och samma vara i två butiker visas som två rader

**Givet** ett erbjudande som läggs i inköpslistan
**När** det blir en egen vara
**Så** står butiken i noteringen: "Erbjudande Maxi: 89 kr/kg"

**Givet** AI-förslag från erbjudanden
**När** en begäran har ett `storeId`
**Så** byggs förslagen på den butikens erbjudanden (en butik som inte är användarens ger `offers_store_missing`); utan `storeId` gäller den valda butiken

**Givet** bygget
**När** det granskas
**Så** finns ingen ny migration, ingen hämtning mot ica.se i testerna, färgtokens i `DESIGN.md` och CSS med kontrast minst 4,5:1, och 9.12:s val till inköpslistan fungerar som förut

### Story 9.14: Matförslag per butik och veckans bästa butik

Som Pontus,
vill jag få matförslag från en butik i taget och veta vilken butik som passar bäst den här veckan,
så att jag inte behöver åka runt i stan för att handla.

**Acceptance Criteria:**

**Givet** erbjudanden från flera butiker
**När** Pontus öppnar AI-förslagen från veckans erbjudanden
**Så** väljer Pontus en butik, och förslagen bygger bara på den butikens erbjudanden och lagret

**Givet** erbjudanden från flera butiker och Pontus lager och recept
**När** arket Veckans erbjudanden visas
**Så** står "Veckans bästa butik" överst. Den räknas fram utan AI från hur många erbjudanden som passar lagret och det Pontus brukar laga, och den är förvald när förslag beställs

### Story 9.15: Butiksfärger och roligare erbjudandelista

Som Pontus,
vill jag att erbjudandelistan är rolig och tydlig att titta på, med butikens färg,
så att jag snabbt ser fynden och vilken butik de finns i.

**Acceptance Criteria:**

**Givet** erbjudanden från flera kedjor och butiker
**När** listan visas
**Så** har varje butik en bricka i kedjans färg (ICA röd, övriga neutral tills de får egen färg), utan ICA:s logga och utan produktbilder från ICA

**Givet** ett erbjudande med rabatt
**När** raden visas
**Så** syns prislappen och rabatten tydligt, Toppklipp sticker ut, och listan fungerar i 375 px och i mörkt läge

## Epic 13: Ta bort och planera

Pontus vill kunna ta bort saker där de syns, med en soptunna och en kontrollfråga som inte tjatar, och att matsedeln har det som behövs för att planera veckan.

### Story 13.1: Soptunna med smart kontrollfråga på inköpslistan

Som Pontus,
vill jag ta bort en vara från inköpslistan med en liten soptunna på raden,
så att listan bara visar det jag faktiskt ska köpa.

**Acceptance Criteria:**

**Givet** inköpslistan
**När** listan visas
**Så** har varje rad en liten soptunna med minst 44 px tryckyta och namnet "Ta bort <vara>"

**Givet** att Pontus inte har tagit bort något på en stund
**När** Pontus trycker på en soptunna
**Så** visas en kontrollfråga, och varan tas bort först när Pontus bekräftar

**Givet** att Pontus nyss har bekräftat en borttagning (inom ungefär en minut)
**När** Pontus trycker på en ny soptunna
**Så** tas varan bort direkt utan kontrollfråga, och tiden räknas om från den senaste borttagningen. När ingen soptunna har tryckts på en stund kommer kontrollfrågan tillbaka

**Givet** en vara som kommer från ett recept på matsedeln
**När** den tas bort
**Så** döljs den för veckan (den räknas inte fram igen), medan en egen vara tas bort helt

**Givet** lagersaldot (skafferiet, kylen, frysen)
**När** Pontus trycker på en soptunna på en rad
**Så** gäller samma kontrollfråga och samma minut som på inköpslistan (en borttagning i ena räknas i andra), och "Ångra" finns kvar efter borttagningen

### Story 13.2: Ta bort recept

Som Pontus,
vill jag kunna ta bort ett recept där jag ser det,
så att biblioteket inte fylls av rätter jag inte vill ha.

**Acceptance Criteria:**

**Givet** receptvyn och receptbiblioteket
**När** Pontus vill ta bort ett recept
**Så** finns en synlig soptunna, med samma smarta kontrollfråga som i 13.1, och receptet tas bort och försvinner från biblioteket och framtida matsedlar enligt hur borttagning fungerar i dag

### Story 13.3: Matsedeln har det som behövs

Som Pontus,
vill jag att matsedeln låter mig planera veckan utan omvägar,
så att jag kan lägga till, flytta, ändra och ta bort rätter enkelt.

**Acceptance Criteria:**

**Givet** matsedeln
**När** Pontus planerar veckan
**Så** kan Pontus lägga till en rätt, ta bort en rätt med soptunna och samma kontrollfråga, ändra portioner och flytta en rätt till en annan dag, och inköpslistan följer med

**Givet** en genomgång av matsedeln mot PRD:n och Pontus flöden
**När** något saknas eller är krångligt
**Så** rättas det i storyn eller skrivs som ett förslag till Pontus

### Story 13.4: Markera som lagad

Som Pontus,
vill jag markera en rätt på matsedeln som lagad och få ingredienserna dragna från lagret,
så att lagersaldot stämmer utan att jag räknar själv.

**Acceptance Criteria:**

**Givet** en rätt på matsedeln (och slutet av stegläget)
**När** Pontus trycker "Markera som lagad"
**Så** visas ett ark med de varor som dras från lagret, skalade efter portionerna, med föreslagen ny mängd per vara som Pontus kan ändra eller hoppa över

**Givet** en receptrad som inte går att räkna om mot lagret (annan enhet eller ingen mängd)
**När** arket visas
**Så** står den som "Kontrollera själv" och dras inte av automatiskt, och appen gissar aldrig

**Givet** att Pontus bekräftar
**När** avdraget görs
**Så** uppdateras lagret, rätten visas som lagad på matsedeln och räknas inte längre in i inköpslistan, och "Ångra" återställer både lagret och rätten

### Story 13.5: Dagar på matsedeln

Som Pontus,
vill jag lägga rätterna på veckans dagar och flytta dem mellan dagar,
så att jag ser veckan i överblick och vet vad vi äter när.

**Acceptance Criteria:**

**Givet** matsedeln för en vecka
**När** den visas
**Så** är rätterna grupperade under måndag–söndag, och rätter utan dag ligger under "Ingen dag än"

**Givet** en rätt på matsedeln
**När** Pontus väljer "Flytta till dag" (eller lägger till en ny rätt)
**Så** kan en dag väljas, flera rätter kan ligga samma dag, och inköpslistan påverkas inte av vilken dag rätten ligger på

**Givet** befintliga matsedlar
**När** ändringen går live
**Så** behåller alla rätter sina data och hamnar under "Ingen dag än", och "Markera som lagad", portioner, soptunna och tidigare veckor fungerar som förut

### Story 13.6: Idag och datum på matsedeln

Som Pontus,
vill jag se dagens datum vid varje dag och en lugnare markering av idag,
så att veckan känns som en kalender och dagens middag syns utan att texten skriker.

**Acceptance Criteria:**

**Givet** veckovyn på matsedeln
**När** den visas
**Så** står varje dag med stor begynnelsebokstav ("Måndag"), inte med versaler, och datumet ligger diskret efter dagens namn i dämpad text ("Måndag · 26 okt"), räknat måndag–söndag i svensk tid

**Givet** dagens veckodag
**När** matsedeln visas
**Så** har den dagens sektion ett tunt accentstreck till vänster och en liten ljus "Idag"-pill efter datumet, och en tom dag ("Ledig") eller rättkort på dagen får samma dämpade markering, och sektionen har `aria-current="date"`

**Givet** 375 px bredd, mörkt läge eller 200 % text
**När** veckovyn visas
**Så** blir ingenting avklippt eller sidledes, tryckytorna är minst 44 px, och "Ingen dag än", "Flytta till dag", "Markera som lagad", portioner, soptunna, "Lägg till rätt" och "Ledig"-raderna fungerar som förut

## Epic 14: Tydligare flöden

Pontus förstod inte hur listan kommer till butiken, och erbjudandevyn har blivit rörig när funktionerna lagts på varandra.

### Story 14.1: Erbjudandevyn städas

Som Pontus,
vill jag att veckans erbjudanden är lugna och lätta att läsa,
så att jag hittar fynden utan att drunkna i knappar.

**Acceptance Criteria:**

**Givet** arket Veckans erbjudanden med en eller flera butiker
**När** arket visas i 375 px
**Så** finns en tydlig ordning: butik och vecka, en rad med Hämta och filter/sortering samlade, AI-förslagen som ett eget kort, och sedan listan, utan dubbla rader med knappar

**Givet** alla funktioner från 9.1–9.15
**När** vyn städas
**Så** finns de kvar (hämta valda/alla, bästa butik, AI-förslag per butik, sortering, butiksfilter, välj till inköpslistan, rabatt), och tryckytor, mörkt läge och tillgänglighet håller

### Story 14.2: Skicka listan till butiken tydligare

Som Pontus,
vill jag förstå hur inköpslistan kommer till ICA eller en annan butik och kunna dela den som vanlig text,
så att jag kan handla där jag vill.

**Acceptance Criteria:**

**Givet** inköpslistan
**När** Pontus trycker på knappen för butiken
**Så** heter den "Kopiera till <kedja>-varukorgen", och efter trycket visar ett ark de tre stegen (öppna butikens sajt inloggad, klistra in i Claude in Chrome, granska och beställ själv) med en länk som öppnar butikens sajt

**Givet** inköpslistan
**När** Pontus trycker "Dela listan"
**Så** öppnas telefonens delningsmeny (eller kopieras texten när delning saknas) med en enkel lista per avdelning, till exempel "Gul lök 1 st", utan butiksformatet

## Epic 15: Enklare lokalt

Pontus vill slippa logga in när Matkoll körs på den egna Macen. Inloggningen finns kvar för den publicerade appen.

### Story 15.1: Automatisk inloggning lokalt

Som Pontus,
vill jag vara inloggad direkt när jag öppnar Matkoll på min egen Mac,
så att jag slipper koden varje gång.

**Acceptance Criteria:**

**Givet** att Matkoll körs med `pnpm dev` på localhost och att `.env.local` anger e-post och lösenord för den lokala autoinloggningen
**När** Pontus öppnar appen utan att vara inloggad
**Så** loggas Pontus in automatiskt och hamnar där Pontus skulle ha hamnat efter inloggning

**Givet** en produktionsbygge, Vercel, en annan värd än localhost eller 127.0.0.1, eller att inställningarna saknas
**När** någon öppnar appen
**Så** fungerar inloggningen precis som förut, och den automatiska vägen går inte att nå eller slå på

**Givet** koden och loggarna
**När** autoinloggningen används
**Så** loggas aldrig lösenordet, service role används inte i appen, och ett skript i `scripts/` sätter lösenordet för Pontus lokala användare

### Story 15.2: Inloggad länge på varje enhet

Som Pontus,
vill jag förbli inloggad på telefonen och datorn länge,
så att jag bara behöver ange en kod någon enstaka gång.

**Acceptance Criteria:**

**Givet** att Pontus har loggat in på en enhet
**När** Pontus öppnar appen igen inom 90 dagar
**Så** är Pontus fortfarande inloggad utan kod, och sessionen förnyas tyst medan appen används

**Givet** att Pontus loggar ut eller inte har använt enheten på 90 dagar
**När** appen öppnas
**Så** krävs inloggning igen, och cookies är fortfarande httpOnly, secure i produktion och SameSite=Lax

## Epic 16: Bättre matförslag

Pontus fick AI-förslag från veckans erbjudanden men kunde inte spara dem, och förslagen säger för lite om varför de är bra.

### Story 16.1: Spara och lägga på matsedeln fungerar från förslagen

Som Pontus,
vill jag att "Spara", "Lägg på matsedeln" och att ta bort ett förslag fungerar,
så att jag kan använda förslagen jag gillar.

**Acceptance Criteria:**

**Givet** AI-förslag från veckans erbjudanden, öppnade från jobbets notis eller från Recept
**När** Pontus trycker "Spara" eller "Lägg på matsedeln"
**Så** öppnas förhandsgranskningen och receptet sparas (och läggs på matsedeln), även efter att Pontus har bytt sida och kommit tillbaka

**Givet** ett förslag Pontus inte vill ha
**När** Pontus trycker på förslagets soptunna
**Så** försvinner förslaget ur listan

### Story 16.2: Förslaget säger varför det är bra

Som Pontus,
vill jag se direkt vad ett förslag ger mig,
så att jag snabbt väljer rätt.

**Acceptance Criteria:**

**Givet** ett AI-förslag eller ett recept med erbjudanden
**När** kortet visas
**Så** står en kort rad som "3 på erbjudande · 1 hemma · köp till: potatis", med erbjudandenas rena namn (utan märke och land)

### Story 16.3: Dina egna recept med veckans erbjudanden

Som Pontus,
vill jag att mina egna recept som passar veckans erbjudanden föreslås först, hjärtmarkerade överst,
så att jag lagar det jag redan gillar när det är billigt.

**Acceptance Criteria:**

**Givet** recept i biblioteket och veckans erbjudanden från vald butik
**När** Pontus ber om förslag från erbjudandena
**Så** visas först "Från dina recept": de recept som använder flest erbjudanden, favoriter först, utan AI, och därefter AI-förslagen

### Story 16.4: Ett snyggt recept när förslaget sparas

Som Pontus,
vill jag att ett sparat AI-förslag blir ett komplett och snyggt recept,
så att det ser lika bra ut som mina andra recept.

**Acceptance Criteria:**

**Givet** ett sparat AI-förslag
**När** receptet visas
**Så** har det ingredienser, numrerade steg, tid och portioner, en bildyta med en illustration för rättens huvudråvara när foto saknas, och en rad om vilka varor som var på erbjudande när det sparades

### Story 16.5: Varor utan mängd följer med till varukorgen

Som Pontus,
vill jag att alla varor på inköpslistan kommer med när jag kopierar till varukorgen, även de utan mängd,
så att agenten inte missar persilja och smör.

**Acceptance Criteria:**

**Givet** en inköpslista där några varor saknar mängd (till exempel "Persilja" och "Smör" som saknas hemma)
**När** Pontus kopierar till varukorgen
**Så** finns de med i texten med en tydlig markering, till exempel "mängd: en förpackning, välj minsta vanliga", och agentens instruktion säger att varje rad ska läggas i varukorgen

**Givet** texten
**När** den kopieras
**Så** stämmer antalet varor i texten med antalet varor kvar på listan, och appen visar "6 varor kopierade"

### Story 16.6: Lugnare erbjudanderader

Som Pontus,
vill jag att erbjudandelistan är ren och tilltalande, med Toppklipp och elden kvar men utan blaffiga färgblock,
så att det är lätt att skumma veckans fynd.

**Acceptance Criteria:**

**Givet** erbjudandelistan med flera butiker
**När** raderna visas
**Så** är butiksbrickan diskret (till exempel liten text med en färgprick i kedjans färg) i stället för ett starkt rött block, och den syns bara när listan visar mer än en butik

**Givet** ett erbjudande med pris, ordinarie pris och rabatt
**När** raden visas
**Så** står priset som ren fet text, ordinarie pris och rabatt på en rad under ("29,90 kr · −50 %"), och Toppklipp med 🔥 som en liten tonad etikett, så att raden är lika hög som en vanlig listrad och kolumnen till höger inte staplar tre block

### Story 16.7: Varför veckans bästa butik

Som Pontus,
vill jag se vilka erbjudanden som gör en butik till veckans bästa,
så att "1 erbjudande passar det du brukar laga" inte lämnar mig nyfiken.

**Acceptance Criteria:**

**Givet** veckans bästa butik
**När** den räknas
**Så** returnerar `bestStore` också vilka erbjudanden som passade, med id och städat namn (via `offerDisplay`)

**Givet** raden "Bäst denna vecka"
**När** den visas
**Så** nämner den dem: "Bäst denna vecka: ● Maxi – falukorv och grädde passar det du brukar laga", vid fler än tre "falukorv, grädde, lök +2", och med en enda kort fras när skälen skiljer sig (hemma eller i recept)

**Givet** arkets butiksmärken
**När** de visas
**Så** används den lugna pricken från 16.6 i stället för den fyllda röda brickan, även i raden "Bäst denna vecka" och i Hämta-panelen

**Givet** raden
**När** Pontus trycker på "Visa"
**Så** filtreras listan till de passande erbjudandena, med "Visa alla" som väg tillbaka

**Givet** listan
**När** ett erbjudande passar det Pontus lagar eller har hemma (samma matchning som `bestStore`)
**Så** har dess metarad en diskret, dämpad "Passar dig" utan färgblock, läsbar för skärmläsare

**Givet** mörkt läge, 375 px och 44 px-mål
**När** arket visas
**Så** håller layouten utan sidscroll

### Story 16.8: Hämta ersätter och tydliga filter

Som Pontus,
vill jag att en ny hämtning ersätter de gamla erbjudandena och att filtren förklarar sig själva,
så att jag aldrig ser erbjudanden från butiker jag just valt bort och förstår vad varje val gör.

**Acceptance Criteria:**

**Givet** en butik som hämtas igen
**När** hämtningen lyckas
**Så** ersätter den butikens gamla erbjudanden från länken, utan dubbletter

**Givet** "Hämta valda" med färre butiker än alla (eller en enda butik)
**När** minst en vald butik hämtades
**Så** tas övriga butikers erbjudanden bort (`clear_other_store_offers`), men aldrig när alla val misslyckades, och "Hämta alla" behåller allt

**Givet** arket med erbjudanden
**När** det visas
**Så** finns ingen "Filter"-knapp: verktygsraden har "Hämta" och "Välj", och två märkta rader "Visa butik: Alla · Maxi · Krokom" (vid två butiker med erbjudanden) och "Sortera: Avdelning · Bäst rabatt" (när något erbjudande har rabatt)

**Givet** kortet med AI-förslag och två butiker
**När** det visas
**Så** står "Föreslå rätter från:" ovanför butiksvalet inne i kortet

### Story 16.9: Kompakt topp i erbjudandearket

Som Pontus,
vill jag att toppen av erbjudandearket är lugn, kompakt och tydlig,
så att listan börjar högt upp och inget är för stort eller blaffigt.

**Acceptance Criteria:**

**Givet** arket med erbjudanden
**När** det visas
**Så** är "Hämta" och "Välj" små textknappar (44 px träffyta), och raderna "Visa butik:" och "Sortera:" har kompakta pillrar (32 px synlig höjd) på en rad som scrollar i sidled vid behov, utan sidoöverflöd vid 375 px

**Givet** kortet med AI-förslag
**När** det visas
**Så** har det högst tre rader utan ram: "Bäst denna vecka: ● Maxi – Falukorv passar dina recept · Visa" (länken blir "Visa alla" när den är aktiv), "Från: Maxi · Krokom" (bara med 2+ butiker) och en kompakt knapp "Föreslå rätter"

**Givet** ett erbjudande som "scan falukorv"
**När** det nämns på bästa-butik-raden
**Så** står det "Falukorv": varumärket är borta och första bokstaven versal

**Givet** filtret "Visa" på bästa-butik-raden
**När** det är på
**Så** står "Visar 1 av 157 erbjudanden · Visa alla" i sammanfattningen

**Givet** en pill eller knapp som trycks med pekare
**När** den får fokus
**Så** syns ingen fokusring; med tangentbord syns en enkel ring (inte dubbel) på pillen

### Story 16.10: Tips, filter och AI var för sig

Som Pontus,
vill jag att tipset, listfiltret och AI-förslagen är tre skilda saker på tre ställen,
så att jag förstår varje sak utan förklaring.

**Acceptance Criteria:**

**Givet** arket med erbjudanden
**När** det visas
**Så** står det i ordningen sammanfattning, "Hämta"/"Välj", "Visa butik:" och "Sortera:", en tipsmening, knappen "✨ Föreslå rätter" och listan; AI-kortets ruta och butikspillren "Från:" är borta, och butiksfiltret finns bara i raden "Visa butik:"

**Givet** att minst två butiker har erbjudanden, eller att ett tips nämner matchande erbjudanden
**När** tipset visas
**Så** är det en mening utan andra kontroller än en länk: "💡 Maxi passar dig bäst den här veckan: Falukorv finns i dina recept" (skäl enligt 16.7: "finns i dina recept", "har du hemma", "passar det du brukar laga"); med en enda butik "💡 Falukorv finns i dina recept"; under den länken "Visa bara de erbjudandena", som blir "Visa alla erbjudanden" när filtret är på

**Givet** knappen "✨ Föreslå rätter" (✨ är `aria-hidden`)
**När** jag trycker den med två eller fler butiker
**Så** öppnas "Föreslå rätter från vilken butik?" med ett stort radioval per butik (bästa butiken förvald och märkt "– passar dig bäst") och knappen "Föreslå rätter" startar jobbet med `storeId`; "Tillbaka" och Esc går tillbaka till listan; med en butik startar jobbet direkt

**Givet** allt från 9.13 till 16.9 (Hämta ersätter, filter, sortering, "Passar dig", urvalsläge, besparingar, "Från dina recept")
**När** jag använder arket
**Så** fungerar det som förut, även i mörkt läge, utan sidoöverflöd vid 375 px, med 44 px träffytor och fokusring bara med tangentbord

### Story 16.11: Ordnad topp i erbjudandearket

Som Pontus,
vill jag att toppen av erbjudandearket är lagd i snygga rader med avdelare, jämna avstånd och rätt storlek på varje del,
så att den känns lugn och ordnad i stället för stökig och brusig.

**Acceptance Criteria:**

**Givet** arket med erbjudanden
**När** det visas
**Så** står det uppifrån och ned: en rubrikgrupp (titel med "Klar" till höger, en metarad "2 butiker · v. 44 · 157 erbjudanden · 🔥 18 Toppklipp" och raden "Hämtade idag 13:30 · Hämta igen"), en avdelare, ett inspirationskort (tipset, länken "Visa bara de erbjudandena" till vänster och en kompakt "✨ Föreslå rätter" till höger), en avdelare, kontrollerna, en listrad ("157 erbjudanden" eller "Visar 3 av 157" och "Välj") med ett hårstreck, och listan; raden Hämta/Välj är borta och avståndet mellan grupperna är 16 px

**Givet** "Visa butik" och "Sortera"
**När** de visas
**Så** är de en tvåkolumnsrad med en gemensam etikettkolumn, så att båda segmenten börjar på samma x, och ett riktigt segmenterat val (en rundad ram, lika höga segment om 32 px, 44 px träffyta, valt segment i accentfärg), som är radiogrupper med namn

**Givet** att arket öppnas
**När** det sker med en peksättning
**Så** hamnar fokus på titeln och "Klar" får ingen fokusring; ringen visas bara med `:focus-visible`

**Givet** allt från 9.13 till 16.10
**När** jag använder arket
**Så** fungerar det som förut, även i mörkt läge, utan sidoöverflöd vid 375 px

### Story 16.12: Kryssrutor alltid framme

Som Pontus,
vill jag att erbjudandelistan alltid har sina kryssrutor framme, utan "Välj"/"Klar" och utan "Visa dessa", och att rutorna är riktiga kryssrutor,
så att jag kan plocka direkt och inte tar dem för radioknappar.

**Acceptance Criteria:**

**Givet** tipskortet i erbjudandearket
**När** det visas
**Så** har det tipsmeningen och "✨ Föreslå rätter" (höger under meningen) men ingen "Visa dessa"/"Visa alla" och ingen "Visar N av M"; "Passar dig" står kvar på raderna

**Givet** att det går att lägga i inköpslistan
**När** listan visas
**Så** har varje erbjudanderad alltid sin kryssruta, utan "Välj"/"Klar"; listraden har bara "N erbjudanden" till vänster; "Lägg N i inköpslistan" syns när minst en är ikryssad; rader som redan ligger på listan har "På listan" och en avstängd ruta; går det inte att lägga till visas inga rutor

**Givet** en kryssruta
**När** den visas
**Så** är den kvadratisk (22 px, 6 px rundade hörn, 2 px ram i dämpad ink), ikryssad med accentfyllning och vit bock, med 44 px träffyta och rollen checkbox med samma namn som förut; den är en delad komponent, och de runda cirklarna i inköpslistan ("i korgen") är oförändrade
