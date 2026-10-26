"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { removeProductChoiceIn } from "../data/product-choices";
import type { ProductChoice } from "../domain/product-choice";

const inputSchema = z.object({ id: z.guid() });

/** What removeProductChoice did: `removed` the choice (`row` for "Ångra", or `null` when it cannot be put back), or found it `gone` already. */
export type RemovedProductChoice = { status: "removed"; row: ProductChoice | null } | { status: "gone" };

/**
 * "Ta bort produktval" in the sheet Produktval (FR-27, AD-20): deletes the
 * choice for good, without asking first, and returns it as it was, so
 * "Ångra" can put it back with restoreProductChoice. A deleted row that
 * cannot be read back is removed all the same, without "Ångra" (logged).
 * `gone` when there was no choice with the id any more (removed elsewhere).
 * Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation` or
 * `shopping_product_choice_remove_failed` (logged); the choice stays then.
 */
export async function removeProductChoice(input: { id: string }): Promise<Result<RemovedProductChoice>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    const removed = await removeProductChoiceIn(await createClient(), parsed.data.id);
    revalidateFor("product_choice");
    return ok(removed ? { status: "removed", row: removed.row } : { status: "gone" });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_product_choice_remove_failed", { reason: error.detail });
    return fail("shopping_product_choice_remove_failed");
  }
}
