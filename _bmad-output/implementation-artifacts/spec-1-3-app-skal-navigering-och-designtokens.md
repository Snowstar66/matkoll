---
title: 'Story 1.3: App-skal, navigering och designtokens'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '27bdca816f55f91c8d455736497a3c73010eaa17'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Appen saknar navigering, utseende och gemensamma byggstenar. Varje senare story skulle annars hitta på egna knappar, ark och färger.

**Approach:** Lägg in tokens från `DESIGN.md` (ljust och mörkt), ett app-skal med flikfält på mobil och sidomeny från 1024 px, de gemensamma byggstenarna i `src/components/` med beteendet i `EXPERIENCE.md`, och tomma sidor för Recept, Matsedel, Lista, Hemma och Inställningar.

## Boundaries & Constraints

**Always:** Tokens bara via CSS-variabler och Tailwind-klasser (AD-17); inga hex-värden utanför `globals.css`. Inget rött. Tryckytor minst 44 × 44 px. Svensk text enligt Voice and Tone. Sessionen läses inuti `<Suspense>` (AD-18); layouten gör aldrig `await` på sessionen. Egna enkla SVG-ikoner, inget ikonbibliotek. Systemtypsnittet enligt `DESIGN.md`. `DESIGN.md` och `EXPERIENCE.md` gäller före skisserna i `docs/ux/skisser/`.

**Never:** Inget komponentbibliotek. Ingen funktionalitet bakom sidorna (bibliotek, lager, matsedel, lista och inställningar kommer i senare stories). Ingen utloggningsknapp (1.12). Ingen växlare för mörkt läge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mobil | Bredd 390 px, inloggad, `/recept` | Flikfält längst ned med Recept (aktiv, accent), Matsedel, Lista, Hemma; kugghjul i Recept-rubriken till `/installningar` | N/A |
| Dator | Bredd 1280 px | Sidomeny till vänster med de fyra målen plus Inställningar; inget flikfält; innehåll högst 720 px | N/A |
| Flikbyte | Scrolla ned på en sida, byt flik och tillbaka | Samma scrollposition | N/A |
| Mörkt läge | `prefers-color-scheme: dark` | Mörka tokens används; ingen text under 4,5:1 | N/A |
| Ark | Öppna ark, tryck Esc / utanför / svep nedåt | Arket stängs; fokus tillbaka till knappen som öppnade det | Med osparade ändringar: "Släng ändringarna?" först |
| Kort bekräftelse | Visa med "Ångra" | Syns 5 s (4 s utan ångra), annonseras i live-region, högst en i taget | Ny ersätter gammal |
| Laddning | Data tar över 300 ms | Skelettrader i kortens form | Under 300 ms: inget visas |
| Minska rörelse | `prefers-reduced-motion: reduce` | Ark och övergångar utan animation | N/A |
| Ej inloggad | Någon av sidorna | Omdirigering till `/logga-in` (proxy, Story 1.2) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` -- startmallens platshållartokens ersätts helt
- `src/app/layout.tsx` -- rotlayout med `lang="sv"`; lägg till viewport-metadata (`viewport-fit=cover`) för säkerhetsmarginaler
- `src/app/recept/page.tsx` -- platshållare från 1.2 (`requireUserOrRedirect` i `<Suspense>`); flyttas in i app-gruppen
- `src/app/logga-in/page.tsx`, `src/features/auth/ui/login-form.tsx` -- ligger utanför app-skalet men ska använda de nya tokens och byggstenarna (knapp, fält, meddelanderuta)
- `src/features/auth/server.ts` -- `requireUserOrRedirect(next)` för sidorna
- `eslint.config.mjs` -- `src/components/**` får inte importera features (finns)
- `docs/ux/skisser/*.html` -- referens för mått: flikfält 84 px, sidrubrik 34 px/700, 20 px marginal, kort 18 px radie

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- alla färger (ljust och `*-dark`), typografi, radier och avstånd från `DESIGN.md` som CSS-variabler i `:root`, mörka värden i `@media (prefers-color-scheme: dark)`, mappade med `@theme inline`; bas för `body`, fokusring i accent, `prefers-reduced-motion` -- AD-17, UX-DR1
- [x] `tests/design/no-hex.test.ts` -- misslyckas om en fil i `src/` utanför `globals.css` innehåller ett hex-färgvärde -- AD-17
- [x] `tests/design/contrast.test.ts` -- läser tokens ur `globals.css` och kontrollerar textparen i `DESIGN.md` (ink/ink-2 på bg och surface, ink-3 på surface, on-accent på accent, mint-ink/sky-ink/sand-ink på sina bakgrunder) mot 4,5:1 i båda lägena -- NFR4
- [x] `src/components/icons.tsx` -- enkla SVG-ikoner (recept, matsedel, lista, hemma, inställningar, plus, sök, hjärta, bock, kryss, info, kamera, kyl, frys, skafferi), `aria-hidden` -- UX
- [x] `src/components/app-shell/` -- flikfält (`<nav aria-label="Huvudmeny">`, aktiv flik via `usePathname`, `aria-current="page"`), sidomeny från 1024 px med Inställningar längst ned, sidrubrik med valfri åtgärd (kugghjul på Recept), bevarad scrollposition per flik -- UX-DR2
- [x] `src/components/` -- byggstenarna med beteende enligt `EXPERIENCE.md` Component Patterns: `Button` (primär/sekundär/text, 52 px), `FixedAction` (ovanför flikfältet, säkerhetsmarginal), `FilterPills` (ett val), `SearchField` (200 ms fördröjning, minst 16 px text), `Stepper` (− / +, minst 1), `StatusBadge` (ok/missing), `AiBadge`, `HeartToggle`, `CheckCircle` (26 px synlig, 44 px tryckyta), `Sheet` (native `<dialog>`, dialog från 1024 px högst 560 px, Esc/utanför/svep nedåt, `isDirty` → "Släng ändringarna?", aldrig staplat), `Notice`, `ToastProvider`/`useToast` (live-region, en i taget, Ångra), `Skeleton` (visas efter 300 ms), `EmptyState` -- UX-DR3–UX-DR6
- [x] `src/components/*.test.tsx` -- jsdom-tester för Sheet (Esc, fokusretur, isDirty-frågan), Toast (tider, ersättning, Ångra-callback, live-region), Stepper (min 1), SearchField (fördröjning), Skeleton (300 ms), CheckCircle/HeartToggle (namn och tillstånd för skärmläsare) -- matrisen
- [x] `package.json`, `vitest.config.ts` -- devDeps `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.8, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1, `jsdom` 30.1.3; jsdom för `*.test.tsx`, node för övriga -- testbarhet
- [x] `src/app/(app)/layout.tsx` och `src/app/(app)/{recept,matsedel,lista,hemma,installningar}/page.tsx` -- app-gruppen med skalet; varje sida har sidrubrik och ett tomt läge med texten från `EXPERIENCE.md` (Recept: "Inga recept än. …" utan knapp tills import finns; Matsedel: "Ingen rätt på matsedeln än."; Lista: "Lägg rätter på matsedeln så räknas listan fram."; Hemma: "Inget i kylen än."; Inställningar: rubrik); sessionen via `requireUserOrRedirect` inuti `<Suspense>` -- AC
- [x] `src/app/logga-in/page.tsx`, `src/features/auth/ui/login-form.tsx` -- använd tokens och byggstenarna, ingen ändring av beteendet -- konsekvens
- [x] `src/app/layout.tsx` -- `viewport` med `viewportFit: "cover"` och `themeColor` för ljust och mörkt -- iPhone
- [x] `tests/e2e/shell.spec.ts` -- mobil (390 × 844) och dator (1280 × 800): navigering mellan alla flikar och aktiv markering, kugghjulet, scrollposition bevaras, sidomeny/flikfält per bredd, mörkt läge (`colorScheme: 'dark'`) ger annan bakgrund, tangentbordsnavigering med synlig fokus -- matrisen
- [x] `README.md` -- kort avsnitt om byggstenarna och tokens -- dokumentation

**Acceptance Criteria:**
- Given en inloggad användare, when Pontus öppnar varje flik på mobil och dator, then visas rätt sidrubrik och tomt läge utan konsolfel.
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Tailwinds egna färger, radier och textstorlekar är avstängda; bara tokens finns. Brytpunkten `desktop:` är 1024 px.
- Sidomenyns aktiva text är `mint-ink` (6,3:1) i stället för accent på mint (4,1:1); ikonen är accent. `DESIGN.md` är rättad.
- Sökfältet är 44 px högt (tryckyta) i stället för 40 px; `DESIGN.md` är rättad.
- `themeColor` ligger som `rgb()` i `src/app/theme-colors.ts`; kontrasttestet kontrollerar att värdena matchar bakgrundstokens.
- `next.config.ts`: `devIndicators.position = "top-left"`, eftersom Next-indikatorn täckte Recept-fliken i dev.
- `tests/e2e/auth.spec.ts`: fyra kontroller letar efter tomt bibliotek i stället för "Inloggad som …".
- Tillägg: `field.tsx`, `MinusIcon`, "Rensa sökning" i sökfältet, en hopplänk till innehållet. Inställningar har ingen flik på mobil, så ingen flik är markerad där.
- Kända begränsningar: en kort bekräftelse som visas medan ett ark är öppet hamnar bakom arket (modal dialog gör sidan inert); ett ark som ersätts av ett annat frågar inte "Släng ändringarna?". Svep för att stänga är bara testat i jsdom.
- Efter granskning: toast ovanför `FixedAction` och pausar vid hovring/fokus; Ångra utanför live-regionen; `FixedAction` mäter sin höjd; `px-page` med säkerhetsmarginaler; Sheet frågar "Släng ändringarna?" vid ersättning och vid stängning från webbläsaren, svep flyttar hela dialogen, fokus återställs; kontrollkanter i `ink-3` (≥3:1, testat); `FilterPills` som radiogroup; hjärtat ligger bredvid radlänken; "1 portion"; Enter och tömning söker direkt; versaler i sektionsrubriker; fel- och hittades-inte-sidor i app-gruppen; "Tillbaka" från Inställningar på mobil; titelmall; färgskyddet fångar även färgfunktioner; skuggor nollställda. `DESIGN.md` uppdaterad för kontrollkanter.
- Slutverifiering: lint, typecheck, 208 Vitest, 5 integrationstester, build, 28 Playwright (`CI=1`).
- Verifierat före granskning: lint, typecheck, 183 Vitest (inkl. design- och komponenttester), 5 integrationstester, build, 23 Playwright (`CI=1`).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge | Kort bekräftelse täcker den fasta knappen (samma bottenposition, z-40 över z-20) | medium | `toast.tsx` och `fixed-action.tsx` använder samma `bottom-[calc(…)]` | patch |
| 2 | blind | Svep nedåt flyttar panelen inuti `<dialog>`, inte arket | medium | `transform` sätts på `panelRef`; dialogen har bakgrund och `overflow-hidden` | patch |
| 3 | blind, edge | Ett andra ark kastar osparade ändringar i det första utan fråga; fokus hamnar på `body` | medium | `forceClose` anropar `onClose` direkt; öppnaren är bortmonterad | patch |
| 4 | blind, edge, verify | Stängning som webbläsaren startar (cancel, `form method=dialog`, bakåtgest) hoppar över "Släng ändringarna?"; ingen test för `cancel` eller stängning medan `open` är sant | medium | `onClose`-hanteraren kontrollerar inte `isDirty`; polyfillen saknar `cancel` | patch (jsdom), e2e defer |
| 5 | edge | Fokus försvinner när bekräftelsesteget lämnas | low | Knappen monteras bort; direkt korrigering | patch |
| 6 | blind, edge | `ScrollMemory` skriver över sparad position efter 1,5 s | medium | Sparar `scrollY` även vid tidsgräns | patch |
| 7 | blind | Kort bekräftelse: ingen paus vid hovring/fokus, Ångra hinns inte nå, knappen läses upp i live-regionen | medium | WCAG 2.2.1; knappen ligger i `role="status"` | patch |
| 8 | blind, edge | `FixedAction` lämnar plats för bara en knapp | medium | Distansen är en knapphöjd; dokumentet lovar två | patch |
| 9 | blind, edge | Säkerhetsmarginaler i sidled saknas i FixedAction, toast och Sheet | low | `main` har `max(…env(safe-area…))`, de andra `px-gutter`; direkt korrigering | patch |
| 10 | blind, verify | `HeartToggle` är gjord för att ligga inuti en länk (ogiltig HTML); testet ser inte att `preventDefault` saknas | medium | Knapp i `<a>` är ogiltigt och läses dåligt | patch (hjärtat bredvid länken) |
| 11 | blind | Kontrast för gränssnittselement (WCAG 1.4.11): omarkerad bock och fältkant ca 1,25:1 | medium | `border` #E3E8E4 på #FFFFFF; NFR4 | patch (`ink-3` för kontrollkanter, test ≥3:1) |
| 12 | blind, edge | Färgskyddet släpper igenom `rgb()`/`hsl()`/`oklch()` och fler filtyper; skuggor nollställs inte | low | Regex fångar bara hex | patch |
| 13 | blind | `FilterPills` använder `aria-pressed` för ett enkelval | medium | Läses upp som växlare som inte går att stänga av | patch (radiogroup) |
| 14 | blind | Fel- och "hittades inte"-sidor saknas i app-gruppen | medium | Fel hamnar på Nexts standardsida utan skalet | patch |
| 15 | blind | Inställningar på mobil saknar väg tillbaka | low | Ingen flik markerad; direkt tillägg | patch |
| 16 | blind | Titeln "– Matkoll" upprepas på varje sida | low | Direkt förenkling med `title.template` | patch |
| 17 | edge | Portionsväljaren visar värden under 1 och skriver "1 portioner" | medium | Svensk text syns för Pontus | patch |
| 18 | edge | Enter i sökfältet väntar 200 ms; tömning fördröjs | low | Direkt korrigering | patch |
| 19 | edge | `tokens.ts` läser fel block om sökningen ger -1 | low | Direkt korrigering | patch |
| 20 | edge | `sky-ink` på `bg` (fältfel på inloggningssidan) kontrolleras inte | low | Direkt tillägg i listan | patch |
| 21 | edge | Sektionsrubrikens token saknar versaler | low | `DESIGN.md` anger `uppercase` | patch |
| 22 | blind, verify, edge | E2E för mörkt läge läser den dolda sidomenyn | medium | `querySelector("nav")` ger första `nav` | patch |
| 23 | verify | Meta-taggarna `theme-color` och `viewport-fit` testas inte i den renderade sidan | medium | Testet kontrollerar bara konstanten | patch |
| 24 | verify | Tillåtelselistan testas bara på `/recept` | medium | De fyra nya sidorna kan tappa kontrollen utan att test fallerar | patch |
| 25 | edge | Rullningslistens dragning kämpar mot återställningen | low | Ovanligt; fixen kräver fler händelser | avvisad |
| 26 | blind | Nyckeln ignorerar frågesträngen; kartan växer | low | Inga detaljsidor än | avvisad |
| 27 | blind | Godtyckliga mått (`px-[9px]`) och Tailwinds brytpunkter finns kvar | low | Mått från skisserna; brytpunkterna används inte | avvisad |
| 28 | blind | Tester saknas för `currentState`, `Notice`, `Button` | low | Täcks indirekt av e2e | avvisad |
| 29 | edge | "Inloggad som …" visas inte längre | low | Kontot visas när Inställningar byggs (1.12) | avvisad |
| 30 | blind | Diffen saknar `DESIGN.md` | false | Uteslöts avsiktligt ur diffen; filen finns i arbetskopian | avvisad |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test` -- expected: alla lyckas, inklusive design- och komponenttester
- `pnpm test:integration && pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas (Supabase lokalt igång)

**Manual checks (if no CLI):**
- Skärmdumpar från Playwright i 390 px och 1280 px, ljust och mörkt, jämförda mot `docs/ux/skisser/` (mått och färger)
