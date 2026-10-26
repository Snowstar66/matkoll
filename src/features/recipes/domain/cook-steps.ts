import type { SavedRecipeStep } from "./saved-recipe";

// The steps of the step mode (FR-21): each step with the recipe lines that
// belong to it. Pure, so it is tested without a browser.

/** The part of a recipe line the step mode groups on. */
export type StepLine = { stepId: string | null };

export type CookStep<L extends StepLine> = {
  id: string;
  text: string;
  /** The lines whose first step this is, in the recipe's order; empty when none is. */
  lines: L[];
  /**
   * On the first step only: the lines that belong to no step ("Övriga
   * ingredienser"), in the recipe's order. Empty on every other step.
   */
  otherLines: L[];
};

/**
 * Each step, in position order, with its text and the lines whose `stepId` is
 * the step's: a line belongs to the first step it is used in (decision
 * 2026-10-25), in the recipe's order. A line without a step, or whose step is
 * not among `steps` (deleted, so `step_id` is null), is never dropped: it is
 * shown on the first step among the other ingredients. When no line has a
 * step at all (the AI linked none), the first step simply has every line.
 * The lines are passed already scaled (recipes.scaleLines), so the step mode
 * shows the amounts for the chosen servings.
 */
export function cookSteps<L extends StepLine>(
  steps: readonly SavedRecipeStep[],
  lines: readonly L[],
): CookStep<L>[] {
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const byStep = new Map<string, L[]>(ordered.map((step) => [step.id, []]));
  const without: L[] = [];
  for (const line of lines) {
    const own = line.stepId === null ? undefined : byStep.get(line.stepId);
    if (own) own.push(line);
    else without.push(line);
  }
  const noneLinked = without.length === lines.length;
  return ordered.map((step, index) => {
    const own = byStep.get(step.id) ?? [];
    if (index > 0) return { id: step.id, text: step.text, lines: own, otherLines: [] };
    return noneLinked
      ? { id: step.id, text: step.text, lines: [...without], otherLines: [] }
      : { id: step.id, text: step.text, lines: own, otherLines: without };
  });
}
