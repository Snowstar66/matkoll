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
export { placeSlug, placeFromSlug, itemCountText, emptyPlaceText, savedItemText } from "./domain/places";
export {
  pantryItemFormSchema,
  pantryItemSetSchema,
  parseAmountField,
  amountErrorMessage,
  type PantryIngredient,
  type PantryItemForm,
  type PantryItemFormInput,
  type PantryItemSet,
} from "./domain/pantry-item-form";
