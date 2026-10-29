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
  /** The ingredients counted in `missingCount`, by id, in the order their lines first appear (Story 4.3). */
  missingIngredientIds: string[];
  /**
   * Y in "X av Y hemma": the distinct catalog ingredients of the recipe, also
   * those with only vague lines. Lines without a catalog ingredient never
   * count (decision 2026-10-26).
   */
  ingredientCount: number;
  /**
   * X in "X av Y hemma": the catalog ingredients every need of which is
   * covered, as the ticks show them. A vague line whose ingredient is not at
   * home keeps its ingredient out of X, though it never counts in N.
   */
  atHomeCount: number;
  /** Each line's coverage by line id. */
  lines: Record<string, LineCoverage>;
};

const isServings = (value: number) => Number.isFinite(value) && value > 0;

/**
 * The recipe's status against the whole pantry for `servings` (the recipe's
 * own servings in the library, the chosen ones on a dish): as
 * recipeStatusForFactor with servings over the recipe's own. When either
 * servings is not a positive number the recipe's own amounts are compared
 * (factor 1), never NaN or Infinity, as recipes.scaleFactor does.
 */
export function recipeStatus(recipe: StatusRecipe, servings: number, snapshot: PantrySnapshot): RecipeStatus {
  const factor = isServings(servings) && isServings(recipe.servings) ? servings / recipe.servings : 1;
  return recipeStatusForFactor(recipe.lines, factor, snapshot);
}

/**
 * The status of the recipe's `lines` (its own amounts) times `factor`
 * against the whole pantry: needs summed with aggregateNeeds, each compared
 * with coverage. The recipe view passes the factor it scales its lines with
 * (recipes.scaleFactor), so the status and the amounts shown never differ.
 * A factor that is not a positive number is 1.
 */
export function recipeStatusForFactor(
  lines: readonly StatusLine[],
  factor: number,
  snapshot: PantrySnapshot,
): RecipeStatus {
  const byKey = new Map<string, Coverage>();
  const ingredients = new Set<string>();
  const short = new Set<string>();
  const notAtHome = new Set<string>();
  for (const need of aggregateNeeds(lines, isServings(factor) ? factor : 1)) {
    const covered = coverage(need, snapshot);
    byKey.set(needKey(need), covered);
    ingredients.add(need.ingredientId);
    if (isShort(covered)) short.add(need.ingredientId);
    if (covered.kind !== "covered") notAtHome.add(need.ingredientId);
  }
  const byLine: Record<string, LineCoverage> = {};
  for (const line of lines) {
    const key = lineNeedKey(line);
    byLine[line.id] = (key !== null && byKey.get(key)) || { kind: "unlinked" };
  }
  return {
    missingCount: short.size,
    missingIngredientIds: [...short],
    ingredientCount: ingredients.size,
    atHomeCount: ingredients.size - notAtHome.size,
    lines: byLine,
  };
}

/** "7 av 9 hemma": X of the recipe's Y catalog ingredients are at home for the chosen servings. */
export function atHomeSummaryText(atHomeCount: number, ingredientCount: number): string {
  return `${atHomeCount} av ${ingredientCount} hemma`;
}

/** At most this many names are spelled out in "Saknar: a, b +N". */
const maxMissingNames = 2;

/**
 * Which items are missing, in words (Story 4.3): "Saknar: tryffelolja",
 * "Saknar: tryffelolja, persilja" and "Saknar: tryffelolja, persilja +1" for
 * more than two. Names are lower case, as they stand mid-sentence. `null`
 * without names, so the caller falls back to recipeStatusText.
 */
export function missingNamesText(names: readonly string[]): string | null {
  const shown = names.map((name) => name.trim().toLocaleLowerCase("sv-SE")).filter((name) => name !== "");
  if (shown.length === 0) return null;
  const rest = shown.length - maxMissingNames;
  return `Saknar: ${shown.slice(0, maxMissingNames).join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

/** The status in words: "Kan lagas nu", "Saknar 1 vara" or "Saknar 3 varor". */
export function recipeStatusText(missingCount: number): string {
  if (missingCount === 0) return "Kan lagas nu";
  return `Saknar ${missingCount} ${missingCount === 1 ? "vara" : "varor"}`;
}
