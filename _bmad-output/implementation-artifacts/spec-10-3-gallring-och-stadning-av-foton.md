---
title: 'Story 10.3: Gallring och städning av foton'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: '4ceb250512d84a7b566f62d98d9ff0d8b7c55b49'
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
- [x] `supabase/migrations/<tid>_pantry_photo_sweep.sql` -- `pantry_photo_orphans(min_age interval)` (`security invoker`, `stable`, högst 100 namn) med `grant execute` till `authenticated` och `service_role`. Sedan `supabase gen types` -- AD-26
- [x] `src/features/pantry/data/photos.ts` (+ test) -- `loadExpiredPlacePhotosIn`, `loadPlacePhotoOrphansIn`, `deletePlacePhotoRowsIn` och `removePlacePhotoFiles` i omgångar om högst 100 -- AD-26
- [ ] `src/features/pantry/server.ts` (+ test) -- `listPlacePhotos` ger `needsSweep` -- FR-39
- [x] `src/features/pantry/actions/sweep-place-photos.ts` (+ test) -- `sweepPlacePhotos()`: `requireUser()`, tar bort gamla rader och deras filer och filer utan rad, `revalidateFor('pantry_photo')` bara när något togs bort. Returnerar antal. `savePlacePhoto` (10.1) anropar den efter ett lyckat sparande -- FR-39
- [x] `src/features/pantry/ui/photo-sweep.tsx` (+ test), `src/app/(app)/hemma/home-content.tsx` -- en klientkomponent som anropar `sweepPlacePhotos` en gång när `needsSweep` är sant. Inget syns -- FR-39
- [x] `src/features/pantry/actions/delete-pantry-site.ts` (+ test) -- läser ställets sökvägar, tar bort stället och sedan filerna. Fel med filerna loggas -- AD-20, AD-26
- [x] `scripts/users-sync.mjs` (+ `tests/scripts/…`) -- med `--prune`: listar `<user_id>/` rekursivt i `pantry-photo` och tar bort allt före `deleteUser`. Skriver antal, aldrig sökvägar -- AD-26
- [x] `.github/workflows/backup.yml`, `scripts/backup-counts.sql`, `tests/lint/backup-workflow.test.ts` -- `--exclude storage.objects --exclude public.pantry_photo` i datadumpen, och `pantry_photo` utesluten ur räkningen -- AD-23
- [x] `docs/drift.md` -- i "Vad säkerhetskopian innehåller": att foton aldrig tas med. I "Återställning": att fotomigrationen körs med `psql -f` efter `schema.sql` och `data.sql`, och att den tål att köras igen. En rad om att en användare bara tas bort med `pnpm users:sync --prune`, eftersom en borttagning i Supabase-panelen lämnar filerna kvar. Under steg 2: att Storage ingår i gratisnivån (1 GB) och att bucketen skapas av `supabase db push`
- [x] `tests/integration/pantry-photo.test.ts` (utökad) -- gamla rader och filer tas bort, filer utan rad som är yngre än 10 minuter står kvar, en annan användares filer berörs inte, ett borttaget ställe tar bort sina filer, och `pantry_photo_orphans` ger bara egna namn
- [x] `tests/e2e/place-photo-sweep.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-foto-gallra@matkoll.test`. Service role seedar ett foto från 31 dagar sedan och ett från igår. Hemma visar bara det nya, och efter visningen är det gamla borta (service role). Ett tomt ställe med foto tas bort i arket Ställen, och filen är borta. "Töm kylen" lämnar fotot -- matrisen
- [x] Återställningen provas i en tillfällig lokal stack enligt `docs/drift.md`, och resultatet skrivs i beslutsloggen
- [x] `docs/beslutslogg.md` -- en post för storyn

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
- **Från granskningen av 10.1:**
  - Kaskaden tar bara bort raderna när ett ställe eller en användare tas bort. Filerna ligger kvar och tas bort här: av `deletePantrySite`, `users:sync --prune` och gallringen.
  - Listningen i gallringen och i e2e-städningen (`removePlacePhotos` i `tests/e2e/support.ts`) ska vara rekursiv och gå igenom alla sidor. `list` ger högst 100 poster per anrop som standard, och i dag läser städningen bara den första sidan per mapp.
  - En förra fil som inte gick att ta bort (`pantry_photo_remove_failed`) har ingen rad. Gallringen hittar den genom listningen, som en fil utan rad. Ingen tabell för filer att ta bort.

## Spec Change Log

### Vid bygget

**Pausad 2026-10-26** (grenen `wip/10-3`): Pontus väntar med 10.2 och 10.3 tills den nya UX:en (Epic 11) är klar. Kvar: `listPlacePhotos` med `needsSweep` (uppgiften i `server.ts`, se nedan), att köra om `place-photo-sweep.spec.ts` efter rättelsen av toasten, och granskningen.

**Återupptagen 2026-10-27** på grenen `story/10-3-v2`, byggd på `origin/epic/11-nytt-utseende` (`b58da78`) med `wip/10-3` (`155f8df`) plockad ovanpå.

- **Konflikterna** gällde bara listor där båda sidor lagt till något: e2e-användarna i `tests/e2e/support.ts` och `global-setup.ts` (Epic 11:s tre och `e2e-foto-gallra`), posterna i `docs/beslutslogg.md`, steg 2 i `docs/drift.md` (Postgres 17 från 10.4 blev punkt 4 och Storage punkt 5) och `sprint-status.yaml`. `home-content.tsx` slogs ihop utan konflikt. Lagersaldo (11.3) använder fortfarande `HomeContent`, så `PhotoSweep` startas på samma ställe.
- **Ingen ny migration.** Alla migrationer, också `pantry_photo_sweep` och Epic 11:s `pantry_label`, var redan körda lokalt, och `pnpm db:types` gav samma `database.types.ts` som sammanslagningen.
- **`needsSweep` är fortfarande `needsPlacePhotoSweep()`,** så att 10.3 inte beror på 10.2, som byggs samtidigt. Uppgiften i `server.ts` står kvar som öppen och slås ihop med `listPlacePhotos` när 10.2 och 10.3 förs samman.
- **Toasten i "Töm kylen":** testet med den rättade texten ("Tog bort 1 vara ur kylen för Hemma.") och "Ångra" går igenom. `pantry_restore_failed 23505`, som syntes en gång förut, kommer inte från 10.3. Den kommer från `pantry.spec.ts`, "Ångra fails when the location has the item again", som framkallar den med avsikt (ett enskilt "Ångra" när platsen har varan igen). "Töm kylen" använder i stället `restorePantryRemoval`. I körningarna nedan syntes den bara i den fullständiga körningen, från det testet.

- **Byggd på `4ceb250`** (`baseline_commit`), Story 10.1 klar.
- **Migrationen lokalt:** `20261026202113_pantry_photo_sweep.sql` är körd mot den lokala databasen. Först en säkerhetskopia av bara data (utanför repot), sedan under testlåset `scripts/pantry-site-check.sql`, `supabase migration up --local` och kontrollen igen. `diff` var tom (45 rader i `pantry_item`), och eftervillkoren håller. Migrationen provades först i en transaktion som rullades tillbaka. `pnpm db:types` gav samma fil tre gånger.
- **`pantry_photo_orphans(min_age)`** tar åldern som parameter. Gallringen skickar 10 minuter (`photoOrphanMinAgeMs`), och integrationstesterna 0. En ålder som är `null` eller negativ ger inget. Funktionen kontrollerar mappen själv också, så service role får ett tomt svar. Den skapas med `create or replace` och tål att köras igen.
- **`needsSweep` är en egen läsning, `needsPlacePhotoSweep()` i `server.ts`,** inte ett fält i `listPlacePhotos`. `listPlacePhotos` byggs i 10.2 samtidigt. Gallringen gäller alla användarens ställen, medan `listPlacePhotos` gäller ett. Vid sammanslagningen med 10.2 kan `listPlacePhotos` ge `needsSweep` från `needsPlacePhotoSweep()`, eller så får Hemma läsa båda. Ett läsfel ger `false` och loggas som `pantry_photo_sweep_unavailable`.
- **Gallringens kärna** ligger i `pantry/actions/photo-sweep.ts` (`sweepPlacePhotosIn`, `placePhotosNeedSweepIn`, `server-only`, inte en Server Action), så att `savePlacePhoto` och `sweepPlacePhotos` delar den. Den ger `{ removed, failed }`. `removed` räknar borttagna rader och filer utan rad, och Hemma revalideras när den är större än 0, också när ett senare steg misslyckades. 30 dagar räknas från `taken_at`. Konstanterna ligger i `domain/photo-sweep.ts` (10.2 behöver samma 30 dagar).
- **Fel i gallringen** ger `pantry_photo_remove_failed`, utan ny felkod. Inget visas.
- **`removePlacePhotoFiles`** tar bort i omgångar om 100.
- **`deletePantrySite`:** testerna ligger i `pantry-site-actions.test.ts`, där de andra actions för ställen testas. Kan sökvägarna inte läsas tas stället ändå bort, och felet loggas.
- **`users:sync --prune`:** listningen och borttagningen ligger i `scripts/pantry-photo-files.mjs` (`listFilesUnder`, `removeFiles`, `removeUserPlacePhotos`), och ordningen i `pruneUser` i `users-sync-plan.mjs`. `removeUserPlacePhotos` listar igen efteråt och ger fel om något är kvar, och den tar bara emot ett uuid, så den listar aldrig hela bucketen. `removePlacePhotos` i `tests/e2e/support.ts` och städningen i integrationstestet använder samma kod. Integrationstestet tar bort 108 filer, varav 105 i en mapp, med `pruneUser`. Skriptet har inte körts med `--prune` mot den lokala databasen, eftersom det tar bort alla användare som inte står i `ALLOWED_EMAILS`.
- **Säkerhetskopian utesluter också `storage.buckets`, `storage.s3_multipart_uploads` och `storage.s3_multipart_uploads_parts`.** Med bara spec:ens två stoppade återläsningen på `buckets_pkey`, eftersom migrationerna redan har skapat bucketen. S3-tabellerna kan innehålla sökvägar. `supabase db dump --dry-run` med flaggorna från `backup.yml` visar dem som `--exclude-table`, och en riktig dump hade inga rader från `storage` eller `pantry_photo` och inga sökvägar.
- **`docs/drift.md` och fotomigrationen:** återställningen i `docs/drift.md` läser in schemat med `supabase db push` och inte från `schema.sql`, så fotomigrationerna har redan skapat bucketen och policyerna när datan läses in. Därför säger `docs/drift.md` inte att migrationen körs med `psql -f`. I stället kontrolleras bucketen, policyerna och att `pantry_photo` är tom efter punkt 5. Migrationerna från 10.1 tål inte att köras om i sin helhet (`create table`, `create function`), trots kommentaren i dem. Bara bucketen och policyerna gör det.
- **Återställningen provades** i en tillfällig lokal stack (`project_id` `matkoll_restore`, portarna 553xx), med räkningen och dumpen tagna direkt efter varandra under testlåset. Radantalen var desamma, bucketen och policyerna fanns, och `pantry_photo` var tom. 421 av 427 integrationstester gick igenom mot den. De sex andra beror på testmiljön (`supabase db query --local` går till huvudstacken, och Mailpit var inte startad). Stacken och de okrypterade filerna är borttagna.
- **E2E:** `place-photo-sweep.spec.ts` kan inte visa att "Hemma visar bara det nya", eftersom raden Senaste foto kommer i 10.2. Testet visar i stället, med service role, att det gamla fotot (rad och fil) är borta efter visningen och att fotot från igår och ett på 29 dagar står kvar. Kontrollen av raden läggs till när 10.2 är ihopslagen. Körningen med de berörda specarna gav först 41 av 42: testet för "Töm kylen" väntade sig fel text i toasten (med två ställen står "för Hemma"). Efter rättelsen och flytten till Epic 11 (produktionsbygge, `CI=1`, under testlåset): `place-photo-sweep`, `pantry-sites`, `empty-place`, `place-photo-save`, `site-photo` och `pantry-look` 33 av 33, `place-photo-sweep` fyra gånger i rad med en arbetare 16 av 16, och hela e2e-sviten 286 av 286. Med `--repeat-each` och flera arbetare krockar kopiorna, eftersom de delar specens användare. Det beror på körningen, inte på koden.

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `supabase db dump --local --data-only --dry-run` med flaggorna från `backup.yml` -- expected: inga rader från `storage.objects` eller `pantry_photo`

**Manual checks (if no CLI):**
- Återställningen i en tillfällig lokal stack: bucketen och policyerna finns efter att fotomigrationen körts igen, och ett nytt foto kan sparas och visas.
