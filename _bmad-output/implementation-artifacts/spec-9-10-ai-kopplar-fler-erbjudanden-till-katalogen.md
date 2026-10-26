---
title: 'Story 9.10: AI kopplar fler erbjudanden till katalogen'
type: 'feature'
created: '2026-10-27'
status: 'draft'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-1-veckans-erbjudanden-fran-butikens-lank.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-7-erbjudanden-fran-inklistrad-text.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-12-4-ai-jobb-i-ko-med-ai-forslag-forst.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-bekrafta-ratta-eller-avvisa-lagerforslag.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-Matkoll-2026-10-25/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Villkor:** storyn byggs bara om mätningen i 9.1 (T12) visar att färre än hälften av erbjudandena på mat från ica.se får en katalogingrediens. Annars avslutas den utan kod, och beslutet och siffrorna skrivs i beslutsloggen och T12.

**Problem:** Länken (9.1) kopplar erbjudanden till katalogen bara när namnet eller en synonym stämmer. ICA skriver ofta produktnamn ("Herrgård, Präst, Grevé" i stället för ost, "Bregott" i stället för smör). Ett erbjudande utan katalogingrediens ger ingen etikett på inköpslistan, inget recept i filtret Erbjudanden och ingen rad i "Fyll på lagret" (FR-51–FR-53).

**Approach:**
- Ett AI-jobb av sorten `offers` med `source: "match"` tar veckans okopplade erbjudanden från länken och användarens katalogingredienser och föreslår en katalogingrediens per erbjudande, eller ingen.
- Pontus granskar förslagen i arket Veckans erbjudanden ("Koppla 24 erbjudanden till katalogen") och sparar de kopplingar som stämmer. En bekräftad koppling sparas på erbjudandet och som synonym i katalogen, så att samma namn hittas utan AI nästa vecka.

## Boundaries & Constraints

**Always:**
- **Jobbet** följer AD-28: `POST /api/ai/jobs` med `{ kind: "offers", clientKey, storeId, weekStart, match: true }`. Förhandskontrollen läser veckans erbjudanden från länken utan `ingredient_id`; inga ger `offers_none` direkt, utan jobb. `context` är `{ storeId, weekStart, source: "match" }`. Körtid 120 s.
- **Portmetoden** `matchOffers(input, signal)` (AD-9) får högst 60 okopplade erbjudanden som numrerade rader (`label`, högst 120 tecken) och högst 300 katalogingredienser som numrerade namn (inom 3 000 tecken, de som används i recept först, sedan i lagret, sedan resten i bokstavsordning). Svaret är `{ matches: { offer: number, ingredient: number | null }[] }`. Varje par kontrolleras för sig: ett index utanför listorna eller ett erbjudande två gånger lämnas ute. Samma regler som andra metoder: `generateText` med `Output.object`, högst två nya försök vid ogiltigt svar, 100 s per försök och 115 s totalt.
- **Prompten** `prompts/match-offers.md`: listorna är data; välj bara en ingrediens som varan verkligen är (ost för "Herrgård", inte "smörgås"); svara `null` när ingen passar; hitta aldrig på en ny ingrediens.
- **Resultatet** är `{ proposals: { offerId, label, ingredientId, ingredientName }[] }` i `ai_job.result`, bara förslag med en ingrediens. Inget skrivs av jobbet (AD-2).
- **Granskningen** visar en rad per förslag: "Herrgård, Präst, Grevé → ost" med bock (förvald på) och "Spara 18 kopplingar". Pontus kan avmarkera ett förslag. Ingen fri sökning i katalogen; ett fel avmarkeras.
- **Sparandet** är Server Action `confirmOfferMatches({ storeId, weekStart, matches })` i `offers/actions`, ett flöde över två moduler som är idempotent (AD-1):
  1. `catalog.commitIngredients` med varje bekräftat erbjudandes `name` som synonym till den valda ingrediensen. Ett namn som redan är synonym till en annan ingrediens hoppas över och räknas.
  2. Postgres-funktionen `set_store_offer_ingredients(store, week, items)` (`security invoker`) sätter `ingredient_id` och `section` på erbjudandena, bara för rader som fortfarande finns och saknar katalogingrediens.

  Ett nytt försök efter ett fel ger samma resultat. `revalidateFor('store_offer')` och `revalidateFor('ingredient_synonym')`.
- Det här är det enda undantaget från att erbjudanden aldrig skriver katalogen, och det kräver Pontus tryck. Inga nya katalogingredienser skapas.
- Ingången är raden "24 erbjudanden saknar koppling till katalogen." med textknappen "Koppla med AI" i arket, bara när länkens erbjudanden har okopplade rader.
- E2E-specen har den egna e2e-användaren `e2e-erbjudanden-koppla@matkoll.test`.

**Never:**
- Inga nya katalogingredienser och ingen ändring av en ingrediens namn, avdelning eller plats.
- Ingen koppling utan Pontus tryck, och ingen automatisk körning efter en hämtning.
- Ingen koppling av erbjudanden från text eller foto. De får redan grundformen från `extractOffers` (9.7).
- Inga priser till modellen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ingång | 91 erbjudanden från länken, 24 utan katalogingrediens | Raden "24 erbjudanden saknar koppling till katalogen." med "Koppla med AI" | N/A |
| Alla kopplade | Inga okopplade | Ingen rad | N/A |
| Starta | "Koppla med AI" | "Kopplar erbjudandena … Du kan göra annat under tiden." och "Avbryt" | N/A |
| Klart | Mockens svar: 18 förslag, 6 `null` | "Koppla 18 erbjudanden till katalogen" med 18 rader och bockar | N/A |
| Avmarkera | Ett förslag avmarkeras | "Spara 17 kopplingar" | N/A |
| Spara | "Spara 17 kopplingar" | 17 erbjudanden får `ingredient_id`. 17 synonymer i katalogen. "Kopplade 17 erbjudanden." Etiketterna på inköpslistan och i Recept följer | N/A |
| Nästa vecka | Samma "Herrgård, Präst, Grevé" i länken | Kopplas av `matchIngredients` utan AI | N/A |
| Synonymen finns för en annan vara | "bregott" är redan synonym till "margarin" | Erbjudandet kopplas, synonymen hoppas över. "1 synonym fanns redan." | N/A |
| Erbjudandet borta | Pontus har tagit bort ett erbjudande före "Spara" | Det hoppas över | N/A |
| Ny hämtning under tiden | "Hämta igen" före "Spara" | Rader som inte finns kvar hoppas över, och synonymerna sparas ändå | N/A |
| Modellen svarar fel | Index 70, samma erbjudande två gånger | De lämnas ute | N/A |
| Inget håller | Alla par ogiltiga | Nytt försök enligt AD-9, sedan "Det gick inte att tolka svaret. Försök igen." | `ai_invalid` |
| AI-tjänsten svarar inte | Mockens reserverade indata | "AI-tjänsten svarar inte just nu. …" med "Försök igen" | `ai_unavailable` |
| Förfalskad indata | En ingrediens som inte är användarens | Inget sparas | `offers_failed` |

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/epic-9-context.md` -- beslut, felkoder och e2e-användare
- `spec-9-1-…md` -- `offerName`, `matchIngredients` och T12
- `spec-9-7-…md`, `spec-12-4-…md` -- jobbet `offers` och mönstret för förhandskontroller
- `spec-6-2-…md` -- mönster för granskning med bekräftelse och synonymer
- `src/server/ai/service.ts`, `schemas.ts`, `prompts/`, `adapters/mock.ts` -- porten
- `src/features/catalog/server.ts` (`commitIngredients`, listan över ingredienser) -- katalogen
- `src/features/offers/` (`ui/offers-sheet.tsx`, `data/`, `actions/`) -- modulen
- `src/app/api/ai/jobs/route.ts` -- jobben

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/<ts>_offers_set_ingredients.sql` (via `supabase migration new`) -- `set_store_offer_ingredients(store uuid, week date, items jsonb)`. Typerna genereras om -- AD-25
- [ ] `src/server/ai/schemas.ts` (+ test) -- `matchOffersAnswer` och `parseOfferMatches(answer, offerCount, ingredientCount)` -- AD-9
- [ ] `src/server/ai/prompts/match-offers.md`, `prompts.ts` -- prompten
- [ ] `src/server/ai/service.ts` (+ test), `index.ts` -- `matchOffers(input, signal, options?)`, `isValidMatchOffersInput` och `inputLimits.matchOffers` (60 erbjudanden, 300 ingredienser, 3 000 tecken) -- AD-9
- [ ] `src/server/ai/adapters/mock.ts` (+ test), `tests/fixtures/ai/koppla-erbjudanden.response.json`, `manifest.json` -- påhittat svar och de reserverade indata
- [ ] `tests/eval/match-offers.eval.ts` -- tid och andel rätta kopplingar mot en påhittad facit. Körs för hand
- [ ] `src/features/offers/actions/match-offers.ts` (+ test) -- serverfunktionen för jobbet: läser okopplade erbjudanden och katalogen, anropar porten och bygger förslagen -- FR-51–FR-53
- [ ] `src/features/offers/actions/confirm-offer-matches.ts` (+ test) -- `requireUser()`, Zod, `commitIngredients`, `set_store_offer_ingredients` och revalideringen -- AD-1, AD-6
- [ ] `src/app/api/ai/jobs/route.ts` (+ test) -- `match: true` för sorten `offers`, med förhandskontrollen -- AD-28
- [ ] `src/features/offers/ui/offers-match.tsx` (+ test), `offers-sheet.tsx` -- raden "Koppla med AI", läget, granskningen med bockar och "Spara N kopplingar"
- [ ] `tests/integration/offers.test.ts` -- `set_store_offer_ingredients` (bara okopplade rader, en annan användares ingrediens)
- [ ] `tests/e2e/offers-match.spec.ts` (+ `support.ts`, `global-setup.ts`) -- egen e2e-användare `e2e-erbjudanden-koppla@matkoll.test`. Testerna hämtar fixtursidan, startar kopplingen, avmarkerar ett förslag, sparar och kontrollerar etiketten på inköpslistan och att en ny hämtning kopplar utan AI -- matrisen
- [ ] `docs/beslutslogg.md` -- en post för storyn, och siffrorna i T12

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- **Beslut (förslag): en egen liten portmetod, `matchOffers`, i stället för `extractOffers`.** Svaret är bara par av index, vilket är mycket kortare än namn och priser, och modellen kan bara välja bland Pontus egna ingredienser, så den hittar inte på nya.
- **Beslut (förslag): en bekräftad koppling blir en synonym.** Annars måste samma produktnamn kopplas med AI varje vecka. Synonymen följer AD-6: den skrivs bara av `catalog`, och bara efter Pontus tryck.
- **Beslut (förslag): bara länkens erbjudanden.** Text och foto ger redan grundformen från AI:n.
- **Risk: katalogen är för stor för kontexten.** 300 namn ryms inom 3 000 tecken med korta namn. Fler kapas i den ordning som står ovan, och utvärderingen visar om rätt ingrediens ofta saknas.
- **Risk: fel koppling ger fel synonym.** Granskningen visar varje förslag, och en synonym kan rättas i förhandsgranskningen av ett recept som förut.
- Loggar innehåller bara felkoder, sort, antal och jobbets id.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas

**Manual checks (if no CLI):**
- Vid 375 px och 1280 px, i ljust och mörkt läge och med 200 % text: raderna med "→" och bockarna radbryts utan vågrät scroll.
- Med VoiceOver: en rad läses som "Herrgård, Präst, Grevé, kopplas till ost, vald".
- `AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/match-offers.eval.ts`: tid och andel rätta kopplingar skrivs i T12.
