---
title: 'Story 11.6: Matkoll på hemskärmen'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-inloggning-med-engangslank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-app-skal-navigering-och-designtokens.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matkoll-mobil.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att Matkoll är som en app i mobilen: "gör hela look and feel som det kommer se ut i mobilen". I dag öppnas Matkoll i Safari med webbläsarens fält och utan egen ikon. Läggs sidan på hemskärmen utan mer får den ingen riktig ikon, och inloggningen fungerar inte: appen på hemskärmen delar inte kakor med Safari, och länken i mejlet öppnas i Safari (FR-44, AD-27).

**Approach:**
- `src/app/manifest.ts`, appikoner och `metadata.appleWebApp`, så att Matkoll kan läggas på hemskärmen och öppnas i helskärm med moroten som ikon.
- Proxyn släpper igenom manifestet och ikonerna utan inloggning.
- Mejlet får en sexsiffrig kod, och inloggningssidan tar emot den (AD-3).
- Varje sida under en flik får en synlig tillbakaknapp, och Inställningar förklarar hur appen läggs på hemskärmen.

## Boundaries & Constraints

**Always:**
- Läs `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`, `app-icons.md`, `01-app/02-guides/progressive-web-apps.md` och `generate-metadata.md` (`appleWebApp`) före koden. `node_modules` finns i huvudmappen, inte i en worktree.
- Manifestet: `name` och `short_name` "Matkoll", `description` som i `layout.tsx`, `lang: 'sv'`, `start_url: '/recept'`, `scope: '/'`, `display: 'standalone'`, `background_color` och `theme_color` lika med ljust lägets `bg` (beräknat från `themeColors.light`), och ikonerna 192 och 512 px (`purpose: 'any'`) och 512 px (`purpose: 'maskable'`, motivet inom den säkra cirkeln).
- Ikonerna: en morot i accent och sand på `bg` (`DESIGN.md`, `app-icon`), ingen text. Genereras med `ImageResponse` från `next/og` i `src/app/icon.tsx` (med `generateImageMetadata` för flera storlekar om det behövs) och `src/app/apple-icon.tsx` (180 × 180), eller ritas en gång till PNG i `src/app/` och `public/` om genereringen inte fungerar med `cacheComponents`. Färgerna läses från `src/app/theme-colors.ts`, och ett test jämför dem med `globals.css` (AD-17). Ingen emoji i ikonen.
- `layout.tsx`: `metadata.appleWebApp = { title: 'Matkoll', capable: true, statusBarStyle: 'default' }`. `viewport.themeColor` står kvar med ljust och mörkt läge.
- `src/proxy.ts`: `matcher` släpper igenom `/manifest.webmanifest`, `/icon`, `/icon/<id>`, `/apple-icon` och `/apple-icon/<id>` (med Next.js frågeparametrar) utan session. Inget annat blir publikt.
- Mallen `supabase/templates/magic-link.html` har både länken och koden (`{{ .Token }}`), med texten "Eller skriv in koden i Matkoll:" och koden i stor text.
- Inloggningssidan: efter "Skicka länk" står "Vi har skickat en länk och en kod till din e-post." och fältet "Kod från mejlet" (`inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="[0-9]{6}"`, minst 16 px text) med knappen "Logga in". E-postadressen står kvar. Samma text visas oavsett om adressen är tillåten.
- `verifyEmailCode({ email, code, next })` i `auth/actions`: Zod (e-post, exakt sex siffror, `next` som i AD-3), `verifyOtp({ email, token: code, type: 'email' })` med sessionsklienten, sedan `isAllowedEmail` som i `confirmEmailLink`. Är adressen inte tillåten loggas sessionen ut. Fel kod, gammal kod och en adress som inte är tillåten ger alla `auth_code_invalid` ("Koden stämmer inte eller har gått ut. Skicka en ny länk."). Lyckas den omdirigeras Pontus till `next` eller `/recept`.
- Länken fungerar som förut.
- Varje sida under en flik (receptvyn, en tidigare matsedel, Tidigare matsedlar, Inställningar) har en synlig "Tillbaka" med pil och text överst, minst 44 × 44 px, till sidan ovanför.
- Inställningar har raden "Lägg Matkoll på hemskärmen: tryck Dela och sedan Lägg till på hemskärmen." Den visas inte när appen redan körs från hemskärmen (`display-mode: standalone` eller `navigator.standalone`).
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och tangentbord.
- E2E-specen har den egna e2e-användaren `e2e-utseende-app@matkoll.test`.

**Never:**
- Ingen service worker, ingen offline, inga push-aviseringar och inga startbilder.
- Ingen ny miljövariabel och ingen ändring av tillåtelselistan, `shouldCreateUser: false` eller `enable_signup = false`.
- Koden avslöjar aldrig om en adress är tillåten och loggas aldrig.
- Manifestet och ikonerna innehåller ingen användardata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manifest utan inloggning | `GET /manifest.webmanifest` utan kakor | 200, `application/manifest+json`, fälten i Boundaries | N/A |
| Ikoner utan inloggning | `GET` på ikonernas adresser från `head` | 200 och `image/png` i rätt storlek | N/A |
| Annan sida utan inloggning | `GET /recept` utan kakor | Omdirigering till `/logga-in?next=%2Frecept` som förut | N/A |
| `head` | Recept | `link rel="manifest"`, `apple-touch-icon`, `apple-mobile-web-app-title` "Matkoll", `apple-mobile-web-app-status-bar-style` "default", `theme-color` ljust och mörkt | N/A |
| Kod | Rätt kod inom en timme | Inloggad, till `next` eller `/recept` | N/A |
| Fel kod | "123456" som inte stämmer | "Koden stämmer inte eller har gått ut. Skicka en ny länk." under fältet, fältet står kvar | `auth_code_invalid` |
| Gammal kod | Kod äldre än en timme, eller redan använd | Samma text | `auth_code_invalid` |
| Inte tillåten | Adress utanför `ALLOWED_EMAILS` | Samma text, ingen session | `auth_code_invalid` |
| Inte sex siffror | "12a45" eller fem siffror | Samma text, inget anrop till Supabase | `validation` visas som `auth_code_invalid` |
| `next` utifrån | `next=//evil.example` | `/recept` | N/A |
| Länken | Länken i samma mejl | Fungerar som förut | Som förut |
| Tillbaka | Receptvyn | "Tillbaka" till Recept, med filter och scroll kvar | N/A |
| Hemskärmsraden | Inställningar i Safari | Raden syns | N/A |
| I appen | Inställningar med `display-mode: standalone` | Raden syns inte | N/A |
| Mörkt läge | iPhone i mörkt läge, från hemskärmen | Statusraden och bakgrunden mörka, ikonen densamma | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md`
- `node_modules/next/dist/docs/01-app/...` -- manifest, ikoner, `appleWebApp` (läs först)
- `src/app/layout.tsx`, `src/app/theme-colors.ts`, `src/app/favicon.ico`
- `src/proxy.ts` (`matcher`, `isPublic`), `src/lib/supabase/proxy.ts`
- `src/app/logga-in/page.tsx`, `src/features/auth/ui/`, `src/features/auth/actions/` (`confirm-email-link.ts`, `send`-actionen), `src/features/auth/domain/`
- `supabase/templates/magic-link.html`, `supabase/config.toml` (`[auth.email]`, `otp_length`, `otp_expiry`)
- `src/lib/errors.ts`
- `src/components/app-shell/page-header.tsx`, `src/app/(app)/recept/[id]`, `matsedel/tidigare`, `installningar`
- `tests/design/contrast.test.ts` (`themeColors`)
- `tests/e2e/auth.spec.ts`, `global-setup.ts` -- mönster för inloggning och Mailpit eller `generateLink`

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/manifest.ts` (+ test) -- manifestet enligt Boundaries -- FR-44, AD-27
- [ ] `src/app/icon.tsx`, `src/app/apple-icon.tsx` (+ test), `src/app/theme-colors.ts` -- ikonerna och färgerna, med test mot `globals.css` -- AD-17, UX-DR27
- [ ] `src/app/layout.tsx` -- `appleWebApp`
- [ ] `src/proxy.ts` (+ test) -- `matcher` enligt Boundaries
- [ ] `supabase/templates/magic-link.html` -- koden. Lokalt startas `auth` om för att läsa in mallen (inte `supabase db reset`)
- [ ] `src/features/auth/actions/verify-email-code.ts` (+ test), `src/lib/errors.ts` -- `verifyEmailCode` och `auth_code_invalid` -- FR-1, AD-3
- [ ] `src/features/auth/ui/` (+ test) -- kodfältet efter "Skicka länk"
- [ ] `src/components/app-shell/page-header.tsx` och sidorna (+ tester) -- "Tillbaka" där den saknas
- [ ] `src/features/settings/ui/` (+ test) -- hemskärmsraden
- [ ] `tests/e2e/app-install.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-app@matkoll.test`: manifestet och ikonerna utan kakor, `/recept` omdirigeras, `head`, inloggning med kod (koden från Mailpit eller `auth.admin.generateLink`, som `global-setup.ts`), fel kod, tillbakaknapparna
- [ ] `docs/oppna-fragor.md` -- checklistan för molnet: mallen läggs in med koden. "Att prova på riktig telefon": lägg på hemskärmen och logga in med koden
- [ ] `docs/drift.md` -- mallen med koden
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given en riktig iPhone mot den lokala appen via https eller molnet, when Pontus lägger Matkoll på hemskärmen och öppnar den, then öppnas den i helskärm med moroten och går att logga in i med koden (manuellt prov, annars på listan "Att prova på riktig telefon").

## Implementation Notes

- **Beslut (förslag): ingen service worker.** iPhone lägger en sida på hemskärmen och öppnar den i helskärm utan service worker. Offline ingår inte (öppen fråga 1), och en service worker som cachar sidor med användardata är en risk.
- **Beslut (förslag): koden i samma mejl som länken.** En hemskärmsapp på iPhone har egen lagring, och länken öppnas i Safari. Koden är det enklaste som fungerar och ändrar inget för den som använder länken.
- **Beslut (förslag): `statusBarStyle: 'default'`.** Med `black-translucent` blir statusradens text vit också i ljust läge, där bakgrunden är ljus. `default` följer ljust och mörkt läge.
- **Beslut (förslag): temafärgen är appens ljusa bakgrund,** som `viewport.themeColor` redan är. Ett manifest har bara en färg.
- **Risk: genererade ikoner och `cacheComponents`.** Om `ImageResponse` inte fungerar i bygget ritas ikonerna en gång till PNG med ett skript och läggs i `src/app/` (`icon.png`, `apple-icon.png`) och `public/` (manifestets storlekar). Det beslutet loggas.
- **Risk: proxyn.** Ett för brett undantag kan släppa igenom sidor. Testet går igenom en lista med sökvägar som ska omdirigeras.
- **Risk: kod och tillåtelselista.** Supabase skapar ingen användare (`shouldCreateUser: false`), men kontrollen mot `ALLOWED_EMAILS` görs ändå efter `verifyOtp`, som för länken.
- **Risk: Wake Lock i hemskärmsappen.** Stegläget provas också från hemskärmen på riktig iPhone.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: Safari, Dela, Lägg till på hemskärmen. Ikonen ska vara moroten. Öppna från hemskärmen: helskärm, statusraden i appens färg i ljust och mörkt läge, inloggning med koden, tillbakaknapparna, kameran i Lagersaldo och stegläget med tänd skärm.
- VoiceOver på inloggningen: "Kod från mejlet, textfält", felet läses upp.
