import "server-only";
import { z } from "zod";
import { currentWeekStart } from "@/features/mealplan";
import { customItemRowSchema, type CustomItemRow, type CustomListItem, type NewCustomItem } from "../domain/custom-item";
import { customLineKey } from "../domain/line-key";
import { listOwnCheckTimesIn } from "./checks";
import { ShoppingDataError, type ShoppingDb } from "./client";

// Pontus's own items on the shopping list (Story 3.5, AD-8): rows of
// shopping_custom_item, which only this module reads and writes (AD-1). The
// functions take the user's session client, so RLS limits them to the user's
// own rows. An own item belongs to the household, not to a week (Story 17.10):
// it stays on the list until it is checked off, and a checked item is hidden
// once the week it was checked in is past. Adding, "Ångra" and removing run
// under the meal plan lock (add_shopping_custom_item, remove_shopping_custom_item).

const idSchema = z.uuid();

type DbRow = {
  id: string;
  meal_plan_id: string | null;
  label: string;
  ingredient_id: string | null;
  amount: number | null;
  unit: string | null;
};

const columns = "id, meal_plan_id, label, ingredient_id, amount, unit";

/** A row from the database as the domain's CustomItemRow; the checks equal the table's. */
function toRow(row: DbRow): CustomItemRow {
  const parsed = customItemRowSchema.safeParse({
    id: row.id,
    planId: row.meal_plan_id,
    label: row.label,
    ingredientId: row.ingredient_id,
    amount: row.amount === null ? null : Number(row.amount),
    unit: row.unit,
  });
  if (!parsed.success) throw new ShoppingDataError("invalid_custom_item");
  return parsed.data;
}

/**
 * The user's own items for the list of the week `weekStart` (default this
 * week), in the order they were added, whichever week they were added in. An
 * item that was checked off in an earlier week is left out: it was bought
 * then. A row the domain cannot read is left out (and logged), so one bad row
 * never hides the list. Throws ShoppingDataError.
 */
export async function listCustomItemsIn(
  db: ShoppingDb,
  weekStart: string = currentWeekStart(),
): Promise<CustomListItem[]> {
  const [{ data, error }, checkedAt] = await Promise.all([
    db.from("shopping_custom_item").select(columns).order("created_at").order("id"),
    listOwnCheckTimesIn(db),
  ]);
  if (error) throw new ShoppingDataError(`list_custom_items_failed ${error.code}`, error.code);
  return data.flatMap((row) => {
    const checked = checkedAt.get(customLineKey(row.id));
    if (checked && currentWeekStart(checked) < weekStart) return [];
    try {
      const { id, label, ingredientId, amount, unit } = toRow(row);
      return [{ id, label, ingredientId, amount, unit }];
    } catch (error) {
      if (!(error instanceof ShoppingDataError)) throw error;
      console.error("shopping_custom_item_unreadable", { reason: error.detail });
      return [];
    }
  });
}

/** The foreign key from an item to its meal plan; a violation means the plan is gone. */
const planForeignKey = "shopping_custom_item_meal_plan_fkey";

/**
 * addCustomItem and restoreCustomItem (AD-20): puts the item onto the user's
 * list with its id, in one transaction under the meal plan lock
 * (add_shopping_custom_item). A new item has no plan (`row.planId` absent or
 * null): it belongs to the household (Story 17.10); "Ångra" of an older item
 * puts its plan back. When the user has an item with the id already (a retry,
 * or "Ångra" twice), that row is returned and nothing is written.
 * `plan_changed`, with nothing written, when the id is an item with other
 * content (55000) or `row.planId` is gone (the plan foreign key). Throws
 * ShoppingDataError otherwise: `add_failed <code>` (23503 for another user's
 * ingredient, 23505 for an id another user has).
 */
export async function addCustomItemIn(db: ShoppingDb, row: NewCustomItem): Promise<CustomItemRow | "plan_changed"> {
  const parsed = customItemRowSchema.safeParse({ ...row, planId: row.planId ?? null });
  if (!parsed.success) throw new ShoppingDataError("invalid_custom_item");
  const { id, planId, label, ingredientId, amount, unit } = parsed.data;
  const { data, error } = await db.rpc("add_shopping_custom_item", {
    item: { id, meal_plan_id: planId, label, ingredient_id: ingredientId, amount, unit },
  });
  if (error) {
    if (error.code === "55000" || (error.code === "23503" && error.message.includes(planForeignKey))) {
      return "plan_changed";
    }
    throw new ShoppingDataError(`add_failed ${error.code}`, error.code);
  }
  return toRow(data);
}

/**
 * What removeCustomItemIn deleted: the row as it was, for "Ångra", or null
 * when the deleted row could not be read back (it is gone all the same, but
 * cannot be put back).
 */
export type RemovedCustomItem = { row: CustomItemRow | null };

/**
 * removeCustomItem (AD-20): deletes the item for good, under the meal plan
 * lock (remove_shopping_custom_item), and returns it as it was. Its check
 * stays, so "Ångra" brings it back too. Null when the user has no item with
 * the id (another user's, or gone already).
 *
 * Throws ShoppingDataError: `invalid_id` before anything is deleted, or
 * `remove_failed <code>` when Postgres refuses.
 */
export async function removeCustomItemIn(
  db: ShoppingDb,
  id: string,
): Promise<RemovedCustomItem | null> {
  if (!idSchema.safeParse(id).success) throw new ShoppingDataError("invalid_id");
  const { data, error } = await db.rpc("remove_shopping_custom_item", { item_id: id });
  if (error) {
    throw new ShoppingDataError(`remove_failed ${error.code}`, error.code);
  }
  const [row] = data;
  if (!row) return null;
  try {
    return { row: toRow(row) };
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    return { row: null };
  }
}

/**
 * updateCustomItem (AD-20, AD-22): changes the item's text, catalog
 * ingredient, amount and unit, keeping its id and so its check, under the
 * meal plan lock (update_shopping_custom_item). The plan plays no part: an
 * own item is the household's (Story 17.10). Idempotent. `not_found` when the
 * user has no item with the id (removed meanwhile, or another user's). Throws
 * ShoppingDataError otherwise: `update_failed <code>` (23503 for another
 * user's ingredient).
 */
export async function updateCustomItemIn(
  db: ShoppingDb,
  row: NewCustomItem,
): Promise<CustomItemRow | "not_found"> {
  const parsed = customItemRowSchema.safeParse({ ...row, planId: row.planId ?? null });
  if (!parsed.success) throw new ShoppingDataError("invalid_custom_item");
  const { id, planId, label, ingredientId, amount, unit } = parsed.data;
  const { data, error } = await db.rpc("update_shopping_custom_item", {
    item: { id, meal_plan_id: planId, label, ingredient_id: ingredientId, amount, unit },
  });
  if (error) {
    if (error.code === "P0002") return "not_found";
    throw new ShoppingDataError(`update_failed ${error.code}`, error.code);
  }
  return toRow(data);
}
