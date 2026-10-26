---
title: 'Story 11.6: Matkoll på hemskärmen'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: '22a0febb5a37b5120ee9ebe41fe517877d340851'
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
- [x] `src/app/manifest.ts` (+ test) -- manifestet enligt Boundaries -- FR-44, AD-27
- [x] `src/app/icon.tsx`, `src/app/apple-icon.tsx` (+ test), `src/app/theme-colors.ts` -- ikonerna och färgerna, med test mot `globals.css` -- AD-17, UX-DR27
- [x] `src/app/layout.tsx` -- `appleWebApp`
- [x] `src/proxy.ts` (+ test) -- `matcher` enligt Boundaries
- [x] `supabase/templates/magic-link.html` -- koden. Lokalt startas `auth` om för att läsa in mallen (inte `supabase db reset`)
- [x] `src/features/auth/actions/verify-email-code.ts` (+ test), `src/lib/errors.ts` -- `verifyEmailCode` och `auth_code_invalid` -- FR-1, AD-3
- [x] `src/features/auth/ui/` (+ test) -- kodfältet efter "Skicka länk"
- [x] `src/components/app-shell/page-header.tsx` och sidorna (+ tester) -- "Tillbaka" där den saknas
- [x] `src/features/settings/ui/` (+ test) -- hemskärmsraden
- [x] `tests/e2e/app-install.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-app@matkoll.test`: manifestet och ikonerna utan kakor, `/recept` omdirigeras, `head`, inloggning med kod (koden från Mailpit eller `auth.admin.generateLink`, som `global-setup.ts`), fel kod, tillbakaknapparna
- [x] `docs/oppna-fragor.md` -- checklistan för molnet: mallen läggs in med koden. "Att prova på riktig telefon": lägg på hemskärmen och logga in med koden
- [x] `docs/drift.md` -- mallen med koden
- [x] `docs/beslutslogg.md` -- en post för storyn

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

### Vid bygget

- **Byggd på `22a0feb`** (`baseline_commit`), kursändringen för Epic 11, i grenen `story/11-6` från `epic/11-nytt-utseende`. 11.1–11.5 finns inte i grenen än. Storyn behöver bara tokens som redan finns (`bg`, `accent`, `sand`, `sand-ink`).
- **Next.js 16.4.3-dokumentationen lästes först:** `manifest.md`, `app-icons.md`, `generate-image-metadata.md`, `image-response.md`, `progressive-web-apps.md`, `generate-metadata.md` (`appleWebApp`) och `proxy.md` (`matcher` och testverktygen). `capable: true` ger `<meta name="mobile-web-app-capable" content="yes">` i Next 16, inte `apple-mobile-web-app-capable`.
- **Ikonerna genereras med `ImageResponse`** och byggs statiskt också med `cacheComponents` (`○ /apple-icon`, `● /icon/192`, `/icon/512`, `/icon/maskable`). Reservvägen med PNG behövdes inte. `icon.tsx` har `generateImageMetadata` med id:n `192`, `512` och `maskable`. Teckningen ligger i `src/app/app-icon-image.tsx` (SVG i 100 × 100), och storlekarna och motivets skala (0,84, och 0,72 för maskable så att motivet ryms i den säkra cirkeln) i `src/app/app-info.ts`, som manifestet läser utan att dra in `next/og`. Namnet och beskrivningen ligger också där och delas med `layout.tsx`.
- **Motivet:** moroten i `sand-ink` med räfflor i `sand` och blast i `accent`, på en rund platta i `sand`, på `bg`. Avvikelse från "en morot i accent och sand": `sand` syns knappt mot `bg`, så moroten själv fick `sand-ink`. `appIconColors` i `theme-colors.ts` testas mot `globals.css` i `contrast.test.ts`.
- **Manifestets färg:** `rgbToHex(themeColors.light)` ger `#F5F7F4`. Testet av `rgbToHex` ligger i `tests/design/theme-colors.test.ts`, eftersom `no-hex.test.ts` inte tillåter färgvärden i `src/` utanför `globals.css` och `theme-colors.ts`.
- **Proxyn:** `matcher` utesluter `(?:apple-)?icon(?:/[a-zA-Z0-9_-]+)?$` utöver det som redan var undantaget. `/manifest.webmanifest` släpptes redan igenom av regeln för filändelser. `src/proxy.test.ts` går igenom sökvägarna med `unstable_doesMiddlewareMatch` (dokumentationen nämner `unstable_doesProxyMatch`, men den finns inte i 16.4.3), bland dem efterapningar som `/icons`, `/icon/192/extra` och `/recept/icon`, som ska gå genom proxyn.
- **Koden:** `verifyEmailCode({ email, code, next })` i `auth/actions/verify-email-code.ts` anropar `verifyEmailCode` i `auth/data/auth.ts`, som gör `verifyOtp({ email, token, type: 'email' })` med sessionsklienten och loggar ut direkt om `ALLOWED_EMAILS` inte har adressen (som `verifyEmailLink`). Zod-schemat är `emailCodeSchema` i `login-schema.ts` (`[0-9]{6}`, mellanslag runt koden tas bort). Supabases felkod (till exempel `otp_expired`) loggas på nivån info som `auth_code_refused`, aldrig koden eller adressen. Startdatan efter inloggning (AD-21) flyttades till `ensureStartData()`, som länken och koden delar.
- **Koden och länken är samma engångstoken:** när koden har använts leder länken med samma token till `/logga-in?fel=lank`. E2E-testet visar det, och mallen säger att ingen av dem går att använda igen. Livslängden är en timme (`otp_expiry = 3600`), och Supabase begränsar antalet försök (`[auth.rate_limit] token_verifications = 30` per fem minuter och IP lokalt).
- **Inloggningssidan:** "Skicka länk" blir sekundär när kodfältet visas, så att "Logga in" är den enda primära knappen. E-postfältet är kontrollerat, så adressen står kvar när formuläret skickas. Svaret om en fel kod döljs när koden ändras. Inledningen säger nu "… en inloggningslänk och en kod."
- **Mallen lokalt:** Kong läser `supabase/templates/magic-link.html` från huvudmappen, och Auth behåller mallen den läste tills den startas om. Att starta om den delade Auth-containern gjordes inte (andra grenar testar mot samma stack), så Mailpit har inte koden förrän mallen finns i huvudmappen och Auth har startats om. E2E-testet tar därför koden från `auth.admin.generateLink` (spec-tillåtet), efter att ha kontrollerat att Supabase skickade mejlet. `tests/design/email-template.test.ts` visar att mallen har länken först och koden efter texten, och att `otp_length` och `otp_expiry` är 6 och 3600. I CI startas Supabase från repot, så där har mejlet koden. Omstarten står i `docs/oppna-fragor.md`.
- **Tillbaka syns på alla bredder,** också på dator (förut `desktop:hidden`), eftersom en hemskärmsapp på iPad saknar bakåtknapp. `PageHeader` hade redan "Tillbaka" i Inställningar, Tidigare matsedlar och en tidigare matsedel. Receptvyn hade bara en rund pil med `aria-label`, nu en knapp med pil och texten "Tillbaka". Båda har `min-h-tap` och `min-w-tap`.
- **Hemskärmsraden** (`settings/ui/home-screen-hint.tsx`) läser `display-mode: standalone` och `navigator.standalone` med `useSyncExternalStore`, och visas inte vid serverrenderingen, så den blinkar aldrig fram i appen. Den står ovanför "Logga ut".
- **E2E:** `appInstallEmail` (`e2e-utseende-app@matkoll.test`) finns i `e2eEmails` men får ingen sparad session, som `coreFlowEmail`. Testerna gör om användaren med `recreateE2eUser`. `auth.spec.ts` och `core-flow.spec.ts` har den nya texten "Vi har skickat en länk och en kod till din e-post.".
- **Integrationstesterna och `recipe.spec.ts` mot den delade databasen:** två integrationstester (`catalog.test.ts`, "Saffran", och `pantry-site.test.ts`, `label` och `created_at` i svaret) och ett e2e-test i `recipe.spec.ts` ("Torskfilé") misslyckas, eftersom den lokala databasen har fyra migrationer från andra grenar (bland dem `pantry_item.label` från 11.2) som inte finns i den här grenen. Storyn ändrar ingen migration och inget av det som testerna läser.

## Review Triage Log

Iteration 1. Tre granskare gick igenom `9ea6f34`. Grenen ombaserades först på `epic/11-nytt-utseende` (`2789f7d`, med Epic 10 och namnen Lagersaldo och Inköpslista). Ingen migration behövdes.

**Patch:**
- Gissning av koden:
  - Supabase räknar kodkontroller per IP, men `verifyOtp` körs från Next-servern. Webbläsarens IP (första giltiga i `x-forwarded-for`, annars `x-real-ip`, `src/lib/client-ip.ts`) skickas därför till Supabase som `Sb-Forwarded-For` (`createClient({ forwardedFor })`). Rubriken finns i Supabase Auth sedan december 2025 bakom `GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED` (supabase/auth, "Sb-Forwarded-For"); om den gäller i molnet är öppen fråga T7. Ett test visar att rubriken skickas.
  - Appens egen gräns före Supabase: högst 5 fel koder per adress (sha256) och IP på 15 minuter, sedan `auth_code_rate_limited` ("För många försök. Vänta en stund eller skicka en ny länk.") utan anrop. I minnet (`domain/code-attempts.ts`, en `Map` med tidsgräns och högst 10 000 nycklar), alltså per serverinstans. Varje `auth_code_invalid` räknas, också fel format och en adress utanför listan, så att gränsen inte avslöjar listan. En lyckad inloggning nollställer. En gräns i databasen skulle kräva en funktion som `anon` får anropa (AD-4) och är öppen fråga 17.
- Tillåtelselistan kontrolleras före `verifyOtp`: en adress utanför listan ger `auth_code_invalid` utan anrop till Supabase. Kontrollen efter `verifyOtp` står kvar som ett andra lager. E2E visar att Supabase inte registrerar någon inloggning för en sådan adress.
- Utloggningen efter en nekad adress kontrolleras: misslyckas `signOut` tas alla delar av `sb-*-auth-token` bort direkt (`removeSessionCookies`), och `auth_code_signout_failed` (eller `auth_link_signout_failed` för länken) loggas med bara orsaken.
- Supabases `over_request_rate_limit` (eller status 429) ger `auth_code_rate_limited`, inte "Koden stämmer inte".
- Loggning: `auth_code_not_allowed` och `auth_code_rate_limited` (`by: "app"` eller `"supabase"`) på nivån warn, med 8 tecken av IP-adressens hash. Aldrig adressen eller koden.
- Länkskanner i e-posten: `/auth/confirm` är nu en sida (`page.tsx`) som bara visar "Logga in". Först knappen (Server Action `confirmEmailLinkForm`, POST) använder token. `next` hanteras som förut, och en länk utan token går till `/logga-in?fel=lank`. En Route Handler och en sida kan inte dela segment i Next 16, så route.ts togs bort. Sidan har `referrer: no-referrer`. E2E-testerna som följer länken trycker på knappen (`openMagicLink` i `support.ts`), och ett nytt test visar att två GET inte använder upp länken.
- `safeNextPath` löser med `https://x.invalid`, godtar bara sökvägar med ett enda inledande "/", och kontrollerar samma sak efter procentavkodning, så `/%2F/evil`, `/%5Cevil` och `/%09/evil` avvisas. Högst 512 tecken, och `next` över gränsen släpps i Zod-schemat (`.catch(undefined)`) i stället för att ge ett fel i formuläret. Tester för `/\t/evil`, `/\n/evil`, `%2F%2Fevil`, `/%5Cevil`, `javascript:` och ett långt värde.
- Ikonerna och proxyn:
  - Ett okänt id (`/icon/zzz`) ger `notFound()` och 404 (e2e). `dynamicParams` finns inte med Cache Components, så kontrollen ligger i `icon.tsx`.
  - `matcher` släpper inte längre igenom alla sökvägar med punkt, bara `/favicon.ico`, `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` och ikonerna. `/recept/x.json` och `/api/pantry/photo.png` går genom proxyn (test). Det finns ingen `public/`.
  - Alla sex Route Handlers under `/api` anropar `requireUserForRoute()` själva (kontrollerat).
- Registrering: lokalt `enable_signup = false` (Auth har `GOTRUE_DISABLE_SIGNUP=true`) och `shouldCreateUser: false`. `docs/drift.md` steg 3 säger redan att den stängs av i molnet, och steg 5 säger nu att varken länken eller koden kan skapa användare.
- Kodformuläret:
  - Adressen som länken gick till fryses (`codeStep.email`) och koden kontrolleras mot den. Fältet är skrivskyddat medan kodsteget visas, med "Byt adress".
  - Kodformuläret har en nyckel per utskick, så att ett nytt utskick tar bort gamla fel.
  - Kodsteget sparas i `sessionStorage` (`{ sent, email, at }`, i `try/catch`, högst en timme) och visas igen efter en omladdning i samma flik. Det tas bort när koden skickas och sparas igen om koden nekades.
  - "Jag har redan en kod" öppnar kodsteget utan nytt mejl.
- Koden normaliseras (NFKC, mellanslag och bindestreck bort), så "123 456", "123-456" och helbreddssiffror godtas.
- "Tillbaka" i receptvyn går bakåt i historiken när sidan nåddes inom Matkoll (`BackLink`, och `ScrollMemory` räknar navigeringarna), annars till `/recept`. Öppnad från Matsedel går den tillbaka till Matsedel (e2e).
- Hemskärmsraden visar Safaris steg bara på iPhone och iPad (också iPadOS som säger "Macintosh"), "välj Installera appen i webbläsarens meny" på Android och inget på en dator.
- Manifestet har `id: "/"`.
- AD-3 i `ARCHITECTURE-SPINE.md` beskriver sidan med knappen, gränsen och `Sb-Forwarded-For`.

**Avvisat:**
- `[auth.email] enable_signup = false` i `config.toml`. Den inställningen styr hela e-postinloggningen (`GOTRUE_EXTERNAL_EMAIL_ENABLED`), inte registreringen, som redan är avstängd med `[auth] enable_signup = false`.
- Att jämna ut svarstiden mellan en adress utanför listan (inget anrop) och en tillåten adress (ett anrop). "Skicka länk" har samma skillnad sedan 1.2, och gränsen gäller lika för båda.
- En gräns per adress oberoende av IP. Den skulle låta vem som helst stänga ute Pontus genom att gissa fel fem gånger.

**Kvar efter granskningen:**
- Integrationstestet `pantry-site.test.ts` ("empty_pantry_place") misslyckas mot den delade databasen, som har 11.2:s migration (`pantry_item.label`) men grenen inte. Storyn rör ingen migration.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: Safari, Dela, Lägg till på hemskärmen. Ikonen ska vara moroten. Öppna från hemskärmen: helskärm, statusraden i appens färg i ljust och mörkt läge, inloggning med koden, tillbakaknapparna, kameran i Lagersaldo och stegläget med tänd skärm.
- VoiceOver på inloggningen: "Kod från mejlet, textfält", felet läses upp.
