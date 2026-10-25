---
title: 'Story 1.2: Inloggning med engångslänk'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd28367037e0da4a9c9ed3e10f043afaed1b2163f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Appen har ingen inloggning. Adressen blir publik och AI:n på Pontus Mac får bara nås av honom, så varje sida och serverfunktion måste kräva en session för en tillåten e-postadress.

**Approach:** Lokal Supabase via CLI med avstängd registrering, engångslänk med `token_hash` som verifieras i `/auth/confirm`, sessionsförnyelse i `src/proxy.ts` och en auktoritativ `requireUser()` som också kontrollerar `ALLOWED_EMAILS` (AD-3). Användare skapas bara av skriptet `pnpm users:sync`.

## Boundaries & Constraints

**Always:** `@supabase/ssr` med cookies; `getClaims()`, aldrig `getSession()`, i serverkod. Sessionen läses inuti `<Suspense>` (AD-18). Svensk text enligt `EXPERIENCE.md`. Resultatformen och felkoderna i `src/lib/errors.ts` (AD-13). Webbläsaren använder aldrig Supabase-klienten (AD-2). Service role-nyckeln används bara i `scripts/` och `tests/`, aldrig i `src/`.

**Never:** Ingen testväg eller bakdörr i appen. Inga tabeller i `public` (kommer i 1.5). Inget anrop till `ensure_user_defaults()` (kommer i 1.8). Ingen app-skal-design (1.3); sidorna här är enkla. Ingen utloggning (1.12). `users:sync` raderar aldrig användare utan flaggan `--prune`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ej inloggad | GET `/recept` utan session | 307 till `/logga-in?next=%2Frecept` | N/A |
| Tillåten adress | Formulär med adress i `ALLOWED_EMAILS` | Länk skickas (syns i Mailpit), sidan visar "Om adressen har åtkomst får du en länk" | Supabase-fel visas inte; samma text |
| Otillåten adress | Formulär med adress utanför listan | Samma text, inget mejl skickas, ingen användare skapas | N/A |
| Ogiltig adress | "inte-en-adress" | "Ange en giltig e-postadress." | Valideringsfel, inget anrop |
| Länk öppnas | `/auth/confirm?token_hash=…&type=email&next=/recept`, även i annan webbläsare | Sessionscookies sätts, 307 till `next` | N/A |
| Ogiltig eller använd länk | Felaktig `token_hash` | 307 till `/logga-in?fel=lank`, sidan visar "Länken har gått ut eller redan använts. Be om en ny." | Ingen session |
| Osäker `next` | `next=//evil.com`, `https://evil.com`, `/\evil.com` | Ignoreras, `/recept` används | N/A |
| Session för otillåten adress | Giltig session, e-post ej i `ALLOWED_EMAILS` | Sida: till `/logga-in`; action: `{ ok:false, error:{ code:'unauthorized' } }`; Route Handler: 401 | N/A |
| Direkt registrering | `auth.signUp` med publik nyckel | Misslyckas, ingen användare skapas | N/A |

</frozen-after-approval>

## Code Map

- `src/server/env-schema.ts`, `src/server/env.ts`, `src/server/env.test.ts` -- `SUPABASE_SERVICE_ROLE_KEY` flyttas ut ur appens schema; testet som jämför med `.env.example` ska tillåta en markerad sektion för skript- och testvariabler
- `eslint.config.mjs` -- zonerna för `./src/lib/supabase/**` finns redan men är döda tills mappen finns; `no-restricted-syntax` mot `process.env` gäller `src/**`
- `tests/lint/layer-rules.test.ts` -- lägg till fall för `lib/supabase` (se Tasks)
- `src/app/page.tsx`, `src/app/layout.tsx` -- befintlig platshållare; startsidan ska omdirigera till `/recept`
- `.github/workflows/ci.yml`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts` -- E2E kräver nu Supabase och en inloggad testanvändare
- `node_modules/next/dist/docs/01-app/` -- läs `proxy`, `route-handlers`, `authentication-with-cache-components` före Next-kod
- Supabase-guider: "Creating a Supabase client for SSR" och "Passwordless email logins" (token_hash, `/auth/confirm`)

## Tasks & Acceptance

**Execution:**
- [x] `supabase/config.toml` -- `supabase init`; `[api] auto_expose_new_tables = false`; `[auth] enable_signup = false`, `site_url = "http://localhost:3000"`, `additional_redirect_urls` för `http://localhost:3000/**` och `http://localhost:3100/**`; `[auth.email] enable_signup = false`; `[auth.email.template.magic_link]` med svensk ämnesrad och `content_path` -- AD-3, AD-4
- [x] `supabase/templates/magic-link.html` -- svensk text, länk `{{ .RedirectTo }}` + `token_hash={{ .TokenHash }}&type=email` där `RedirectTo` är `/auth/confirm?next=…` -- fungerar i alla webbläsare
- [x] `package.json` -- `@supabase/supabase-js` 2.118.0, `@supabase/ssr` 0.12.7, `supabase` 2.122.0 (dev); skript `db:start`, `db:types` (`supabase gen types --local --schema public > src/lib/supabase/database.types.ts`), `db:env` (skriver Supabase-värden till `.env.local` från `supabase status -o env`), `users:sync`, `test:integration` -- AD-5, AD-14
- [x] `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/lib/supabase/database.types.ts` -- serverklient med `getAll`/`setAll`, `updateSession(request)` för proxyn, genererade typer -- AD-3
- [x] `src/proxy.ts` -- förnya sessionen med `getClaims()`; utan claims och utanför `/logga-in` och `/auth/confirm`: 307 till `/logga-in?next=<sökväg>`; matcher exkluderar statiska filer -- AD-3
- [x] `src/lib/errors.ts` -- `Result<T>`, `ok()`, `fail(code)`, koderna `unauthorized` och `validation` med svensk text -- AD-13
- [x] `src/features/auth/domain/` -- `safeNextPath(raw)` och `isAllowedEmail(email, allowed)` (rena, med tester) -- I/O-matrisen
- [x] `src/features/auth/data/queries.ts`, `src/features/auth/server.ts` -- `getCurrentUser()` (React `cache`, `getClaims()` + tillåtelselista, returnerar `{ id, email }` eller `null`), `requireUser()` → `Result<User>` för actions, `requireUserOrRedirect(next)` för sidor, `requireUserForRoute()` → 401-svar -- AD-3
- [x] `src/features/auth/actions/send-magic-link.ts` -- Zod-validering; skickar bara för tillåtna adresser med `shouldCreateUser: false` och `emailRedirectTo` till `/auth/confirm?next=…`; samma svar oavsett -- AD-3
- [x] `src/app/logga-in/page.tsx`, `src/features/auth/ui/login-form.tsx` -- e-postfält (minst 16 px text, 44 px tryckyta), knappen "Skicka länk", meddelanden enligt matrisen, `useActionState` -- UX
- [x] `src/app/auth/confirm/route.ts` -- `verifyOtp({ token_hash, type: 'email' })`, säker `next`, fel till `/logga-in?fel=lank` -- AD-3
- [x] `src/app/recept/page.tsx`, `src/app/page.tsx` -- `/recept` platshållare (rubrik "Recept", inloggad adress) via `requireUserOrRedirect` inuti `<Suspense>`; `/` → `/recept` -- AC
- [x] `scripts/users-sync.mjs` -- service role: skapar saknade användare i `ALLOWED_EMAILS` (`email_confirm: true`), listar övriga som varning, raderar dem bara med `--prune` -- AC, säkerhet
- [x] `tests/integration/auth.test.ts`, `vitest.integration.config.ts` -- mot lokal Supabase: `signUp` med publik nyckel misslyckas; `signInWithOtp` med `shouldCreateUser:false` skapar ingen användare; `users:sync` skapar exakt de tillåtna -- AC
- [x] `tests/e2e/global-setup.ts`, `playwright.config.ts` -- testanvändare via `users:sync`, `auth.admin.generateLink({ type:'magiclink' })`, öppna den riktiga `/auth/confirm` med `hashed_token`, spara `storageState`; e2e-fall för ej inloggad, otillåten session, ogiltig länk och osäker `next` -- AC
- [x] `tests/lint/layer-rules.test.ts` -- förbjudna fall: domain → `@/lib/supabase/server`, ui → `@/lib/supabase/server`, `src/server/**` → `@/lib/supabase/server`; tillåtet: `features/*/data` → `@/lib/supabase/server` -- uppskjutet från 1.1
- [x] `eslint.config.mjs` -- förbjud `SUPABASE_SERVICE_ROLE_KEY` och `@supabase/supabase-js`s `createClient` med service role i `src/**` (t.ex. selektor för identifieraren/strängen) -- uppskjutet från 1.1, AD-4
- [x] `.github/workflows/ci.yml` -- jobbet `integration` (`supabase/setup-cli@v3`, `supabase start`, `pnpm db:types` och `git diff --exit-code` på typfilen, `pnpm test:integration`); `e2e` startar Supabase och sätter env från `supabase status` -- AD-5, AD-23
- [x] `.env.example`, `README.md` -- nya variabler och skript, lokal start (`pnpm db:start`, `pnpm db:env`, `pnpm users:sync`, Mailpit på `http://127.0.0.1:54324`) -- dokumentation

**Acceptance Criteria:**
- Given lokal Supabase, when `pnpm users:sync` körs två gånger med samma `ALLOWED_EMAILS`, then finns varje tillåten adress en gång och inget raderas.
- Given en inloggad session, when sidan laddas om efter att access-token gått ut, then förnyar proxyn sessionen och Pontus förblir inloggad.
- Given CI, when PR:en körs, then passerar lint, typecheck, test, integration, e2e och gitleaks.

## Implementation Notes

- `[auth.email] enable_signup` är kvar som `true`: CLI:t mappar den till `GOTRUE_EXTERNAL_EMAIL_ENABLED`, och `false` stänger av e-postinloggning helt ("Email logins are disabled"). Registreringen stängs av `[auth] enable_signup = false` (`GOTRUE_DISABLE_SIGNUP`); integrationstesterna visar att `signUp` misslyckas och att OTP inte skapar användare. Kommentar finns i `config.toml`.
- `/` → `/recept` är en `redirects()`-regel i `next.config.ts` (en `redirect()` i en sida gav en varning från Cache Components); `src/app/page.tsx` är borttagen.
- Proxyn omdirigerar bara GET/HEAD-sidförfrågningar; andra metoder och `/api/*` släpps igenom så att `requireUser()` kan svara `unauthorized`/401.
- `fail(code, fields?)` tar valfria fältfel; koden `auth_link_invalid` lades till för ogiltig länk.
- `createClient()` börjar med `await connection()`, eftersom Supabase-klientens `Date.now()` annars bryter förrenderingen (AD-18).
- "Skicka länk" är inaktiv tills sidan hydrerats, och fallbacken i `<Suspense>` på `/logga-in` är `null`, så att inskriven text inte försvinner.
- `db:env` tar `SUPABASE_SERVICE_ROLE_KEY` från CLI:ts nya `SECRET_KEY` (`sb_secret_…`) med reserv till `SERVICE_ROLE_KEY`.
- `users:sync` vägrar köra med tom lista; ren planeringslogik i `scripts/users-sync-plan.mjs` med tester.
- Verifierat lokalt: lint, typecheck, 120 Vitest, 5 integrationstester, build, 13 Playwright (`CI=1`), `db:types` stabil.
- Efter granskning: `SITE_URL` (AD-14) styr länkens adress; 503 när Supabase saknas; länk för otillåten adress loggar ut med "Adressen har inte åtkomst till Matkoll."; tester vägrar köra mot annat än lokal Supabase; misslyckad länk behåller `next` (matrisraden för ogiltig länk ger därför `/logga-in?fel=lank&next=…`). `pnpm build` kräver `SITE_URL`; `pnpm db:env` sätter `http://localhost:3000` om värdet saknas. Lokala CLI:t ignorerar `email_sent` utan egen SMTP.
- Slutverifiering: lint, typecheck, 126 Vitest, 5 integrationstester, build, 16 Playwright.
- Kvar: CI-jobbet `integration` ska läggas till som obligatorisk kontroll på `main` när det körts en gång. Pontus behöver sätta sin adress i `ALLOWED_EMAILS` i `.env.local` och köra `pnpm users:sync`.

## Spec Change Log

- Granskning 1 (#1): länkens ursprung från förfrågans huvuden ersätts av en konfigurerad `SITE_URL` (serverns miljö, http/https, standard `http://localhost:3000` utanför produktion, krävs i produktion). AD-14 utökad med namnet. Undviker trasiga länkar när Supabase faller tillbaka till Site URL och tillit till huvuden. KEEP: allt övrigt i implementationen.

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Länkens ursprung byggs från `Origin`/`Host`-huvuden; mallen `{{ .RedirectTo }}&token_hash=…` blir trasig när Supabase faller tillbaka till Site URL; `Origin: null` kastar; tyst reserv till localhost i produktion | medium | `requestOrigin()` i `send-magic-link.ts`; tillåtelselistan lokalt gäller bara `localhost`, så `127.0.0.1:3000` ger reserv till Site URL utan `?` | patch (ny `SITE_URL`, AD-14 uppdaterad) |
| 2 | blind, edge | Proxyn kastar på varje förfrågan när Supabase saknas (förhandsdriftsättning, AD-23) | medium | `updateSession()` → `supabaseConfig()` kastar före `isPublic` | patch |
| 3 | edge | Lokal `[auth.rate_limit] email_sent = 2` per timme | medium | Standard i `config.toml`; tredje utskicket uteblir tyst lokalt | patch |
| 4 | blind | Misslyckat utskick loggas utan orsak | low | `console.error("auth_magic_link_failed")`; direkt korrigering | patch |
| 5 | blind | Misslyckad bekräftelse tappar `next` | low | `/auth/confirm` → `/logga-in?fel=lank` utan `next`; direkt korrigering | patch |
| 6 | blind, edge | Giltig länk för användare utanför `ALLOWED_EMAILS` ger session men ingen åtkomst och ingen förklaring | medium | `confirm` kontrollerar inte listan; `users:sync` utan `--prune` behåller sådana användare | patch |
| 7 | blind | E2E- och integrationstester kan köra mot molnet om `.env.local` pekar dit | high | `global-setup` och `auth.test.ts` skapar/raderar användare med service role mot valfri URL | patch |
| 8 | blind | Meddelandet om utgången länk ligger i en live-region vid sidladdning | low | Skärmläsare läser sällan upp sådant innehåll; direkt korrigering | patch |
| 9 | verify | Ett annat `next` än `/recept` testas aldrig hela vägen | medium | Alla e2e-värden är standardvärdet; regressioner i proxy/formulär/confirm passerar | patch |
| 10 | verify | Grenen "Supabase vägrar" i `sendMagicLink` körs aldrig | medium | Mutation: att returnera fel vid `!sent` passerar alla tester; skulle avslöja listan | patch |
| 11 | blind | README för molnet nämner inte SMTP | low | Supabase inbyggda e-post har låg gräns; direkt tillägg | patch |
| 12 | blind | `mailHtml` kontrollerar inte `response.ok` | low | Direkt korrigering | patch |
| 13 | blind, edge | E-postskannrar kan förbruka länken (GET verifierar direkt) | medium (ej verifierad) | Beror på Pontus e-postklient; avgörs om länkar "redan använts" vid första klick | defer |
| 14 | verify, blind | `users:sync --prune` körs aldrig mot riktig Supabase i tester | medium | Ett säkert test kräver isolering från utvecklarens användare | defer |
| 15 | blind, edge | Svarstiden avslöjar om en adress är tillåten | low | Kräver mätning av många förfrågningar; fixen lägger till komplexitet | avvisad |
| 16 | blind | Ingen egen begränsning av antal förfrågningar | low | Supabase begränsar; en användare | avvisad |
| 17 | blind | Ingen utloggning | false | Frozen "Never": utloggning kommer i 1.12 | avvisad |
| 18 | blind | Inloggad användare på `/logga-in` ser formuläret | low | Ovanligt; ofarligt | avvisad |
| 19 | blind | `--prune` saknar `--dry-run` | low | Flaggan är redan uttrycklig och listar först | avvisad |
| 20 | blind | Enhetstester saknas för proxy och `requestOrigin` | low | E2E täcker proxyn; `requestOrigin` försvinner med #1 | avvisad |
| 21 | blind | `waitForTimeout` och varningar från `users-sync` i e2e | low | Testbekvämlighet | avvisad |
| 22 | edge | Supabase-config saknas kastar bara för tillåtna adresser | low | Med #2 nås inte åtgärden utan konfiguration | avvisad |
| 23 | edge | Återanvänd dev-server utan `ALLOWED_EMAILS` | low | Lokal bekvämlighet | avvisad |
| 24 | edge | Delad sessionscookie (`.0/.1`) i testet för utgången token | low | Testet passerar; sessionen är liten | avvisad |
| 25 | edge | "Om adressen har åtkomst …" står kvar när adressen ändras | low | Kosmetiskt | avvisad |
| 26 | edge | `db-env.mjs`: saknad `.env.example`, `export KEY=` | low | `.env.example` finns alltid i repot | avvisad |
| 27 | edge | `afterAll` döljer setupfel | low | Testbekvämlighet | avvisad |
| 28 | edge | Specen säger `[auth.email] enable_signup = false` | low | Fixen är att ändra specen; avvikelsen är dokumenterad i Implementation Notes | avvisad |
| 29 | edge | Proxyn omdirigerar bara GET/HEAD | false | Avsiktligt; `requireUser()` skyddar actions och Route Handlers (testat) | avvisad |

## Verification

**Commands:**
- `pnpm db:start && pnpm db:env && pnpm users:sync` -- expected: Supabase igång, `.env.local` skriven, användare skapade
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `pnpm db:types && git diff --exit-code src/lib/supabase/database.types.ts` -- expected: ingen skillnad
