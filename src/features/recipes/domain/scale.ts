import { formatQuantity } from "@/features/catalog";

// Scaling a recipe to other servings (AD-7): the only place amounts are
// scaled. Units are never converted (AD-12). Pure, so it is tested without a
// database.

const isServings = (value: number) => Number.isFinite(value) && value > 0;

/**
 * The factor that turns the recipe's amounts for `originalServings` into
 * amounts for `servings`: 6 portions of a recipe for 4 is 1.5. When either is
 * not a positive number the recipe's own amounts are used (1), never NaN or
 * Infinity.
 */
export function scaleFactor(servings: number, originalServings: number): number {
  return isServings(servings) && isServings(originalServings) ? servings / originalServings : 1;
}

/** The part of a recipe line scaling reads. */
export type ScalableLine = { amount: number | null; isVague: boolean };

/**
 * The lines with each amount times `factor`, in the same order and otherwise
 * unchanged. Vague lines ("salt efter smak") and lines without an amount stay
 * as they are. Amounts are not rounded here: sums are rounded where they are
 * summed (pantry.aggregateNeeds) and display rounding is formatQuantity's.
 */
export function scaleLines<T extends ScalableLine>(lines: readonly T[], factor: number): T[] {
  return lines.map((line) =>
    line.isVague || line.amount === null || factor === 1 ? line : { ...line, amount: line.amount * factor },
  );
}

/**
 * The factor beside a line whose text is not scaled (a line without catalog
 * ingredient): "×2", "×0,33", at most two decimals as formatQuantity shows
 * them, and never less than "×0,01", so a small factor never reads "×0".
 */
export function factorText(factor: number): string {
  return `×${formatQuantity(Math.max(0.01, factor), null)}`;
}
