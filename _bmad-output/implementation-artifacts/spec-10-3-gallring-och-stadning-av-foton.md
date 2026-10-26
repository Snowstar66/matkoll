---
title: 'Story 10.3: Gallring och städning av foton'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-1-spara-senaste-fotot-per-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-2-visa-senaste-fotot-i-hemma.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-8-forbered-molndrift.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 10.2 visas bara foton som är yngre än 30 dagar, men inget tar bort de äldre. Ett borttaget ställe tar bara bort raderna, och filerna ligger kvar. En användare som tas bort lämnar sina filer, eftersom `storage.objects` inte har någon främmande nyckel till `auth.users`. En fil vars ersättning avbröts ligger kvar utan rad. Säkerhetskopian tar med raderna, och en återställning får inte tillbaka bucketen och policyerna (FR-39, NFR-11).

**Approach:**
- `sweepPlacePhotos()` (Server Action) tar bort användarens foton som är äldre än 30 dagar och filer utan rad. Hemma anropar den när `listPlacePhotos` säger `needsSweep`, och varje sparande anropar den efteråt.
- `deletePantrySite` tar bort ställets filer efter att stället är borttaget.
- `pnpm users:sync --prune` tar bort användarens filer innan användaren tas bort.
- Säkerhetskopian utesluter `storage.objects` och `pantry_photo`, och `docs/drift.md` beskriver hur bucketen och policyerna kommer tillbaka.

## Boundaries & Constraints

**Always:**
- Filer tas bara bort med Storage-API:t (`remove`), aldrig med SQL (`storage.protect_delete()`).
- `sweepPlacePhotos` använder sessionsklienten och rör bara användarens egna rader och filer (RLS). Den tar bort högst 100 filer per anrop och är idempotent.
- Filer utan rad hittas med `pantry_photo_orphans()` (`security invoker`), som läser användarens objekt i bucketen och jämför med `pantry_photo`. En fil som är yngre än 10 minuter räknas aldrig som utan rad, så att ett sparande som pågår inte förlorar sin fil.
- `listPlacePhotos` ger `needsSweep` när det finns rader som är äldre än 30 dagar eller filer utan rad. Hemma anropar `sweepPlacePhotos` en gång per visning bara då. Läsningen själv skriver aldrig (AD-2).
- `deletePantrySite` läser ställets sökvägar före `delete_pantry_site` och tar bort filerna efter att stället är borttaget. Ett fel med filerna loggas och lämnas åt gallringen, och borttagningen av stället lyckas ändå.
- `scripts/users-sync.mjs --prune` listar och tar bort allt under `<user_id>/` i bucketen med service role innan `auth.admin.deleteUser`. Misslyckas det tas användaren inte bort, och skriptet säger varför.
- "Töm kylen" (6.3) och "Ångra" rör inte fotot.
- Säkerhetskopian (`.github/workflows/backup.yml`) utesluter `storage.objects` och `public.pantry_photo` ur datadumpen, och `scripts/backup-counts.sql` räknar inte `pantry_photo`. Testet `tests/lint/backup-workflow.test.ts` låser det.
- `docs/drift.md` säger att fotomigrationen körs igen efter en återställning (bucketen och policyerna finns i schemat `storage`, som dumpen inte tar med), och återställningen provas i en tillfällig lokal stack som i Story 3.8.
- E2E-specen har den egna e2e-användaren `e2e-foto-gallra@matkoll.test`.

**Never:**
- Inget schemalagt jobb, ingen ny nyckel och ingen service role i en förfrågan (AD-4, AD-14).
- Ingen annan användares fil eller rad berörs.
- Inga foton, sökvägar eller avläsningar i loggar, i säkerhetskopian eller i repot.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gammalt foto | Ett foto av kylen från 31 dagar sedan | Hemma visar ingen rad, anropar `sweepPlacePhotos`, och raden och filen är borta | N/A |
| Nästan gammalt | Ett foto från 29 dagar sedan | Visas och ligger kvar | N/A |
| Fil utan rad | En fil i användarens mapp utan rad, äldre än 10 minuter | Tas bort vid nästa gallring | N/A |
| Sparande pågår | En fil utan rad som är 1 minut gammal | Ligger kvar | N/A |
| Inget att gallra | Bara foton yngre än 30 dagar | `needsSweep` är falskt, och Hemma anropar inget | N/A |
| Annan användares filer | En annan användare har gamla foton och filer utan rad | Berörs inte av ägarens gallring | RLS |
| Gallringen misslyckas | Storage nås inte | Raderna står kvar, ingen ny rad visas, och nästa visning försöker igen | Loggas med felkod |
| Många filer | 150 filer att ta bort | 100 tas bort. Resten nästa gång | N/A |
| Ta bort ett ställe | Stugan är tom och inte vald, och har foton av kylen och frysen | Stället, raderna och filerna är borta | Fel med filerna: loggas, stället är borta, filerna tas av gallringen |
| Ett ställe med varor | Stugan har varor | Kan inte tas bort, som i 8.2. Fotona står kvar | `pantry_site_in_use` |
| Töm kylen | Kylen har ett foto | Varorna tas bort, fotot står kvar | N/A |
| Ta bort en användare | `pnpm users:sync --prune` för en användare som inte är tillåten och har tre foton | Filerna tas bort först, sedan användaren och raderna | Fel med filerna: användaren tas inte bort, och skriptet avslutas med fel |
| Säkerhetskopia | Flödet Backup med foton i databasen | `data.sql` har inga rader från `storage.objects` eller `pantry_photo`. `counts.txt` har ingen rad för `pantry_photo` | N/A |
| Återställning | En säkerhetskopia läses in i en tillfällig lokal stack enligt `docs/drift.md` | Bucketen och policyerna finns, `pantry_photo` är tom, RLS-testerna passerar, och ett nytt foto kan sparas | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-10-context.md` -- gallringen, säkerhetskopian och skripten
- `spec-10-1-…md`, `spec-10-2-…md` -- tabellen, `pantry/data/photos.ts`, `listPlacePhotos` och `removePlacePhoto`
- `spec-3-8-forbered-molndrift.md` -- hur säkerhetskopian och återställningen provades lokalt
- `src/features/pantry/actions/delete-pantry-site.ts` (+ test), `src/features/pantry/data/sites.ts`
- `src/app/(app)/hemma/home-content.tsx` -- var gallringen startas
- `scripts/users-sync.mjs`, `scripts/users-sync-plan.mjs`, `tests/scripts/users-sync-plan.test.ts`
- `.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `tests/lint/backup-workflow.test.ts`
- `docs/drift.md` (avsnitten 10 och "Återställning")
- `tests/integration/pantry-photo.test.ts`

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_pantry_photo_sweep.sql` -- `pantry_photo_orphans(min_age interval)` (`security invoker`, `stable`, högst 100 namn) med `grant execute` till `authenticated` och `service_role`. Sedan `supabase gen types` -- AD-26
- [ ] `src/features/pantry/data/photos.ts` (+ test) -- `loadExpiredPlacePhotosIn`, `loadPlacePhotoOrphansIn`, `deletePlacePhotoRowsIn` och `removePlacePhotoFiles` i omgångar om högst 100 -- AD-26
- [ ] `src/features/pantry/server.ts` (+ test) -- `listPlacePhotos` ger `needsSweep` -- FR-39
- [ ] `src/features/pantry/actions/sweep-place-photos.ts` (+ test) -- `sweepPlacePhotos()`: `requireUser()`, tar bort gamla rader och deras filer och filer utan rad, `revalidateFor('pantry_photo')` bara när något togs bort. Returnerar antal. `savePlacePhoto` (10.1) anropar den efter ett lyckat sparande -- FR-39
- [ ] `src/features/pantry/ui/photo-sweep.tsx` (+ test), `src/app/(app)/hemma/home-content.tsx` -- en klientkomponent som anropar `sweepPlacePhotos` en gång när `needsSweep` är sant. Inget syns -- FR-39
- [ ] `src/features/pantry/actions/delete-pantry-site.ts` (+ test) -- läser ställets sökvägar, tar bort stället och sedan filerna. Fel med filerna loggas -- AD-20, AD-26
- [ ] `scripts/users-sync.mjs` (+ `tests/scripts/…`) -- med `--prune`: listar `<user_id>/` rekursivt i `pantry-photo` och tar bort allt före `deleteUser`. Skriver antal, aldrig sökvägar -- AD-26
- [ ] `.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `tests/lint/backup-workflow.test.ts` -- `--exclude storage.objects --exclude public.pantry_photo` i datadumpen, och `pantry_photo` utesluten ur räkningen -- AD-23
- [ ] `docs/drift.md` -- i "Vad säkerhetskopian innehåller": att foton aldrig tas med. I "Återställning": att fotomigrationen körs med `psql -f` efter `schema.sql` och `data.sql`, och att den tål att köras igen. En rad om att en användare bara tas bort med `pnpm users:sync --prune`, eftersom en borttagning i Supabase-panelen lämnar filerna kvar. Under steg 2: att Storage ingår i gratisnivån (1 GB) och att bucketen skapas av `supabase db push`
- [ ] `tests/integration/pantry-photo.test.ts` (utökad) -- gamla rader och filer tas bort, filer utan rad som är yngre än 10 minuter står kvar, en annan användares filer berörs inte, ett borttaget ställe tar bort sina filer, och `pantry_photo_orphans` ger bara egna namn
- [ ] `tests/e2e/place-photo-sweep.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-foto-gallra@matkoll.test`. Service role seedar ett foto från 31 dagar sedan och ett från igår. Hemma visar bara det nya, och efter visningen är det gamla borta (service role). Ett tomt ställe med foto tas bort i arket Ställen, och filen är borta. "Töm kylen" lämnar fotot -- matrisen
- [ ] Återställningen provas i en tillfällig lokal stack enligt `docs/drift.md`, och resultatet skrivs i beslutsloggen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): gallringen körs när Pontus använder appen, inte schemalagt.** Ett schemalagt jobb skulle behöva service role eller en ny nyckel i Vercel eller GitHub. Ett gammalt foto visas aldrig, också om filen ligger kvar tills Hemma öppnas. Om appen inte används på länge ligger filerna kvar, privat, tills nästa visning.
- **Beslut (förslag): tio minuters marginal för filer utan rad,** så att en fil som laddats upp men ännu inte fått sin rad aldrig tas bort mitt i ett sparande.
- **Beslut (förslag): foton tas inte med i säkerhetskopian.** Den ligger i GitHub i 90 dagar och laddas ner en gång i månaden. Ett foto går att ta om, och det gallras efter 30 dagar ändå. Utan raderna finns inga rader som pekar på filer som saknas efter en återställning.
- **Beslut (förslag): "Töm kylen" tar inte bort fotot.** "Ångra" ger tillbaka varorna, och då hör fotot fortfarande till dem. Öppen fråga 13.
- **Risk: `--exclude` för en tabell i `storage`.** Kontrollera med `supabase db dump --dry-run` mot den lokala stacken att flaggan tar bort raderna, som den gör för `storage.buckets_vectors`.
- **Risk: rekursiv listning.** Storage-API:ts `list` går en mapp i taget. Skriptet går igenom `<user_id>/<site_id>/<plats>/`, eller läser namnen från `storage.objects` med service role och tar bort dem med `remove`.
- Loggar innehåller bara felkoder och antal.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `supabase db dump --local --data-only --dry-run` med flaggorna från `backup.yml` -- expected: inga rader från `storage.objects` eller `pantry_photo`

**Manual checks (if no CLI):**
- Återställningen i en tillfällig lokal stack: bucketen och policyerna finns efter att fotomigrationen körts igen, och ett nytt foto kan sparas och visas.
