// Client-safe entry: types and domain (AD-1).
export {
  SOURCE_KINDS,
  sourceKindSchema,
  lineIngredientSchema,
  recipeLineSchema,
  recipeDraftSchema,
  draftLimits,
  lineHintSchema,
  validateDraft,
  draftFieldMessages,
  type LineHint,
  type PendingFieldText,
  type SourceKind,
  type LineIngredient,
  type RecipeLine,
  type RecipeDraft,
} from "./domain/recipe-draft";
export { fromAiRecipe, type AiRecipeLike, type RecipeSource } from "./domain/from-ai-recipe";
export {
  maxImportTextChars,
  maxImportUrlChars,
  importRequestSchema,
  recipeImportSchema,
  importErrorMessage,
  importLinkTooLongMessage,
  importTextTooLongMessage,
  noRecipeOnPageMessage,
  pasteTextInsteadCodes,
  offersPasteTextInstead,
  isUnreadablePhoto,
  photoUnreadableMessage,
  photoRejectedMessage,
  type ImportInput,
  type ImportKind,
  type ImportRequest,
  type PhotoImport,
  type RecipeImport,
} from "./domain/import";
export { sourceLabel } from "./domain/source-label";
export {
  RECIPE_FILTERS,
  recipeSearchSchema,
  favoriteChangeSchema,
  recipeMetaText,
  parseRecipeFilter,
  filterRecipes,
  type RecipeListItem,
  type RecipeFilter,
  type FavoriteChange,
} from "./domain/recipe-list";
export {
  toSaveRecipeArgs,
  type SavedRecipe,
  type SavedRecipeLine,
  type SavedRecipeStep,
  type SaveRecipeArgs,
} from "./domain/saved-recipe";
