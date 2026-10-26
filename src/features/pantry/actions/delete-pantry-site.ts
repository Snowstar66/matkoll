"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { deleteSiteIn } from "../data/sites";

const deleteSchema = z.object({ id: z.uuid() });

/**
 * "Ta bort" on a place's row in the sheet Ställen (FR-29, AD-24): deletes an
 * empty place that is not selected and not the last, without asking and
 * without "Ångra" (nothing is lost). A place that is gone already gives
 * `ok({ removed: false })`: the result is what was asked for, and a retry
 * after a lost answer is harmless. Revalidates everything counted against
 * the pantry (AD-18), also when the place is in use, so the sheet is read
 * again.
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_in_use` (selected,
 * with items or the last; another tab changed it meanwhile) or
 * `pantry_site_failed`. Logs only the error code and the Postgres code.
 */
export async function deletePantrySite(input: { id: string }): Promise<Result<{ removed: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  try {
    const outcome = await deleteSiteIn(await createClient(), parsed.data.id);
    revalidateFor("pantry_site");
    if (outcome.kind === "in_use") return fail("pantry_site_in_use");
    return ok({ removed: outcome.removed });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_site_failed", { reason: error.detail });
    return fail("pantry_site_failed");
  }
}
