---
title: 'Story 12.3: Kortare svar för AI-förslag'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
baseline_commit: '4070e6ee7a8f86f36f734c06d45c980c954e8498'
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
- Nås inte målet med tre rätter: pröva högst 8 rader och 5 steg per rätt, mät igen, och skriv valet och siffrorna i beslutsloggen. Antalet rätter står kvar (öppen fråga 25).

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
- [x] Mätning före: flyttad till Epic 12-mätningen. Utgångsläget räknat med Qwen3.6:s tokeniserare på mockens svar (1 616 och 1 274 token), och 12.1:s mätning (45,9 s, 1 470–2 130 token)
- [x] `src/server/ai/schemas.ts` (+ `schemas.test.ts`) -- `compactDish`, `suggestDishesAnswerCompactFor`
- [x] `src/server/ai/compact-dish.ts` (+ test) -- `fromCompactDish` med tabelltest
- [x] `src/server/ai/service.ts` (+ `service.test.ts`) -- `suggestDishes` med det kompakta schemat och omvandlingen; `maxOutputTokens` sänks efter mätningen
- [x] `src/server/ai/prompts/suggest-dishes.md` -- prompten för schemat
- [x] `src/server/ai/adapters/mock.ts`, `tests/fixtures/ai/` (+ `mock.test.ts`) -- det kompakta formatet
- [x] Mätning efter: flyttad till Epic 12-mätningen. Räknat med tokeniseraren: 1 073 och 905 token (33 % och 29 % färre)
- [x] `docs/lm-studio.md`, `docs/oppna-fragor.md` (T5), `docs/beslutslogg.md` -- siffrorna och beslutet

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.
- Given mätningen med varm modell, when den körs tre gånger före och efter, then är token ut minst 25 % färre, medianen högst 40 s och antalet giltiga förslag inte lägre.

## Implementation Notes

- **Beslut (förslag): `new` bara för varor utanför lagret.** `matchIngredients` behöver avdelning, plats och enhet bara för en ny katalogvara (AD-6). En vara i lagret finns redan i katalogen och matchas på namnet.
- **Beslut (förslag): `stepIndexes` står kvar.** Stegläget visar stegets receptrader (4.2), och ett sparat förslag ska fungera som andra recept.
- **Risk: modellen skriver ett annat namn än lagrets** ("lök" i stället för "gul lök") och får inget `new`. Då blir det en ny katalogvara under Övrigt i förhandsgranskningen, där Pontus kan rätta kopplingen. Prompten säger att namnet ska vara samma som i lagret, och utvärderingen räknar hur ofta en rad utan `new` inte matchar.
- **Risk: JSON med blanksteg.** Modellen kan skriva indraget JSON, vilket kostar token. Notera i mätningen om svaret är indraget; LM Studio styr det inte.

## Spec Change Log

- Vid bygget:
  - **Byggd på `4070e6e`** (`baseline_commit`), epicgrenen efter 12.1. 12.2 och 9.1 byggs samtidigt i andra worktrees. Besluten (förslag) är godkända som de stod: `new` bara för varor utanför lagret, och `stepIndexes` står kvar.
  - **`new` är obligatoriskt men kan vara `null`,** inte valfritt (`new?`). Alla egenskaper i porten är obligatoriska så att leverantörer med strikta JSON-scheman (OpenAI, Anthropic) tar schemat (kommentaren överst i `schemas.ts`). Modellen skriver alltså `"new":null` för en vara ur lagret.
  - **Avdelning, plats och enhet i `new` är uppräkningar** (`z.enum`) med katalogens värden, så att "Godis" ger ett ogiltigt svar och ett nytt försök, som I/O-matrisen säger. Porten får inte importera katalogen (AD-1), så listorna finns som kopior i `schemas.ts` (`catalogSections`, `catalogLocations`, `catalogUnits`), och `tests/lint/ai-catalog-lists.test.ts` kontrollerar att de är katalogens. Radens `unit` är fri text som förut; katalogen tolkar den (AD-12).
  - **Högst 10 rader och 6 steg står bara i prompten, som i dag.** Strikta JSON-scheman tar inte `maxItems`, och en kontroll i schemat skulle ge nya försök (och mer tid) för ett svar som går att använda.
  - **En rad utan mängd är vag och får ingen enhet** i `AiRecipe` (`aiRecipeIngredient` kräver det), också om modellen skrev en enhet. Enheten används då som `defaultUnit` för katalogen, före `st`.
  - **`suggestDishesAnswerFor` och `suggestDishesAnswer` togs bort.** De användes bara av `suggestDishes`, mocken och testerna, som nu använder `suggestDishesAnswerCompactFor` och `suggestDishesAnswerCompact`. Kontrollen av stegindex delas av `aiRecipe` och `compactDish` (`checkStepIndexes`).
  - **Prompten ber om JSON utan indrag och radbrytningar,** eftersom indraget JSON kostar token (risken i Implementation Notes).
  - **Mockens svar:** båda svarsfilerna är skrivna om till det kompakta formatet. Alla rader i dem var varor ur `suggest-dishes.pantry.json`, så de fick `new: null`, och "Morotssoppa med vitlök" fick en rad utanför lagret (`1 grönsaksbuljongtärning` med `new`), så att mocken och e2e prövar båda vägarna. `ai-suggestions.spec.ts` läser de nya fälten (`name`, `amount`, `new`), lägger bara varorna ur lagret i katalogen och lagret, och visar att förhandsgranskningen föreslår grönsaksbuljongen som ny vara ("Ny") och att sparandet gör katalogvaran med avdelning, plats och enhet från `new` (efter granskningen).
  - **Utvärderingen:** `installUsageMeter` sparar också svarstexterna under mätningen (aldrig i raderna eller tidrapporterna), och `answerShape` i `suggest-checks.ts` läser det sista svaret: kompakt eller fullt, indraget eller inte, rader med `new` och rader utan `new` vars namn inte finns i lagret. `suggest-report.md` har token ut, antal anrop, rader ur lagret per förslag och formatet per anrop.
  - **Mätningen mot LM Studio är flyttad till Epic 12-mätningen.** Pontus ändrade planen under bygget: Epic 12 mäts en gång när epicen är klar, inte per story. I stället räknades token med Qwen3.6:s egen tokeniserare (`tokenizer.json` i LM Studios modellmapp, läst med `tokenizers` från LM Studios egen Python, utan att LM Studio anropades eller ändrades) på mockens svar, före (`4070e6e`) och efter:

    | Svar | Före, på en rad | Efter, på en rad | Färre | Före, indraget | Efter, indraget |
    | --- | --- | --- | --- | --- | --- |
    | `suggest-dishes` (23 rader) | 1 616 | 1 073 | 33 % | 2 947 | 1 964 |
    | `suggest-dishes-andra` (18 rader före, 19 efter) | 1 274 | 905 | 29 % | 2 342 | 1 676 |
    | `suggest-dishes` med `new` på varje rad | 1 616 | 1 455 | 10 % | 2 947 | 2 717 |

    12.1:s svar på 1 470–2 130 token stämmer med JSON på en rad, inte indraget. Vid 44 token per sekund ger 543 token färre ungefär 12 s kortare, alltså ungefär 34 s i stället för 45,9 s i median varmt. Målen (minst 25 % färre token, högst 40 s, lika många giltiga) och antalet rader utan `new` som inte matchar prövas i Epic 12-mätningen; når de inte målet där prövas 8 rader och 5 steg, som specen säger. `mock.test.ts` kontrollerar att mockens kompakta svar är minst 25 % kortare i tecken än samma rätter som `AiRecipe`.
  - **`maxOutputTokens` sänktes från 4 000 till 3 000** utifrån räkningen, inte en mätning: ungefär dubbelt det längsta kompakta svaret (1 455 token med `new` på varje rad). Ett svar som skenar stannar efter ungefär 70 s, så ett nytt försök hinner inom 115 s. **Efter granskningen:** JSON på en rad begärs bara i prompten; LM Studio styr det inte. Ett indraget svar i full storlek (30 rader och 18 steg) kan bli ungefär 3 500 token och kapas då vid 3 000. Taket står kvar på 3 000 tills vidare, ett kapat svar loggas som `suggest_truncated`, och Epic 12-mätningen avgör det slutliga taket: det höjs om något giltigt svar kommer nära 3 000 token (`epic-12-context.md`, Slutmätning Epic 12).
  - **Före Epic 12-mätningen:** ett försök att starta mätningen kl. 21.22 väntade, eftersom LM Studio fick anrop som inte var mina (bildanalys kl. 21.21 och 21.30). Inget anrop till LM Studio gjordes i storyn.
  - **Integrationstesterna** kördes två gånger: den första gången stod Docker (OrbStack) still i ungefär 15 minuter medan Macen var i vila, så ett test i `pantry.test.ts` fick tidsgräns och `pantry-label.test.ts` såg en klocka som gick efter. Andra gången, med `caffeinate`, gick alla 467 igenom.

## Review Triage Log

Iteration 1. En samlad granskare (den snabbare varianten för små stories).

**Patch:**
- Kapade svar:
  - `suggestDishes` loggar `suggest_truncated` när modellen stannar vid taket, som `locateItems` gör med `locate_truncated`. Bara händelsen loggas, aldrig svaret.
  - Utvärderingen visar token ut per försök (inte bara summan) och en kolumn "Kapat vid taket" (`finish_reason` `length`). `installUsageMeter` sparar varje försök (`attemptOf`) i stället för bara svarstexten.
  - Taket står kvar på 3 000 token. Under "Vid bygget" står att JSON på en rad bara begärs i prompten, så ett indraget svar i full storlek kan bli ungefär 3 500 token, och att Epic 12-mätningen avgör taket.
- Kommentaren överst i `schemas.ts` nämner undantaget: `new` i ett förslags rad har avsiktligt strikta uppräkningar, så en okänd avdelning ger ett ogiltigt svar och ett nytt försök.
- E2E: `ai-suggestions.spec.ts` lägger inte grönsaksbuljongen i katalogen eller lagret. Katalogvaror går inte att ta bort (inte ens med service role), så en vara från en tidigare körning får ett eget namn som inget matchar, och förlorar sina synonymer. Testet visar att förhandsgranskningen märker raden "Ny" (och ingen annan rad), och att sparandet gör katalogvaran med avdelning, plats och enhet från `new`.
- Slutmätningen: avsnittet "Slutmätning Epic 12" i `epic-12-context.md` listar 12.3:s mål (minst 25 % färre token ut än 12.1, högst 40 s i median varmt, inte färre giltiga förslag), andelen rader utan `new` som inte matchar, reserven med 8 rader och 5 steg, beslutet om taket och väckningens prov från 12.2 (`warm-up.eval.ts`), och att mätningen skriver vilka stories som var ihopslagna när den kördes.

**Avvisat:** inget.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
- `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai tests/eval/suggest-dishes.eval.ts` -- expected: målen nådda

**Manual checks (if no CLI):**
- Be om förslag i Recept mot LM Studio, spara ett och öppna stegläget: stegen har sina receptrader.
