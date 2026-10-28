---
title: 'Story 12.4: AI-jobb i kö, med AI-förslag först'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: 'fbee2fc0e43edfc8e266ecc53ede35dd00b03d74'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-3-kortare-svar-for-ai-forslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-3-lagningsstatus-forslag-och-lagg-i-lagret-foljer-valt-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-1-spara-senaste-fotot-per-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ett AI-anrop lever i sidans förfrågan. Pontus väntar vid "Letar efter idéer …" i upp till 90 s, och lämnar Pontus Recept stoppas förslagen. Pontus vill "fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara", utan risk (FR-46–FR-49).

**Approach:**
- Modulen `ai-jobs` och tabellen `ai_job` med kön i Postgres (AD-28).
- `POST /api/ai/jobs` svarar direkt med jobbet och kör arbetet i `after()` när det är jobbets tur.
- Klienten pollar, och appen visar jobbraden, arket AI-jobb, den korta bekräftelsen och flikmärket.
- AI-förslagen är det första flödet. `/api/ai/suggest` och kartan över körningar i `suggestFromPantry` tas bort.

## Boundaries & Constraints

**Always:**
- **Tabellen och funktionerna** enligt AD-28 och epic-kontexten: `ai_job` med RLS, grants, `unique (user_id, client_key)`, det partiella unika indexet för `running`, `check` på storleken av `context` och `result`, och `enqueue_ai_job`, `claim_ai_job`, `set_ai_job_result`, `finish_ai_job`, `cancel_ai_job`, `mark_ai_job_seen`, `dismiss_ai_job` med `ai_job_lock()`. Alla `security invoker`.
- **`enqueue_ai_job`:** samma `client_key` ger samma jobb; jobb vars `expires_at` har gått blir `failed` med `ai_job_lost`; avslutade jobb äldre än 24 timmar tas bort; ett aktivt `suggest` ges tillbaka när ett nytt `suggest` begärs; fler än tre aktiva ger `ai_queue_full`.
- **`claim_ai_job`:** `claimed` bara när inget annat jobb körs (efter att utgångna har markerats) och jobbet är det äldsta i kö; annars `waiting` med platsen, eller `gone`. Två samtidiga anrop kan aldrig båda få `claimed` (indexet och låset).
- **Rutten `POST /api/ai/jobs`** (`maxDuration = 300`): `isCrossSite`, `requireUserForRoute()`, JSON högst 4 KB med `{ kind: "suggest", clientKey, avoidTitles }` (Zod), förhandskontrollen för förslag (lagret läses; tomt ger `suggest_empty_pantry` direkt), `enqueue_ai_job` med `context: { siteId }`, svar 202 med jobbet, och `runAiJob` i `after()`.
- **`runAiJob(job, { runMs, startBy }, work)`** i `ai-jobs/server.ts`: frågar `claim_ai_job` varje sekund tills `claimed`, `gone` eller `startBy` (då `finish_ai_job` med `ai_queue_timeout`); kör `work(signal, deadline, report)` med en egen `AbortController` och tidsgränsen `started_at + runMs`; läser `status` var tredje sekund och avbryter vid `cancelled` eller `superseded`; avslutar med `finish_ai_job`. Ett okänt fel blir `ai_unavailable` och loggas med jobbets id.
- **`suggestFromPantry`** får jobbets signal och tidsgräns. Kartan `runs` tas bort. Resultatet (`DishSuggestions` med `siteId`) är jobbets `result`.
- **`GET /api/ai/jobs`** ger aktiva jobb och avslutade osedda jobb (utan hela resultatet), med plats i kön och en sammanfattning (antal rätter). **`GET /api/ai/jobs/[id]`** ger hela resultatet eller `ai_job_gone` (404). Båda skrivfria; ett utgånget jobb visas som `failed` med `ai_job_lost`.
- **Server Actions** i `ai-jobs/actions`: `cancelAiJob(id)`, `markAiJobSeen(id)`, `dismissAiJob(id)`, med `requireUser()` och Zod.
- **Klienten** (`src/lib/ai-jobs-client.ts`): `startAiJob` med en ny `clientKey` per tryck (samma vid ett nytt försök efter nätfel), pollning varannan sekund medan något jobb är aktivt och `document.visibilityState === "visible"`, en gång vid `visibilitychange` till synlig och en gång när appen laddas, och `useAiJobs()` med `useSyncExternalStore`. `AiJobsProvider` i `ai-jobs/ui`, renderad av `src/app/(app)/layout.tsx`.
- **AI-förslag i Recept** (`use-dish-suggestions.ts`): startar ett jobb, visar "Letar efter idéer … Du kan göra annat under tiden." och "Avbryt" (`cancelAiJob`) eller "I kö, 1 före.", och visar resultatet från jobbet när det är klart, också efter en omladdning eller när Pontus kommer tillbaka. Förslagen markeras som sedda när de visas och stängs (`dismissAiJob`) när Pontus stänger sektionen eller ber om nya. "Föreslå andra rätter" startar ett nytt jobb med titlarna att undvika.
- **Inaktuella förslag:** när jobbets `context.siteId` inte är valt ställe visas "Förslagen bygger på lagret för Hemma." och "Föreslå igen" över förslagen (bara med fler än ett ställe). De går att spara som förut.
- **Jobbraden, arket AI-jobb, flikmärket och den korta bekräftelsen** enligt `EXPERIENCE.md` (Component Patterns och State Patterns, Epic 12) och `DESIGN.md` (`job-row`, `tab-badge`). Flikmärket på Recept. Bekräftelsen "3 rättförslag är klara." med "Visa" i 8 s, inte när Recept visar förslagssektionen; väntar på en bekräftelse med "Ångra". `src/components/toast.tsx` får en variant med "Visa" och 8 s.
- **Felkoder** i `src/lib/errors.ts`: `ai_queue_full`, `ai_queue_timeout`, `ai_job_lost`, `ai_job_gone` med texterna i epic-kontexten, och statuskoder i `route-support.ts` (429, 504, 410, 404 eller enligt mönstret).
- **Mocken** läser `AI_MOCK_DELAY_MS` (0–30 000) och väntar så länge per anrop, med signalen. Ny rad i `src/server/env.ts` och `.env.example` (AD-14).
- **Säkerhetskopian** utesluter raderna i `public.ai_job` (`.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `docs/drift.md`).
- **Loggar** har bara felkod, sort, antal och jobbets id. Aldrig lagret, titlar eller svaret.
- E2E-specen har den egna e2e-användaren `e2e-ai-jobb@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Ingen Supabase-klient i webbläsaren och ingen Realtime.
- Inget AI-resultat sparas i en annan tabell än `ai_job` utan Pontus tryck.
- Inget lager, ingen titel och ingen recepttext i `ai_job.context`.
- Inget `request.signal` inne i `after()`.
- Bildanalysen och importen ändras inte i den här storyn (12.5, 12.6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Starta förslag | Lager med 17 varor | 202 inom 1 s, jobbet `queued` och sedan `running`, jobbraden visas | N/A |
| Tomt lager | Inga varor | Inget jobb | `suggest_empty_pantry` direkt |
| Lämna Recept | Jobbet pågår, Pontus i Inköpslista | Bekräftelse "3 rättförslag är klara." med "Visa", märket 1 på Recept | N/A |
| Stannar på Recept | Förslagssektionen syns | Förslagen visas direkt, ingen bekräftelse, inget märke | N/A |
| "Visa" | Från bekräftelsen | Recept med förslagen; märket försvinner | N/A |
| Omladdning | Jobbet pågår | Jobbraden och läget visas igen; resultatet kommer | N/A |
| Dubbeltryck | Samma `clientKey` två gånger | Ett jobb | N/A |
| Förslag när ett pågår | Ny begäran från annan flik | Samma jobb ges tillbaka | N/A |
| Fyra jobb | Tre aktiva (med mockens fördröjning) | Inget nytt | `ai_queue_full`, meddelanderuta |
| Två jobb | Ett pågår, ett i kö | Körs efter varandra; "· 1 i kö"; "I kö, 1 före." | N/A |
| Avbryt i kö | `cancelAiJob` | `cancelled`, startar aldrig | N/A |
| Avbryt pågående | `cancelAiJob` från annan flik | Vakten avbryter inom 3 s, inget resultat | N/A |
| Funktionen dör | `running` med `expires_at` passerad | Visas som `ai_job_lost`; nästa jobb får `claimed` | "AI-jobbet avbröts. Försök igen." |
| Hann inte börja | Kö längre än 175 s | `ai_queue_timeout` | "AI:n hann inte börja med det här. Försök igen." |
| Annat ställe | Pontus byter till Stugan under körningen | "Förslagen bygger på lagret för Hemma." och "Föreslå igen" | N/A |
| LM Studio av | Hälsokontrollen svarar inte | Jobbet `failed` med `ai_unavailable` | Meddelanderutan som förut, och "Det gick inte att ta fram rättförslag." på andra sidor |
| 24 timmar | Ett klart jobb som aldrig stängts | Tas bort vid nästa `enqueue_ai_job` | `ai_job_gone` om det hämtas |
| Annan användare | Läser, avbryter eller tar över ett jobb | Nekas | RLS-test |
| Två instanser | Två `claim_ai_job` samtidigt för två jobb | Bara en `claimed` | Integrationstest |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-12-context.md` -- datamodellen, funktionerna, tiderna och felkoderna
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` och `.../03-file-conventions/02-route-segment-config/maxDuration.md` -- läs före koden (`node_modules` finns i huvudmappen, inte i en worktree)
- `supabase/migrations/` -- mönstret för `pantry_lock()`, RLS, grants och `MK4xx`
- `src/app/api/ai/suggest/route.ts`, `route-support.ts` -- det som flyttar till `POST /api/ai/jobs`
- `src/features/suggestions/actions/suggest-from-pantry.ts`, `domain/suggestions.ts` -- förslagen
- `src/features/recipes/ui/use-dish-suggestions.ts`, `ai-suggestions.tsx` -- klientens förslag
- `src/lib/ai-client.ts` -- mönstret för `toResult`
- `src/components/toast.tsx`, `src/components/app-shell/` -- bekräftelsen, flikfältet och sidomenyn
- `src/app/(app)/layout.tsx` -- där leverantören renderas
- `src/lib/errors.ts`, `src/server/env.ts`, `.env.example`
- `.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `docs/drift.md`
- `tests/integration/` -- mönstret för RLS och två klienter

## Tasks & Acceptance

**Execution:**
- [x] Prov först (T11): en Route Handler i en gren som läser `requireUser()` och skriver en rad med sessionsklienten inne i `after()`, med `next build && next start`. Utfallet i beslutsloggen; fungerar det inte, får serverfunktionerna användaren som argument
- [x] `supabase/migrations/<tid>_ai_job.sql` (via `supabase migration new`) -- tabellen, index, RLS, grants, funktionerna. Sedan `pnpm db:types` -- AD-4, AD-5, AD-28
- [x] `tests/integration/ai-job.test.ts` -- matrisens databasrader, RLS och två samtidiga `claim_ai_job`
- [x] `src/features/ai-jobs/domain/*` (+ tester) -- sorter, lägen, `aiJobSchema`, tider (`runMs`, `startBy`, 295 s), sammanfattningen
- [x] `src/features/ai-jobs/data/*`, `server.ts` (+ tester) -- `enqueueAiJob`, `runAiJob` med falsk klocka och falska funktioner (kö, avbryt, vakt, tidsgräns, `gone`), `listAiJobs`, `getAiJob`
- [x] `src/features/ai-jobs/actions/*` (+ tester) -- `cancelAiJob`, `markAiJobSeen`, `dismissAiJob`
- [x] `src/app/api/ai/jobs/route.ts`, `jobs/[id]/route.ts` (+ `route.test.ts`) -- `POST` för `suggest`, `GET` listan och resultatet; `src/app/api/ai/suggest/` tas bort
- [x] `src/features/suggestions/actions/suggest-from-pantry.ts` (+ test) -- utan kartan, med jobbets signal och tidsgräns
- [x] `src/lib/ai-jobs-client.ts` (+ test) -- start, pollning med falsk klocka och `visibilitychange`, `useAiJobs()`
- [x] `src/features/ai-jobs/ui/*` (+ tester) -- `AiJobsProvider`, jobbraden, arket AI-jobb, bekräftelsen för klara jobb
- [x] `src/components/app-shell/*`, `src/components/toast.tsx` (+ tester) -- flikmärket och bekräftelsen med "Visa"
- [x] `src/features/recipes/ui/use-dish-suggestions.ts`, `ai-suggestions.tsx` (+ tester) -- förslagen som jobb, inaktuella förslag
- [x] `src/server/ai/adapters/mock.ts`, `src/server/env.ts`, `.env.example` (+ tester) -- `AI_MOCK_DELAY_MS`
- [x] `src/lib/errors.ts`, `src/app/api/ai/route-support.ts` -- felkoderna och statuskoderna
- [x] `.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `docs/drift.md` -- utan `ai_job`-rader
- [x] `tests/e2e/ai-jobs.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-ai-jobb@matkoll.test`, `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS=3000`: starta förslag, gå till Inköpslista, se jobbraden, bekräftelsen och märket, tryck "Visa" och se förslagen; två jobb i kö med "· 1 i kö"; avbryt ett i kö
- [x] Befintliga e2e-specar för förslag uppdateras
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given `ai_job` efter e2e-körningen, when raderna läses, then innehåller `context` bara `siteId`, och inget lager och inga titlar.
- Given två serverprocesser mot samma databas (integrationstestet), when båda försöker ta var sitt jobb för samma användare, then körs bara ett åt gången.

## Implementation Notes

- **Från granskningen av 12.2:** väckningen (`POST /api/ai/warm`) vet i dag bara om körningar i den egna serverinstansen (`hasAiRunOnItsWay`, `isSuggesting`), och gränsen ligger i processens minne (`src/server/ai/warm-limit.ts`). Med jobben: väckningen hoppar över när användaren har ett `ai_job` som körs eller står i kö, receptimporten blir ett jobb och räknas då som "något pågår", och gränsen kan läsas ur jobbtabellen (senast startade eller avslutade jobb), så att det gäller över serverinstanser. 12.4 bygger det delade läget.
- **Beslut (förslag): jobbet körs i `after()` i förfrågan som tog emot det.** Indata finns bara där. Ingen annan process kan ta över ett jobb, så ett jobb vars förfrågan dör blir `ai_job_lost` när dess tid har gått.
- **Beslut (förslag): pollning, inte Realtime.** AD-2 förbjuder Supabase-klienten i webbläsaren. Varannan sekund bara medan något är aktivt och fliken syns.
- **Beslut (förslag): `GET /api/ai/jobs` utan hela resultatet.** Listan pollas ofta; resultatet hämtas en gång med `GET /api/ai/jobs/[id]` när det behövs.
- **Beslut (förslag): `clientKey` per tryck,** skapad i klienten med `crypto.randomUUID()`, och samma nyckel vid ett nytt försök efter ett nätfel.
- **Risk: `cookies()` i `after()`** (T11). Dokumentationen säger att det fungerar i Route Handlers. Pröva först, med `next start`, och notera hur React `cache` i `requireUser()` beter sig i `after()`.
- **Risk: väntan i kön kostar funktionstid.** På Vercel debiteras CPU bara medan koden arbetar (Fluid compute); att vänta på databasen och modellen är I/O. Lokalt med `next start` finns ingen gräns, men koden håller samma tider så att beteendet är detsamma.
- **Risk: en ny driftsättning dödar pågående `after()`.** Jobbet blir `ai_job_lost` och visas med "Försök igen". Det är godtaget för en användare.
- Läs `docs/autonomi.md`: migrationen läggs till, inget tas bort i databasen.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** flikfältet (`src/components/app-shell/tab-bar.tsx`) har `min-h-tab-bar` och växer när en lång etikett radbryts mellan sina delar (`labelParts`, 10.4), så märket och jobbraden ovanför ska klara det. Sidhuvudet och Tillbaka ligger i `page-header.tsx` och `back-link.tsx` (11.1, 11.6). AI-förslagen i `ai-suggestions.tsx` visas sedan 11.5 som `RecipeCard` (`recipes/ui/recipe-card.tsx`) med AI-etiketten på en kort mintremsa; `recipe-row.tsx` finns inte längre. Säkerhetskopian (`backup.yml`, `backup-counts.sql`) ändrades i Epic 10 för fotona; `ai_job` hålls utanför på samma sätt.

## Spec Change Log

- Vid bygget:
  - **Byggd på `fbee2fc`** (`baseline_commit`), epicgrenen efter 12.3. Besluten (förslag) är godkända som de stod. Beslutsloggen har hela posten ("AI-jobb i kö, med AI-förslag först").
  - **T11 (sessionen i `after()`) fungerar.** `requireUser()`, lagret, katalogen och `finish_ai_job` läser och skriver som användaren inne i `after()` med `next start` (e2e med `CI=1`). Ruttens sessionsklient görs i förfrågan och lämnas till `runAiJob`, som därför tar klienten som första argument: `runAiJob(db, job, { startBy }, work)`. Körtiden räknas i `ai-jobs/domain` (`runTimes`).
  - **Databasen:** `20261028235500_ai_job.sql`, med allt specen kräver, plus `check` på att `finished_at` finns precis när jobbet är avslutat, att `done` har ett resultat och `failed` en felkod; `MK430` (kön full) och `MK431` (inget sådant jobb); funktionerna returnerar `jsonb` (`{ created, job }`, `{ outcome, position }`) så att rutten vet om jobbet är nytt; `enqueue_ai_job` ersätter också äldre `analyze`-jobb för samma ställe och plats, så att 12.5 inte behöver en migration. `supabase migration up --local` stoppades av `MigrationMissingLocalError` (andra grenar har kört migrationer), så migrationen kördes med `psql` och `schema_migrations`-raden lades in för hand. Kontroll före och efter med `scripts/pantry-site-check.sql` gav ingen skillnad, och en datasäkerhetskopia togs först.
  - **Avvikelser mot specen:**
    - `AI_MOCK_DELAY_MS` gäller bara AI-förslagen, inte de andra mockanropen, eftersom e2e-servern sätter 3 000 för alla specar och bildanalysen med numren annars tar 6 s. Samma hjälpare tas i bruk när 12.5 och 12.6 flyttar flödena.
    - Ett avbrutet jobb räknas som sett och visas inte i arket ("Avbrutet" står inte kvar tills det stängs). Se beslutsloggen.
    - `GET /api/ai/jobs` döljer klara jobb äldre än 24 timmar redan före nästa `enqueue_ai_job`, som tar bort raden.
  - **Väckningen** (granskningen av 12.2) läser nu `ai_job` (pågår, eller började eller slutade inom tre minuter) och räknar importer, och senare analyser, som något som pågår så fort de är jobb. `isBusy` får vara asynkron.
  - **Prövat:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (246 filer), `pnpm test:integration` (`tests/integration/ai-job.test.ts`: RLS, grants, alla funktioner, två `claim_ai_job` samtidigt), `AI_PROVIDER=mock pnpm build` och e2e för `ai-jobs`, `ai-suggestions`, `ai-warm`, `cookable`, `shell`, `library`, `recipes-look` och `app-install`. Hela e2e-sviten kördes inte här. Ingenting anropade LM Studio.
  - **`shell.spec.ts`** fick `expect.poll` för flikarnas färger: tills fältet har hydrerats har det ingen aktuell flik (AD-18), vilket en upptagen dator visade tillräckligt länge för att testet skulle falla.

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Mot LM Studio med `next build && next start`: be om förslag, gå till Inköpslista och vänta. Bekräftelsen och märket ska komma, och "Visa" ska visa förslagen.
- Två flikar: starta förslag i den ena; den andra visar jobbraden inom några sekunder, och "Avbryt" där stoppar jobbet.
- VoiceOver: jobbraden läses "AI-jobb: Letar efter rättförslag", fliken "Recept, 1 nytt AI-resultat", och bekräftelsen läses utan att fokus flyttas.
