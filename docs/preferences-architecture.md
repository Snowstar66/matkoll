# Food preferences and fit: architecture map

Status: 2026-11-10. Describes where "Undviker / Älskar / allergies" logic lives and what the public interface is.

## What lives where

| Concern | Place | Notes |
| --- | --- | --- |
| Tag storage and cleaning (`parseTags`, `addTag`, `cleanTag`) | `menu-advisor/domain/preferences.ts` | Legacy free lists; folded into tastes by `tastes.ts` |
| Text matching (`normalizeText`, `tokens`, `hasTerm`, `matchPreference`, synonym groups) | `menu-advisor/domain/preferences.ts` | Word-start matching, sv/en/es synonyms, exceptions (`not`), category hit |
| Tastes (-2..2 per thing, `softHits`) | `menu-advisor/domain/tastes.ts` | Uses `matchPreference` for own and preset things |
| Menu ranking per person (`recommend.ts`, `recommend-options.ts`) | `menu-advisor/domain/` | Menu-only: scores `MenuDish`, uses `softHits`, `whoName` |
| Fit of any non-menu dish (`foodFit`, `fitRank`, `rankByFit`, `recipeFits`, `foodPrefsOf`, `hasFitPreferences`, `lineHasAllergen`) | `menu-advisor/domain/dish-fit.ts` | Produces `FitNote[]` with structured `people` and `terms` |
| Note types for display (`PreferenceNote`, `NotePerson`, `PreferenceNotes`) | `src/components/preference-notes.tsx` | `FitNote` is `PreferenceNote & { strong }` (single source of the shape) |
| Dots (`fitDots`, `FitDots`, `fit-row.tsx`) | `src/components/` | Read only the structured fields of the notes, never parse sentences |
| Wire schema of a note on suggestions | `suggestions/domain/fit.ts` (`fitNoteSchema`) | Zod, validates what AI-job results carry; `strong` is deliberately not persisted |
| Server readers | `menu-advisor/server.ts`: `listFoodProfiles` -> `getHouseholdFoodPreferences` -> `getFoodFitPeople` | Memoised per request; `getFoodFitPeople` is what recipe list, Laga nu, suggestions and Matsedel use |

## Who imports whom

- `menu-advisor` imports `household` (server entry, member people) and `src/components` types (`PreferenceNote`). Allowed: components are a leaf layer.
- Consumers (`recipes` UI, `suggestions`, `app/(app)/matsedel`, `app/(app)/recept`) import only the public entries `@/features/menu-advisor` (client-safe: `foodFit`, `recipeFits`, `rankByFit`, `fitRank`, `hasAllergyNote`, `foodPrefsOf`, types) and `@/features/menu-advisor/server` (`getFoodFitPeople`, `getHouseholdFoodPreferences`). No consumer reaches into `menu-advisor/domain`.
- `src/components` imports no feature (AD-1); the display shape is therefore owned by `components` and the feature extends it.
- `suggestions/domain/fit.ts` keeps its own zod schema (a wire boundary must not trust a type); it is kept in step with `PreferenceNote` by shape.

## Duplication found

1. `recommend.ts` had a private `allergenNames` table equal to `allergenLabels` in lower case. Removed; now derived from `labels.ts`.
2. `FitNote` repeated the fields of `PreferenceNote`. Now `PreferenceNote & { strong }`.
3. `preferenceHits` in `preferences.ts` was dead code (no caller). Removed.
4. Taste keyword lists in `recommend.ts` (`keywords`: pasta, pizza, starkt, sott) overlap the synonym groups in `preferences.ts`. They differ on purpose today (exact-or-prefix >= 4 chars vs word-start with exceptions); merging changes scores. Left as a follow-up.
5. `sameTag` (lower case) in `preferences.ts` vs `sameText` (accent-folded) in `dish-fit.ts`: two equality notions. Left; unifying changes which tags count as the same.
6. `allergenHits` (menu dishes, from the reading's allergen lists) vs `lineHasAllergen` (keywords in free ingredient text): two different inputs, not duplicates, but both answer "does this contain allergen X".

## Allergen matching rule (hard rule)

Allergies are a hard rule (the Veckoagenten and the Menyrådgivare must never propose a dish that may hold a household allergen), so allergen detection and taste detection deliberately differ:

- **Taste ("Undviker"/"Älskar", `matchPreference`)**: word-start only, so `ost` never finds `kostrad`.
- **Allergen in ingredient text (`lineHasAllergen`, `allergenWords` in `dish-fit.ts`)**: a keyword also counts as the END of a compound (`ends`, e.g. `matlagningsgrädde`, `getost`, `vetetortilla` via `vete`) and, for long unambiguous stems, anywhere inside a word (`inside`, e.g. `sesam`, `soja`, `nöt`, `räk`, `fisk`). A false "kan innehålla" is acceptable; a silent miss is not.
- **Exceptions** are explicit and tested in `allergen-keywords.test.ts`: `not` (substring kills the word: `ostron`, `smörgås`, `muskotnöt`, `kokosnöt`, `äggplanta`, `bläckfisk` for fisk, other grains' flours for gluten), `notWords` (exact short words: `kost`, `rost`), `notPattern` (plant dairy is not laktos: `kokosmjölk`, `havregrädde`, `mandelsmör`, `jordnötssmör`) and `free` words that clear a line (`glutenfri`, `laktosfri`, `mjölkfri`, `äggfri`, `nötfri`).
- Decisions: coconut and nutmeg are not "Nötter"; peanut is (as before). `nöt` at the start of a word is beef (`nötfärs`) except nut words. Oats and soy sauce count as gluten, margarine and glass as laktos, hummus as sesam (cautious on purpose). Squid and octopus are skaldjur, not fisk.
- Menu dishes use `allergenHits` on the lists the reading model fills in (`allergener`, `kan_innehalla`); there is no keyword matching there.
- Only the eight allergens in `labels.ts` are tracked; senap, selleri, lupin and sulfit are not detected.

## The intended single public interface

Everything a consumer needs is exported from `@/features/menu-advisor` (pure) and `@/features/menu-advisor/server` (readers):

- Read: `getFoodFitPeople()` -> `FitPerson[]`.
- Judge: `foodFit(food, people)` -> `FitNote[]`; `recipeFits(recipes, people)` for lists.
- Order: `rankByFit(items, notesOf)`, `fitRank`, `hasAllergyNote`.
- Prompt: `foodPrefsOf(people)` -> names-free `FoodPrefs`.
- Show: `src/components` (`FitDots`, `PreferenceNotes`) read `FitNote` structurally.

Consumers should not import `matchPreference`, `normalizeText` etc.; they are internal to the module.

## Follow-ups (not done, riskier)

- Move preference matching and fit into a neutral package (for example `src/domain/preferences`) so `menu-advisor` is no longer the owner of something recipes and suggestions depend on. Mechanical but touches many imports and tests.
- Merge the taste keyword lists (item 4) into the synonym groups, with a score-regression test.
- Derive `fitNoteSchema` from the shared type (zod `satisfies`) so the wire shape cannot drift.
