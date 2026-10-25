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
| `pnpm test` | Vitest (domain-tester, miljövalidering, AI-porten med falsk modell och mock, lagerreglerna, designtokens och komponenttester) |
| `pnpm test:integration` | Vitest mot lokal Supabase (stängd registrering, `users:sync`, RLS och ingredienskatalogen). Kräver `pnpm db:start` och `pnpm db:env` |
| `pnpm build` | Produktionsbygge. Kräver `SITE_URL` och `AI_PROVIDER` (t.ex. `AI_PROVIDER=mock pnpm build`) |
| `pnpm test:e2e` | Playwright mot `pnpm dev` på port 3100 (`CI=1` kör `pnpm start`, så bygg först). Kräver lokal Supabase och `pnpm db:env`. Testanvändaren `e2e@matkoll.test` skapas med `users:sync` och loggas in via `/auth/confirm` i `tests/e2e/global-setup.ts`. Första gången: `pnpm exec playwright install chromium` |
| `pnpm eval:ai` | Kör AI-testuppsättningen mot vald `AI_PROVIDER` och skriver `tests/eval/report.md`. Manuellt, aldrig i CI (se AI-tjänsten nedan) |
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
| `ai_invalid` | Modellens text är inte JSON eller följer inte `src/server/ai/schemas.ts`, efter två nya försök. Före varje nytt försök får modellen veta vilka fält som var fel (sökväg och regel, aldrig värden) |
| `ai_rejected` | Leverantören svarar med HTTP 4xx, t.ex. fel nyckel, för många anrop, för lång förfrågan eller okänd modell. Inga nya försök |
| `ai_unavailable` | Hälsokontrollen misslyckas (LM Studio svarar inte på `/models` inom 5 s, eller `AI_MODEL` finns inte bland dess modeller), nätverksfel, HTTP 5xx, ett HTTP-svar vars innehåll inte är JSON (t.ex. en HTML-felsida), 45 s per försök eller 110 s totalt har gått, eller anropet avbryts. Inga nya försök |

Loggen får bara felkoden, en fast orsak och HTTP-status, aldrig indata, svar, promptar eller nycklar. Ett avbrott från anroparen loggas som info. Promptarna ligger i `src/server/ai/prompts/` och följer med i bygget.

**LM Studio lokalt:** ladda `qwen/qwen3.6-35b-a3b` och starta API-servern, i appen under Developer eller med `lms server start`. Servern ska bara lyssna på localhost (`http://localhost:1234`); slå inte på "Serve on Local Network". Sätt sedan i `.env.local`:

```bash
AI_PROVIDER=lmstudio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
```

Porten stänger av modellens tänkläge (`chat_template_kwargs.enable_thinking = false`) och ber om JSON enligt schemat.

**`pnpm eval:ai`** kör testuppsättningen i `tests/fixtures/ai/` mot vald `AI_PROVIDER` och skriver `tests/eval/report.md` (ignoreras av git). Med `AI_PROVIDER=mock` vägrar den att köra. Varje recept körs som text (med JSON-LD när fallet har det), och recept med en PNG körs också som bild. Svaret jämförs med `<namn>.expected.json`: titel, portioner, tid, antal rader, nyckelingrediensernas namn (hela ord) med mängd och enhet, och de vaga raderna. Kör den manuellt när leverantör eller modell byts, till exempel `AI_PROVIDER=lmstudio pnpm eval:ai`; utan `LMSTUDIO_BASE_URL` används `http://localhost:1234/v1`. Den ingår aldrig i `pnpm test` eller CI.

Testuppsättningen är fem påhittade recept: `<namn>.txt` (indata), `<namn>.response.json` (mockens svar), `<namn>.expected.json` (förväntningar), ibland `<namn>.jsonld.json` (JSON-LD som skickas med texten) och `<namn>.png`, samt `manifest.json` (fallen, mockens standardfall och reserverade indata). Fallen täcker JSON-LD med sidtext, en bild, en inbakad instruktion till modellen, ett portionsintervall (4–6) och ett recept utan tid. Mocken känner igen en text på SHA-256 av den normaliserade texten (text och JSON-LD) och en bild på dess bytes. Okänd indata ger standardfallet.

För att testa felbeskeden i importflödet svarar mocken med ett fel på de reserverade texterna i `manifest.json` (skiftläge och blanksteg spelar ingen roll):

| Text | Fel |
| --- | --- |
| `matkoll-mock: ai_unavailable` | `ai_unavailable` |
| `matkoll-mock: ai_invalid` | `ai_invalid` |
| `matkoll-mock: ai_rejected` | `ai_rejected` |
| `matkoll-mock: import_no_recipe` | `import_no_recipe` | Bilden av en receptsida skapas med `node scripts/render-recipe-image.mjs [namn]`.

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

Synonymer sparas av `commitIngredients`:

- När Pontus valt en annan ingrediens (`kind: "chosen"`) sparas radens normaliserade text som synonym; en befintlig synonym pekas om. Olika val för samma text i ett anrop ger `catalog_conflicting_synonyms`.
- En ny ingrediens vars namn skiljer sig från radens text får texten som synonym ("Lök, hackad" med namnet "Gul lök" ger synonymen "lök"), utom när två nya ingredienser delar texten ("salt och peppar").
- Ingen synonym sparas när texten redan leder till den valda ingrediensen, eller när texten är en annan ingrediens exakta namn: namnet matchas alltid först (AD-6), så synonymen skulle aldrig användas.

Katalogingredienser tas aldrig bort (AD-20): ingen roll har `delete` på `ingredient`. Listorna i databasens `check` måste vara exakt domänens; `tests/design/catalog-checks.test.ts` kontrollerar det.

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
