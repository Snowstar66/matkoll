"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { restorePantryRemovalIn, type RestoredRemoval } from "../data/remove";
import { revalidatePantryCommitted } from "./revalidate-committed";

const operationSchema = z.uuid();

/**
 * "Ångra" after "Töm kylen" (Story 6.3, AD-19, AD-20), and after the
 * removals of an inventory (Story 6.4): puts back every row the removal
 * operation took, from the server's own record of them, with the same id,
 * amount, unit and location, in one call and one transaction. A row is
 * skipped when the location has the item again (Pontus has added it since,
 * with the same unit or either one unlimited), its id is taken, or its
 * catalog ingredient is gone; the others go back. Revalidates Hemma and
 * what is derived from the pantry (AD-18), also when rows were skipped, so
 * the rows that are there now show; once the restore has committed, the
 * answer is `ok`.
 *
 * Fails with `unauthorized`, `validation` or `pantry_restore_failed` (also
 * for an operation that is unknown, already undone, or older than a day);
 * nothing is put back then.
 */
export async function restorePantryRemoval(operationId: string): Promise<Result<RestoredRemoval>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const operation = operationSchema.safeParse(operationId);
  if (!operation.success) return fail("validation");

  let restored: RestoredRemoval;
  try {
    restored = await restorePantryRemovalIn(await createClient(), operation.data);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_restore_failed", { reason: error.detail });
    return fail("pantry_restore_failed");
  }
  revalidatePantryCommitted();
  // Not an error: the item is at home again, or its ingredient is gone. Only the count is logged.
  if (restored.skipped > 0) console.info("pantry_restore_skipped", { count: restored.skipped });
  return ok(restored);
}
