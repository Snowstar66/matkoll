---
title: 'Story 1.12: Inställningar för receptsajter'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '795b2a1e27ae2e9558854f4a609149d83962e251'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Godkända receptsajter går bara att ändra i databasen, och det finns ingen utloggning. Pontus vill lägga till och ta bort sajter själv, och kunna logga ut.

**Approach:** Inställningssidan listar godkända receptsajter, har ett fält för en ny sajt som normaliseras av schemat i `settings/domain` (FR7), en knapp per sajt för att ta bort den och knappen "Logga ut". En borttagen sajt stängs av (`is_active = false`), enligt beslutet att sajter aldrig raderas, så att den inte kommer tillbaka vid nästa inloggning.

## Boundaries & Constraints

**Always:** Bara `settings` skriver `recipe_site` (AD-1). Actions börjar med `requireUser()` och validerar med Zod; domänen normaliseras med `domainNameSchema` (gemener, utan schema, sökväg, port och `www.`). "Ta bort" sätter `is_active = false`; att lägga till en avstängd sajt igen aktiverar den. Import läser listan vid varje förfrågan, så ändringen gäller direkt. Utloggning anropar `signOut` på servern och skickar till `/logga-in`. Svensk text enligt `EXPERIENCE.md`.

**Never:** Ingen radering av rader i `recipe_site`. Ingen hantering av butik (Epic 7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna | Kugghjulet (mobil) eller sidomenyn (dator) | Rubriken "Inställningar", avsnittet "Godkända receptsajter" med aktiva sajter i bokstavsordning, fältet för ny sajt och "Logga ut" längst ned | N/A |
| Lägg till | "https://www.Arla.se/recept" | "arla.se" i listan; import från arla.se fungerar direkt | N/A |
| Ogiltig domän | "inte en sajt", "localhost", "127.0.0.1" | "Ange en giltig webbadress, t.ex. koket.se." | Inget sparas |
| Finns redan | "koket.se" när den är aktiv | "koket.se finns redan." | Inget sparas |
| Avstängd igen | Lägg till en avstängd sajt | Sajten blir aktiv | N/A |
| Ta bort | "Ta bort" vid koket.se | Sajten försvinner ur listan med "Ångra" i 5 s; import från koket.se ger "koket.se är inte en godkänd receptsajt." | Ångra aktiverar igen |
| Ny inloggning | Logga ut och in efter borttagning | Den borttagna sajten förblir borttagen | N/A |
| Logga ut | "Logga ut" | Sessionen avslutas; inloggningssidan visas; en ny sida kräver inloggning | N/A |
| Annan användare | Försöker ändra A:s sajter | Inget ändras | RLS |

</frozen-after-approval>

## Code Map

- `src/app/(app)/installningar/page.tsx` -- rubrik och tillbakalänk på mobil finns
- `src/features/settings/domain/domain-name.ts` (`domainNameSchema`, `normalizeDomainName`), `src/features/settings/data/`, `server.ts` (`getActiveRecipeDomains`, `ensureUserDefaults`) -- från 1.8
- `supabase/migrations/*settings*.sql` -- `recipe_site`, `ensure_user_defaults()` (aktiverar aldrig en avstängd sajt)
- `src/features/auth/` -- inloggning; lägg till `signOut`
- `src/components/` -- Field, Button, EmptyState, toast med Ångra
- `docs/beslutslogg.md` -- "Receptsajter stängs av, raderas inte"

## Tasks & Acceptance

**Execution:**
- [x] `src/features/settings/data/`, `actions/add-recipe-site.ts`, `actions/set-recipe-site-active.ts` (+ tester) -- lägg till (upsert som aktiverar), stäng av och aktivera igen; `requireUser`, Zod med `domainNameSchema`, felkoder `settings_invalid_domain` och `settings_duplicate_domain` med svenska texter i `src/lib/errors.ts` -- FR7
- [x] `src/features/settings/server.ts` -- `listRecipeSites()` (aktiva, bokstavsordning) -- AD-1
- [x] `src/features/auth/actions/sign-out.ts` (+ test) -- `signOut` på servern och `redirect('/logga-in')` -- FR1
- [x] `src/app/(app)/installningar/page.tsx`, `src/features/settings/ui/recipe-sites.tsx`, `src/features/auth/ui/sign-out-button.tsx` -- listan, fältet med "Lägg till", "Ta bort" per sajt med Ångra, "Logga ut" som textknapp längst ned; inuti `<Suspense>` -- UX-DR16
- [x] `tests/integration/settings.test.ts` (utökad) -- stäng av och aktivera; `ensure_user_defaults()` aktiverar inte en avstängd standardsajt; RLS -- matrisen
- [x] `tests/e2e/settings.spec.ts` -- lägg till "https://www.Arla.se/recept" → "arla.se"; ogiltig domän; ta bort koket.se och se att länkimport från koket.se nekas; Ångra; logga ut och se att `/recept` kräver inloggning (logga in igen i testet eller använd en egen testanvändare så att andra tester inte påverkas) -- matrisen
- [x] `README.md` -- inställningarna -- dokumentation

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Utloggning använder `scope: "local"`: bara den här webbläsaren loggas ut, och andra enheter är kvar inloggade. Beslutet loggas i beslutslogg.
- `signOut` kör inte `requireUser()`, eftersom en session för en adress som har tagits bort ur `ALLOWED_EMAILS` också ska kunna avslutas.
- Att lägga till en sajt görs med en uppdatering och sedan en insert, inte med en Postgres-funktion. Vid krock görs ett nytt försök med återaktivering.

## Spec Change Log

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.
- **Patch:**
  - `endSession` räknar ett fel från `getClaims` som "inte utloggad".
  - Felloggen skiljer på om utloggningen misslyckades helt eller om bara återkallelsen av sessionen misslyckades.
  - Insert anger `user_id` och gör ett nytt försök med återaktivering vid 23505. Felkoder tolkas bara när de gäller kända constraints.
  - Samma sorteringsfunktion används på servern och klienten.
  - Om läsningen av sajtlistan misslyckas visas en notis, och "Logga ut" ligger utanför den datatunga Suspense-gränsen.
  - Felet nollställs när en ny ändring börjar, och avvisade action-anrop fångas.
  - Ångra gäller alla sajter som tagits bort under samma toast.
  - Ingen toast visas om inget ändrades.
  - Utloggningsknappen fångar nätverksfel.
  - Felmeddelandet för domännamn har en enda källa.
  - e2e-filen körs seriellt.
  - Nya komponenttester för felvägarna i `RecipeSites` och `SignOutButton`.
- **Defer:** Ångra som utlöses efter att Pontus har lämnat sidan, och upsert i en enda atomisk funktion (en användare, så krockrisken är liten).
- **Reject:** att `listRecipeSites` och `getActiveRecipeDomains` dubblerar varandra. De skiljer sig nu åt eftersom listan sorteras.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
