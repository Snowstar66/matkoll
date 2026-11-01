"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { removePantryItemIn } from "../data/remove";
import type { PantryRow } from "../domain/pantry-item-form";

const idSchema = z.uuid();

/**
 * "Ta bort" on a pantry item, by swipe or in the sheet Lagervara (FR-11,
 * AD-19): deletes the row for good, without asking first (AD-20), and returns
 * it as it was, so "Ångra" can put it back with restorePantryItem. Returns
 * null when the row was deleted but could not be read back: it is gone, and
 * cannot be undone. Revalidates Hemma and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `pantry_remove_failed`, also when
 * the user has no row with the id (another user's, or gone already); the
 * routes are revalidated then too, so a list that still shows the row catches
 * up.
 */
export async function removePantryItem(id: string): Promise<Result<PantryRow | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");

  try {
    const removed = await removePantryItemIn(await createClient(), parsed.data);
    revalidateFor("pantry_item");
    if (!removed) {
      console.error("pantry_remove_failed", { reason: "not_found" });
      return fail("pantry_remove_failed");
    }
    if (!removed.row) console.error("pantry_remove_unrestorable", { reason: "invalid_row" });
    return ok(removed.row);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_remove_failed", { reason: error.detail });
    return fail("pantry_remove_failed");
  }
}
