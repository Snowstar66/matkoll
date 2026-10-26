---
title: 'Story 9.4: Se och ta bort veckans erbjudanden'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-inklistrad-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-ta-bort-lagervara-med-angra.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Efter 9.1 kan Pontus spara erbjudanden, men inte se vilka som är inlagda eller ta bort ett som blev fel. Ett felläst erbjudande styr då AI-förslagen hela veckan (FR-35).

**Approach:**
- Med erbjudanden öppnar "Visa" på raden arket Veckans erbjudanden med rubriken "Inlagda för vecka 45" och en rad per erbjudande med namn, pris och "Ta bort".
- "Ta bort" och "Ta bort alla" tar bort direkt, och "Ångra" i den korta bekräftelsen sätter tillbaka raderna med samma id (AD-20).
- "Läs in fler" börjar en ny inläsning för samma vecka (9.1 och 9.3).
- Veckopillren visar också nästa veckas inlagda erbjudanden, och e2e visar att veckor som är slut inte används och tas bort.

## Boundaries & Constraints

**Always:**
- `deleteOffers(ids)` och `restoreOffers(rows)` är Server Actions i `offers/actions` med `requireUser()`, Zod och `revalidateFor('store_offer')`. `deleteOffers` returnerar de borttagna raderna, och `restoreOffers` sätter tillbaka dem med samma id (`on conflict do nothing`), så att ett andra "Ångra" inte ger dubbletter.
- "Ta bort alla" skickar veckans id från vyn. Ett erbjudande som har lagts till på en annan enhet efter att vyn visades tas inte bort.
- `restoreOffers` sätter inte tillbaka rader för en vecka som har tagit slut under tiden, och inte rader vars `name` redan finns för veckan (en ny inläsning under tiden). De hoppas över, och bekräftelsen säger hur många som kom tillbaka.
- Listan läses med `listOffers(storeId, weekStart)` för den butik och vecka arket visar, sorterad i bladets ordning (`created_at`, sedan `label`).
- Borttagningen är optimistisk (`useOptimistic`), och en rad som inte gick att ta bort kommer tillbaka med en `Notice`.
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-hantera@matkoll.test`.

**Never:**
- Ingen ändring av ett erbjudande (namn, pris eller katalogkoppling). Ett fel tas bort och läses in igen.
- Ingen förhandsfråga före "Ta bort alla". "Ångra" räcker (Interaction Primitives).
- Ingen lista över tidigare veckor.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Visa | 16 erbjudanden för vecka 45, "Visa" | Arket med "Inlagda för vecka 45", 16 rader med namn och pris, "Ta bort alla" och "Läs in fler" | N/A |
| Ta bort ett | "Ta bort Fläskfilé" | Raden försvinner. "Tog bort Fläskfilé." med "Ångra". Raden i Recept säger 15 | N/A |
| Ångra | "Ångra" inom 5 s | Raden kommer tillbaka med samma id | N/A |
| Ta bort alla | "Ta bort alla" | Listan är tom, och arket visar inläsningen. "Tog bort 16 erbjudanden." med "Ångra" | N/A |
| Ångra alla | "Ångra" | Alla 16 kommer tillbaka | N/A |
| Ångra efter ny inläsning | Fläskfilé borttagen och sedan inläst igen före "Ångra" | Den nya raden står kvar. "Ångra" hoppar över den gamla | N/A |
| Två veckor | Erbjudanden för vecka 44 och 45, onsdag vecka 44 | Raden och förslagen gäller vecka 45. Arket visar vecka 45 förvalt, och pillret "Vecka 44" visar vecka 44:s erbjudanden | N/A |
| Vecka slut | Erbjudanden för vecka 43 finns, det är vecka 44 | Vecka 43 visas aldrig och används aldrig i förslagen. Den tas bort när Pontus sparar nya erbjudanden | N/A |
| Ingen vecka kvar | Bara vecka 43 finns, det är vecka 44 | Raden säger "Inga erbjudanden inlagda." | N/A |
| Fel vid borttagning | Databasen svarar inte | Raden kommer tillbaka. "Det gick inte att spara erbjudandena. Försök igen." | `offers_failed` |
| Annan användares id | Förfalskat id | Inget tas bort | N/A (0 rader) |
| Förfalskad indata | Id som inte är ett uuid, 101 id | Inget tas bort | `validation` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut och texter
- `spec-9-1-…md` -- arket, `listOffers`, `getActiveOffers` och `save_store_offers`
- `spec-2-3-ta-bort-lagervara-med-angra.md` -- mönster för borttagning med "Ångra" och samma id
- `src/features/offers/` (`ui/offers-sheet.tsx`, `ui/weekly-offers-row.tsx`, `data/`, `server.ts`) -- modulen
- `src/components/` (kort bekräftelse med "Ångra", Notice) -- byggstenar
- `src/features/pantry/actions/` (`remove-pantry-item.ts`, `restore-pantry-item.ts`) -- mönster för actions

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/offers/data/remove.ts` (+ test), `server.ts` -- `deleteOffersIn(ids)` returnerar raderna, och `restoreOffersIn(rows)` sätter tillbaka dem med samma id och hoppar över rader för en vecka som är slut eller ett `name` som redan finns. Svaret är antalet som kom tillbaka -- AD-20, AD-25
- [ ] `src/features/offers/actions/delete-offers.ts`, `restore-offers.ts` (+ tester) -- `requireUser()`, Zod (1–100 uuid, och rader som matchar `OfferRow`), `revalidateFor('store_offer')`. `restoreOffers` får tiden `now` för kontrollen av veckan -- FR-35
- [ ] `src/features/offers/domain/offer.ts` (+ test) -- texterna "Tog bort Fläskfilé.", "Tog bort 16 erbjudanden." och "Satte tillbaka 15 av 16 erbjudanden." när några hoppades över
- [ ] `src/features/offers/ui/offers-sheet.tsx` (+ test), `offers-list.tsx` (+ test):
  - Läget Inlagda med rubriken "Inlagda för vecka 45".
  - Rader med namn, pris och "Ta bort" (med varans namn), med optimistisk borttagning.
  - "Ta bort alla" och "Läs in fler".
  - Veckopillren byter lista.
  - Arket öppnar Inlagda när veckan har erbjudanden och annars inläsningen.

  -- FR-35, UX-DR19
- [ ] `src/features/offers/ui/weekly-offers-row.tsx` (+ test) -- "Visa" öppnar arket i läget Inlagda
- [ ] `tests/integration/offers.test.ts` -- `restore` med samma id, överhoppade rader och en annan användares id
- [ ] `tests/e2e/offers-manage.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-erbjudanden-hantera@matkoll.test`. Service role seedar erbjudanden för den här veckan, nästa vecka och en vecka som är slut. Testerna kontrollerar:
  - att raden gäller nästa vecka;
  - borttagning av ett med "Ångra";
  - "Ta bort alla" med "Ångra";
  - att veckan som är slut inte visas och är borta efter en ny inläsning och "Spara".

  -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): ingen ändring av ett erbjudande.** Det enda som spelar roll för förslagen är varans namn, och ett felläst namn läses hellre in igen än rättas för hand. Det håller arket litet.
- **Beslut (förslag): veckans erbjudanden är den senaste veckan som inte är slut.** Om Pontus har lagt in nästa veckas blad på söndagen gäller det, eftersom Pontus då planerar nästa vecka. Pillret "Vecka 44" visar ändå den här veckans erbjudanden. Om det blir fel i vardagen (till exempel att nästa veckas blad läggs in redan på torsdagen) kan regeln ändras till att den här veckan gäller till och med fredag. Det står som öppen fråga 10.
- **Beslut (förslag): veckor som är slut tas bort först när Pontus sparar nya erbjudanden.** Det behövs inget schemalagt jobb, och de används aldrig under tiden.
- Loggar innehåller bara felkoder och antal.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: listan och knapparna radbryts utan vågrät scroll.
- Med VoiceOver: "Ta bort Fläskfilé" går att nå, bekräftelsen och "Ångra" läses upp, och fokus hamnar på nästa rad efter en borttagning.
