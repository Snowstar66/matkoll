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
  importRequestSchema,
  recipeImportSchema,
  importErrorMessage,
  importTextTooLongMessage,
  type ImportRequest,
  type RecipeImport,
} from "./domain/import";
export { sourceLabel } from "./domain/source-label";
export {
  toSaveRecipeArgs,
  type SavedRecipe,
  type SavedRecipeLine,
  type SavedRecipeStep,
  type SaveRecipeArgs,
} from "./domain/saved-recipe";
