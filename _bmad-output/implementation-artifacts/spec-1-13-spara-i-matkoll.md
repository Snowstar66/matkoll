---
title: 'Story 1.13: Spara i Matkoll från receptsajten'
type: 'feature'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/epic/1-spara-i-matkoll'
---

## Intent

**Problem:** Pontus öppnar ett recept på koket.se och måste kopiera länken och klistra in den i Matkoll.

**Approach:** Adressen `/recept/importera?url=<länk>` öppnar importarket och läser länken med det befintliga flödet från länk (Story 1.8: godkända sajter från 1.12, `safeFetch` med SSRF-skydd). Inställningar får avsnittet "Spara i Matkoll" med ett bokmärke (dator) och iOS-genvägens steg, och manifestet får `share_target` för Android.

## Ändringar

- `src/features/recipes/domain/shared-link.ts` (+ test): `extractHttpsUrl` (första https-adressen i `text`, utan avslutande skiljetecken), `validImportUrl` (bara https, högst 2 048 tecken, inga användaruppgifter) och `readSharedLink` (`url` först, annars adressen i `text`).
- `src/app/(app)/recept/importera/page.tsx`: bakom inloggning (`requireUserOrRedirect` bevarar länken i `next`). Receptsidans innehåll flyttat till `recipes-view.tsx` och delas. `searchParams` läses inuti `<Suspense>` (AD-18).
- `import-sheet.tsx`: `autoImport` på `ImportRecipeProvider`/`ImportSheet`. En giltig länk fyller länkfältet och startar importen; en saknad eller ogiltig länk öppnar arket med "Det där ser inte ut som en länk …". Ej godkänd sajt ger samma meddelande som förut. "Läser receptet …" visas medan det läses. När arket stängs ersätts adressen med `/recept` så att en omladdning inte läser länken igen.
- `src/features/settings/ui/save-to-matkoll.tsx`, `domain/save-link.ts` (+ test): avsnittet i Inställningar. Bokmärket (`javascript:`-adressen sätts på elementet, eftersom React inte renderar sådana) och adressprefixet byggs av `window.location.origin` i webbläsaren, så de stämmer på localhost och på Vercel. iPhone: numrerade steg och prefixet med "Kopiera adressen". Android: installera appen. Not om att telefonen når Matkoll först när appen är publicerad och att sajten ska finnas bland de godkända (länk till listan, `#godkanda-receptsajter`).
- `src/app/manifest.ts` (+ test): `share_target` med action `/recept/importera`, GET, `url` och `text`.
- E2E: tre nya prov i `import.spec.ts` (förhandsgranskning från `?url=`, adress i `text`, ej godkänd sajt och ogiltig/saknad länk) och ett i `settings.spec.ts`.

## Beslut

- **Importen startar i webbläsaren efter montering, inte på servern.** Sidan renderas på servern (även vid prefetch av en länk) men hämtar ingenting; det är klienten som startar jobbet via `/api/ai/jobs`. Alternativet "bekräfta först" valdes bort: Pontus tryck på bokmärket eller Dela är redan avsikten, och importen sparar inget, den visar bara en förhandsgranskning.
- Strict Mode: starten ligger i en `setTimeout(0)` som städas bort av Strict Modes extra cleanup, och en ref hindrar en andra start. Kontrollerat mot `pnpm dev` (Strict Mode): ett enda importjobb.
- Allt som rör vilka sajter som får hämtas ligger kvar i `safeFetch` och sajtlistan; sidan lägger bara till en formkontroll av adressen.
- Ingen migration, inget riktigt nätverk (sparade sidor i `tests/fixtures/sites`).

## Review Triage Log

Ingen separat granskning: ingen migration, och flödet återanvänder den granskade `safeFetch`. Egen genomgång:

- Prefetch hämtade först inget, men bygget avvisade `searchParams` utanför `<Suspense>`: rättat med Suspense runt den dynamiska delen.
- Strict Mode kunde nollställa pågående begäran (cleanup sätter `request.current = null`): löst med den städade timern.
- `javascript:`-länk i JSX: sätts via ref, klick på själva knappen på Inställningar spärras.
- Verifierat: `pnpm lint`, `typecheck`, `test`, `AI_PROVIDER=mock pnpm build`, e2e `import` och `settings` (66 gröna) samt de nya proven mot `pnpm dev`.
