"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { setLineAmountIn } from "../data/overrides";
import {
  lineAmountFieldErrors,
  lineAmountFormSchema,
  type LineAmountForm,
  type LineAmountFormInput,
} from "../domain/line-override";

/**
 * "Spara" in Listpostdetalj (FR-17, AD-8): Pontus's corrected amount for a
 * recipe line, in the line's unit, with the form's schema. It replaces the
 * counted amount as long as the line keeps its key, and a hidden line stays
 * hidden. `baseAmount`, the amount the list counted when the detail opened,
 * is stored beside it, so the row can say when the counted amount changes. `planId` is the plan the list was counted for, which the database
 * compares with the current plan under the meal plan lock (AD-22).
 * Idempotent, so a retry after a lost answer is safe. Revalidates the list
 * (AD-18).
 *
 * Fails with `unauthorized`, `validation` (with "Ange ett tal större än 0."
 * at `amount`), `shopping_plan_changed` (the list must be read again) or
 * `shopping_save_failed` (logged); nothing is changed then.
 */
export async function setLineAmount(input: LineAmountFormInput): Promise<Result<LineAmountForm>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = lineAmountFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields = lineAmountFieldErrors(parsed.error);
    return fail("validation", Object.keys(fields).length > 0 ? fields : undefined);
  }
  const { planId, key, amount, baseAmount } = parsed.data;

  try {
    const outcome = await setLineAmountIn(await createClient(), planId, key, amount, baseAmount);
    if (outcome === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_line_override");
    return ok(parsed.data);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  }
}
