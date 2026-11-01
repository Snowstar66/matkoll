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

#### Story 1.15: Import sparas direkt

Som Pontus,
vill jag att ett importerat recept hamnar direkt i Recept,
så att jag slipper ett onödigt steg med förhandsgranskning och inte tappar ett recept som blev klart medan jag gjorde något annat.

**Acceptance Criteria:**

**Givet** en import från länk, bokmärket `?url=`, delningsmenyn, inklistrad text eller foto
**När** inläsningen är klar
**Så** sparas receptet av jobbet självt med de förval förhandsgranskningen hade (rader matchade mot katalogen, nya ingredienser med föreslagen avdelning, plats och enhet), med jobbets id som receptets id, så att en omkörning eller dubbel avläsning aldrig ger en kopia, och jobbets resultat får `savedRecipeId`

**Givet** ett sparat importrecept
**När** appen ser att jobbet är klart (på vilken sida som helst, även efter att den varit stängd)
**Så** visas "Receptet <titel> är sparat" med "Öppna" (receptet, där "Ändra recept" finns) och "Ångra" (det befintliga raderingsanropet), receptet finns i biblioteket direkt och jobbet stängs

**Givet** ett klart importjobb som aldrig sparades (jobbet kunde inte spara, eller det blev klart före den här storyn)
**När** appen öppnas
**Så** sparas det med samma id och samma förval, och bekräftelsen visas, så att inget inläst recept försvinner

**Givet** en import som misslyckas (sajten ej godkänd, hämtning blockerad, ogiltigt AI-svar)
**När** jobbet är klart
**Så** sparas inget, och på Recept står ett kvarstående meddelande med orsaken och "Stäng" tills Pontus stänger det

**Givet** arket Importera recept
**När** jobbet det väntar på blir klart
**Så** stängs arket (ingen förhandsgranskning), och flikarna, "Avbryt", "Försök igen" och felmeddelandena fungerar som förut

#### Story 1.16: Kompakt vy och sortering i Recept

Som Pontus,
vill jag kunna växla mellan kort och en kompakt lista och sortera recepten,
så att jag ser fler recept på en gång och hittar rätt snabbare.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/recept-vyer.html`

**Acceptance Criteria:**

**Givet** receptbiblioteket
**När** jag ser raden under filterpillren
**Så** står antalet recept ("12 recept"), en sorteringsknapp med vald sortering ("Senast tillagda ▾") och en växel med två lägen, Kortvy och Kompakt vy (ikoner ▦ och ☰, tillgängliga namn och `aria-pressed`)

**Givet** växeln
**När** jag väljer Kompakt vy
**Så** visas recepten som en grupperad lista: liten bild (48 px), titel på en rad med ellips, metarad "25 min · 4 port. · Kan lagas nu" (eller "Saknar 2") och hjärtat med 44 px träffyta; ett tryck på raden öppnar receptet, och valet sparas på enheten på samma sätt som filterpillret (med minnet som reserv)

**Givet** kortvyn och den kompakta vyn
**När** jag ser ett recept
**Så** finns ingen papperskorg på kortet eller raden; att ta bort ett recept görs från receptets ⋯-meny som finns idag

**Givet** sorteringsknappen
**När** jag trycker på den
**Så** öppnas ett ark "Sortera" med Senast tillagda (förval), Snabbast (kortast tid först, recept utan tid sist), Mest hemma (minst antal saknade varor först) och A–Ö (svensk sortering), med en bock vid valet; valet gäller direkt, sparas på enheten och fungerar tillsammans med sök och filterpillren

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser båda vyerna och arket
**Så** finns ingen sidledes rullning och alla mål är minst 44 px

#### Story 1.17: Kategorier i Recept

Som Pontus,
vill jag kunna filtrera recepten på Kött, Fågel, Fisk & skaldjur, Vegetariskt och vanliga rätttyper,
så att jag snabbt hittar något när jag vet vad jag är sugen på.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/recept-vyer.html`

Beslut (2026-10-31): kategorin räknas fram med regler, utan AI-anrop (den lokala modellen är långsam) och utan ny kolumn. Om reglerna gissar fel kan manuell ändring läggas till senare.

**Acceptance Criteria:**

**Givet** ett recept med titel, ingrediensnamn och tid
**När** kategorin räknas fram i domänlagret (en ren funktion, inget AI-anrop, ingen migrering)
**Så** får receptet exakt en huvudråvara (Kött, Fågel, Fisk & skaldjur eller Vegetariskt när inget kött, fågel eller fisk finns), noll eller flera rätttyper (Pasta, Soppa, Sallad, Gryta) från titel och ingredienser, och Snabbt när tiden är högst 30 minuter; buljong, fond och liknande smaksättare räknas inte som råvara

**Givet** reglerna
**När** enhetstesterna körs
**Så** täcker de svenska exempel som "Caesarkyckling med rostade rotfrukter" (Fågel, Sallad), "Korv stroganoff" (Kött, Gryta), "Spagettipumpa" (Vegetariskt om ingen köttråvara finns), laxpasta (Fisk & skaldjur, Pasta), en grönsakssoppa på kycklingbuljong (Vegetariskt, Soppa) och recept utan tid (inte Snabbt)

**Givet** receptbiblioteket
**När** jag ser raden under filterpillren
**Så** finns en rad med kategorichips som rullar i sidled (Kött, Fågel, Fisk & skaldjur, Vegetariskt, Pasta, Soppa, Sallad, Gryta, Snabbt), var och en med en liten ikonruta som kategoriernas i Inköpslista, och sidan själv rullar aldrig i sidled

**Givet** kategorichipsen
**När** jag trycker på ett chip
**Så** visas bara recept i den kategorin, chipet markeras (`aria-pressed`), antalet uppdateras, ett nytt tryck släpper valet, och kategorin fungerar tillsammans med Alla/Favoriter/Kan lagas nu, sök och sortering; valet sparas på enheten som filterpillret

**Givet** en kategori utan träffar
**När** listan är tom
**Så** står "Inga recept i Fågel." med knappen "Visa alla", som släpper kategorin

**Givet** sorteringsarket från Story 1.16
**När** det öppnas
**Så** finns kategorierna också där under rubriken "Kategori"

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser chipsen
**Så** finns ingen sidledes rullning av sidan, alla mål är minst 44 px och kontrasten håller

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

### Story 3.10: Lugn topp i inköpslistan

Som Pontus,
vill jag ha en lugn övre del i inköpslistan med veckorna som flikar,
så att jag ser vilken vecka listan gäller och inte tror att listan är trasig när en annan vecka har rätter.

**Acceptance Criteria:**

**Givet** inköpslistan
**När** jag ser toppen
**Så** finns samma tre veckoflikar som i Matsedel ("v. 44 · Denna vecka", "v. 45 · Nästa", "v. 46 · Om 2 v") i stället för den stora listrutan, med antal rätter eller "–", och vald vecka markerad

**Givet** veckoflikarna
**När** jag trycker på en flik
**Så** räknas listan för den veckan med samma adress (`?vecka=2026-W45`) som förut, och en vecka längre fram i adressen fungerar och får en fjärde, vald flik

**Givet** fler än ett lager
**När** jag ser raden under flikarna
**Så** står där "Lager: Hemma · Byt" som en lugn metarad i sidans vänsterkant, där "Byt" är en liten textlänk med 44 px träffyta

**Givet** en vald vecka utan rätter där en annan av de tre veckorna har rätter
**När** jag ser listan
**Så** står där "Vecka 44 har inga rätter än." och knappen "Visa vecka 45 (2 rätter)"

**Givet** att ingen av veckorna har rätter
**När** jag ser listan
**Så** står den vanliga texten kvar med en knapp "Gå till Matsedel"

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser toppen
**Så** finns ingen sidledes rullning, alla mål är minst 44 px och flikarna har tillgängliga namn

#### Story 3.11: Lugn veckovy i Matsedel

Som Pontus,
vill jag se veckan som en lugn lista med en rad per dag och de sällan använda knapparna bakom ⋯,
så att jag direkt ser vad vi äter och inte drunknar i knappar.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matsedel-lugn.html`

**Acceptance Criteria:**

**Givet** en vecka med rätter
**När** jag ser Matsedel
**Så** ligger veckans dagar i ett enda vitt kort (grupperad lista) där varje rad har samma form: veckodag och datum till vänster ("LÖR" / "31"), bild, titel och en metarad ("60 min · 4 port."), och fler rätter samma dag får varsin rad med dagen bara på den första

**Givet** en rätt där allt finns hemma
**När** jag ser raden
**Så** står "✓ Allt hemma" som mintfärgad text i metaraden och ingen mätare visas; saknas något står "1 av 11 hemma" i sandfärg med en tunn mätare under

**Givet** en rad med en rätt
**När** jag trycker på ⋯ (44 px, tillgängligt namn "Fler val för <titel>")
**Så** öppnas ett ark med rättens bild, titel, dag och tid, länken "Öppna receptet", portioner med − och +, huvudknappen "Markera som lagad" (eller den lagade rättens befintliga läge), "Flytta till annan dag" med nuvarande dag, och "Ta bort från matsedeln" med samma bekräftelse och ångra som idag; ett tryck på själva raden öppnar receptet som förut

**Givet** dagens datum
**När** jag ser listan
**Så** har dagens rad en mintfärgad kant till vänster, dag och datum i accentfärg och etiketten "Idag" i metaraden, utan den böjda ramen

**Givet** dagar som har passerat
**När** jag ser listan
**Så** är deras rader mindre och nedtonade, tomma passerade dagar visas inte, en lagad rätt visar "✓ Lagad", och en olagad rätt har en liten knapp "Lagad?" som gör samma sak som "Markera som lagad"

**Givet** en tom dag idag eller framåt
**När** jag ser listan
**Så** står "+ Lägg till" i raden och öppnar samma flöde som "Välj recept" gör idag för den dagen; "Välj recept" visas inte längre på dagar som redan har en rätt (fler rätter samma dag läggs till via "+" i rubriken)

**Givet** veckovyn
**När** jag ser sidan
**Så** finns inte längre de stora knapparna "Lägg till rätt" och "Visa inköpslistan" längst ner; i stället finns en lugn rad ovanför listan med 🛒, antalet varor som saknas för veckan om det finns tillgängligt utan extra tung beräkning (annars "Inköpslista för vecka 44") och ›, som leder till inköpslistan för samma vecka; den tomma matsedeln ser ut som förut

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser veckovyn och arket
**Så** finns ingen sidledes rullning, alla mål är minst 44 px och knappar och rader har tillgängliga namn

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

### Story 4.3: Visa vilka varor som saknas

Som Pontus,
vill jag se vilka varor som saknas i receptet och inte bara hur många,
så att jag vet vad jag ska köpa utan att leta bland raderna.

**Acceptance Criteria:**

**Givet** ett recept där varor saknas hemma
**När** receptvyn visas
**Så** står "Saknar: tryffelolja" (vid fler än två "Saknar: tryffelolja, persilja +1") i stället för "Saknar N varor", med ingrediensernas katalognamn i gemener, och "X av Y hemma" står kvar

**Givet** chippen "Saknar: …"
**När** Pontus trycker på den
**Så** rullar vyn mjukt till ingredienserna och första saknade raden får fokus

**Givet** en ingredienslista
**När** en rad saknas
**Så** har den ett lugnt "Saknas" under namnet, medan rader som finns hemma ser ut som förut

**Givet** receptkortet i biblioteket
**När** något saknas
**Så** står "Saknar N varor" kvar som synlig text, men märkets tillgängliga namn och title listar varorna ("Saknar: tryffelolja")

**Givet** ändrade portioner, mörkt läge, 375 px och stor text
**När** receptvyn visas
**Så** följer namnen portionerna, inget går utanför sidan och chippen är minst 44 px hög

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

### Story 13.7: Planera kommande veckor

Som Pontus,
vill jag kunna planera nästa och kommande veckors matsedlar redan denna vecka,
så att jag kan handla och laga efter en plan som ligger längre fram än söndag.

**Acceptance Criteria:**

**Givet** matsedeln
**När** den visas
**Så** står "‹ Vecka 44 ›" under rubriken med "Denna vecka", "Nästa vecka" eller "Om 2 veckor" under veckonamnet, och "Idag" tar tillbaka till denna vecka när en annan vecka visas

**Givet** att jag bläddrar framåt
**När** jag går från denna vecka
**Så** kan jag gå minst 8 veckor fram (12), medan "‹" på denna vecka inte finns: tidigare veckor ligger kvar i Tidigare (3.2) och dubbleras inte

**Givet** en kommande vecka utan matsedel
**När** den visas
**Så** syns veckans sju dagar med "Ledig"-rader och "Lägg till rätt", och matsedeln skapas först när den första rätten läggs dit

**Givet** en vecka i matsedeln
**När** sidan laddas om eller länken delas
**Så** ligger veckan i adressen (`?vecka=2026-W45`, ett datum fungerar också) och en ogiltig eller för gammal vecka visar denna vecka

**Givet** en kommande vecka
**När** datumen visas
**Så** räknas de från den veckans måndag, och "Idag" markeras bara i denna vecka

**Givet** en visad vecka
**När** jag lägger till en rätt, väljer dag, flyttar, ändrar portioner, tar bort eller markerar lagad
**Så** gäller det den veckans matsedel och ingen annan

**Givet** AI-förslag och "Från dina recept"
**När** jag lägger en rätt på matsedeln därifrån
**Så** hamnar den i denna veckas matsedel som förut

**Givet** att en ny vecka börjar
**När** måndagen kommer
**Så** blir den planerade veckan automatiskt denna vecka, och den gamla veckan ligger under Tidigare

**Givet** inköpslistan
**När** den öppnas
**Så** räknas den för denna vecka som förut, och en veckoväljare ("Vecka 44 · Denna vecka", "Nästa vecka" och veckorna därefter) räknar listan för vald veckas matsedel minus lagret, med egna bockar, dolda rader och egna varor per matsedel, så att veckorna aldrig blandas

**Givet** mina befintliga matsedlar och bockar
**När** migreringen körs
**Så** finns alla rätter, bockar, egna varor och dolda rader kvar och den matsedel som gällde är denna vecka

**Givet** 375 px bredd, mörkt läge eller 200 % text
**När** veckonavigeringen och veckoväljaren visas
**Så** blir ingenting avklippt eller sidledes och tryckytorna är minst 44 px

### Story 13.8: Välj dag och sedan recept

Som Pontus,
vill jag markera en dag i matsedeln och sedan välja receptet till just den dagen,
så att jag kan planera uppifrån och ned, dag för dag, utan att välja dag sist.

**Acceptance Criteria:**

**Givet** matsedeln för vilken vecka som helst
**När** jag trycker på en dag ("Ledig"-raden eller dagens rubrik)
**Så** finns "Välj recept", och "Lägg till rätt" finns kvar som alternativ

**Givet** att jag trycker på "Välj recept"
**När** Recept öppnas
**Så** ligger läget i adressen (`/recept?planera=2026-11-04`) och överst står "Lägger på onsdag 4 nov · Avbryt"

**Givet** Recept i planeringsläge
**När** jag ser receptkorten och receptsidan
**Så** har korten en snabbknapp "Lägg på onsdag" och receptsidans primärknapp "Lägg på matsedeln" heter "Lägg på onsdag"

**Givet** att jag trycker på "Lägg på onsdag"
**När** rätten läggs till
**Så** hamnar den på den dagen i rätt veckas matsedel, matsedeln öppnas på den veckan (`?vecka=…`) med dagen markerad en kort stund och en bekräftelse säger "Lagt på matsedeln, onsdag.", och läget är slut

**Givet** planeringsläget
**När** jag trycker på "Avbryt"
**Så** lämnas läget och Recept visas som vanligt

**Givet** planeringsläget
**När** jag går mellan receptbiblioteket och ett recept
**Så** ligger läget kvar (adressen), och det tar slut när rätten är tillagd eller jag avbryter

**Givet** AI-förslag och "Från dina recept" i planeringsläge
**När** jag lägger en rätt på matsedeln därifrån
**Så** hamnar den på den valda dagen och veckan, annars som förut

**Givet** 375 px bredd, mörkt läge eller 200 % text
**När** planeringsfältet, korten och knapparna visas
**Så** blir ingenting avklippt eller sidledes och tryckytorna är minst 44 px

### Story 13.9: Veckoöversikt och kopiera vecka

Som Pontus,
vill jag se denna vecka och de två närmaste som små flikar med antal inplanerade rätter, och kunna kopiera en tidigare vecka till en ny,
så att jag snabbt ser vad som är planerat och slipper börja om när jag var nöjd med en gammal vecka.

**Acceptance Criteria:**

**Givet** Matsedel
**När** sidan öppnas
**Så** visar en enda rad tre veckoflikar, denna vecka, nästa och veckan efter, var och en med veckonummer ("v. 44"), en kort text ("Denna vecka", "Nästa", "Om 2 v") och antal rätter (🍽 3, eller ett dämpat "–" när veckan är tom), och den visade veckan är markerad med accentfärg

**Givet** veckoflikarna
**När** jag trycker på en flik
**Så** visas den veckan och `?vecka=` ligger kvar i adressen; antalen läses med en enda fråga; veckor längre fram nås fortfarande via `?vecka=` och får en egen vald flik

**Givet** Matsedels rubrik
**När** den visas
**Så** finns ingen "Tidigare"-knapp, inga ‹ ›-pilar, ingen "Idag"-länk och ingen versal "VECKA 45"-etikett; en diskret länk "Tidigare veckor" leder till tidigare matsedlar och "Lager: …" är kvar, liten

**Givet** en tidigare vecka
**När** jag trycker på "Kopiera till …" och väljer Denna vecka, Nästa vecka eller Om 2 veckor
**Så** kopieras alla rätter med recept, titel, portioner och veckodag till den veckans matsedel (efter de rätter som redan finns) i en transaktion (`copy_meal_plan`), jag hamnar på den veckan och en bekräftelse säger "Kopierade 5 rätter till vecka 46"; rätter vars recept är borttaget följer inte med, som vid "Använd igen"

**Givet** 375 px bredd, mörkt läge eller 200 % text
**När** flikarna och kopieringsvalet visas
**Så** blir ingenting avklippt eller sidledes, tryckytorna är minst 44 px och flikarna har tillgängliga namn ("Vecka 45, nästa vecka, 3 rätter")

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

### Story 14.3: Snyggare delad lista

Som Pontus,
vill jag att listan jag delar via SMS eller mail ser ut som en riktig inköpslista med rutor,
så att den är trevlig att handla från för den som får den.

**Acceptance Criteria:**

**Givet** "Dela listan" i inköpslistan
**När** texten byggs
**Så** börjar den med "🛒 Inköpslista v. 44" (vald vecka), följt av en tom rad, och varje avdelning har sin ikon från kategorirutorna och namnet i versaler ("🥬 FRUKT & GRÖNT")

**Givet** en avdelning
**När** varorna skrivs ut
**Så** står varje obockad vara på en egen rad som "☐ Gul lök 2 st" (en vag rad är bara namnet), med en tom rad mellan avdelningarna; avbockade och dolda varor är inte med, och en tom lista ger samma tomma läge som idag

**Givet** delningen
**När** telefonen inte har delningsmenyn
**Så** kopieras samma text som idag, och kopiera till varukorg (butikens exportformat) är oförändrat

### Story 14.4: Som i skissen – tydlig vyväxel, två kolumner och färgade ikoner

Som Pontus,
vill jag att Recept och menyn ser ut som i den godkända skissen,
så att jag hittar växeln mellan kort och lista och appen känns lika trevlig som skissen.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/recept-vyer.html` och `matkoll-mobil.html` (menyn). Rättar avvikelser från Story 1.16.

**Acceptance Criteria:**

**Givet** raden "5 recept · Senast tillagda ▾" i Recept
**När** jag ser den på telefon och dator
**Så** finns till höger ett tydligt segmenterat val med text och ikon, "▦ Kort" och "☰ Lista", byggt med samma segmenterade komponent som erbjudandearket (rundad ram, lika höga segment, valt segment i accentfärg, 44 px träffyta, radiogrupp med namnet "Vy")

**Givet** kortvyn på en telefon (375–430 px)
**När** recepten visas
**Så** ligger korten i två kolumner som i skissen (bild ca 104 px hög, titel högst två rader, metarad i metastorlek, märke och hjärta kvar), utan sidledes rullning, även vid 200 % text där de får falla till en kolumn

**Givet** menyn (flikraden på telefon och sidomenyn på dator)
**När** den visas
**Så** har varje mål en färgad ikon som i skissen – 📖 Recept, 📅 Matsedel, 🛒 Inköpslista, 🧊 Lagersaldo, ⚙️ Inställningar – där inaktiva ikoner är gråskaliga och något nedtonade och den aktiva visas i full färg med etikett i accentfärg; märken (antal) och tillgängliga namn fungerar som förut

**Givet** mörkt läge
**När** jag ser Recept och menyn
**Så** håller kontrasten och ikonerna syns

**Givet** kategorichipsen i Recept (Story 1.17)
**När** de visas på telefon och dator
**Så** visas bara kategorier som minst ett recept i hela biblioteket tillhör (räknat mot alla recept, inte aktuellt filter eller sökning, så chipsen inte hoppar), den valda kategorin ligger kvar även om den inte har några recept, chipsen bryts över flera rader i stället för att rulla i sidled, och raden döljs när inget recept har någon kategori

**Givet** en passerad dag i Matsedel med en olagad rätt
**När** raden visas på 390 px
**Så** bryts titeln aldrig mitt i ett ord: "Lagad?" ligger som en liten chip under metaraden och titeln får hela radbredden bredvid ⋯

### Story 14.5: Lugnt veckoval

Som Pontus,
vill jag att veckovalet i Matsedel och Inköpslista är en lugn segmenterad kontroll i stället för tre stora brickor,
så att det passar in i gränssnittet och inte tar så mycket plats.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/veckoval.html`, variant **A1** (vald av Pontus 2026-10-31), plus en ikonruta 📅 i raden under skenan (Pontus: "kanske någon ikon"). Ersätter brickorna från Story 13.7/13.9 och 3.10; funktionen är densamma.

**Acceptance Criteria:**

**Givet** Matsedel och Inköpslista
**När** jag ser toppen
**Så** finns i stället för de tre brickorna en grå skena (hairline-bakgrund, 14 px rundning, 3 px inre marginal) med tre lika breda segment; vald vecka är ett vitt, lätt upphöjt segment (surface med liten skugga), de andra ligger platt på skenan; inget segment är helgrönt

**Givet** ett segment
**När** det visas
**Så** står etiketten på första raden ("Denna vecka", "Nästa", "Om 2 v") i 16 px halvfet och antalet på andra raden i 13 px ("3 rätter", "1 rätt", "Tom"), där vald veckas antal är i accentfärg; ingen 🍽-ikon; hela segmentet har minst 44 px träffyta och ett tillgängligt namn som "Vecka 44, denna vecka, 3 rätter"

**Givet** raden under skenan
**När** den visas
**Så** står en liten ikonruta 📅 (24 px, mint bakgrund, samma stil som 🛒-rutan på inköpsraden och kategoriernas rutor) följd av "v. 44 · 27 okt – 2 nov" (vald vecka och dess datum) till vänster i metastorlek och "Tidigare ›" som accentlänk till höger (Matsedel; i Inköpslistan bara om den finns där idag); "Lager: Hemma · Byt" visas bara när det finns fler än ett lager, i samma lugna metastil

**Givet** en vecka längre fram i adressen (`?vecka=2026-W47`)
**När** sidan visas
**Så** får skenan ett fjärde, valt segment, som idag

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser kontrollen
**Så** finns ingen sidledes rullning, texten får radbrytas inom segmentet men aldrig mitt i ett ord, och kontrasten håller

**Givet** byggd story
**När** den lämnas för granskning
**Så** finns skärmbilder av Matsedel och Inköpslista i 390 och 1280 px, ljust och mörkt, jämförda med skissen

### Story 14.6: Lugnare Lagersaldo

Som Pontus,
vill jag att Lagersaldo har samma lugna stil som resten av appen,
så att det är lätt att se vad som finns och sidan inte känns stökig.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagersaldo-lugn.html`, variant **B** (vald av Pontus 2026-10-31), med varuraderna från variant A.

**Acceptance Criteria:**

**Givet** fler än ett ställe
**När** jag ser toppen
**Så** visas ställena som små piller ("Hemma", "Duved") i samma stil som filterpillren; länken "Ställen" ligger inte längre i raden utan nås från Inställningar (där hanteringen redan finns) eller via ett diskret "Hantera" sist i raden; med ett enda ställe visas inga piller

**Givet** platserna Kyl, Frys och Skafferi
**När** jag ser dem
**Så** är de tre kompakta brickor på en rad (ca 48 px höga, surface-bakgrund, 14 px rundning) med en emoji i en ikonruta (🧊 Kyl, ❄️ Frys, 🥫 Skafferi, i stället för linjeikonerna), namnet och antalet ("17 varor"); vald plats har accentram och mint bakgrund; inga stora färgade kort; minst 44 px träffyta och tillgängliga namn som idag

**Givet** fotot av en plats
**När** jag ser sidan
**Så** finns i stället för den stora blå knappen och den fristående raden en lugn rad som inköpsraden i Matsedel: ikonruta 📷, "Fotografera kylen" och under det "Senaste 29 okt 06:46 · Visa" (eller "Inget foto än"), med › ; samma funktioner som idag (fotografera, visa senaste foto)

**Givet** en vara i listan
**När** den visas
**Så** står namnet till vänster och mängden till höger när den finns ("4 st", "500 g"), utan papperskorg och utan "Tillagd …"-texten; en vara som legat längre än gränsen för sin plats (7 dagar i kyl, 60 i frys, ingen i skafferi) får en liten sandfärgad etikett med antal dagar ("9 dagar")

**Givet** att jag vill ta bort en vara
**När** jag sveper raden åt vänster eller trycker på den och väljer "Ta bort" i arket
**Så** tas den bort med samma ångra som idag (Story 2.3); att ändra varan fungerar som förut

**Givet** mörkt läge, 375 px bredd och 200 % text
**När** jag ser sidan
**Så** finns ingen sidledes rullning, alla mål är minst 44 px, och skärmbilder i 390 och 1280 px (ljust och mörkt) är jämförda med skissen

### Story 14.7: Inställningar som i telefonens egna appar, "Boenden" och "Förråd"

Som Pontus,
vill jag att Inställningar är en kort startsida med grupper och egna undersidor, och att "ställen" heter "boenden",
så att det förblir enkelt och tydligt även när vi lägger till mer.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/installningar.html` (godkänd av Pontus 2026-10-31). Orden "Boenden" (i stället för ställen) och "Förråd" (i stället för Lagersaldo) valda av Pontus samma dag. Byggs efter Story 17.5, vars AI-avsnitt flyttar till en egen undersida.

**Acceptance Criteria:**

**Givet** Inställningar
**När** jag öppnar sidan
**Så** är startsidan en grupperad lista (samma radstil som resten av appen) med rubrikerna Konto, Hushåll, Recept, AI och Appen och sist "Logga ut" i en egen grupp; varje rad har en ikonruta med emoji, en etikett, ett kort värde till höger (t.ex. "Hemma, Duved", "Maxi ICA Östersund", "4 sajter", "Claude Haiku · Medel") och › när den leder vidare; startsidan ryms på en telefonskärm

**Givet** raderna
**När** jag trycker på en
**Så** öppnas en egen undersida med "‹ Inställningar" tillbaka: Konto (e-post, Byt lösenord via samma flöde som Story 17.2), Boenden (hanteringen som i dag finns under "Ställen"), Butiker (dagens butiksval och andra butiker, utan rå webbadress i texten), Receptsajter (lista med "Ta bort" och fält för att lägga till), Spara i Matkoll (guiden med ett segmenterat val Dator / iPhone / Android så att en guide syns åt gången), AI (från Story 17.5, med kostnaden från 17.6 när den finns), Installera appen och Om Matkoll; allt som går att göra i dag går att göra efteråt, och gamla ankarlänkar (t.ex. `/installningar#spara-i-matkoll`) leder till rätt undersida

**Givet** AI-gruppen
**När** någon annan än en adress i `AI_SETTINGS_EMAILS` öppnar Inställningar i molnet
**Så** syns inte AI-gruppen (som i Story 17.5)

**Givet** en dator (bred skärm)
**När** jag öppnar Inställningar
**Så** visas startsidan som vänsterkolumn och vald undersida bredvid

**Givet** ordet "ställen"
**När** det förekommer i appens text (Inställningar, Lagersaldo, inköpslistans "Lager: Hemma · Byt", ark och felmeddelanden)
**Så** heter det i stället "boenden"/"boende" (t.ex. "Boende: Hemma · Byt", "Hantera boenden"); kod, tabeller och adresser behöver inte byta namn, men användartexten ska vara konsekvent

**Givet** namnet "Lagersaldo"
**När** det förekommer i appens text (fliken, sidomenyn, sidrubriken, sidans titel, hänvisningar som "Lägg i lagret"-bekräftelser och tomma lägen)
**Så** heter sidan i stället "Förråd" med ikonen 📦 i menyn (i stället för 🧊, som krockar med Kyl); orden "lager"/"lagret" i löptext byts där det låter naturligt ("Lägg i förrådet"), och adressen `/hemma` behöver inte ändras

**Givet** mörkt läge, 375 px och 200 % text
**När** jag ser startsidan och undersidorna
**Så** finns ingen sidledes rullning, alla mål är minst 44 px, och skärmbilder i 390 och 1280 px (ljust och mörkt) är jämförda med skissen

### Story 14.8: Inställningar på datorn

Som Pontus,
vill jag att Inställningar ser lika genomtänkt ut på datorn som på telefonen,
så att webbappen känns lugn och ordnad.

Rättar datorvarianten av Story 14.7 efter Pontus skärmbild 2026-10-31 (telefonvarianten är bra och ändras inte).

**Acceptance Criteria:**

**Givet** Inställningar på en bred skärm (från ca 1024 px)
**När** jag öppnar en undersida
**Så** har sidan en egen, bredare ram (inte appens smala innehållsbredd): en vänsterspalt på ca 320 px med listan och en högerspalt som fyller resten, med jämn luft mellan dem

**Givet** sidhuvudet på datorn
**När** jag ser det
**Så** finns ingen "‹ Tillbaka" (sidomenyn finns redan), rubriken "Inställningar" står överst över båda spalterna, och undersidans rubrik i högerspalten är mindre (sektionsrubrik, ca 24 px) och ligger i linje med första grupprubriken i vänsterspalten

**Givet** den valda raden i vänsterspalten
**När** den visas
**Så** har den bara en lugn mintfärgad bakgrund, utan ram; fokusringen syns bara vid tangentbordsfokus (`:focus-visible`) och ligger inuti raden så att hörnen inte klipps

**Givet** värdena i vänsterspalten ("Maxi ICA Stormarknad Östersund", "Claude Haiku 5.5 · Medel")
**När** spalten är 320 px
**Så** får de plats eller kapas snyggt med ellips utan att etiketten kapas

**Givet** högerspaltens innehåll
**När** det visas
**Så** ligger beskrivningstext, kort och länkar i linje med samma vänsterkant

**Givet** den valda posten i sidomenyn (dator) eller i flikfältet (telefon)
**När** jag har klickat på den
**Så** har den bara en mintfärgad bakgrund, utan kraftig grön kant; fokusringen syns bara vid tangentbordsfokus (`:focus-visible`), ligger inuti och klipps aldrig

**Givet** huvudmenyn och alla texter som nämner förrådet
**När** jag ser dem
**Så** heter sidan "Matvaror" (inte "Förråd", eftersom Prylar också är förvaring) med 🥕 som ikon, i flikfältet, sidomenyn, sidrubriken, sidtiteln, tomlägen, inställningstexter och knappen "Lägg till i Matvaror" (adressen `/hemma` och koden är oförändrade)

**Givet** huvudmenyn
**När** jag ser den
**Så** heter sidan med prylarna "Förråd" (🧰, adressen `/prylar` oförändrad) och sidan med maten "Matvaror"; ingen text kallar maten "förråd", och frågefältet heter "Fråga om ditt förråd"

**Givet** telefonbredd
**När** jag öppnar Inställningar
**Så** är allt som efter Story 14.7, och skärmbilder i 390, 1024, 1280 och 1440 px (ljust och mörkt för 1280) visar resultatet

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

### Story 16.13: Ät det här först

Som Pontus,
vill jag att matförslagen använder det som legat länge i Matvaror först,
så att mindre mat slängs.

Beslut 2026-10-31 (Pontus): backlog.

**Acceptance Criteria:**

**Givet** varor i Matvaror som legat längre än gränsen för sin plats (Story 14.6: 7 dagar kyl, 60 frys)
**När** AI föreslår rätter
**Så** väger förslagen tyngre mot rätter som använder de varorna, och ett förslag som gör det säger varför ("Använder limen och koriandern som legat en vecka")

**Givet** Matvaror
**När** något har legat länge
**Så** finns en lugn rad överst "3 varor har legat länge – föreslå rätter med dem" som öppnar förslagen med de varorna förvalda

### Story 16.14: Boendet i sidomenyn

Som Pontus,
vill jag byta boende från sidomenyn (och under rubriken på mobilen) i stället för med knappar på varje sida,
så att det syns att valet gäller hela appen och sidorna blir lugnare.

Beslut 2026-10-31 (Pontus): mockupen godkänd. Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/boende-val.html` ("Idag" är skärmdumpar, "Nytt" och punktlistorna är specen).

**Acceptance Criteria:**

**Givet** två eller fler boenden på dator
**När** jag ser sidomenyn
**Så** finns under Livskoll en dämpad knapp med nål, det valda boendets namn och en pil; den öppnar en meny med varje boende och vad som finns där ("5 varor", "18 prylar", "Tomt" om inget), en bock vid det valda och "Hantera boenden ›" till Inställningar → Boenden; ett tryck på ett boende byter och sidan visar det direkt

**Givet** Matvaror eller Förråd
**När** sidan visas
**Så** är raden med boende-knappar och "Hantera" borta

**Givet** mobil (ingen sidomeny)
**När** jag är på Matvaror, Förråd eller Matsedel
**Så** står samma knapp under sidrubriken (på Matsedel i stället för "Boende: Hemma"), öppnar ett blad nerifrån med samma innehåll, och Recept och Inköpslista visar den inte

**Givet** Inställningar → Boenden
**När** sidan visas
**Så** är den en överblick: ett kort per boende med "N matvaror · N prylar · N kort", det valda med grön kant och märket "Vald"; "Matvaror ›" och "Förråd ›" väljer boendet och går dit, ett tryck på kortet väljer det, ⋯ ger "Byt namn" och "Ta bort" (som förut bara för ett tomt boende som inte är valt), "Lägg till boende" och "Rensa förrådet i …" är kvar, och texten under rubriken är "Det valda boendet gäller i hela appen."

**Givet** bara ett boende
**När** jag använder appen
**Så** syns inget nytt någonstans

**Givet** valet av boende
**När** det byts
**Så** sparas det på servern som förut (aldrig i adressen, en cookie eller localStorage, AD-24) och sidan väntar (inert) tills det är sparat

### Story 16.15: Väntan på AI

Som Pontus,
vill jag att väntan på AI syns som ett litet glödande klot och en skimrande text som byter steg,
så att det känns levande och lugnt i stället för en stillastående text.

Beslut 2026-10-31 (Pontus): stil B och A tillsammans ur demot `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/ai-vanta.html`. Något eget, enkelt och lite futuristiskt.

**Acceptance Criteria:**

**Givet** att appen väntar på AI (receptförslag, receptimport, foto av kylen, fotoläsning av ett kort, uppslag av varor på fotot, jobbraden)
**När** väntan visas
**Så** syns ett klot som snurrar och andas (grönt, mint, sand) bredvid en text där ett ljus sveper, i ljust och mörkt läge

**Givet** en text med flera steg
**När** den visas
**Så** byter den steg ungefär var 2,2 s och stannar på det sista, utan att börja om

**Givet** att anropet inte vet om indata är foto, text eller länk
**När** inga steg anges
**Så** väljs två eller tre lekfulla ord slumpvis en gång (Funderar …, Klurar …), och där appen vet vad som händer står sakliga steg (Tittar på bilden …, Hittar varorna …)

**Givet** en skärmläsare
**När** väntan visas
**Så** finns en enda `role="status"` med bara det första steget

**Givet** "Minska rörelse"
**När** väntan visas
**Så** står klotet still och texten är det första steget utan svep eller stegbyte

### Story 16.16: Tidigare utan Ny matsedel

Som Pontus,
vill jag att Tidigare bara visar och hanterar gamla veckor,
så att jag inte får två "Vecka 44" och inte kan tömma veckan jag är mitt i.

Beslut 2026-10-31 (Pontus): "Ny matsedel" och "Använd igen" är rester från tiden före veckor och tas bort.

**Acceptance Criteria:**

**Givet** Tidigare matsedlar
**När** jag öppnar listan
**Så** finns ingen knapp "Ny matsedel"

**Givet** en tidigare matsedel
**När** jag öppnar den
**Så** finns "Kopiera till …" och "Ta bort matsedel" men inte "Använd igen"; noten om rätter med borttaget recept gäller "Kopiera till …"

**Givet** en matsedel som de gamla knapparna lade åt sidan (ingen vecka)
**När** jag ser den i Tidigare eller öppnar den
**Så** står det "4 rätter · undanlagd · skapad 30 okt 2026" (inte bara "skapad"); den kan öppnas, kopieras och tas bort

**Givet** en matsedel för en gammal vecka
**När** jag ser den i Tidigare
**Så** står det som förut "3 rätter · skapad 26 okt 2026"

**Givet** att inga databasfunktioner ändras
**Så** är ingen migrering med och inget försvinner ur listan

### Story 16.17: Tydligare lagervarublad

Som Pontus,
vill jag att bladet för en lagervara visar varan som rubrik och gör det vanligaste (ändra mängden) enklast,
så att jag inte blir vimsig och vet vad jag kan göra.

Beslut 2026-10-31 (Pontus): "tycker uppdateringen inte är klockren. Jag blir lite vimsig". Mockupförslaget godkänt ("vi kör på ditt mockupförslag"), med ändringen att Plats är en lugn rad vid ändring ("jag tror inte det är den uppdatering man vill göra"). Dämpad röd för Ta bort godkänd (ny token `--danger`, undantag från "ingen röd"). Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/lagervara-blad.html` ("Idag" är skärmdumpar, "Nytt" och punktlistorna är specen).

**Acceptance Criteria:**

**Givet** en lagervara i Matvaror
**När** jag öppnar den
**Så** är varans namn bladets rubrik med Avbryt till höger, och under den står en liten länk "Fel vara? Byt vara"; ingen separat rubrik "Lagervara" syns

**Givet** "Byt vara"
**När** jag trycker
**Så** ersätts bladets innehåll av "‹ Tillbaka" och "Byt vara" med sökfältet i fokus, utan ett andra Avbryt; Tillbaka går till varan utan att något ändras

**Givet** mängden
**När** jag ändrar den
**Så** finns − och + bredvid siffran (steg 1 för st, 0,5 för kg och l, 100 för g och ml), siffran går fortfarande att skriva, − är inaktiv vid 0 eller tom, och tom mängd betyder som förut att jag inte räknar

**Givet** en vara jag ändrar
**När** jag ser platsen
**Så** står en lugn rad "Ligger i Kyl · Flytta ›" som fäller ut Kyl, Frys och Skafferi som en tydlig väljare där alla val ser tryckbara ut och det valda har en bock

**Givet** en ny vara (Lägg till vara)
**När** bladet visas
**Så** syns väljaren för plats direkt, förvald som idag, rubriken är "Lägg till vara" i sökläget och knappen heter "Lägg till vara"; Ta bort finns inte

**Givet** "Märke eller sort"
**När** jag ser fältet
**Så** står det "(valfritt)" efter etiketten

**Givet** Ta bort
**När** jag ser den
**Så** står den sist under en linje, i dämpad röd med papperskorg, och fungerar som idag (varan tas bort och "Ångra" visas i 5 s)

**Givet** ett lagerförslag som rättas
**När** bladet visas
**Så** följer det samma upplägg, med "Bekräfta" och ett grått "Avvisa" under linjen

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder bladet
**Så** finns ingen sidledes rullning och alla tryckytor är minst 44 px

### Story 16.18: Packa upp kassarna

Som Pontus,
vill jag efter att ha handlat kunna se var varorna hamnade och flytta enstaka varor med ett tryck,
så att kyl-, frys- och skafferivarorna står rätt medan matkassarna står på diskbänken.

Beslut 2026-10-31 (Pontus): "När man handlat och kommer hem med matkassarna så ska varorna sorteras i kyl, frys, skafferi." Byggd utan förhandsgodkännande av mockupen (Pontus: bygg allt i natt); han ser mockupen på morgonen. Hänger ihop med "Lägg i lagret?" som Pontus vill testa först. Inga databasändringar: en flytt är en vanlig lagerändring. Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/packa-upp.html` ("Idag" är en skärmdump, "Nytt" och punktlistorna är specen).

**Acceptance Criteria:**

**Givet** markerade rader i Inköpslistan
**När** jag trycker "Lägg till i Matvaror"
**Så** läggs varorna i Matvaror med ett tryck, var och en på sin vanliga plats (kyl, frys eller skafferi efter varans standard), precis som idag

**Givet** att varor lades i Matvaror
**När** bekräftelsen visas
**Så** säger den var de hamnade, till exempel "Lagt 8 varor: 5 i kyl, 2 i skafferi, 1 i frys.", med platserna med flest varor först (lika många: kyl, frys, skafferi), utan platser som saknar varor, "vara" för en och "varor" för flera, "Lagt 3 varor i kyl." när allt hamnade på samma plats och "för Stugan" efter antalet när jag har flera Boenden

**Givet** bekräftelsen
**När** jag ser den
**Så** finns knappen "Ändra" i den (44 px tryckyta, samma plats som "Ångra" och "Visa") och bekräftelsen står kvar i 8 s; en körning som bara tog bort egna varor utan koppling, eller som inte lade något i Matvaror, har ingen "Ändra"

**Givet** "Ändra"
**När** jag trycker
**Så** öppnas bladet "Packa upp" med "Klar" till höger (inget kan gå förlorat, varje flytt sparas direkt), raden "Tryck på rätt plats för varje vara." och en rad per vara som lades i Matvaror: namnet, mängden som köptes och väljaren Kyl, Frys, Skafferi (hög segmenterad väljare med bock, som i Lagervara-bladet) med den plats varan fick vald

**Givet** bladet "Packa upp"
**När** jag trycker på en annan plats för en vara
**Så** flyttas varan dit direkt med det ena trycket, utan sparaknapp och utan eget blad per vara; raderna byter aldrig ordning, och det som redan var rätt rörs inte

**Givet** en vara som redan låg i Matvaror
**När** jag flyttar det jag just köpte
**Så** flyttas bara den köpta mängden (resten blir kvar där den låg), och finns varan redan på den nya platsen läggs mängden till där

**Givet** en flytt som misslyckas
**När** svaret kommer
**Så** hoppar valet tillbaka till den gamla platsen och en blå ruta säger "Det gick inte att flytta varan."; varan ligger kvar där den låg

**Givet** att jag stänger bekräftelsen eller bladet
**När** jag senare vill ändra en plats
**Så** gör jag det som förut i Matvaror (Lagervara-bladet, Flytta)

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder bekräftelsen och bladet
**Så** finns ingen sidledes rullning, långa namn bryts på flera rader, platsvalen delar radens bredd och alla tryckytor är minst 44 px

## Epic 17: Molnet och gemensam lista

Version 2.0. Familjen planerar och handlar ihop i Matkoll med en delad inloggning per hushåll, och upp till fem vänhushåll kan betatesta med egna konton utan att någon data blandas. Matkoll ersätter To Do som inköpslista. Allt byggs och testas lokalt först; flytten till Vercel och Supabase i molnet (17.3, 17.4) görs först när Pontus säger till. Underlag: `sprint-change-proposal-2026-10-31-molnet-och-gemensam-lista.md`.

### Story 17.1: Isoleringstest mellan hushåll

Som Pontus,
vill jag att ett automatiskt test bevisar att ett hushåll aldrig kan se eller ändra ett annat hushålls data,
så att jag tryggt kan bjuda in vänner.

**Acceptance Criteria:**

**Givet** två testkonton A och B med data i varje tabell och en bild i lagringen
**När** integrationstestet körs som B
**Så** ger läsning av A:s rader inga träffar, och ändring, borttagning och insättning med A:s `user_id` nekas eller påverkar inga rader, för varje tabell i schemat och för bildlagringen

**Givet** en ny tabell i en migrering
**När** den saknas i testets lista
**Så** fallerar testet med tabellens namn, så att ingen tabell glöms

**Givet** CI
**När** en PR körs
**Så** körs testet i integrationssteget

### Story 17.2: Enkel inloggning med lösenord

Som Pontus,
vill jag logga in med e-post och lösenord och förbli inloggad,
så att hela familjen kan dela samma konto utan engångslänkar.

**Acceptance Criteria:**

**Givet** inloggningssidan
**När** jag anger e-post och lösenord för ett befintligt konto
**Så** loggas jag in och förblir inloggad tills jag loggar ut, även efter att appen stängts

**Givet** en adress i inbjudningslistan (`ALLOWED_EMAILS`) vars konto gjorts med `pnpm users:sync`, och som inte har något lösenord än
**När** jag väljer "Första gången eller glömt lösenordet? Välj lösenord" och anger min e-post
**Så** kommer ett mejl med en länk där jag väljer lösenord (minst 12 tecken) och blir inloggad (lokalt syns mejlet i Mailpit); svaret är detsamma för alla adresser, och ingen kan skapa konto själv

**Givet** "Glömt lösenord" (samma "Välj lösenord")
**När** jag anger min e-post
**Så** kommer ett mejl med en länk där jag väljer nytt lösenord

**Givet** första inloggningen på ett konto
**När** appen öppnas
**Så** visas en gång en kort rad om att den som driver Matkoll tekniskt kan se kontots data, med "Okej"

**Givet** dagens engångslänk och utvecklingsinloggningen
**När** storyn är klar
**Så** fungerar e2e-testerna och den lokala inloggningen som förut

### Story 17.3: Molnmiljön

Som Pontus,
vill jag att Matkoll körs på Vercel med Supabase i EU när jag säger till,
så att appen fungerar utan min dator.

Väntar på Pontus "nu går vi till Vercel". Förberedelser (guide, konfiguration, CI-steg) får göras före.

**Acceptance Criteria:**

**Givet** guiden `docs/molnet.md`
**När** Pontus följer den
**Så** finns ett Supabase-projekt i EU, ett Vercel-projekt, e-post för inloggningsmejl och alla miljövariabler, steg för steg

**Givet** en merge till main
**När** CI körs
**Så** körs nya migreringar mot molndatabasen och Vercel bygger appen

**Givet** molnmiljön
**När** en vecka går
**Så** finns en säkerhetskopia av databasen sparad utanför Supabase

**Givet** appen i molnet
**När** den öppnas på telefonen och i datorns webbläsare
**Så** fungerar inloggning, recept, matsedel och inköpslista

### Story 17.4: Flytta din data till molnet

Som Pontus,
vill jag föra över mina recept, mitt lager, mina matsedlar och listor från datorn till molnkontot,
så att jag kan stänga av den lokala miljön utan att tappa något.

Väntar på 17.3.

**Acceptance Criteria:**

**Givet** den lokala databasen och ett molnkonto
**När** flyttskriptet körs
**Så** kopieras alla Pontus rader till molnkontot med det nya kontots `user_id`, och antalet rader per tabell skrivs ut före och efter

**Givet** att skriptet körs två gånger
**När** det körs igen
**Så** blir det inga dubbletter

### Story 17.5: Välj AI i Inställningar

Som Pontus,
vill jag kunna välja leverantör, modell och nivå för AI:n direkt i Inställningar medan jag testar,
så att jag kan jämföra min lokala Qwen med Claude utan att ändra filer eller starta om.

Ändrad 2026-10-31 (Pontus): valet görs i appen, inte bara i miljövariabler. Ett gemensamt val för alla uppgifter (import, foto, förslag); val per uppgift kan komma senare.

**Acceptance Criteria:**

**Givet** Inställningar
**När** jag öppnar avsnittet "AI"
**Så** kan jag välja leverantör (Qwen lokalt via LM Studio, Claude, och OpenAI om den redan stöds i koden), modell för vald leverantör (Claude: Haiku 5.5 `claude-haiku-5-5`, Sonnet 5.5 `claude-sonnet-5-5`, Opus 5.5 `claude-opus-5-5`; Qwen: modellen från `AI_MODEL`/LM Studio) och nivå (Låg, Medel, Hög), och varje Claude-modell visar en ungefärlig kostnad per anrop ("ca 0,02 kr per import")

**Givet** ett sparat val
**När** nästa AI-jobb startar (import, foto, förslag)
**Så** används vald leverantör, modell och nivå utan omstart; nivån skickas till Claude som `output_config.effort` (low/medium/high) och påverkar Qwen bara om det redan finns ett motsvarande reglage, annars visas nivån som avstängd för Qwen

**Givet** att `ANTHROPIC_API_KEY` saknas
**När** jag ser avsnittet
**Så** är Claude-valen avstängda med texten "Lägg in ANTHROPIC_API_KEY i .env.local och starta om", och appen startar som förut med Qwen; nyckeln läses bara på servern

**Givet** inget sparat val
**När** ett AI-jobb körs
**Så** används Claude Haiku 5.5 (`claude-haiku-5-5`) på nivå Medel om `ANTHROPIC_API_KEY` finns, och Inställningar visar Haiku 5.5 / Medel som valt; saknas nyckeln används dagens `AI_PROVIDER`/`AI_MODEL` från miljön (Qwen). Testläget `AI_PROVIDER=mock` påverkas aldrig (ändrat 2026-10-31, Pontus)

**Givet** molnet med flera hushåll
**När** någon annan än en adress i `AI_SETTINGS_EMAILS` öppnar Inställningar
**Så** syns inget AI-avsnitt och deras jobb använder standardvalet; lokalt (utvecklingsläge) syns avsnittet alltid

**Givet** valet sparas
**När** det lagras
**Så** ligger det i en ny tabell med `user_id` och radskydd (bakåtkompatibel migrering), täckt av isoleringstestet från Story 17.1

### Story 17.6: AI-kostnaden syns

Som Pontus,
vill jag se vad AI:n har kostat den här månaden,
så att jag vet om en modell är värd pengarna.

**Acceptance Criteria:**

**Givet** ett klart AI-jobb
**När** svaret kommer
**Så** sparas modell och antal tokens in och ut på jobbet (ny kolumn, bakåtkompatibel migrering)

**Givet** Inställningar
**När** jag öppnar dem
**Så** står "AI den här månaden: 34 anrop · ca 1,20 kr", räknat från en pristabell per modell i koden; lokala modeller räknas som 0 kr

### Story 17.7: Live-inköpslista

Som Pontus,
vill jag att inköpslistan uppdateras direkt när någon annan i familjen ändrar den,
så att vi kan handla ihop.

**Acceptance Criteria:**

**Givet** inköpslistan öppen på två enheter med samma konto
**När** den ena bockar av, lägger till, ändrar eller tar bort en vara
**Så** syns ändringen på den andra inom ett par sekunder utan omladdning (Supabase Realtime, som följer radskyddet)

**Givet** att samma vara bockas av på båda samtidigt
**När** det sker
**Så** blir den avbockad en gång, utan fel

**Givet** en ändring av matsedeln
**När** den sparas
**Så** räknas listan om på den andra enheten

**Anmärkning (säkerhet):** Realtime tillämpar radskyddet på INSERT och UPDATE, men inte på DELETE (posten innehåller bara radens id och går inte att filtrera). Klienten behandlar därför varje händelse som en ren "något ändrades"-signal och läser aldrig innehållet. Ett annat konto kan i värsta fall höra en DELETE-signal med bara ett slumpmässigt id (läcker bara tidpunkten). Täcks av e2e-testet "another account's subscription never receives this user's row content".

### Story 17.8: Handla med dålig täckning

Som Pontus,
vill jag kunna bocka av i butiken även utan nät,
så att listan fungerar i källaren på Willys.

**Acceptance Criteria:**

**Givet** att nätet försvinner
**När** jag bockar av varor
**Så** syns bocken direkt, en lugn rad visar "Offline – sparas när nätet kommer tillbaka", och avbockningarna skickas när nätet är tillbaka

### Story 17.9: Lägg till snabbt och med Siri

Som Pontus,
vill jag lägga till en vara i listan på några sekunder, även med rösten,
så att jag aldrig glömmer något jag kommer på.

**Acceptance Criteria:**

**Givet** appen installerad på hemskärmen
**När** jag öppnar adressen för snabbtillägg
**Så** öppnas "Lägg till egen vara" direkt med fokus i fältet

**Givet** Inställningar
**När** jag skapar en personlig nyckel
**Så** visas nyckeln en gång med en guide för iOS-genvägen "Matkoll", och den sparas bara som hash (ny tabell, bakåtkompatibel migrering)

**Givet** ett anrop till snabbtilläggets API med giltig nyckel och texten "mjölk och ägg"
**När** det tas emot
**Så** läggs "Mjölk" och "Ägg" till som egna varor (delat på "och" och komma, utan AI); en ogiltig nyckel ger 401

### Story 17.10: Egna varor ligger kvar tills de är köpta

Som Pontus,
vill jag att en egen vara syns i inköpslistan tills någon bockar av den, oavsett vald vecka,
så att det familjen skriver in inte försvinner.

**Acceptance Criteria:**

**Givet** en egen vara tillagd när vecka 44 var vald
**När** jag öppnar listan för vecka 45
**Så** finns varan kvar tills den bockas av eller tas bort

**Givet** en avbockad egen vara
**När** veckan är slut
**Så** visas den inte i nästa veckas lista

**Regel (beslutad vid bygget):** en egen vara hör till hushållet, inte till en vecka (`shopping_custom_item.meal_plan_id` är tom för nya varor, och bockarna för egna varor, nyckel `c:<id>`, hör till användaren). Varan visas i varje veckas lista, även en vecka utan matsedel, tills den bockas av. En avbockad vara visas kvar (avbockad, "I korgen") den vecka den bockades av och döljs i senare veckors listor när den veckan har passerat (tittar man på en kommande vecka medan man planerar ligger den kvar i korgen tills veckan är slut); avbockningens tidpunkt (`shopping_check.created_at`) avgör veckan. "Lägg i förrådet" och "Ta bort" raderar varan helt. En matsedel behålls inte längre för sina egna varors skull, och raderas matsedeln behåller varorna sin plats på listan. "Lägg i förrådet" finns bara för en vecka med matsedel.

## Epic 18: Prylar

Version 2.1. Hushållet kan fotografera förråd, garage och bodar och låta AI lista vad som finns, så att man kan fråga "var är hammaren?" eller "har vi skruvar?". Kortet är källan: sakerna kommer från korten, ett nytt kort av samma plats ersätter det gamla, och tas kortet bort försvinner dess saker. Prylar har en egen flik och blandas aldrig med maten (inga inköpslistor, ingen synk, ingen påverkan på recept eller "hemma"). Beslut 2026-10-31 (Pontus): egen flik "Prylar", platser med egna namn (rum + valfri del, ingen planritning), garderoben pausad. Test samma dag på 9 bilder från skräpförrådet: Haiku 5.5 hittade 9–47 saker per bild (ca 2 öre, 9–24 s), en kontrollerad bild hade 26 av 26 rätt; frågor besvarades bra från listorna; sammanslagning av överlapp behöver förbättras; stängda lådor är den stora luckan.

### Story 18.1: Fliken Prylar och platser

Som Pontus,
vill jag ha en egen flik för prylar där jag kan skapa platser med egna namn,
så att prylarna hålls isär från maten och hamnar där jag själv tänker att de finns.

**Acceptance Criteria:**

**Givet** appen
**När** jag ser menyn
**Så** finns en femte flik "Prylar" med ikonen 🧰 (flikraden på telefon och sidomenyn på dator), i samma stil som de andra

**Givet** fliken Prylar utan platser
**När** jag öppnar den
**Så** står en kort förklaring ("Fotografera en hylla eller ett förråd, så listar Matkoll vad som finns där") och knappen "Ny plats"

**Givet** "Ny plats"
**När** jag anger rum (t.ex. "Skräpförrådet") och valfri del (t.ex. "Översta hyllan") för valt boende
**Så** skapas platsen; rum jag redan har föreslås i en lista så att samma rum återanvänds, och platserna visas grupperade per rum med antal saker och datum för senaste kort

**Givet** fler än ett boende
**När** jag ser fliken
**Så** visas boendena som piller som i Förrådet, och platserna hör till valt boende

**Givet** lagringen
**När** platser sparas
**Så** ligger de i nya tabeller med `user_id` och radskydd (bakåtkompatibel migrering), täckta av isoleringstestet från Story 17.1

### Story 18.2: Fota en plats och låt AI lista prylarna

Som Pontus,
vill jag ta ett kort av en plats och få en lista över prylarna,
så att jag slipper skriva in dem själv.

**Acceptance Criteria:**

**Givet** en plats
**När** jag tar eller väljer ett foto (även HEIC från iPhone)
**Så** laddas det upp som i Förrådets fotoflöde (nedskalat, EXIF borttaget, privat lagring per konto) och ett AI-jobb startar i bakgrunden med AI-valet från Story 17.5 (standard Haiku 5.5)

**Givet** AI-jobbet
**När** det är klart
**Så** sparas varje pryl med namn, kategori (Verktyg, Sport & fritid, Trädgård, Elektronik, Förvaring & lådor, Kläder & textil, Hushåll, Byggmaterial, Övrigt), var på bilden ("översta hyllan, vänster") och säkerhet, kopplad till kortet; fast inredning som hyllor och konsoler tas inte med; prylar med låg säkerhet visas som "kanske"

**Givet** en plats med kort
**När** jag öppnar den
**Så** ser jag kortets miniatyr med datum ("Kort från 31 okt"), prylarna grupperade per kategori, och en rad om det som inte syns ("Innehållet i 3 lådor syns inte – fota insidan")

**Givet** ett misslyckat jobb
**När** AI inte svarar
**Så** visas ett lugnt fel med "Försök igen", och kortet ligger kvar

**Givet** bilderna
**När** de lagras
**Så** är bucketen privat per konto och täckt av isoleringstestet

### Story 18.3: Förnya och ta bort kort

Som Pontus,
vill jag kunna ta ett nytt kort eller ta bort ett gammalt,
så att listan blir rätt utan att jag rättar varje pryl.

**Acceptance Criteria:**

**Givet** en plats med ett kort
**När** jag tar ett nytt kort av samma plats
**Så** ersätter det nya kortet det gamla när AI-jobbet är klart: det gamla kortets prylar och fil tas bort, och platsen visar det nya datumet

**Givet** ett kort
**När** jag väljer "Ta bort kortet"
**Så** frågar appen först, och sedan försvinner kortet, dess fil och alla dess prylar, med "Ångra" en kort stund

**Givet** en pryl som AI fått fel på
**När** jag trycker på den
**Så** kan jag byta namn eller ta bort just den prylen (utan att kortet ändras)

### Story 18.4: Sök och fråga

Som Pontus,
vill jag kunna söka och fråga efter prylar,
så att jag hittar hammaren utan att leta.

**Acceptance Criteria:**

**Givet** fliken Prylar
**När** jag skriver i sökfältet
**Så** visas matchande prylar från alla platser och boenden med plats och kortdatum ("Hammare · Skräpförrådet, väggen · Hemma · 31 okt"), utan AI

**Givet** frågerutan "Fråga om dina prylar"
**När** jag ställer en fråga ("Har vi något att måla med?")
**Så** svarar AI kort på svenska utifrån de sparade listorna (inte bilderna), med plats och kort som går att trycka på, och nämner lådor vars innehåll inte syns när det är relevant; frågan går med vald AI-modell

### Story 18.5: Fota insidan av en låda

Som Pontus,
vill jag kunna fota insidan av en låda eller back,
så att även det som ligger undanstoppat går att hitta.

**Acceptance Criteria:**

**Givet** en plats
**När** jag väljer "Lägg till låda" och anger ett namn ("Blå backen", "Kartong jul")
**Så** blir lådan en del av platsen med eget kort, och dess prylar visas som "i Blå backen" i listor, sök och svar

**Givet** en rad "Innehållet i 3 lådor syns inte"
**När** jag trycker på den
**Så** kan jag direkt fota insidan av en av dem

### Story 18.6: Inga dubbletter när korten överlappar

Som Pontus,
vill jag att samma pryl inte räknas två gånger när två kort på samma rum överlappar,
så att listan går att lita på.

**Acceptance Criteria:**

**Givet** två eller fler kort i samma rum
**När** ett nytt kort blir klart
**Så** jämförs dess prylar med rummets övriga prylar i ett billigt textanrop (utan bilder), och samma pryl slås ihop med hänvisning till alla kort den syns på; prylar på olika platser slås aldrig ihop

**Givet** testbilderna från skräpförrådet (sparade som testdata)
**När** sammanslagningen körs i ett eval
**Så** slås uppenbara dubbletter ihop (t.ex. samma cirkelsåg på två kort) utan att olika saker med liknande namn blandas

### Story 18.11: Ta kort först, många kort per rum

Som Pontus,
vill jag kunna fota direkt och lägga många kort i samma rum,
så att jag kan fota ett helt rum i ett svep utan att först skapa platser.

Skiss: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/forrad-flyt.html` (bild 1 och 2), godkänd av Pontus 2026-10-31.

**Acceptance Criteria:**

**Givet** Förrådets startsida
**När** jag ser den
**Så** är "📷 Ta kort" den första, tydliga raden (accentfärgad radkort), före rummen; "Ny plats" finns inte längre som start

**Givet** "Ta kort"
**När** jag trycker
**Så** öppnas ett ark "Var tar du kortet?" med rummen som chips (senast använda rummet förvalt) och "+ Nytt rum"; "Mer exakt plats (valfritt)" fälls ut med del eller låda; utan val hamnar kortet i hela rummet

**Givet** arket
**När** jag väljer "Öppna kameran" på telefonen eller "Välj bilder …" (flera bilder på en gång, även på datorn)
**Så** laddas varje bild upp som ett eget kort i valt rum och läses av AI i bakgrunden; efter varje kort från kameran erbjuds "Ta ett till"

**Givet** ett rum som redan har kort
**När** jag tar ett nytt kort
**Så** läggs det till (ersätter inget); att förnya görs med "Ta om" på ett visst kort, som bara ersätter det kortet när det nya är läst; dubbletter mellan korten slås ihop som i Story 18.6

**Givet** startsidan
**När** rummen visas
**Så** står varje rum med antal prylar, antal kort och senaste datum ("Skräpförrådet · 74 prylar · 9 kort · 31 okt") och summan överst ("3 rum · 112 prylar")

### Story 18.12: Rummets överblick

Som Pontus,
vill jag se hur många prylar ett rum har och en lista per kategori,
så att jag får överblick efter att ha fotat.

Skiss: bild 3 och 4 i samma skiss.

**Acceptance Criteria:**

**Givet** ett rum
**När** jag öppnar det
**Så** visas överst en sammanfattning med antal prylar, kategorier och kort, och raden "Ta fler kort" (senaste kort-datum)

**Givet** rummets sida
**När** jag väljer "Prylar" i det segmenterade valet
**Så** visas rummets sammanslagna prylar (alla kort, delar och lådor) per kategori med emoji-ruta och antal, med var på bilden eller "syns på 2 kort" och "i Blå backen" för lådor

**Givet** rummets sida
**När** jag väljer "Kort"
**Så** visas korten som miniatyrer i två kolumner med vad kortet visar ("Hela rummet", "Väggen", "Låda: Black box"), antal prylar och datum, och "Ta om" och "Ta bort" per kort

**Givet** ett rum med hundratals eller tusentals prylar
**När** jag väljer "Prylar"
**Så** visas kategorierna hopfällda med emoji-ruta, namn och antal ("Skruv & beslag · 214"); en kategori visar sina rader först när jag fäller ut den (utfällt minns enheten), och startsidan och rummets sida räknar i databasen i stället för att läsa in varje pryl

### Story 18.13: Skriv vad som finns i en låda

Som Pontus,
vill jag kunna skriva vad en låda innehåller när jag inte orkar eller kan fota insidan,
så att även stängda lådor går att hitta.

Skiss: bild 5 i samma skiss.

**Acceptance Criteria:**

**Givet** en låda
**När** jag väljer "Skriv vad som finns"
**Så** kan jag skriva fritt, en sak per rad eller med komma, och spara; sakerna blir prylar i lådan (utan kort), kategoriseras av AI med ett billigt textanrop (utan bild, via valt AI, användning räknas som i Story 17.6) och syns i listor, sök och chatt som "i Black box"

**Givet** en låda med inskrivna saker
**När** jag öppnar den igen
**Så** kan jag ändra texten (sakerna ersätts) och även fota insidan; båda sorterna visas tillsammans

**Givet** lagringen
**När** inskrivna saker sparas
**Så** kan en pryl höra till en plats utan kort (bakåtkompatibel migrering), täckt av isoleringstestet

### Story 18.14: Fråga som en chatt

Som Pontus,
vill jag kunna fråga "Har du sett min skiftnyckel?" och ställa följdfrågor,
så att det känns som att fråga någon som vet var allt ligger.

Skiss: bild 1 i samma skiss (chatten högst upp på startsidan).

**Acceptance Criteria:**

**Givet** Förrådets startsida
**När** jag har prylar
**Så** finns en chatt högst upp under "Ta kort" med fältet "Fråga om ditt förråd …"

**Givet** en fråga
**När** jag skickar den
**Så** svarar AI kort utifrån de sparade listorna (inte bilderna) med rum, del eller låda och en tryckbar referens med kortets miniatyr och datum; om saken inte finns säger svaret det och nämner lådor vars innehåll inte syns

**Givet** en följdfråga ("och tången då?")
**När** jag skickar den
**Så** förstår AI sammanhanget från de senaste frågorna i samma samtal (som hålls i webbläsaren, inte sparas), och samtalet kan rensas med "Ny fråga"

### Story 18.7: Visa föremålet på kortet

Som Pontus,
vill jag se kortets bild med föremålet utmärkt när jag hittar den i sök eller chatt,
så att jag direkt ser var på hyllan den finns.

Beslut 2026-10-31 (Pontus): byggs efter 18.17, före 17.9. Kostnad bedömd som försumbar (~0,2 öre extra per kort med Haiku).

**Acceptance Criteria:**

**Givet** en sökträff eller en referens i chatten
**När** den visas
**Så** står kortets miniatyr till vänster (i stället för kategoriikonen); inskrivna föremål utan kort visar lådans ikon

**Givet** en träff eller referens
**När** jag trycker på den
**Så** öppnas kortet i stort format (egen vy med bilden i full bredd, rum, del/låda och datum) med föremålet utmärkt av en ruta och dess namn, och övriga föremål på kortet listas under bilden; ett tryck på ett annat föremål i listan flyttar markeringen

**Givet** ett nytt kort som läses
**När** AI listar föremålen
**Så** får varje föremål en ungefärlig ruta (normaliserade koordinater 0–1) i samma anrop, utan extra AI-anrop; rutor som är orimliga (utanför bilden, noll storlek) sparas inte

**Givet** ett föremål utan ruta (äldre kort)
**När** jag öppnar den på kortet
**Så** letar appen upp den med ett litet AI-anrop för bara det föremålet (samma teknik som kylskåpskorten i Matvaror), sparar rutan och visar den; går det inte visas kortet utan markering med texten "Kunde inte peka ut den på bilden"

**Givet** lagringen
**När** rutor sparas
**Så** ligger de på föremålet (bakåtkompatibel migrering) och kostnaden räknas som i Story 17.6

**Givet** rummets flik Kort
**När** jag trycker på ett kort
**Så** öppnas samma stora vy med hela, okapade bilden; alla föremål på kortet har en tunn ruta med namnet, och listan ligger under bilden (bredvid på dator, 1280 px); ett tryck på ett föremål i listan eller på en ruta markerar det och tonar ner resten; kortets knappar (Ta om, Lägg till föremål, Ta bort kortet sist, med Ångra) finns i vyn; vyn fungerar vid 390 px (full bredd, nyp för att zooma) och 1280 px

Beslut: Pontus 2026-10-31: se hela kortet med markeringar; byggd utan förhandsgodkännande av mockupen.

Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/kortet-stort.html`

### Story 18.10: Svep med kameran

Backlog (Pontus frågade 2026-10-31 om film). Filma en plats; appen plockar själv ut 4–6 skarpa, olika bilder ur filmen (i webbläsaren) som blir kort. Bara stillbilder går till AI, så kostnaden hålls nere.

### Story 18.8: Garderoben

Pausad (Pontus 2026-10-31): fota garderoben för att veta vad man har och få "Återupptäck"-förslag på glömda plagg.

### Story 18.9: Nytt namn på appen – Livskoll

Som Pontus,
vill jag att appen heter Livskoll,
så att namnet täcker både mat, prylar och vardagen och inte bara mat.

Beslut 2026-10-31 (Pontus): "Livskoll" – "livs" som i livsmedel och som i livet, där du får koll i kaoset. Undertitel: "Mat, prylar och vardag under kontroll". Inget engelskt namn nu; ingen domän förrän betan bekräftat namnet.

**Acceptance Criteria:**

**Givet** appens namn
**När** det används i koden
**Så** finns det på ett enda ställe (t.ex. en konstant `appName` och `appTagline`), som all användartext läser från, så att ett framtida namnbyte är en rad

**Givet** appen
**När** jag ser den
**Så** står "Livskoll" i sidomenyns logotyprad, sidtitlar (`<title>` och metadata), PWA-manifestets namn och korta namn (appnamnet på hemskärmen), inloggningssidan, Inställningar → "Om Livskoll", raden om integritet ("Den som driver Livskoll …"), tomlägen och hjälptexter som nämner appen ("så listar Livskoll vad som finns"), och i inloggnings- och återställningsmejlens mallar

**Givet** inloggningssidan och Om-sidan
**När** de visas
**Så** står undertiteln "Mat, prylar och vardag under kontroll" under namnet

**Givet** bokmärket och delningen "Spara i Matkoll"
**När** de visas
**Så** heter de "Spara i Livskoll"; adresser, kodnamn, tabeller och repo behåller "matkoll"

**Givet** e2e- och enhetstester
**När** de körs
**Så** är tester som letar efter "Matkoll" i användartext uppdaterade, och AI-prompter och `tests/eval` är orörda

### Story 18.15: Rätta och rensa

Som Pontus,
vill jag kunna rätta enskilda prylar, lägga till det AI missade och rensa ett rum eller hela förrådet,
så att listan går att lita på och det går att börja om.

Beslut 2026-10-31 (Pontus): rättelser hålls knutna till kortet; rensa rum och hela förrådet finns men skyddas.

**Acceptance Criteria:**

**Givet** arket för en pryl (tryck på prylen i en öppen kategori)
**När** det öppnas
**Så** kan jag byta namn, byta kategori (chips med emoji), ändra var på bilden ("översta hyllan") och "Ta bort pryl" med Ångra; prylen ligger kvar på sitt kort

**Givet** ett kort i vyn Kort
**När** jag väljer "Lägg till pryl"
**Så** kan jag skriva en eller flera saker (som i "Skriv vad som finns") som blir prylar knutna till just det kortet, med kategori från ett billigt textanrop (eller Övrigt om AI inte svarar)

**Givet** "Ta om" på ett kort
**När** arket visas
**Så** står det att rättelser och tillagda prylar på det gamla kortet ersätts av den nya läsningen

**Givet** ⋯ på ett rum
**När** jag väljer "Rensa rummet"
**Så** visar ett ark vad som försvinner ("74 prylar, 9 kort, 2 lådor"), att det inte går att ångra, och kräver att jag skriver rummets namn; först då tas rummets kort, bilder, prylar, inskrivna lådor och platser bort

**Givet** Inställningar → Boenden → ett boende
**När** jag väljer "Rensa förrådet i Hemma"
**Så** visas på samma sätt vad som försvinner och jag måste skriva "RENSA"; då tas allt i Förrådet för boendet bort (Matvaror rörs inte)

**Givet** lagringen
**När** något rensas
**Så** tas även bildfilerna bort, allt sker för den inloggade användaren bara (radskydd, isoleringstest), och ändringen av prylar knutna till kort är bakåtkompatibel

### Story 18.16: Lägga till bilder enkelt

Som Pontus,
vill jag tydligt kunna fota eller välja bilder från Bilder, och rätta rum och delar som blev fel,
så att det inte är stökigt att fylla Förrådet.

Beslut 2026-10-31 (Pontus): byggs före 17.9.

**Acceptance Criteria:**

**Givet** arket "Var tar du kortet?" (från Förrådets startsida och rumssidan)
**När** det öppnas
**Så** visas rummet överst (senast använda förvalt, "+ Nytt rum", "Mer exakt plats (valfritt)") och därunder två lika stora, tydliga knappar sida vid sida: "📷 Ta foto" (öppnar kameran på telefon; på dator samma som nästa) och "🖼️ Välj från Bilder" (bildbiblioteket på iPhone, filfönstret på dator där Bilder finns i sidofältet; flera bilder på en gång)

**Givet** rumssidan
**När** jag ser den
**Så** finns samma två knappar direkt på sidan i stället för raden "Ta fler kort" (rummet är redan valt), med "Senaste kort 31 okt" som metatext

**Givet** en HEIC-bild (iPhone) i en webbläsare som inte kan läsa HEIC (t.ex. Chrome på Mac)
**När** jag väljer den
**Så** görs den om till JPEG i webbläsaren innan den skalas ner och laddas upp, och kortet läses som vanligt; misslyckas omvandlingen står ett lugnt fel per bild

**Givet** ⋯ på ett rum
**När** jag väljer "Byt namn på rummet"
**Så** kan jag ge rummet ett nytt namn (finns namnet redan i boendet slås rummen ihop efter en fråga)

**Givet** en del eller låda i ett rum (i listan "Lådor"/delar och i vyn Kort)
**När** jag öppnar dess ⋯
**Så** kan jag byta namn eller ta bort den; ta bort frågar först, visar vad som försvinner (kort och prylar) och tar bort delen med dess kort, bilder och prylar

**Givet** ett kort i vyn Kort som "Kunde inte läsas" eller har fastnat i läsningen
**När** jag ser det
**Så** har det både "Försök igen" och "Ta bort" (samma borttagning med "Ångra" som ett färdigt kort)

**Givet** mörkt läge, 375 px och 200 % text
**När** jag ser arket och rumssidan
**Så** finns ingen sidledes rullning och alla mål är minst 44 px

### Story 18.17: Ett fält – sök eller fråga

Som Pontus,
vill jag ha ett enda fält för att söka och fråga i Förrådet,
så att jag inte undrar vilket av två fält jag ska använda.

Beslut 2026-10-31 (Pontus): sökfältet (18.4) och chatten (18.14) slås ihop.

**Acceptance Criteria:**

**Givet** Förrådets startsida
**När** jag ser den
**Så** finns ett enda fält "Sök eller fråga …" under "Ta kort" (inget separat sökfält)

**Givet** att jag skriver i fältet
**När** jag har skrivit minst två tecken
**Så** visas matchande prylar direkt under fältet utan AI (databassökningen från 18.14, med plats, boende och kortdatum, tryckbara), uppdaterat medan jag skriver

**Givet** text i fältet
**När** jag trycker ↑ eller Enter
**Så** skickas texten som en fråga till chatten (AI, som i 18.14) och svaret visas som en chattbubbla med referens; följdfrågor och "Ny fråga" fungerar som förut, och direktträffarna döljs medan ett samtal pågår

**Givet** ett tomt fält
**När** jag ser det
**Så** finns en kort hjälptext, t.ex. "Skriv för att söka – tryck ↑ för att fråga"

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder fältet
**Så** finns ingen sidledes rullning och alla mål är minst 44 px

### Story 18.18: Försäkringsunderlag (PDF)

Pausad (Pontus 2026-10-31). En knapp "Försäkringsunderlag" som gör en PDF per boende med rum, foton, prylar och datum från Förrådet, att ha vid brand eller inbrott. Valfritt värde på dyra saker. Inga kvitton eller värderingar i övrigt. Byggs när Förrådet använts ett tag.

### Story 18.19: Kom ihåg var jag lade den

Som Pontus,
vill jag kunna skriva "passen ligger i översta byrålådan" och senare fråga var de är,
så att jag hittar saker som aldrig fotats.

Beslut 2026-10-31 (Pontus): backlog. Hänger ihop med Story 17.9 (Siri) och lägger grunden för föremål utan foto (också för försäkringsunderlaget, 18.18).
Beslut Pontus 2026-10-31: kör 18.19; byggd utan förhandsgodkännande av mockupen. Tillägg samma kväll (Pontus om "coca-cola": "får massor av alternativ. Jag ville veta var det jag sökte fanns."): en kort sökning svaras av databasen utan AI, svaret först, bästa träffar före "Liknande", och träffraden visar namn, rum · del och kortets bild. Mockup: `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/kom-ihag.html` ("Idag" är skärmdumpar, "Nytt" och punktlistorna är specen; namn, rum och datum är bara exempel).

**Acceptance Criteria:**

**Givet** ett boende med minst ett rum, också utan föremål
**När** jag öppnar Förrådet
**Så** finns fältet "Sök eller fråga" (så att Kom ihåg går att använda innan något är fotat); bara ett boende utan rum visar i stället det tomma läget utan fält

**Givet** fältet "Sök eller fråga" i Förrådet
**När** det är tomt
**Så** står tipsraden "Skriv för att söka – tryck ↑ för att fråga eller spara var något ligger"

**Givet** att jag skriver i fältet
**När** jag inte har tryckt ↑ eller Enter
**Så** anropas ingen AI; databasen söker som förut, och när inget matchar står "Inga föremål matchar "…"." med raden "Tryck ↑ för att fråga, eller för att spara var det ligger." under

**Givet** ett påstående om var något ligger ("Passen ligger i översta byrålådan i sovrummet")
**När** jag trycker ↑ eller Enter
**Så** avgör samma AI-anrop som tar fram sökorden att det är något att komma ihåg (inte en fråga eller en sökning, som fungerar som förut), och svarsbubblan säger "Ska jag komma ihåg var det ligger?" med ett förslagskort (📝, föremålets namn "Pass" och "Sovrummet · Översta byrålådan") och knapparna "Kom ihåg" och "Ändra"; inget är sparat än

**Givet** förslaget
**När** rummet finns i boendet med ett annat skrivsätt ("sovrummet") eller inte finns alls
**Så** används det befintliga rummets namn, respektive står etiketten "nytt rum" efter namnet; en del som redan finns i rummet används igen, och utan rum i meningen står "Välj rum" och knappen "Välj rum" öppnar Ändra

**Givet** ett föremål med samma namn som jag redan har skrivit in
**När** förslaget visas
**Så** står "Låg förut i <rum · del> (skrivet <datum>)." under kortet, och "Kom ihåg" flyttar det i stället för att göra ett till

**Givet** "Ändra"
**När** jag trycker
**Så** öppnas ett blad med föremålets namn som rubrik och "Avbryt", fälten "Föremål", "Rum" (med mina rum som chips; chipet som stämmer är fyllt grönt) och "Del av rummet (valfritt)", och knappen "Kom ihåg" sparar och stänger; tomt namn eller rum ger felet under fältet

**Givet** "Kom ihåg"
**När** det är sparat
**Så** blir bubblan "Klart. Pass ligger i Sovrummet · Översta byrålådan." med ett platskort (📝, "Sovrummet · Översta byrålådan", "Du skrev in det <datum>") som öppnar rummet; föremålet är sparat i det valda boendet utan kort och utan foto, och rummets siffror räknar det; går det inte att spara står felet i bubblan och knapparna finns kvar

**Givet** ett inskrivet föremål
**När** jag öppnar rummet
**Så** står det under sin kategori med "<del> · skrivet <datum>" till höger, delen står under DELAR med "1 föremål", och Kort-vyn är oförändrad

**Givet** ett inskrivet föremål
**När** jag skriver "pass" i fältet
**Så** hittar sökningen det med raden "Sovrummet, Översta byrålådan · Hemma · skrivet <datum>"

**Givet** ett inskrivet föremål
**När** jag frågar "var är passen?"
**Så** svarar chatten med platsen och att jag själv skrev in det, med datum, och platskortet säger "Du skrev in det <datum>"

**Givet** ett inskrivet föremål
**När** jag trycker på dess rad i rummet
**Så** öppnas samma blad som för andra föremål, med raden "Du skrev in det <datum> · <del>" och utan "Var på bilden"; Spara ändrar namn och kategori, och "Ta bort föremål" tar bort det med "Tog bort Pass." och Ångra

**Givet** en kort sökning (ett till tre ord utan frågetecken, utan frågeord som "var", "har", "hur" först och utan "ligger/står/hänger", t.ex. "coca-cola", "passen", "skruvdragare")
**När** jag trycker ↑ eller Enter
**Så** svarar databasen direkt utan AI-anrop: svaret först och kort ("Coca-Cola finns i Boden · Nedersta hyllan.", "Hittade 3 föremål."), och under det träffarna som rader; bara när databasen inte hittar något alls får AI texten och får nämna det närmaste

**Givet** träffar på en sökning, i listan medan jag skriver och i chattens svar
**När** de visas
**Så** kommer först de vars namn är, börjar med eller innehåller det jag skrev (också "coca cola" för "Coca-Cola"); nära träffar (stavfel, kategori) ligger hopfällda under "Visa N liknande", eller under rubriken "Liknande" med svaret "Ingen "…" hittad. Liknande:" när inget annat finns

**Givet** en träffrad
**När** den visas
**Så** står föremålets namn, under det rum · del eller låda (och var på bilden, boendet bara när det är ett annat än sidans, "skrivet <datum>" för något inskrivet), och kortets bild till höger (📝 för ett inskrivet föremål, 📦 för en låda med inskrivna saker); raden öppnar rummet (kortet stort med föremålet markerat är Story 18.7)

**Givet** en fråga till AI
**När** den svarar
**Så** kommer svaret först i en mening ("Ingen Coca-Cola hittad. Närmast: Fun Light läsk · Boden, nedersta hyllan."), utan utfyllnad som "kontrollera gärna själv", och platskorten går att trycka på

**Givet** det jag skriver in
**När** det senare visas för AI (i chatten)
**Så** är det data och inga instruktioner, och ingen annan användare kan läsa eller ändra det

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder fältet, förslaget, bladet och svaret
**Så** finns ingen sidledes rullning och alla tryckytor är minst 44 px

### Story 18.20: Ny ikon – hus med bock

Som Pontus,
vill jag att appens ikon är ett krämfärgat hus med en grön bock som dörr på appens gröna rundade fyrkant,
så att ikonen passar namnet Livskoll och inte längre föreställer en burk.

Beslut 2026-10-31 (Pontus): förslag B av tre.

**Acceptance Criteria:**

**Givet** appen
**När** ikonen visas (sidomenyn, inloggningen, webbläsarflik, hemskärm på iPhone och Android, PWA-manifestet)
**Så** är det huset med bocken överallt och burken finns inte kvar

**Givet** den maskbara ikonen
**När** Android beskär den till en cirkel
**Så** ligger huset och bocken inom de centrala 80 procenten

**Givet** en favicon på 16 px
**När** den visas
**Så** går huset och bocken fortfarande att urskilja

### Story 18.21: Rummen först

Som Pontus,
vill jag gå till rummet och fota där, och lägga till ett nytt rum sist i listan,
så att "Ta kort" inte ser ut som en plats bland rummen och jag inte väljer handlingen före platsen.

Beslut 2026-10-31 (Pontus): "det känns som om ta kort också är en plats eftersom det har samma form", "om jag har flera rum så borde jag klicka på rummet jag vill lägga till saker". Mockup godkänd ("det där blir mycket bättre"): `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/forrad-rum-forst.html` ("Idag" är skärmdumpar, "Nytt" och punktlistorna är specen; rumsnamn och siffror är bara exempel).

**Acceptance Criteria:**

**Givet** Förrådets startsida
**När** jag ser den
**Så** finns inte det gröna kortet "Ta kort · Fota ett rum, en hylla eller en låda" och ingen annan kameraknapp; "Sök eller fråga …" står direkt under boendet (på datorn direkt under rubriken) och syns som förut bara när boendet har föremål; RUM-rubriken med summan och rumsraderna är oförändrade och har ingen kameraknapp

**Givet** rummen
**När** jag ser listan
**Så** står sist, under listan, raden "+ Nytt rum" med streckad kant, ingen vit bakgrund och grön text, minst 44 px hög

**Givet** "+ Nytt rum"
**När** jag trycker
**Så** öppnas ett blad "Nytt rum" med Avbryt, fältet "Namn på rummet" (fokus direkt, exempel Garaget), en kort hjälptext och knappen "Skapa rum"; "Skapa rum" skapar rummet och tar mig till dess sida, redo att fota, och rummet syns i listan med "Inget kort än"

**Givet** bladet "Nytt rum"
**När** namnet är tomt eller rummet redan finns (samma namn)
**Så** visas felet under fältet som i dagens Ta kort-blad, respektive går jag till det befintliga rummet i stället för att få ett nytt likadant

**Givet** ett boende utan rum
**När** jag ser sidan
**Så** står texten "Börja med ett rum, som Förrådet eller Garaget." och under den "+ Nytt rum", utan RUM-rubrik och utan sökfält

**Givet** rummets sida
**När** jag använder den
**Så** är den oförändrad: Ta foto, Välj från Bilder, Mer exakt plats … (med dagens blad), Skickar …, Skickat och Ta ett till

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder startsidan och bladet
**Så** finns ingen sidledes rullning och alla tryckytor är minst 44 px

### Story 18.22: Föremål i stället för prylar

Som Pontus,
vill jag att sakerna i Förrådet heter "föremål" i stället för "prylar",
så att ordet inte grumlar vad det är (pass, verktyg och kläder är inte "prylar").

Beslut 2026-10-31 (Pontus): "föremål" valt av saker, grejer, föremål och ägodelar.

**Acceptance Criteria:**

**Givet** appen
**När** den visar Förrådets saker (rumsrader, summor, boendemenyn, Inställningar → Boenden, rummets och lådans sidor, sökning, chatt, tomma lägen, fel, bekräftelser, AI-stegen som "Hittar prylarna …")
**Så** står "föremål" (ett föremål, föremålet, flera föremål, föremålen) och aldrig "pryl", "prylen", "prylar" eller "prylarna"

**Givet** AI:ns svar i chatten
**När** den svarar
**Så** använder den också ordet föremål (prompten säger det)

**Givet** adresser, kod, databas och loggnycklar
**När** de innehåller "prylar" eller "things"
**Så** är de oförändrade (bara text som syns ändras)

### Story 18.23: Ta och fyll på

Som Pontus,
vill jag se hur många gravljus vi har och med två tryck säga att jag tog två,
så att svaret "har vi gravljus?" håller sig ungefär sant utan att någon inventerar.

Mockup: `ux-designs/ux-Matkoll-2026-10-25/mockups/ta-fyll-pa.html`. Pontus 2026-11-01: "ja till 18.23. den tror jag blir jättebra att ha". Alla "Beslut för Pontus" byggs med förvalet: antal bara där AI:n kan räkna plus där man trycker Räkna; Ta kan inte gå under 0 och + stannar vid det Livskoll tror finns; Ta och Fyll på direkt i raden; stegaren börjar på 1; nytt kort vinner och rensar historiken; vid 0 bara "Slut", inget på inköpslistan; "har vi / finns det / var är X" svaras av databasen; historiken från senaste kortet, högst 50 rader; inga namn förrän Epic 21; bara "st"; två stories (18.23 och 18.24). Storlek L, med migration (2–3 granskare).

**Acceptance Criteria:**

**Givet** ett kort på en hylla med flera likadana förbrukningsvaror (gravljus, batterier, glödlampor)
**När** AI:n läser kortet och kan räkna dem tydligt
**Så** får föremålet ett antal ("5 st" efter namnet i förslagen); ett verktyg eller en enstaka sak får inget antal, och ett antal AI:n inte är säker på sätts inte

**Givet** att jag skriver "har vi gravljus" (eller "finns det gravljus hemma?", "var är gravljusen") och trycker ↑
**När** databasen hittar gravljus
**Så** svarar den utan AI: "Ja, 5 gravljus i Förrådet · Översta hyllan." och raden visar "5 st · Förrådet · Översta hyllan" med knapparna Ta och Fyll på; hittar den inget går frågan till AI:n som idag

**Givet** en träffrad med antal (i snabbsökningen eller i chattens svar)
**När** jag trycker Ta
**Så** byts knapparna mot en stegare − 1 + och knappen "Ta 1" som följer siffran ("Ta 2") och Avbryt; − är grå vid 1 och + vid antalet som finns; namnet, raden och bilden öppnar fortfarande kortet

**Givet** stegaren på 2
**När** jag trycker "Ta 2"
**Så** sparas ändringen direkt, raden visar "3 st", toasten säger "Tog 2 gravljus." med Ångra, och Ångra lägger tillbaka 2 och tar bort ändringen ur historiken; Fyll på fungerar likadant ("Fyllde på 2 gravljus.") utan övre gräns

**Givet** att antalet har ändrats sedan kortet
**När** jag frågar igen
**Så** säger svaret "Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 togs 1 nov, kortet 12 okt visade 5." – högst två ändringar och "och N ändringar till", inga namn

**Givet** ett föremål med 0 kvar
**När** det visas i ett svar, en träff, rummet eller arket
**Så** står "Slut" i `--ink-3` i stället för antalet, bara Fyll på finns kvar, och ingenting läggs på inköpslistan

**Givet** föremålets ark för ett föremål med antal
**När** det öppnas
**Så** står antalskortet först (siffran, Ta och Fyll på, förklaringsraden, Ändringar med högst 5 rader nyast först och "Visa alla N"), sedan Rätta antalet och Sluta räkna, sedan fälten som idag; Ta/Fyll på i arket sparar direkt och visar "Tog 1 gravljus. Ångra" i kortet

**Givet** ett föremål utan antal
**När** jag öppnar arket
**Så** står "Antal · räknas inte" med Räkna, som sätter ett antal (stegaren, "Spara antal") och loggar det som "Rättat till N"

**Givet** rummets lista
**När** ett föremål har antal
**Så** står "3 st" (eller "Slut") först i högertexten, och föremål utan antal ser ut som idag

**Givet** ett räknat föremål
**När** ett nytt kort av samma plats sparas och AI:n räknar det igen
**Så** blir antalet det nya kortets, de äldre ändringarna raderas, historiken visar "4 · Nytt kort · 5 nov" och förklaringsraden "Räknat på kortet 5 nov. 2 äldre ändringar rensades." den första veckan; räknar AI:n inte på det nya kortet är antal och historik oförändrade

**Givet** två ändringar samtidigt från två telefoner på samma konto
**När** båda sparas
**Så** gäller båda (antalet ändras med skillnaden, aldrig under 0), och isoleringstestet visar att en annan användare varken ser eller ändrar antal eller historik

### Story 18.24: Jag har köpt – var förvarar vi dem?

Som Pontus,
vill jag kunna säga "jag har köpt gravljus, var förvarar vi dem?",
så att jag får veta var de ska ligga och kan fylla på med samma tryck.

Mockup: `ux-designs/ux-Matkoll-2026-10-25/mockups/ta-fyll-pa.html` (avsnitt 8). Storlek M, efter 18.23. Backlog.

**Acceptance Criteria:**

**Givet** att jag skriver att jag köpt något och frågar var det ska ligga
**När** jag trycker ↑
**Så** avgör samma AI-anrop som tar fram sökorden att det är en påfyllning (namn och antal om det sades), och inget andra AI-anrop görs

**Givet** att föremålet finns
**När** svaret kommer
**Så** står "I Förrådet · Översta hyllan – där finns 3." med raden och Fyll på redan öppen på det sagda antalet (annars 1)

**Givet** att föremålet inte finns
**När** svaret kommer
**Så** visas Kom ihåg-förslaget från 18.19 med en plats där föremål av samma kategori ligger ("Ska de ligga i Förrådet · Översta hyllan, som gravljusen?") och antalet ("4 st"), eller "Välj rum" om ingen sådan plats finns

**Givet** Ändra i förslaget
**När** arket öppnas
**Så** finns fältet "Antal (valfritt)" med stegaren (− och +); 0 betyder "Räkna inte", och Kom ihåg sparar antalet som historikens första rad "4 · Inskrivet · <datum>"

## Epic 19: Premiumlook

Version 2.2. Appen får ett samlat premiumutseende: ett enda designsystem med tokens, lätt typografi med roller, linjeikoner, ett enda valt läge, tyst ram och mörkt läge på riktigt. Pontus (2026-10-31): "Gör proffsigt app-look-and-feel", "ta din fulla kunskap av hur premiumappar brukar vara designade". Efter att ha sett förslaget: "Bygg allt, merga allt" och "vi kör på dina förslag rakt av", så varje punkt under "Beslut för Pontus" i modellen bygger sitt förval. Modellen är ett löfte: allt som syns i "Nytt"-bilderna ska finnas i appen, i ljust och mörkt läge, vid 375 px och 200 % text.

Källor: modellen `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/premium-look.html` (principer, system med exakta tokens, 14 skärmar före/efter, sju stories P1–P7, beslut) och UX-genomlysningen `_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/ux-genomlysning-2026-10-31.html`. Story 19.1 går först; 19.2–19.5 kan byggas parallellt efter den; 19.6 och 19.7 sist.

### Story 19.1: Tokens, typsnitt och flikrad

Som Pontus,
vill jag att hela appen får en lättare typografi, mjukare hörn, ett riktigt mörkt läge, luft som inte slösas i webbläsaren och ett lägre, genomskinligt flikfält med linjeikoner,
så att appen ser ut som en färdig premiumapp redan innan varje skärm är genomgången.

Beslut (Pontus, förval i modellen): sidrubrik 30 px · 600 (inte 700); radtitlar 500 och varor 400; linjeikoner i flikfält, sidomeny och Inställningar; en enda skugga (`--shadow-float`) för ark på dator, menyer och toast; sekundärknappen vit med grön text i stället för ljusblå.

**Acceptance Criteria:**

**Givet** appen i valfri vy
**När** jag letar efter text med vikt 700 eller `font-bold`
**Så** finns ingen kvar: vikter är 400 för allt man läser, 500 för det man trycker på och för radtitlar, 600 för rubriker och knappar

**Givet** typskalan
**När** jag läser tokens i `globals.css`
**Så** finns `--page-title` 30/36 · 600 · −0,4, `--recipe-title` 26/32 · 600 · −0,3, `--section-title` 20/26 · 600 · −0,2, `--headline` 17/22 · 600, `--row-title` 17/22 · 500, `--item` 17/22 · 400, `--body` 16/24 · 400, `--control` 15/20 · 500 (vald 600), `--meta` 14/20 · 400, `--section-label` 13/18 · 500 versaler +0,5, `--badge` 12/16 · 500 och `--tab-label` 11/13 · 500 (vald 600); stegläget 24/1,4 · 500 är oförändrat

**Givet** siffror i mängder och tabeller
**När** de visas i kolumn
**Så** använder de `font-variant-numeric: tabular-nums`

**Givet** hörnen
**När** jag läser tokens
**Så** är `--rounded-xs` 6, `sm` 10, `md` 12, `lg` 16, `xl` 24 och `full` 999 px, och knappar, fält, kort och ark använder dem

**Givet** avstånden
**När** jag läser tokens
**Så** finns `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--gutter` 20, `--space-6` 24, `--space-8` 32 och `--space-10` 40 px

**Givet** ljust läge
**När** jag läser färgrollerna
**Så** är `--bg` #F5F7F4, `--surface` #FFFFFF, `--surface-2` #FFFFFF, `--fill` #EAEDEB, `--ink` #1B2420, `--ink-2` #56635D, `--ink-3` #6B7872, `--hairline` #E8ECE9, `--border` #DCE2DE, `--accent` #3E7C62, `--mint` #DDEFE5 med `--mint-ink` #2C5E48, `--sky`, `--sand` oförändrade, `--danger` #B3261E och `--scrim` #1B2420 (40 %)

**Givet** mörkt läge
**När** jag ser appen
**Så** är det designat, inte inverterat: tre ytnivåer (`--bg` #0F1311, `--surface` #181D1A, `--surface-2` #202622), `--fill` #242927, `--ink` #E6EBE8, `--ink-2` #A3AFA9, `--ink-3` #86928C, `--hairline` #262D29, `--border` #313934, `--accent` #6FB394, `--mint` #1F3A2D med `--mint-ink` #A8D9BF, `--sky` #1E3247, `--sand` #3A3326, `--danger` #E5736A och `--scrim` #000000 (60 %); korten syns utan kanter och ark och menyer lyfts med ljusare yta och hårfin ljus kant, inte skugga

**Givet** segmenten
**När** de ritas
**Så** finns tokens `--seg-track` (#E9ECEA / #1A1F1C) och `--seg-on` (#FFFFFF / #2C3430), och den valda plattan i mörkt läge syns tydligt mot skenan

**Givet** `--shadow-float`
**När** jag letar efter skuggor
**Så** finns exakt en (`0 12px 32px rgb(27 36 32 / .14), 0 0 0 .5px rgb(27 36 32 / .08)`), tillåten i `@theme`, och den används bara av det som flyger över sidan (ark som dialog på dator, menyer, toast); mörkt läge använder ingen skugga

**Givet** en sida i en webbläsarflik på 390 px
**När** den visas
**Så** börjar rubriken 16 px under kanten (`--header-top-mobile: max(16px, calc(env(safe-area-inset-top) + 8px))`, idag ~56–70 px), på hemskärmen med notch ligger den under säkra området, och på dator är luften 40 px

**Givet** Recept, Matsedel, Inköpslista och Matvaror på 390 px
**När** de öppnas
**Så** är sidrubriken 30/36 · 600 i stället för 34 · 700

**Givet** flikfältet
**När** jag ser det
**Så** är höjden `--tab-bar-height: calc(56px + env(safe-area-inset-bottom) + var(--job-row-height, 0px))` (56 px i en webbläsarflik, inte 84), ytan 84 % genomskinlig med oskärpa 20 px och en 0,5 px linje upptill, så innehållet syns svagt under

**Givet** flikarna
**När** jag ser ikonerna
**Så** är de linjeikoner (24 px rutnät, linje 1,8 px, rundade ändar, ingen fyllning) för Recept (bok), Matsedel (kalender), Inköpslista (kundvagn), Matvaror (morot) och Förråd (låda), etiketten är 11/13 · 500 och emoji (`NavEmoji`) finns inte kvar i flikfältet

**Givet** en vald flik
**När** jag ser den
**Så** har den grön ikon med svag grön fyllning (16 %) och grön etikett 600, ingen platta, ingen ram och ingen ruta, och märket för AI-jobb (rund grön etikett uppe till höger på ikonen) finns kvar

**Givet** att jag navigerar med tangentbord
**När** en flik får fokus
**Så** ritas en 2 px grön fokusring med 2 px luft runt ikon och etikett, rundad (`rounded-md`), aldrig en kantig ruta över hela fliken; med mus eller tryck syns ingen ring (`:focus-visible`), och samma fokusring gäller övriga kontroller

**Givet** sidomenyn på dator
**När** jag ser den
**Så** har den samma linjeikoner som flikfältet, vald rad i mint med text 500 (inte fet) och inga emoji

**Givet** fet text som inte är rubrik eller knapp (filterpiller, "Senast tillagda", Kort/Lista, textknappar, listposter)
**När** jag ser den
**Så** är den 500 eller 400 enligt rollen

**Givet** `DESIGN.md`
**När** jag läser den
**Så** beskriver Typography, Layout, Elevation (en skugga), Colors (`--danger`, nya roller) och Do's and Don'ts det nya systemet

**Givet** `tests/design/contrast.test.ts`
**När** den körs
**Så** täcker den de nya paren i båda lägena (text minst 4,5:1, ikoner och kontroller minst 3:1, bl.a. `--ink-3` på yta, `--danger` på yta, `--mint-ink` på `--mint`, vald segmentplatta mot skena) och är grön

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder appen
**Så** finns ingen sidledes rullning, alla tryckytor är minst 44 px och flikfältets etiketter bryts mellan orddelar

### Story 19.2: Sidhuvud, P-knappen, Hjälp och Boende

Som Pontus,
vill jag ha samma sidhuvud med avatar på alla flikar, en sida för hjälp och tips och ett enda sätt att se och byta boende,
så att jag alltid vet var inställningar och hjälp finns och boendet inte visas på fem olika sätt.

Beslut (Pontus, förval i modellen): rubriken fälls ihop till en smal list med titeln i mitten; Inställningar och Hjälp nås från avataren; kugghjulet på Recept tas bort.

**Acceptance Criteria:**

**Givet** någon av de fem flikarna på mobil
**När** jag ser sidhuvudet
**Så** står rubriken 30/36 · 600 till vänster och flikens egen handling samt avataren P (32 px mint cirkel i en 44 px tryckyta, initial från kontot) till höger på samma rad, vertikalt centrerade mot rubriken, med 16 px luft ovanför i en webbläsarflik

**Givet** flikens egen knapp
**När** jag ser den
**Så** är den alltid en ikonknapp i samma storlek (44 × 44 yta, ikon 24 px, grön): Recept +, Matsedel +, Inköpslista Erbjudanden (etikett-ikon, grå, heter "Erbjudanden" för skärmläsare), Matvaror +, Förråd ingen; kugghjulet på Recept är borta och Förrådets sidhuvud är ändå lika högt som de andras så att rubriken inte hoppar

**Givet** att rubriken har scrollat ut ur bild
**När** jag scrollar
**Så** tonar en smal list in (52 px inklusive 4 px luft) med titeln 17/22 · 600 centrerad, samma knappar till höger, 84 % genomskinlig yta med oskärpa och en hårfin linje i underkant, och ovanför den är sidan helt fri

**Givet** att rubriken växlar mellan stor och list
**När** det sker
**Så** tonar bara listen (150 ms), texten animeras inte mellan storlekarna, och med "Minska rörelse" och på webben fungerar det lika

**Givet** avataren
**När** jag trycker på P
**Så** öppnas ett litet ark med avatar, namn och e-post som rubrik, "Klar" till höger, raderna "Inställningar ›" och "Hjälp och tips ›" (den senare visar "Om Recept" osv. efter flik) och under dem knappen "Logga ut" (grå, med ikon, inte röd, ingen fråga)

**Givet** Inställningar och Hjälp och tips
**När** jag öppnar dem
**Så** är ingen flik markerad, raden ovanför rubriken heter "‹ föräldersidans namn" (t.ex. "‹ Recept", "‹ Inställningar"), det finns ingen avatar och i ark heter det alltid "‹ Tillbaka"

**Givet** sidan Hjälp och tips (`/hjalp`)
**När** jag öppnar den
**Så** har den ett avsnitt per flik i flikordning, överst en chips-rad Recept · Matsedel · Inköpslista · Matvaror · Förråd som hoppar till avsnittet och följer med när jag scrollar, och öppnad från en flik (`#recept` osv.) hamnar den på den flikens avsnitt med chipet valt

**Givet** Inköpslistans "Så funkar det"
**När** jag söker efter det
**Så** har det flyttat till Hjälp och tips som avsnittet Inköpslista, och texterna beskriver det appen faktiskt gör

**Givet** sidomenyn på dator
**När** jag ser nederdelen
**Så** finns en hårfin linje, sedan P med namn och e-post, "Hjälp och tips" (öppnas på avsnittet för sidan jag står på), "Inställningar" och "Logga ut", och ingen avatar finns i sidhuvudet på dator

**Givet** att kontot saknar namn
**När** namnet ska visas
**Så** visas e-postens första del

**Givet** Matsedel, Inköpslista, Matvaror eller Förråd och fler än ett boende
**När** jag ser sidan
**Så** står "📍 Hemma ⌄" (nålen som linjeikon, 14 px grått) direkt under rubriken, och med bara ett boende visas inget

**Givet** boende-väljaren
**När** jag trycker på den
**Så** öppnas alltid samma ark "Boende" med rader med bock på det valda, "Klar" och "Hantera boenden ›" sist, och "Boende: Hemma · Byt", "Räkna listan mot" och "Boende: Hemma" finns inte kvar

**Givet** dator och ett recept
**När** jag letar efter boendet
**Så** visas det på dator bara i sidomenyn, och på ett recept bara som text i metaraden ("2 av 8 hemma i Hemma")

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder sidhuvudet
**Så** bryts rubriken före att knapparna flyttar, inget sidledes rullande uppstår och alla tryckytor är minst 44 px

### Story 19.3: Valt läge: Chip, Segment och Recept-filtren

Som Pontus,
vill jag att valt alltid ser likadant ut och att Recept-filtren tar en rad,
så att jag ser fler recept direkt och aldrig undrar vad som är valt.

Beslut (Pontus, förval i modellen): "Alla"-chipet på Recept försvinner (inget valt = alla recept); sekundärknappen vit med grön text.

**Acceptance Criteria:**

**Givet** val som byter vy av samma sak (vecka, Kyl/Frys/Skafferi, Kort/Lista, Länk/Text/Foto i Importera, Erbjudandenas sortering)
**När** de ritas
**Så** är de ett Segment: skena `--seg-track`, hörn 12, 3 px inre luft, vald platta `--seg-on` med 1 px `--border` och text 15/600 `--ink`, ovalda 15/500 `--ink-2`, 40 px synligt (46 med två rader), 44 px tryckyta, radiogrupp med piltangenter, och den gamla `FilterPills segmented` och `.segment-on` finns inte kvar

**Givet** val som filtrerar eller väljer (kategorier, Plats, Enhet, Rum, Erbjudandenas filter)
**När** de ritas
**Så** är de ett Chip: 32 px, helt runt, 12 px sidluft, 44 px tryckyta; ovalt `--surface` med 1 px `--border` och text 15/500 `--ink-2`; valt `--accent` med `--on-accent` 15/600; bredden reserverad för 600 så att chipet inte hoppar; radiogrupp eller toggle som idag

**Givet** valt läge i appen
**När** jag söker efter `bg-accent text-on-accent` och `border-accent` som markering utanför Chip och Button
**Så** finns inga träffar: tre sorter (segment, chip, rad med bock) och inga andra

**Givet** Recept på 390 px
**När** jag ser filtren
**Så** tar de en enda rad: Favoriter · Kan lagas nu, en tunn avdelare, sedan Kött · Fågel · Vegetariskt · Sallad · Gryta · Snabbt, raden scrollar i sidled inuti raden (aldrig sidan) och tonar ut mot högerkanten

**Givet** receptfiltren
**När** inget chip är valt
**Så** visas alla recept; "Alla" finns inte, och ett tryck på ett valt chip väljer bort det

**Givet** kategorierna
**När** jag ser dem
**Så** har de ingen emoji-platta, bara namnet, och valt ser likadant ut i båda grupperna (fylld grön med vit text 600)

**Givet** raden under filtren
**När** jag ser den
**Så** står "5 recept" (14 px grå), sorteringen som en lugn knapp med sorteringsikon och "Senast tillagda" 15/500 grå (inte grön och fet, ingen ▾), och Kort/Lista som två ikoner i ett segment med vit platta

**Givet** Recept på 390 × 844
**När** jag ser sidan
**Så** är filterområdet ~140 px högt (idag ~265) och första receptkortet börjar under 210 px

**Givet** Matvaror
**När** jag ser Kyl, Frys och Skafferi
**Så** är de ett segment med linjeikon + namn + "15 varor" på två rader, 48 px, utan emoji 🧊 ❄️ 🥫

**Givet** Matsedelns veckoväljare
**När** jag ser den
**Så** är den ett segment (vit platta med hårfin kant på grå skena, ingen skugga), vald vecka 15/600 med "2 rätter" i grönt 12 px, ovalda 15/500 grått

**Givet** mörkt läge
**När** jag ser segment och chips
**Så** syns den valda plattan (#2C3430) tydligt mot skenan och ovalda chips har en hårfin kant

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder filtren
**Så** scrollar pillerraden i sidled i stället för att bryta, inget annat rullar sidledes och alla mål är minst 44 px

### Story 19.4: Arken: rubrikregeln och Ta bort

Som Pontus,
vill jag att alla ark har samma rubrikrad och att Ta bort ser likadant ut överallt,
så att jag vet vad ett ark gör och inte råkar ta bort något.

Beslut (Pontus, förval i modellen): arkrubriken är saken ("Lime"), verbet står på knappen ("Spara ändringar"); ta bort i dämpad röd (`--danger`); en skugga för ark på dator.

**Acceptance Criteria:**

**Givet** ett ark
**När** jag ser rubrikraden
**Så** är titeln 20/26 · 600 och stängknappen "Avbryt" (om arket har ett formulär som inte är sparat; osparade ändringar frågar "Släng ändringarna?" som idag) eller "Klar" (om allt sparas direkt eller arket bara visar något), 17/500, aldrig "Stäng"

**Givet** Importera recept, Sortera, Ändra recept, Spara AI-förslag, Fotot av kylen och Laga nu
**När** jag öppnar dem
**Så** står inte "Stäng" någonstans utan Avbryt eller Klar enligt regeln, och Fler val, Boende, Veckans erbjudanden, AI-jobb och avatar-arket har "Klar"

**Givet** ett steg in i ett ark (Byt vara, välja butik)
**När** det visas
**Så** byter arket innehåll med 180 ms sidledes glid, "‹ Tillbaka" står till vänster och stegets namn i mitten, och det finns aldrig två rubrikrader eller en andra Avbryt

**Givet** alla cirka 40 ark
**När** jag läser rubrikerna
**Så** heter en sak som finns som saken ("Gul lök", "Spagettipumpa", "Veckans erbjudanden"), en sak som inte finns än som handlingen ("Lägg till vara", "Nytt rum", "Lägg till rätt på torsdag") och ett frågeark som frågan ("Ta bort Spagettipumpa?" med "Det går inte att ångra." under); "Lagervara", "Pryl" och "Ta bort" som rubriker finns inte kvar, och verbet står på primärknappen

**Givet** Lagervara-arket
**När** jag öppnar det
**Så** är rubriken varans namn, Avbryt uppe till höger, fält-etiketter 15/500, fält 48 px med kant i `--border` och hörn 12, och valfria fält har "(valfritt)" i 400 `--ink-2`

**Givet** en knapp med `variant="destructive"`
**När** den visas
**Så** är den text i `--danger` med soptunna, 17/500, sist i arket under en hårfin linje, aldrig fylld, och ingen grön Ta bort-knapp finns kvar; inga andra röda element finns

**Givet** ett frågeark för borttagning
**När** det visas
**Så** är rubriken frågan, följden står under, knappen "Ta bort" är 50 px med text `--danger` 17/600 på `--fill` och "Avbryt" är en textknapp

**Givet** något som inte går att ångra (recept, hel matsedel, foto, rensa förråd)
**När** jag trycker Ta bort
**Så** frågar appen först

**Givet** allt annat som tas bort (t.ex. en listpost eller vara)
**När** jag trycker Ta bort
**Så** tas det bort direkt och toasten "Tog bort X." visas med Ångra i 5 s (aldrig "X är borttagen."), och listposten frågar inte längre

**Givet** receptvyn
**När** jag letar efter soptunnan
**Så** ligger den inte bredvid hjärtat utan i ⋯-menyn efter Ändra, sist, i `--danger`

**Givet** mobil
**När** ett ark öppnas
**Så** har det överkant 24 px, handtag 36 × 5, glider upp 240 ms med `cubic-bezier(.2,.8,.2,1)` och slöjan tonar in 200 ms

**Givet** dator
**När** ett ark öppnas
**Så** är det en dialog i mitten, högst 560 px, hörn 20 och `--shadow-float`

**Givet** "Minska rörelse"
**När** ett ark öppnas eller byter steg
**Så** står allt still

**Givet** `EXPERIENCE.md`
**När** jag läser den
**Så** står rubrikregeln och Ta bort-regeln där

**Givet** mörkt läge, 375 px och 200 % text
**När** jag använder ett ark
**Så** finns ingen sidledes rullning, rubriken bryts i stället för att kapas och alla mål är minst 44 px

### Story 19.5: Formulär i ark: val med bock, stegräknare, (valfritt)

Som Pontus,
vill jag välja med chips och rader med bock och ändra mängder med − och +,
så att formulären känns som en app och inte som en webbsida.

Beslut (Pontus, förval i modellen): Plats och Rum som chips; Enhet som chips med ett steg in för resten.

**Acceptance Criteria:**

**Givet** appen
**När** jag letar efter webbformulärlistor (`<select>`)
**Så** finns inga kvar

**Givet** Enhet i Lagervara, listpost och egen vara
**När** jag väljer enhet
**Så** visas chips (st · förp · kruka · klyfta · g · Fler ›) och "Fler" öppnar ett steg in ("‹ Tillbaka", Enhet) med alla enheter som rader med bock

**Givet** val bland fler än ~4 i ett ark (boende, dag i Lägg till rätt, butik, Kopiera till)
**När** de visas
**Så** är de rader med bock: ingen bakgrund på vald rad, bara en grön bock till höger

**Givet** Plats och Rum
**När** jag väljer
**Så** är de chips: Kyl vald (fylld grön, vit text 600), Frys och Skafferi vita med kant

**Givet** en räknebar enhet (st, förp, kruka, klyfta, burk)
**När** jag ändrar mängd i Lagervara, listpost, egen vara eller Markera som lagad
**Så** finns en stegräknare − 1 + (som portioner), och siffran går också att skriva i

**Givet** enheten g, dl eller ml
**När** jag väljer den
**Så** byts stegräknaren mot ett fält med enheten efter

**Givet** Markera som lagad
**När** jag ser "Kvar efteråt"
**Så** står "Receptet använder 1 st" i stället för "1 st – 1 st → 0 st"

**Givet** Lägg till rätt
**När** jag öppnar arket
**Så** är rubriken "Lägg till rätt på torsdag", sökfältet står direkt och den blå "Välj recept" är borta

**Givet** valfria fält
**När** jag ser etiketten
**Så** står "(valfritt)" i 400 `--ink-2`, och hjälptexten "Lämna mängden tom om du inte vill räkna." finns kvar

**Givet** mörkt läge, 375 px och 200 % text
**När** jag fyller i ett formulär
**Så** bryts chips-raden till flera rader eller scrollar utan sidledes sidrullning och alla mål är minst 44 px

### Story 19.6: Skärmpass Recept och Matsedel

Som Pontus,
vill jag att Recept, receptvyn och Matsedel ser ut precis som modellerna 1–7,
så att de känns färdiga i ljust, mörkt, mobil och dator.

**Acceptance Criteria:**

**Givet** receptkortet
**När** jag ser det
**Så** ligger hjärtat uppe till höger på bilden (32 px rund, matt glas, mörkt glas i mörkt läge), etiketten "Saknar 6 varor" nere till vänster 12/500 på en rad, titeln är 15/20 · 600 på högst två rader, metadata 13 px, hörn 16 och bildhöjden är densamma med och utan foto (64/104 px-skillnaden är borta)

**Givet** receptlistan
**När** jag ser den
**Så** är raderna 72 px med bild 56 px (hörn 10), titel 17/22 · 500 på en rad med "…", under den "45 min · 4 port. · Saknar 6 varor" där statusen står i sin färg och 500 (inte fet), avdelare som börjar vid texten och hjärtat grått 22 px i en 44 px yta

**Givet** Recept på dator (1280 px)
**När** jag ser sidan
**Så** är ramen 960 px (andra sidor 720 px), korten står i tre kolumner med 180 px höga bilder, sökfältet (360 px) och filterchips står på samma rad och sortering samt Kort/Lista på raden under, och rubriken har 40 px luft ovanför

**Givet** ett recept (390 px)
**När** jag ser receptvyn
**Så** ligger tillbaka (bara pil, heter "Tillbaka" för skärmläsare), hjärta och ⋯ som runda glasknappar på bilden (40 px synligt, 44 tryckyta), titeln är 26/32 · 600, källan står på samma rad som tiden som länk med liten pil ↗, portionsväljaren är en låg kapsel (40 px) med "2 av 8 hemma i Hemma" på samma rad till höger och den separata raden "Boende: Hemma" är borta

**Givet** ett recept med saknade varor
**När** jag ser det
**Så** visas ett kort med ring-ikon, "Saknar 6 varor" 15/500 blått och namnen under (inte "Saknar: kycklingfilé, morot +4")

**Givet** ingredienserna
**När** jag ser dem
**Så** har varje rad ring (saknas) eller bock (hemma) till vänster, namnet 17/400 och mängden till höger i blått om den saknas

**Givet** knappraden på receptet
**När** jag ser den
**Så** ligger den på samma glasyta som flikfältet med "Lägg på matsedeln" som primär och "Laga nu" i mint (inte ljusblå), och på dator ligger den i kolumnen under portionerna, inte över stegen

**Givet** receptets ⋯-meny
**När** jag öppnar den
**Så** innehåller den Ändra och sist Ta bort (fråga först: "Ta bort Caesarkyckling med rostade rotfrukter?", "Det går inte att ångra.")

**Givet** Matsedel (390 px)
**När** jag ser sidan
**Så** står veckoraden utan 📅-platta ("v. 45 · 2 nov – 8 nov" grått och "Tidigare ›" som grön textknapp 15/500, inte fet), "Inköpslista för vecka 45" har en kundvagn som linjeikon på blå platta, och dagarna ligger i ett enda kort med veckodag 12/500 grå över datum 20/600

**Givet** en tom dag
**När** jag ser den
**Så** står "+ Lägg till" i grått 15/500 (inte fem gröna feta)

**Givet** en rätt på Matsedeln
**När** jag ser den
**Så** är bilden 56 px, titeln 17/22 · 500 på högst två rader med "…" och ordbrytning bara mellan ord (aldrig "kycklingfärsburgar-e"), "✓ Allt hemma" i grön 13/500 eller "13 av 14 hemma" med en tunn mätare

**Givet** en tom vecka
**När** jag ser den
**Så** visas tomma läget "Den här veckan är tom." med "Rätterna du lägger här blir din inköpslista." och textknappen "Nästa vecka har 2 rätter ›"

**Givet** Matsedel på dator
**När** jag ser veckoväljaren
**Så** är den 480 px bred i stället för hela innehållsbredden

**Givet** Tidigare matsedlar
**När** jag öppnar dem
**Så** finns inga dubbletter av "Vecka 44", ordet "undanlagd" är borta och borttagning frågar "Ta bort vecka 44?"

**Givet** Recept, receptvyn och Matsedel
**När** jag jämför med modellerna 1–7
**Så** stämmer de i ljust, mörkt, 390 och 1280 px, vid 375 px och 200 % text utan sidledes rullning

### Story 19.7: Skärmpass Inköpslista, Matvaror, Förråd, Inställningar och ordlista

Som Pontus,
vill jag att Inköpslista, Matvaror, Förråd och Inställningar ser ut som modellerna 8–14 och att samma sak alltid heter samma sak,
så att hela appen känns som en helhet.

**Acceptance Criteria:**

**Givet** Inköpslistan
**När** jag ser sidhuvudet och framsteget
**Så** är "Erbjudanden" en ikonknapp (etikett-ikon, grå) bredvid avataren, "2 varor kvar" 17/600, "0 av 2 i korgen" grått och mätaren 6 px

**Givet** kategorirubrikerna (Inköpslista och Matvaror)
**När** jag ser dem
**Så** finns emoji-plattan kvar (den är innehåll) och namnet är 13/500 versaler

**Givet** en listpost
**När** jag ser den
**Så** har den en rund bock 24 px, namnet 17/400, mängden till höger i grått och en soptunna 20 px grå

**Givet** en vara från ett recept
**När** jag ser raden
**Så** står "Till Panerad kycklingfärsburgare …" (eller "Till 2 rätter") på en rad med "…", och en egen vara har etiketten "Egen" (12/500, neutral platta i `--border`, text `--ink-2`, samma form som erbjudande- och produktetiketterna)

**Givet** en listpost
**När** jag trycker på raden
**Så** öppnas arket med avsnittet "Behövs till": en rad per rätt med mängd, eller "Du lade till den själv"

**Givet** botten av listan
**När** jag ser den
**Så** är "Lägg till egen vara" en textrad med + sist i listan (inte en stor blå knapp), "Kopiera till ICA-varukorgen" står ensam längst ned som vit sekundärknapp och "Dela listan" som textknapp under

**Givet** att jag tar bort en listpost
**När** jag trycker på soptunnan
**Så** tas den bort direkt med "Tog bort Kaffe." och Ångra (ingen fråga först)

**Givet** Matvaror
**När** jag ser sidan
**Så** är Fotografera kylen en vit sekundärknapp med kamera och "Välj bild" en textknapp bredvid, "Senaste foto 29 okt 06:46" står på en tunn rad under med "Visa" till höger (inte ett kort med › och en länk inuti), varunamnen är 17/400, mängden 15 px grå, raderna 52 px och avdelarna börjar vid texten

**Givet** att jag tar bort en vara i Matvaror
**När** jag trycker Ta bort
**Så** tas den bort direkt med "Tog bort Lime." och Ångra

**Givet** Förråd utan föremål
**När** jag ser startsidan
**Så** står rummen direkt under boendet (inget grönt "Ta kort"-kort), rubriken "3 rum · 0 föremål" (inte "prylar"), rummens emoji på 36 px plattor, namnet 17/500, "Inget kort än" 14 px grått, sist en streckad rad "+ Nytt rum" (grön text, ingen vit yta, 52 px), och sökfältet "Sök eller fråga …" visas bara när boendet har föremål

**Givet** Inställningar
**När** jag öppnar dem från avataren
**Så** står kontot överst som ett kort med avatar, namn och e-post (inte 👤), raderna har linjeikoner på tonade plattor (30 px, hörn 8; mint, sky, sand, syren) i stället för emoji, text 17/400, värdet 15 px grått till höger och en liten grå pil, sektionsetiketterna är 13/500, avdelarna börjar vid texten och "‹ Recept" ligger på en egen rad så att listan flyttar upp ~40 px

**Givet** undersidor med handlingar
**När** jag ser "Byt lösenord" och "Rensa förrådet i Nordan"
**Så** är de knappar, inte rader med ›, och Rensa är destruktiv (dämpad röd, sist, med fråga eftersom det inte går att ångra)

**Givet** ett tomt läge
**När** jag ser det
**Så** är det samma komponent överallt: en mening (16/400), vid behov en hjälprad (14 px grått) och en knapp för nästa steg, och en sökning utan träff säger "Inget matchar ”…”." med knappen "Rensa sökning"

**Givet** en väntan över ~1 s
**När** den pågår
**Så** visas AI-orben (`AiWorking`), och en knapp som väntar visar en liten snurra och står kvar

**Givet** texterna i appen
**När** jag läser dem
**Så** följer de ordlistan i `EXPERIENCE.md` (Voice and Tone): Boende, Matvaror (fliken) / vara (en rad), föremål (Förråd), Lägg till, Ta bort / Tog bort X., Avbryt / Klar, "‹ Tillbaka" i ark och "‹ föräldersidans namn" på sidor, "Läs in receptet" i stället för "Tolka", länktext som säger vart den går, understrukna länkar inne i text och ↗ till andra sajter, och småbuggen "öppnasLivskoll" är rättad

**Givet** appens ram
**När** jag letar efter emoji
**Så** finns inga kvar utom matkategorier, rum och receptplatshållaren

**Givet** Inköpslista, Matvaror, Förråd och Inställningar
**När** jag jämför med modellerna 8–14
**Så** stämmer de i ljust, mörkt, 390 och 1280 px, vid 375 px och 200 % text utan sidledes rullning

## Epic 21: Hushållet

Version 3.x, **vilar** (pausad). Beslut 2026-11-01 (Pontus): "vi lägger det på on-hold". Byggs tidigast efter flytten till molnet (17.3–17.4), när fler hushåll använder appen. Bakgrund: i dag är ett hushåll ett enda konto som familjen delar (beslut 2026-10-31), och nya hushåll bjuds in genom `ALLOWED_EMAILS` och `pnpm users:sync`. Pontus vill kunna se vem som gjort vad, till exempel vem som bockade av en vara när man handlar ihop, och kanske en ändringslogg i Inställningar. Epic 20 är reserverad för Hjälp och välkomst.

21.1 är liten och fristående. 21.2 är grunden för 21.3 och 21.4: all data flyttar från att ägas av kontot till att ägas av hushållet (migrering och nya RLS-regler i hela databasen, isoleringstestet från 17.1 utökas).

### Story 21.1: Bjud in ett hushåll från appen

Som Pontus (appens ägare),
vill jag bjuda in en kompis hushåll från Inställningar,
så att jag inte behöver terminalen eller Vercels miljövariabler för att släppa in någon.

**Acceptance Criteria:**

**Givet** att jag är appens ägare
**När** jag öppnar Inställningar
**Så** finns en ägarsida "Inbjudningar" som bara jag ser (samma ägarbegrepp som inkorgen i Epic 20)

**Givet** ägarsidan
**När** jag skriver en e-postadress och trycker Bjud in
**Så** skapas kontot och personen kan logga in, utan att `ALLOWED_EMAILS` behöver ändras

**Givet** en inbjuden adress
**När** jag tar bort den
**Så** kan personen inte längre logga in, och appen frågar först eftersom det inte går att ångra

### Story 21.2: Hushållsmedlemmar med egna inloggningar

Som en i familjen,
vill jag ha en egen inloggning i samma hushåll,
så att vi inte delar lösenord och appen vet vem jag är.

**Acceptance Criteria:**

**Givet** Inställningar → Hushåll
**När** jag öppnar Medlemmar
**Så** ser jag alla i hushållet med namn, och kan bjuda in en till med en länk eller kod

**Givet** en inbjudningslänk
**När** någon öppnar den och loggar in
**Så** blir personen medlem i hushållet och ser samma recept, matsedel, lista, matvaror och förråd

**Givet** databasen
**När** migreringen körs
**Så** ägs all data av hushållet i stället för kontot, befintliga konton blir hushåll med en medlem, och isoleringstestet visar att hushåll aldrig ser varandras data

**Givet** P-knappen
**När** jag är inloggad
**Så** visar den mitt eget namn, inte hushållets

### Story 21.3: Se vem som gjort vad

Som en som handlar ihop med någon,
vill jag se vem som bockade av eller lade till en vara,
så att vi inte köper samma sak två gånger och vet vem man ska fråga.

**Acceptance Criteria:**

**Givet** inköpslistan
**När** en vara är avbockad av någon annan i hushållet
**Så** visas en liten initial eller ett namn på raden ("Anna"), live

**Givet** en vara jag själv lagt till eller bockat av
**När** jag tittar på raden
**Så** syns inget namn (bara andras ändringar markeras)

**Givet** Matvaror och Förråd
**När** jag öppnar en vara eller ett föremål
**Så** står det vem som senast fyllde på eller ändrade, och när

### Story 21.4: Ändringslogg

Som en i hushållet,
vill jag se en logg över vad som ändrats,
så att jag förstår varför något försvann eller tillkom.

**Acceptance Criteria:**

**Givet** Inställningar → Hushåll
**När** jag öppnar Ändringar
**Så** ser jag de senaste ändringarna grupperade per dag ("Anna bockade av Mjölk · 17:42", "Pontus tog bort Tacos från matsedeln")

**Givet** loggen
**När** den blir lång
**Så** sparas bara de senaste 90 dagarna
