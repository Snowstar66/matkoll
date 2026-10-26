---
title: 'Story 12.3: Kortare svar för AI-förslag'
type: 'feature'
created: '2026-10-26'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-1-mat-ai-tiderna-och-stall-in-lm-studio.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-ai-forslag-utifran-lagret.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-3-lagningsstatus-forslag-och-lagg-i-lagret-foljer-valt-stalle.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AI-förslagen tar 30–90 s och 1 300–2 000 token svar (T5). Det mesta av svaret är katalogförslag (`hint` med namn, avdelning, plats och enhet) och `isVague` för varje receptrad, också för varor som redan finns i lagret och därför redan finns i katalogen. Varje token tar tid med Qwen lokalt.

**Approach:**
- `suggestDishes` ber modellen om ett kompaktare svar: receptraden har `text`, `amount`, `unit`, `name` och `stepIndexes`, och `new` (avdelning, plats, enhet) bara för en vara som inte finns i lagret.
- Porten gör om svaret till `AiRecipe`, så att `suggestFromPantry`, `fromAiRecipe`, förhandsgranskningen och sparandet är oförändrade (AD-10).
- Mätt före och efter med 12.1:s utvärdering. Målet: minst 25 % färre token, högst 40 s i median med varm modell och lika många giltiga förslag.

## Boundaries & Constraints

**Always:**
- Nytt schema `compactDish` i `src/server/ai/schemas.ts`: `{ title, servings, totalMinutes, ingredients: [{ text, amount, unit, name, stepIndexes, new? }], steps }`, där `new` är `{ section, location, defaultUnit }`. Samma gränser som i dag (högst 10 rader, högst 6 steg, samma enheter, avdelningar och platser), och `suggestDishesAnswerCompactFor(avoidTitles)` med samma kontroll av titlar som `suggestDishesAnswerFor`.
- `fromCompactDish(dish): AiRecipe` i porten: `originalText` = `text`, `isVague` = `amount === null`, `hint.name` = `name`, `hint.section`, `hint.location` och `hint.defaultUnit` från `new`, annars Övrigt, Skafferi och `unit ?? "st"`. Tabelltest.
- Prompten `suggest-dishes.md` beskriver det nya schemat: `name` i grundform och samma namn som i lagret när varan finns där, och `new` bara för en vara som inte står under "Lagret:".
- `suggestDishes` returnerar fortfarande `AiRecipe[]`. `parseRecipe` och dess schema ändras inte.
- Mocken svarar med det kompakta formatet och gör om det med samma `fromCompactDish`, så att e2e prövar vägen.
- Mätningen: `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai tests/eval/suggest-dishes.eval.ts` med varm modell, före och efter, med den inställning som 12.1 rekommenderar. Rapporten har token ut, tid, antal giltiga förslag och antal varor från lagret per förslag.
- Nås inte målet med tre rätter: pröva högst 8 rader och 5 steg per rätt, mät igen, och skriv valet och siffrorna i beslutsloggen. Antalet rätter står kvar (öppen fråga 21).

**Never:**
- Ingen ändring av `RecipeDraft`, `fromAiRecipe`, förhandsgranskningen eller databasen.
- Inga förkortade nycklar i JSON (`t`, `a`): de gör prompten svårare för modellen och sparar lite.
- Ingen ändring av bildanalysen eller importen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vara i lagret | Rad `{ text: "2 gula lökar", amount: 2, unit: "st", name: "gul lök" }` | `AiRecipe`-rad med `hint` `{ name: "gul lök", section: "Övrigt", location: "Skafferi", defaultUnit: "st" }`; matchas mot katalogen på namnet | N/A |
| Ny vara | Rad med `new: { section: "Mejeri", location: "Kyl", defaultUnit: "dl" }` | `hint` med de värdena | N/A |
| Vag rad | `{ text: "salt", amount: null, unit: null, name: "salt" }` | `isVague: true` | N/A |
| Antal utan enhet | `{ text: "2 ägg", amount: 2, unit: null }` | `isVague: false`, `unit: null` | N/A |
| Okänd avdelning i `new` | `section: "Godis"` | Ogiltigt svar | Nytt försök som förut |
| Titel att undvika | En titel under "Föreslå inte:" | Ogiltigt svar | Nytt försök som förut |
| Mätning | Varm modell, tre körningar | Minst 25 % färre token, median högst 40 s, lika många giltiga | Annars färre rader och steg, mätt igen |

</frozen-after-approval>

## Code Map

- `src/server/ai/schemas.ts` (`aiRecipe`, `aiRecipeIngredient`, `aiIngredientHint`, `suggestDishesAnswerFor`) -- det nya schemat bredvid
- `src/server/ai/service.ts` (`suggestDishes`, `inputLimits.suggest`) -- anropet och omvandlingen
- `src/server/ai/prompts/suggest-dishes.md` -- prompten
- `src/server/ai/adapters/mock.ts` och `tests/fixtures/ai/` -- mockens svar
- `src/features/suggestions/actions/suggest-from-pantry.ts` -- oförändrad, prövas med testerna som finns
- `tests/eval/suggest-dishes.eval.ts`, `suggest-checks.ts`, `timing.ts` (12.1) -- mätningen

## Tasks & Acceptance

**Execution:**
- [ ] Mätning före med 12.1:s utvärdering, sparad i rapporten
- [ ] `src/server/ai/schemas.ts` (+ `schemas.test.ts`) -- `compactDish`, `suggestDishesAnswerCompactFor`
- [ ] `src/server/ai/compact-dish.ts` (+ test) -- `fromCompactDish` med tabelltest
- [ ] `src/server/ai/service.ts` (+ `service.test.ts`) -- `suggestDishes` med det kompakta schemat och omvandlingen; `maxOutputTokens` sänks efter mätningen
- [ ] `src/server/ai/prompts/suggest-dishes.md` -- prompten för schemat
- [ ] `src/server/ai/adapters/mock.ts`, `tests/fixtures/ai/` (+ `mock.test.ts`) -- det kompakta formatet
- [ ] Mätning efter, och vid behov med färre rader och steg
- [ ] `docs/lm-studio.md`, `docs/oppna-fragor.md` (T5), `docs/beslutslogg.md` -- siffrorna och beslutet

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given mätningen med varm modell, when den körs tre gånger före och efter, then är token ut minst 25 % färre, medianen högst 40 s och antalet giltiga förslag inte lägre.

## Implementation Notes

- **Beslut (förslag): `new` bara för varor utanför lagret.** `matchIngredients` behöver avdelning, plats och enhet bara för en ny katalogvara (AD-6). En vara i lagret finns redan i katalogen och matchas på namnet.
- **Beslut (förslag): `stepIndexes` står kvar.** Stegläget visar stegets receptrader (4.2), och ett sparat förslag ska fungera som andra recept.
- **Risk: modellen skriver ett annat namn än lagrets** ("lök" i stället för "gul lök") och får inget `new`. Då blir det en ny katalogvara under Övrigt i förhandsgranskningen, där Pontus kan rätta kopplingen. Prompten säger att namnet ska vara samma som i lagret, och utvärderingen räknar hur ofta en rad utan `new` inte matchar.
- **Risk: JSON med blanksteg.** Modellen kan skriva indraget JSON, vilket kostar token. Notera i mätningen om svaret är indraget; LM Studio styr det inte.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai tests/eval/suggest-dishes.eval.ts` -- expected: målen nådda

**Manual checks (if no CLI):**
- Be om förslag i Recept mot LM Studio, spara ett och öppna stegläget: stegen har sina receptrader.
