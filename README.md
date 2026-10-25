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
| `pnpm test` | Vitest (domain-tester, miljövalidering, lagerreglerna, designtokens och komponenttester) |
| `pnpm test:integration` | Vitest mot lokal Supabase (stängd registrering, `users:sync`). Kräver `pnpm db:start` och `pnpm db:env` |
| `pnpm build` | Produktionsbygge |
| `pnpm test:e2e` | Playwright mot `pnpm dev` på port 3100 (`CI=1` kör `pnpm start`, så bygg först). Kräver lokal Supabase och `pnpm db:env`. Testanvändaren `e2e@matkoll.test` skapas med `users:sync` och loggas in via `/auth/confirm` i `tests/e2e/global-setup.ts`. Första gången: `pnpm exec playwright install chromium` |
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

All konfiguration läses via `src/server/env.ts` och valideras med Zod. Bara namnen i `.env.example` är tillåtna (AD-14). Hemligheter ligger i `.env.local`, som aldrig checkas in. `SITE_URL` är appens publika adress och används i länken i inloggningsmejlet. Den måste finnas med bland redirect-URL:erna i Supabase Auth. Utan värde används `http://localhost:3000`, men i produktion (`next build`, `next start`) måste den vara satt. E2E och CI använder `http://localhost:3100`. `SUPABASE_SERVICE_ROLE_KEY` står i en egen sektion i `.env.example`: den läses bara av `scripts/` och `tests/`, aldrig av appen, och ESLint stoppar den i `src/` (AD-4).

### Supabase i molnet

`supabase/config.toml` gäller bara lokalt. Sätt samma sak i molnprojektet: registrering avstängd, Site URL och redirect-URL:er för `/auth/confirm`, och e-postmallen för Magic Link (ämne och innehåll från `supabase/templates/magic-link.html`). Molnprojektet behöver också egen SMTP, eftersom den inbyggda e-posten har en mycket låg gräns och bara skickar till projektets teammedlemmar.

Integrations- och E2E-testerna skapar och tar bort användare med service role. De vägrar därför att köra om `NEXT_PUBLIC_SUPABASE_URL` inte pekar på `127.0.0.1` eller `localhost`.
