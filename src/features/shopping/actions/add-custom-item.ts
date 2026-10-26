"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { addCustomItemIn } from "../data/custom-items";
import {
  customItemFieldErrors,
  customItemFormSchema,
  type CustomItemFormInput,
  type CustomItemRow,
} from "../domain/custom-item";

/**
 * "Lägg till" in the sheet Lägg till egen vara (FR-17, AD-8): adds Pontus's
 * own item to the current meal plan's list, with the form's schema. A
 * catalog ingredient chosen among the suggestions is only stored as the
 * item's link: the list never writes to the catalog, so no synonym and no
 * ingredient comes from an own item (decision 2026-10-26). The database
 * refuses an ingredient that is not the user's. `planId` is the plan the
 * list was counted for, which the database compares with the current plan
 * under the meal plan lock (AD-22). The client sends `id`, kept while the
 * form is unchanged, so a retry after a lost answer adds the item once
 * (AD-20). Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation` (with the form's messages in
 * `fields`), `shopping_plan_changed` (the plan is no longer the current one:
 * the list must be read again; also a retry whose id was used for a
 * different item) or `shopping_save_failed` (logged), also when the
 * ingredient is not in the user's catalog; nothing is added then.
 */
export async function addCustomItem(input: CustomItemFormInput): Promise<Result<CustomItemRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = customItemFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields = customItemFieldErrors(parsed.error);
    return fail("validation", Object.keys(fields).length > 0 ? fields : undefined);
  }
  const { id, planId, label, ingredientId, amount, unit } = parsed.data;

  try {
    const added = await addCustomItemIn(await createClient(), {
      id: id ?? crypto.randomUUID(),
      planId,
      label,
      ingredientId,
      amount,
      unit,
    });
    if (added === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_custom_item");
    return ok(added);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  }
}
