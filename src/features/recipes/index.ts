// Client-safe entry: types and domain (AD-1).
export {
  SOURCE_KINDS,
  sourceKindSchema,
  lineIngredientSchema,
  recipeLineSchema,
  recipeDraftSchema,
  draftLimits,
  lineHintSchema,
  recipeStepSchema,
  stepText,
  stepId,
  validateDraft,
  draftFieldMessages,
  type LineHint,
  type PendingFieldText,
  type SourceKind,
  type LineIngredient,
  type RecipeLine,
  type RecipeStep,
  type RecipeDraft,
} from "./domain/recipe-draft";
export { toEditableDraft, savedIngredientNames, lineChoices, hasOnlySavedIds } from "./domain/editable-draft";
export { readSharedLink, type SharedLink } from "./domain/shared-link";
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
  recipeTimeText,
  parseRecipeFilter,
  filterRecipes,
  withStatus,
  toLibrary,
  type RecipeLibrary,
  type RecipeListItem,
  type RecipeListRow,
  type RecipeRowLine,
  type RecipeFilter,
  type FavoriteChange,
} from "./domain/recipe-list";
export {
  toSaveRecipeArgs,
  toUpdateRecipeArgs,
  type UpdateRecipeArgs,
  type SavedRecipe,
  type SavedRecipeLine,
  type SavedRecipeStep,
  type SaveRecipeArgs,
} from "./domain/saved-recipe";
export { scaleFactor, scaleLines, factorText, type ScalableLine } from "./domain/scale";
