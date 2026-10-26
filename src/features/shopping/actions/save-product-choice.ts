"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { upsertProductChoiceIn } from "../data/product-choices";
import {
  type ProductChoice,
  productChoiceFieldErrors,
  type ProductChoiceFormInput,
  productChoiceFormSchema,
} from "../domain/product-choice";

/**
 * "Spara" in the sheet Produktval (FR-27, Story 7.2): saves the choice for
 * the catalog ingredient in the store the sheet showed, with the same schema
 * as the form, when the stored choice is still the one the sheet opened with
 * (`expected`). The same fields again give the stored choice, so a double tap
 * or a retry after a lost answer gives one row, and a changed choice keeps
 * its id. The store is the one the list was read with, not read again here,
 * so the choice lands in the store whose name the sheet showed. Revalidates
 * the list (AD-18), which reads the choices again but is not counted
 * differently. `choice` is `null` when the saved row cannot be read back
 * (logged); it is saved all the same.
 *
 * Fails with `unauthorized`, `validation` (with the form's messages in
 * `fields`; without fields for an id that is not one),
 * `shopping_product_choice_changed` (another choice is stored than the
 * expected one: saved, changed or removed elsewhere; nothing written),
 * `shopping_product_choice_target_gone` (the ingredient or the store is gone
 * or not the user's; nothing written) or `shopping_product_choice_save_failed`
 * (logged with the Postgres code only, never the product's name or link).
 */
export async function saveProductChoice(
  input: ProductChoiceFormInput,
): Promise<Result<{ choice: ProductChoice | null }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = productChoiceFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields = productChoiceFieldErrors(parsed.error);
    return fail("validation", Object.keys(fields).length > 0 ? fields : undefined);
  }

  try {
    const outcome = await upsertProductChoiceIn(await createClient(), parsed.data);
    // Saved or not, the list reads the choices again, so the sheet can show them as they are.
    revalidateFor("product_choice");
    if (outcome.kind === "changed") return fail("shopping_product_choice_changed");
    if (outcome.kind === "target_gone") return fail("shopping_product_choice_target_gone");
    return ok({ choice: outcome.choice });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_product_choice_save_failed", { reason: error.detail });
    return fail("shopping_product_choice_save_failed");
  }
}
