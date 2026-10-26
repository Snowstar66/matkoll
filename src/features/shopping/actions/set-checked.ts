"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { setCheckIn } from "../data/checks";
import { ShoppingDataError } from "../data/client";
import { checkChangeSchema, type CheckChange } from "../domain/check";

/**
 * The check on a list line (FR-16, AD-8): checks the line off on the current
 * meal plan, or takes the check off. Both are idempotent, so a second tap or
 * another device changes nothing more. The check shows at once
 * (useOptimistic) and is saved here. Checks belong to the current plan
 * (AD-22): `planId` is the plan the list was counted for, which the database
 * compares with the current plan under the meal plan lock
 * (set_shopping_check). Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the plan
 * is no longer the current one, or is gone: the list must be read again) or
 * `shopping_check_failed` (logged); nothing is changed then.
 */
export async function setChecked(change: CheckChange): Promise<Result<CheckChange>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = checkChangeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  const { planId, key, checked } = parsed.data;

  try {
    const outcome = await setCheckIn(await createClient(), planId, key, checked);
    if (outcome === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_check");
    return ok({ planId, key, checked });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_check_failed", { reason: error.detail });
    return fail("shopping_check_failed");
  }
}
