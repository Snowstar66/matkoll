import "server-only";
import { z } from "zod";
import { lineOverrideRowSchema, type HiddenLine, type LineOverride, type LineOverrideRow } from "../domain/line-override";
import { ShoppingDataError, type ShoppingDb } from "./client";

// Corrected amounts and hidden lines on the shopping list (Story 3.6, AD-8):
// rows of shopping_line_override, which only this module reads and writes
// (AD-1). The functions take the user's session client, so RLS limits them to
// the user's own rows. Every write runs under the meal plan lock and only on
// the current plan (set_shopping_line_amount, hide_shopping_line,
// restore_shopping_line, show_shopping_line). Each function checks the plan
// before it writes and raises 55000 when it is not the current one (also when
// it is gone), so that is the only "plan changed" answer.

const idSchema = z.uuid();

/**
 * Rows per page when the overrides are read: at most the API's row limit
 * (max_rows in supabase/config.toml, checked by tests/design/pantry-paging.test.ts),
 * so a full page means there may be more.
 */
export const overridePageSize = 1000;

type DbRow = {
  id: string;
  meal_plan_id: string;
  line_key: string;
  amount: number | string | null;
  base_amount: number | string | null;
  hidden: boolean;
};

const columns = "id, meal_plan_id, line_key, amount, base_amount, hidden";

const numberOrNull = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

/** A row from the database as the domain's LineOverrideRow; the checks equal the table's. */
function toRow(row: DbRow): LineOverrideRow {
  const parsed = lineOverrideRowSchema.safeParse({
    id: row.id,
    planId: row.meal_plan_id,
    key: row.line_key,
    amount: numberOrNull(row.amount),
    baseAmount: numberOrNull(row.base_amount),
    hidden: row.hidden,
  });
  if (!parsed.success) throw new ShoppingDataError("invalid_line_override");
  return parsed.data;
}

/**
 * The plan's overrides, for the list's overlay, page by page; also those
 * whose line is not on the list now. A row the domain cannot read is left out
 * (and logged). Throws ShoppingDataError.
 */
export async function listOverridesIn(db: ShoppingDb, planId: string): Promise<LineOverride[]> {
  if (!idSchema.safeParse(planId).success) throw new ShoppingDataError("invalid_id");
  const rows: DbRow[] = [];
  for (let from = 0; ; from += overridePageSize) {
    const { data, error } = await db
      .from("shopping_line_override")
      .select(columns)
      .eq("meal_plan_id", planId)
      .order("id")
      .range(from, from + overridePageSize - 1);
    if (error) throw new ShoppingDataError(`list_overrides_failed ${error.code}`, error.code);
    rows.push(...data);
    if (data.length < overridePageSize) break;
  }
  return rows.flatMap((row) => {
    try {
      const { key, amount, baseAmount, hidden } = toRow(row);
      return [{ key, amount, baseAmount, hidden }];
    } catch (error) {
      if (!(error instanceof ShoppingDataError)) throw error;
      console.error("shopping_line_override_unreadable", { reason: error.detail });
      return [];
    }
  });
}

/**
 * setLineAmount and clearLineAmount (AD-22): the line's corrected amount on
 * the plan, with the amount the list counted then (`baseAmount`), or
 * (`null`) back to the counted one, under the meal plan lock. Idempotent.
 * `plan_changed`, with nothing written, when the plan is no longer the user's
 * current plan or is gone. Throws ShoppingDataError otherwise: `amount_failed <code>`.
 */
export async function setLineAmountIn(
  db: ShoppingDb,
  planId: string,
  key: string,
  amount: number | null,
  baseAmount: number | null = null,
): Promise<"saved" | "plan_changed"> {
  const { error } = await db.rpc("set_shopping_line_amount", {
    plan_id: planId,
    line_key: key,
    // null goes back to the counted amount; the generated types cannot say that a SQL argument takes null.
    amount: amount as number,
    ...(amount !== null && baseAmount !== null ? { base_amount: baseAmount } : {}),
  });
  if (!error) return "saved";
  if (error.code === "55000") return "plan_changed";
  throw new ShoppingDataError(`amount_failed ${error.code}`, error.code);
}

const hiddenSchema = z.object({
  previous: z.record(z.string(), z.unknown()).nullable(),
  hidden_updated_at: z.string().min(1),
});

/**
 * hideLine (AD-20): hides the line on the plan under the meal plan lock,
 * keeping a corrected amount, and returns the line's override as it was
 * before (`null` when it had none; a line hidden already gives its row as not
 * hidden) with the hidden row's updated_at. `unrestorable` when the line is
 * hidden but the row before cannot be read, so "Ångra" is not offered.
 * `plan_changed`, with nothing written, when the plan is no longer the
 * current one. Throws ShoppingDataError otherwise: `hide_failed <code>`.
 */
export async function hideLineIn(
  db: ShoppingDb,
  planId: string,
  key: string,
): Promise<HiddenLine | "unrestorable" | "plan_changed"> {
  const { data, error } = await db.rpc("hide_shopping_line", { plan_id: planId, line_key: key });
  if (error) {
    if (error.code === "55000") return "plan_changed";
    throw new ShoppingDataError(`hide_failed ${error.code}`, error.code);
  }
  // The hide has been written: from here on, a failure only means no "Ångra".
  const parsed = hiddenSchema.safeParse(data);
  if (!parsed.success) return "unrestorable";
  try {
    const previous = parsed.data.previous === null ? null : toRow(parsed.data.previous as DbRow);
    return { previous, hiddenUpdatedAt: parsed.data.hidden_updated_at };
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    return "unrestorable";
  }
}

/**
 * restoreLine (AD-20): puts the line's override back as hideLine returned it,
 * with the same id, or deletes it when `previous` is `null`, under the meal
 * plan lock. When the row has changed since the hide (`hiddenUpdatedAt` is
 * not its updated_at, e.g. a correction from another tab), only the hidden
 * flag goes back and the current amount stays. Idempotent. `plan_changed`,
 * with nothing written, when the plan is no longer the current one. Throws
 * ShoppingDataError otherwise: `restore_failed <code>`.
 */
export async function restoreLineIn(
  db: ShoppingDb,
  planId: string,
  key: string,
  previous: LineOverrideRow | null,
  hiddenUpdatedAt: string | null = null,
): Promise<"saved" | "plan_changed"> {
  const { error } = await db.rpc("restore_shopping_line", {
    plan_id: planId,
    line_key: key,
    previous: previous && {
      id: previous.id,
      meal_plan_id: previous.planId,
      line_key: previous.key,
      amount: previous.amount,
      base_amount: previous.baseAmount,
      hidden: previous.hidden,
    },
    ...(hiddenUpdatedAt !== null ? { hidden_updated_at: hiddenUpdatedAt } : {}),
  });
  if (!error) return "saved";
  if (error.code === "55000") return "plan_changed";
  throw new ShoppingDataError(`restore_failed ${error.code}`, error.code);
}

/**
 * showLine: "Visa igen" in Dolda varor. Un-hides the line on the plan and
 * keeps a corrected amount, under the meal plan lock. Idempotent.
 * `plan_changed`, with nothing written, when the plan is no longer the
 * current one. Throws ShoppingDataError otherwise: `show_failed <code>`.
 */
export async function showLineIn(db: ShoppingDb, planId: string, key: string): Promise<"saved" | "plan_changed"> {
  const { error } = await db.rpc("show_shopping_line", { plan_id: planId, line_key: key });
  if (!error) return "saved";
  if (error.code === "55000") return "plan_changed";
  throw new ShoppingDataError(`show_failed ${error.code}`, error.code);
}
