---
title: 'Story 10.1: Spara senaste fotot per plats'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-nummer-pa-fotot.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-4-foto-inventering-och-tomning-per-stalle.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Fotot som lagret uppdaterades från försvinner när förslagen är hanterade. Ser Pontus senare en konstig vara i kylen går det inte att se vad AI:n läste av eller var (FR-37). AD-15 förbjöd att fotot sparas, och den regeln är nu ändrad (AD-26).

**Approach:**
- En migration skapar den privata bucketen `pantry-photo`, policyerna på `storage.objects`, tabellen `pantry_photo` och Postgres-funktionen `save_pantry_photo`. CI startar `storage-api`.
- När den första skrivningen från ett fotos förslag har lyckats skickar klienten samma förminskade bild, ställe, plats, tid, avläsning och punkter till `POST /api/pantry/photo`.
- Servern kontrollerar bilden, tar bort all metadata, laddar upp den till en ny sökväg, byter raden för platsen och tar bort den förra filen.
- Punkter som kommer efter sparandet läggs till med `savePlacePhotoPoints`.
- Under granskningen säger fotoarkets underrubrik att fotot sparas när Pontus bekräftar något.

## Boundaries & Constraints

**Always:**
- Fotot sparas bara efter en lyckad skrivning från dess förslag: Bekräfta, arkets "Bekräfta" efter Rätta, "Bekräfta alla" eller "Ta bort" i inventeringen. Det sparas en gång per foto (generation), också om flera skrivningar lyckas.
- Fotot sparas på förslagens ställe (`result.site.id`) och plats, aldrig på det ställe som är valt när sparandet görs (FR-33, 8.4).
- Bilden är `KeptPhoto.image`, alltså exakt den bild som analyserades. Den förminskas eller kodas inte om igen, så att punkterna hamnar rätt.
- Servern kontrollerar bilden med `readImageForm` (`maxPlacePhotoSide`, `maxImageBytes`) och tar bort metadata med `stripJpegMetadata` eller `stripPngMetadata` före uppladdningen. `null` från funktionen, eller en WebP, ger `pantry_photo_failed` utan uppladdning.
- Routen gör `isCrossSite`, `requireUserForRoute()` och Zod-validering av alla fält (AD-2). Avläsningen valideras med `readingSchema` och punkterna med `locateResultSchema`.
- Varje foto får en ny sökväg, `<user_id>/<site_id>/<plats>/<foto-id>.<jpg|png>`, och laddas upp med `upsert: false`.
- `save_pantry_photo` tar `pantry_lock()`, ger `MK410` för ett ställe som inte finns eller inte är användarens, och lämnar den förra sökvägen.
- Ett fel efter uppladdningen men före raden tar bort den nya filen. Ett fel när den förra filen tas bort loggas och lämnar filen åt gallringen (10.3).
- Sparandet syns aldrig för Pontus och påverkar aldrig lagret, skrivningen eller "Ångra".
- Alla tester och CI använder `AI_PROVIDER=mock`. E2E-specen har den egna e2e-användaren `e2e-foto-spara@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inget foto sparas vid analysen, efter bara avvisningar, för ett svar utan kort eller för en jämförelse utan ändringar.
- Ingen publik eller signerad URL, ingen `upsert` och ingen SQL-radering i `storage.objects`.
- Inget anrop till AI-tjänsten med det sparade fotot.
- Fotot, avläsningen, sökvägen och ställets namn hamnar aldrig i loggar.
- Ingen ny miljövariabel och ingen ändring av AI-porten, prompten eller mocken.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Första bekräftelsen | Förslag från `kyl.png` på Stugan, Pontus trycker Bekräfta på ett kort | Varan sparas. Sedan går en begäran till `POST /api/pantry/photo` med bilden, stugans id, `Kyl`, tiden, avläsningen och punkterna. En rad och en fil finns för stugans kyl | N/A |
| Fler bekräftelser | Samma foto, Pontus bekräftar tre kort till och trycker "Bekräfta alla" | Ingen ny begäran | N/A |
| Rätta | "Rätta" och arkets "Bekräfta" är den första skrivningen | Fotot sparas | N/A |
| Inventering | "Ta bort" i "Syns inte längre" är den första skrivningen | Fotot sparas | N/A |
| Bara avvisningar | Pontus avvisar alla kort | Ingen begäran | N/A |
| Inga kort | "Hittade inga varor på bilden." eller allt oförändrat | Ingen begäran | N/A |
| Skrivningen misslyckas | Bekräfta ger `pantry_set_failed` | Ingen begäran. Nästa lyckade skrivning sparar fotot | N/A |
| Nytt foto av samma plats | Ett sparat foto av stugans kyl, ett nytt foto bekräftas | En rad för stugans kyl med det nya id:t. Den förra filen är borttagen | Fel vid borttagning: loggas, filen blir kvar till 10.3 |
| Annan plats eller annat ställe | Foto av hemmets kyl och stugans frys | Tre rader (stugans kyl, stugans frys, hemmets kyl) är oberoende | N/A |
| Byt ställe under granskningen | Förslag för Stugan, Pontus väljer Hemma och bekräftar | Fotot sparas på Stugan | N/A |
| Punkterna kommer senare | Bekräfta medan "Letar upp varorna på fotot …" visas | Sparas utan punkter. När punkterna kommer anropas `savePlacePhotoPoints({ id, points })` en gång | Misslyckas: inga punkter, inget fel |
| Uppslaget misslyckas | `/api/ai/locate` ger fel | Fotot sparas utan punkter, och inget mer skickas | N/A |
| EXIF och GPS | En JPEG med APP1 (Exif, GPS) och COM postas direkt till routen | Den sparade filen har varken APP1–APP15 eller COM. Bildens segment är oförändrade | N/A |
| PNG med metadata | En PNG med `tEXt` och `eXIf` | Den sparade filen har bara `IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`, `gAMA`, `cHRM`, `sRGB` | N/A |
| WebP eller trasig bild | En WebP, eller en JPEG vars segment inte går att läsa | Inget sparas | `pantry_photo_failed` (loggas, visas inte) |
| För stor | Mer än 1,5 MB eller mer än 2048 px | Inget sparas | `image_too_large` |
| Stället borttaget | Stugan tas bort innan sparandet | Den nya filen tas bort, ingen rad | `pantry_site_gone` (loggas, visas inte) |
| Storage nås inte | Uppladdningen misslyckas | Ingen rad. Lagret är redan sparat | `pantry_photo_failed` |
| Förfalskat fält | `site` som inte är ett uuid, `location` utanför Kyl/Frys/Skafferi, 26 etiketter, punkter utanför 0–1000 | Inget sparas | `validation` |
| Tid i framtiden | `takenAt` om en timme | Serverns tid används | N/A |
| Annan sajt | Begäran med en annan `Origin` | Inget sparas | `unauthorized` (403) |
| Utan inloggning | Ingen session | Inget sparas | `unauthorized` (401) |
| Annan användare | En användare laddar upp under en annans id eller läser, listar eller tar bort en annans fil | Nekas av policyerna | RLS-test |
| Samtidiga sparanden | Två flikar sparar var sitt foto av samma plats | En rad, med det senare fotot. Båda förra filerna är borta eller lämnas åt gallringen | N/A (`pantry_lock()`) |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-10-context.md` -- beslut, datamodell, felkoder och tester
- `spec-6-6-nummer-pa-fotot.md` (med Review Triage Log) -- `reading`, `positions`, `PhotoNumbers`, uppslaget och fotoarket
- `spec-8-4-…md` -- `result.site`, `photoSiteId`, generationer och skrivningarna från förslagen
- `supabase/config.toml` -- `[storage] enabled = true` (oförändrad)
- `supabase/migrations/` -- mönster för RLS, grants och `pantry_lock()` (8.1)
- `.github/workflows/ci.yml` -- `SUPABASE_EXCLUDE`
- `src/app/api/ai/analyze/route.ts`, `src/app/api/ai/locate/route.ts`, `src/app/api/ai/route-support.ts` (`readImageForm`, `isCrossSite`, `respond`, `statusFor`) -- mönster för en multipart-route
- `src/lib/images.ts` (`stripJpegMetadata`, `stripPngMetadata`, `imageTypeOf`, `maxImageBytes`, `maxPlacePhotoSide`)
- `src/lib/ai-client.ts` (`postAiForm`) -- klientens multipart-anrop
- `src/lib/errors.ts`, `src/lib/revalidate.ts`
- `src/features/pantry/data/sites.ts`, `data/client.ts` (`pantryWriteError`, `MK410`)
- `src/features/pantry/domain/photo-numbers.ts` (`readingSchema`, `locateResultSchema`), `domain/pantry-suggestion.ts` (`analyzedPhotoNoteText`), `domain/site.ts`
- `src/features/pantry/ui/use-pantry-analysis.ts` (`KeptPhoto`, `ReviewPhoto`, `locate`), `pantry-suggestions.tsx`, `pantry-suggestion-list.tsx`, `pantry-item-sheet.tsx` (`confirmCorrected`)
- `tests/integration/support.ts`, `tests/integration/pantry-site.test.ts` -- mönster för testanvändare och RLS
- `tests/e2e/site-photo.spec.ts` -- mönster för foto, ställe och `fetch`-omslaget som läser `FormData`
- `scripts/render-pantry-image.mjs`, `tests/fixtures/ai/kyl.png` -- ritade testbilder

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<tid>_pantry_photo.sql` (via `supabase migration new`):
  - bucketen `pantry-photo` (privat, `file_size_limit` 1572864, `allowed_mime_types` `{image/jpeg,image/png}`, `on conflict (id) do nothing`);
  - policyerna `pantry_photo_select`, `pantry_photo_insert` och `pantry_photo_delete` på `storage.objects` för `authenticated` (AD-26), skrivna så att migrationen kan köras igen (`drop policy if exists` före `create policy`);
  - tabellen `pantry_photo` med `check`, unika nycklar, `(site_id, user_id)` mot `pantry_site (id, user_id)` med `on delete cascade`, RLS, `revoke all` och grants;
  - `save_pantry_photo(...)` (`security invoker`, `pantry_lock()`, `MK410`, lämnar den förra `object_path`) med `grant execute` till `authenticated` och `service_role`.

  Sedan `supabase gen types`. -- AD-4, AD-5, AD-26
- [ ] `.github/workflows/ci.yml` -- `storage-api` tas bort ur `SUPABASE_EXCLUDE`. `imgproxy` står kvar -- AD-23
- [ ] `src/features/pantry/domain/place-photo.ts` (+ test) -- `placePhotoPath(userId, siteId, location, id, mediaType)`, `placePhotoFolder` (`kyl`, `frys`, `skafferi`), `placePhotoFormSchema` (`site`, `location`, `takenAt`, `reading`, `points` valfritt), `placePhotoPointsSchema` och `clampTakenAt(takenAt, now)` -- AD-26
- [ ] `src/features/pantry/data/photos.ts` (+ test) -- `uploadPlacePhoto`, `savePantryPhotoIn` (anropar `save_pantry_photo`, `MK410` ger `site_gone`), `removePlacePhotoFiles` och `setPlacePhotoPointsIn`. Bara sessionsklienten. Fel blir `PantryDataError` med en orsak utan sökväg -- AD-1, AD-26
- [ ] `src/features/pantry/actions/save-place-photo.ts` (+ test) -- `savePlacePhoto({ image, siteId, location, takenAt, reading, points })`: tar bort metadata, laddar upp, sparar raden, tar bort den nya filen vid fel och den förra efter lyckad rad, `revalidateFor('pantry_photo')`. Returnerar `{ id }` -- FR-37, AD-26
- [ ] `src/features/pantry/actions/save-place-photo-points.ts` (+ test) -- Server Action `savePlacePhotoPoints({ id, points })` med `requireUser()` och Zod. Skriver bara när raden saknar punkter -- FR-37
- [ ] `src/app/api/pantry/photo/route.ts` (+ test) -- `POST` med `isCrossSite`, `requireUserForRoute()`, `readImageForm(request, ["site", "location", "takenAt", "reading", "points"], { maxSide: maxPlacePhotoSide })` och `respond`. Ingen `maxDuration` utöver standard. Testet visar att routen aldrig importerar `src/server/ai` -- AD-2, AD-26
- [ ] `src/lib/errors.ts`, `src/app/api/ai/route-support.ts` (`statusFor`), `src/lib/revalidate.ts` (+ tester) -- `pantry_photo_failed` (500), `pantry_photo_gone` (404), `pantry_photo_remove_failed` (texterna i epic-kontexten) och `pantry_photo` → `/hemma` -- AD-13, AD-18
- [ ] `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-suggestions.tsx` (+ tester) -- per generation: `photoSaved` sätts vid den första lyckade skrivningen, och då skickas fotot med `postAiForm` (eller en egen `postForm`) till `/api/pantry/photo`. Svarets `id` sparas. Kommer punkterna senare anropas `savePlacePhotoPoints` en gång. Ett nytt foto eller "Avbryt" stoppar inte ett startat sparande. Inget fel visas -- FR-37
- [ ] `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `analyzedPhotoNoteText` blir "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något." -- UX-DR22
- [ ] `tests/integration/pantry-photo.test.ts` -- med två användare och två ställen:
  - RLS: en anonym klient och en annan användare kan varken ladda upp under ägarens mapp, läsa, lista eller ta bort ägarens fil, eller läsa och skriva ägarens rad;
  - `save_pantry_photo` ger en rad per plats och lämnar den förra sökvägen, och `MK410` för ett främmande ställe;
  - kaskaden: ett borttaget ställe tar bort sina rader (filerna tas om hand i 10.3);
  - en bild med EXIF och GPS som sparas via `savePlacePhoto` har ingen metadata när den laddas ner.

  -- matrisen, NFR-11
- [ ] `tests/e2e/place-photo-save.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-foto-spara@matkoll.test`, `AI_PROVIDER=mock`, `kyl.png`. Testerna kontrollerar att en bekräftelse sparar en rad och en fil (service role), att fler bekräftelser inte ger fler begäranden, att bara avvisningar inte sparar något, att ett nytt foto ersätter raden och filen, och att fotot sparas på Stugan efter ett byte till Hemma -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): fotot sparas efter den första lyckade skrivningen, inte vid analysen.** Syftet är att kunna kontrollera det som hamnade i lagret. Ett avvisat foto har inte ändrat något, och det ska inte ersätta det foto som lagret bygger på.
- **Beslut (förslag): bilden skickas igen från klienten till en Route Handler.** En Server Action tar högst 1 MB, och gränsen ändras bara under `experimental`. Analysen sparar aldrig (AD-2) och vet inte om något bekräftas. Uppladdningen tar några sekunder på mobilnät och görs i bakgrunden.
- **Beslut (förslag): servern tar alltid bort metadata,** också när klientens canvas redan har gjort det, eftersom en PNG skickas utan omkodning och servern inte kan lita på klienten. `stripJpegMetadata` tar bort APP1–APP15 och COM, alltså också ICC. Färgerna kan skifta lite, vilket inte spelar någon roll för syftet.
- **Beslut (förslag): ny sökväg per foto.** Supabase avråder från att skriva över en fil. En fast sökväg med `upsert` skulle kunna visa det gamla fotot en stund, och policyerna skulle behöva `update`.
- **Beslut (förslag): `takenAt` kommer från klienten** (när analysen startade) men begränsas till det senaste dygnet. Det är tiden Pontus känner igen, inte tiden då den första bekräftelsen gjordes.
- **Risk: Storage i CI.** `supabase start` tar längre tid med `storage-api`. Om det blir för långsamt: behåll `storage-api` bara i jobben `integration` och `e2e`.
- **Risk: Hemma göms mitt i uppladdningen.** Förslagen släpps när Hemma göms (Activity), men en startad `fetch` fortsätter. Testet visar att sparandet inte avbryts av "Avbryt" eller ett nytt foto.
- Loggar innehåller bara felkoder och orsaker, aldrig sökvägar, ställenas namn eller avläsningen.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen, bekräfta ett förslag och kontrollera i Supabase Studio (lokalt) att en fil och en rad finns, att filen inte har EXIF (`exiftool` på den nedladdade filen) och att ett nytt foto ersätter båda. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
