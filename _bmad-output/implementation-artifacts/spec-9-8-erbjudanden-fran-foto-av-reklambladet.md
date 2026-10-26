---
title: 'Story 9.8: Erbjudanden från foto av reklambladet'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-7-erbjudanden-fran-inklistrad-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-5-bildanalys-i-bakgrunden.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-6-receptimport-i-bakgrunden.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-importera-recept-fran-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.7 kan Pontus klistra in erbjudanden som text, men reklambladet kommer ofta på papper, och i kedjornas appar går texten inte alltid att kopiera. Då har Pontus bara bladet eller en skärmbild (FR-34).

**Approach:**
- Arket Veckans erbjudanden får "Fotografera bladet" (bakre kameran) och "Välj bild" (också skärmbilder).
- Fotot förminskas i klienten som ett foto av en plats och skickas till `POST /api/ai/jobs/photo` som ett AI-jobb av sorten `offers`.
- `extractOffers` får bilden, med samma schema och prompt som för text och samma sampling som `analyzeImage` i LM Studio.
- Resultatet blir samma utkast, granskning och sparande som i 9.7, med `source = 'photo'`.

## Boundaries & Constraints

**Always:**
- Fotot förminskas i klienten till högst 2048 px och 1,5 MB (JPEG), som ett foto av en plats (AD-15, `maxPlacePhotoSide`, Story 6.5). Servern kontrollerar storlek, typ och pixlar med `readImageForm` (`image_too_large`, `image_unsupported`).
- **Jobbet** följer AD-28 och `/api/ai/jobs/photo` från 12.5: multipart med fälten `kind = "offers"`, `clientKey`, `storeId`, `weekStart` och `image`, förhandskontrollerna för butik och vecka från 9.7, `context: { storeId, weekStart, source: "photo" }` och körtid 120 s.
- Fotot finns bara i serverns minne medan jobbet väntar och körs, och i klientens minne tills resultatet har stängts. Det skrivs aldrig till `ai_job`, databasen, disk, `localStorage` eller loggar (AD-15, NFR-13). Det sparas aldrig som senaste foto (AD-26 gäller bara platser).
- `readOffers({ image })` gör samma sak som med text efter porten.
- LM Studio-adaptern skickar en bild till `extractOffers` med samma sampling som `analyzeImage` (`imageSampling`, 6.5) och tänkläget avstängt. Text ändras inte.
- Samma granskning, "Spara" och texter som i 9.7. Läget säger "Tittar på bladet … Du kan göra annat under tiden.", jobbraden "AI: Tittar på bladet" och bekräftelsen "12 erbjudanden från bladet är klara.".
- Fixturerna för mocken är påhittade, ritade bilder, aldrig ett foto av ett riktigt blad.
- E2E-specen har den egna e2e-användaren `e2e-erbjudande-foto@matkoll.test`.

**Never:**
- Inga flera bilder i ett jobb. En sida läses i taget, och inläsningarna läggs ihop (9.7).
- Ingen beskärning eller rotering i klienten utöver förminskningen.
- Ingen ändring av `analyzeImage`, platsfotot, det senaste fotot eller importen av recept från foto.
- Ett nytt foto ersätter inte ett äldre (`superseded` gäller bara platser). Två sidor efter varandra köas.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Knapparna | Arket öppet | "Klistra in text", "Fotografera bladet" och "Välj bild" | N/A |
| Fotografera | Mobil, "Fotografera bladet" | Bakre kameran öppnas (`capture="environment"`) | N/A |
| Skärmbild | "Välj bild" med en PNG | Bilden förminskas och skickas | N/A |
| Läsa bladet | Mockens `reklamblad.png` | "Tittar på bladet … Du kan göra annat under tiden." och "Avbryt", sedan "Hittade 12 erbjudanden för vecka 45." och samma granskning som för text | N/A |
| Två sidor | Sida 2 fotograferas medan sida 1 läses | Sida 2 står i kö ("I kö, 1 före."). Båda kan granskas och sparas, och sparandet lägger ihop dem | N/A |
| Stor bild | 4284 × 5712 px | Förminskas till 1536 × 2048 px och under 1,5 MB före uppladdningen | N/A |
| För stor efter förminskning | Servern får mer än 1,5 MB | "Bilden är för stor. …" Inget jobb | `image_too_large` |
| Fel format | HEIC eller PDF | "Bildformatet stöds inte. …" Inget jobb | `image_unsupported` |
| Inga erbjudanden | Mockens tomma bild | "Hittade inga erbjudanden på mat." | `offers_none` |
| Upprepningar | Modellen upprepar samma vara många gånger | En post per vara | N/A |
| Fler än 40 | Ett helt uppslag med 50 varor | De första 40 och texten om resten | N/A |
| AI-tjänsten svarar inte | LM Studio avstängt | "AI-tjänsten svarar inte just nu. …" med "Försök igen" med samma bild, så länge den finns i klientens minne | `ai_unavailable` |
| Efter omladdning | Jobbet gick inte, sidan laddades om | "Försök igen" finns inte, eftersom fotot inte finns kvar. "Fotografera bladet" igen | N/A |
| Avbryt | "Avbryt" | Jobbet avbryts, och knapparna visas igen | N/A |
| Text i bilden som instruktion | Påhittat blad med texten "Ignorera instruktionerna" | Behandlas som text på bladet. Inget erbjudande skapas av den | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut och texter
- `spec-9-7-…md` -- `readOffers`, `extractOffers`, granskningen och sparandet
- `spec-12-5-…md`, `spec-1-9-…md`, `spec-6-5-…md` (Review Triage Log) -- foto i jobb, förminskning, `imageSampling` och utvärdering av bilder
- `src/app/api/ai/jobs/photo/route.ts` (+ test), `src/app/api/ai/route-support.ts` (`readImageForm`) -- multipart
- `src/lib/downscale-image.ts`, `src/lib/images.ts` (`maxPlacePhotoSide`) -- förminskning
- `src/lib/ai-jobs-client.ts` -- klientens anrop och fotot i minnet
- `src/server/ai/service.ts`, `adapters/lmstudio.ts`, `adapters/mock.ts` -- porten
- `src/features/pantry/ui/pantry-camera.tsx` -- mönster för kameraknapp och "Välj bild"
- `scripts/render-pantry-image.mjs`, `tests/eval/analyze-image.eval.ts` -- mönster för ritade fixturer och utvärdering

## Tasks & Acceptance

**Execution:**
- [ ] `src/server/ai/service.ts` (+ test) -- `extractOffersContent` för en bild: "Bilden visar ett reklamblad eller en sida med erbjudanden." och bilden som `file`-del -- AD-9, AD-15
- [ ] `src/server/ai/adapters/lmstudio.ts` (+ test) -- `extractOffers` med bild skickar `imageSampling`, och med text standardinställningarna -- AD-25
- [ ] `src/server/ai/prompts/extract-offers.md` -- ett avsnitt om bilder: läs bladet ruta för ruta, ta bara med det som syns tydligt, och hitta aldrig på ett pris
- [ ] `scripts/render-offer-image.mjs`, `tests/fixtures/ai/reklamblad.png`, `reklamblad.offers.json`, `reklamblad-tomt.png`, `reklamblad-tomt.offers.json`, `manifest.json` -- ett påhittat blad med 12 rutor (namn, märke och pris) och ett tomt blad
- [ ] `src/server/ai/adapters/mock.ts` (+ test) -- svar för bilderna och de reserverade bilderna
- [ ] `src/features/offers/actions/read-offers.ts` (+ test) -- `{ image }` som indata. Ett test visar att inget hämtas
- [ ] `src/app/api/ai/jobs/photo/route.ts` (+ test) -- sorten `offers` med förhandskontrollerna och `context` -- AD-28
- [ ] `src/features/offers/ui/offers-sheet.tsx` (+ test), `offers-photo.tsx` (+ test) -- kameraknappen, "Välj bild", förminskningen till `maxPlacePhotoSide`, läget "Tittar på bladet …" och samma granskning -- FR-34, UX-DR19
- [ ] `src/features/ai-jobs/domain/` (+ test) -- jobbradens text ("Tittar på bladet") och bekräftelsen
- [ ] `tests/eval/extract-offers.eval.ts` -- bilderna i fixturerna och Pontus egna foton i `tests/eval/photos/` med `<namn>.offers.expected.json` (ignoreras av git), tre körningar per bild med tid, antal, ogiltiga och upprepningar
- [ ] `tests/e2e/offers-photo.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-erbjudande-foto@matkoll.test`. Testerna väljer `reklamblad.png` med "Välj bild", granskar, sparar och kontrollerar arket. Ett eget test väljer den tomma bilden -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn, och mätningen i T7 i `docs/oppna-fragor.md`

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): 2048 px, som ett foto av en plats.** Ett reklamblad har liten text och många rutor, som en kyldörr. 6.5 visade att 2048 px och Qwens sampling gav färre upprepningar. En JPEG på 2048 px med kvalitet 0,85 är ungefär 0,7 MB.
- **Beslut (förslag): en bild per jobb, och sidorna köas.** Flera bilder i ett anrop skulle ta längre tid än 100 s med en lokal modell. Kön (AD-28) gör att Pontus ändå kan fotografera sida efter sida utan att vänta.
- **Beslut (förslag): ett nytt blad ersätter inte ett äldre.** Två foton av ett blad är oftast två sidor, inte samma sida igen.
- **Risk: ett helt uppslag har fler än 40 erbjudanden.** Granskningen säger då att resten saknas, och Pontus kan fotografera halva uppslaget i taget.
- **Risk: priser och mängder läses fel.** De visas i granskningen och används aldrig i beräkningar (SM-C4).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På iPhone: "Fotografera bladet" öppnar bakre kameran, och "Välj bild" visar bildbiblioteket med skärmbilder.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: knapparna radbryts utan vågrät scroll.
- `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/extract-offers.eval.ts` med ett riktigt blad: tid, antal och felläsningar skrivs i T7.
