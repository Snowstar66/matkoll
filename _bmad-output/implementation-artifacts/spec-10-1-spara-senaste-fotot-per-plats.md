---
title: 'Story 10.1: Spara senaste fotot per plats'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_commit: '9c9e6d8fdc71b738ccb2a015431b26872c70a06e'
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
- [x] `supabase/migrations/<tid>_pantry_photo.sql` (via `supabase migration new`):
  - bucketen `pantry-photo` (privat, `file_size_limit` 1572864, `allowed_mime_types` `{image/jpeg,image/png}`, `on conflict (id) do nothing`);
  - policyerna `pantry_photo_select`, `pantry_photo_insert` och `pantry_photo_delete` på `storage.objects` för `authenticated` (AD-26), skrivna så att migrationen kan köras igen (`drop policy if exists` före `create policy`);
  - tabellen `pantry_photo` med `check`, unika nycklar, `(site_id, user_id)` mot `pantry_site (id, user_id)` med `on delete cascade`, RLS, `revoke all` och grants;
  - `save_pantry_photo(...)` (`security invoker`, `pantry_lock()`, `MK410`, lämnar den förra `object_path`) med `grant execute` till `authenticated` och `service_role`.

  Sedan `supabase gen types`. -- AD-4, AD-5, AD-26
- [x] `.github/workflows/ci.yml` -- `storage-api` tas bort ur `SUPABASE_EXCLUDE`. `imgproxy` står kvar -- AD-23
- [x] `src/features/pantry/domain/place-photo.ts` (+ test) -- `placePhotoPath(userId, siteId, location, id, mediaType)`, `placePhotoFolder` (`kyl`, `frys`, `skafferi`), `placePhotoFormSchema` (`site`, `location`, `takenAt`, `reading`, `points` valfritt), `placePhotoPointsSchema` och `clampTakenAt(takenAt, now)` -- AD-26
- [x] `src/features/pantry/data/photos.ts` (+ test) -- `uploadPlacePhoto`, `savePantryPhotoIn` (anropar `save_pantry_photo`, `MK410` ger `site_gone`), `removePlacePhotoFiles` och `setPlacePhotoPointsIn`. Bara sessionsklienten. Fel blir `PantryDataError` med en orsak utan sökväg -- AD-1, AD-26
- [x] `src/features/pantry/actions/save-place-photo.ts` (+ test) -- `savePlacePhoto({ image, siteId, location, takenAt, reading, points })`: tar bort metadata, laddar upp, sparar raden, tar bort den nya filen vid fel och den förra efter lyckad rad, `revalidateFor('pantry_photo')`. Returnerar `{ id }` -- FR-37, AD-26
- [x] `src/features/pantry/actions/save-place-photo-points.ts` (+ test) -- Server Action `savePlacePhotoPoints({ id, points })` med `requireUser()` och Zod. Skriver bara när raden saknar punkter -- FR-37
- [x] `src/app/api/pantry/photo/route.ts` (+ test) -- `POST` med `isCrossSite`, `requireUserForRoute()`, `readImageForm(request, ["site", "location", "takenAt", "reading", "points"], { maxSide: maxPlacePhotoSide })` och `respond`. Ingen `maxDuration` utöver standard. Testet visar att routen aldrig importerar `src/server/ai` -- AD-2, AD-26
- [x] `src/lib/errors.ts`, `src/app/api/ai/route-support.ts` (`statusFor`), `src/lib/revalidate.ts` (+ tester) -- `pantry_photo_failed` (500), `pantry_photo_gone` (404), `pantry_photo_remove_failed` (texterna i epic-kontexten) och `pantry_photo` → `/hemma` -- AD-13, AD-18
- [x] `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-suggestions.tsx` (+ tester) -- per generation: `photoSaved` sätts vid den första lyckade skrivningen, och då skickas fotot med `postAiForm` (eller en egen `postForm`) till `/api/pantry/photo`. Svarets `id` sparas. Kommer punkterna senare anropas `savePlacePhotoPoints` en gång. Ett nytt foto eller "Avbryt" stoppar inte ett startat sparande. Inget fel visas -- FR-37
- [x] `src/features/pantry/domain/pantry-suggestion.ts` (+ test) -- `analyzedPhotoNoteText` blir "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något." -- UX-DR22
- [x] `tests/integration/pantry-photo.test.ts` -- med två användare och två ställen:
  - RLS: en anonym klient och en annan användare kan varken ladda upp under ägarens mapp, läsa, lista eller ta bort ägarens fil, eller läsa och skriva ägarens rad;
  - `save_pantry_photo` ger en rad per plats och lämnar den förra sökvägen, och `MK410` för ett främmande ställe;
  - kaskaden: ett borttaget ställe tar bort sina rader (filerna tas om hand i 10.3);
  - en bild med EXIF och GPS som sparas via `savePlacePhoto` har ingen metadata när den laddas ner.

  -- matrisen, NFR-11
- [x] `tests/e2e/place-photo-save.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-foto-spara@matkoll.test`, `AI_PROVIDER=mock`, `kyl.png`. Testerna kontrollerar att en bekräftelse sparar en rad och en fil (service role), att fler bekräftelser inte ger fler begäranden, att bara avvisningar inte sparar något, att ett nytt foto ersätter raden och filen, och att fotot sparas på Stugan efter ett byte till Hemma -- matrisen
- [x] `docs/beslutslogg.md` -- en post för storyn

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

### Vid bygget

- **Byggd på `9c9e6d8`** (`baseline_commit`), kursändringen för Epic 10.
- **Storage lokalt:** `supabase_storage_matkoll` kördes redan (`[storage] enabled = true`), så stacken behövde varken stoppas eller startas om. Bucketen var tom och fanns inte före migrationen.
- **Migrationen lokalt:** en säkerhetskopia av bara data togs först (`supabase db dump --local --data-only`, utanför repot). Under testlåset kördes `scripts/pantry-site-check.sql` före och efter `supabase migration up --local`. `diff` var tom (94 rader i `pantry_item`), och eftervillkoren håller. Migrationen provades först i en transaktion som rullades tillbaka. `pnpm db:types` gav samma fil två gånger.
- **`save_pantry_photo` har egna namn på parametrarna:** `site`, `place`, `photo_id`, `photo_path`, `photo_type`, `photo_width`, `photo_height`, `photo_taken_at`, `photo_reading` och `photo_points` (valfri). Med kolumnernas namn (`location`, `object_path` …) blir referenserna i PL/pgSQL tvetydiga. Ordningen är epic-kontextens.
- **Två `check` till på `pantry_photo` (avläsningens och punkternas `check` skärptes efter granskningen, se Review Triage Log):** `pantry_photo_object_path_check` låser sökvägen till radens egen användare, ställe, plats (`kyl`, `frys`, `skafferi`) och id med rätt filändelse, så att en rad aldrig kan peka på en annan användares fil. `pantry_photo_size_check` begränsar bredd och höjd till 1–2064 px (`maxPlacePhotoSide` + `imageSideTolerance`). `tests/design/pantry-photo-checks.test.ts` låser migrationens värden (bucketens id, gräns och typer, policyerna, platserna, mapparna, bildtyperna, största sidan och 25) mot domänen.
- **Punkterna:** formulärets fält `points` och `savePlacePhotoPoints` tar `{ positions: [{ n, x, y }] }` (`locateResultSchema`), med högst en punkt per nummer. I formuläret måste varje `n` finnas i avläsningen. Raden sparar listan `[{ n, x, y }]`, eller `null` när den är tom. `savePlacePhotoPoints` skriver bara när raden saknar punkter (`is null`) och revaliderar Hemma bara när den skrev. Efter granskningen skriver den genom `set_pantry_photo_points`.
- **Klienten:** logiken för ett fotos sparande ligger i en egen fil, `pantry/ui/place-photo-save.ts` (`photoSave`, + test), som `usePantryAnalysis` skapar för varje svar med kort och ett ställe (`photoSaver(generation)`). Alla skrivningar från förslagen går genom `save()` i `pantry-suggestions.tsx`, som nu tar generationen, hämtar fotots sparande före anropet och anropar `written()` när svaret är lyckat. En skrivning som lyckas efter att ett nytt fotos förslag har kommit sparar alltså sitt eget foto. Efter granskningen skickas ett sparande som inte fick något svar, eller fick ett serverfel, en gång till vid nästa lyckade skrivning (se Review Triage Log).
- **`takenAt`** sätts när fotot väljs (`analyze`), och `KeptPhoto` bär den, så att "Försök igen" har samma tid.
- **Sparandets anrop** gick vid bygget genom `postAiForm` med en egen signal som ingenting avbryter. Efter granskningen har det en egen fil, `pantry/ui/photo-post.ts` (`postPlacePhoto`, + test), med `AbortSignal.timeout(60_000)` och svarets status. Ett nytt foto, "Avbryt" och att Hemma göms stoppar det fortfarande inte.
- **"Routen importerar aldrig `src/server/ai`":** routen når `savePlacePhoto` genom `@/features/pantry/server` (AD-1), som också exporterar `analyzePlace`. Testet går därför igenom importerna från routen och följer bara `savePlacePhoto`s egen fil där. Det visar att ingen fil på vägen importerar `src/server/ai`. `save-place-photo.test.ts` har också en spion på AI-tjänsten som aldrig anropas.
- **`savePlacePhoto` tar `{ now }`** för testerna och begränsar `takenAt` själv (`clampTakenAt`). `pantry_site_gone` loggas på nivån info, som i 8.4.
- **`statusFor`:** `pantry_photo_failed` 500 och `pantry_photo_gone` 404. Matrisens "WebP" ger efter granskningen `validation` (415) i routen, inte `pantry_photo_failed`. `pantry_photo_remove_failed` hör till en Server Action i 10.2 och har ingen status. Det finns ingen `errors.test.ts`, så texterna låses i `save-place-photo.test.ts`.
- **Testbilder:** `tests/support/image-headers.ts` har `jpegWithMetadata` (EXIF med en GPS-IFD, XMP, ICC och en kommentar, alla med en påhittad position) och `pngWithMetadata` (`tEXt`, `eXIf` och `tIME` i `kyl.png`). Inga foton från `tests/eval/photos/`.
- **E2E:** `removePlacePhotos(userId)` i `tests/e2e/support.ts` tar bort en användares filer med service role. Specen anropar den före varje test och efteråt, och `deleteE2eUsers` anropar den innan e2e-användarna tas bort, eftersom ingen främmande nyckel tar filerna. Det första testet kontrollerar också underrubriken i fotoarket och att punkterna kommer med. Testet med ett nytt foto avvisar först det förra fotots kort, eftersom korten står kvar tills nästa svar kommer: annars kan "Bekräfta" träffa de gamla korten, vars foto redan är sparat (sågs en gång vid en omkörning).
- **Andra e2e-användare sparar nu också foton** när deras specar bekräftar förslag (alltid ritade `kyl.png`). `site-photo.spec.ts` tar bort ställen i `beforeEach`, så deras filer blir kvar utan rad tills `deleteE2eUsers` tar bort dem vid nästa körning (gallringen i 10.3 gör det i appen).
- **Säkerhetskopian** utesluter `storage.objects` och `pantry_photo` först i 10.3. Filerna kommer aldrig med i en databasdump, och säkerhetskopian körs bara från `main`, dit Epic 10 kommer i en PR med alla tre storyna.
- **`docs/oppna-fragor.md`:** den manuella kontrollen ligger under "Att prova på riktig telefon".

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap. Ändringarna i SQL ligger i en andra migration, `pantry_photo_hardening`, eftersom den första redan var körd lokalt.

**Patch:**
- Ordning och oklara utfall:
  - Ett äldre foto ersätter aldrig ett nyare. `save_pantry_photo` svarar `stale` och skriver inget när den lagrade raden för platsen har ett senare `taken_at`, och servern tar bort sin nya fil. Funktionen ger nu `(outcome, previous_path)` och skapades om.
  - Ger `save_pantry_photo` ett annat fel än `MK410` slår servern upp om raden med det nya id:t finns. Finns den, eller går det inte att läsa, står filen kvar och `pantry_photo_unconfirmed` loggas. Annars tas filen bort.
  - Uppladdningen görs först, sedan kontrollerar funktionen stället. Flaggan `committed` och `finally` tar bort den nya filen på varje väg ut som inte sparade raden, också när något annat än `PantryDataError` kastas.
- Klienten:
  - Sparandet har `AbortSignal.timeout(60_000)` i en egen fil, `photo-post.ts`.
  - Efter inget svar eller ett serverfel (5xx) skickas fotot en gång till vid nästa lyckade skrivning från samma förslag. En vägran (4xx, `validation`) är slutgiltig.
  - Fotots id skapas på servern och behålls så. Efter ett förlorat svar finns inget id, och punkter som kommer senare skickas inte. Ett nytt försök tar med punkterna om de har kommit.
- Punkterna och avläsningen:
  - Varje punkts `n` måste höra till en vara i radens avläsning, både i `savePlacePhotoPoints` (som läser avläsningens längd först och ger `validation`) och i SQL (`set_pantry_photo_points`, där villkoret står i samma `update` som `points is null`).
  - `check` med valideringsfunktionerna `pantry_photo_reading_valid` (högst 25 strängar på 1–200 tecken) och `pantry_photo_points_valid` (heltal `n` från 1 till avläsningens längd, högst 25, `x` och `y` 0–1000, ett `n` per punkt).
- Format och storlek:
  - Bara JPEG och PNG sparas. Routen svarar `validation` (415) för WebP innan något görs.
  - Ett avslag från Storage med 401 eller 403 ger `unauthorized`, inte `pantry_photo_failed`.
  - Före `formData()`: en begäran utan `Content-Length`, eller större än `maxImageBytes` plus 64 KB, får 413. Fälten `reading` och `points` får högst 16 KB var innan de tolkas som JSON.
- Rensningen av metadata (`src/lib/images.ts`) är en vitlista:
  - JPEG: SOI, DQT, DHT, DRI, en Huffman-ram (SOF0–3, SOF5–7), varje skanning med sina data och tabellerna mellan progressiva skanningar, och EOI, där den slutar. APP0 bara som ren JFIF utan miniatyr. Alla andra APPn och COM tas bort, också mellan skanningar. Ett segment med längd under 2, eller som når förbi filens slut, och okända segment (aritmetisk kodning, en andra ram) ger `null`.
  - PNG: bara IHDR, PLTE, tRNS, IDAT och IEND, med IHDR först, och inget efter IEND. Ett okänt kritiskt chunk ger `null`.
  - Båda ligger i `try`/`catch`, så att ett undantag betyder "går inte att rensa", och då sparas inget.
  - Nya ritade testbilder: progressiv JPEG med APP1 och COM mellan skanningarna, JPEG med bytes efter EOI (som en video), APP0 med JFIF- och JFXX-miniatyr, PNG med `tEXt`, `eXIf` och bytes efter IEND, och avkortade segment eller segment med längd 0. Integrationstestet laddar ner de sparade filerna och jämför dem byte för byte.
- Bucket och policyer:
  - Bucketen sätts med `on conflict (id) do update` (privat, 1,5 MB, JPEG och PNG).
  - Policyn för uppladdning tar bara den exakta sökvägen `<uid>/<uuid>/(kyl|frys|skafferi)/<uuid>.(jpg|png)`, med användarens eget id först.
  - Den accepterade kvarstående risken står i `docs/beslutslogg.md`: en inloggad användare kan ladda upp en egen fil direkt och gå förbi serverns rensning. Det påverkar bara användarens egna privata data.
- Loggar:
  - Routen fångar allt kring `savePlacePhoto` och loggar bara `{ code, reason: error.name }`.
  - `photos.ts` gör om varje fel från Supabase, också ett som kastas, till `PantryDataError` med en fast orsak, utan meddelandet.
- Nya tester:
  - `setPlacePhotoPointsIn` mot Supabase: första gången `true`, andra gången `false` och oförändrat, en annan användare och en punkt utanför avläsningen `false`;
  - `stale`, både mot funktionen och genom `savePlacePhoto`;
  - `check` för avläsningen och punkterna;
  - policyn för uppladdningens sökväg;
  - ett fel efter commit (enhetstest);
  - fotots sparande för en jämförd bilds Bekräfta och "Bekräfta alla" och för vanliga listans Rätta, var och en med exakt ett anrop och rätt ställe och plats.

**Uppskjutet till 10.3** (en punkt finns i `spec-10-3` under Implementation Notes):
- Filer som blir kvar när ett ställe eller en användare tas bort, eftersom kaskaden bara tar raderna.
- Rekursiv listning med sidor i gallringen och i e2e-städningen.
- Förra filer som inte gick att ta bort. Gallringen hittar dem genom listningen, utan en tabell för filer att ta bort.

**Avvisat:**
- Att spara fotot efter en skrivning vars svar uteblev. Regeln är fortfarande "bara efter en lyckad skrivning".
- Uppladdning med service role. Det är inte tillåtet i appen (AD-4), och den kvarstående risken är accepterad.

**Migrationen lokalt:** en ny säkerhetskopia av bara data togs först, och `scripts/pantry-site-check.sql` kördes före och efter `supabase migration up --local` under testlåset. `diff` var tom (84 rader i `pantry_item`; e2e-körningarna mellan de två migrationerna hade ändrat e2e-användarnas lager), och eftervillkoren håller. Migrationen provades först i en transaktion som rullades tillbaka. `pnpm db:types` gav samma fil två gånger.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen, bekräfta ett förslag och kontrollera i Supabase Studio (lokalt) att en fil och en rad finns, att filen inte har EXIF (`exiftool` på den nedladdade filen) och att ett nytt foto ersätter båda. Läggs på listan "Att prova på riktig telefon" om det inte går att prova nu.
