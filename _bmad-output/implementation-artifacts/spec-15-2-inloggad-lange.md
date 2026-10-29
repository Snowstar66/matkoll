---
title: 'Story 15.2: Inloggad länge på varje enhet'
type: 'feature'
created: '2026-10-29'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'origin/epic/15-lokal-inloggning'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus ska inte behöva ange en kod ofta. Sessionen ska leva upp till 90 dagar utan användning, på varje enhet.

**Approach:** Sessionskakan får `maxAge` 90 dagar via `cookieOptions` i `@supabase/ssr`, proxyn förnyar sessionen vid varje sidanrop, och Supabase-inställningarna (lokalt i `config.toml`, i molnet dokumenterade i `docs/drift.md`) tillåter förnyelse så länge.

## Boundaries & Constraints

**Always:** Kakorna är `httpOnly` (appen har ingen webbläsarklient), `SameSite=Lax`, `secure` när `SITE_URL` är https, och utloggning rensar allt. Samma kakalternativ i proxyn och i `createClient`.

**Never:** Ingen ändring i molnprojektet (AD-23), ingen migration, inget nätverksanrop utom till lokal Supabase.

</frozen-after-approval>

## Genomförande

- Utredning: `@supabase/ssr` 0.12.7 ger redan 400 dagars `maxAge`, men `httpOnly` är falskt. Åtkomsttoken gäller 1 h och proxyn förnyar den med `getClaims()` vid varje sidanrop; förnyelsetoken byts vid varje förnyelse med bara 10 s återanvändningsfönster lokalt, så två samtidiga anrop (till exempel förhämtning) kan ge återanvändningsupptäckt och utloggning. Molnets gräns för tid och inaktivitet avgör resten; lokalt fanns ingen.
- `authCookieOptions()` i `src/lib/supabase/config.ts` (`maxAge` 90 dagar, `httpOnly`, `lax`, `path /`, `secure` efter `SITE_URL`), använd av `createClient` och proxyn.
- `supabase/config.toml`: `refresh_token_reuse_interval = 60`, `[auth.sessions] inactivity_timeout = "2160h"`, ingen `timebox`.
- `docs/drift.md` avsnitt 12: motsvarande inställningar i Supabase-instrumentpanelen och en kontroll.

## Verifiering

`pnpm lint`, `pnpm typecheck`, `pnpm test`, bygge och e2e `auth` och `shell` (inloggning och utloggning). Säkerhetsgranskning återstår.

## Review Triage Log
