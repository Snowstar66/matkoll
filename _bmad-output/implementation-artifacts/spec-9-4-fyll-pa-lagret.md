---
title: 'Story 9.4: Fyll på lagret'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-2-erbjudanden-pa-inkopslistan.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-egna-varor.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-2-produktval-per-vara.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-valja-och-hantera-stallen-i-hemma.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus har varor som alltid ska finnas hemma och i stugan: kaffe, smör, pasta. När de är på erbjudande vore det ett bra tillfälle att fylla på, särskilt inför en resa till stugan, men det syns inte bland 90 erbjudanden (FR-53).

**Approach:**
- Överst i arket Veckans erbjudanden står avsnittet "Fyll på lagret" med erbjudanden på basvaror.
- En basvara är en katalogingrediens som finns i lagret på något ställe just nu (också obegränsad) eller har ett produktval i butiken.
- Raden säger var varan finns ("Finns i Hemma, inte i Stugan"). "Lägg på listan" lägger varan som egen vara på inköpslistan.

## Boundaries & Constraints

**Always:**
- `pantry/server.ts` får `listStockedSites(ingredientIds): Map<ingredientId, siteId[]>`, memoiserad per förfrågan. Den säger bara på vilka ställen en katalogingrediens finns, aldrig mängder, och summerar aldrig lagret (tillägg i AD-24).
- `staplesOnOffer(offers, stocked, productChoices, sites)` i `offers/domain/matching.ts` väljer erbjudanden med katalogingrediens som finns i `stocked` eller har ett produktval i butiken. Ett erbjudande per katalogingrediens (det första). Ordning: de som saknas på minst ett ställe först, sedan bladets ordning.
- Texten för var varan finns:
  - flera ställen: "Finns i Hemma och Stugan", "Finns i Hemma, inte i Stugan" eller "Finns inte i lagret";
  - ett ställe: "Finns hemma" eller "Finns inte hemma";
  - bara produktval: "Du brukar köpa Gevalia".

  Ställenas namn står i den ordning de skapades. Vid fler än tre ställen: "Finns i 2 av 4 ställen".
- Sidan som öppnar arket (`/lista`, `/recept`) skickar in ställen, lagerkoppling, produktval och den aktuella matsedelns id (route → ui). `offers/ui` importerar aldrig `pantry`, `shopping` eller `mealplan`.
- "Lägg på listan" anropar `shopping.addCustomItem` med `label` = varans namn med stor bokstav, `ingredientId` och matsedelns id, och ett id som skapas i klienten, så att ett nytt försök lägger till en gång (AD-20). Bekräftelsen säger "Lade kaffe på inköpslistan.", och knappen byter till "På listan" tills arket stängs.
- Utan aktuell matsedel visas inte "Lägg på listan", och raden "Lägg rätter på matsedeln för att få en inköpslista." står under rubriken.
- Utan basvaror på erbjudande syns inte avsnittet.
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-lager@matkoll.test`.

**Never:**
- Ingen ny tabell och ingen historik över köp. Kvittona i `pantry_addition` används inte: de har ingen vara och tas bort efter 30 dagar (öppen fråga 23).
- Ingen skrivning i lagret och ingen ändring av katalogen.
- Ingen mängd på den egna varan.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Basvara saknas i stugan | Kaffe finns i Hemma men inte i Stugan, erbjudande "Gevalia Mellanrost 450 g" 49 kr | Under "Fyll på lagret": "Gevalia Mellanrost 450 g", "49 kr · Finns i Hemma, inte i Stugan" och "Lägg på listan" | N/A |
| Finns överallt | Smör i både Hemma och Stugan | "Finns i Hemma och Stugan", efter kaffet | N/A |
| Obegränsad vara | Salt som "Finns hemma"-vara och salt på erbjudande | Räknas som basvara | N/A |
| Bara produktval | Produktval för kaffe i butiken, inget kaffe i lagret | "Du brukar köpa Gevalia" | N/A |
| Ett ställe | Bara Hemma, kaffe finns | "Finns hemma" | N/A |
| Inte basvara | Laxfilé, inte i lagret och inget produktval | Inte i avsnittet, bara i listan nedanför | N/A |
| Utan katalogkoppling | Erbjudandet "Herrgård" utan katalogingrediens | Kan inte vara basvara | N/A |
| Lägg på listan | "Lägg på listan" vid kaffe | Egen vara "Kaffe" kopplad till katalogingrediensen på den aktuella matsedelns lista. "Lade kaffe på inköpslistan." Knappen säger "På listan" | N/A |
| Dubbeltryck | Två tryck | En egen vara | N/A |
| Matsedeln bytt | En annan matsedel blev aktuell under tiden | "Listan har ändrats. Stäng arket och försök igen." | `shopping_plan_changed` |
| Ingen matsedel | Ingen aktuell matsedel | Ingen knapp. "Lägg rätter på matsedeln för att få en inköpslista." | N/A |
| Inga basvaror | Inget erbjudande är en basvara | Avsnittet syns inte | N/A |
| Fel vid läsning av lagret | `listStockedSites` kastar | Avsnittet syns inte, resten av arket visas | `offers_unavailable` loggas |
| Skärmläsare | VoiceOver | Rubriken "Fyll på lagret" är ett `h2`, knappen heter "Lägg kaffe på listan" | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- basvaror och texter
- `spec-9-1-…md` -- arket och `getActiveOffers`
- `src/features/pantry/server.ts`, `data/queries.ts` -- `listStockedSites` (nytt), `listPantrySites`
- `src/features/shopping/server.ts` (produktval), `actions/add-custom-item.ts` -- egen vara
- `src/features/mealplan/server.ts` -- aktuell matsedel
- `src/features/offers/ui/offers-sheet.tsx` -- avsnittet
- `src/app/(app)/lista/page.tsx`, `src/app/(app)/recept/page.tsx` -- sammansättningen

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/pantry/data/queries.ts` (+ test), `server.ts` -- `listStockedSites(ingredientIds)`, en fråga mot `pantry_item` med `site_id` och `ingredient_id`, utan mängder -- AD-24
- [ ] `src/features/offers/domain/matching.ts` (+ test), `offer.ts` (+ test) -- `staplesOnOffer` och texterna för var varan finns -- FR-53
- [ ] `src/features/offers/ui/stock-up.tsx` (+ test), `offers-sheet.tsx` (+ test) -- avsnittet, "Lägg på listan" med `useActionState` och "På listan" -- FR-53, UX-DR19
- [ ] `src/app/(app)/lista/page.tsx`, `src/app/(app)/recept/page.tsx` -- läser ställen, lagerkoppling, produktval och matsedel inuti `<Suspense>` och skickar dem till arket -- AD-1
- [ ] `tests/integration/pantry.test.ts` -- `listStockedSites` för två ställen och en annan användares lager
- [ ] `tests/e2e/offers-stock-up.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare. Service role seedar Hemma och Stugan, lager, ett produktval, en matsedel och erbjudanden. Testerna kontrollerar texterna, ordningen och "Lägg på listan" och att varan står i Inköpslistan -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): basvara = finns i lagret nu eller har ett produktval.** Matkoll har ingen historik över köp. Det som Pontus håller i lagret, och det Pontus har valt en produkt för, är de bästa signalerna som finns. En historik är öppen fråga 23.
- **Beslut (förslag): alla ställen räknas.** Syftet är att se vad som saknas i stugan. AD-24 förbjuder att lagret summeras, och funktionen ger bara var varan finns, aldrig mängder.
- **Beslut (förslag): egen vara utan mängd.** Pontus vet bäst hur mycket som ska köpas, och mängden går att rätta i listan.
- Loggar innehåller bara felkoder och antal.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raderna och "Lägg på listan" radbryts utan vågrät scroll.
- Med VoiceOver: bekräftelsen läses upp, och fokus står kvar på knappen, som nu säger "På listan".
