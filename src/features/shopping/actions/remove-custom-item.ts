"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { removeCustomItemIn } from "../data/custom-items";
import type { CustomItemRow } from "../domain/custom-item";

const idSchema = z.uuid();

/**
 * "Ta bort" on an own item, by swipe (FR-17, AD-20): deletes it for good,
 * without asking first, and returns it as it was, so "Ångra" can put it back
 * with restoreCustomItem. Its check stays, so "Ångra" brings the check back
 * too. Returns null when the item was deleted but could not be read back: it
 * is gone, and cannot be undone. Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_remove_failed`, also when the user has no item with the id
 * (another user's, or gone already); the list is revalidated then too, so a
 * list that still shows the item catches up.
 */
export async function removeCustomItem(id: string): Promise<Result<CustomItemRow | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");

  try {
    const removed = await removeCustomItemIn(await createClient(), parsed.data);
    revalidateFor("shopping_custom_item");
    if (!removed) {
      console.error("shopping_remove_failed", { reason: "not_found" });
      return fail("shopping_remove_failed");
    }
    if (!removed.row) console.error("shopping_remove_unrestorable", { reason: "invalid_row" });
    return ok(removed.row);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_remove_failed", { reason: error.detail });
    return fail("shopping_remove_failed");
  }
}
