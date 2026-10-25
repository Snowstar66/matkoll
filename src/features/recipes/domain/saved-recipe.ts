import type { Unit } from "@/features/catalog";
import type { RecipeDraft, SourceKind } from "./recipe-draft";

// A saved recipe as the recipe view reads it, and the rows save_recipe writes
// for a draft (AD-10). Pure, so the mapping is tested without a database.

export type SavedRecipeStep = { id: string; position: number; text: string };

export type SavedRecipeLine = {
  id: string;
  position: number;
  originalText: string;
  amount: number | null;
  unit: Unit | null;
  isVague: boolean;
  /** null: the line has no catalog ingredient. */
  ingredientId: string | null;
  /** The catalog ingredient's name, when the line has one. */
  ingredientName: string | null;
  /** The first step the line is used in, if any. */
  stepId: string | null;
};

export type SavedRecipe = {
  id: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  imageUrl: string | null;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  isFavorite: boolean;
  /** In order. */
  steps: SavedRecipeStep[];
  /** In order. */
  lines: SavedRecipeLine[];
};

/** The arguments of the Postgres function save_recipe(recipe, steps, lines). */
export type SaveRecipeArgs = {
  recipe: {
    /** Chosen by the client when the preview is made, so a repeated save writes once. */
    id: string;
    title: string;
    original_servings: number;
    total_minutes: number | null;
    image_url: string | null;
    source_kind: SourceKind;
    source_url: string | null;
  };
  steps: { position: number; text: string }[];
  lines: {
    position: number;
    original_text: string;
    amount: number | null;
    unit: Unit | null;
    is_vague: boolean;
    ingredient_id: string | null;
    step_position: number | null;
  }[];
};

/**
 * The rows for a validated draft, saved as the recipe `recipeId`. `ingredientIds[i]` is the catalog id of
 * `draft.lines[i]` from commitIngredients (`null` for a line without one). A
 * line keeps its first step: the table has one step per line.
 */
export function toSaveRecipeArgs(
  recipeId: string,
  draft: RecipeDraft,
  ingredientIds: readonly (string | null)[],
): SaveRecipeArgs {
  if (ingredientIds.length !== draft.lines.length) {
    throw new Error("toSaveRecipeArgs needs one ingredient id per line");
  }
  return {
    recipe: {
      id: recipeId,
      title: draft.title.trim(),
      original_servings: draft.servings,
      total_minutes: draft.totalMinutes,
      image_url: draft.imageUrl,
      source_kind: draft.sourceKind,
      source_url: draft.sourceUrl,
    },
    steps: draft.steps.map((text, position) => ({ position, text: text.trim() })),
    lines: draft.lines.map((line, position) => ({
      position,
      original_text: line.originalText.trim(),
      amount: line.isVague ? null : line.amount,
      unit: line.isVague ? null : line.unit,
      is_vague: line.isVague,
      ingredient_id: ingredientIds[position],
      step_position: line.stepIndexes.length > 0 ? Math.min(...line.stepIndexes) : null,
    })),
  };
}
