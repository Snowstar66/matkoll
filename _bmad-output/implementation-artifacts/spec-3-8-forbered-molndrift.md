---
title: 'Story 3.8: Förbered molndrift'
type: 'chore'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '04f519bb868fc833b99ae58e90cbdc790492c285'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Kärnan (Epic 1–3) fungerar lokalt, men inget är förberett för molnet. Pontus ska bara behöva skapa kontona och följa en checklista.

**Approach:** Tre leveranser, utan att några konton eller hemligheter skapas: ett schemalagt GitHub Actions-flöde som varje vecka gör en krypterad `supabase db dump` och sparar den som artefakt, och som hoppar över körningen med ett tydligt meddelande när hemligheterna saknas (AD-23); `docs/drift.md` med stegen för Vercel, Supabase, användare, schema och Cloudflare; och ett Playwright-test av hela kärnflödet som körs i CI.

## Boundaries & Constraints

**Always:** Inga konton, projekt, hemligheter, domäner eller tokens skapas, och inga riktiga värden skrivs in i repot (AD-14). Det som kräver Pontus står redan i "Checklista för Pontus" i `docs/oppna-fragor.md`; `docs/drift.md` är den utförliga beskrivningen och länkar dit, och checklistan får en länk till `docs/drift.md` och samma namn på hemligheterna. Flödet `.github/workflows/backup.yml`: `schedule` en gång i veckan och `workflow_dispatch`; `permissions: contents: read`; actions pinnas på huvudversion (`actions/checkout@v7`, `supabase/setup-cli@v3` med samma `SUPABASE_CLI_VERSION` som `ci.yml`, `actions/upload-artifact@v7`) (AD-23). Hemligheterna `SUPABASE_DB_URL` (anslutningssträng till molnets databas) och `BACKUP_PASSPHRASE` läses bara via `env` och skrivs aldrig ut. Ett första steg kontrollerar att båda finns; saknas någon skriver det `::notice::` med vilka som saknas och var de beskrivs ("Säkerhetskopian hoppades över: hemligheten SUPABASE_DB_URL saknas. Se docs/drift.md.") och resten av stegen hoppas över, så att körningen blir grön. Dumpen (schema med `supabase db dump` och data med `--data-only`) ska räcka för en återställning, även användarna i `auth.users` som alla rader refererar via `user_id`; kontrollera vilka scheman CLI:t tar med och lägg till `auth` vid behov. Den krypteras symmetriskt med `gpg --batch --symmetric --cipher-algo AES256` och lösenfrasen via stdin eller fil, aldrig på kommandoraden; bara den krypterade filen laddas upp, med `retention-days` och ett namn med datum. Flödet är inte en obligatorisk kontroll på `main`. Det nya e2e-testet har en egen e2e-användare och använder `AI_PROVIDER=mock`; inloggningen går genom appens riktiga `/logga-in` och länken från Mailpit, som i `auth.spec.ts`, utan testväg i appen (Consistency Conventions). Det körs av det befintliga e2e-jobbet i `ci.yml`. Kör aldrig `supabase db reset`.

**Never:** Ingen `vercel.json`, inga Vercel- eller Supabase-anrop från CI, ingen driftsättning, ingen `supabase link` eller `db push` från CI. Inga nya miljövariabler i appen (AD-14). Ingen okrypterad dump någonstans, inte heller i loggen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hemligheter saknas | Schemalagd körning utan `SUPABASE_DB_URL` eller `BACKUP_PASSPHRASE` | Körningen lyckas; sammanfattningen visar notisen om vilka hemligheter som saknas och att `docs/drift.md` beskriver dem; ingen dump och ingen artefakt | N/A |
| Hemligheter finns | Veckokörning | Artefakten `matkoll-backup-<ÅÅÅÅ-MM-DD>` med bara `.gpg`-filer; inga värden i loggen | Misslyckad dump eller kryptering: körningen misslyckas och GitHub mejlar |
| Manuell körning | `workflow_dispatch` | Samma som veckokörningen | N/A |
| Återställning | Pontus följer `docs/drift.md` | Dekryptera med `gpg --decrypt` och läs in med `psql` i ett nytt projekt | N/A |
| Schemalagt flöde före sammanslagning | Flödet finns bara i epic-grenen | Körs inte förrän det ligger på `main` (GitHub kör scheman bara från standardgrenen); står i `docs/drift.md` | N/A |
| `docs/drift.md` | Pontus läser den | Stegvis: Vercel-projekt `matkoll` i `arn1` (produktion byggs bara från `main`, Supabase-variabler bara i Production, inte i Preview); Supabase-projekt i `eu-north-1`; registrering avstängd; Site URL och redirect-URL (`<adress>/auth/confirm`); e-postmallen från `supabase/templates/magic-link.html` och övervägd egen SMTP; `pnpm users:sync` mot molnet med `ALLOWED_EMAILS`; `supabase link` och `supabase db push` före varje koddriftsättning; Cloudflare Tunnel och Access med tjänstetoken för LM Studio (`LMSTUDIO_BASE_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`); GitHub-hemligheterna för säkerhetskopian; första publiceringen kräver Pontus godkännande | N/A |
| Variabler | Avsnittet om miljövariabler | Bara namnen i AD-14 och `.env.example`; `SUPABASE_SERVICE_ROLE_KEY` läggs aldrig i Vercel utan används bara tillfälligt lokalt för `users:sync` | N/A |
| Kärnflödet | Playwright: logga in → importera recept från text (mock) → "Lägg på matsedeln" → Lista → bocka av en post → "Lägg i lagret" | "Lagt 1 vara i lagret."; posten är borta från listan; varan finns i Hemma | Testet misslyckas i CI |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` -- mönster: pinnade actions, `SUPABASE_CLI_VERSION`, `permissions`, e2e-jobbet som kör alla specar
- `docs/oppna-fragor.md` -- "Checklista för Pontus (när molnet sätts upp, efter Epic 1–3)"
- `docs/autonomi.md` -- "Det som kräver Pontus"
- `.env.example`, `src/server/env.ts` -- variabelnamnen (AD-14)
- `supabase/config.toml`, `supabase/templates/magic-link.html` -- registrering, redirect och e-postmall lokalt (AD-3)
- `scripts/users-sync.mjs` -- `pnpm users:sync`
- `tests/e2e/auth.spec.ts`, `support.ts` (`mailpitUrl`), `global-setup.ts`, `import.spec.ts` (`tests/fixtures/ai/kycklinggryta.txt`)
- `tests/lint/` -- plats för ett test av flödesfilen

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/backup.yml` -- flödet enligt Boundaries: kontrollsteg som sätter en output, `if` på övriga steg, `supabase db dump --db-url` för schema och `--data-only` för data, kryptering, uppladdning -- AD-23
- [x] `tests/lint/backup-workflow.test.ts` -- läser flödesfilen: schema och `workflow_dispatch` finns, actions pinnade på huvudversion, kontrollsteget finns, inga hemligheter i `run`-rader utanför `env`, bara `.gpg` laddas upp -- AD-23
- [x] `docs/drift.md` -- stegen i matrisen i ordning, med vad Pontus gör, var värdet hämtas och hur det kontrolleras; återställning av säkerhetskopian; länk till checklistan -- AD-3, AD-14, AD-23
- [x] `docs/oppna-fragor.md` -- checklistan länkar till `docs/drift.md` och nämner hemligheterna `SUPABASE_DB_URL` och `BACKUP_PASSPHRASE` -- spårbarhet
- [x] `tests/e2e/support.ts`, `global-setup.ts` -- `coreFlowEmail` ("e2e-karna@matkoll.test") i `e2eEmails`; ingen storage state, testet loggar in själv -- egen e2e-användare
- [x] `tests/e2e/core-flow.spec.ts` -- kärnflödet i matrisen med mock och riktig inloggning -- Epic 1–3

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

## Spec Change Log

- Artefakten innehåller flera krypterade filer: `schema.sql.gpg`, `data.sql.gpg`, `manifest.txt.gpg` och `counts.txt.gpg`. Datadumpen utesluter två lagringstabeller som inte går att läsa in igen, och auth-tabeller med sessioner och tokens.
- Repovariabeln `BACKUP_ENABLED` styr vad som händer när en hemlighet saknas. Är den satt till `true` misslyckas körningen, annars hoppas den över med en notis.

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.
- **Patch:**
  - `BACKUP_ENABLED` och kontroll av lösenfrasen (längd och radbrytning).
  - Dumpen kontrolleras och dekrypteras som test innan den laddas upp.
  - Manifest med migreringsversioner och radantal.
  - Sessioner och tokens tas inte med.
  - Lösenordet maskeras i loggen.
  - Körning två gånger i veckan, och bara från main.
  - drift.md:
    - att GitHub stänger av schemalagda flöden efter 60 dagar utan aktivitet
    - vem som får mejl när en körning misslyckas
    - en egen mapp för återställningen, utanför repot
    - `db push` från main efter återställning
    - reservplan om auth-schemat har en annan version
    - månadsvis nedladdning av säkerhetskopian
  - Förhandsbyggen är kontrollerade.
  - E2E-testet för kärnflödet är robust vid omkörning.
  - Lint-testet kör skriptet på riktigt.
- **Defer:** att låsa actions till commit-SHA. Vi följer `ci.yml` med huvudversioner tills vidare.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas, även `core-flow.spec.ts`

**Manual checks (if no CLI):**
- Efter sammanslagning till `main`, innan hemligheterna finns: kör `backup.yml` med `workflow_dispatch` -- expected: grön körning med notisen om saknade hemligheter
