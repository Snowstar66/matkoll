"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { updateCustomItemIn } from "../data/custom-items";
import {
  customItemFieldErrors,
  customItemFormSchema,
  type CustomItemFormInput,
  type CustomItemRow,
} from "../domain/custom-item";

/**
 * "Spara" in an own item's Listpostdetalj (FR-17, Story 3.6): changes the
 * item's text, catalog ingredient, amount and unit with the same schema as
 * "Lägg till egen vara", keeping its id, so its check stays. Only the link is
 * stored: the list never writes to the catalog. `planId` is the plan the list
 * was counted for, which the database compares with the item's plan and the
 * current plan under the meal plan lock (AD-22). Idempotent. Revalidates the
 * list (AD-18).
 *
 * Fails with `unauthorized`, `validation` (with the form's messages in
 * `fields`; also without an id), `shopping_plan_changed`, `shopping_item_gone`
 * (removed meanwhile; the list is revalidated) or `shopping_save_failed`
 * (logged), also when the ingredient is not in the user's catalog; nothing
 * is changed then.
 */
export async function updateCustomItem(input: CustomItemFormInput): Promise<Result<CustomItemRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = customItemFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields = customItemFieldErrors(parsed.error);
    return fail("validation", Object.keys(fields).length > 0 ? fields : undefined);
  }
  const { id, planId, label, ingredientId, amount, unit } = parsed.data;
  if (!id) return fail("validation");

  try {
    const saved = await updateCustomItemIn(await createClient(), { id, planId, label, ingredientId, amount, unit });
    if (saved === "plan_changed") return fail("shopping_plan_changed");
    if (saved === "not_found") {
      revalidateFor("shopping_custom_item");
      return fail("shopping_item_gone");
    }
    revalidateFor("shopping_custom_item");
    return ok(saved);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  }
}
