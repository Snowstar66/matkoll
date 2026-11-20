"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { PantryDataError } from "../data/client";
import { linkPantryItemsToPhotoIn, placePhotoReadingLengthIn } from "../data/photos";
import { maxPhotoNumbers } from "../domain/pantry-item-form";
import { revalidatePantryCommitted } from "./revalidate-committed";

const linkSchema = z.object({
  photoId: z.uuid(),
  items: z
    .array(z.object({ id: z.uuid(), number: z.number().int().min(1).max(100) }))
    .min(1)
    .max(maxPhotoNumbers * 4),
});
export type LinkPantryPhotoInput = z.input<typeof linkSchema>;

/**
 * Matvaror: remembers on pantry items which saved photo and which number on
 * it they came from, so their row shows a camera icon and their sheet the
 * photo around the item. The client calls it once the photo is saved
 * (POST /api/pantry/photo gives its id), since the items were confirmed
 * before the photo had one. Every number must be one of the photo's reading
 * (`validation` otherwise). A photo that is gone, or items that are not the
 * household's, link nothing: `linked` says how many were. Nothing is shown
 * for any answer. Revalidates Matvaror when something was linked.
 *
 * Fails with `unauthorized`, `validation` or `pantry_photo_failed` (logged
 * with the reason only).
 */
export async function linkPantryItemsToPhoto(input: LinkPantryPhotoInput): Promise<Result<{ linked: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    const db = await createClient();
    const readingLength = await placePhotoReadingLengthIn(db, parsed.data.photoId);
    if (readingLength === null) return ok({ linked: 0 });
    if (parsed.data.items.some((item) => item.number > readingLength)) return fail("validation");
    const linked = await linkPantryItemsToPhotoIn(db, parsed.data.photoId, parsed.data.items);
    if (linked > 0) revalidatePantryCommitted();
    return ok({ linked });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_failed", { reason: error.detail });
    return fail("pantry_photo_failed");
  }
}
