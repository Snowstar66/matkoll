import "server-only";
import { z } from "zod";
import { lineKeySchema } from "../domain/line-key";
import { ShoppingDataError, type ShoppingDb } from "./client";

// The checks on the shopping list (Story 3.4, AD-8): one row per meal plan
// and line key in shopping_check, which only this module reads and writes
// (AD-1). The functions take the user's session client, so RLS limits them
// to the user's own rows.

const idSchema = z.uuid();

function validate(planId: string, key?: string): void {
  if (!idSchema.safeParse(planId).success) throw new ShoppingDataError("invalid_id");
  if (key !== undefined && !lineKeySchema.safeParse(key).success) throw new ShoppingDataError("invalid_line_key");
}

/**
 * The keys of the plan's checked lines, for the list's overlay; also checks
 * whose line is not on the list now. Throws ShoppingDataError.
 */
export async function listChecksIn(db: ShoppingDb, planId: string): Promise<string[]> {
  validate(planId);
  const { data, error } = await db.from("shopping_check").select("line_key").eq("meal_plan_id", planId);
  if (error) throw new ShoppingDataError(`list_checks_failed ${error.code}`, error.code);
  return data.map((row) => row.line_key);
}

/** The foreign key from a check to its meal plan; a violation means the plan is gone. */
const planForeignKey = "shopping_check_meal_plan_fkey";

/**
 * Checks the line off on the plan (`checked`), or takes the check off, in
 * one transaction under the meal plan lock (set_shopping_check). Both are
 * idempotent: a second tap, or another device, changes nothing more.
 * `plan_changed`, with nothing written, when the plan is no longer the
 * user's current plan (55000) or is gone (the plan foreign key). Throws
 * ShoppingDataError otherwise: `check_failed <code>`.
 */
export async function setCheckIn(
  db: ShoppingDb,
  planId: string,
  key: string,
  checked: boolean,
): Promise<"saved" | "plan_changed"> {
  validate(planId, key);
  const { error } = await db.rpc("set_shopping_check", { plan_id: planId, line_key: key, checked });
  if (!error) return "saved";
  if (error.code === "55000" || (error.code === "23503" && error.message.includes(planForeignKey))) {
    return "plan_changed";
  }
  throw new ShoppingDataError(`check_failed ${error.code}`, error.code);
}
