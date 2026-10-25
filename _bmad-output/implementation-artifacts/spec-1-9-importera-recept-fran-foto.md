---
title: 'Story 1.9: Importera recept från foto'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2571542585e39b675d9f06ad4e11ab9e9c748e89'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Många av Pontus recept finns i kokböcker. Han vill fotografera sidan och få samma förhandsgranskning som för text och länk.

**Approach:** Fliken Foto i arket Importera recept tar en bild med bakre kameran på mobil eller låter Pontus välja en bild på dator. Klienten förminskar bilden till högst 1600 px och 1,5 MB JPEG (AD-15) och skickar den till en egen Route Handler, som kontrollerar bilden och skickar den som `file`-del till `parseRecipe`. Bilden sparas aldrig.

## Boundaries & Constraints

**Always:** Bilden finns bara i minnet under förfrågan; den skrivs aldrig till databas, disk eller logg (AD-15). Servern kontrollerar storlek (högst 1,5 MB) och typ utifrån filens första byte (JPEG, PNG eller WebP), oberoende av vad klienten påstår. Samma kontroller som för `/api/ai/import`: ursprung, behörighet och storleksgräns för hela förfrågan, och ingen skrivning. Resultatet går genom `importRecipe` och `fromAiRecipe` med `{ kind: "photo" }` (AD-10). Avbryt avbryter anropet till modellen. Svensk text från `src/lib/errors.ts`.

**Never:** Ingen lagring av bilden, ingen förhandsvisning av bilden som sparas med receptet (`image_url` förblir tom för foto). Ingen kamera-API utöver filväljaren (`<input type="file" accept="image/*" capture="environment">`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ta foto (mobil) | Fliken Foto, "Fotografera sidan" | Bakre kameran öppnas; bilden förminskas och skickas; "Läser receptet …" och "Avbryt"; sedan förhandsgranskning med källan "Foto av kokbok" | N/A |
| Välj bild (dator) | "Välj bild" | Filväljaren öppnas; samma flöde | N/A |
| Stor bild | 4000 × 3000 px, 6 MB | Klienten skickar en JPEG på högst 1600 px längsta sida och högst 1,5 MB, med rätt orientering | N/A |
| Format som inte går att läsa | Filen kan inte avkodas (t.ex. HEIC på dator) | "Bildformatet stöds inte. Ta en ny bild eller välj en JPEG- eller PNG-bild." | Inget skickas |
| För stor efter förminskning | Över 1,5 MB trots lägre kvalitet | `image_too_large` med texten från `errors.ts` | Inget skickas |
| Servern får för stor eller fel typ | Direkt POST med 2 MB eller en textfil | 413 respektive 415 med `image_too_large` / `validation` | Bilden kastas |
| Inget recept i bilden | `import_no_recipe` från AI-porten | "Det gick inte att tolka svaret. Försök igen eller klistra in texten." med knappen "Klistra in text i stället" | N/A |
| AI otillgänglig | `ai_unavailable` | Samma ruta som för text, med "Försök igen" | Bilden finns kvar i klienten för nytt försök |
| Ej inloggad | POST utan behörig session | 401 `unauthorized` | N/A |

</frozen-after-approval>

## Code Map

- `src/features/recipes/ui/import-sheet.tsx` -- fliken Foto visar "Kommer snart." sedan 1.6; flikarna, Avbryt, felrutor och "Klistra in text i stället" (från 1.8) finns
- `src/app/api/ai/import/route.ts` -- kontroller för ursprung, `Sec-Fetch-Site`, behörighet, innehållstyp och storlek; mönster för den nya routen
- `src/features/recipes/actions/import-recipe.ts` -- `importRecipe` med `kind: "text" | "url"`; lägg till `kind: "photo"` med `image: { data, mediaType }`
- `src/server/ai/service.ts` -- `inputLimits` (`maxImageBytes`, `imageMediaTypes`), `ImageInput`; bilden skickas redan som `file`-del
- `src/lib/ai-client.ts` -- `postAi` för JSON; behöver en variant för `FormData`
- `src/lib/errors.ts` -- `image_too_large` finns; lägg till `image_unsupported` med texten i matrisen
- `tests/fixtures/ai/ugnspannkaka.png` och mockens nyckel för bildbyte -- e2e kan ladda upp fixturen och få ett känt svar

## Tasks & Acceptance

**Execution:**
- [x] `src/features/recipes/ui/downscale-image.ts` (+ test i jsdom med fejkad canvas eller ren beräkning) -- `downscaleImage(file)`: avkoda med `createImageBitmap(file, { imageOrientation: "from-image" })`, skala så att längsta sidan är högst 1600 px, koda som JPEG med sjunkande kvalitet (t.ex. 0,85 → 0,5) tills den är högst 1,5 MB; annars `image_too_large`; avkodningsfel → `image_unsupported`; ren funktion för måttberäkningen med tester -- AD-15
- [x] `src/app/api/ai/import/photo/route.ts` (+ `route.test.ts`) -- POST `multipart/form-data` med fältet `image`; samma ursprungs- och behörighetskontroller som `/api/ai/import`; hela förfrågan högst 2 MB (413); bilden högst 1,5 MB (413, `image_too_large`); typ från filens första byte (415, `validation`); `importRecipe({ kind: "photo", image }, { signal })`; `maxDuration = 120` -- AD-9, AD-15
- [x] `src/features/recipes/actions/import-recipe.ts` -- `kind: "photo"` skickar bilden till `parseRecipe` och mappar med `{ kind: "photo" }`; `import_no_recipe` ger för foto texten i matrisen -- AD-10
- [x] `src/lib/ai-client.ts` -- `postAiForm(path, formData, signal)` med samma resultatform och avbrott som `postAi` -- AD-9
- [x] `src/features/recipes/ui/import-sheet.tsx` -- fliken Foto: knappen "Fotografera sidan" på mobil (`capture="environment"`) och "Välj bild" på dator, förminskning, samma läsläge och felrutor; bilden ligger kvar i klientens minne för "Försök igen" och släpps när arket stängs -- UX
- [x] `src/lib/errors.ts` -- `image_unsupported` -- AD-13
- [x] `tests/e2e/import.spec.ts` (utökad) -- ladda upp `ugnspannkaka.png` → förhandsgranskning med källan "Foto av kokbok"; en stor genererad bild skickas förminskad (kontrollera förfrågans storlek och att bildens längsta sida är ≤1600 px); direkt POST med för stor bild ger 413 och med en textfil 415; reserverade felsvar visar rätt text; 401 utan session -- matrisen
- [x] `README.md` -- avsnitt om fotoimporten och att bilder aldrig sparas -- dokumentation

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given LM Studio igång, when fixturbilden `ugnspannkaka.png` laddas upp lokalt, then visas förhandsgranskningen (manuell kontroll, noteras i Implementation Notes).

## Implementation Notes

- **`image_too_large` fanns inte** i `errors.ts` trots Code Map. Den är tillagd tillsammans med `image_unsupported`, med texten "Bilden är för stor. Ta en ny bild eller välj en mindre bild." (status 413 i `route-support.ts`).
- **PNG som redan ryms skickas oförändrad.** `downscaleImage` kodar om allt annat till JPEG (även små JPEG, så att EXIF-orienteringen alltid tillämpas), men en PNG på högst 1 600 px och 1,5 MB skickas som den är. Annars skulle `ugnspannkaka.png` aldrig nå mocken med sina bytes, och e2e kunde inte få det kända svaret. Typen avgörs av filens första byte, inte av `file.type`.
- **Avkodning:** `createImageBitmap(file, { imageOrientation: "from-image" })` först; om den kastar (t.ex. äldre Safari som inte tar emot värdet) provas `<img>` + `decode()`, som också följer EXIF. Båda misslyckas → `image_unsupported`. Genomskinlig PNG får vit bakgrund före JPEG.
- **Text för `import_no_recipe` vid foto** väljs i `importErrorMessage(error, "photo")` i `recipes/domain/import.ts`, inte i `import-recipe.ts`: klienten (`ai-client.ts`) bygger alltid om texten från koden, så en servertext skulle aldrig synas. `offersPasteTextInstead(code, kind)` ger "Klistra in text i stället" för `import_no_recipe` vid foto.
- **413 för hela förfrågan** svarar `image_too_large` (inte `validation`), eftersom matrisen kräver det för en direkt POST med 2 MB, och bilden är det enda som gör förfrågan så stor.
- **Gemensam routekod:** `isCrossSite`, `readCapped`, `mediaTypeOf`, `respond` och statustabellen flyttades från `/api/ai/import/route.ts` till `src/app/api/ai/route-support.ts`. Bildgränserna och `imageTypeOf` ligger i `src/lib/images.ts`, som både klienten och AI-portens `inputLimits` använder.
- **Mockens reserverade bilder:** `reservedImages` i `tests/fixtures/ai/manifest.json` med fyra enfärgade PNG (`reserved-<kod>.png`), så att e2e kan visa felbeskeden för foto genom hela kedjan.
- **UI:** "Fotografera sidan" visas vid `pointer: coarse` (via `useSyncExternalStore`); på mobil finns "Välj bild" också, som textknapp, för en bild som redan är tagen. Importen startar när bilden är vald (ingen "Tolka"). Ett nytt foto när förhandsgranskningen är ändrad frågar "Släng ändringarna?" som för text. Förhandsgranskningen visar nu källan även för foto ("Källa: Foto av kokbok"); tidigare bara för länk.
- **E2E:** Chrome visar inte innehållet i en filbaserad uppladdning i `postDataBuffer`, så att PNG:n skickas oförändrad och att "Försök igen" skickar samma bild visas via mockens svar (den känner igen bytes). Den stora bilden (4 000 × 3 000 px, EXIF-orientering 6, över 4 MB) görs i webbläsaren och kontrolleras i förfrågan: JPEG, ≤ 1,5 MB, 1 200 × 1 600 px.
- **Efter granskning (iteration 1):** okända byte och oläsbara bildhuvuden ger 415 `image_unsupported` (inte `validation`, som matrisen säger); servern läser också måtten (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X) och avvisar längsta sida över 1 600 + 16 px med 413. Ett avbrutet uppladdande ger 499 med info-logg. Fotots fel har egna texter ("Det gick inte att tolka bilden. …", "AI-tjänsten tog inte emot bilden. …") och knapparna "Försök igen", "Ta en ny bild"/"Välj en annan bild" (fokuserar fotoknappen och öppnar kameran eller filväljaren) och "Klistra in text i stället". Ett nytt foto över en ändrad förhandsgranskning hålls som väntande tills "Släng ändringarna"; ett misslyckat förminskande behåller det tidigare fotot. `downscaleImage` avkodar direkt till målstorleken där webbläsaren kan och ritar annars ned i halveringssteg; minnesfel ger `image_too_large`. `image_unsupported` lyder nu "Bildformatet stöds inte. Välj en JPEG-, PNG- eller WebP-bild."
- **Manuell kontroll med LM Studio (2026-10-25):** dev-server med `AI_PROVIDER=lmstudio` (qwen/qwen3.6-35b-a3b), `ugnspannkaka.png` uppladdad via "Välj bild": förhandsgranskningen visade "Ugnspannkaka med bacon", "Källa: Foto av kokbok" och 7 rader efter 37,7 s.
- Slutverifiering efter granskning: lint, typecheck, 1074 Vitest, 69 integrationstester, build, 86 Playwright (`CI=1`).

## Spec Change Log

## Review Triage Log

| # | Källa | Fynd | Omdöme | Belägg | Väg |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge, verify | Nytt foto ersätter det sparade innan Pontus bekräftat; efter "Fortsätt ändra" går förhandsgranskningen inte att nå; misslyckad förminskning kastar det sparade fotot | medium | `setPhoto(next)` före frågan | patch |
| 2 | verify, blind | "Släng ändringarna" för nytt foto och återgång efter "Fortsätt ändra" testas inte | medium | E2E klickar bara "Fortsätt ändra" | patch |
| 3 | blind, edge | Fototexter och knappar stämmer inte (`ai_invalid`, `import_no_recipe`, `ai_rejected` "kortare text") | medium | `offersPasteTextInstead` | patch |
| 4 | blind | Servern svarar `validation` för okänd bildtyp; `image_unsupported` saknas i statustabellen | medium | `statusFor` | patch |
| 5 | blind | Servern kontrollerar inte bildens mått i pixlar | medium | Direktanrop kan skicka 8000 × 8000 px | patch |
| 6 | blind, edge | Fullupplöst avkodning kan döda fliken; minnesfel visas som "stöds inte" | medium | `createImageBitmap` utan målstorlek | patch |
| 7 | blind | Nedskalning i ett steg utan hög utjämning kan göra text oläslig | medium | `imageSmoothingQuality` saknas | patch |
| 8 | edge | PNG med eXIf-rotation skickas oroterad | low | Direkt korrigering | patch |
| 9 | edge | Avbrott under uppladdning ger 500 och fellogg | medium | `reader.read()` utan felhantering | patch (499) |
| 10 | blind | Snabbvägen för `Content-Length` testas inte | low | `Request` sätter inte rubriken | patch |
| 11 | blind | E2E för "över 1,5 MB" träffar gränsen för hela förfrågan | medium | 2 MB-bild | patch (ca 1,6 MB) |
| 12 | blind | Stor testbild skapas med slumpbrus | low | Kan variera mellan körningar | patch (fast mönster) |
| 13 | blind | `imageTypeOf` saknar enhetstester | medium | Enda typkontrollen på servern | patch |
| 14 | blind | `image_unsupported`-texten nämner kamera på dator och inte WebP | low | Direkt korrigering | patch |
| 15 | edge | Specen säger JPEG men en PNG som ryms skickas oförändrad | low | Dokumenterat avsteg för mockens igenkänning | avvisad |
| 16 | verify | Avbryt under förminskning testas inte | medium (ej verifierad) | Kräver långsammare bild-API i e2e | defer |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
