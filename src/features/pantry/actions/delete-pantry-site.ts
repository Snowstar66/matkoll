"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError, type PantryDb } from "../data/client";
import { listPlacePhotoFilesIn, loadSitePhotoPathsIn, removePlacePhotoFiles } from "../data/photos";
import { deleteSiteIn } from "../data/sites";

const deleteSchema = z.object({ id: z.uuid() });

/**
 * "Ta bort" on a place's row in the sheet Boenden (FR-29, AD-24): deletes an
 * empty place that is not selected and not the last, without asking and
 * without "Ångra" (nothing is lost). A place that is gone already gives
 * `ok({ removed: false })`: the result is what was asked for, and a retry
 * after a lost answer is harmless. Revalidates everything counted against
 * the pantry (AD-18), also when the place is in use, so the sheet is read
 * again.
 *
 * The place's photos (Story 10.3, AD-20, AD-26): the cascade takes their
 * rows, not their files, so the files' paths are read first, and once the
 * place is deleted everything in its folder (`<user_id>/<site_id>`) is
 * listed too, whether or not that read worked, and all of it is removed with
 * the Storage API. So a file without a row there (a replaced photo whose file
 * could not be removed) goes too. A place in use keeps its photos. When the
 * files cannot be read or removed, that is logged as
 * `pantry_photo_remove_failed` with the reason only, the place is deleted all
 * the same, and the sweep takes the files later (they have no row).
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
    const db = await createClient();
    const photoPaths = await sitePhotoPaths(db, parsed.data.id);
    const outcome = await deleteSiteIn(db, parsed.data.id);
    revalidateFor("pantry_site");
    if (outcome.kind === "in_use") return fail("pantry_site_in_use");
    await removeSitePhotos(db, photoPaths, `${user.data.id}/${parsed.data.id}`);
    return ok({ removed: outcome.removed });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_site_failed", { reason: error.detail });
    return fail("pantry_site_failed");
  }
}

/** The paths of the place's photo files, or none when they cannot be read (logged; the sweep takes them). */
async function sitePhotoPaths(db: PantryDb, siteId: string): Promise<string[]> {
  try {
    return await loadSitePhotoPathsIn(db, siteId);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_remove_failed", { reason: error.detail });
    return [];
  }
}

/**
 * Removes the deleted place's photo files: `paths`, read before, and every
 * file listed under its folder now. A failure is logged and left to the sweep.
 */
async function removeSitePhotos(db: PantryDb, paths: readonly string[], folder: string): Promise<void> {
  let listed: string[] = [];
  try {
    listed = await listPlacePhotoFilesIn(db, folder);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_remove_failed", { reason: error.detail });
  }
  const files = [...new Set([...paths, ...listed])];
  if (files.length === 0) return;
  const { failed } = await removePlacePhotoFiles(db, files);
  if (failed !== null) console.error("pantry_photo_remove_failed", { reason: failed });
}
