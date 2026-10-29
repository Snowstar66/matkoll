import type { Unit } from "@/features/catalog";
import { stepId, stepText, type RecipeDraft, type SourceKind } from "./recipe-draft";

// A saved recipe as the recipe view reads it, and the rows save_recipe and
// update_recipe write for a draft (AD-10). Pure, so the mapping is tested without a database.

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
  /** Story 16.4: the offers the recipe was saved from; empty for any other recipe. */
  offerNames?: string[];
  /**
   * When the recipe last changed, exactly as the database gives it. Ändra
   * recept sends it back, so a form filled before a newer change cannot
   * overwrite it.
   */
  updatedAt: string;
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
    offer_names?: string[];
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
      offer_names: draft.offerNames ?? [],
    },
    steps: draft.steps.map((step, position) => ({ position, text: stepText(step).trim() })),
    lines: draft.lines.map((line, position) => lineRow(line, position, ingredientIds[position])),
  };
}

function lineRow(line: RecipeDraft["lines"][number], position: number, ingredientId: string | null) {
  return {
    position,
    original_text: line.originalText.trim(),
    amount: line.isVague ? null : line.amount,
    unit: line.isVague ? null : line.unit,
    is_vague: line.isVague,
    ingredient_id: ingredientId,
    step_position: line.stepIndexes.length > 0 ? Math.min(...line.stepIndexes) : null,
  };
}

/** The arguments of the Postgres function update_recipe(id, recipe, steps, lines). */
export type UpdateRecipeArgs = {
  id: string;
  /** The recipe's updated_at when the form was filled; another value in the database is a conflict. */
  expected_updated_at: string;
  /** The source and the image address never change. */
  recipe: { title: string; original_servings: number; total_minutes: number | null };
  /** `id`: the saved step it keeps, or `null` for a new step. */
  steps: { id: string | null; position: number; text: string }[];
  /** `id`: the saved line it keeps, or `null` for a new line. */
  lines: ({ id: string | null } & SaveRecipeArgs["lines"][number])[];
};

/**
 * The rows that change the saved recipe `recipeId` to a validated draft
 * (AD-10). Lines and steps with an id keep it; the recipe's lines and steps
 * that are not in the draft are deleted by update_recipe. `ingredientIds[i]`
 * is the catalog id of `draft.lines[i]` from commitIngredients;
 * `expectedUpdatedAt` is SavedRecipe.updatedAt as the form read it.
 */
export function toUpdateRecipeArgs(
  recipeId: string,
  draft: RecipeDraft,
  ingredientIds: readonly (string | null)[],
  expectedUpdatedAt: string,
): UpdateRecipeArgs {
  if (ingredientIds.length !== draft.lines.length) {
    throw new Error("toUpdateRecipeArgs needs one ingredient id per line");
  }
  return {
    id: recipeId,
    expected_updated_at: expectedUpdatedAt,
    recipe: { title: draft.title.trim(), original_servings: draft.servings, total_minutes: draft.totalMinutes },
    steps: draft.steps.map((step, position) => ({ id: stepId(step), position, text: stepText(step).trim() })),
    lines: draft.lines.map((line, position) => ({
      id: line.id ?? null,
      ...lineRow(line, position, ingredientIds[position]),
    })),
  };
}
