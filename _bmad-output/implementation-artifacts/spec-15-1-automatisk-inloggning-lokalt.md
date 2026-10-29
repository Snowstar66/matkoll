---
title: 'Story 15.1: Automatisk inloggning lokalt'
type: 'feature'
created: '2026-10-29'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/epic/15-lokal-inloggning'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus: "lokalt loggas du in automatiskt utan kod". På den egna Macen ska appen öppnas inloggad, men det får aldrig gå att slå på någon annanstans.

**Approach:** När en sida begärs utan session och alla skydd gäller loggar proxyn in den lokala användaren med e-post och lösenord (`signInWithPassword`, publishable key, vanlig kakhantering) och omdirigerar till samma sida. Skripten `pnpm dev:set-password` sätter lösenordet.

## Boundaries & Constraints

**Always:** Alla skydd körs vid varje anrop, på servern: `NODE_ENV === "development"`, `VERCEL` ej satt, Host (och `X-Forwarded-Host` om den finns) är `localhost` eller `127.0.0.1`, `DEV_AUTO_LOGIN_EMAIL` och `DEV_AUTO_LOGIN_PASSWORD` är satta, och Supabase-adressen är lokal. Brister något gör koden ingenting och den vanliga inloggningen gäller. Skyddet är en ren funktion med enhetstest för varje villkor. Skriptet vägrar om Supabase-adressen inte är lokal.

**Never:** Service role i appkoden (bara i `scripts/`, AD-4). Lösenordet och e-posten loggas aldrig. Ingen migration. Inget nätverksanrop utom till lokal Supabase. Värdena hamnar aldrig i bygget (de läses vid körning, inte som `NEXT_PUBLIC_`).

</frozen-after-approval>

## Genomförande

- `src/lib/supabase/dev-auto-login.ts`: `devAutoLoginCredentials(input)` ger uppgifterna eller `null`; `isLocalHost`, `isLocalUrl`. Enhetstest i `dev-auto-login.test.ts` (produktion, test, Vercel, främmande värdar, `localhost.evil.com`, vidarebefordrad värd, saknade variabler, molnets Supabase-adress).
- `src/lib/supabase/proxy.ts`: `devAutoLoginRedirect(request)`. Anropas i `src/proxy.ts` bara för sidanrop utan session utanför `/logga-in` och `/auth/confirm`, så utloggning på `/logga-in` fungerar. Misslyckas inloggningen loggas bara `dev_auto_login_failed` och den vanliga omdirigeringen till `/logga-in` sker.
- Varför proxyn och inte en egen route: ett ställe, ingen ny publik adress som kan nås utan skydd, och `next` bevaras eftersom vi omdirigerar till den begärda sidan.
- `env-schema.ts`: `DEV_AUTO_LOGIN_EMAIL`, `DEV_AUTO_LOGIN_PASSWORD`, `VERCEL`, `NODE_ENV` (AD-14); `.env.example` uppdaterad.
- `supabase/config.toml`: lösenordsinloggning är på som standard (`[auth.email] enable_signup = true` styr bara e-postleverantören; allmän registrering är av), så ingen ändring behövdes.
- `scripts/dev-set-password.mjs` (`pnpm dev:set-password`): hittar den befintliga användaren på e-post, sätter lösenordet med service role, skriver ut ingen e-post eller lösenord. README beskriver flödet.

## Verifiering

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e `auth` och `shell`. `grep -r` över `.next` efter lösenordsvärdet ger inga träffar. Säkerhetsgranskning återstår.

## Review Triage Log
