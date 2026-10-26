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
 * removePantryItem returned back with the same id, amount, unit and location,
 * on its own place (`siteId`), also when another place has been selected
 * since (FR-33). Revalidates Hemma and the recipes (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (the row's
 * place was deleted) or `pantry_restore_failed`, also when the location has
 * the item again (a new row with the same key) or a row has the id; nothing
 * is changed then and the item stays removed. Those refusals revalidate too,
 * so the page shows what is there now.
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
    if (error.detail === "restore_failed MK410") {
      console.error("pantry_site_gone", { reason: error.detail });
      revalidateFor("pantry_site");
      return fail("pantry_site_gone");
    }
    console.error("pantry_restore_failed", { reason: error.detail });
    if (error.detail === "restore_failed 23505") revalidateFor("pantry_item");
    return fail("pantry_restore_failed");
  }
}
