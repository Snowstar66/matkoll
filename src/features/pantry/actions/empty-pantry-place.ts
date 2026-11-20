"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { locationSchema, type Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, siteGoneCode } from "../data/client";
import { deleteLocationPhotoRowsIn, removePlacePhotoFiles } from "../data/photos";
import { emptyPantryPlaceIn, type EmptiedPlace } from "../data/remove";
import { revalidatePantryCommitted, revalidateSiteGone } from "./revalidate-committed";

const operationSchema = z.uuid();
const siteSchema = z.uuid();

/**
 * "Töm kylen" (Story 6.3, AD-19): deletes every item in the location for
 * good (AD-20), in one call and one transaction, after Pontus has confirmed
 * in the sheet. The server keeps the removed rows under `operationId`, the
 * client's id for this emptying, so "Ångra" (restorePantryRemoval) puts back
 * every one of them, `removed` in all. Items another tab added meanwhile go
 * too. The same operation id again (a retry after a lost answer) removes
 * nothing more and gives the same answer. No rows (another tab emptied the
 * location) is `ok`. Revalidates Hemma, the recipes, the plan and the list
 * (AD-18), also for no rows, so a list that still shows them catches up;
 * once the delete has committed, the answer is `ok`.
 *
 * The photos of that place and location go too, rows and then files; "Ångra"
 * puts back the items only. A failure there is logged with its reason only
 * and never changes the answer: the items are gone already.
 *
 * Story 8.4 (FR-33, AD-24): only the location of the place Hemma showed when
 * the sheet opened (`siteId`, sent as `site`) is emptied, never the place
 * selected when the call arrives. The place is required: there is no
 * fallback to the selected place.
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (the place is
 * removed or not the user's; the page is read again) or
 * `pantry_empty_failed`; nothing is removed then.
 */
export async function emptyPantryPlace(
  location: Location,
  operationId: string,
  siteId: string,
): Promise<Result<EmptiedPlace>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const place = locationSchema.safeParse(location);
  const operation = operationSchema.safeParse(operationId);
  const site = siteSchema.safeParse(siteId);
  if (!place.success || !operation.success || !site.success) return fail("validation");

  let emptied: EmptiedPlace;
  try {
    emptied = await emptyPantryPlaceIn(await createClient(), place.data, operation.data, site.data);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (isSiteGone(error)) {
      console.info("pantry_site_gone", { reason: siteGoneCode });
      revalidateSiteGone();
      return fail("pantry_site_gone");
    }
    console.error("pantry_empty_failed", { reason: error.detail });
    return fail("pantry_empty_failed");
  }
  await removeLocationPhotos(site.data, place.data);
  revalidatePantryCommitted();
  return ok(emptied);
}

async function removeLocationPhotos(siteId: string, location: Location): Promise<void> {
  try {
    const db = await createClient();
    const paths = await deleteLocationPhotoRowsIn(db, siteId, location);
    if (paths.length === 0) return;
    revalidateFor("pantry_photo");
    const { failed } = await removePlacePhotoFiles(db, paths);
    if (failed !== null) console.error("pantry_photo_remove_failed", { reason: failed, left: "file" });
  } catch (error) {
    console.error("pantry_photo_remove_failed", { reason: error instanceof PantryDataError ? error.detail : "threw" });
  }
}
