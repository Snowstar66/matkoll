import "server-only";
import { z } from "zod";
import type { AppError, Result } from "@/lib/errors";
import { planPutInPantry, type CheckRow, type PantryAddition } from "../domain/put-in-pantry";
import { lineKeySchema } from "../domain/line-key";
import { ShoppingDataError, type ShoppingDb } from "./client";
import { loadShoppingList, type ShoppingSources } from "./queries";

// "Lägg i lagret" (FR-19, AD-1, AD-8, AD-19): the checked lines go to the
// pantry (pantry.addToPantry), and then off the list (clear_put_in_pantry).
// The flow crosses two modules, so it is idempotent rather than atomic: each
// item's key is its check's id, which the pantry keeps a receipt of until the
// check is cleared, so a run after an interruption, or a second run that
// reaches the pantry before the first has cleared, never adds an item twice.
// The pantry always comes first and the clearing second. (A second run that
// read the checks before the first cleared them, but reaches the pantry only
// after the first forgot the receipts, would add again: two devices tapping
// at the same moment; accepted, see docs/beslutslogg.md.)

const idSchema = z.uuid();

/**
 * Deletes the own items `customItemIds`, the checks `checkIds` and the
 * overrides of the line keys `overrideKeys` on the user's current plan, in
 * one transaction under the meal plan lock (clear_put_in_pantry). Idempotent.
 * Returns the number of own items deleted; `plan_changed`, with nothing
 * written, when the plan is no longer the user's current plan or is gone.
 * Throws ShoppingDataError: `invalid_clear` before anything is written, or
 * `clear_failed <code>`.
 */
export async function clearPutInPantryIn(
  db: ShoppingDb,
  planId: string,
  { checkIds, overrideKeys, customItemIds }: ClearPutInPantry,
): Promise<number | "plan_changed"> {
  if (
    !idSchema.safeParse(planId).success ||
    !checkIds.every((id) => idSchema.safeParse(id).success) ||
    !overrideKeys.every((key) => lineKeySchema.safeParse(key).success) ||
    !customItemIds.every((id) => idSchema.safeParse(id).success)
  ) {
    throw new ShoppingDataError("invalid_clear");
  }
  const { data, error } = await db.rpc("clear_put_in_pantry", {
    plan_id: planId,
    check_ids: [...new Set(checkIds)],
    override_keys: [...new Set(overrideKeys)],
    custom_item_ids: [...new Set(customItemIds)],
  });
  if (error) {
    if (error.code === "55000") return "plan_changed";
    throw new ShoppingDataError(`clear_failed ${error.code}`, error.code);
  }
  return data;
}

/** What clear_put_in_pantry deletes. */
export type ClearPutInPantry = {
  checkIds: readonly string[];
  overrideKeys: readonly string[];
  customItemIds: readonly string[];
};

/** What putInPantryWith needs: the list's sources and the two modules' writes. */
export type PutInPantryDeps = {
  /** The list's sources, as getShoppingList has them; the checks come from `checkRows`. */
  sources: Omit<ShoppingSources, "checks">;
  /** The plan's checks with their ids (data/checks.ts, listCheckRowsIn). */
  checkRows: (planId: string) => Promise<readonly CheckRow[]>;
  /** pantry.findPantryAdditions: the keys among these the pantry has a receipt of. */
  findAdditions: (keys: readonly string[]) => Promise<readonly string[]>;
  /** pantry.addToPantry. */
  addToPantry: (items: readonly PantryAddition[]) => Promise<Result<{ added: number }>>;
  /** clearPutInPantryIn with the user's client. */
  clear: (planId: string, clear: ClearPutInPantry) => Promise<number | "plan_changed">;
  /**
   * pantry.forgetPantryAdditions, after the clear: the receipts of the
   * cleared checks are no longer needed. Never throws: a receipt left behind
   * is pruned after 30 days.
   */
  forgetAdditions: (keys: readonly string[]) => Promise<void>;
};

/**
 * How a run ended. `pantryWritten`: addToPantry ran and succeeded (some of its
 * items may have been skipped for their receipts), so the pantry's views are
 * revalidated whatever happened after.
 */
export type PutInPantryOutcome =
  /**
   * `added`: the items put in the pantry; `removed`: the own items without a
   * link taken off the list; `skipped`: checked lines that could not go to
   * the pantry and keep their checks; `handled`: the items the pantry took in
   * this run, without those it skipped for a receipt from an earlier one.
   */
  | { kind: "done"; added: number; removed: number; skipped: number; pantryWritten: boolean; handled: number }
  /** The plan is no longer the current one: the list must be read again. */
  | { kind: "plan_changed"; pantryWritten: boolean }
  /** addToPantry failed: nothing was added, and the list is as it was. */
  | { kind: "pantry_failed"; error: AppError }
  /** The pantry was written but the list could not be cleared, twice; a new run clears it, adding nothing twice. */
  | { kind: "clear_failed"; detail: string; pantryWritten: boolean };

/**
 * The checks of no line on the list (`unsent`) that an earlier, interrupted
 * run put in the pantry: the pantry has their receipts. Nothing is asked
 * without such checks.
 */
export async function receiptedChecks(
  unsent: readonly CheckRow[],
  findAdditions: PutInPantryDeps["findAdditions"],
): Promise<CheckRow[]> {
  if (unsent.length === 0) return [];
  const found = new Set(await findAdditions(unsent.map((check) => check.id)));
  return unsent.filter((check) => found.has(check.id));
}

/**
 * "Lägg i lagret" for the plan `planId`, which the list was counted for:
 * 1. The list is counted on the server with computeList (loadShoppingList),
 *    with the checks' ids and the catalog ingredients it was counted with;
 *    not the current plan gives `plan_changed`.
 * 2. planPutInPantry says which checked lines go to the pantry and what is
 *    cleared. The checks of lines no longer on the list (covered by the
 *    pantry now, say) are cleared too when an earlier, interrupted run put
 *    them in the pantry: the pantry has their receipt.
 * 3. The items go to addToPantry, then clear deletes the own items, the
 *    checks and the sent lines' overrides; a failed clear is tried once
 *    more. Then the cleared checks' receipts are forgotten.
 * What the sources and findAdditions throw is passed on; nothing is written then.
 */
export async function putInPantryWith(deps: PutInPantryDeps, planId: string): Promise<PutInPantryOutcome> {
  let checks: readonly CheckRow[] = [];
  const known = new Set<string>();
  const list = await loadShoppingList({
    ...deps.sources,
    checks: async (id) => {
      checks = await deps.checkRows(id);
      return checks.map((check) => check.key);
    },
    ingredientDefaults: async (ids) => {
      const defaults = await deps.sources.ingredientDefaults(ids);
      for (const id of Object.keys(defaults)) known.add(id);
      return defaults;
    },
  });
  if (list.plan?.id !== planId) return { kind: "plan_changed", pantryWritten: false };

  const plan = planPutInPantry(list.lines, checks, known);
  const earlier = await receiptedChecks(plan.unsent, deps.findAdditions);
  const toClear: ClearPutInPantry = {
    checkIds: [...plan.checkIds, ...earlier.map((check) => check.id)],
    overrideKeys: plan.overrideKeys,
    customItemIds: plan.customItemIds,
  };
  const done = { kind: "done" as const, added: plan.items.length, removed: plan.removed, skipped: plan.skipped };
  if (toClear.checkIds.length === 0 && toClear.customItemIds.length === 0) {
    return { ...done, added: 0, pantryWritten: false, handled: 0 };
  }

  let pantryWritten = false;
  let handled = 0;
  if (plan.items.length > 0) {
    const added = await deps.addToPantry(plan.items);
    if (!added.ok) return { kind: "pantry_failed", error: added.error };
    pantryWritten = true;
    handled = added.data.added;
  }

  let failure = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const cleared = await deps.clear(planId, toClear);
      if (cleared === "plan_changed") return { kind: "plan_changed", pantryWritten };
      failure = "";
      break;
    } catch (error) {
      if (!(error instanceof ShoppingDataError)) throw error;
      failure = error.detail;
    }
  }
  if (failure) return { kind: "clear_failed", detail: failure, pantryWritten };
  await deps.forgetAdditions(toClear.checkIds);
  return { ...done, pantryWritten, handled };
}
