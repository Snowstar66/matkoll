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
