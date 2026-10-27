# Epic 10 Context: Senaste fotot per plats

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Tillägg till 1.1. Det senaste fotot av varje plats (Kyl, Frys och Skafferi, per ställe) sparas privat när det har lett till en ändring i lagret, och kan visas i Hemma med AI:ns avläsning och numren från 6.6. Då kan Pontus i efterhand se om bilden tolkades rätt.

Pontus egna ord, 2026-10-26: "då får vi enklare att se om den tolkat rätt". Pontus valde "Båda": snabbfixen, där fotot visas ovanför förslagen medan Pontus granskar dem (klar, bara i webbläsaren), och den här epicen, där fotot sparas.

Det motsvarar UJ-8 och Flöde 8 i EXPERIENCE.md, och kraven FR-37–FR-39 och NFR-11 i PRD-addendumet ("Tillägg till 1.1: Senaste fotot per plats"). Numren hoppar över FR-34–FR-36, NFR-10, AD-25, UX-DR19–UX-DR20, UJ-7 och Flöde 7, som hör till Epic 9 (vilar på grenen `epic/9-erbjudanden`).

Epicen bygger på det som redan finns:

- förminskningen i klienten (`downscaleImage`, 2048 px och 1,5 MB, Story 6.5) och kontrollen på servern (`readImageForm`);
- `stripJpegMetadata` och `stripPngMetadata` i `src/lib/images.ts`;
- fotot under granskningen (`ReviewPhoto` och `KeptPhoto` i `use-pantry-analysis.ts`) och arket med markörer (`AnalyzedPhotoSheet`, 6.6);
- avläsningen (`reading`) och punkterna (`positions`) från `/api/ai/analyze` och `/api/ai/locate` (`photo-numbers.ts`);
- ställen och FR-33: fotot binds till sitt ställe när det tas (8.4);
- `delete_pantry_site` (8.2), `pantry_lock()` och `revalidateFor` (AD-18).

Epicen har en ny tabell, `pantry_photo`, och en ny privat Storage-bucket, `pantry-photo`, som båda ägs av `pantry`. Arkitekturen står i AD-26, och AD-15 är ändrad. Kursändringen står i `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26-spara-foto.md`.

## Stories

- Story 10.1: Spara senaste fotot per plats
- Story 10.2: Visa senaste fotot i Hemma
- Story 10.3: Gallring och städning av foton

## Bindande beslut: ett foto per plats, bara när det har ändrat lagret

- **AD-15 har ett undantag, och bara ett.** Det senaste fotot av en plats sparas. Foton av kokbokssidor, och i Epic 9 av reklamblad, sparas fortfarande aldrig. Ett sparat foto skickas aldrig till AI-tjänsten igen.
- **Fotot sparas när den första skrivningen från dess förslag har lyckats:** Bekräfta, Rätta, "Bekräfta alla" eller "Ta bort" i inventeringen. Ett foto vars förslag bara avvisas, eller som inte gav några kort, sparas aldrig. Det sparas en gång per foto.
- **Ett foto per plats och ställe.** Ett nytt foto ersätter det förra, både raden och filen.
- **Fotot sparas på det ställe och den plats det togs för** (FR-33, 8.4), också om Pontus har valt ett annat ställe under tiden.
- **Högst 30 dagar.** Ett äldre foto visas aldrig och tas bort.
- **Fotot är privat:** ingen publik och ingen signerad länk. Servern strömmar det efter inloggningskontroll.
- **Ingen metadata:** servern tar bort EXIF, GPS, XMP, ICC och kommentarer innan fotot laddas upp, också när klienten redan har gjort det.
- **Sparandet syns inte och stoppar aldrig lagret.** Misslyckas det visas inget fel.
- **"Töm kylen" tar inte bort fotot.** Ett borttaget ställe och en borttagen användare tar bort sina foton.

## Requirements & Constraints

- **Spara (FR-37):**
  - Bilden är samma förminskade bild som AI:n fick (`KeptPhoto.image`), JPEG eller PNG, högst 2048 px och 1,5 MB.
  - Med bilden sparas tiden då fotot togs, avläsningen (högst 25 etiketter) och punkterna, om de har kommit. Punkter som kommer senare läggs till.
- **Visa (FR-38):**
  - Raden "Senaste foto av kylen: idag 15:42" med textknappen "Visa", direkt under kameraknappen, för vald plats på det ställe Hemma visar.
  - "Visa" öppnar fotoarket från 6.6 med markörerna och avläsningen som numrerad lista.
- **Gallra (FR-39):** 30 dagar, "Ta bort fotot" med kontrollfråga, borttaget ställe och borttagen användare.
- **Integritet (NFR-11):**
  - RLS-tester för bucketen och tabellen.
  - Inga länkar. Ingen metadata (test).
  - Aldrig till AI-tjänsten igen, aldrig i repot, loggar eller säkerhetskopian.
  - Inom Supabase gratisnivå: högst 30 foton på högst 1,5 MB.
- **Plattform:**
  - Allt fungerar från 375 px och på dator, i ljust och mörkt läge och med 200 % textförstoring utan vågrät scroll.
  - Allt är på svenska, och tryckytorna är minst 44 × 44 px. Inget rött.

## Technical Decisions

- **Moduler (AD-1, AD-26):**
  - `pantry` äger `pantry_photo` och bucketen `pantry-photo`. Ingen annan modul läser eller skriver dem.
  - All Storage-kod ligger i `pantry/data/photos.ts` och använder sessionsklienten (`createClient()` från `src/lib/supabase/server`). Service role bara i `scripts/users-sync.mjs` och tester.
  - `pantry/server.ts` exporterar `listPlacePhotos(siteId?)`, memoiserad med React `cache`.
  - Server Actions i `pantry/actions`: `savePlacePhotoPoints`, `removePlacePhoto` och `sweepPlacePhotos`.
  - Route Handlers: `src/app/api/pantry/photo/route.ts` (`POST`, spara) och `src/app/api/pantry/photo/[id]/route.ts` (`GET`, strömma). `POST` är den enda Route Handler som skriver (AD-2).
  - Raden och arket är komponenter i `pantry/ui` och renderas av Hemma.
- **Datamodell (AD-4, AD-5, AD-20, AD-26):**
  - Bucketen skapas i migrationen: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('pantry-photo', 'pantry-photo', false, 1572864, '{image/jpeg,image/png}') on conflict (id) do nothing`.
  - Policyer på `storage.objects` för `authenticated`: `select`, `insert` och `delete`, alla med `bucket_id = 'pantry-photo' and (storage.foldername(name))[1] = (select auth.uid())::text`. Ingen `update`, inget för `anon`.
  - Sökvägen är `<user_id>/<site_id>/<plats>/<foto-id>.<jpg|png>` med platsen `kyl`, `frys` eller `skafferi`. Ny sökväg per foto, `upsert: false`.
  - `pantry_photo`: `id`, `user_id`, `site_id`, `location`, `object_path` (unik), `media_type`, `width`, `height`, `taken_at`, `reading` (jsonb), `points` (jsonb eller `null`), `created_at`.
    - Unik på `(user_id, site_id, location)`.
    - `(site_id, user_id)` refererar `pantry_site (id, user_id)` med `on delete cascade`.
    - `check` på `location`, `media_type`, `reading` (en jsonb-array med högst 25 element) och `points`.
    - RLS med `user_id = (select auth.uid())`, `revoke all` och sedan `grant select, insert, update, delete` till `authenticated` och `service_role`, aldrig `anon`.
  - `save_pantry_photo(site, location, id, object_path, media_type, width, height, taken_at, reading, points)` (`security invoker`, `pantry_lock()`): kontrollerar stället (`MK410` för ett ställe som inte finns eller inte är användarens), byter raden för platsen och lämnar den förra `object_path` eller `null`.
  - Migrationer skapas med `supabase migration new`. Typerna genereras om med `supabase gen types --local --schema public > src/lib/supabase/database.types.ts`. Kör aldrig `supabase db reset`.
- **Spara (10.1):**
  1. Klienten markerar fotot för sparande vid den första lyckade skrivningen från dess förslag och skickar `image`, `site`, `location`, `takenAt`, `reading` och `points` (valfritt) som multipart till `POST /api/pantry/photo`.
  2. Routen gör `isCrossSite`, `requireUserForRoute()` och `readImageForm(request, [...], { maxSide: maxPlacePhotoSide })` och validerar fälten med Zod (`readingSchema`, `locateResultSchema`). `takenAt` som ligger i framtiden eller mer än ett dygn bakåt ersätts med serverns tid.
  3. Metadata tas bort med `stripJpegMetadata` eller `stripPngMetadata`. Ger funktionen `null`, eller är bilden WebP, sparas inget (`pantry_photo_failed`).
  4. Filen laddas upp med `upsert: false` och `contentType`. Sedan anropas `save_pantry_photo`. Misslyckas anropet tas den nya filen bort.
  5. Den förra filen tas bort med `remove`. Misslyckas det loggas bara felkoden, och 10.3:s gallring tar den senare.
  6. Svaret är `{ ok: true, data: { id } }`, så att klienten kan lägga till punkter som kommer senare med `savePlacePhotoPoints({ id, points })`.
  - Ett startat sparande avbryts inte när Hemma göms.
- **Visa (10.2):**
  - `listPlacePhotos(siteId?)` ger `{ photos: PlacePhoto[], needsSweep }`, där `PlacePhoto` har `id`, `location`, `takenAt`, `width`, `height`, `reading` och `points`, bara för foton som är yngre än 30 dagar.
  - `GET /api/pantry/photo/[id]`: `requireUserForRoute()`, läser raden (RLS), avvisar ett foto som är äldre än 30 dagar, hämtar filen med `download` och svarar med radens `media_type`, `Cache-Control: private, no-store` och `X-Content-Type-Options: nosniff`. 404 utan kropp när fotot inte finns eller är någon annans.
  - Arket återanvänder `AnalyzedPhotoSheet` med URL:en till routen och storleken från raden. Markörerna kommer från punkterna, en per nummer i avläsningen (`savedPhotoMarkers`), och listan under fotot har samma nummer.
- **Gallra (10.3):**
  - `sweepPlacePhotos()` tar bort användarens rader som är äldre än 30 dagar, med filer, och filer utan rad. Filerna utan rad hittas med `pantry_photo_orphans()` (`security invoker`), som läser användarens objekt i `storage.objects` (RLS) som saknar rad i `pantry_photo`.
  - Hemma anropar den när `needsSweep` är sant, och `POST /api/pantry/photo` anropar den efter ett sparande.
  - `deletePantrySite` läser ställets sökvägar före `delete_pantry_site` och tar bort filerna efteråt.
  - `scripts/users-sync.mjs --prune` tar bort allt under `<user_id>/` i bucketen innan användaren tas bort.
  - Säkerhetskopian utesluter `storage.objects` och `public.pantry_photo` (`--exclude`), och `scripts/backup-counts.sql` räknar inte `pantry_photo`. `docs/drift.md` säger att fotomigrationen körs igen efter en återställning, eftersom dumpen inte tar med schemat `storage`.
- **Resultat och fel (AD-13):** nya felkoder i `src/lib/errors.ts` med svensk text:

  | Felkod | Text | Visas |
  | --- | --- | --- |
  | `pantry_photo_failed` | "Det gick inte att spara fotot." | Aldrig. Bara i loggen och i svaret till klienten. |
  | `pantry_photo_gone` | "Fotot finns inte längre." | I fotoarket |
  | `pantry_photo_remove_failed` | "Det gick inte att ta bort fotot. Försök igen." | I fotoarket |

  Loggarna innehåller bara felkoder, orsaker och antal, aldrig sökvägar, ställenas namn eller avläsningen.
- **Rendering (AD-18):** `revalidateFor('pantry_photo')` → `/hemma`. `revalidateFor('pantry_site')` gäller redan Hemma.
- **CI (AD-23):** `storage-api` tas bort ur `SUPABASE_EXCLUDE` i `.github/workflows/ci.yml` (10.1).
- **Tester:**
  - Vitest bredvid koden: domänen (tidstexter, markörer, Zod-scheman), routerna, actions och komponenterna.
  - Integrationstester mot lokal Supabase i `tests/integration/pantry-photo.test.ts`: RLS för bucketen och tabellen, `save_pantry_photo`, ersättning, metadata, kaskaden från ett ställe och gallringen.
  - Testbilder är ritade (`scripts/render-pantry-image.mjs`), aldrig foton av ett riktigt hem. En JPEG med EXIF och GPS byggs i testet.
  - E2E-användare, en per spec, i `e2eEmails` i `tests/e2e/support.ts` och `global-setup.ts`:
    - `e2e-foto-spara@matkoll.test` (10.1);
    - `e2e-foto-visa@matkoll.test` (10.2);
    - `e2e-foto-gallra@matkoll.test` (10.3).

## UX & Interaction Patterns

- **Raden Senaste foto (EXPERIENCE.md):**
  - Direkt under kameraknappen, bara när vald plats på det ställe som visas har ett foto som är yngre än 30 dagar.
  - "Senaste foto av kylen: idag 15:42" i `{typography.meta}` och textknappen "Visa" (namn för skärmläsare: "Visa senaste foto av kylen").
  - Ingen miniatyr: fotot hämtas först vid "Visa". Raden annonseras inte när sidan laddas.
- **Fotoarket:**
  - Samma ark som under granskningen: rubriken "Fotot av kylen", passa skärmen eller full storlek vid tryck, och markörerna.
  - Underrubriken "Taget idag 15:42. Numren visar vad AI:n läste av.", eller "Taget idag 15:42." utan punkter.
  - Under fotot "AI:n läste av:" och en numrerad lista med avläsningen.
  - Sist textknappen "Ta bort fotot". Den ersätter arket med frågan "Ta bort fotot av kylen? Det går inte att ångra." och knapparna "Ta bort" och "Avbryt". Efteråt stängs arket, raden försvinner, och den korta bekräftelsen säger "Fotot av kylen är borttaget.".
  - Fokus går tillbaka till "Visa" när arket stängs.
- **Under granskningen:** underrubriken blir "Jämför förslagen med fotot. Det sparas som senaste foto när du bekräftar något.".
- **Tiden:** "idag 15:42", "igår 09:10" eller "24 okt 15:42", i svensk tid (Europe/Stockholm).
- **Texter:** platsen i bestämd form som i 1.0 ("fotot av kylen"). Stället nämns inte, eftersom Hemma redan visar det. AI:n "läste av", den "såg" inget.
- **Allmänt:** fel i en blå `Notice`, aldrig rött. Ark staplas aldrig. Synlig fokusram och logisk tabbordning.

## Cross-Story Dependencies

- **Före epicen:** Epic 8 och Story 6.5–6.6 är klara och ihopslagna i `main` (`1fb46dd`).
- **10.1 före allt annat:** bucketen, policyerna, tabellen, CI och sparandet. Inget syns för Pontus utom underrubriken under granskningen.
- **10.2 efter 10.1:** raden, arket och "Ta bort fotot".
- **10.3 efter 10.2:** gallringen, borttaget ställe, `users:sync`, säkerhetskopian och `docs/drift.md`. 10.1 lämnar filer utan rad om ett ställe tas bort, och 10.3 tar hand om dem.
- **Gren:** `epic/10-spara-foto`, med PR till `main`. Alla sex kontroller och en kodgranskning krävs (AD-23). Planeringsdokumenten för Epic 10 följer med i grenen.
- **Efter epicen:** Pontus provar Flöde 8 på telefonen och svarar på öppna frågor 11–13.
