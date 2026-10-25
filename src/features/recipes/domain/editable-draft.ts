import { stepId, type LineIngredient, type RecipeDraft, type RecipeLine } from "./recipe-draft";
import type { SavedRecipe } from "./saved-recipe";

// "Ändra" in the recipe view (Story 1.11, AD-10): a saved recipe becomes a
// RecipeDraft for the same form as the preview, and back through updateRecipe.

/**
 * The saved recipe as a draft for the form. Lines and steps carry their saved
 * ids, so updateRecipe keeps them. A line with a catalog ingredient gets it as
 * `{ kind: "chosen" }`; a line without one is "unmatched". A line's step is
 * its saved first step. The source and the image address come along as they
 * are; the form never changes them.
 */
export function toEditableDraft(saved: SavedRecipe): RecipeDraft {
  const stepIndex = new Map(saved.steps.map((step, index) => [step.id, index]));
  return {
    title: saved.title,
    servings: saved.servings,
    totalMinutes: saved.totalMinutes,
    imageUrl: saved.imageUrl,
    sourceKind: saved.sourceKind,
    sourceUrl: saved.sourceUrl,
    steps: saved.steps.map(({ id, text }) => ({ id, text })),
    lines: saved.lines.map((line): RecipeLine => {
      const index = line.stepId === null ? undefined : stepIndex.get(line.stepId);
      return {
        id: line.id,
        originalText: line.originalText,
        amount: line.isVague ? null : line.amount,
        unit: line.isVague ? null : line.unit,
        isVague: line.isVague,
        ingredient: line.ingredientId === null ? { kind: "unmatched" } : { kind: "chosen", ingredientId: line.ingredientId },
        stepIndexes: index === undefined ? [] : [index],
      };
    }),
  };
}

/** The names of the saved recipe's catalog ingredients, by id, for the form. */
export function savedIngredientNames(saved: SavedRecipe): Record<string, string> {
  const names: Record<string, string> = {};
  for (const line of saved.lines) {
    if (line.ingredientId !== null && line.ingredientName !== null) names[line.ingredientId] = line.ingredientName;
  }
  return names;
}

/**
 * The lines' catalog choices for commitIngredients when a saved recipe is
 * changed. A kept line (it has an id) whose chosen ingredient is the one it is
 * saved with was not changed, so it becomes a plain match and saves no
 * synonym; only a line Pontus linked to another ingredient does (AD-6).
 * `saved` maps each saved line's id to its ingredient id.
 */
export function lineChoices(
  lines: readonly RecipeLine[],
  saved: ReadonlyMap<string, string | null>,
): { text: string; ingredient: LineIngredient }[] {
  return lines.map(({ id, originalText, ingredient }) => {
    const unchanged =
      ingredient.kind === "chosen" && id !== undefined && saved.get(id) === ingredient.ingredientId;
    return {
      text: originalText,
      ingredient: unchanged ? { kind: "match", ingredientId: ingredient.ingredientId, confidence: "exact" } : ingredient,
    };
  });
}

/**
 * Every line and step id in the draft is one of the saved recipe's, so
 * update_recipe will accept them. Checked before the catalog commit, so a
 * draft it would refuse changes nothing at all.
 */
export function hasOnlySavedIds(
  draft: RecipeDraft,
  saved: { lines: ReadonlyMap<string, string | null>; stepIds: ReadonlySet<string> },
): boolean {
  return (
    draft.lines.every(({ id }) => id === undefined || saved.lines.has(id)) &&
    draft.steps.every((step) => {
      const id = stepId(step);
      return id === null || saved.stepIds.has(id);
    })
  );
}
