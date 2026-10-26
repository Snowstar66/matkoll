---
title: 'Story 1.1: Projektgrund med kontroller'
type: 'chore'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '037d68a833e4a8fad52f346d3885eae8f13cef5d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Repot har bara planeringsdokument. Varje senare story behöver samma projektstruktur, lagerregler och tvingande kontroller, annars glider modulerna isär och kod kan nå `main` utan kontroll.

**Approach:** Skapa projektet från `create-next-app@16.4.3`, lägg till lagerstrukturen enligt AD-1 med ESLint-zoner, testverktyg, miljövalidering, `lefthook` och ett CI-flöde som blockerar sammanslagning när något fallerar.

## Boundaries & Constraints

**Always:** Versioner enligt arkitekturens Stack-tabell. `cacheComponents: true` behålls (AD-18). Tailwind via `@tailwindcss/turbopack` utan PostCSS-konfiguration. Kod, kommentarer och commit-meddelanden på engelska; gränssnittstext på svenska. Miljö läses bara via `src/server/env.ts` med de godkända namnen i AD-14.

**Never:** Ingen Supabase-, auth- eller AI-kod (Story 1.2 och 1.4). Inga tabeller eller migrationer. Inget komponentbibliotek. Ingen ändring i `docs/`, `_bmad/`, `.claude/` eller `scripts/board.mjs` utöver det specen anger. Inga hemligheter i repot.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tillåten import | `features/x/ui` importerar `features/x/actions` | ESLint godkänner | N/A |
| Förbjuden import | `features/x/domain` importerar `features/x/data`, eller `features/a/ui` importerar `features/b/data` | ESLint-fel | Commit stoppas av lefthook, CI fallerar |
| Hemlighet i commit | Fil med t.ex. en AWS-nyckel stagad | `gitleaks protect --staged` stoppar commiten | CI-jobbet gitleaks fallerar också |
| Ogiltig miljö | `AI_PROVIDER=foo` | `env.ts` kastar ett Zod-fel med variabelns namn vid start | Inget värde loggas |

</frozen-after-approval>

## Code Map

Inget kod finns ännu. Referensscaffold (samma flaggor) ligger i `/private/tmp/claude-501/-Users-pontus-AI-Projects-Matkoll/67fb9a7f-8674-4d91-94c9-bd712391e835/scratchpad/cna` och visar startmallens filer: `next.config.ts` (`cacheComponents`, `partialPrefetching`, `turbopack.rules`), `eslint.config.mjs`, `globals.css` med `@theme inline`, `pnpm-workspace.yaml`, `AGENTS.md`.

- `.gitignore` -- befintlig; behåll alla rader, lägg till startmallens som saknas
- `README.md` -- befintlig; ersätt inte, lägg till avsnittet "Kom igång" (pnpm install, dev, test)
- `docs/`, `_bmad/`, `_bmad-output/`, `scripts/board.mjs` -- rör inte
- `node_modules/next/dist/docs/` -- läs `01-app` före Next-specifik kod (startmallens AGENTS.md kräver det)

## Tasks & Acceptance

**Execution:**
- [ ] repo-rot -- generera startmallen i en tom tempmapp med `create-next-app@16.4.3 --ts --tailwind --eslint --app --src-dir --use-pnpm --import-alias "@/*"` och kopiera in filerna (ej `.git`), slå ihop `.gitignore` -- repot är inte tomt
- [x] `package.json` -- namn `matkoll`, Stack-versionerna (react/react-dom 19.3.1, `@types/node` ^24), `engines.node` `24.x`, skripten `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `test` (vitest run), `test:e2e` (playwright test); devDeps vitest 5.0.5, vite 8.3.5, @playwright/test 1.64.1, lefthook 2.2.2, eslint-plugin-import (för `import/no-restricted-paths` om eslint-config-next inte exponerar den), zod 4.6.7 som dep -- AD-23, Stack
- [x] `tsconfig.json` -- `strict: true` (startmallen) -- autonomi
- [x] `eslint.config.mjs` -- zoner för `import/no-restricted-paths` enligt AD-1-diagrammet: `domain` får inte importera `data`, `actions`, `ui`, `server`, `lib/supabase`, React eller Next; `ui` inte `data`; `src/server/**` inte `src/features/**` eller `src/lib/supabase/**`; ingen modul importerar en annan moduls `data`, `ui` eller `actions` direkt (bara via `index.ts`/`server.ts`); `no-restricted-imports` för `ai` och `@ai-sdk/*` utanför `src/server/ai/` -- AD-1, AD-9
- [x] `src/features/README.md`, `src/components/README.md`, `src/lib/README.md`, `src/server/README.md` -- en rad per mapp om vad som får ligga där -- story-AC
- [x] `src/features/example/{domain,data,ui,actions}/…` och `tests/lint/` -- fixtures som bevisar zonerna: en Vitest-fil kör ESLint programmatiskt på tillåtna och förbjudna importer och förväntar fel/inga fel; fixtures exkluderas från vanlig lint och bygge -- I/O-matris
- [x] `src/server/env.ts` -- `import 'server-only'`, Zod-schema för AD-14-namnen (valfria där storyn inte kräver dem, `AI_PROVIDER` enum `lmstudio|anthropic|openai|mock` med standard `mock`), exporterar `env`; fel nämner variabelnamn men aldrig värde -- AD-14
- [x] `src/server/env.test.ts` -- testar giltig och ogiltig miljö -- I/O-matris
- [x] `.env.example` -- alla AD-14-namn med kommentarer, inga värden -- AD-14
- [x] `vitest.config.ts` -- alias `@/` → `src/`, `server-only` → tom modul i `tests/mocks/server-only.ts`, miljö node, exkludera `tests/e2e` -- arkitekturens testkonvention
- [x] `playwright.config.ts`, `tests/e2e/smoke.spec.ts` -- startar `pnpm dev`/`build+start`, verifierar att startsidan svarar med svensk sidtitel "Matkoll" -- story-AC
- [x] `src/app/layout.tsx`, `src/app/page.tsx` -- `lang="sv"`, titel "Matkoll", minimal startsida (ersätts i 1.3) -- NFR6
- [x] `lefthook.yml` -- pre-commit: `gitleaks protect --staged --redact` och `eslint` på stagade filer -- AD-23
- [x] `.github/workflows/ci.yml` -- på PR och push till `main`: pnpm 12.15.0, Node 24, jobb `lint`, `typecheck`, `test`, `e2e` (installerar Chromium), `gitleaks` (`gitleaks/gitleaks-action@v3`, `fetch-depth: 0`) -- AD-23
- [x] `README.md` -- avsnitt "Kom igång" och att `gitleaks` måste finnas lokalt för lefthook -- dokumentation

**Acceptance Criteria:**
- Given en ren klon, when `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` körs, then lyckas alla.
- Given `next.config.ts`, when den läses, then är `cacheComponents: true` kvar.
- Given en PR mot `main`, when CI körs, then körs jobben lint, typecheck, test, e2e och gitleaks, och grenskydd på `main` kräver att de passerar (sätts med `gh api` när jobben har körts en gång).

## Implementation Notes

- Startmallen kopierades från referensscaffolden (samma flaggor); oanvända SVG:er i `public/` togs bort och Geist-typsnittet utelämnades (typsnitt kommer i 1.3).
- `README.md` fanns inte i roten; den skapades med "Kom igång".
- `typecheck` är `next typegen && tsc --noEmit`, eftersom `tsc` på en ren klon saknar Next-genererade typer (`LayoutProps`).
- `eslint-plugin-import` behövdes inte: `eslint-config-next` registrerar redan `import`-pluginet.
- Lintregler utöver specen, i linje med AD-1/AD-14: `src/app` får inte importera `data`; `ui` får inte importera `lib/supabase`; en annan modul får inte importera `domain` direkt; `process.env` är förbjudet i `src/**` utom `env.ts`.
- `"type": "module"` i `package.json` (tar bort en varning från Vite 8). `pnpm-workspace.yaml` har `lefthook: false` under `allowBuilds`; krokarna installeras av `prepare`.
- CI-actions på senaste huvudversion (`checkout@v7`, `setup-node@v7`, `pnpm/action-setup@v6` som stöder pnpm 12, `upload-artifact@v7`); alla taggar verifierade mot GitHub.
- `gitleaks` 8.30.1 installerades i `~/.local/bin` efter kontroll mot releasens SHA-256.
- Verifierat: lint, typecheck, 31 Vitest-tester (inkl. 26 lintfall), build, Playwright (`CI=1`), och lefthook stoppar en stagad hemlighet.
- Första CI-körningen på GitHub (PR #39): alla fem jobben gröna. Grenskydd på `main` satt med de fem kontrollerna som obligatoriska.

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | edge | Mönstret `"ai"` i `no-restricted-imports` stoppar även `@/server/ai` | high | Probe: `import … from "@/server/ai"` i en action ger `no-restricted-imports` | patch |
| 2 | blind, edge | `src/components` och `src/lib` saknar zon mot features | medium | README lovar regeln; probe utan fel för components→data | patch |
| 3 | blind, edge | `index.ts` kan importera data/actions/server; `ui` kan importera `server.ts` och `src/server` | medium | Inga zoner för dessa; fel syns först vid bygge | patch |
| 4 | edge | `src/app` kan importera en moduls `domain`/`actions` direkt; filer utanför de fyra mapparna nås från andra moduler | medium | Probe utan fel för app→domain; zonen listar bara fyra mappar | patch |
| 5 | blind, edge, verify | `process.env` kan läsas via `process["env"]`, destrukturering, `globalThis.process.env`, `node:process` | medium | Probe: alla fyra utan lintfel | patch |
| 6 | edge | domain kan importera Node-moduler för I/O (`node:fs`) | low | Probe utan fel; direkt tillägg i mönsterlistan | patch |
| 7 | verify | Regeln mot annan moduls `data` testas bara via en väg som `ui`-zonen redan stoppar | medium | Mutation: raden bort, 26/26 gröna | patch |
| 8 | verify, blind | Förbudet mot `@supabase/*` och `server-only` i domain är inte testat | medium | Mutation: gruppen bort, 26/26 gröna | patch |
| 9 | verify, blind, edge | Ogiltig miljö stoppar inte appen vid start; `env.ts` kastar vid import i testerna | medium | Ingen app-fil importerar `env.ts`; I/O-raden "kastar vid start" uppfylls inte | patch |
| 10 | blind, edge | `z.url()` godtar alla scheman | low | Verifierat av granskare; direkt korrigering | patch |
| 11 | blind | Inget test att `.env.example` och schemat har samma namn | low | Kommentaren i `env.ts` kräver det; litet test | patch |
| 12 | blind | `gitleaks protect` är utfasat i 8.30 | low | Dold i `--help`; direkt byte till `gitleaks git --pre-commit --staged` | patch |
| 13 | edge | `prepare` (`lefthook install`) fallerar utan `.git` | medium | Verifierat: exit 1 utanför git; bryter `pnpm install` i byggmiljöer utan `.git` | patch |
| 14 | blind | CI-jobb saknar `timeout-minutes` | low | Hängande e2e-server kör till GitHubs standardgräns | patch |
| 15 | edge | `cancel-in-progress` avbryter körningar på `main` | low | Direkt korrigering till bara PR | patch |
| 16 | blind, verify | `lib/supabase`-zonerna är döda tills mappen finns | low | Mappen saknas; kan inte testas förrän 1.2 | defer |
| 17 | blind | `env.ts` kontrollerar inte att AI-inställningarna hänger ihop | medium | Felkonfiguration syns först i AI-porten | defer (1.4) |
| 18 | blind | `SUPABASE_SERVICE_ROLE_KEY` ligger i appens `env` | medium | AD-4: bara tester och skript | defer (1.2) |
| 19 | blind | `AGENTS.md` saknar projektets regler | low | Agentkontextfil | defer |
| 20 | blind | Klienten saknar väg till `NEXT_PUBLIC_*` | false | AD-2: webbläsaren använder aldrig Supabase; inget klientkonfig behövs | avvisad |
| 21 | edge | gitleaks-action kräver licens för organisationer | false | Repot ägs av ett användarkonto (`gh api users/Snowstar66` → User) | avvisad |
| 22 | blind | CI-gitleaks version kan glida från lokal 8.30 | low | Ovanligt, fixen kräver extra konfiguration | avvisad |
| 23 | blind | Actions pinnas på huvudversion, inte SHA; ingen composite action; ingen cache för Playwright | low | AD-23 beslutar huvudversion; resten är bekvämlighet | avvisad |
| 24 | blind | `engines` tvingas inte (`engine-strict`) | low | CI kör Node 24; varning räcker | avvisad |
| 25 | blind | Fixturer kan ruttna; testerna kollar bara `ruleId` | low | Ovanligt, fixen lägger till komplexitet | avvisad |
| 26 | edge | Dynamisk `import("ai")` utanför porten | low | Ovanligt; fixen kräver fler selektorer | avvisad |
| 27 | edge | Mellanslag och versaler i miljövärden; `ALLOWED_EMAILS=","` ger `[]` | low | Ovanligt; tom lista nekar alla, vilket är säkert | avvisad |
| 28 | edge | `CI=false` lokalt tolkas som CI | low | Ovanligt | avvisad |
| 29 | edge | ESLint i kroken läser arbetskopian vid delvis stagade filer | low | Ovanligt; fixen kräver stash-logik | avvisad |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` -- expected: alla lyckas
- `pnpm test:e2e` -- expected: smoke-testet passerar
- `pnpm exec lefthook run pre-commit` med en stagad testhemlighet -- expected: stoppas (stagingen återställs efteråt)
