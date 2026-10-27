"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { deletePlacePhotoRowIn, removePlacePhotoFiles } from "../data/photos";
import { removePlacePhotoSchema, type RemovePlacePhotoInput } from "../domain/place-photo";

/**
 * "Ta bort fotot" (Story 10.2, FR-39, AD-26): deletes the signed-in user's
 * photo `id`, first its row and then its file with the Storage API, after
 * the question in the sheet; there is no "Ångra". A photo that is gone
 * already (another device, Story 10.3's sweep) is `ok`: what Pontus asked
 * for is done. When the row is deleted but the file cannot be removed, the
 * photo is gone for Pontus, the failure is logged with its reason only, and
 * the file is left for the sweep (Story 10.3), as a replaced photo's file is
 * in Story 10.1.
 *
 * Fails with `unauthorized`, `validation` or `pantry_photo_remove_failed`
 * (the row could not be deleted, so the photo stays; logged with the reason
 * only, never the id or the path).
 */
export async function removePlacePhoto(input: RemovePlacePhotoInput): Promise<Result<{ removed: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = removePlacePhotoSchema.safeParse(input);
  if (!parsed.success) return fail("validation");

  const db = await createClient();
  let path: string | null;
  try {
    path = await deletePlacePhotoRowIn(db, parsed.data.id);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_remove_failed", { reason: error.detail });
    return fail("pantry_photo_remove_failed");
  }
  // Also when it was gone already: Lagersaldo may still show its line.
  revalidateFor("pantry_photo");
  if (path === null) return ok({ removed: false });

  try {
    await removePlacePhotoFiles(db, [path]);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_remove_failed", { reason: error.detail, left: "file" });
  }
  return ok({ removed: true });
}
