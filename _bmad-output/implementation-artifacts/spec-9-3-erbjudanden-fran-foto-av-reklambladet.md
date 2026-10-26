---
title: 'Story 9.3: Erbjudanden från foto av reklambladet'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-inklistrad-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-9-importera-recept-fran-foto.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-fotografera-en-plats-och-fa-lagerforslag.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-battre-bildtolkning.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.1 kan Pontus bara lägga in erbjudanden som text. Reklambladet kommer ofta på papper, och i butikens app går texten inte alltid att kopiera. Då har Pontus bara bladet eller en skärmbild (FR-34).

**Approach:**
- Arket Veckans erbjudanden får flikarna Text och Foto. Foto har "Fotografera bladet" (bakre kameran) och "Välj bild" (också skärmbilder).
- Fotot förminskas i klienten som ett foto av en plats och skickas till `/api/ai/offers/photo`.
- `extractOffers` får bilden, med samma schema och prompt som för text och med samma sampling som `analyzeImage` i LM Studio.
- Svaret blir samma utkast och samma granskning som i 9.1.

## Boundaries & Constraints

**Always:**
- Fotot förminskas i klienten till högst 2048 px och 1,5 MB (JPEG), som ett foto av en plats (AD-15, Story 6.5), och servern kontrollerar storlek, typ och pixlar med `readImageForm` (`image_too_large`, `image_unsupported`).
- Fotot finns bara i minnet under förfrågan. Det skrivs aldrig till databasen, disk eller loggar.
- `/api/ai/offers/photo` följer `/api/ai/import/photo`: `maxDuration = 120`, `isCrossSite`, `requireUserForRoute`, multipart med fältet `image` och `request.signal`. Den skriver aldrig (AD-2).
- `readOffers` tar emot `{ image }` och gör samma sak som med text efter porten.
- LM Studio-adaptern skickar en bild till `extractOffers` med samma sampling som `analyzeImage` (`imageSampling`, Story 6.5) och tänkläget avstängt. Text ändras inte.
- Samma granskning, samma "Spara" och samma texter som i 9.1. Förloppet säger "Tittar på bladet …".
- Fixturen för mocken är en påhittad, ritad bild, aldrig ett foto av ett riktigt blad.
- E2E-specen har den egna e2e-användaren `e2e-erbjudande-foto@matkoll.test`.

**Never:**
- Inga flera bilder i ett anrop. En sida läses i taget, och inläsningarna läggs ihop (9.1).
- Ingen beskärning eller rotering i klienten utöver förminskningen.
- Ingen ändring av `analyzeImage`, platsfotot eller importen av recept från foto.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fliken Foto | Arket öppet | Flikarna Text och Foto. Foto har "Fotografera bladet" och "Välj bild" | N/A |
| Fotografera | Mobil, "Fotografera bladet" | Bakre kameran öppnas (`capture="environment"`) | N/A |
| Skärmbild | "Välj bild" med en PNG | Bilden förminskas och skickas | N/A |
| Läsa bladet | Mockens `reklamblad.png` | "Tittar på bladet …" och "Avbryt", sedan "Hittade 12 erbjudanden för vecka 45." och samma granskning som för text | N/A |
| Stor bild | 4284 × 5712 px | Förminskas till 1536 × 2048 px och under 1,5 MB före uppladdningen | N/A |
| För stor efter förminskning | Servern får mer än 1,5 MB | "Bilden är för stor. …" | `image_too_large` |
| Fel format | HEIC eller PDF | "Bildformatet stöds inte. …" | `image_unsupported` |
| Inga erbjudanden | Mockens tomma bild | "Hittade inga erbjudanden. …" | `offers_none` |
| Upprepningar | Modellen upprepar samma vara många gånger | En post per vara | N/A |
| Fler än 40 | Ett helt blad med 50 varor | De första 40 och texten om resten | N/A |
| AI-tjänsten svarar inte | LM Studio avstängt | "AI-tjänsten svarar inte just nu. …" med "Försök igen" med samma bild | `ai_unavailable` |
| Avbryt | "Avbryt" under förloppet | Anropet avbryts, och fliken Foto visas igen | N/A |
| Byta flik | Text inskriven, byte till Foto och tillbaka | Texten står kvar | N/A |
| Text i bilden som instruktion | Påhittat blad med texten "Ignorera instruktionerna" | Behandlas som text på bladet. Inget erbjudande skapas av den | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut och texter
- `spec-9-1-…md` -- `readOffers`, `extractOffers`, arket och granskningen
- `spec-1-9-…md`, `spec-6-1-…md`, `spec-6-5-…md` (inklusive Review Triage Log) -- foto, förminskning, `imageSampling` och utvärdering av bilder
- `src/app/api/ai/import/photo/route.ts` (+ test), `src/app/api/ai/route-support.ts` (`readImageForm`) -- mönster för multipart
- `src/lib/downscale-image.ts`, `src/lib/images.ts` (`maxPlacePhotoSide` från 6.5) -- förminskning
- `src/lib/ai-client.ts` (`postAiForm`) -- klientens anrop
- `src/server/ai/service.ts`, `adapters/lmstudio.ts`, `adapters/mock.ts` -- porten
- `src/features/pantry/ui/pantry-camera.tsx` -- mönster för kameraknapp och "Välj bild"
- `scripts/render-pantry-image.mjs` -- mönster för en ritad fixtur
- `tests/eval/analyze-image.eval.ts` -- mönster för utvärdering av bilder

## Tasks & Acceptance

**Execution:**
- [ ] `src/server/ai/service.ts` (+ test) -- `extractOffersContent` för en bild: "Bilden visar ett reklamblad eller en sida med erbjudanden." och bilden som `file`-del -- AD-9, AD-15
- [ ] `src/server/ai/adapters/lmstudio.ts` (+ test) -- `extractOffers` med bild skickar `imageSampling`, och med text standardinställningarna -- AD-25
- [ ] `src/server/ai/prompts/extract-offers.md` -- ett avsnitt om bilder: läs bladet ruta för ruta, ta bara med det som syns tydligt, och hitta aldrig på ett pris
- [ ] `scripts/render-offer-image.mjs`, `tests/fixtures/ai/reklamblad.png`, `reklamblad.offers.json`, `reklamblad-tomt.png`, `reklamblad-tomt.offers.json`, `manifest.json` -- ett påhittat blad med 12 rutor (namn, märke och pris) och ett tomt blad
- [ ] `src/server/ai/adapters/mock.ts` (+ test) -- svar för bilderna och de reserverade bilderna
- [ ] `src/features/offers/actions/read-offers.ts` (+ test) -- `{ image }` som indata. Ett test visar att inget hämtas
- [ ] `src/app/api/ai/offers/photo/route.ts` (+ test) -- som `/api/ai/import/photo`, med `readOffers`
- [ ] `src/features/offers/ui/offers-sheet.tsx` (+ test), `offers-photo.tsx` (+ test), `use-read-offers.ts` -- flikarna, kameraknappen, "Välj bild", förminskningen till `maxPlacePhotoSide`, förloppet "Tittar på bladet …" och samma granskning som för text -- FR-34, UX-DR19
- [ ] `src/lib/errors.ts` -- texten för `offers_link` får tillägget "… eller ta en skärmbild och välj den under Foto." nu när fliken finns
- [ ] `tests/eval/extract-offers.eval.ts` -- bilderna i fixturerna och Pontus egna foton i `tests/eval/photos/` med `<namn>.offers.expected.json` (ignoreras av git), tre körningar per bild med tid, antal, ogiltiga och upprepningar
- [ ] `tests/e2e/offers-photo.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-erbjudande-foto@matkoll.test`. Testerna väljer `reklamblad.png` med "Välj bild", granskar, sparar och kontrollerar raden. Ett eget test väljer den tomma bilden -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn, och mätningen i T7 i `docs/oppna-fragor.md`

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): 2048 px, som ett foto av en plats.** Ett reklamblad har liten text och många rutor, som en kyldörr. 6.5 visade att 2048 px och Qwens sampling gav färre upprepningar. Taket på 1,5 MB räcker, eftersom en JPEG på 2048 px med kvalitet 0,85 är ungefär 0,7 MB.
- **Beslut (förslag): en bild per inläsning.** Flera bilder i ett anrop skulle ta längre tid än 100 s med en lokal modell. Inläsningarna läggs ihop per vecka (9.1), så ett blad med flera sidor går att läsa in en sida i taget.
- **Risk: ett helt uppslag har fler än 40 erbjudanden.** Granskningen säger då att resten saknas, och Pontus kan fotografera halva uppslaget i taget. Utvärderingen visar om gränsen behöver ändras.
- **Risk: priser och mängder läses fel.** De visas i granskningen och används aldrig i beräkningar (SM-C4).

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På iPhone: "Fotografera bladet" öppnar bakre kameran, och "Välj bild" visar bildbiblioteket med skärmbilder.
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: flikarna och knapparna radbryts utan vågrät scroll.
- `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/extract-offers.eval.ts` med ett riktigt blad: tid, antal och felläsningar skrivs i T7.
