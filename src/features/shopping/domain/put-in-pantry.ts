import type { Location, Unit } from "@/features/catalog";
import { addToPantryItemSchema } from "@/features/pantry";
import type { ShoppingLine } from "./compute-list";
import { parseLineKey } from "./line-key";

// "Lägg till i Matvaror" (FR-19, AD-8, AD-19): which of the list's checked lines go
// to the pantry, and what is cleared off the list afterwards. The lines are
// computeList's, counted on the server; the client's are never used. Pure,
// so it is tested without a database.

/** A check as stored (shopping_check): its id, the item's idempotency key in the pantry, and its line key. */
/** A check; `by` is who checked it off and `at` when (Story 21.3), where they were read. */
export type CheckRow = { id: string; key: string; by?: string | null; at?: string };

/** One item for pantry.addToPantry; its location is the catalog ingredient's. */
export type PantryAddition = {
  /** The check's id: the same check never adds to the pantry twice (pantry_addition). */
  key: string;
  ingredientId: string;
  /** What was bought, in `unit`; both null for a vague line or an own item without amount (unlimited). */
  amount: number | null;
  unit: Unit | null;
};

/**
 * Story 16.18: an item as it was put in the pantry, for "Packa upp kassarna": what was bought, its
 * name for the row, and the place it went to (the catalog ingredient's).
 */
export type PlacedItem = PantryAddition & { name: string; location: Location };

/** The largest amount the pantry keeps (pantry_item_amount_max_check: below 1 000 000). */
export const maxPantryAddition = 999_999.999;

export type PutInPantryPlan = {
  /** The checked lines with a catalog ingredient, in list order. */
  items: PantryAddition[];
  /** The checks cleared afterwards: those of the items, and of the checked own items without a link. */
  checkIds: string[];
  /** The keys of the recipe lines among the items, whose overrides (corrected amount) are cleared. */
  overrideKeys: string[];
  /** The checked own items, which are taken off the list (put in the pantry first when linked). */
  customItemIds: string[];
  /** The checked own items without a catalog ingredient: only taken off the list. */
  removed: number;
  /**
   * Checked lines that cannot go to the pantry (an ingredient the catalog does
   * not know, an amount or unit it refuses): left as they are, still checked.
   */
  skipped: number;
  /**
   * The checks of no line on the list: a line covered by the pantry now, a
   * hidden one, or one gone from the plan. Only their checks are cleared, and
   * only when an earlier, interrupted run put them in the pantry (its receipt).
   */
  unsent: CheckRow[];
};

/**
 * What "Lägg till i Matvaror" does with the list's `lines` and the plan's `checks`:
 * - A checked recipe line with a catalog ingredient goes to the pantry with
 *   what is bought: its amount and unit (a unit that counts things rounded
 *   up, Story 3.3; a corrected amount as written, Story 3.6), or neither for
 *   a vague line, which makes the ingredient unlimited. Its check and
 *   override are cleared. An amount the pantry cannot keep is capped at
 *   maxPantryAddition.
 * - A checked own item linked to a catalog ingredient goes to the pantry
 *   like a recipe line, with its amount and unit or unlimited without, and
 *   is taken off the list; one without a link is only taken off the list
 *   (decision 2026-10-26).
 * - A line whose ingredient is not in `known` (the catalog ingredients the
 *   list was counted with), or whose item the pantry would refuse, is
 *   skipped: it keeps its check.
 * - A recipe line without a catalog ingredient (`t:`) cannot go to the
 *   pantry: it is left as it is, still checked (decision 2026-10-26).
 * - Lines not checked, and hidden ones (not among `lines`), are left as they are.
 * Each item's key is its check's id; a checked line without a check row
 * (none read) is left out.
 */
export function planPutInPantry(
  lines: readonly ShoppingLine[],
  checks: readonly CheckRow[],
  known: ReadonlySet<string>,
): PutInPantryPlan {
  const checkByKey = new Map(checks.map((check) => [check.key, check]));
  const plan: PutInPantryPlan = {
    items: [],
    checkIds: [],
    overrideKeys: [],
    customItemIds: [],
    removed: 0,
    skipped: 0,
    unsent: [],
  };
  for (const line of lines) {
    if (!line.checked) continue;
    const check = checkByKey.get(line.key);
    if (!check) continue;
    const custom = line.isCustom ? parseLineKey(line.key) : null;
    const customId = custom?.kind === "custom" ? custom.id : null;
    if (line.isCustom && customId === null) continue;

    if (!line.ingredientId) {
      // An own item without a link is only taken off the list; a text line stays as it is.
      if (customId === null) continue;
      plan.checkIds.push(check.id);
      plan.customItemIds.push(customId);
      plan.removed += 1;
      continue;
    }

    const withAmount = !line.isVague && line.amount !== null && line.unit !== null;
    const item: PantryAddition = {
      key: check.id,
      ingredientId: line.ingredientId,
      amount: withAmount ? Math.min(line.amount!, maxPantryAddition) : null,
      unit: withAmount ? line.unit : null,
    };
    if (!known.has(line.ingredientId) || !addToPantryItemSchema.safeParse(item).success) {
      plan.skipped += 1;
      continue;
    }
    plan.items.push(item);
    plan.checkIds.push(check.id);
    if (customId === null) plan.overrideKeys.push(line.key);
    else plan.customItemIds.push(customId);
  }
  const listed = new Set(lines.map((line) => line.key));
  plan.unsent = checks.filter((check) => !listed.has(check.key));
  return plan;
}

/**
 * The lines "Lägg till i Matvaror" would act on: checked recipe lines with a
 * catalog ingredient and checked own items. A checked text line (`t:`)
 * cannot go to the pantry, so it never shows the button on its own.
 */
export function canPutInPantry(line: Pick<ShoppingLine, "checked" | "isCustom" | "ingredientId">): boolean {
  return line.checked && (line.isCustom || line.ingredientId !== undefined);
}
