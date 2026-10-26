import { aggregateNeeds, lineNeedKey, needKey, type NeedLine } from "./aggregate-needs";
import { coverage, isShort, type Coverage } from "./coverage";
import type { PantrySnapshot } from "./pantry-item";

// Lagningsstatus (FR-8, FR-20, AD-7): whether a recipe can be cooked with what
// is at home, how many ingredients are short, and what each line shows in the
// recipe view. Pure, so it is tested without a database.

/** A recipe line as recipeStatus reads it: the amount logic's fields and the line's id. */
export type StatusLine = NeedLine & { id: string };

/** A recipe as recipeStatus reads it; a saved recipe has these fields. */
export type StatusRecipe = {
  /** The recipe's own servings, which its amounts are written for. */
  servings: number;
  lines: readonly StatusLine[];
};

/**
 * What one line shows: the coverage of the need it counts towards (two lines
 * of cream share one), or `unlinked` for a line without a catalog ingredient,
 * which is never compared with the pantry and shown neutrally (decision
 * 2026-10-26).
 */
export type LineCoverage = Coverage | { kind: "unlinked" };

export type RecipeStatus = {
  /**
   * N in "Saknar N varor": the distinct catalog ingredients with a need that
   * is missing, partial or in another unit. Vague lines and lines without a
   * catalog ingredient never count. 0 is "Kan lagas nu".
   */
  missingCount: number;
  /** Each line's coverage by line id. */
  lines: Record<string, LineCoverage>;
};

const isServings = (value: number) => Number.isFinite(value) && value > 0;

/**
 * The recipe's status against the whole pantry for `servings` (the recipe's
 * own servings in the library): needs summed with aggregateNeeds, each
 * compared with coverage. When either servings is not a positive number the
 * recipe's own amounts are compared (factor 1), never NaN or Infinity.
 */
export function recipeStatus(recipe: StatusRecipe, servings: number, snapshot: PantrySnapshot): RecipeStatus {
  const factor = isServings(servings) && isServings(recipe.servings) ? servings / recipe.servings : 1;
  const byKey = new Map<string, Coverage>();
  const short = new Set<string>();
  for (const need of aggregateNeeds(recipe.lines, factor)) {
    const covered = coverage(need, snapshot);
    byKey.set(needKey(need), covered);
    if (isShort(covered)) short.add(need.ingredientId);
  }
  const lines: Record<string, LineCoverage> = {};
  for (const line of recipe.lines) {
    const key = lineNeedKey(line);
    lines[line.id] = (key !== null && byKey.get(key)) || { kind: "unlinked" };
  }
  return { missingCount: short.size, lines };
}

/** The status in words: "Kan lagas nu", "Saknar 1 vara" or "Saknar 3 varor". */
export function recipeStatusText(missingCount: number): string {
  if (missingCount === 0) return "Kan lagas nu";
  return `Saknar ${missingCount} ${missingCount === 1 ? "vara" : "varor"}`;
}
