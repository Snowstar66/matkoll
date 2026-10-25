# Epic 1 Context: Receptimport och receptbibliotek

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Pontus kan logga in med en engångslänk, lägga in recept från länk, inklistrad text eller foto, granska och rätta dem i Matkolls enhetliga format innan något sparas, och hitta dem igen i ett receptbibliotek med sökning och favoriter. Epicen lägger också grunden som alla senare epics bygger på: projektet med tvingande kontroller, inloggning och dataisolering, app-skalet med designtokens, den utbytbara AI-tjänsten och ingredienskatalogen. Lagningsstatus, filtret "Kan lagas nu", portionsväljare och "X av Y hemma" i receptvyn hör till senare epics.

## Stories

- Story 1.1: Projektgrund med kontroller
- Story 1.2: Inloggning med engångslänk
- Story 1.3: App-skal, navigering och designtokens
- Story 1.4: AI-tjänsten med testleverantör och lokal modell
- Story 1.5: Ingredienskatalog, enheter och avdelningar
- Story 1.6: Importera recept från inklistrad text
- Story 1.7: Spara recept och visa receptet
- Story 1.8: Importera recept från länk
- Story 1.9: Importera recept från foto
- Story 1.10: Receptbiblioteket med sökning och favoriter
- Story 1.11: Ändra och ta bort recept
- Story 1.12: Inställningar för receptsajter

## Requirements & Constraints

- **Åtkomst:** en användare. Bara adresser i en tillåtelselista i miljön kommer in. Utan session omdirigeras sidor till inloggningen och serverfunktioner svarar 401. Pontus förblir inloggad på enheten.
- **Dataisolering:** all data tillhör en användare. Automatiska tester visar att en anonym klient och en annan användare varken kan läsa eller skriva.
- **Import:** länk, text och foto ger samma förhandsgranskning och samma format. Länkar hämtas bara från godkända receptsajter (startlista koket.se och tasteline.com). En ej godkänd domän avvisas utan hämtning. Källan sparas. Misslyckas en länkimport erbjuds textinklistring direkt.
- **Format:** varje receptrad har originaltext, mängd, enhet och katalogingrediens. Vid vag mängd är mängd och enhet tomma och raden märks som vag. Raden kopplas mot katalogen, även via synonymer; finns ingen passande post föreslås en ny katalogingrediens (namn, avdelning, plats, standardenhet). Stegen skrivs om i samma stil oavsett källa. AI-svar valideras mot schema, med nya försök och därefter ett begripligt fel.
- **Förhandsgranskning:** titel, portioner, receptrader (mängd, enhet, katalogingrediens) och steg går att ändra. Inget sparas förrän Pontus trycker "Spara recept". Rader och kopplingar går att rätta även efter sparning, och en rättad koppling sparas som synonym.
- **Bibliotek:** bild, titel, tid och portioner per recept, sökning på titel och ingrediens (även synonymer), filtren Alla och Favoriter, favorit med ett tryck, ändra recept och ta bort med bekräftelse i förväg.
- **Receptsajter:** läggs till och tas bort i inställningarna och gäller direkt. ica.se, arla.se och coop.se provas med serverhämtning. Resultatet noteras i `docs/oppna-fragor.md`, och de sajter som fungerar läggs till i startdatan.
- **Tvärgående:** all hämtning och alla AI-anrop sker på servern, och nycklar finns bara där. AI-leverantören byts via konfiguration, och en mock gör att tester körs utan modell. Allt fungerar från 375 px bredd och på dator. Tryckytor är minst 44 px. Inget rött. Gränssnittet är på svenska. Biblioteket svarar inom en sekund. Import visar förlopp och kan avbrytas eller göras om.
- **Klart-villkor:** ett röktest av Qwen3.6-35B-A3B i LM Studio med text, bild och JSON-schema ska vara gjort innan epicen räknas som klar. Promptar och AI-testuppsättningen byggs här; recepten i den bekräftas av Pontus.

## Technical Decisions

**Stack och leverans:** Next.js 16.4.3 (App Router, `cacheComponents: true`) med TypeScript i strikt läge, Tailwind 4 via `@tailwindcss/turbopack` (ingen PostCSS-konfiguration), pnpm och Node 24.x. Supabase körs lokalt via CLI i OrbStack. Övriga paket är `ai` + `@ai-sdk/*`, zod 4, cheerio, Vitest, Playwright, lefthook och gitleaks. Exakta versioner finns i arkitekturens Stack-tabell. Epicen byggs på grenen `epic/1-receptimport` med PR mot en skyddad `main`. CI kör lint, typkontroll, Vitest, typdrift, RLS-tester, test av domänbegränsning, Playwright med mock och gitleaks. Före commit kör lefthook `gitleaks protect --staged` och ESLint. Inget körs i molnet i den här epicen.

**Moduler och lager:**
- Modulerna ligger i `src/features/<modul>/{ui,actions,domain,data}` med `index.ts` (typer och domain, säker i klienten) och `server.ts` (`server-only`). Epic 1 skapar `auth`, `catalog`, `recipes` och `settings`. Portar finns i `src/server/ai` och `src/server/fetch`.
- Beroendereglerna upprätthålls med ESLint `import/no-restricted-paths`. Bara `src/server/ai` får importera `ai` och `@ai-sdk/*`. Portar importerar aldrig Supabase eller features.
- Tabellerna ägs så här: `catalog` äger `ingredient` och `ingredient_synonym`, `recipes` äger `recipe`, `recipe_step` och `recipe_ingredient`, och `settings` äger `recipe_site`. Andra moduler använder ägarens exporter.
- Webbläsaren använder aldrig Supabase-klienten. Läsning sker i Server Components via `server.ts`. Skrivning sker bara via Server Actions som börjar med `requireUser()` och validerar med Zod. Server Actions används inte för läsning, utom `search*`. En atomär skrivning görs som Postgres-funktion (`security invoker`).
- Actions och Route Handlers returnerar `{ ok: true, data } | { ok: false, error: { code, message } }`. Koderna heter `<område>_<orsak>` och finns med svensk text i `src/lib/errors.ts`. Förväntade fel kastas aldrig.
- Miljövariabler läses bara via `src/server/env.ts` (Zod-validerad) med låsta namn. En ny variabel kräver att listan och `.env.example` ändras.
- Sessionen och användardata läses inuti `<Suspense>`. Ingen `'use cache'` på användardata. Efter en skrivning anropas `revalidateFor(table)`, aldrig `revalidatePath` direkt.

**Inloggning:** registrering är avstängd (`enable_signup = false`), och `signInWithOtp` anropas med `shouldCreateUser: false`. Användarna skapas av `pnpm users:sync` från `ALLOWED_EMAILS`. `auth/confirm` anropar `verifyOtp({ token_hash, type: 'email' })` och därefter `ensure_user_defaults()`. `src/proxy.ts` förnyar sessionen med `getClaims()` som en optimistisk kontroll. Den auktoritativa kontrollen är `requireUser()`: `getClaims()` plus kontroll mot `ALLOWED_EMAILS`, memoiserad per förfrågan med React `cache`. Parametern `next` måste börja med `/` men inte med `//`.

**Databas:**
- Varje tabell har `user_id ... default auth.uid() references auth.users on delete cascade`, RLS och policyn `user_id = (select auth.uid())`. Grants ges till `authenticated` och `service_role`, aldrig till `anon`, och `auto_expose_new_tables = false`.
- Barntabeller har en sammansatt främmande nyckel `(parent_id, user_id)`, med `cascade` inom receptet och `restrict` mellan moduler. All radering är hård.
- Migrationer skapas bara med `supabase migration new`. Efter varje migration genereras `database.types.ts`, och CI kontrollerar att filen stämmer. Varje ny tabell får ett RLS-test. Id är `uuid` och tider `timestamptz`.
- Tabellernas kolumner:
  - `ingredient`: `name`, `normalized_name` (unik), `section`, `location`, `default_unit`.
  - `ingredient_synonym`: `ingredient_id`, `normalized` (unik).
  - `recipe`: `title`, `original_servings`, `total_minutes`, `image_url`, `source_kind`, `source_url`, `is_favorite`.
  - `recipe_step`: `recipe_id`, `position`, `text`.
  - `recipe_ingredient`: `recipe_id`, `ingredient_id`, `step_id` (valfri), `position`, `original_text`, `amount`, `unit`, `is_vague`.
  - `recipe_site`: `domain` (unik), `is_active`.
- `ensure_user_defaults()` ägs av `settings` och är idempotent (`on conflict do nothing`). Den lägger in koket.se och tasteline.com. Standardbutiken läggs till i Epic 7.

**AI-port:**
- `AiService.parseRecipe` tar en `AbortSignal`. Adaptrarna `lmstudio`, `anthropic`, `openai` och `mock` väljs med `AI_PROVIDER`.
- Anrop görs med `generateText` och `Output.object`, aldrig `generateObject`. Bilder skickas som `file`-delar. `lmstudio` använder `createOpenAICompatible` med `supportsStructuredOutputs: true` och avstängt tänkläge, lokalt mot `http://localhost:1234`.
- `maxRetries` är 0. Ett ogiltigt svar ger högst två nya försök och sedan `ai_invalid`. Nätverksfel, 5 s utan anslutning eller ett svar som inte är JSON ger `ai_unavailable` direkt. Tidsbudgeten är 45 s per försök och 110 s totalt.
- Scheman finns i `src/server/ai/schemas.ts` och promptar som filer i `prompts/`. Mocken är deterministisk och läser från `tests/fixtures/ai/`. `pnpm eval:ai` körs manuellt, inte i CI.
- Flödet går från klienten via `src/lib/ai-client.ts` till `src/app/api/ai/import` (`maxDuration = 120`) och vidare till `recipes/actions/importRecipe` med `request.signal`. Route Handlers skriver aldrig till databasen.

**Receptformat:** `parseRecipe` returnerar `AiRecipe` med katalogförslag per rad. `recipes/domain/fromAiRecipe(aiRecipe, matches)` är den enda mappningen till `RecipeDraft` (Zod). `RecipeDraft` innehåller titel, originalportioner, tid i minuter, bild-URL, `sourceKind` (`url | text | photo | ai`), `sourceUrl`, steg och receptrader. Varje receptrad har originaltext, mängd, enhet, vag, en `IngredientMatch` eller `{ kind: 'chosen', ingredientId }` och valfria stegindex. `saveRecipe(draft)` och `updateRecipe(id, draft)` är de enda skrivvägarna; `updateRecipe` behåller id för rader och steg som finns kvar. Källans visningstext väljs bara i `sourceLabel()`.

**Katalog:**
- `matchIngredients` är skrivfri och matchar i ordningen normaliserat namn, sedan synonym, sedan `{ kind: 'new', proposal }` byggt från AI-tipset.
- `commitIngredients` anropas bara från sparande actions. Den gör en upsert på `(user_id, normalized_name)` och sparar originaltexten som synonym när Pontus valt en annan ingrediens än förslaget.
- Normalisering görs bara i `catalog/domain/normalize.ts`.
- `units.ts` innehåller `normalizeUnit`, `parseQuantity` och `formatQuantity`, som är de enda funktionerna för att tolka och visa mängder. Formateringen använder svenskt decimalkomma. En okänd enhet gör raden vag.
- `sections.ts` och `locations.ts` har fast ordning, och okänd avdelning blir Övrigt.
- Enheter, avdelningar och platser är Zod-enum och `check` i databasen. Mängd lagras som `numeric` och är `null` för en vag rad. Enheter räknas aldrig om.

**Hämtning:** `safeFetch(url, { allowedDomains, signal })` är den enda koden som hämtar från receptsajter. Den kräver https och att värden är en godkänd domän eller dess `www.`-variant. DNS slås upp och privata, lokala och reserverade adresser avvisas. Omdirigeringar följs manuellt med ny kontroll, högst 3. Gränserna är 10 s och 3 MB. Kontrollen testas i CI mot sparade sidor i `tests/fixtures/sites/`. JSON-LD skickas tillsammans med sidans läsbara text till `parseRecipe` och används aldrig direkt som `RecipeDraft`. Nya domäner normaliseras av ett Zod-schema i `settings/domain` (gemener, utan schema, sökväg och `www.`).

**Bilder:** foton av kokbokssidor förminskas i klienten till högst 1600 px och 1,5 MB JPEG. Servern kontrollerar storleken (`image_too_large`), och fotot sparas aldrig. Receptbilder sparas som URL och visas med `<img referrerPolicy="no-referrer">` och en platshållare vid fel.

**Konventioner:**
- Kod och filnamn är på engelska, filer i kebab-case. Rutterna är svenska: `/recept`, `/recept/[id]`, `/installningar`, `/logga-in`.
- Formulär använder `useActionState`, och hjärtat använder `useOptimistic`.
- Tokens från DESIGN.md definieras som CSS-variabler i `globals.css` och mappas med `@theme inline`. Mörkt läge följer `prefers-color-scheme`. Komponenter använder aldrig hex-värden.
- Domain-tester ligger bredvid koden. RLS- och domäntester ligger i `tests/integration`. E2E-tester med `AI_PROVIDER=mock` loggar in via `generateLink` + `verifyOtp` i `global-setup`. Appen har ingen testväg.
- Loggning sker med `console.error` och felkod, utan användardata.

## UX & Interaction Patterns

- **App-skal:** under 1024 px finns ett flikfält med Recept, Matsedel, Lista och Hemma. Från 1024 px ersätts det av en sidomeny som också har Inställningar, och innehållet är högst 720 px brett. Flikbyte behåller scrollposition och filter. Sidor utan funktion visar rubrik och ett tomt läge.
- **Gemensamma byggstenar:** byggstenarna i `src/components/` följer DESIGN.md och EXPERIENCE.md. Ark glider upp på mobil och visas som dialog (högst 560 px) på dator. De stängs med Klar, Avbryt, svep, Esc eller klick utanför. Vid osparade ändringar frågar arket "Släng ändringarna?", och ark staplas aldrig. Meddelanderutan är beständig och ljusblå, med en åtgärd när det finns en. Den korta bekräftelsen visas i 4 s via en live-region. Skelettrader visas efter 300 ms, aldrig helskärmssnurror.
- **Importflöde:** "+" i Recept-rubriken öppnar arket Importera recept med flikarna Länk, Text och Foto. Fliken Länk föreslår en länk från urklipp om webbläsaren tillåter det. Under importen visas "Läser receptet …" med förloppsrad och "Avbryt". I förhandsgranskningen får osäkra kopplingar en ljusblå ring och "Kontrollera", och nya ingredienser märks "Ny". "Spara recept" leder till receptvyn.
- **Felbesked:**
  - Ej godkänd domän: "[domän] är inte en godkänd receptsajt." med knappen "Öppna inställningar".
  - Blockerad sajt, tidsgräns eller inget recept: orsaken och knappen "Klistra in text i stället", som byter till fliken Text med fokus i textfältet.
  - AI otillgänglig: "AI-tjänsten svarar inte just nu. Är datorn med modellen igång?" med "Försök igen".
  - Ogiltigt AI-svar: "Det gick inte att tolka svaret. Försök igen eller klistra in texten."
- **Receptvyn:** bilden går kant i kant. Vyn visar titel, tid, källa, ingredienser och steg, med ingredienserna ovanför stegen på mobil. En vag mängd visas som originaltext. "Ändra" i menyn (⋯) öppnar samma formulär som förhandsgranskningen, med "Ta bort recept" längst ned. Borttagning bekräftas med "Ta bort [titel]? Det går inte att ångra."
- **Biblioteket:** varje receptrad har en bild på 72 px, titel, "35 min · 4 portioner" och ett hjärta. Hjärtat växlar direkt och påverkar inte navigeringen. Sökningen väntar 200 ms. Valet av filterpiller sparas på enheten.
  - Tomt bibliotek: "Inga recept än. Klistra in en länk till ett recept du gillar." med knappen "Importera recept".
  - Ingen träff: "Inga recept matchar." med "Rensa sökning".
- **Inloggning:** sidan visar alltid "Om adressen har åtkomst får du en länk", oavsett om adressen är tillåten.
- **Inställningar:** nås via kugghjulet i Recept-rubriken på mobil och längst ned i sidomenyn på dator. Sidan visar de godkända receptsajterna och textknappen "Logga ut".
- **Utseende och text:** inget rött, inga skuggor och en enda accentfärg. Mint betyder klart, ljusblått betyder saknas, obs eller fel, och sand betyder AI. Tryckytor är minst 44 px och inmatningsfält har minst 16 px text. Status visas aldrig bara med färg, fokusramen syns och "Minska rörelse" respekteras. Texterna är korta, sakliga och skrivna med du-tilltal, utan utropstecken. Knappar är verb.

## Cross-Story Dependencies

- Story 1.1 kommer först: struktur, ESLint-zoner, env, testverktyg och CI.
- Story 1.2 och 1.3 behövs för alla sidor. Story 1.4 och 1.5 behövs för all import.
- Story 1.6 bygger förhandsgranskningen och importvägen, som Story 1.8 och 1.9 återanvänder.
- Story 1.7 skapar recepttabellerna och `saveRecipe`, och krävs av Story 1.10 och 1.11.
- Story 1.8 skapar `recipe_site`, `ensure_user_defaults()` och `safeFetch`. Story 1.12 hanterar sajtlistan.
- Senare epics bygger vidare på det här:
  - Epic 2 använder katalogen och lägger till lagningsstatus i biblioteket.
  - Epic 3 lägger till `mealplan.detachRecipe`, som `deleteRecipe` då ska anropa först.
  - Epic 4 bygger ut receptvyn.
  - Epic 5 återanvänder `fromAiRecipe` och förhandsgranskningen för AI-förslag.
  - Epic 6 använder AI-porten och katalogen.
  - Epic 7 utökar `ensure_user_defaults()` med butiken.
