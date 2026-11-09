// Client-safe entry of the menu advisor (AD-1). Pure logic only; the reading itself is the AI port's readMenu.
export { allergenHits, type AllergenHit } from "./domain/allergens";
export { approxRatesDate, approxSekRates, currencyFromText, toSek, type KnownCurrency } from "./domain/currency";
export { allergyDisclaimer } from "./domain/disclaimer";
export { type HouseholdPerson } from "./domain/people";
// Preferences held against any dish (a recipe, an AI suggestion): notes, a light ranking, and the lists for the model.
export {
  fitRank,
  foodFit,
  foodPrefsOf,
  hasAllergyNote,
  hasFitPreferences,
  rankByFit,
  recipeFits,
  type FitNote,
  type FitPerson,
  type FoodPrefs,
  type FoodText,
} from "./domain/dish-fit";
export { normalizeMenu } from "./domain/normalize";
export {
  menuAllergens,
  menuCategories,
  menuGroups,
  type Menu,
  type MenuAllergen,
  type MenuCategory,
  type MenuDish,
  type MenuGroup,
  type RawMenu,
} from "./domain/types";
// "En enkel resa": options per person, drinks, the total, and the live reading stream format.
export type { Choice, Choices, DishOption, PersonOptions } from "./domain/options";
export { defaultChoices, optionFor, recommendOptions, type RecommendOptionsOptions } from "./domain/recommend-options";
export { drinkOptions, estimateTotalSek, type DrinkOption, type Totals } from "./domain/drinks";
export { createMenuStreamParser, formatMenuStreamLine, menuReaderOf, menuReaderText, menuStreamContentType, parseMenuStreamLine, type MenuQualityName, type MenuReader, type MenuReading, type MenuStreamEvent } from "./domain/reading";
