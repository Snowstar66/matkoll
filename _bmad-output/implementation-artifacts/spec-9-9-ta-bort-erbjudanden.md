---
title: 'Story 9.9: Ta bort erbjudanden'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-3-lagersaldo-i-nytt-utseende.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.1 och 9.7 kan Pontus se de inlagda erbjudandena men inte ta bort ett som blev fel. Ett felläst erbjudande ger då fel etikett på inköpslistan, i Recept och i AI-förslagen hela veckan (FR-35).

**Approach:**
- Varje rad i arket Veckans erbjudanden får en grå soptunna, som i Lagersaldo (11.3). Ett tryck tar bort direkt, utan fråga, och "Ångra" i den korta bekräftelsen sätter tillbaka raden med samma id (AD-20).
- "Ta bort alla" tar bort veckans alla erbjudanden för butiken, också med "Ångra".
- Veckopillren i arket visar också nästa veckas erbjudanden. E2E visar att veckor som är slut inte används och tas bort.

## Boundaries & Constraints

**Always:**
- `deleteOffers(ids)` och `restoreOffers(rows)` är Server Actions i `offers/actions` med `requireUser()`, Zod och `revalidateFor('store_offer')`. `deleteOffers` returnerar de borttagna raderna, och `restoreOffers` sätter tillbaka dem med samma id (`on conflict do nothing`), så att ett andra "Ångra" inte ger dubbletter.
- "Ta bort alla" skickar id:n för de rader som arket visade. Ett erbjudande som har lagts till på en annan enhet efter att arket visades tas inte bort.
- `restoreOffers` sätter inte tillbaka rader för en vecka som har tagit slut under tiden, och inte rader vars `label_key` redan finns för butiken och veckan (en ny hämtning eller inläsning under tiden). De hoppas över, och bekräftelsen säger hur många som kom tillbaka.
- Borttagningen är optimistisk (`useOptimistic`). En rad som inte gick att ta bort kommer tillbaka, och meddelanderutan säger "Det gick inte att spara erbjudandena. Försök igen.".
- Soptunnan följer 11.1: grå linjeikon, tryckyta 44 × 44 px, namnet "Ta bort Falukorv" för skärmläsare. Efter en borttagning går fokus till nästa rads soptunna, annars den föregående, annars "Hämta veckans erbjudanden" eller "Klistra in text".
- En kategori utan rader försvinner. Avsnittet "Fyll på lagret" (9.4) och etiketterna (9.2, 9.3) följer borttagningen vid nästa rendering.
- En borttagning ur länken (`source = 'link'`) kommer tillbaka vid nästa hämtning, eftersom hämtningen ersätter länkens rader. Bekräftelsen säger det inte; texten i arket under "Hämta igen" gör det: "Hämta igen ersätter erbjudandena från ica.se, också de du har tagit bort."
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-hantera@matkoll.test`.

**Never:**
- Ingen ändring av ett erbjudande (namn, pris eller katalogkoppling). Ett fel tas bort och läses in igen.
- Ingen kontrollfråga före "Ta bort" eller "Ta bort alla". "Ångra" räcker (Interaction Primitives, 11.3).
- Inget svep. Soptunnan är den enda vägen, som i Lagersaldo.
- Ingen lista över tidigare veckor.
- Ingen spärr mot att en borttagen vara kommer tillbaka från länken.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Soptunnor | 91 erbjudanden för vecka 45 | Varje rad har en grå soptunna. "Ta bort alla" står under listan | N/A |
| Ta bort ett | Soptunnan vid Falukorv | Raden försvinner direkt. "Tog bort Falukorv." med "Ångra" i 5 s. Fokus till nästa rads soptunna. Etiketten på inköpslistan försvinner | N/A |
| Ångra | "Ångra" inom 5 s | Raden kommer tillbaka med samma id | N/A |
| Ny borttagning | Två soptunnor efter varandra | Den andra bekräftelsen ersätter den första, och den första borttagningen står fast | N/A |
| Ta bort alla | "Ta bort alla" | Listan är tom, och arket visar läget utan erbjudanden. "Tog bort 91 erbjudanden." med "Ångra" | N/A |
| Ångra alla | "Ångra" | Alla 91 kommer tillbaka | N/A |
| Ångra efter ny hämtning | Falukorv borttagen, "Hämta igen" före "Ångra" | Den nya raden står kvar. "Ångra" hoppar över den gamla. "Satte tillbaka 0 av 1 erbjudanden." | N/A |
| Hämta igen | Falukorv borttagen, "Hämta igen" | Falukorv kommer tillbaka från länken | N/A |
| Två veckor | Erbjudanden för vecka 44 och 45, onsdag vecka 44 | Raden och etiketterna gäller vecka 45. Arket visar vecka 45 förvalt, och pillret "Vecka 44" visar vecka 44:s erbjudanden med egna soptunnor | N/A |
| Vecka slut | Erbjudanden för vecka 43 finns, det är vecka 44 | Vecka 43 visas och används aldrig. Den tas bort när Pontus sparar eller hämtar nya erbjudanden | N/A |
| Ingen vecka kvar | Bara vecka 43 finns | Arket visar läget utan erbjudanden | N/A |
| Fel vid borttagning | Databasen svarar inte | Raden kommer tillbaka. "Det gick inte att spara erbjudandena. Försök igen." | `offers_failed` |
| Annan användares id | Förfalskat id | Inget tas bort | N/A (0 rader) |
| Förfalskad indata | Id som inte är ett uuid, 301 id | Inget tas bort | `validation` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut och texter
- `spec-9-1-…md` -- arket, `listOffers`, `getActiveOffers` och `save_store_offers`
- `spec-2-3-…md`, `spec-11-3-…md` -- borttagning med "Ångra", samma id, soptunnan och fokus
- `src/features/offers/` (`ui/offers-sheet.tsx`, `ui/offers-list.tsx`, `data/`, `server.ts`) -- modulen
- `src/components/` (`trash-button.tsx`, kort bekräftelse med "Ångra", `notice.tsx`) -- byggstenar
- `src/features/pantry/actions/` (`remove-pantry-item.ts`, `restore-pantry-item.ts`) -- mönster för actions

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/offers/data/remove.ts` (+ test), `server.ts` -- `deleteOffersIn(ids)` returnerar raderna, och `restoreOffersIn(rows, now)` sätter tillbaka dem med samma id och hoppar över rader för en vecka som är slut eller ett `label_key` som redan finns. Svaret är antalet som kom tillbaka -- AD-20, AD-25
- [ ] `src/features/offers/actions/delete-offers.ts`, `restore-offers.ts` (+ tester) -- `requireUser()`, Zod (1–300 uuid, och rader som matchar `OfferRow`) och `revalidateFor('store_offer')` -- FR-35
- [ ] `src/features/offers/domain/offer.ts` (+ test) -- texterna "Tog bort Falukorv.", "Tog bort 91 erbjudanden.", "Satte tillbaka 15 av 16 erbjudanden." och raden under "Hämta igen"
- [ ] `src/features/offers/ui/offers-list.tsx` (+ test), `offers-sheet.tsx` (+ test) -- soptunnan per rad med optimistisk borttagning och fokus, "Ta bort alla", veckopillren som byter lista och raden under "Hämta igen" -- FR-35, UX-DR19
- [ ] `tests/integration/offers.test.ts` -- `restore` med samma id, överhoppade rader (vecka slut, `label_key` finns) och en annan användares id
- [ ] `tests/e2e/offers-manage.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-erbjudanden-hantera@matkoll.test`. Service role seedar erbjudanden för den här veckan, nästa vecka och en vecka som är slut. Testerna kontrollerar:
  - att arket gäller nästa vecka;
  - borttagning av ett med "Ångra";
  - "Ta bort alla" med "Ångra";
  - att en borttagen rad från länken kommer tillbaka efter "Hämta igen" (fixtursidan);
  - att veckan som är slut inte visas och är borta efter en ny hämtning.

  -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): ingen ändring av ett erbjudande.** Det som spelar roll är varans namn och katalogkoppling, och ett fel läses hellre in igen än rättas för hand. Det håller arket litet.
- **Beslut (förslag): en borttagen vara från länken kommer tillbaka vid nästa hämtning.** En spärrlista per vara vore ett nytt tillstånd att förklara och städa. Raden under "Hämta igen" säger hur det fungerar. Blir det ett problem kan hämtningen hoppa över `label_key` som Pontus har tagit bort samma vecka.
- **Beslut (förslag): veckor som är slut tas bort först vid nästa sparande eller hämtning.** Inget schemalagt jobb behövs, och de används aldrig under tiden.
- Loggar innehåller bara felkoder och antal.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: listan, soptunnorna och "Ta bort alla" radbryts utan vågrät scroll.
- Med VoiceOver: "Ta bort Falukorv" går att nå, bekräftelsen och "Ångra" läses upp, och fokus hamnar på nästa rads soptunna efter en borttagning.
