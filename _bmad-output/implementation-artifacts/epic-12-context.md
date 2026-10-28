# Epic 12 Context: Snabbare och asynkron AI

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Tillägg till 1.1. AI-flödena ska gå fortare och inte låsa appen. Pontus egna ord, 2026-10-26: "Vi borde få till prestandan i qwen kommandona om det går. Kanske göra dem asynkrona om det går, och att man kan fortsätta klicka runt i appen och göra fler asynkrona anrop som ramlar in när dom är klara. Om det inte riskerar ngt."

Pontus godkände planen ("ja planera det så"):

1. **Fart först, mätt före och efter:** mät, ställ in LM Studio, väck modellen i förväg, kortare svar för AI-förslag och den första rätten så fort den är klar.
2. **AI i bakgrunden:** servern svarar direkt med ett jobb och kör AI:n i bakgrunden. Resultatet sparas privat. Jobben står i kö och körs ett i taget. Appen säger till med en kort bekräftelse och ett märke på fliken. Ett resultat som har blivit inaktuellt sparas aldrig automatiskt.

Det motsvarar UJ-10 och Flöde 10 i EXPERIENCE.md, och kraven FR-45–FR-50 och NFR-13 i PRD-addendumet ("Tillägg till 1.1: Snabbare och asynkron AI"). Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-asynkron-ai.md`, och arkitekturen i AD-28.

Epicen byggs efter Epic 11 ("Nytt utseende"). Namnen är då Lagersaldo och Inköpslista (10.4), flikfältet har nya ikoner (11.1) och Matkoll kan ligga på hemskärmen (11.6). Rutterna (`/hemma`, `/recept`) är desamma.

Uppmätt före epicen (T5, T6):

- ett foto av kylen: 65 s med kall modell, 20 s med varm;
- numren på fotot: 6–10 s varmt, 20–24 s kallt;
- AI-förslag: 30–90 s, 1 300–2 000 token svar;
- import av en receptsida: 40–56 s;
- `lms ps`: `qwen/qwen3.6-35b-a3b`, kontext 8 192, PARALLEL 4, ingen TTL. Med PARALLEL 4 delar samtidiga anrop på farten, och under en utvärdering tog ett AI-förslag mer än 100 s.

Epicen bygger på det som redan finns:

- AI-porten i `src/server/ai/` (`run.ts`: `runStructured`, `defaultLimits`, hälsokontrollen; `service.ts`: `inputLimits`, `limitsWithin`, `createModelAiService`; `adapters/lmstudio.ts`; `adapters/mock.ts`; `schemas.ts`; `prompts/`);
- rutterna i `src/app/api/ai/` (`analyze`, `locate`, `suggest`, `import`, `import/photo`, `route-support.ts` med `isCrossSite`, `readCapped`, `readImageForm`, `respond`);
- `pantry/actions/analyze-place.ts`, `locate-place-items.ts` och låset `ai-runs.ts` (6.6);
- `suggestions/actions/suggest-from-pantry.ts` med sin egen karta över körningar;
- `recipes` med `importRecipe` (1.6, 1.8, 1.9);
- klienten `src/lib/ai-client.ts` och hookarna `pantry/ui/use-pantry-analysis.ts` och `recipes/ui/use-dish-suggestions.ts`, och arket `recipes/ui/import-sheet.tsx`;
- `src/components/toast.tsx` (kort bekräftelse, en i taget) och `src/components/app-shell/` (flikfält och sidomeny);
- utvärderingen `pnpm eval:ai` (`tests/eval/*.eval.ts`, rapport med tider sedan 6.6).

## Stories

- Story 12.1: Mät AI-tiderna och ställ in LM Studio
- Story 12.2: Väck modellen i förväg
- Story 12.3: Kortare svar för AI-förslag
- Story 12.4: AI-jobb i kö, med AI-förslag först
- Story 12.5: Bildanalys i bakgrunden
- Story 12.6: Receptimport i bakgrunden
- Story 12.7: Första rätten direkt

## Bindande beslut

- **Mät före och efter.** Varje snabb vinst (12.2, 12.3, 12.7) mäts mot LM Studio med varm och kall modell, tre körningar, före och efter. En vinst som inte når sitt mål tas bort eller ändras, och beslutet loggas.
- **LM Studio ändras inte utan att återställas.** Bygget får ladda om modellen med andra inställningar för att mäta (`lms load qwen/qwen3.6-35b-a3b -c 8192 --parallel 1`), men skriver ned `lms ps` före och laddar tillbaka samma inställningar efteråt. Rekommendationen står i `docs/lm-studio.md`, och Pontus väljer (öppen fråga 24).
- **Väckningen** (`warmUp`) är ett anrop med flödets egen systemprompt, minimal indata och `maxOutputTokens: 1`, utan schema och utan nya försök, högst 30 s. Bara LM Studio. Inte när ett jobb är aktivt. Klienten ber om den högst en gång per sort och fem minuter (`sessionStorage`, inom `try`), och servern har samma gräns per användare och sort i processen.
- **Det kompakta svaret för AI-förslag** görs om till `AiRecipe` i porten. `fromAiRecipe`, `RecipeDraft` och förhandsgranskningen ändras inte. `parseRecipe` behåller hela schemat.
- **Ett jobb körs i `after()` i den förfrågan som tog emot det.** Indata (foto, text, lagret) finns bara i den förfrågans minne. Ingen annan förfrågan kan köra jobbet, och indata sparas aldrig.
- **Kön ligger i Postgres:** högst ett jobb som körs per användare (partiellt unikt index), äldst först, högst tre aktiva. Inget lås i processen.
- **Tider:** jobbrutterna har `maxDuration = 300`. Funktionens tidsgräns är förfrågans start + 295 s. Körtid: 120 s för `suggest` och `analyze`, 130 s för `import`. Kötiden är resten: högst 175 s eller 165 s. Ett jobb som körs har `expires_at` = start + körtid + 10 s.
- **Ingen Supabase-klient i webbläsaren och ingen Realtime.** Klienten pollar `GET /api/ai/jobs` varannan sekund medan något jobb är aktivt och fliken syns.
- **Inget från AI sparas automatiskt.** Pontus bekräftar och sparar som förut. Ett ersatt jobb visas aldrig.
- **Resultat finns i högst 24 timmar,** och tas bort när Pontus stänger eller sparar dem. Raderna tas aldrig med i säkerhetskopian.

## Requirements & Constraints

- **Snabbare AI (FR-45):** se Bindande beslut. Målen: väckningen ger minst 20 % snabbare första anrop; AI-förslagen ger minst 25 % färre token och högst 40 s i median varmt; den första rätten syns efter högst 40 % av tiden för alla tre.
- **AI-jobb (FR-46):** start inom en sekund, fel utan AI direkt, jobbet överlever sidbyte, stängt ark och omladdning, går att avbryta.
- **Kön (FR-47):** ett i taget, äldst först, högst tre, över flikar och enheter, jobbraden med "2 i kö", inga hängande jobb, inga dubbla jobb.
- **Besked (FR-48):** kort bekräftelse med "Visa" i 8 s utom på resultatets sida, flikmärke med antalet osedda resultat på Recept och Lagersaldo.
- **Inaktuella resultat (FR-49):**

  | Jobb | Vad ändrades | Följd |
  | --- | --- | --- |
  | Bildanalys | Nytt foto av samma plats på samma ställe | Det äldre blir `superseded` och visas aldrig |
  | Bildanalys | Valt ställe byttes | Inte inaktuellt: förslagen gäller fotots ställe, med "Förslagen gäller Stugan." (8.4) |
  | Bildanalys | Stället togs bort | Bekräfta ger "Stället finns inte längre. Välj ett annat ställe." (8.4) |
  | Bildanalys | Platsens varor ändrades | Jämförelsen räknas när resultatet hämtas |
  | AI-förslag | Valt ställe byttes | "Förslagen bygger på lagret för Hemma." och "Föreslå igen". Går att spara. |
  | Import | – | Blir aldrig inaktuell |

- **Första rätten direkt (FR-50):** bara om provet mot LM Studio visar att svaret strömmar.
- **Integritet och tålighet (NFR-13):** RLS-test, inga foton, ingen recepttext och inget lager i `ai_job` eller loggar, inte i säkerhetskopian, inga hängande jobb, aldrig två jobb samtidigt.
- **Tillgänglighet:** jobbraden och flikmärket har namn för skärmläsare, bekräftelserna är artiga live-regioner som aldrig tar fokus, 44 px tryckytor, 375 px och 1280 px, ljust och mörkt läge, 200 % text.
- **Allt på svenska.** Inget rött.

## Technical Decisions

- **Moduler (AD-1, AD-28):**
  - `src/features/ai-jobs/` äger `ai_job`: `domain/` (lägen, sorter, `aiJobSchema`, tider), `data/` (anropen till Postgres-funktionerna), `actions/` (`cancelAiJob`, `markAiJobSeen`, `dismissAiJob`), `server.ts` (`runAiJob`, `enqueueAiJob`, `listAiJobs`, `getAiJob`), `ui/` (`AiJobsProvider`, jobbraden, arket AI-jobb). Importerar ingen annan feature-modul.
  - `src/lib/ai-jobs-client.ts`: `startAiJob(path, body | formData, clientKey)`, pollningen och `useAiJobs()` med `useSyncExternalStore`. Används av `pantry/ui`, `recipes/ui` och `src/components/app-shell` (flikmärket).
  - `src/app/(app)/layout.tsx` renderar `AiJobsProvider`.
  - Rutterna: `src/app/api/ai/jobs/route.ts` (`POST` JSON, `GET` listan), `jobs/photo/route.ts` (`POST` multipart), `jobs/[id]/route.ts` (`GET` resultatet), `warm/route.ts` (`POST`). De sätter ihop jobbet med modulens serverfunktion.
- **Datamodell (12.4, AD-5, AD-28):**
  - `ai_job (id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, kind text check in ('suggest','analyze','import'), status text check in ('queued','running','done','failed','cancelled','superseded'), client_key uuid not null, context jsonb not null default '{}', result jsonb, error_code text, created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz, expires_at timestamptz not null, seen_at timestamptz)`.
  - `unique (user_id, client_key)`, `create unique index ai_job_one_running on ai_job (user_id) where status = 'running'`, index `(user_id, status, created_at)`.
  - `check` att `context` är ett objekt och högst 2 KB, och att `result` är högst 256 KB, så att indata aldrig får plats av misstag.
  - RLS och grants enligt AD-4. Funktionerna i AD-28, `security invoker`, med `ai_job_lock()` (`pg_advisory_xact_lock` på användarens id, som `pantry_lock()`).
  - Migrationen skapas med `supabase migration new`. Typerna genereras om med `pnpm db:types`. Kör aldrig `supabase db reset`.
- **Körningen (`runAiJob`):**
  1. `after(async () => …)` direkt efter `enqueue_ai_job`.
  2. `claim_ai_job` varje sekund tills `claimed`, `gone` eller tidsgränsen för start (`ai_queue_timeout` med `finish_ai_job`).
  3. `work(signal, deadline, report)` med en egen `AbortController`. En vakt läser jobbets `status` var tredje sekund och avbryter vid `cancelled` eller `superseded`.
  4. `finish_ai_job(status, result, error_code)`. Ett fel som inte är en känd felkod blir `ai_unavailable` och loggas med jobbets id.
  - Aldrig `request.signal` i `after()`. Sessionen via `cookies()` i `after()` prövas först (T11); fungerar den inte, får modulens serverfunktion användaren som argument.
- **Väckningen (12.2, AD-9):** `AiService.warmUp(kind, signal)`. I `lmstudio`: hälsokontrollen, sedan `generateText` med `prompts.analyzeImage` och en grå PNG på 64 × 64 px (`image`) eller `prompts.suggestDishes` och "Lagret:\nsalt: finns" (`text`), `maxOutputTokens: 1`, `maxRetries: 0`, 30 s. I `mock`, `anthropic` och `openai`: inget. `POST /api/ai/warm` gör `isCrossSite`, `requireUserForRoute()`, Zod (`kind`), hoppar över när användaren har ett aktivt jobb eller väckte samma sort inom fem minuter, och svarar alltid 202 utan innehåll.
- **Det kompakta svaret (12.3, AD-10):** `suggestDishesAnswerCompactFor(avoidTitles)` i `schemas.ts` och `fromCompactDish(dish): AiRecipe` i porten. `hint.section`, `hint.location` och `hint.defaultUnit` kommer från `new`, annars Övrigt, Skafferi och radens enhet eller `st`. `isVague` är `amount === null`. Prompten `suggest-dishes.md` skrivs om för schemat. Mocken svarar med samma form.
- **Strömningen (12.7, AD-9):** `suggestDishesStream(input, signal, { onDish })` med `streamText`, `Output.array({ element: compactDish, minItems: 1, maxItems: 3 })` och `elementStream`. Varje rätt kontrolleras (titel att undvika, ny titel), görs om till `AiRecipe` och lämnas till `onDish`. `suggestFromPantry` matchar varje rätt mot katalogen och skriver den med `report` (`set_ai_job_result`). Ett nytt försök görs bara när ingen giltig rätt har kommit.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts`:

  | Felkod | Text | Story |
  | --- | --- | --- |
  | `ai_queue_full` | "Det finns redan tre AI-jobb. Vänta tills ett är klart." | 12.4 |
  | `ai_queue_timeout` | "AI:n hann inte börja med det här. Försök igen." | 12.4 |
  | `ai_job_lost` | "AI-jobbet avbröts. Försök igen." | 12.4 |
  | `ai_job_gone` | "Resultatet finns inte längre." | 12.4 |

  `ai_superseded` finns redan och betyder nu ett ersatt jobb.
- **Miljö (AD-14):** `AI_MOCK_DELAY_MS` (0–30 000), läses bara av mocken. Läggs i `.env.example` med kommentaren att den bara gäller tester.
- **Säkerhetskopian (AD-23):** `.github/workflows/backup.yml` utesluter raderna i `public.ai_job` (`--exclude public.ai_job` i `supabase db dump --data-only`; schemat följer med i `schema.sql`), `scripts/backup-counts.sql` räknar inte tabellen, och `docs/drift.md` säger det.
- **Rendering (AD-18):** ingen `revalidateFor` för `ai_job`.
- **Tester:**
  - Vitest bredvid koden: lägen och tider i `ai-jobs/domain`, `runAiJob` med falska funktioner (kö, avbryt, tidsgräns, ersatt), pollningen med falsk klocka, flikmärket och jobbraden (roller och namn), `fromCompactDish`, väckningen per adapter.
  - Integrationstester mot lokal Supabase (`tests/integration/ai-job.test.ts`): RLS, `enqueue_ai_job` (dubbla nycklar, ett förslag åt gången, ersatta foton, högst tre), `claim_ai_job` med två klienter samtidigt (bara en får `claimed`), utgångna jobb, `finish_ai_job` efter avbrott.
  - E2E med `AI_PROVIDER=mock` och `AI_MOCK_DELAY_MS`, en e2e-användare per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:
    - `e2e-ai-varm@matkoll.test` (12.2);
    - `e2e-ai-jobb@matkoll.test` (12.4);
    - `e2e-ai-foto@matkoll.test` (12.5);
    - `e2e-ai-import@matkoll.test` (12.6);
    - `e2e-ai-strom@matkoll.test` (12.7).
  - Befintliga e2e-specar för förslag, bildanalys, nummer och import uppdateras i den story som flyttar flödet.
  - Utvärderingen mot LM Studio i 12.1, 12.2, 12.3 och 12.7, inte i CI.

## UX & Interaction Patterns

- **Jobbraden:** ovanför flikfältet (överst i sidomenyn på dator) när något jobb är aktivt: "AI: Tittar på fotot av kylen · 2 i kö". Ett tryck öppnar arket AI-jobb.
- **Arket AI-jobb:** en rad per jobb med läge, "Avbryt" för aktiva och "Visa" för klara. Ett jobb som inte gick har feltexten och "Försök igen" när det går.
- **Flikmärket:** accentfärgad siffra på Recept och Lagersaldo med antalet klara resultat som Pontus inte har sett. Inte på fliken Pontus står på.
- **Kort bekräftelse:** "3 rättförslag är klara.", "14 förslag från fotot av kylen är klara.", "Receptet Krämig kycklinggryta är inläst.", med "Visa", i 8 s. Inte på resultatets sida. Väntar på en bekräftelse med "Ångra".
- **I flödet:** "Tittar på bilden … Du kan göra annat under tiden." och "Avbryt", eller "I kö, 1 före.".
- **Texter:** se EXPERIENCE.md, Voice and Tone (AI-jobb) och State Patterns (Epic 12).
- **Allmänt:** fel i en blå `Notice`, aldrig rött. Ark staplas aldrig. Synlig fokusram. "Minska rörelse" stoppar pricken i jobbraden.

## Cross-Story Dependencies

- **Före epicen:** Epic 11 är ihopslagen i `main`. Slå in `main` i `epic/12-asynkron-ai` innan 12.1 börjar.
- **12.1 före allt annat:** utgångsläget som 12.2, 12.3 och 12.7 mäts mot, och tiderna som kön dimensioneras efter.
- **12.2 efter 12.1:** väckningen. Fristående från jobben, men hoppar över när ett jobb är aktivt när 12.4 finns (fram till dess: när en körning pågår i processen).
- **12.3 efter 12.1:** det kompakta svaret. 12.7 bygger på det.
- **12.4 efter 12.3:** jobbtabellen, kön, pollningen, jobbraden, arket, bekräftelsen och märket, med AI-förslagen som första flöde.
- **12.5 efter 12.4:** bildanalysen och numren som jobb. Tar bort `ai-runs.ts`, `/api/ai/analyze` och `/api/ai/locate`.
- **12.6 efter 12.4:** importen som jobb. Kan byggas före eller efter 12.5. Tar bort `/api/ai/import` och `/api/ai/import/photo`.
- **12.7 sist:** strömningen av AI-förslagen, ovanpå jobben och det kompakta svaret.
- **Gren:** `epic/12-asynkron-ai`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten för Epic 12 följer med i grenen.
- **Efter epicen:** Pontus provar Flöde 10 i mobilen, väljer LM Studios inställningar efter `docs/lm-studio.md` och svarar på öppna frågor 21–25.

## Slutmätning Epic 12

Pontus bestämde 2026-10-28 att Epic 12 mäts en gång mot LM Studio när epicen är klar, inte per story. Mätningen görs med varm modell och tre körningar (`EVAL_RUNS=3`) med den inställning som `docs/lm-studio.md` rekommenderar, och kontrollerar först att LM Studio inte används av något annat (`~/.lmstudio/server-logs/`). Resultatet skrivs i `docs/lm-studio.md`, `docs/oppna-fragor.md` (T5, T10) och beslutsloggen, **med vilka stories som var ihopslagna i `epic/12-asynkron-ai` när mätningen kördes** (commit och lista över stories), så att siffrorna går att jämföra med 12.1:s utgångsläge.

**Story 12.3, kortare svar för AI-förslag** (`EVAL_LABEL=epic-12-varm AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/suggest-dishes.eval.ts`, med rapporten `tests/eval/suggest-report.md` och tidrapporterna i `tests/eval/reports/`):

- Token ut minst 25 % färre än i 12.1 (1 800–2 000 i median, 1 470–2 130 för de flesta svar). Räknat med tokeniseraren på mockens svar väntas ungefär 1 070.
- Högst 40 s i median varmt (12.1: 45,9 s för förslagen och 63,6 s för "andra rätter").
- Inte färre giltiga förslag än i 12.1 (där var sju av 33 anrop inte giltiga).
- Andelen rader utan `new` som inte finns i lagret (kolumnen Format i `suggest-report.md`). Varje sådan rad blir en ny katalogvara under Övrigt och Skafferi i förhandsgranskningen.
- **Taket för svaret** (`inputLimits.suggest.maxOutputTokens`, 3 000 token): kolumnerna "Token ut per försök" och "Kapat vid taket". Prompten ber om JSON på en rad, men LM Studio styr inte det, och ett indraget svar i full storlek (30 rader, 18 steg) kan bli ungefär 3 500 token. Kommer något giltigt försök nära 3 000 token, eller kapas något, höjs taket (högst till 4 000 som förut).
- **Reserv om målen inte nås:** högst 8 rader och 5 steg per rätt i prompten, mät igen och skriv valet och siffrorna i beslutsloggen. Antalet rätter står kvar (öppen fråga 25).

**Story 12.2, väckningen** (`tests/eval/warm-up.eval.ts`, med `EVAL_WARM=med` och `EVAL_WARM=utan`, kallt efter minst 15 minuters vila): det första anropet efter vila ska vara minst 20 % snabbare med väckning än utan, för bildanalysen och för AI-förslagen.

**Story 12.7, första rätten direkt:** den första rätten syns efter högst 40 % av tiden för alla tre, om provet visar att svaret strömmar (T9).
