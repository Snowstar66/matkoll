---
title: 'Story 2.2: Lägga till och ändra lagervaror'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '5095525f81bdf69805dcd4403dd63cb7d262a12c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Matkoll-2026-10-25/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pontus kan se lagret men inte föra in något. Hen behöver lägga till och ändra varor, med eller utan mängd, kopplade till katalogen.

**Approach:** Arket Lagervara öppnas med "+" eller ett tryck på en vara. Det söker i katalogen (namn och synonymer) eller skapar en ny katalogingrediens, tar valfri mängd och enhet och en plats som föreslås från katalogen. Sparningen går via `setPantryItems` (AD-19) och `commitIngredients` för nya ingredienser (AD-6).

## Boundaries & Constraints

**Always:** `setPantryItems(items)` sätter mängden exakt för ingrediens, plats och enhet och skapar raden vid behov; en vara utan mängd sparas som obegränsad (`amount` och `unit` null) (AD-19). En ny katalogingrediens skapas bara i den sparande actionen via `commitIngredients` (AD-6). Ändrar Pontus plats eller enhet på en befintlig vara flyttas raden (den gamla tas bort och den nya sätts i samma transaktion, Postgres-funktion med `security invoker`). Actions: `requireUser()`, samma Zod-schema som formuläret, `Result`, felkoder `pantry_<orsak>`, `revalidateFor('pantry_item')` som revaliderar `/hemma` och `/recept` (layout). Mängd tolkas med `parseQuantity`, enhet från `UNITS`, plats från `LOCATIONS`. Ingrediensväljaren återanvänds via `src/components/` (flytta den gemensamma delen ur `recipes/ui`). Arket har `isDirty` och "Släng ändringarna?". Kör aldrig `supabase db reset`.

**Never:** Ingen borttagning (2.3) förutom att flytta en rad vid plats- eller enhetsbyte. Ingen `addToPantry` (Epic 3). Ingen kamera (Epic 6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Öppna nytt | "+" med Frys vald | Arket Lagervara med sökfältet i fokus och platsen Frys förvald | N/A |
| Välj ingrediens | Sök "gul", välj "Gul lök" | Platsen föreslås från katalogingrediensen (Pontus kan ändra), standardenhet föreslås | N/A |
| Ny ingrediens | Sök "Saffran", "Lägg till Saffran som ny" | Fält för avdelning och plats; vid sparning skapas katalogingrediensen | N/A |
| Med mängd | Mjölk, "1,5", "l", Kyl | Raden får 1,5 l i Kyl; finns raden redan sätts mängden till 1,5 (inte ökning) | N/A |
| Utan mängd | Salt, tom mängd | Sparas som obegränsad och visas under "Finns hemma" | N/A |
| Ändra | Tryck på "Mjölk 1 l", ändra till 2 l | Samma rad får 2 l | N/A |
| Byt plats | Mjölk från Kyl till Frys | Raden flyttas; finns redan mjölk med samma enhet i Frys sätts den till den nya mängden | Allt eller inget |
| Ogiltig mängd | "två", "0", "-1" | "Ange ett tal större än 0." vid fältet; inget sparas | N/A |
| Stäng med ändringar | Ändrat formulär, stäng | "Släng ändringarna?" | N/A |
| Status uppdateras | Spara | Hemma, receptbiblioteket och receptvyn revalideras | N/A |

</frozen-after-approval>

## Code Map

- `src/features/pantry/` -- från 2.1: tabell, `listPantry`, `getPantrySnapshot`, Hemma-UI
- `src/features/catalog/server.ts` -- `searchIngredients` (Server Action), `commitIngredients`, `getIngredientNames`; behöver en ny läsfunktion för en ingrediens plats, avdelning och standardenhet
- `src/features/recipes/ui/ingredient-picker.tsx` -- väljaren som ska flyttas (gemensam del) till `src/components/`
- `src/components/sheet.tsx`, `field.tsx`, `button.tsx`, `filter-pills.tsx` -- arket och fälten
- `src/lib/revalidate.ts` -- lägg till `pantry_item`
- `src/lib/errors.ts` -- nya `pantry_*`-koder

## Tasks & Acceptance

**Execution:**
- [x] `src/features/catalog/` -- `getIngredientDefaults(ids)` i `server.ts`: plats, avdelning och standardenhet per id (läsfunktion) -- AD-1
- [x] `src/components/ingredient-picker.tsx` (+ test) -- den gemensamma väljaren (sökning, "Lägg till … som ny", Esc, senaste svaret) flyttad ur `recipes/ui`; receptimporten använder den nya platsen -- återanvändning
- [x] ny migration (+ `pnpm db:types`) -- `set_pantry_items(items jsonb, replace_id uuid null)` (`security invoker`): upsert på `(user_id, ingredient_id, location, unit)` som sätter mängden; när `replace_id` anges tas den raden bort först i samma transaktion -- AD-19
- [x] `src/features/pantry/domain/` (+ test) -- `pantryItemFormSchema` (ingrediens: befintlig eller ny med namn/avdelning/plats, mängd via `parseQuantity` > 0 eller tom, enhet i `UNITS` eller null, plats i `LOCATIONS`); tom mängd ⇒ obegränsad utan enhet -- AD-12
- [x] `src/features/pantry/data/`, `actions/set-pantry-item.ts` (+ tester) -- `setPantryItems` och Server Action `savePantryItem(form)`: `requireUser`, Zod, `commitIngredients` för ny ingrediens, `set_pantry_items`, `revalidateFor('pantry_item')`; `pantry_save_failed` med svensk text -- AD-2, AD-19
- [x] `src/lib/revalidate.ts` -- `pantry_item` → `/hemma` och `/recept` (layout) -- AD-18
- [x] `src/features/pantry/ui/pantry-item-sheet.tsx` -- arket enligt matrisen; "+" i Hemma-rubriken och tryck på rad eller etikett öppnar det; `useActionState`; `isDirty` -- UX
- [x] `tests/integration/pantry.test.ts` (utökad) -- sätt, skriv över, flytta (allt eller inget), obegränsad, RLS för funktionen -- matrisen
- [x] `tests/e2e/pantry.spec.ts` (utökad) -- lägg till befintlig ingrediens med mängd, ny ingrediens, obegränsad vara, ändra mängd, byt plats, ogiltig mängd, "Släng ändringarna?" -- matrisen

**Acceptance Criteria:**
- Given `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e`, when de körs, then lyckas alla.

## Implementation Notes

- Plats och enhet förs med träffarna från `searchPantryIngredients`, eftersom AD-1 bara tillåter läs-actions som heter search*.
- En ny katalogingrediens får varans plats. Arket lägger bara till fältet Avdelning (förvalt Övrigt).
- "Byt ingrediens" på en befintlig vara stöds via `replace_id`.
- Text som inte står i UX-dokumenten:
  - bekräftelsen "Mjölk är sparad i kylen."
  - knapparna "Lägg till vara" och "Spara ändringar"
  - arkrubriken "Lagervara"
  - felet "Ange ett tal under 1 000 000."

- En ingrediens på en plats är antingen obegränsad eller har mängder. `set_pantry_items` tar bort de andra raderna av samma ingrediens och plats när en obegränsad rad sätts, och tar bort den obegränsade raden när en mängd sätts (från granskningen av 2.1).
- En mängd utan enhet sparas med enheten `st`, eftersom lagret kräver en enhet när det finns en mängd (2.1). Samma regel används mot receptrader i lagningsstatus (2.4) och inköpslistan (3.3). Se beslutsloggen 2026-10-26.

## Spec Change Log

## Review Triage Log

Iteration 1. Granskare: Blind Hunter, Edge Case Hunter och Verification Gap.

**Patch:**
- `set_pantry_items`:
  - kräver inloggning och minst en vara
  - filtrerar på `user_id = auth.uid()`
  - tar ett advisory-lås per användare
  - har inte längre execute för `service_role`
- Mängdfältet:
  - fylls med den exakta mängden, inte den formaterade
  - nekar intervall
  - visar fel först efter blur eller ett sparförsök
  - visar serverfel under fältet
- En ny katalogingrediens:
  - Ett namn som inte går att använda ger ett synligt fel.
  - Ingrediensen får bara en standardenhet om Pontus valde en.
  - Ett nytt försök skapar ingen dubblett.
  - Namnet tas som det skrevs, utan att mängd tas bort.
  - "som ny" jämförs också mot synonymer.
- Saknad rad ger `pantry_save_failed`.
- Felet nollställs när ett fält ändras.
- Platshållare för "+" i laddningsläget.
- Nya tester:
  - integration: obegränsad två gånger, blandat anrop, byte av ingrediens, flytt av obegränsad vara
  - e2e: katalogens förslag på plats och enhet, Esc och Avbryt i receptets ingrediensväljare
  - enhetstest: `revalidateFor`

**Defer:**
- Katalogen för e2e-användaren städas inte. Raderingsrätten är återkallad även för service role (AD-20), och användaren raderas med cascade vid varje körning.
- krockkontroll för ett inaktuellt `replace_id` (senaste skrivningen vinner, en användare)
- omdirigering vid `unauthorized` (redan uppskjuten från Epic 1)

**Reject:**
- en tabellconstraint för antingen/eller (funktionen och låset räcker)
- att flytt skriver över en befintlig rad, eftersom specen kräver det

## Verification

**Commands:**
- `pnpm exec supabase migration up && pnpm db:types` -- expected: funktionen finns; typerna stabila
- `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` -- expected: alla lyckas
- `AI_PROVIDER=mock pnpm build && CI=1 pnpm test:e2e` -- expected: alla lyckas
