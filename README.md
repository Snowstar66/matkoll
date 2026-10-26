# Matkoll

Recept, matsedel, inköpslista och det du har hemma, i en app. Planering och beslut finns i `docs/` och `_bmad-output/`.

## Kom igång

Krav: Node 24.x, pnpm 12.15.0 (`corepack enable` räcker), Docker (OrbStack) för lokal Supabase och [gitleaks](https://github.com/gitleaks/gitleaks) 8.30 på `PATH`.

```bash
pnpm install          # installerar beroenden, Supabase CLI och git-hookar (lefthook)
pnpm db:start         # startar lokal Supabase i Docker
pnpm db:env           # skriver Supabase-URL och nycklar till .env.local (skapas från .env.example)
# Lägg din adress i ALLOWED_EMAILS i .env.local, t.ex. ALLOWED_EMAILS=du@example.com
pnpm users:sync       # skapar användarna i ALLOWED_EMAILS
pnpm dev              # http://localhost:3000
```

Logga in på `http://localhost:3000/logga-in`. Länken hamnar i Mailpit på `http://127.0.0.1:54324`; öppna den så är du inloggad. Registrering är avstängd, så bara adresser som `pnpm users:sync` har skapat kan logga in, och appen släpper bara in adresser som står i `ALLOWED_EMAILS`. `pnpm users:sync` tar aldrig bort någon; användare som inte finns i listan visas som varning och tas bort först med `pnpm users:sync --prune`.

| Kommando | Gör |
| --- | --- |
| `pnpm lint` | ESLint, inklusive lagerreglerna (AD-1) |
| `pnpm typecheck` | Genererar Next-typer och kör `tsc --noEmit` |
| `pnpm test` | Vitest (domain-tester, miljövalidering, AI-porten med falsk modell och mock, hämtporten `safeFetch` med falska uppslagningar och sparade sidor, lagerreglerna, designtokens och komponenttester) |
| `pnpm test:integration` | Vitest mot lokal Supabase (stängd registrering, `users:sync`, RLS, ingredienskatalogen och dess sökning, recepttabellerna, `save_recipe` och `update_recipe`, receptbibliotekets lista och sökning, `recipe_site`, `ensure_user_defaults()` och att lägga till, stänga av och aktivera receptsajter). Kräver `pnpm db:start` och `pnpm db:env` |
| `pnpm build` | Produktionsbygge. Kräver `SITE_URL` och `AI_PROVIDER` (t.ex. `AI_PROVIDER=mock pnpm build`) |
| `pnpm test:e2e` | Playwright mot `pnpm dev` på port 3100 (`CI=1` kör `pnpm start`, så bygg först). Kräver lokal Supabase och `pnpm db:env`. Testanvändarna skapas med `users:sync` och loggas in via `/auth/confirm` i `tests/e2e/global-setup.ts`: `e2e@matkoll.test`, vars bibliotek alltid är tomt, `e2e-recept@matkoll.test`, som sparar recept, `e2e-bibliotek@matkoll.test`, som bara `library.spec.ts` använder, `e2e-installningar@matkoll.test`, som bara `settings.spec.ts` använder (den stänger av sajter och loggar ut), och `e2e-hemma@matkoll.test`, som bara `pantry.spec.ts` använder (dess lagerrader skapas med service role före testerna). Första gången: `pnpm exec playwright install chromium` |
| `pnpm eval:ai` | Kör AI-testuppsättningen mot vald `AI_PROVIDER` och skriver `tests/eval/report.md`. Manuellt, aldrig i CI (se AI-tjänsten nedan) |
| `pnpm sites:probe <url> …` | Hämtar receptsidor med appens `safeFetch` och visar om hämtningen fungerar, om sidan har JSON-LD Recipe och hur mycket text den har. `--parse` kör också `parseRecipe` med `AI_PROVIDER` från `.env.local`, och `--save <namn>` sparar sidan som testsida. Manuellt, aldrig i tester eller CI (se Receptsajter nedan) |
| `pnpm db:start` | Startar lokal Supabase (`supabase start`) |
| `pnpm db:env` | Skriver `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` och `SUPABASE_SERVICE_ROLE_KEY` från `supabase status` till `.env.local` |
| `pnpm db:types` | Genererar `src/lib/supabase/database.types.ts`; körs efter varje migration (AD-5) |
| `pnpm users:sync` | Skapar användarna i `ALLOWED_EMAILS` med service role (`--prune` tar bort övriga) |

### Utseende och byggstenar

Färger, typografi, radier och mått från `DESIGN.md` finns som CSS-variabler i `src/app/globals.css`, med mörka värden under `prefers-color-scheme: dark`, och mappas till Tailwind-klasser med `@theme inline` (AD-17). Tailwinds egna färger, radier och textstorlekar är bortplockade, så bara tokens går att använda: `bg-surface`, `text-ink-2`, `bg-accent`, `rounded-lg`, `text-page-title`, `h-button`, `size-tap`, `max-w-content` och brytpunkten `desktop:` (1024 px). Hex-värden får bara stå i `globals.css`; `tests/design/no-hex.test.ts` stoppar dem i resten av `src/`, och `tests/design/contrast.test.ts` kontrollerar att textparen når 4,5:1 i båda lägena.

De gemensamma byggstenarna ligger i `src/components/` och följer Component Patterns i `EXPERIENCE.md`. Använd dem i stället för egna varianter:

| Byggsten | Fil |
| --- | --- |
| App-skal: flikfält, sidomeny, sidrubrik, bevarad scrollposition | `app-shell/` (layouten i `src/app/(app)/layout.tsx`) |
| `Button` (primär, sekundär, text) och `buttonClasses` för länkar | `button.tsx` |
| `Input`, `FieldLabel`, `FieldError` | `field.tsx` |
| `FixedAction`, `FilterPills`, `SearchField` (200 ms), `Stepper` (minst 1) | `fixed-action.tsx`, `filter-pills.tsx`, `search-field.tsx`, `stepper.tsx` |
| `StatusBadge`, `AiBadge`, `HeartToggle`, `CheckCircle` | `badges.tsx`, `heart-toggle.tsx`, `check-circle.tsx` |
| `Sheet` (ark, med "Släng ändringarna?" vid `isDirty`) | `sheet.tsx` |
| `Notice`, `ToastProvider`/`useToast`, `Skeleton` (efter 300 ms), `EmptyState` | `notice.tsx`, `toast.tsx`, `skeleton.tsx`, `empty-state.tsx` |
| Ikoner (egna SVG, `aria-hidden`) | `icons.tsx` |

Komponenttester (`*.test.tsx`) körs i jsdom med Testing Library, övriga Vitest-tester i node.

### Före commit

`lefthook` kör `gitleaks git --pre-commit --staged` och ESLint på stagade filer före varje commit. Commiten stoppas om gitleaks saknas, så installera det först, till exempel med `brew install gitleaks` eller genom att lägga binären från gitleaks releaser på `PATH`.

CI (`.github/workflows/ci.yml`) kör jobben `lint`, `typecheck`, `test`, `integration`, `e2e` och `gitleaks` på varje PR och vid push till `main`. `integration` och `e2e` startar Supabase med `supabase/setup-cli`; `integration` kontrollerar också att `database.types.ts` stämmer med schemat.

### Miljövariabler

All konfiguration läses via `src/server/env.ts` och valideras med Zod. Bara namnen i `.env.example` är tillåtna (AD-14). Hemligheter ligger i `.env.local`, som aldrig checkas in. `SITE_URL` är appens publika adress och används i länken i inloggningsmejlet. Den måste finnas med bland redirect-URL:erna i Supabase Auth. Utan värde används `http://localhost:3000`, men i produktion (`next build`, `next start`) måste den vara satt. E2E och CI använder `http://localhost:3100`. Samma sak gäller `AI_PROVIDER`: utanför produktion är `mock` standard, men i produktion måste den vara satt, och `mock` gäller där bara om den är vald uttryckligen (som i CI och Playwright). Ett värde som bara är blanksteg räknas som tomt. `SUPABASE_SERVICE_ROLE_KEY` står i en egen sektion i `.env.example`: den läses bara av `scripts/` och `tests/`, aldrig av appen, och ESLint stoppar den i `src/` (AD-4).

### AI-tjänsten

All AI går via porten i `src/server/ai/` (AD-9): `getAiService().parseRecipe(input, signal)` returnerar `{ ok: true, data: AiRecipe }` eller felkoderna `ai_unavailable` och `ai_invalid`. Leverantören väljs med `AI_PROVIDER`:

| `AI_PROVIDER` | Kräver | Används till |
| --- | --- | --- |
| `mock` (standard) | – | Alla tester, E2E och CI. Svarar från `tests/fixtures/ai/` utan modell |
| `lmstudio` | `LMSTUDIO_BASE_URL`; `AI_MODEL` är som standard `qwen/qwen3.6-35b-a3b` | Lokal modell i LM Studio, i molnet bakom Cloudflare Access (`CF_ACCESS_CLIENT_ID` och `CF_ACCESS_CLIENT_SECRET`, båda eller ingen) |
| `anthropic` | `ANTHROPIC_API_KEY`, `AI_MODEL` | Molnleverantör |
| `openai` | `OPENAI_API_KEY`, `AI_MODEL` | Molnleverantör |

Passar inställningarna inte ihop startar appen inte, och felet namnger variablerna. Med Cloudflare Access-paret satt måste `LMSTUDIO_BASE_URL` använda https.

`parseRecipe` kan ge de här felen:

| Kod | När |
| --- | --- |
| `validation` | Ingen indata, mer än 12 000 tecken text och JSON-LD tillsammans, eller en bild som är tom, större än 1,5 MB eller inte JPEG, PNG eller WebP. Kontrolleras före varje adapter, även mocken. Gränsen ryms i Qwens kontext på 8 192 token tillsammans med prompten och högst 3 000 token svar |
| `import_no_recipe` | Modellen svarar att indata inte innehåller något recept |
| `ai_invalid` | Modellens text är inte JSON eller följer inte `src/server/ai/schemas.ts`, efter högst två nya försök; ett nytt försök startar bara om minst 20 s av de 115 s återstår. Före varje nytt försök får modellen veta vilka fält som var fel (sökväg och regel, aldrig värden) |
| `ai_rejected` | Leverantören svarar med HTTP 4xx, t.ex. fel nyckel, för många anrop, för lång förfrågan eller okänd modell. Inga nya försök |
| `ai_unavailable` | Hälsokontrollen misslyckas (LM Studio svarar inte på `/models` inom 5 s, eller `AI_MODEL` finns inte bland dess modeller), nätverksfel, HTTP 5xx, ett HTTP-svar vars innehåll inte är JSON (t.ex. en HTML-felsida), 100 s per försök eller 115 s totalt har gått, eller anropet avbryts. Inga nya försök |

Loggen får bara felkoden, en fast orsak och HTTP-status, aldrig indata, svar, promptar eller nycklar. Ett avbrott från anroparen loggas som info. Promptarna ligger i `src/server/ai/prompts/` och följer med i bygget.

**LM Studio lokalt:** ladda `qwen/qwen3.6-35b-a3b` och starta API-servern, i appen under Developer eller med `lms server start`. Servern ska bara lyssna på localhost (`http://localhost:1234`); slå inte på "Serve on Local Network". Sätt sedan i `.env.local`:

```bash
AI_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
```

Porten stänger av modellens tänkläge (`chat_template_kwargs.enable_thinking = false`) och ber om JSON enligt schemat.

**`pnpm eval:ai`** kör testuppsättningen i `tests/fixtures/ai/` mot vald `AI_PROVIDER` och skriver `tests/eval/report.md` (ignoreras av git). Med `AI_PROVIDER=mock` vägrar den att köra. Varje recept körs som text (med JSON-LD när fallet har det), och recept med en PNG körs också som bild. Svaret jämförs med `<namn>.expected.json`: titel, portioner, tid, antal rader, nyckelingrediensernas namn (hela ord) med mängd och enhet, och de vaga raderna. Kör den manuellt när leverantör eller modell byts, till exempel `AI_PROVIDER=lmstudio pnpm eval:ai`; utan `LMSTUDIO_BASE_URL` används `http://localhost:1234/v1`. Den ingår aldrig i `pnpm test` eller CI.

Testuppsättningen är fem påhittade recept och två riktiga receptsidor från koket.se och tasteline.com (texten och JSON-LD som importflödet läser ur sidorna i `tests/fixtures/sites/`, se Receptsajter nedan): `<namn>.txt` (indata), `<namn>.response.json` (mockens svar), `<namn>.expected.json` (förväntningar), ibland `<namn>.jsonld.json` (JSON-LD som skickas med texten) och `<namn>.png`, samt `manifest.json` (fallen, mockens standardfall och reserverade indata). Fallen täcker JSON-LD med sidtext, en bild, en inbakad instruktion till modellen, ett portionsintervall (4–6) och ett recept utan tid. Mocken känner igen en text på SHA-256 av den normaliserade texten (text och JSON-LD) och en bild på dess bytes. Okänd indata ger standardfallet.

För att testa felbeskeden i importflödet svarar mocken med ett fel på de reserverade texterna i `manifest.json` (skiftläge och blanksteg spelar ingen roll):

| Text | Fel |
| --- | --- |
| `matkoll-mock: ai_unavailable` | `ai_unavailable` |
| `matkoll-mock: ai_invalid` | `ai_invalid` |
| `matkoll-mock: ai_rejected` | `ai_rejected` |
| `matkoll-mock: import_no_recipe` | `import_no_recipe` |

Bilderna under `reservedImages` (`reserved-<kod>.png`, enfärgade 64 × 64 px) gör samma sak för fotoimporten: mocken känner igen dem på deras bytes. Bilden av en receptsida skapas med `node scripts/render-recipe-image.mjs [namn]`.

### Ingredienskatalogen

Modulen `src/features/catalog` äger tabellerna `ingredient` och `ingredient_synonym` (AD-1, AD-6). Andra moduler importerar bara via två ingångar.

`@/features/catalog` (`index.ts`, domänen, säker i klienten):

| Export | Gör |
| --- | --- |
| `normalizeUnit`, `parseQuantity`, `formatQuantity`, `UNITS` | Enda sättet att tolka enheter och mängder och att visa en mängd ("1,5 dl", "<0,01 g"). En okänd enhet ("näve") ger `known: false`, och raden blir vag. Ett intervall ("2–3") ger det största talet, som i AI-prompten. "1.500" och "1 000" är tusental. Enheter räknas aldrig om (AD-12) |
| `SECTIONS`, `toSection`, `LOCATIONS`, `toLocation` | Avdelningar i listans ordning och platser hemma. Okänd avdelning blir Övrigt, och okänd plats följer avdelningen |
| `normalizeIngredientText`, `cleanIngredientText` | Den enda normaliseringen: utan punkttecken, mängd och enhet (även "500g", "ett par", "1 näve"), parenteser, "efter smak" och liknande, och tillagningsord ("1 Lök, hackad" → "lök"). Ord som kan vara en egen vara ("torkade", "rökt", "riven") tas bara bort efter ett kommatecken. `cleanIngredientText` gör samma sak men behåller versalerna och ger namnet på en föreslagen ingrediens ("Gul lök") |
| `IngredientMatch`, `IngredientChoice`, `IngredientProposal` och deras Zod-scheman | Matchningens resultat och det som sparande actions skickar till `commitIngredients` |

`@/features/catalog/server` (`server.ts`, `server-only`, användarens sessionsklient):

| Export | Gör |
| --- | --- |
| `matchIngredients(items)` | Skrivfri matchning i ordningen: radens text mot namn, mot synonym, sedan AI-tipsets namn mot namn och synonym (`confidence: "hint"`, osäkrare, så förhandsgranskningen ber Pontus kontrollera), annars ett förslag på ny ingrediens (`kind: "new"`). Saknas både användbar text och tips blir resultatet `{ kind: "unmatched" }` |
| `commitIngredients(choices)` | Bara för sparande actions. Returnerar ett id per val i samma ordning (`null` för `unmatched`). Skapar nya ingredienser och synonymer i ett anrop till Postgres-funktionen `commit_ingredients` (en rad även vid samtidiga anrop, befintliga ingredienser ändras aldrig). Kontrollerar att alla id finns i användarens katalog (`catalog_unknown_ingredient`) |
| `getIngredientNames(ids)` | Namnen på ingredienserna med de id:na i användarens katalog, per id. Förhandsgranskningen visar dem för matchade rader |
| `findIngredientIds(query)` | Id för ingredienserna vars namn eller synonym innehåller texten (normaliserad som i sökningen). Namn- och synonymträffar varvas innan taket på 1000 id, så ingen sort tränger ut den andra; finns fler träffar än så kommer de överskjutande inte med i receptsökningen. Receptbiblioteket söker på ingrediens med dem utan att läsa katalogens tabeller |
| `searchIngredients(query)` | Server Action (läsning, undantaget `search*` i AD-1) som söker namn och synonymer som innehåller texten, bäst först (exakt, början, ordbörjan, övrigt), högst 20 träffar. Sidan skickar den som prop till klientkomponenter i andra moduler, som inte får importera `server.ts` |
| `CatalogDataError` | Felet som funktionerna ovan kastar när Supabase fallerar; `code` säger varför, aldrig användardata. Anroparen gör det till `catalog_unavailable` |

Synonymer sparas av `commitIngredients`:

- När Pontus valt en annan ingrediens (`kind: "chosen"`) sparas radens normaliserade text som synonym; en befintlig synonym pekas om. Olika val för samma text i ett anrop ger `catalog_conflicting_synonyms`.
- En ny ingrediens vars namn skiljer sig från radens text får texten som synonym ("Lök, hackad" med namnet "Gul lök" ger synonymen "lök"), utom när två nya ingredienser delar texten ("salt och peppar").
- Ingen synonym sparas när texten redan leder till den valda ingrediensen, eller när texten är en annan ingrediens exakta namn: namnet matchas alltid först (AD-6), så synonymen skulle aldrig användas.

Katalogingredienser tas aldrig bort (AD-20): ingen roll har `delete` på `ingredient`. Listorna i databasens `check` måste vara exakt domänens; `tests/design/catalog-checks.test.ts` kontrollerar det.

### Importera recept

Arket Importera recept öppnas med "+" i Recept-rubriken eller med knappen "Importera recept" i det tomma biblioteket. Det har flikarna Länk, Text och Foto och öppnas på Länk. Inget sparas förrän Pontus trycker "Spara recept" (se Spara recept och receptvyn nedan); fram till dess lever förhandsgranskningen i klienten.

På fliken Länk klistrar Pontus in en länk, eller trycker "Klistra in länk", som läser urklippet bara vid trycket (nekar webbläsaren händer inget), och trycker "Tolka". Felen visas i en meddelanderuta med en väg vidare: en ej godkänd sajt ger "[domän] är inte en godkänd receptsajt." med länken "Öppna inställningar", och en sajt som stoppar hämtningen, inte svarar i tid, är för stor eller saknar recept ger orsaken och "Klistra in text i stället", som byter till fliken Text med fokus i textfältet.

På fliken Foto trycker Pontus "Fotografera sidan" på mobilen (en pekskärm, `pointer: coarse`), som öppnar bakre kameran med `<input type="file" accept="image/*" capture="environment">`, eller "Välj bild", som öppnar filväljaren (på datorn är det den enda knappen). Ingen annan kamera-API används. Importen börjar direkt när bilden är vald, med samma "Läser receptet …", "Avbryt", felrutor och förhandsgranskning som för text och länk; källan visas som "Foto av kokbok".

Flödet (AD-2, AD-9, AD-10):

1. `src/features/recipes/ui/import-sheet.tsx` skickar `{ kind: "url", url }` (högst 2 048 tecken) eller `{ kind: "text", text }` med `postAi` i `src/lib/ai-client.ts`. "Avbryt" avbryter anropet med en `AbortSignal`; det ger `{ ok: false, aborted: true }`, som inte visas som fel. Nätverksfel och svar som inte har resultatformen ger `ai_unavailable`.
2. Route Handlern `POST /api/ai/import` (`maxDuration = 120`) tar bara emot anrop från appen själv: en `Origin` som inte är `SITE_URL` eller `Sec-Fetch-Site` som inte är `same-origin`/`none` ger 403. Sedan kontrollerar den inloggningen med `requireUserForRoute` (401 `unauthorized` utan behörig användare), kräver `content-type: application/json` (415) och högst 64 kB (413), validerar kroppen med `importRequestSchema` (400 `validation`) och anropar `importRecipe` med `request.signal`, så att ett avbrott stoppar modellen.
3. `importRecipe` i `src/features/recipes/actions/import-recipe.ts` hämtar för en länk först sidan: de godkända sajterna läses med `settings.getActiveRecipeDomains()`, sidan hämtas med `fetchRecipePage` (`safeFetch`, se Receptsajter nedan), och `extractRecipePage` plockar ut JSON-LD Recipe och läsbar text, kortade så att de tillsammans ryms i AI-portens 12 000 tecken. Sedan kör den `parseRecipe` (med text och JSON-LD för en länk), `matchIngredients` och `fromAiRecipe` (källan är sidans adress efter omdirigeringar, med bilden från JSON-LD), och svarar `{ ok: true, data: { draft, ingredientNames } }`: en `RecipeDraft` och namnen på de katalogingredienser raderna matchats mot. Utkastet kontrolleras med `recipeDraftSchema` (annars `ai_invalid`). Den skriver aldrig till databasen.

Ett foto går en egen väg till samma `importRecipe` (AD-15):

1. `downscaleImage` i `src/features/recipes/ui/downscale-image.ts` läser bildens storlek och EXIF-orientering ur filhuvudet och avkodar den, där webbläsaren kan, direkt till högst 1 600 px på längsta sidan (`createImageBitmap` med `imageOrientation: "from-image"`, `resizeWidth`/`resizeHeight` och `resizeQuality: "high"`), så att en mobilbild på 12–48 megapixel aldrig avkodas i full storlek. Annars avkodas den i full storlek (eller via `<img>`) och ritas ned i halveringssteg med `imageSmoothingQuality = "high"`, så att liten text förblir skarp. Den kodas som JPEG med sjunkande kvalitet (0,85, 0,75, 0,65, 0,5) tills den är högst 1,5 MB. En PNG som redan ryms och som visas i sin huvudstorlek (ingen rotation) skickas som den är. Kan bilden inte avkodas (t.ex. HEIC i Chrome) blir det `image_unsupported`; är den för stor även med lägsta kvalitet, eller tar minnet slut, `image_too_large`. Då skickas ingenting. Den förminskade bilden finns bara i arkets minne, för "Försök igen", och släpps när arket stängs.
2. Arket skickar den som `multipart/form-data` med fältet `image` med `postAiForm` till `POST /api/ai/import/photo` (`maxDuration = 120`). Routen gör samma kontroller av ursprung och inloggning som `/api/ai/import`, kräver `multipart/form-data` (415), högst 2 MB för hela förfrågan och högst 1,5 MB för bilden (413 `image_too_large`), och läser bildtypen och måtten ur filens egna byte (`src/lib/images.ts`: JPEG, PNG eller WebP; annars 415 `image_unsupported`), oavsett vad klienten påstår. En bild med längsta sida över 1 600 px (med 16 px marginal) har inte gått genom klienten och ger 413 `image_too_large`. Avbryter klienten mitt i uppladdningen svarar routen 499 utan fellogg. Sedan anropar den `importRecipe({ kind: "photo", image }, { signal })`, som skickar bilden som `file`-del till `parseRecipe` och mappar svaret med `fromAiRecipe` och källan `{ kind: "photo" }` (ingen `sourceUrl` och ingen `imageUrl`).
3. Bilden sparas aldrig: den skrivs inte till databasen, till disk eller i loggen, och lever bara i minnet under förfrågan.

Hittar modellen inget recept i bilden (`import_no_recipe`) eller svarar ogiltigt (`ai_invalid`) visas "Det gick inte att tolka bilden. Ta en ny bild, välj en annan eller klistra in texten." med "Försök igen", "Ta en ny bild" (mobil) eller "Välj en annan bild" (dator), som öppnar kameran eller filväljaren, och "Klistra in text i stället". `ai_rejected` ger "AI-tjänsten tog inte emot bilden. Prova en tydligare bild eller försök igen senare." Ett nytt foto över en ändrad förhandsgranskning väntar på "Släng ändringarna?"; "Fortsätt ändra" behåller det tidigare fotot och förhandsgranskningen.

Svarets HTTP-status följer felkoden: 400 `validation`, 401 `unauthorized`, 422 `import_no_recipe`, `fetch_invalid_url` och `fetch_domain_not_allowed`, 502 `ai_invalid`, `ai_rejected`, `fetch_blocked` och `fetch_too_large`, 503 `ai_unavailable`, `catalog_unavailable` och `settings_unavailable`, 504 `fetch_timeout`, 413 `image_too_large`, 415 `image_unsupported` och 499 `fetch_aborted` (klienten har redan gått). Klienten läser resultatet oavsett status och visar texten från `src/lib/errors.ts`; vid import gäller `importInvalidMessage` för `ai_invalid` ("… Försök igen eller klistra in texten."), och hämtfelen namnger sajten från `error.fields.domain` ("ica.se är inte en godkänd receptsajt.", `fetchErrorMessage`).

`RecipeDraft` (`src/features/recipes/domain/recipe-draft.ts`, Zod) är det enda formatet för ett tolkat recept, och `fromAiRecipe(aiRecipe, matches, source)` är den enda mappningen från AI-svaret. Enheten tolkas med katalogens `normalizeUnit`; en rad utan mängd, eller med en okänd enhet ("1 bit", "en näve"), blir vag, utan mängd och enhet; en rad är vag precis när den saknar mängd. AI-tipset sparas på raden (`hint`), så att en ny ingrediens som Pontus namnger får tipsets avdelning, plats och enhet. Stegindex som inte pekar på ett steg tas bort.

I förhandsgranskningen går titel, portioner, tid, mängd, enhet, katalogingrediens och steg att ändra. En rad som matchats via AI-tipsets namn har en ljusblå ring och "Kontrollera", och en ny katalogingrediens märks "Ny". Ett tryck på ingrediensen öppnar sökningen i samma ark; en vald ingrediens blir `{ kind: "chosen", ingredientId }`, och utan träff kan namnet användas för en ny ingrediens. `validateDraft(draft, pending)` ger felen per fält (tom titel, tomt steg, mängd eller tid som inte är ett tal), och arket räknar ut `isValid`; "Spara recept" är inaktiv tills den är sann. Har förhandsgranskningen ändrats, eller finns inklistrad text som inte tolkats, frågar arket "Släng ändringarna?" innan det stängs, och likaså innan en ny tolkning ersätter en ändrad förhandsgranskning. Texten får vara högst 12 000 tecken; nära gränsen visas antalet.

### Receptsajter och `safeFetch`

Modulen `src/features/settings` äger tabellen `recipe_site` (`domain`, unik per användare, `is_active`, `created_at`; RLS, policy och grants enligt AD-4). Domänen lagras bara som domännamn: gemener, utan schema, sökväg, port och `www.`, och med punycode för namn som inte är ASCII. `domainNameSchema` och `normalizeDomainName` i `settings/domain/domain-name.ts` gör om det Pontus skriver till den formen, och tabellens `check` följer samma regler. Regeln för vilka värdar som räknas som godkända (domänen eller dess `www.`-variant, inga andra underdomäner) finns bara i `safeFetch`. Sajtlistan hanteras i inställningarna (se Inställningar nedan).

Postgres-funktionen `ensure_user_defaults()` (`security invoker`, idempotent med `on conflict do nothing`) lägger in startsajterna koket.se, tasteline.com, ica.se och arla.se. `/auth/confirm` anropar den via `settings.ensureUserDefaults()` efter varje lyckad inloggning; ett fel där loggas men stoppar inte inloggningen. En sajt som Pontus stängt av lämnas som den är: sajter stängs av (`is_active = false`) och tas aldrig bort, eftersom en borttagen startsajt skulle komma tillbaka vid nästa inloggning, och funktionen slår aldrig på en avstängd sajt igen (`docs/beslutslogg.md`). Användare som fanns när migrationerna kördes har fått startsajterna direkt i migrationen `*_settings_backfill_and_domain_labels.sql`.

`src/server/fetch/` är porten för receptsajter (AD-11), och `safeFetch(url, { allowedDomains, signal, lookup?, fetchImpl? })` är den enda kod som hämtar från dem. Porten importerar aldrig moduler eller Supabase; anroparen skickar domänlistan. Reglerna:

- Bara https på standardporten, utan användarnamn eller lösenord; annars `fetch_invalid_url`. IP-adresser avvisas.
- Värden ska vara en godkänd domän eller dess `www.`-variant; annars `fetch_domain_not_allowed` med domänen i `error.fields.domain`, och ingen uppslagning eller anslutning görs.
- Adressen kontrolleras i anslutningens egen DNS-uppslagning: standardanropet (`https-fetch.ts`) ger `node:https` en `lookup` som slår upp värden och vägrar om någon adress är privat, lokal, länklokal, delad, för dokumentation eller annars reserverad (IPv4 och IPv6, `address.ts`). Uppkopplingen går alltså till precis den adress som kontrollerats, så DNS-rebinding mellan kontroll och anslutning går inte. Ingen anslutningspool, så en socket återanvänds aldrig.
- Omdirigeringar följs för hand, högst 3, och varje ny adress kontrolleras på samma sätt. En omdirigering till en annan sajt ger `fetch_domain_not_allowed`, till http eller en IP-adress `fetch_blocked`.
- 10 s för allt, omdirigeringar och innehåll inräknat (`fetch_timeout`), och högst 3 MB efter uppackning (`fetch_too_large`; läsningen avbryts vid gränsen). En adress, också efter en omdirigering, får vara högst 2 048 tecken. Avbryter anroparen själv ("Avbryt") blir svaret `fetch_aborted`, som inte är ett fel och bara loggas som info.
- HTTP-fel (403, 404, 429, 5xx), en annan innehållstyp än HTML, en innehållskodning porten inte kan läsa och anslutningsfel ger `fetch_blocked`. Teckenkodningen läses från `Content-Type` eller `<meta charset>` (en `<meta>` som säger UTF-16 ignoreras), annars UTF-8.

Loggen får felkoden och en fast orsak, aldrig adressen eller sidan. `extractRecipePage(html, maxChars)` i `extract.ts` (cheerio) hittar JSON-LD med `@type` Recipe, även i listor, `@graph` och `mainEntity`, och tar bort fält som inte är receptet (betyg, recensioner, näringsvärden, personer, video). JSON-LD får högst 60 % av utrymmet. Är den längre görs den mindre i steg och kortas aldrig mitt i: först utan de fälten, sedan med andra listor än ingredienser och steg kortade till tre poster, sedan utan beskrivning, nyckelord, kategorier och bild; räcker inte det utelämnas den. Den läsbara texten saknar sidans ram (header, footer och nav utanför `main` och `article`, `aside`, `role=banner`, `contentinfo` och `navigation`), script, style, noscript, svg och kommentarer, med ett block per rad; en header eller ett formulär inuti receptet behålls. Har JSON-LD både ingredienser och steg får texten högst 2 000 tecken, annars resten av utrymmet. Bilden tas från JSON-LD (`url`, annars `contentUrl`, och `@id`-referenser följs inom dokumentet), annars från `og:image`, och bara en https-adress på högst 2 048 tecken används. JSON-LD är bara indata till `parseRecipe` och används aldrig direkt som `RecipeDraft` (AD-10).

Med `AI_PROVIDER=mock` och en `SITE_URL` på `localhost` eller `127.0.0.1` (alla tester, E2E och CI, och lokalt utan annan inställning) hämtar importflödets `fetchRecipePage` inte från internet utan från de sparade sidorna i `tests/fixtures/sites/` (`fixture-sites.ts`), på samma sätt som mocken svarar från `tests/fixtures/ai/`. Begäran går ändå genom `safeFetch` och alla dess kontroller; uppslagningen ger en fast publik adress. `manifest.json` listar sidorna per adress: två riktiga receptsidor (koket.se och tasteline.com, sparade en gång med `pnpm sites:probe --save`, bara som testindata), en omdirigering från `koket.se` till `www.koket.se`, och adresser under `/matkoll-test/` för felfallen (403, en sida utan recept, en tom sida, en sajt som aldrig svarar, en sida över 3 MB och en omdirigering till en annan sajt). En produktionsserver som av misstag startats med mocken hämtar alltså ändå från de riktiga sajterna. Testsidorna läses vid körning och följer inte med i serverbygget. En adress som inte finns i listan ger 404. Testsidornas text och JSON-LD är också mockens indata för de sidorna (`tests/fixtures/ai/koket-chow-mein.*` och `tasteline-bakad-fetaost.*`); `extract.test.ts` larmar om extraktionen ändras så att de inte längre stämmer. Den som vill importera riktiga länkar lokalt sätter en riktig `AI_PROVIDER`, t.ex. `lmstudio`.

`pnpm sites:probe <url> …` provar sajter med samma `safeFetch` och `extractRecipePage` som appen (varje sidas egen domän räknas som godkänd). Resultatet för ica.se, arla.se och coop.se står i `docs/oppna-fragor.md` (T1).

### Spara recept och receptvyn

Modulen `src/features/recipes` äger tabellerna `recipe`, `recipe_step` och `recipe_ingredient` (AD-1, migrationen `supabase/migrations/<tid>_recipes.sql`):

| Tabell | Innehåll |
| --- | --- |
| `recipe` | `title`, `original_servings` (minst 1), `total_minutes` (tom eller minst 0), `image_url` (bara adressen, AD-15), `source_kind` (`url`, `text`, `photo`, `ai`), `source_url` (bara för `url`), `is_favorite`, `created_at`, `updated_at` |
| `recipe_step` | `recipe_id`, `position` (från 0, unik per recept), `text` |
| `recipe_ingredient` | `recipe_id`, `ingredient_id` (tom för en rad utan katalogingrediens), `step_id` (radens första steg, valfritt), `position`, `original_text`, `amount`, `unit` (en av `UNITS`), `is_vague`. En vag rad saknar mängd och enhet, och en rad utan mängd är vag |

Steg och rader har sammansatta främmande nycklar `(recipe_id, user_id)` med `on delete cascade`, så de försvinner med receptet. `ingredient_id` refererar katalogen med `(ingredient_id, user_id)` och `on delete restrict` (AD-20), och `step_id` måste vara ett steg i samma recept (`on delete set null`). RLS, policy och grants följer AD-4. `tests/design/recipe-checks.test.ts` kontrollerar att listorna för `unit` och `source_kind` är exakt domänens `UNITS` och `SOURCE_KINDS`.

"Spara recept" längst ned i förhandsgranskningen är inaktiv så länge `validateDraft` hittar fel. Den anropar Server Action `saveRecipe(draft)` i `src/features/recipes/actions/save-recipe.ts`, den enda skrivvägen för nya recept:

1. `requireUser()` och `recipeDraftSchema` (`unauthorized`, `validation`).
2. `catalog.commitIngredients` med ett val per rad: nya katalogingredienser skapas, en omkopplad rad sparas som synonym, och varje rad får sitt id (`null` för en rad utan ingrediens).
3. `saveRecipeIn(db, draft, ingredientIds)` anropar Postgres-funktionen `save_recipe(recipe, steps, lines)` (`security invoker`, bara för `authenticated`), som skriver receptet, stegen och raderna i en transaktion och returnerar receptets id. En ogiltig rad ger ett fel och inga rader alls.
4. `revalidateFor("recipe")` från `src/lib/revalidate.ts` (AD-18), som förnyar `/recept` och `/recept/[id]`.

Katalogen och receptet är olika moduler och sparas därför inte i samma transaktion (AD-1). Misslyckas receptet återanvänder nästa försök de ingredienser som redan skapats. Ett fel, även ett avbrutet anrop, ger `recipe_save_failed` ("Det gick inte att spara receptet. Försök igen.") i en meddelanderuta ovanför knappen, och förhandsgranskningen står kvar. Vid framgång stängs arket, Pontus hamnar på `/recept/[id]` och ser den korta bekräftelsen "Receptet är sparat.".

Receptvyn `/recept/[id]` läser receptet med `getRecipe(id)` från `@/features/recipes/server` inuti `<Suspense>`. Ingrediensnamnen kommer från `catalog.getIngredientNames`. Vyn visar bilden (`<img referrerPolicy="no-referrer">`, platshållare utan bild eller vid fel), titel, tid, portioner och källa från `sourceLabel()` (värdnamnet utan `www.`, "Inklistrad text", "Foto av kokbok" eller "AI-förslag"). Ingredienser visas med mängd från `formatQuantity`, och vaga rader och rader utan ingrediens med originaltexten. Stegen är numrerade. På mobil står ingredienserna ovanför stegen, på dator bredvid. Ett id som inte är ett uuid eller inte är användarens recept ger "Sidan finns inte.".

### Ändra och ta bort recept

Receptvyn har en meny (⋯, "Fler val") bredvid hjärtat med "Ändra". Den öppnar arket Ändra recept (`src/features/recipes/ui/recipe-menu.tsx` och `edit-recipe-sheet.tsx`) med samma formulär som förhandsgranskningen (`RecipePreview`), förifyllt från det sparade receptet med `toEditableDraft(saved)` i `src/features/recipes/domain/editable-draft.ts`: titel, portioner, tid, rader med mängd, enhet och katalogingrediens, och steg. Rader och steg bär sina sparade id (det valfria fältet `id` på en rad, och ett steg som `{ id, text }` i stället för bara text; importens utkast ser ut som förut). En kopplad rad blir `{ kind: "chosen", ingredientId }` och en rad utan ingrediens `unmatched`. Källa och bildadress följer med oförändrade och går inte att ändra.

I formuläret (även i förhandsgranskningen vid import) går det att ta bort en rad ("Ta bort raden" under "Ändra" på raden), ta bort ett steg och lägga till ett steg ("Lägg till steg", högst 100). Radernas stegkopplingar följer med när ett steg tas bort. Valideringen är densamma: tom titel eller tomt steg gör "Spara ändringar" inaktiv med fältfel, och att stänga ett ändrat formulär frågar "Släng ändringarna?".

"Spara ändringar" anropar Server Action `updateRecipe(id, draft, updatedAt)` (`actions/update-recipe.ts`), den enda skrivvägen för ändringar (AD-10). `updatedAt` är receptets `updated_at` (`SavedRecipe.updatedAt`) när formuläret fylldes i:

1. `requireUser()`, `recipeDraftSchema`, uuid för id och en tidpunkt för `updatedAt` (`unauthorized`, `validation`).
2. `savedRecipeRefsIn` läser receptets `updated_at`, radernas ingredienser och stegens id (under RLS). Inget skrivs förrän allt detta stämmer: har användaren inget recept med id:t blir det `recipe_save_failed` (loggas `not_found`); har receptet ändrats sedan formuläret fylldes i blir det `recipe_conflict`; och ett rad- eller steg-id i utkastet som inte hör till receptet ger `validation` (loggas `foreign_ids`).
3. `catalog.commitIngredients` med `lineChoices(lines, saved)`: en kvarvarande rad vars ingrediens inte ändrats skickas som vanlig träff och sparar ingen synonym; en omkopplad rad sparas som synonym (AD-6), och nya ingredienser skapas. Två rader med samma text som kopplas till olika ingredienser ger `recipe_conflicting_links` ("Två rader med samma text kan inte kopplas till olika ingredienser.").
4. `updateRecipeIn` anropar Postgres-funktionen `update_recipe(id, expected_updated_at, recipe, steps, lines)` (`security invoker`, bara `authenticated`, senast definierad i migrationen `<tid>_recipes_update_conflict.sql`). Den låser receptet och jämför `updated_at` med `expected_updated_at`; skiljer de sig ges felkoden `MK409` (`recipe_conflict`) och inget ändras. Annars uppdateras i en transaktion titel, portioner och tid; steg och rader med ett id som hör till receptet uppdateras och behåller id:t, rader och steg utan id läggs till, och receptets rader och steg som inte finns med raderas. Varje skrivning filtrerar också på `user_id = auth.uid()`, inte bara via RLS. Gränserna är `save_recipe`s (100 steg, 200 rader, positioner 0, 1, 2, …). Ett id som inte hör till receptet (även ett annat eget recepts), samma id två gånger eller en stegposition utan steg ger 22023, och ett fel ger inga ändringar alls. Ett recept som användaren inte har ger `null` och ingen ändring.
5. `revalidateFor("recipe")`.

Katalogen och receptet är olika moduler (AD-1). Försvinner receptet mellan steg 3 och 4 (t.ex. raderat i en annan flik) blir det `recipe_save_failed` (loggas `gone_after_commit`), men de nya ingredienser och synonymer som steg 3 sparade ligger kvar i katalogen.

Vid framgång stängs arket, Pontus står kvar i receptvyn med de nya uppgifterna och ser "Ändringarna är sparade.". Ett fel visas ovanför knappen ("Det gick inte att spara receptet. Försök igen." eller felkodens egen text), och formuläret står kvar. Vid `recipe_conflict` ("Receptet har ändrats någon annanstans. Stäng och öppna det igen.") hämtas receptvyn om (`router.refresh()`), så att formuläret byggs från det nya receptet nästa gång det öppnas. Ett schemafel på något som formuläret inte visar (bildadress, källa) ger en meddelanderuta ovanför "Spara ändringar" i stället för bara en inaktiv knapp.

"Ta bort recept" längst ned i formuläret byter arket till frågan "Ta bort [titel]? Det går inte att ångra." med "Ta bort" och "Avbryt" (arken staplas aldrig, så frågan visas i samma ark; "Avbryt" tar tillbaka formuläret med ändringarna kvar). "Ta bort" anropar `deleteRecipe(id)` (`actions/delete-recipe.ts`: `requireUser`, uuid, en vanlig `delete` på både receptets och användarens id, `revalidateFor("recipe")`). Stegen och raderna försvinner med receptet (`on delete cascade`), katalogen står kvar, och radering är hård utan ångra. Därefter hamnar Pontus i biblioteket (`router.replace("/recept")`, i samma övergång som actionens nya rendering, så att "Sidan finns inte." aldrig hinner visas) med "Receptet är borttaget.". Ett recept som redan är borta räknas som borttaget, så ett nytt försök efter ett tappat svar lyckas. En annan användares id raderar inget. Ett fel ger "Det gick inte att ta bort receptet. Försök igen." (`recipe_delete_failed`). Matsedeln kopplas loss först när den finns (Epic 3, `mealplan.detachRecipe`).

### Receptbiblioteket

Recept-sidan `/recept` läser listan med `listRecipes()` från `@/features/recipes/server` inuti `<Suspense>`, med skelettrader efter 300 ms (också medan klienten läser det sparade filtret, så att Alla inte visas först när Favoriter är sparat). Utan recept visas "Inga recept än. Klistra in en länk till ett recept du gillar." och "Importera recept". Annars visar klientkomponenten `Library` (`src/features/recipes/ui/library.tsx`) sökfältet, filterpillren Alla och Favoriter och receptraderna, nyast först (indexet `recipe (user_id, created_at desc)`). Ingen paginering i gränssnittet i v1; varje fråga sorteras på `created_at desc, id` och hämtas i sidor om 1000 rader (API:ets `max_rows`) med `.range()` tills en sida är kortare, så inget recept kapas bort.

- **Receptrad** (`recipe-row.tsx`): bild på 72 px (platshållare utan bild eller vid fel), titel, "35 min · 4 portioner" från `recipeMetaText` (utan tid när den saknas) och hjärtat. Titelns länk sträcks över hela raden, och hjärtat ligger bredvid länken, ovanpå den, så ett tryck på hjärtat aldrig navigerar.
- **Sökning**: `SearchField` väntar 200 ms (Enter söker direkt), tar högst 100 tecken och anropar läsactionen `searchRecipes(query)` (`search*`-undantaget i AD-1, `requireUser`, Zod, högst 100 tecken). Den normaliserar texten som katalogens sökning, hämtar ingrediens-id med `catalog.findIngredientIds` och kör `searchRecipesIn`: recept vars titel eller någon rads originaltext innehåller texten, eller som har en rad vars katalogingrediens hittades på namn eller synonym. `%`, `_` och `\` i söktexten är vanliga tecken (`containsPattern` i `src/lib/like-pattern.ts`). Ett tomt fält visar serverns lista utan anrop. Bara svaret på den senaste sökningen visas, och medan en sökning pågår är raderna nedtonade (`aria-busy`). Ingen träff ger "Inga recept matchar." och "Visa alla recept", som tömmer fältet. Misslyckas sökningen visas en meddelanderuta med "Försök igen"; ogiltig text får ingen sådan knapp, och en utgången session laddar om sidan så att inloggningen tar över.
- **Filter**: Alla eller Favoriter, sparat i `localStorage` (`matkoll.recept.filter`, med try/catch; utan `localStorage` gäller Alla och valet hålls i minnet, och lagringen prövas igen vid nästa läsning). Ett val eller en rensning i en annan flik följs. Filtret tillämpas i klienten på listan eller sökträffarna. Favoriter utan favoriter: "Inga favoriter än. Tryck på hjärtat på ett recept."
- **Hjärtat** finns i listan och i receptvyn och använder samma Server Action, `setFavorite({ id, isFavorite })` (`requireUser`, Zod, sätter värdet i stället för att växla det, uppdaterar bara raden med både receptets id och användarens id, `revalidateFor("recipe")`). Hjärtat visar det nya värdet direkt med `useOptimistic` (`use-favorites.ts`) och får sedan det sparade värdet från serverns nya rendering. Går det inte att spara (fel, annan användares id, ingen anslutning) går hjärtat tillbaka och den korta bekräftelsen säger "Det gick inte att spara favoriten.", men bara om det senaste trycket på just det hjärtat misslyckades. En utgången session laddar om sidan.

NFR7 (svar inom en sekund med 200 recept) mäts på två ställen. `tests/e2e/library.spec.ts` lägger in 198 recept utöver sina två, laddar `/recept` en gång för att värma servern och mäter sedan tiden från `page.goto("/recept")` tills alla 200 receptrader syns. Tiden skrivs ut och läggs som annotering; gränsen 1000 ms kontrolleras bara när `CI` är satt, alltså mot den byggda appen (`pnpm start`), inte mot `pnpm dev`. `tests/integration/recipes.test.ts` mäter `listRecipes` och en sökning med `searchRecipesIn` mot lokal Supabase för en användare med 200 recept och kräver under 1000 ms för vardera; det mäter bara frågorna, inte sidan.

### Inställningar

`/installningar` nås via kugghjulet i Recept-rubriken på mobil och längst ned i sidomenyn på dator. Sidan läser sajterna med `listRecipeSites()` från `@/features/settings/server` (användarens aktiva sajter, sorterade med `compareDomains` i `settings/domain`, samma ordning som listan håller i webbläsaren) inuti `<Suspense>`. Går sajterna inte att läsa visas en meddelanderuta med "Det gick inte att läsa inställningarna. Försök igen." i stället för listan. Sidan visar:

- **Godkända receptsajter** (`src/features/settings/ui/recipe-sites.tsx`): en rad per aktiv sajt med "Ta bort", och fältet "Ny receptsajt" med "Lägg till". Fältet tar en hel adress eller bara domänen; `domainNameSchema` gör om den till lagrad form ("https://www.Arla.se/recept" → "arla.se"). Server Action `addRecipeSite` (`actions/add-recipe-site.ts`, `useActionState`, `requireUser`, Zod) aktiverar en avstängd sajt om den finns och lägger annars in en ny rad. Något som inte är en domän (t.ex. "localhost" eller "127.0.0.1") ger "Ange en giltig webbadress, t.ex. koket.se." (`settings_invalid_domain`), och en sajt som redan är aktiv "koket.se finns redan." (`settings_duplicate_domain`, meningen i `error.fields.domain`). Inget sparas då, och texten står kvar i fältet.
- **Ta bort** anropar `setRecipeSiteActive({ domain, isActive: false })` (`actions/set-recipe-site-active.ts`). Sajten försvinner ur listan direkt (`useOptimistic`), och den korta bekräftelsen "Tog bort koket.se." har "Ångra" i 5 s, som anropar samma action med `isActive: true`. Sajter som tas bort medan bekräftelsen visas samlas i den ("Tog bort koket.se och ica.se.", "Tog bort 3 sajter."), och "Ångra" aktiverar alla (bekräftelsens `onClose` avslutar samlingen). Var sajten redan avstängd (`changed: false`) visas ingen bekräftelse. En sajt raderas aldrig ur `recipe_site` (docs/beslutslogg.md), så `ensure_user_defaults()` tar inte tillbaka en borttagen standardsajt vid nästa inloggning. Ett fel, även ett uteblivet svar, ger en meddelanderuta: "Det gick inte att spara ändringen. Försök igen." (`settings_save_failed`), och raden kommer tillbaka.
- **Logga ut**: textknappen längst ned anropar `signOut` (`src/features/auth/actions/sign-out.ts`), som avslutar sessionen i den här webbläsaren på servern (`signOut({ scope: "local" })`, så andra enheter förblir inloggade) och skickar till `/logga-in`. Därefter kräver varje sida inloggning igen. Knappen ligger utanför `<Suspense>` för sajterna, så den fungerar även när de inte går att läsa. Finns sessionen kvar efter ett fel, eller kommer inget svar, visas "Det gick inte att logga ut. Försök igen." (`auth_sign_out_failed`); kunde Supabase inte återkalla en session som ändå är borta loggas `auth_sign_out_revoke_failed`.

Ändringarna gäller direkt: importflödet läser de aktiva sajterna vid varje förfrågan (`getActiveRecipeDomains()`), och skrivningarna anropar `revalidateFor("recipe_site")`, som förnyar `/installningar`. RLS gör att en annan användare inte kan ändra någons sajter.

### Lagret

Modulen `src/features/pantry` äger tabellen `pantry_item` (migrationen `*_pantry.sql`, AD-4, AD-19). En lagervara pekar på en katalogingrediens (sammansatt främmande nyckel `(ingredient_id, user_id)` med `on delete restrict`, AD-20), har en plats (`Kyl`, `Frys` eller `Skafferi`) och antingen mängd och enhet eller ingetdera. Utan mängd är varan **obegränsad** och räcker alltid. En mängd är alltid större än 0 och mindre än en miljon (vilket också stänger ute `NaN` och `Infinity`, migrationen `*_pantry_constraints.sql`) och har alltid en enhet. Raden är unik på `(user_id, ingredient_id, location, unit)` med `nulls not distinct`, så varje ingrediens har högst en obegränsad rad per plats. `check`-listorna för plats och enhet är exakt `LOCATIONS` och `UNITS` i `catalog/domain` (`tests/design/pantry-checks.test.ts`). RLS, unik nyckel, främmande nyckel och `check` testas i `tests/integration/pantry.test.ts`.

Läsfunktionerna finns i `@/features/pantry/server` och använder användarens sessionsklient:

- `listPantry(location)`: platsens lagervaror med katalogens namn (via `catalog.getIngredientNames`), sorterade på namn i svensk ordning (`comparePantryItems`).
- `countPantryItems()`: antalet lagervaror per plats, räknat i databasen, för platskorten.
- `getPantrySnapshot()`: hela lagret per katalogingrediens, summerat över platser per enhet: `Map<ingredientId, { unlimited, amounts: { unit, amount }[] }>`. Mjölk 1 l i Kyl och 1 l i Frys blir `{ unlimited: false, amounts: [{ unit: "l", amount: 2 }] }`, och en ingrediens med någon rad utan mängd är `unlimited`. Enheter räknas aldrig om, och varje summa avrundas till sex decimaler så att 0,1 + 0,2 blir 0,3. Funktionen är memoiserad per förfrågan med React `cache` och är det enda som mängdlogiken (`coverage`, Story 2.4) tar emot. Summeringen görs av den rena funktionen `toSnapshot(rows)` i `pantry/domain`.

Alla läsningar hämtas i sidor om 1000 rader (API:ets `max_rows`; `tests/design/pantry-paging.test.ts` kontrollerar att `max_rows` i `supabase/config.toml` inte är mindre), så inget kapas bort. Att en användare med lagerrader kan tas bort, trots att nyckeln mot katalogen är `restrict`, testas i `tests/integration/pantry.test.ts`.

**Hemma** (`/hemma`) visar tre platskort i rad: Kyl (mint), Frys (ljusblå) och Skafferi (sand), med ikon, namn och "3 varor" (`src/features/pantry/ui/location-cards.tsx`). Korten är länkar till `/hemma?plats=kyl`, `frys` eller `skafferi`, så valet syns i adressen; en okänd plats visar Kyl. Valt kort har 2 px ram i `accent` och `aria-current`. Under korten visar `pantry-list.tsx` platsens varor: varor med mängd som rader under "Med mängd", med mängden till höger (`formatQuantity`), och obegränsade varor som runda mint-etiketter under "Finns hemma". En tom plats visar "Inget i kylen än." (eller frysen, skafferiet). Valt korts antal är antalet listade varor, så kort och lista alltid stämmer. Allt läses inuti `<Suspense>` med skelettrader (`src/app/(app)/hemma/home-content.tsx`), och den inre gränsen har platsen som nyckel, så en ny plats visar skelettraderna i stället för den förra platsens varor. Går lagret eller katalogens namn inte att läsa visas "Det gick inte att läsa lagret. Försök igen." (`pantry_unavailable`). Att lägga till, ändra och ta bort lagervaror kommer i Story 2.2 och 2.3, kameraknappen i Epic 6.

### Migrationer

Schemat ändras bara med migrationer (AD-4, AD-5):

```bash
pnpm exec supabase migration new <namn>   # skapar supabase/migrations/<tid>_<namn>.sql
pnpm exec supabase migration up           # kör nya migrationer mot den lokala databasen
pnpm db:types                             # genererar src/lib/supabase/database.types.ts; checka in filen
```

Utanför en terminal (t.ex. i ett skript eller en agent) väntar `migration new` på SQL från stdin; lägg till `< /dev/null`.

Kör inte `supabase db reset` lokalt: det raderar användarna. Ändra aldrig en migration som redan körts; skriv en ny. Varje tabell får `user_id ... default auth.uid() references auth.users on delete cascade`, RLS med policyn `user_id = (select auth.uid())`, grants till `authenticated` och `service_role` men aldrig `anon`, och ett RLS-test med `expectRlsIsolation` från `tests/integration/support.ts`. CI startar från en tom databas och misslyckas om de genererade typerna skiljer sig från den incheckade filen.

### Supabase i molnet

`supabase/config.toml` gäller bara lokalt. Sätt samma sak i molnprojektet: registrering avstängd, Site URL och redirect-URL:er för `/auth/confirm`, och e-postmallen för Magic Link (ämne och innehåll från `supabase/templates/magic-link.html`). Molnprojektet behöver också egen SMTP, eftersom den inbyggda e-posten har en mycket låg gräns och bara skickar till projektets teammedlemmar.

Integrations- och E2E-testerna skapar och tar bort användare med service role. De vägrar därför att köra om `NEXT_PUBLIC_SUPABASE_URL` inte pekar på `127.0.0.1` eller `localhost`.
