---
title: 'Story 9.14: Matförslag per butik och veckans bästa butik'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: '0554e07'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-5-ai-forslag-fran-erbjudanden.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-13-erbjudanden-fran-flera-butiker.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus skrev: "När jag vill ha matförslag vill jag nog ha från butik från butik för att inte behöva åka runt hela stan att handla". Med erbjudanden från flera butiker (9.13) bygger AI-förslagen bara på en butik, den valda, och Pontus kan inte välja eller se vilken butik som lönar sig mest.

**Approach:**
- "Veckans bästa butik": en ren domänfunktion `bestStore` räknar per butik, utan AI, hur många erbjudanden som passar lagret och det Pontus brukar laga (recept i biblioteket), med bonus för angiven rabatt och turordning på antal erbjudanden.
- Arket Veckans erbjudanden visar en rad överst när minst två butiker har erbjudanden: "Veckans bästa butik: [Maxi] 12 erbjudanden passar det du brukar laga".
- Knappen "Föreslå rätter från veckans erbjudanden" får med minst två butiker en butiksväljare (filterpiller) med bästa butiken förvald. Jobbet får `storeId` och förslagen bygger bara på den butikens erbjudanden och lagret. Resultatets rubrik nämner butiken: "Med veckans erbjudanden från Maxi". Med en butik fungerar knappen som förut.

## Boundaries & Constraints

**Always:**
- Poängen räknas utan AI och utan nätverk; inget loggas om prompter eller svar.
- Moduler (AD-1): sidan `lista/list-offers.tsx` läser lager (`pantry`) och recept (`recipes`) och skickar resultatet till arket; `offers` importerar inte dem.
- Minst 44 px tryckyta (Epic 11-komponenten `FilterPills`). Inga osynliga tecken i källkoden annat än som `\u`-escapes.

**Never:**
- Ingen migration. Ingen ändring av `offers-list.tsx` eller butiksetikettens stil (Story 9.15).
- Inget AI-anrop för "bästa butik".

## I/O & Edge-Case Matrix

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| En butik med erbjudanden | Arket öppnas | Ingen rad, ingen väljare; knappen som förut; rubriken "AI-förslag från veckans erbjudanden" |
| Två butiker med erbjudanden | Arket öppnas | Raden "Veckans bästa butik: Maxi · N erbjudanden passar det du brukar laga"; väljaren med Maxi förvald |
| Inget erbjudande passar | Lager och recept matchar inget | Bästa butik efter rabatt, sedan antal; texten "N erbjudanden" |
| Annan butik vald | Pontus väljer Krokom | Jobbet får `storeId` för Krokom; rubriken "Med veckans erbjudanden från Krokom" |
| Lager eller recept kan inte läsas | Läsfel | Raden utelämnas (loggas som `best_store_unavailable`); väljaren förvaljer första butiken |
| Butik som inte är användarens | `storeId` från annan användare | `offers_store_missing` (som i 9.13) |

## Code Map

- `src/features/offers/domain/best-store.ts` (+ test) -- `bestStore`, `bestStoreReason`
- `src/features/recipes/server.ts` -- `getIngredientRecipeCounts`
- `src/app/(app)/lista/list-offers.tsx` -- läser lager och recept, räknar bästa butik, skickar `best`
- `src/features/offers/ui/offers-sheet.tsx`, `suggest-from-offers-button.tsx` -- raden och väljaren
- `src/features/suggestions/` -- `storeName` i resultatet; `src/features/recipes/ui/` -- rubriken

## Tasks & Acceptance

**Execution:**
- [x] Domän: `bestStore` och `bestStoreReason` med enhetstester
- [x] Sida: lager och receptfrekvens till `bestStore`
- [x] Ark: raden "Veckans bästa butik", väljare vid knappen, `storeId` i jobbet
- [x] Resultat: `storeName` (butikens kortnamn, bara när Pontus valde bland flera) och rubriken
- [x] Tester: enhet (domän, ark, förslag) och e2e (bästa butik, väljare, rubrik)

**Acceptance Criteria:**
- Given erbjudanden från flera butiker, when Pontus öppnar AI-förslagen, then väljer han en butik och förslagen bygger bara på den butikens erbjudanden och lagret.
- Given erbjudanden från flera butiker och lager och recept, when arket visas, then står "Veckans bästa butik" överst, räknad utan AI, och den är förvald när förslag beställs.
- Given `pnpm lint`, `pnpm typecheck`, `pnpm test`, `AI_PROVIDER=mock pnpm build` och e2e för `offer-suggestions` och `offers-link`, when de körs, then lyckas alla.

## Vid bygget

- **Ingen migration.** Allt som behövs finns: `store_offer.ingredient_id`, `saving_percent`, `store_id`, lagret och receptens rader.
- **Poängen.** Ett erbjudande passar om dess katalogvara finns i lagret eller används av minst ett recept. Passande erbjudande ger 1 poäng, +0,5 om varan finns i lagret, +0,25 per recept som använder den (högst tre), och varje erbjudande ger upp till 0,5 för angiven rabatt (100 % är 0,5). Lika poäng avgörs av antal erbjudanden, sedan arkets butiksordning.
- **Receptfrekvens.** Ny `getIngredientRecipeCounts` i `recipes/server.ts` räknar recept per katalogvara ur samma rader som biblioteket läser.
- **Raden syns bara med minst två butiker som har erbjudanden;** annars lämnas arket oförändrat.
- **Rubrikens butiksnamn** är etikettens kortnamn (`storeBadgeText`), och `storeName` sätts bara när klienten skickade `storeId` (alltså med minst två butiker); med en butik står rubriken som förut. `storeBadgeText` och `storeBadgeTone` exporteras nu från `offers`.
- **Befintliga tester.** Filterpillren "Visa butik" och väljaren har samma butiksnamn som radioknappar, så två gamla tester (enhet och e2e) avgränsar nu till gruppen "Visa butik".

## Spec Change Log

## Review Triage Log

Ingen separat granskning (tokensnål loop, ingen migration): självgranskning mot kriterierna. Poängfunktionen är ren och enhetstestad, `storeId` kontrolleras mot användarens butiker som i 9.13, och ingenting loggas om prompter eller svar. Inget behövde rättas.
