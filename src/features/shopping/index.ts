// Client-safe entry: types and domain (AD-1).
export {
  computeList,
  compareShoppingLines,
  emptyOverlay,
  type ListDish,
  type ListRecipe,
  type ListRecipeLine,
  type Overlay,
  type ShoppingLine,
  type ShoppingListInput,
} from "./domain/compute-list";
export {
  recipeLineKey,
  textLineKey,
  customLineKey,
  lineText,
  parseLineKey,
  lineKeySchema,
  maxLineKeyChars,
  type ParsedLineKey,
} from "./domain/line-key";
