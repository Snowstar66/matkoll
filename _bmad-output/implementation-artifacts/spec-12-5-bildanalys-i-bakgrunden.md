---
title: 'Story 12.5: Bildanalys i bakgrunden'
type: 'feature'
created: '2026-10-26'
status: 'in-progress'
baseline_commit: 'a3642718540a1b7039656073c84800309bad8a79'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-inventera-en-plats-med-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-6-nummer-pa-fotot.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-4-foto-inventering-och-tomning-per-stalle.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-10-1-spara-senaste-fotot-per-plats.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ett foto av kylen tar 20–65 s att tolka, och numren 6–24 s till. Under tiden står Pontus vid "Tittar på bilden …" och kan inte fotografera frysen. Låset i 6.6 (`ai-runs.ts`) gäller bara i en serverprocess, och en ny analys stoppar allt annat som pågår, också ett AI-förslag.

**Approach:**
- Ett foto blir ett `analyze`-jobb via `POST /api/ai/jobs/photo`. Avläsningen och numren är två steg i samma jobb.
- Ett nytt foto av samma plats på samma ställe ersätter det förra (`superseded`). Foton av andra platser köas.
- Jämförelsen med platsens varor (6.4) görs när resultatet hämtas.
- Fotot finns bara i minnet: på servern medan jobbet väntar och körs, och i klienten tills resultatet stängs.
- `ai-runs.ts`, `/api/ai/analyze` och `/api/ai/locate` tas bort.

## Boundaries & Constraints

**Always:**
- **`POST /api/ai/jobs/photo`** (`maxDuration = 300`): `isCrossSite`, `requireUserForRoute()`, multipart med `image`, `kind` (`analyze`), `clientKey`, `location`, `site` och `takenAt`, `readImageForm` med `maxPlacePhotoSide` som i `/api/ai/analyze`. Förhandskontrollen av stället (`lookUpSite`, 8.4) ger `pantry_site_gone` eller `pantry_unavailable` direkt. Sedan `enqueue_ai_job` med `context: { siteId, location, takenAt }` och 202.
- **`enqueue_ai_job` för `analyze`** gör andra `analyze`-jobb för samma `siteId` och `location` som är i kö, körs eller är klara men inte stängda `superseded` (AD-28). Den vakt som kör ett ersatt jobb avbryter inom 3 s.
- **Arbetet i jobbet:** `analyzePlace` delas i två: avläsningen (AI, matchning mot katalogen, namn) och jämförelsen (`compareWithPlace`). Jobbet kör avläsningen och skriver resultatet `{ site, reading, suggestions, points: null }` med `set_ai_job_result`. Sedan numren (`locateItems`, högst 30 s, samma bild i minnet), som skrivs med `finish_ai_job` (`points` eller `"failed"`). Numren hoppas över (`points: "skipped"`) när ett nyare foto av samma plats väntar eller när mindre än 40 s återstår av funktionens tid. Jobbet är `running` tills numren är klara eller hoppade över.
- **`GET /api/ai/jobs/[id]` för `analyze`** räknar jämförelsen med platsens varor som de är då (`readPlace` och `compareWithPlace`), så att "Nytt", "Ändrat" och "Syns inte längre" stämmer när Pontus öppnar resultatet. Den lagrade avläsningen ändras aldrig.
- **Klienten** (`use-pantry-analysis.ts`): startar jobbet med fotot, behåller fotot i minnet i en butik på layoutnivå per jobb (aldrig `localStorage`, `sessionStorage` eller IndexedDB) tills resultatet stängs eller 30 minuter har gått, och visar per plats "Tittar på bilden … Du kan göra annat under tiden." och "Avbryt", "I kö, 1 före.", korten när avläsningen finns och numren när de kommer. Pontus kan välja en annan plats och fotografera den direkt.
- **Platskortet** för en plats med klara förslag som inte har stängts visar "Förslag klara". Flikmärket och bekräftelsen ("14 förslag från fotot av kylen är klara." med "Visa") gäller Lagersaldo. "Visa" öppnar Lagersaldo på fotots plats. Resultatet räknas som sett när korten har visats.
- **Ställe:** förslagen gäller `context.siteId` som i 8.4, med "Förslagen gäller Stugan." när ett annat ställe är valt, och varje skrivning skickar fotots ställe.
- **Senaste foto (10.1):** skickas med bilden från klientens minne vid första bekräftelsen, som förut. Saknas bilden (efter en omladdning) sparas inget foto, och fotoarket och "Visa fotot" visas inte. Underrubriken säger "Fotot finns inte kvar efter omladdningen.".
- **Stänga:** när alla förslag är bekräftade, avvisade eller behållna, eller när Pontus tar ett nytt foto av platsen, stängs jobbet (`dismissAiJob`) och fotot släpps ur minnet.
- **Låset tas bort:** `src/features/pantry/actions/ai-runs.ts`, `startRun` och `finishRun` i `analyzePlace` och `locatePlaceItems`, och rutterna `src/app/api/ai/analyze/` och `src/app/api/ai/locate/`. `ai_superseded` betyder nu ett ersatt jobb.
- **Loggar:** aldrig fotot, avläsningen eller namn; bara felkod, antal och jobbets id.
- E2E-specen har den egna e2e-användaren `e2e-ai-foto@matkoll.test`. Kör aldrig `supabase db reset`.

**Never:**
- Inget foto i `ai_job`, på disk, i loggar eller i klientens lagring.
- Ingen ny analys eller nya nummer från ett sparat foto (AD-26).
- Ett nytt foto av en plats stoppar aldrig ett jobb för en annan plats eller ett annat slags jobb.
- Ingen ändring av AI-porten, prompterna eller skrivningarna till lagret.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Foto av kylen | Inget annat jobb | 202 inom 1 s; "Tittar på bilden … Du kan göra annat under tiden." | N/A |
| Frysen direkt efter | Kylen pågår | Frysens jobb i kö; "I kö, 1 före." på frysen; jobbraden "· 1 i kö" | N/A |
| Avläsningen klar | Kylens jobb | Korten visas; numren kommer efter; frysens jobb väntar tills numren är klara | N/A |
| Nytt foto av kylen | Förra pågår | Förra `superseded`, avbryts inom 3 s, visas aldrig | N/A |
| Nytt foto av kylen | Förra klart, några kort kvar | Förra `superseded`; de nya förslagen ersätter dem | N/A |
| Ändrat i kylen | Resultatet öppnas efter att Pontus tagit bort mjölken | Jämförelsen räknas mot kylen som den är nu | N/A |
| Annat ställe | Pontus väljer Stugan under analysen | "Förslagen gäller Hemma." och skrivningar till Hemma | N/A |
| Stället borttaget | Före start | Inget jobb | `pantry_site_gone` direkt |
| Omladdning | Kylens resultat klart | Korten visas; inget foto, inget senaste foto sparat | Underrubriken förklarar |
| Lämna Lagersaldo | Pontus i Recept när kylen blir klar | Bekräftelse med "Visa", märket 1 på Lagersaldo | N/A |
| Numren misslyckas | `locateItems` ger fel | Korten utan nummer, inget fel | N/A |
| Ont om tid | Mindre än 40 s kvar efter avläsningen | Numren hoppas över | N/A |
| LM Studio av | – | `failed` med `ai_unavailable` | Meddelanderutan som förut, och "Det gick inte att läsa fotot av kylen." på andra sidor |

</frozen-after-approval>

## Code Map

- `src/features/pantry/actions/analyze-place.ts`, `locate-place-items.ts`, `ai-runs.ts` -- analysen, numren och låset som tas bort
- `src/features/pantry/domain/place-inventory.ts` (`compareWithPlace`, `withoutComparison`), `pantry-suggestion.ts`, `photo-numbers.ts` -- resultatets form
- `src/app/api/ai/analyze/route.ts`, `locate/route.ts`, `route-support.ts` (`readImageForm`) -- det som flyttar till `jobs/photo`
- `src/features/pantry/ui/use-pantry-analysis.ts`, `pantry-suggestion-list.tsx` och platskorten -- klienten
- `src/features/pantry/ui/` -- sparandet av senaste foto (10.1) och fotoarket (6.6, 10.2)
- `src/features/ai-jobs/` och `src/lib/ai-jobs-client.ts` (12.4) -- jobben
- `tests/e2e/` -- specarna för bildanalys, inventering, nummer och senaste foto

## Tasks & Acceptance

**Execution:**
- [x] `src/features/pantry/actions/analyze-place.ts` (+ test) -- avläsningen och jämförelsen var för sig, utan låset, med jobbets signal och tidsgräns
- [x] `src/features/pantry/actions/locate-place-items.ts` (+ test) -- numren som andra steget, utan låset
- [x] `src/features/pantry/actions/ai-runs.ts` -- borttagen
- [x] `src/app/api/ai/jobs/photo/route.ts` (+ `route.test.ts`) -- `analyze`; `src/app/api/ai/analyze/` och `locate/` borttagna
- [x] `src/app/api/ai/jobs/[id]/route.ts` (+ test) -- jämförelsen vid hämtning för `analyze`
- [x] Migration (om `enqueue_ai_job` behöver regeln för `superseded` per plats utöver 12.4) och `tests/integration/ai-job.test.ts`
- [x] `src/features/pantry/ui/use-pantry-analysis.ts` och komponenterna (+ tester) -- jobb per plats, fotot i minnet, "Förslag klara" på platskortet, "Fotot finns inte kvar efter omladdningen."
- [x] `src/features/ai-jobs/ui` och flikmärket -- Lagersaldo och texterna för foton
- [x] `tests/e2e/ai-photo-jobs.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-ai-foto@matkoll.test`, `AI_PROVIDER=mock`, `AI_MOCK_DELAY_MS=3000`: fotografera kylen och frysen efter varandra, se kön, gå till Recept och tillbaka, bekräfta kylens förslag med nummer; ett nytt foto av kylen ersätter det förra
- [x] Befintliga e2e-specar för bildanalys, inventering, nummer och senaste foto uppdateras
- [ ] Mätning mot LM Studio: tid från foto till kort och till nummer, före och efter
- [x] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given `ai_job` och serverns loggar efter e2e-körningen, when de granskas, then finns inget foto, ingen bilddata och ingen avläsning i loggarna, och `context` har bara `siteId`, `location` och `takenAt`.
- Given `grep -rn "ai-runs\|startRun\|/api/ai/analyze\|/api/ai/locate" src`, when den körs, then hittas inget.

## Implementation Notes

- **Beslut (förslag): numren i samma jobb.** Fotot behöver inte skickas två gånger, och kön garanterar att modellen bara gör en sak i taget. Korten visas så fort avläsningen finns, som i 6.6.
- **Beslut (förslag): jämförelsen vid hämtning.** Ett resultat kan vänta i minuter. Att räkna "Syns inte längre" mot lagret när det hämtas undviker att Pontus tar bort något som redan har ändrats.
- **Beslut (förslag): fotot i klientens minne i 30 minuter.** Granskningen och det senaste fotot behöver det. Efter 30 minuter, eller en omladdning, fungerar korten ändå.
- **Risk: minnet i servern.** Ett foto är högst 1,5 MB, och högst tre jobb per användare. Det ryms.
- **Risk: Safari slänger en flik i bakgrunden.** Då laddas appen om, och fotot är borta. Det är samma som en omladdning.
- **Efter Epic 10/11 (sammanslagningen med main 2026-10-28):** senaste fotot sparas med `savePlacePhoto` och numren med `savePlacePhotoPoints` (`pantry/actions/save-place-photo.ts` och `save-place-photo-points.ts`, frÃ¥n klienten via `pantry/ui/place-photo-save.ts` och `POST /api/pantry/photo`), och en sparning gallrar sedan gamla foton (`sweepPlacePhotosIn`, 10.3). Raden "Senaste foto av kylen: … · Visa" och fotoarket finns i `pantry/ui/latest-photo.tsx` och `GET /api/pantry/photo/[id]` (10.2), och "Ta bort fotot" i `remove-place-photo.ts`. Jobbet ska fortsätta att spara fotot och numren den vägen, efter att något har bekräftats. Kategorierna och soptunnorna i Lagersaldo kommer från 11.3, och märket på en lagervara från 11.2 (`pantry-meta.ts`).

## Spec Change Log

- Vid bygget:
  - **Byggd på `a364271`** (`baseline_commit`), epicgrenen efter 12.4, och ihopslagen med 12.6 (`ca4fcb0`). `jobs/photo/route.ts` tar nu båda: `kind` `import` (12.6, `startImportJob`, receptfoto högst 1600 px) och `analyze` (12.5, platsfoto högst 2048 px).
  - **Ingen migration.** `enqueue_ai_job` ersatte redan äldre `analyze`-jobb per ställe och plats i 12.4 (`tests/integration/ai-job.test.ts` prövar det), så databasen och integrationstesterna är orörda.
  - **Jobbets resultat** är avläsningen (`StoredReading` i `pantry/domain/photo-job.ts`): ställe, plats, förslagen utan jämförelse, de ingredienser AI:n namngav (`seen`), om jämförelsen är ofullständig, `reading` och `points` (`null` tills numren är klara, sedan punkterna, `"failed"` eller `"skipped"`). `GET /api/ai/jobs/[id]` kör `compareStoredReading` vid varje hämtning, så "Nytt", "Ändrat" och "Syns inte längre" stämmer mot lagret som det är då, och "nu: …" på kortet likaså. `getAiJob` ger också ett pågående jobbs delresultat, och `count` räknas för ett pågående `analyze`-jobb, så klienten ser att korten finns innan numren är klara.
  - **Numren** körs i samma jobb, högst 30 s, och hoppas över med `"skipped"` när mindre än 40 s återstår av funktionens tid, mindre än 8 s av jobbets egen tid, eller inget kort har någon vara att peka på. "Ett nyare foto väntar" behöver ingen egen kontroll: det nya fotot gör det gamla `superseded` och vakten avbryter det inom 3 s.
  - **Klienten.** `use-pantry-analysis.ts` startar jobbet, tar upp resultat ur jobblistan (också efter att Lagersaldo har lämnats) och hämtar numren när jobbet är slut. Fotot ligger i `pantry/ui/photo-store.ts`, en modulvariabel (aldrig lagring), per jobb i 30 minuter eller tills resultatet stängs. Kameraknappen visar "Tittar på bilden … Du kan göra annat under tiden." och "I kö, 1 före." per plats; platskortet visar "Förslag klara"; efter en omladdning står "Fotot finns inte kvar efter omladdningen." och inget senaste foto sparas. Alla förslag hanterade stänger jobbet (`dismissAiJob`) och släpper fotot.
  - **Avvikelser mot specen:**
    - Pontus ser ett resultat i taget (som förut). Ett resultat för en annan plats från ett foto taget *före* de kort som visas väntar tills de är hanterade (kortet säger "Förslag klara"). Ett foto taget *efter* att korten kom ersätter dem, som förut ("ett nytt foto vinner"), likaså ett foto av samma plats. Spec 12.5 beskriver ett resultat per plats; det skulle kräva att Lagersaldo visade förslag per vald plats, vilket bryter 8.4 ("Förslagen gäller Stugan.").
    - Ett resultat räknas som sett när korten visas, så korten finns inte kvar om Pontus lämnar Lagersaldo och kommer tillbaka efter att jobbet har slutat (som före 12.5). Ett resultat som kommer medan han är borta visas med "Visa" och märke.
    - `AI_MOCK_DELAY_MS` gäller också ett foto som mocken inte känner (inte ett av fallen, inte en reserverad bild), för avläsningen och numren var för sig, så att e2e kan se kön; fotona i fallen (`kyl.png` m.fl.) svarar direkt, så de andra specarna går lika fort som förut. E2E använder `plainPng()` (`support.ts`).
    - E2E: provet "ett uppslag av numren som misslyckas" gick inte att göra i e2e (mocken kan inte låta bara numren misslyckas) och täcks av enhetstest (rutten ger `points: "failed"`, klienten visar korten utan nummer). `ai-runs.ts`, `/api/ai/analyze` och `/api/ai/locate` är borta (`grep` i `src` ger inget); `hasAiRunOnItsWay` är borta ur väckningen, som nu bara läser `ai_job`.
    - Mätningen mot LM Studio gjordes inte (inga anrop mot LM Studio i den här körningen); den står kvar att göra på iPhone enligt "Manual checks".
  - **Prövat:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (rutten, jämförelsen, klienten, mocken, fotolagret), `AI_PROVIDER=mock pnpm build` och e2e för `ai-photo-jobs` (ny, fyra prov: kön, Recept och tillbaka med numren, ersatt jobb, kontext utan foto, omladdning), `pantry-camera`, `pantry-inventory`, `pantry-suggestions`, `empty-place`, `site-photo`, `place-photo-save`, `place-photo-view`, `pantry-image-reading`, `pantry-label`, `pantry-sites`, `import`, `ai-import-jobs`, `ai-jobs` och `ai-warm`. `pantry-inventory` och `pantry-suggestions` tillåter nu "Förslag klara" på platskortet; `ai-import-jobs` använder `toContainText` för bekräftelsen, som har knappen "Visa". Hela e2e-sviten kördes inte här. Ingenting anropade LM Studio.

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone mot LM Studio: fotografera kylen, välj Frys och fotografera frysen, gå till Recept. Två bekräftelser ska komma efter varandra, och Lagersaldo ska få märket 2. Bekräfta något från kylen och se att senaste foto sparas.
- VoiceOver: "I kö, 1 före." och "Förslag klara" läses på rätt plats.
