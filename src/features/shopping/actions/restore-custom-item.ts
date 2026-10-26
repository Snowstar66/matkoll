"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { addCustomItemIn } from "../data/custom-items";
import { collapseLabel, customItemRowSchema, type CustomItemRow } from "../domain/custom-item";

/**
 * "Ångra" after an own item was removed (FR-17, AD-20): puts the row that
 * removeCustomItem returned back with the same id, text, catalog ingredient,
 * amount and unit, so it comes back under the same section and with its
 * check, which stayed. Only onto the current plan (AD-22). "Ångra" twice puts
 * it back once. The text is trimmed with single spaces, as the form saves
 * it. Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the plan
 * is no longer the current one) or `shopping_restore_failed` (logged);
 * nothing is changed then and the item stays removed.
 */
export async function restoreCustomItem(row: CustomItemRow): Promise<Result<CustomItemRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = customItemRowSchema.safeParse(
    row && typeof row === "object" && typeof row.label === "string" ? { ...row, label: collapseLabel(row.label) } : row,
  );
  if (!parsed.success) return fail("validation");

  try {
    const restored = await addCustomItemIn(await createClient(), parsed.data);
    if (restored === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_custom_item");
    return ok(restored);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_restore_failed", { reason: error.detail });
    return fail("shopping_restore_failed");
  }
}
