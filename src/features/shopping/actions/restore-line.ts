"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { restoreLineIn } from "../data/overrides";
import { restoreLineSchema, type RestoreLine } from "../domain/line-override";

/**
 * "Ångra" after a recipe line was hidden (FR-17, AD-20): puts back exactly
 * the override hideLine returned, with the same id, so the line comes back
 * with the corrected amount it had; with `previous` null, the line's
 * override is deleted. When the row has changed since the hide (another tab
 * corrected it; `hiddenUpdatedAt` from hideLine says), only the line is shown
 * again and the current amount stays. Only on the current plan (AD-22). "Ångra" twice
 * changes nothing more. Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the plan
 * is no longer the current one) or `shopping_restore_failed` (logged);
 * nothing is changed then and the line stays hidden.
 */
export async function restoreLine(input: RestoreLine): Promise<Result<RestoreLine>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = restoreLineSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { planId, key, previous, hiddenUpdatedAt } = parsed.data;

  try {
    const outcome = await restoreLineIn(await createClient(), planId, key, previous, hiddenUpdatedAt);
    if (outcome === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_line_override");
    return ok(parsed.data);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_restore_failed", { reason: error.detail });
    return fail("shopping_restore_failed");
  }
}
