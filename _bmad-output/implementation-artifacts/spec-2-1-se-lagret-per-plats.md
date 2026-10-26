---
title: 'Story 2.1: Se lagret per plats'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0a40829a59ae418e14790d06b208b8ec66183c1e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Matkoll vet inte vad som finns hemma. Pontus behöver se lagret per plats, och resten av appen behöver en tabell och en ögonblicksbild av lagret att räkna mot.

**Approach:** Modulen `pantry` får tabellen `pantry_item` (AD-4, AD-19), läsfunktionerna `listPantry(location)` och `getPantrySnapshot()` och Hemma-sidan med tre platskort, rader för varor med mängd och etiketter för obegränsade varor.

## Boundaries & Constraints

**Always:** Bara `pantry` läser och skriver `pantry_item` (AD-1). Katalognamn hämtas via `catalog/server.ts`. Migrationen följer AD-4 och katalogmigrationens mönster (`user_id default auth.uid()`, en policy, `revoke all` och grants till `authenticated` och `service_role`, aldrig `anon`), unik `(user_id, ingredient_id, location, unit)` med `nulls not distinct`, sammansatt FK `(ingredient_id, user_id)` med `on delete restrict`, `check` för `location` (= `LOCATIONS`) och `unit` (= `UNITS`), obegränsad vara har `amount` och `unit` null, och mängd > 0 när den finns. Mängder visas bara med `formatQuantity`. Sidan läser inuti `<Suspense>`. Kör aldrig `supabase db reset`.

**Never:** Inga skrivningar från gränssnittet (2.2, 2.3), ingen kameraknapp (Epic 6), ingen lagningsstatus (2.4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Platskort | Lager med 3 i Kyl, 1 i Frys, 0 i Skafferi | Tre kort i rad: Kyl (mint, "3 varor"), Frys (ljusblå, "1 vara"), Skafferi (sand, "0 varor"); Kyl vald med 2 px accentram | N/A |
| Välj plats | Tryck på Frys | Frys markerad; listan visar frysens varor; valet syns i adressen (`?plats=frys`) | Okänd plats i adressen → Kyl |
| Med mängd | "Mjölk 1 l", "Smör 250 g" | Under "Med mängd": rader med namn och mängden till höger | N/A |
| Obegränsad | "Salt" utan mängd | Under "Finns hemma": rund mint-etikett "Salt" | N/A |
| Tom plats | Skafferi utan varor | "Inget i skafferiet än." (kylen/frysen) | N/A |
| Ögonblicksbild | Mjölk 1 l i Kyl och 1 l i Frys; Salt obegränsad | `getPantrySnapshot()` ger mjölk `{ unlimited: false, amounts: [{ unit: "l", amount: 2 }] }`, salt `{ unlimited: true, amounts: [] }` | N/A |
| Annan användare | Läser eller skriver A:s rader | Inga rader / nekas | RLS |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-2-context.md` -- tabell, skrivoperationer, snapshot och UX för hela epicen
- `supabase/migrations/*_catalog*.sql` -- mönstret för tabell, RLS, grants och sammansatt FK
- `src/features/catalog/` -- `LOCATIONS`, `locationSchema`, `UNITS`, `formatQuantity`, `getIngredientNames(ids)` i `server.ts`
- `src/app/(app)/hemma/page.tsx` -- tomt läge och sidrubrik finns
- `src/components/icons.tsx` (`FridgeIcon`, `FreezerIcon`, `PantryIcon`), `badges.tsx`, `skeleton.tsx`, `empty-state.tsx`
- `tests/integration/support.ts` (`expectRlsIsolation`), `tests/design/catalog-checks.test.ts` -- mönster för RLS- och checktester
- `tests/e2e/support.ts` -- e2e-användare; lagret behöver en egen användare eller städning så att parallella specar inte påverkas

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_pantry.sql` (`supabase migration new … < /dev/null`, `supabase migration up`) och `pnpm db:types` -- `pantry_item` enligt Boundaries, index på `(user_id, location)` -- AD-4, AD-19
- [ ] `tests/design/` -- `location`- och `unit`-listorna i migrationen är exakt `LOCATIONS` och `UNITS` -- drift
- [ ] `src/features/pantry/domain/` (+ test) -- typerna `PantryItem`, `PantrySnapshot`; ren funktion `toSnapshot(rows)` som summerar per ingrediens och enhet över platser och sätter `unlimited` om någon rad saknar mängd -- AD-19
- [ ] `src/features/pantry/data/queries.ts`, `src/features/pantry/server.ts`, `src/features/pantry/index.ts` -- `listPantry(location)` (med ingrediensnamn via `catalog.getIngredientNames`, sorterade på namn) och `getPantrySnapshot()` (React `cache` per förfrågan) -- AD-1, AD-19
- [ ] `src/features/pantry/ui/` -- platskorten (knappar med `aria-pressed` eller länkar med `aria-current`, minst 44 px), listan "Med mängd", etiketterna "Finns hemma", tomt läge -- UX
- [ ] `src/app/(app)/hemma/page.tsx` -- plats från `?plats=` (kyl/frys/skafferi), data inuti `<Suspense>` med skelettrader, antal per plats på korten -- matrisen
- [ ] `tests/integration/pantry.test.ts` -- RLS med `expectRlsIsolation('pantry_item', …)`; unik nyckel med `nulls not distinct`; FK nekar främmande ingrediens; `check` nekar okänd plats och enhet; mängd ≤ 0 nekas; `listPantry` och `getPantrySnapshot` mot riktiga rader -- matrisen
- [ ] `tests/e2e/pantry.spec.ts` -- egen e2e-användare med lagerrader skapade via service role före testet: platskort med antal, byte av plats, rader och etiketter, tom plats, mobil och dator -- matrisen
- [ ] `README.md` -- avsnitt om lagret -- dokumentation

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: tabellen finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
