// Client-safe entry: types and domain (AD-1).
export {
  SOURCE_KINDS,
  sourceKindSchema,
  lineIngredientSchema,
  recipeLineSchema,
  recipeDraftSchema,
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
