---
title: 'Story 11.5: Recept och Matsedel i nytt utseende'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-gemensam-grund-for-nytt-utseende.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-10-receptbiblioteket-med-sokning-och-favoriter.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-lagga-ratter-pa-matsedeln.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-portioner-och-x-av-y-hemma-i-receptvyn.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/mockups/matkoll-mobil.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus vill att hela appen ser ut som i helhetsskissen ("håll den stilen"). Recept och Matsedel visar i dag små bilder i rader. I skissen är recepten kort med stora bilder, och matsedeln visar hur mycket som finns hemma med en mätare.

**Approach:**
- Receptbiblioteket visar receptkort: bilden överst, statusetiketten och hjärtat på bilden, titeln och "35 min · 4 portioner" under. Två kolumner från 1024 px.
- Matsedeln visar rättkort: 56 px bild, titeln, "6 av 8 hemma" och en mätare, och portionsväljaren under.
- "Visa inköpslistan" längst ned i Matsedel.

## Boundaries & Constraints

**Always:**
- Receptkortet används överallt där Receptrad används i receptbiblioteket och för AI-förslag. Arket "Lägg till rätt" behåller den kompakta Receptraden, eftersom arket ska rymma många recept.
- Bilden är `RecipeImage` i full bredd och `card-image` hög, med `object-cover` och platshållaren i mint för ett recept utan bild eller med en bild som inte laddas.
- Statusetiketten ("Kan lagas nu" eller "Saknar 2 varor", som förut) ligger nere till vänster på bilden och hjärtat nere till höger, båda på en platta i `overlay`. Utan läst lager visas ingen etikett, som förut.
- Ett tryck var som helst på kortet öppnar receptet (länken sträcks över kortet som i dag). Hjärtat ligger ovanför länken, har tryckytan 44 × 44 px, växlar favorit och navigerar aldrig.
- AI-förslagens kort har AI-etiketten (sand) i stället för statusetiketten och inget hjärta, som förut.
- Rättkortet: `RecipeImage` på `dish-thumb` med `rounded-md`, titeln, raden "6 av 8 hemma" (`atHomeSummaryText`, AD-7), eller "Allt finns hemma" när allt finns, och `Meter` (liten) med andelen. Status står alltid som text. Portionsväljaren står under, och ändrade portioner räknar om status och mätare direkt som förut.
- En borttagen rätt (`recipe_id` null) visar "Borttaget recept" som förut, utan mätare.
- Svep och "Ta bort" på en matsedelsrätt med "Ångra" fungerar som förut.
- "Visa inköpslistan" är en sekundärknapp längst ned i Matsedel, under "Lägg till rätt", som går till Inköpslistan. Den visas bara när matsedeln har rätter.
- "Föreslå rätter med AI" står kvar som förut, utan gnistor.
- Recept: en kolumn under 1024 px, två kolumner från 1024 px inom `content-max`.
- Allt fungerar vid 375 px och 1280 px, i ljust och mörkt läge, med 200 % text utan vågrät scroll, med VoiceOver och tangentbord. Mätaren är dold för skärmläsare.
- E2E-specen har den egna e2e-användaren `e2e-utseende-recept@matkoll.test`.

**Never:**
- Ingen ändring av lagningsstatusen, rangordningen, favoriterna eller hur portioner sparas.
- Inga gradienter eller skuggor på bilderna. Plattan under etiketten och hjärtat är `overlay`, inte en skugga.
- Inget antal varor på "Visa inköpslistan" (utanför Epic 11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recept med bild | Korv stroganoff, allt finns hemma, inte favorit | Kort med bilden, "Kan lagas nu" nere till vänster, tomt hjärta nere till höger, titeln och "15 min · 4 portioner" | N/A |
| Saknar varor | Kycklinggryta saknar 2, favorit | "Saknar 2 varor", fyllt hjärta | N/A |
| Utan bild | Ett recept utan `image_url` | Platshållaren i mint i full bredd | N/A |
| Bilden laddas inte | 404 från receptsajten | Platshållaren | N/A |
| Öppna | Tryck på titeln eller bilden | Receptvyn | N/A |
| Hjärta | Tryck på hjärtat | Favorit växlar, ingen navigering | Som förut |
| Lager inte läst | Pantry-läsningen misslyckas | Ingen statusetikett | N/A |
| AI-förslag | Tre förslag | Korten har "AI-förslag" och inget hjärta | N/A |
| Dator | 1280 px | Två kolumner | N/A |
| Matsedel | Kycklinggryta 4 portioner, 6 av 8 hemma | Rättkort med 56 px bild, "6 av 8 hemma", mätaren till 75 %, portionsväljaren "4 portioner" | N/A |
| Allt hemma | Korv stroganoff | "Allt finns hemma", full mätare | N/A |
| Ändra portioner | + på Kycklinggryta | 5 portioner, "5 av 8 hemma" om en vara inte räcker längre, mätaren följer | Som förut |
| Borttaget recept | `recipe_id` null | "Borttaget recept", ingen mätare | N/A |
| Visa inköpslistan | Tryck | Inköpslistan | N/A |
| Tom matsedel | Inga rätter | "Ingen rätt på matsedeln än." och "Lägg till rätt", ingen "Visa inköpslistan" | N/A |
| VoiceOver | Rättkortet | "Kycklinggryta", "6 av 8 hemma", portionsväljaren; mätaren hoppas över | N/A |
| 200 % text | 375 px | Titeln radbryts, etiketten och hjärtat står kvar på bilden, ingen vågrät scroll | N/A |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-11-context.md`
- `mockups/matkoll-mobil.html` -- Recept och Matsedel
- `src/features/recipes/ui/recipe-row.tsx`, `recipe-list.tsx`, `library.tsx`, `recipe-status-badge.tsx`, `favorite-button.tsx`, `ai-suggestions.tsx`, `add-to-plan-button.tsx`
- `src/features/mealplan/ui/meal-plan-list.tsx`, `add-dish-sheet.tsx`
- `src/features/mealplan/domain/meal-plan.ts` (`dishStatus`)
- `src/features/pantry/domain/recipe-status.ts` (`recipeStatus`, `atHomeSummaryText`)
- `src/components/recipe-image.tsx`, `badges.tsx`, `heart-toggle.tsx`, `stepper.tsx`, `meter.tsx` (11.1), `button.tsx`
- `tests/e2e/` -- specar som letar efter receptraden eller matsedelns statusetikett

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/recipes/ui/recipe-card.tsx` (+ test) -- receptkortet enligt Boundaries, med plattan `overlay` för etiketten och hjärtat -- UX-DR26
- [ ] `src/features/recipes/ui/recipe-list.tsx`, `library.tsx`, `ai-suggestions.tsx` (+ tester) -- korten och två kolumner från 1024 px. `recipe-row.tsx` står kvar för arket "Lägg till rätt"
- [ ] `src/features/mealplan/domain/meal-plan.ts` (+ test) -- `dishProgress(status)`: `{ text, value }` med "6 av 8 hemma", "Allt finns hemma" och andelen -- FR-13
- [ ] `src/features/mealplan/ui/meal-plan-list.tsx` (+ test) -- rättkortet och "Visa inköpslistan" -- UX-DR26
- [ ] Befintliga e2e-specar -- uppdatera de som är beroende av receptradens eller matsedelns utseende
- [ ] `tests/e2e/recipes-look.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-utseende-recept@matkoll.test`: kortet med etikett och hjärta, att hjärtat inte navigerar, två kolumner vid 1280 px, rättkortet med "6 av 8 hemma" och portionsväljaren, och "Visa inköpslistan"
- [ ] `docs/beslutslogg.md` -- en post för storyn

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given Recept och Matsedel vid 375 px i ljust och mörkt läge, when de jämförs med `mockups/matkoll-mobil.html`, then har de samma uppbyggnad (skärmbilder utanför repot, i granskningen).

## Implementation Notes

- **Beslut (förslag): portionsväljaren står kvar i rättkortet.** Skissen visar bara "4 portioner", men FR-13 kräver att portionerna går att ändra, och ett ark vore ett extra steg.
- **Beslut (förslag): "Visa inköpslistan" utan antal.** Antalet skulle kräva att listan räknas fram också i Matsedel.
- **Beslut (förslag): Receptraden står kvar i arket "Lägg till rätt",** där många recept ska rymmas och favoriterna ska nås med två tryck (SM-4).
- **Risk: bilder från receptsajter är olika stora.** `object-cover` och fast höjd. Bilderna laddas fortfarande utan referrer (AD-15).
- **Risk: kontrast på etiketten.** Plattan i `overlay` gör texten läsbar på alla bilder. Kontrollera i mörkt läge.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- På riktig iPhone: bläddra i recepten och tryck på hjärtat på ett kort. Receptet ska inte öppnas.
- VoiceOver: kortet läses med titel, tid och status, och "Favorit, av, knapp".
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: ingen vågrät scroll.
