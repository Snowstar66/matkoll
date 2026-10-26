// Client-safe entry: types and domain (AD-1).
export {
  toSnapshot,
  comparePantryItems,
  splitPantryItems,
  type PantryItem,
  type PantryAmount,
  type PantryAmountRow,
  type PantryStock,
  type PantrySnapshot,
} from "./domain/pantry-item";
export { placeSlug, placeFromSlug, itemCountText, emptyPlaceText, savedItemText, removedItemsText } from "./domain/places";
export {
  pantryItemFormSchema,
  pantryItemSetSchema,
  pantryRowSchema,
  parseAmountField,
  amountErrorMessage,
  type PantryIngredient,
  type PantryItemForm,
  type PantryItemFormInput,
  type PantryItemSet,
  type PantryRow,
} from "./domain/pantry-item-form";
export { aggregateNeeds, needKey, lineNeedKey, type Need, type NeedLine } from "./domain/aggregate-needs";
export { coverage, isShort, atHomeText, type Coverage } from "./domain/coverage";
export {
  recipeStatus,
  recipeStatusText,
  type LineCoverage,
  type RecipeStatus,
  type StatusLine,
  type StatusRecipe,
} from "./domain/recipe-status";
