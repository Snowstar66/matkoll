---
title: 'Story 10.2: Visa senaste fotot i Hemma'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: 'b58da786a99e0344ac5fa7e826bb2e4fb58fab0e'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-1-spara-senaste-fotot-per-plats.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-nummer-pa-fotot.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 10.1 sparas det senaste fotot av varje plats, men Pontus kan inte se det. Det är fotot med AI:ns avläsning och numren som visar om bilden tolkades rätt (FR-38, UJ-8).

**Approach:**
- `listPlacePhotos(siteId?)` i `pantry/server.ts` läser fotonas rader för det ställe Hemma visar, utan bilder.
- Hemma visar "Senaste foto av kylen: idag 15:42" och textknappen "Visa" direkt under kameraknappen när vald plats har ett foto.
- "Visa" öppnar fotoarket från 6.6 med bilden från `GET /api/pantry/photo/[id]`, markörer från de sparade punkterna och avläsningen som numrerad lista.
- "Ta bort fotot" i arket tar bort raden och filen efter en kontrollfråga.

## Boundaries & Constraints

**Always:**
- Raden och arket gäller vald plats (`?plats=`) på det ställe Hemma visar. Fotot hämtas först när Pontus trycker "Visa". Hemma läser bara raderna.
- Bara foton som är yngre än 30 dagar visas, i `listPlacePhotos` och i routen (AD-26).
- `GET /api/pantry/photo/[id]` börjar med `requireUserForRoute()`, läser raden och filen med sessionsklienten (RLS) och svarar med radens `media_type`, `Cache-Control: private, no-store` och `X-Content-Type-Options: nosniff`. Ett foto som inte finns, som är äldre än 30 dagar eller som är någon annans ger 404 utan kropp. Ingen signerad eller publik URL.
- Arket är `AnalyzedPhotoSheet` med samma beteende som i 6.6: passa skärmen eller full storlek vid tryck, markörer som följer med, dolda för skärmläsare, och "Fotot kunde inte visas." när webbläsaren inte kan visa bilden.
- Numren är numren i avläsningen. Varje punkt ger en markör med sitt nummer, och listan "AI:n läste av:" har alla etiketter med samma nummer, också de som saknar punkt.
- Underrubriken är "Taget idag 15:42. Numren visar vad AI:n läste av." med punkter, och "Taget idag 15:42." utan.
- Tiden skrivs av en ren funktion, `photoTimeText(takenAt, now)`, i svensk tid: "idag 15:42", "igår 09:10" eller "24 okt 15:42".
- "Ta bort fotot" ersätter arket med frågan "Ta bort fotot av kylen? Det går inte att ångra." (Ark staplas aldrig). "Ta bort" anropar `removePlacePhoto(id)`, som tar bort raden och filen. Efteråt stängs arket, raden försvinner och den korta bekräftelsen säger "Fotot av kylen är borttaget.".
- Fokus går tillbaka till "Visa" när arket stängs, och till kameraknappen när raden har försvunnit.
- E2E-specen har den egna e2e-användaren `e2e-foto-visa@matkoll.test`.

**Never:**
- Ingen miniatyr på raden och ingen förhandshämtning av bilden.
- Ingen ny analys och inga nya nummer från ett sparat foto. Bilden skickas aldrig till AI-tjänsten.
- Inget foto från ett annat ställe än det Hemma visar.
- Ingen "Ångra" för borttagningen.
- Avläsningen visas som text, aldrig som HTML.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Foto av kylen idag | Hemma, Kyl vald, foto taget 15:42 idag | Under kameraknappen: "Senaste foto av kylen: idag 15:42" och "Visa" | N/A |
| Igår och tidigare | Foto taget igår 09:10, och ett 24 okt 15:42 | "igår 09:10" och "24 okt 15:42" | N/A |
| Ingen bild | Frysen har inget foto | Ingen rad för frysen | N/A |
| Byt plats | Kyl har foto, Pontus väljer Frys | Raden försvinner (eller visar frysens foto) | N/A |
| Byt ställe | Stugan vald med foto av kylen, Pontus väljer Hemma | Raden visar hemmets kylfoto, eller ingen rad | N/A |
| Visa | "Visa" | Arket "Fotot av kylen" med fotot, underrubriken med tiden, markörer och "AI:n läste av:" med numrerad lista | N/A |
| Utan punkter | Fotot sparades utan punkter | Inga markörer, underrubriken "Taget idag 15:42." och listan | N/A |
| Delvis punkter | 20 etiketter, 18 punkter | 18 markörer, 20 rader i listan | N/A |
| Full storlek | Tryck på fotot | Växlar till full storlek, och markörerna följer med | N/A |
| Fotot är borta | Fotot togs bort på en annan enhet | "Fotot finns inte längre." i arket. Raden försvinner när Hemma läses om | `pantry_photo_gone` (404) |
| Webbläsaren kan inte visa bilden | `onError` på bilden | "Fotot kunde inte visas.", inga markörer | N/A |
| Ta bort | "Ta bort fotot", sedan "Ta bort" | Raden och filen tas bort, arket stängs, "Fotot av kylen är borttaget." | N/A |
| Avbryt borttagningen | "Ta bort fotot", sedan "Avbryt" | Fotoarket visas igen | N/A |
| Borttagningen misslyckas | Storage nås inte | Fotot står kvar, och "Det gick inte att ta bort fotot. Försök igen." står i arket | `pantry_photo_remove_failed` |
| Utan inloggning | `GET /api/pantry/photo/<id>` utan session | 401 utan bild | `unauthorized` |
| Annans foto | En annan användares id | 404 utan bild | `pantry_photo_gone` |
| För gammalt | Ett foto som är 31 dagar gammalt | Ingen rad, och routen ger 404 | `pantry_photo_gone` |
| Inte ett id | `GET /api/pantry/photo/abc` | 404 | `validation` ger 404, inte 400, så att inget avslöjas |
| Svarshuvuden | Ett foto som finns | `Content-Type: image/jpeg`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` | N/A |
| Skärmläsare | VoiceOver på raden | "Senaste foto av kylen: idag 15:42", "Visa senaste foto av kylen, knapp" | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-10-context.md` -- texter, felkoder och routerna
- `spec-10-1-…md` -- tabellen, `pantry/data/photos.ts`, `place-photo.ts` och felkoderna
- `spec-6-6-nummer-pa-fotot.md` (med Review Triage Log) -- `AnalyzedPhotoSheet`, markörernas placering och ramen med fotots storlek
- `src/features/pantry/ui/analyzed-photo.tsx` (+ test) -- arket och markörerna
- `src/features/pantry/domain/photo-numbers.ts` (`photoMarkers`, `PhotoMarker`, `maxPointCoordinate`), `domain/pantry-suggestion.ts` (`analyzedPhotoTitle`, `analyzedPhotoErrorText`)
- `src/features/pantry/ui/pantry-place.tsx`, `pantry-camera.tsx` -- var raden står
- `src/app/(app)/hemma/home-content.tsx`, `home-place.tsx` -- läsningen i Hemma
- `src/features/pantry/server.ts` -- memoiserade läsningar
- `src/components/sheet.tsx`, `src/components/notice.tsx` -- ark och meddelanderuta
- `src/app/api/ai/route-support.ts` (`respond`) -- svarsformen
- `tests/e2e/pantry-camera.spec.ts`, `site-photo.spec.ts` -- mönster

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/domain/place-photo.ts` (+ test) -- `photoTimeText(takenAt, now)` i Europe/Stockholm, `latestPhotoText(location, time)` ("Senaste foto av kylen: idag 15:42"), `latestPhotoOpenLabel(location)`, `photoTakenText(time, hasPoints)`, `photoReadingHeading` ("AI:n läste av:"), `removePhotoQuestion(location)`, `removedPhotoText(location)` och `savedPhotoMarkers(points, reading)` (en markör per punkt med numret som etikett, procent av bredd och höjd, bara nummer som finns i avläsningen) -- UX-DR22
- [x] `src/features/pantry/data/photos.ts` (+ test) -- `loadPlacePhotosIn(db, siteId, now)` med raderna yngre än 30 dagar, `loadPlacePhotoIn(db, id, now)` och `downloadPlacePhoto(db, path)` -- AD-26
- [x] `src/features/pantry/server.ts` (+ test) -- `listPlacePhotos(siteId?)` med React `cache`. Ett läsfel ger inga foton och loggas med felkod, och Hemma visas ändå -- FR-38
- [x] `src/app/api/pantry/photo/[id]/route.ts` (+ test) -- `GET` enligt matrisen. Läser `params` enligt Next.js 16 (`node_modules/next/dist/docs/`) -- AD-26, NFR-11
- [x] `src/features/pantry/actions/remove-place-photo.ts` (+ test) -- `removePlacePhoto(id)`: `requireUser()`, Zod, tar bort raden och sedan filen med `remove`, `revalidateFor('pantry_photo')`. En rad som redan är borta ger `ok` -- FR-39
- [x] `src/features/pantry/ui/latest-photo.tsx` (+ test) -- raden och arket. Arket använder `AnalyzedPhotoSheet` med URL:en `/api/pantry/photo/<id>`, storleken från raden och `savedPhotoMarkers`, och får en ny valfri plats för innehåll under fotot (listan och "Ta bort fotot") och en egen underrubrik. Svarar routen 404 visas `pantry_photo_gone`-texten -- UX-DR21
- [x] `src/features/pantry/ui/analyzed-photo.tsx` (+ test) -- `AnalyzedPhotoSheet` får `subtitle` och `children` som valfria props. Granskningen ser ut som förut
- [x] `src/features/pantry/ui/pantry-place.tsx`, `src/app/(app)/hemma/home-content.tsx` (+ tester) -- raden direkt efter `PantryCamera`, med fotot för vald plats
- [x] `tests/integration/pantry-photo.test.ts` (utökad) -- `loadPlacePhotosIn` ger bara egna, yngre foton. `downloadPlacePhoto` med en annan användares session ger inget
- [x] `tests/e2e/place-photo-view.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-foto-visa@matkoll.test`. Service role seedar ett ställe, ett foto (ritad bild) av kylen med avläsning och punkter, och ett utan punkter. Testerna kontrollerar raden, arket med markörer och lista, bytet av plats och ställe, svarshuvudena, 404 för en annan användares id och "Ta bort fotot" med frågan och bekräftelsen -- matrisen
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): raden står under kameraknappen, inte på platskortet.** Platskortet har redan ikon, namn och antal, och raden hör ihop med att fotografera. Platskorten är lika för alla platser.
- **Beslut (förslag): ingen miniatyr.** En miniatyr skulle hämta upp till 1,5 MB varje gång Hemma visas. En förminskad kopia vore ett andra sparat foto.
- **Beslut (förslag): listan med avläsningen står under fotot,** eftersom det inte finns några kort att para ihop numren med efteråt. Numren är desamma som under granskningen, där ett kort har numret för sin första vara.
- **Beslut (förslag): `validation` ger 404 i `GET`,** så att routen svarar likadant för ett påhittat id, ett borttaget foto och en annan användares foto.
- **Beslut (förslag): "Ta bort fotot" har en kontrollfråga och ingen "Ångra",** eftersom filen inte går att få tillbaka (Interaction Primitives).
- **Risk: `<img>` mot routen.** Kakorna skickas med en `<img>` på samma sajt, så inloggningen fungerar. Ett svar med 401 eller 404 ger `onError`, och arket visar då texten för ett foto som inte finns.
- Loggar innehåller bara felkoder, aldrig fotots id, sökvägar eller avläsningen.

## Spec Change Log

### Vid bygget

- **Byggd på `4ceb250`** (den första `baseline_commit`), där Story 10.1 är klar. Ingen migration behövdes.
- **Förslagen godkändes som de står** (Claude, headless enligt `docs/autonomi.md`): raden under kameraknappen, ingen miniatyr, listan under fotot, `validation` ger 404 och en kontrollfråga utan "Ångra".
- **`listPlacePhotos(siteId?)`** ger `{ photos }`, som epic-kontexten säger, så att 10.3 kan lägga till `needsSweep` i samma svar. Den går genom `placeToRead` som de andra läsningarna, och ett ställe som är borta eller ett läsfel ger inga foton och loggas som `pantry_photos_unavailable` med orsaken. Åldern räknas från `taken_at`. En rad som inte klarar `placePhotoRowSchema` hoppas över.
- **Tiden skrivs på servern** i `HomeContent` (`photoTimeText(photo.takenAt, new Date())`) och skickas som text till klienten, så att servern och webbläsaren aldrig skriver olika tider. Raden visas också i grenen där lagret inte gick att läsa, direkt efter kameraknappen.
- **Routen läser genom `readPlacePhotoImage(id)` i `pantry/server.ts`**, som läser raden (`loadPlacePhotoIn`) och sedan filen (`downloadPlacePhoto`) med sessionsklienten. Filen hämtas som en `Blob` (högst 1,5 MB) och skickas med `Content-Length`, så att ett fel från Storage blir ett svar utan bild i stället för en avbruten ström. Ett läsfel ger 503 utan kropp och loggas som `pantry_photo_unavailable` med orsaken. 401 utan session kommer från `requireUserForRoute()` som i 10.1. `params` läses med `RouteContext<"/api/pantry/photo/[id]">`.
- **`downloadPlacePhoto` ger `null` för Storage-svarets 404** (i kroppen, ibland som HTTP 400). Integrationstestet visar att en annan användares session, en anonym klient och en fil som saknas alla ger `null`.
- **`AnalyzedPhotoSheet`** fick också `alt` och `errorText` som valfria props, utöver `subtitle` och `children`: alt-texten under granskningen ("som förslagen kommer från") stämmer inte för ett sparat foto, som heter "Senaste fotot av kylen". `photo` tar bara `url` och `size`. Granskningen ser ut som förut (nytt test, `analyzed-photo.test.tsx`).
- **"Fotot finns inte längre."**: en `<img>` ser inte svarets status. När bilden inte går att visa frågar arket routen en gång med `HEAD` (Next.js svarar på `HEAD` med `GET`-hanteraren utan kropp). 404 ger `pantry_photo_gone`-texten, allt annat "Fotot kunde inte visas.". Avvikelse från risken i Implementation Notes: 401 (utgången session) ger "Fotot kunde inte visas.", inte texten för ett foto som inte finns, eftersom fotot finns kvar. Varje "Visa" ger fotot ett nytt försök (arket nycklas på fotots id och antalet öppningar).
- **Borttagningen:** `deletePlacePhotoRowIn` tar bort raden och ger sökvägen (`delete … returning`), sedan tas filen bort med `removePlacePhotoFiles`. Matrisens "Storage nås inte" tolkas som att raden inte går att ta bort: då står fotot kvar och `pantry_photo_remove_failed` visas i frågan. Är raden borttagen men inte filen är fotot borta för Pontus, orsaken loggas (`pantry_photo_remove_failed`, `left: "file"`) och svaret är `ok`. Filen blir då en fil utan rad, som gallringen i 10.3 tar, som den förra filen i 10.1. `revalidateFor('pantry_photo')` anropas också när raden redan var borta, så att Hemma tappar raden.
- **Frågan** är ett eget ark med rubriken "Ta bort fotot", frågan, "Ta bort" (primär, "Tar bort …" medan den väntar) och "Avbryt" i huvudet med fokus, som i "Töm kylen". "Avbryt", Esc och tryck utanför visar fotoarket igen. Efter borttagningen göms raden direkt i klienten, innan sidan har lästs om, och kameraknappen får fokus.
- **Listan med avläsningen** är en `<ol>` där varje rad har numret som en rund siffra (samma utseende som kortens nummer, dold för skärmläsare) och numret som text för skärmläsare, så att listan läses i nummerordning. Etiketterna är text.
- **E2E:** `place-photo-view.spec.ts` seedar Hemma (vald) och Stugan, ett foto av hemmets kyl med punkter, ett av hemmets skafferi utan punkter, ett av stugans kyl och ett av stugans frys från 31 dagar sedan. Den andra användarens foto seedas för `utanfor@matkoll.test` på ett eget ställe som tas bort efteråt, så att inget annat av den användarens data rörs. `request.newContext()` ärver specens `storageState`, så testet utan session ger det en tom `storageState`.
- **`docs/oppna-fragor.md`:** de manuella kontrollerna ligger under "Att prova på riktig telefon".
- **Kontroller (snabbare loop enligt Pontus):** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` och `AI_PROVIDER=mock pnpm build`, och bara de berörda e2e-specarna under testlåset (`place-photo-view`, `place-photo-save`, `pantry`, `pantry-camera`, `pantry-suggestions`, `pantry-inventory`, `pantry-image-reading`, `site-photo`, `empty-place`, `pantry-sites`). Hela e2e-sviten körs i CI.

### Vid bygget på Epic 11 (2026-10-27)

Storyn pausades efter det första bygget (`bb7f9f8` på `story/10-2`, aldrig granskad) tills det nya utseendet var klart. Den byggdes sedan om på `epic/11-nytt-utseende` (`b58da78`, ny `baseline_commit`) på grenen `story/10-2-v2`. Beteendet, routen, borttagningen och felkoderna är desamma. Det här ändrades:

- **Sidan heter Lagersaldo** (10.4). Adressen är fortfarande `/hemma`, och texterna i Intent och matrisen ovan säger Hemma eftersom de är frysta. Kommentarer, beslutsloggen och den manuella kontrollen säger Lagersaldo där de menar sidan. Inga synliga texter i storyn nämnde sidan, så ingen text i appen ändrades.
- **Raden ser ut som i skissen `lagersaldo.html`:** "Senaste foto av kylen: idag 15:42 · Visa", centrerad direkt under "Fotografera kylen" och före "Sök i kylen" (11.3). Förut stod texten och textknappen "Visa" vänsterställda i radens bredd. Texten är `text-meta` i `ink-2`, inte `ink-3` som i skissen, eftersom raden ligger på sidans bakgrund där `ink-3` bara når 4,3:1 (DESIGN.md, Färger). Punkten är bara för ögat (`aria-hidden`), så skärmläsaren läser raden och sedan "Visa senaste foto av kylen, knapp" som förut. "Visa" är en egen knapp i metastorlek och halvfet accentfärg med 44 px tryckyta, eftersom `Button` med `variant="text"` har radrubrikens storlek. Raden ligger närmare kameraknappen (`-mt-5 -mb-3`), så att tryckytan inte skjuter isär kameraknappen och sökfältet. Vid 200 % text (187 px bredd) radbryts "Visa" till en egen rad, centrerad.
- **Avläsningen i arket** har "AI:n läste av:" som sektionsetikett (`text-section-label`, versaler i `ink-2`), som kategorirubrikerna i Lagersaldo, i stället för en radrubrik. Listan har hårfina avdelare mellan raderna som en listgrupp (`divide-hairline`), utan eget kort eftersom arket redan är vitt, och heter "AI:n läste av:" för skärmläsare (`aria-labelledby`). Den är fortfarande en `<ol>`, med `role="list"` som `ListGroup`, så att VoiceOver i Safari behåller listan. `ListGroup` och `ListRow` användes inte: `ListGroup` är en `<ul>`, och `ListRow` är minst 56 px hög med plats för en kontroll, vilket gör 20 rader med bara text onödigt långa.
- **"Ta bort fotot" frågar först**, som förut, och det står nu i koden och beslutsloggen varför: soptunnorna i Lagersaldo tar bort direkt med "Ångra" (11.3), men ett borttaget foto går inte att få tillbaka (DESIGN.md: kontrollfråga bara när det inte går att ångra). Frågan är samma ark som "Töm kylen" i det nya utseendet.
- **Tester:** enhetstestet kontrollerar att punkten är dold för skärmläsare och att listan heter "AI:n läste av:". E2E kontrollerar att "Visa" har minst 44 × 44 px och letar upp listan med sitt namn. `openHemma` heter `openLagersaldo`.
- **Konflikter vid överflyttningen** fanns bara i `pantry-place.tsx` (kommentaren, där 11.3 lade till sökfältet), `tests/e2e/support.ts` och `global-setup.ts` (nya e2e-användare i 11.2–11.4) och i dokumenten. `home-content.tsx` slogs ihop utan konflikt.
- **Kontroller:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (4487), `pnpm test:integration` (458) och `AI_PROVIDER=mock pnpm build`, och under testlåset de berörda e2e-specarna (`place-photo-view`, `place-photo-save`, `pantry`, `pantry-camera`, `pantry-suggestions`, `pantry-inventory`, `pantry-image-reading`, `site-photo`, `empty-place`, `pantry-sites`, `pantry-look`, `pantry-label`): 79 gick igenom, och ett test i `pantry-label` ("Ta bort and Ångra …") var instabilt när fem arbetare körde samtidigt (`pantry_restore_failed 23505`). Det rör inte fotot, och `pantry-label` och `place-photo-view` gick igenom tre gånger i rad med en arbetare.

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: fotografera kylen mot LM Studio, bekräfta något, ladda om Hemma och tryck "Visa". Markörerna ska sitta på samma varor som under granskningen, och listan ska ha samma nummer.
- VoiceOver: raden och "Visa senaste foto av kylen" läses, markörerna hoppas över, och listan läses i nummerordning.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raden, listan och knapparna radbryts utan vågrät scroll.
