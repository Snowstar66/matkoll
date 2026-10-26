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
export { placeSlug, placeFromSlug, itemCountText, emptyPlaceText } from "./domain/places";
