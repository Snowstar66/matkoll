"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { sweepPlacePhotosIn } from "./photo-sweep";

/**
 * The sweep of the latest photos (Story 10.3, FR-39): removes the signed-in
 * user's photos older than 30 days (files, then the rows whose files are
 * gone) and files without a row older than 10 minutes, at most 100 files per
 * call (see sweepPlacePhotosIn). Lagersaldo calls it when it has photos older
 * than 30 days, again while `more` is true (a bounded number of times), and
 * shows nothing. Takes nothing from the client. Revalidates Lagersaldo
 * (AD-18) only when something was removed. Returns how many photos and files
 * went, and whether more remain.
 *
 * Fails with `unauthorized`, or `pantry_photo_remove_failed` when Storage or
 * the database could not be reached, or fewer were removed than chosen
 * (`remove_partial`); logged with the reason only, never a path. What was
 * removed before that stays removed.
 */
export async function sweepPlacePhotos(): Promise<Result<{ removed: number; more: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const outcome = await sweepPlacePhotosIn(await createClient());
  if (outcome.removed > 0) revalidateFor("pantry_photo");
  if (outcome.failed !== null) {
    console.error("pantry_photo_remove_failed", { reason: outcome.failed });
    return fail("pantry_photo_remove_failed");
  }
  return ok({ removed: outcome.removed, more: outcome.more });
}
