# Matkoll

Recept, matsedel, inköpslista och det du har hemma, i en app. Planering och beslut finns i `docs/` och `_bmad-output/`.

## Kom igång

Krav: Node 24.x, pnpm 12.15.0 (`corepack enable` räcker) och [gitleaks](https://github.com/gitleaks/gitleaks) 8.30 på `PATH`.

```bash
pnpm install          # installerar beroenden och git-hookar (lefthook)
cp .env.example .env.local   # fyll i värden vid behov; utan värden används AI_PROVIDER=mock
pnpm dev              # http://localhost:3000
```

| Kommando | Gör |
| --- | --- |
| `pnpm lint` | ESLint, inklusive lagerreglerna (AD-1) |
| `pnpm typecheck` | Genererar Next-typer och kör `tsc --noEmit` |
| `pnpm test` | Vitest (domain-tester, miljövalidering, lagerreglerna) |
| `pnpm build` | Produktionsbygge |
| `pnpm test:e2e` | Playwright mot `pnpm dev` på port 3100 (`CI=1` kör `pnpm start`, så bygg först). Första gången: `pnpm exec playwright install chromium` |

### Före commit

`lefthook` kör `gitleaks git --pre-commit --staged` och ESLint på stagade filer före varje commit. Commiten stoppas om gitleaks saknas, så installera det först, till exempel med `brew install gitleaks` eller genom att lägga binären från gitleaks releaser på `PATH`.

CI (`.github/workflows/ci.yml`) kör jobben `lint`, `typecheck`, `test`, `e2e` och `gitleaks` på varje PR och vid push till `main`.

### Miljövariabler

All konfiguration läses via `src/server/env.ts` och valideras med Zod. Bara namnen i `.env.example` är tillåtna (AD-14). Hemligheter ligger i `.env.local`, som aldrig checkas in.
