"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { restorePantryItemIn } from "../data/remove";
import { pantryRowSchema, type PantryRow } from "../domain/pantry-item-form";

/**
 * "Ångra" after a pantry item was removed (AD-19, AD-20): puts the row that
 * removePantryItem returned back with the same id, amount, unit and location.
 * Revalidates Hemma and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `pantry_restore_failed`, also
 * when the location has the item again (a new row with the same key) or a
 * row has the id; nothing is changed then and the item stays removed. That
 * refusal revalidates too, so the row that is there now shows.
 */
export async function restorePantryItem(row: PantryRow): Promise<Result<PantryRow>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = pantryRowSchema.safeParse(row);
  if (!parsed.success) return fail("validation");

  try {
    const restored = await restorePantryItemIn(await createClient(), parsed.data);
    revalidateFor("pantry_item");
    return ok(restored);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_restore_failed", { reason: error.detail });
    if (error.detail === "restore_failed 23505") revalidateFor("pantry_item");
    return fail("pantry_restore_failed");
  }
}
