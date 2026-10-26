"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { placePhotoReadingLengthIn, setPlacePhotoPointsIn } from "../data/photos";
import { placePhotoPointsSchema, storedPoints, type PlacePhotoPointsInput } from "../domain/place-photo";

/**
 * Senaste foto (Story 10.1, FR-37): the points of the numbers on the photo
 * (Story 6.6) that came after the photo was saved, added to its row
 * (`id`, the answer of POST /api/pantry/photo). Every point must be for an
 * item of the photo's reading (`validation` otherwise), here and in SQL.
 * Writes only when the row has no points yet, so the client's one call after a lost answer, or a second
 * tab, never changes them; `saved` says whether it wrote. No points write
 * nothing. Never shown to Pontus: the client shows nothing for any answer.
 *
 * Fails with `unauthorized`, `validation` or `pantry_photo_failed` (logged
 * with the reason only, never the points).
 */
export async function savePlacePhotoPoints(input: PlacePhotoPointsInput): Promise<Result<{ saved: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = placePhotoPointsSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const points = storedPoints(parsed.data.points);
  if (!points) return ok({ saved: false });

  try {
    const db = await createClient();
    // Every point is for an item of the photo's reading; set_pantry_photo_points checks it again in the same update.
    const readingLength = await placePhotoReadingLengthIn(db, parsed.data.id);
    if (readingLength === null) return ok({ saved: false });
    if (points.some((point) => point.n > readingLength)) return fail("validation");
    const saved = await setPlacePhotoPointsIn(db, parsed.data.id, points);
    if (saved) revalidateFor("pantry_photo");
    return ok({ saved });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_failed", { reason: error.detail });
    return fail("pantry_photo_failed");
  }
}
