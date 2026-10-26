---
title: 'Story 9.2: Erbjudanden på inköpslistan'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-4-inkopslistan-i-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-2-produktval-per-vara.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.1 finns veckans erbjudanden i Matkoll, men inköpslistan säger inget om dem. Pontus ser inte i butiken, eller när veckan planeras, att falukorven på listan kostar 29 kr den här veckan (FR-51).

**Approach:**
- En gemensam komponent, `OfferChip` (`offer-chip` i `DESIGN.md`), med texten "Falukorv 29 kr".
- `/lista` läser vald butiks aktiva erbjudanden och räknar etiketten per listnyckel med `offersForLines(lines, offers)` i `offers/domain`, och skickar dem till `shopping/ui`.
- Listposten visar etiketten först på raden under namnet. Listpostdetaljen visar alla erbjudanden för varan med pris och villkor.

## Boundaries & Constraints

**Always:**
- Jämförelsen finns bara i `offers/domain/matching.ts`: samma katalogingrediens först. En post utan katalogingrediens (`t:`-nyckel eller egen vara utan koppling) jämförs på normaliserat namn mot erbjudandets `name`. Varje post får högst en etikett, det första erbjudandet i bladets ordning (`created_at`, sedan `label`).
- `offerChip(offer)` i `offers/domain/chip.ts` ger `{ text, ariaLabel }`. Texten är `name` med stor bokstav och `price` ("Falukorv 29 kr"), avkortad till 28 tecken med "…", eller bara namnet utan pris. `ariaLabel` är "På erbjudande: Falukorv 29 kr".
- `shopping/ui` får etiketterna som data (`Record<lineKey, OfferChipData>` och listan per nyckel för detaljen) och importerar aldrig `offers` (AD-1). `OfferChip` ligger i `src/components/offer-chip.tsx`.
- En avbockad post i I korgen behåller etiketten, överstruken som resten av raden.
- Om butiken eller erbjudandena inte går att läsa visas listan utan etiketter, och `offers_unavailable` loggas.
- Raden följer vald butik. Ett byte av butik revaliderar `/lista` (9.1).
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-lista@matkoll.test`.

**Never:**
- Ingen ändring av `computeList`, listnycklar, mängder, ordningen, bockarna eller exporten (AD-8, AD-16).
- Inget pris räknas om eller jämförs, och etiketten säger aldrig "billigt" eller "spara".
- Ingen ny tabell och ingen skrivning.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Etikett | Listposten Falukorv 800 g (katalogingrediens falukorv), erbjudandet "Gårdens Falukorv" med `name` falukorv och pris "29 kr" | Raden under namnet: etiketten "Falukorv 29 kr" och sedan "Korv stroganoff" | N/A |
| Två erbjudanden | Två erbjudanden på falukorv | Etiketten visar det första. Detaljen visar båda | N/A |
| Utan katalogkoppling | Listposten "rimmad lax" (`t:`-nyckel), erbjudandet med `name` "rimmad lax" | Etiketten visas | N/A |
| Egen vara | Den egna varan "Kaffe" kopplad till katalogingrediensen kaffe | Etiketten visas | N/A |
| Ingen träff | Gul lök, inget erbjudande | Ingen etikett. Raden är som i 11.4 | N/A |
| Utan pris | Erbjudande utan `price` | Etiketten "Falukorv" | N/A |
| Långt namn | Namn och pris över 28 tecken | Avkortas med "…", hela texten i `ariaLabel` | N/A |
| Med produktval | Produktvalet "Scan Falukorv" och ett erbjudande | Etiketten under namnet, produktetiketten till höger som förut | N/A |
| I korgen | Falukorv avbockad | Etiketten står kvar, överstruken | N/A |
| Detaljen | Tryck på texten "Falukorv" | Listpostdetaljen har "På erbjudande hos Maxi ICA Stormarknad Östersund:" och "Gårdens Falukorv 800 g · 29 kr · t.o.m. 1 nov" | N/A |
| Erbjudandet har gått ut | `valid_to` igår | Ingen etikett | N/A |
| Ingen butik | `getSelectedStore()` ger `null` | Inga etiketter | N/A |
| Fel vid läsning | `getActiveOffers` kastar | Listan visas utan etiketter | `offers_unavailable` loggas |
| Skärmläsare | VoiceOver på raden | "Falukorv, 800 g, inte avbockad", sedan "På erbjudande: Falukorv 29 kr" | N/A |
| Exporten | "Skicka till ICA" med etiketter i listan | Exporten är byte för byte som utan erbjudanden (golden file) | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- matchningen, etiketten och texterna
- `spec-9-1-…md` -- `getActiveOffers`, `Offer` och arket
- `spec-11-4-…md` -- listposten, raden under och I korgen
- `src/features/offers/domain/` -- `matching.ts`, `chip.ts`
- `src/app/(app)/lista/page.tsx` -- sammansättningen
- `src/features/shopping/ui/` (listpost, listpostdetalj), `src/features/shopping/domain/` (`ShoppingLine`, `lineKey`) -- listan
- `src/components/` -- produktetiketten som mönster för `OfferChip`
- `src/app/globals.css`, `DESIGN.md` -- token `offer-chip`
- `tests/e2e/shopping*.spec.ts`, `support.ts`, `global-setup.ts` -- mönster

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/offers/domain/matching.ts` (+ test), `chip.ts` (+ test), `index.ts` -- `offersForLines(lines, offers): Map<lineKey, Offer[]>` och `offerChip(offer)` -- FR-51
- [ ] `src/components/offer-chip.tsx` (+ test), `src/app/globals.css` -- `OfferChip` med token `offer-chip` (`{colors.mint}` och `{colors.mint-ink}`, `{rounded.sm}`, `{typography.badge}`), `aria-label`, och ett test för kontrast i ljust och mörkt läge -- UX-DR32
- [ ] `src/app/(app)/lista/page.tsx` -- läser vald butik och `getActiveOffers` inuti `<Suspense>`, räknar etiketterna och skickar dem till listan. Fel loggas som `offers_unavailable` -- AD-1, AD-18
- [ ] `src/features/shopping/ui/` (listpost, listpostdetalj) (+ tester) -- etiketten på raden under och avsnittet i detaljen -- FR-51, UX-DR32
- [ ] `tests/e2e/offers-list.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare. Service role seedar en matsedel med Korv stroganoff och erbjudanden för falukorv och rimmad lax i vald butik den här veckan. Testerna kontrollerar etiketterna, detaljen, I korgen och att exporten är oförändrad -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): etiketten i mint, inte ljusblå.** Ljusblått är redan produktetiketten och "saknas". Mint betyder något bra, och på inköpslistan finns ingen statusetikett i mint. Texten säger alltid vad det är.
- **Beslut (förslag): etiketten står först på raden under, inte till höger.** Till höger står produktetiketten, och två etiketter bredvid varandra får inte plats vid 375 px.
- **Beslut (förslag): det första erbjudandet i bladets ordning.** Priser är text och går inte att jämföra. Detaljen visar alla.
- Loggar innehåller bara felkoder och antal.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: etiketten och rätterna radbryts utan vågrät scroll, och produktetiketten står kvar till höger.
- Med VoiceOver: etiketten läses efter posten, och listpostdetaljens avsnitt går att nå.
