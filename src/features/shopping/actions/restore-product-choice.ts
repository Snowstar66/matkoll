"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { restoreProductChoiceIn } from "../data/product-choices";
import { type ProductChoice, productChoiceSchema } from "../domain/product-choice";

/**
 * "Ångra" after "Ta bort produktval" (FR-27, AD-20): puts the row that
 * removeProductChoice returned back with the same id, ingredient, store and
 * fields, checked with the form's rules. "Ångra" twice puts it back once.
 * Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, or `shopping_restore_failed`
 * ("Det gick inte att ångra."): when another choice for the ingredient and
 * store has been saved meanwhile, which stays, when the ingredient or the
 * store is gone, or when Postgres refuses (logged).
 */
export async function restoreProductChoice(row: ProductChoice): Promise<Result<{ choice: ProductChoice }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = productChoiceSchema.safeParse(row);
  if (!parsed.success) return fail("validation");

  try {
    const restored = await restoreProductChoiceIn(await createClient(), parsed.data);
    revalidateFor("product_choice");
    if (restored === "conflict") {
      // Expected: a new choice was saved meanwhile, and it stays.
      console.info("shopping_restore_conflict", { reason: "product_choice_conflict" });
      return fail("shopping_restore_failed");
    }
    if (restored === "invalid_reference") {
      console.error("shopping_restore_failed", { reason: "product_choice_invalid_reference" });
      return fail("shopping_restore_failed");
    }
    return ok({ choice: restored });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_restore_failed", { reason: error.detail });
    return fail("shopping_restore_failed");
  }
}
