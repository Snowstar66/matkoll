import "server-only";
import { requireUser } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { imageSizeOf, stripJpegMetadata, stripPngMetadata, type ImageMediaType } from "@/lib/images";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, type PantryDb } from "../data/client";
import {
  photoRowExistsIn,
  removePlacePhotoFiles,
  savePantryPhotoIn,
  uploadPlacePhoto,
  uploadUnauthorizedDetail,
  type SavePhotoOutcome,
} from "../data/photos";
import type { PhotoPoint } from "../domain/photo-numbers";
import { clampTakenAt, placePhotoPath, type PlacePhotoMediaType } from "../domain/place-photo";
import { sweepPlacePhotosIn } from "./photo-sweep";

// Senaste foto (Story 10.1, FR-37, AD-2, AD-15, AD-26): the server side of
// saving the latest photo of a place. Not a Server Action: the Route Handler
// POST /api/pantry/photo calls it, since a Server Action takes at most 1 MB
// and the photo may be 1.5 MB. The client sends the photo once a write from
// its suggestions has succeeded; saving it is never shown to Pontus and never
// touches the pantry. The photo goes to Storage only, without metadata, and
// never to the AI port: nothing here imports src/server/ai. Only codes and
// reasons are logged, never the photo, the path, a place's name or the
// reading.

export type SavePlacePhotoInput = {
  /** The photo as analysed, checked by readImageForm (size, pixels and type from its own bytes). */
  image: { data: Uint8Array; mediaType: ImageMediaType };
  /** The place the photo was taken for (`result.site.id`), never the one selected now (FR-33). */
  siteId: string;
  location: Location;
  /** When the analysis started, as the client says; clampTakenAt keeps it within the last day. */
  takenAt: Date;
  /** The AI's items in reading order (readingSchema). */
  reading: readonly string[];
  /** The points from Story 6.6, when they have come. */
  points: readonly PhotoPoint[] | null;
};

/**
 * The photo without metadata (AD-15): a JPEG without APP1–APP15 and comments
 * (EXIF with GPS, XMP, ICC), a PNG with only the chunks that make the image.
 * `null` for a WebP, or for bytes whose segments or chunks cannot be walked.
 */
function withoutMetadata(image: SavePlacePhotoInput["image"]): { data: Uint8Array; mediaType: PlacePhotoMediaType } | null {
  switch (image.mediaType) {
    case "image/jpeg": {
      const data = stripJpegMetadata(image.data);
      return data && { data, mediaType: "image/jpeg" };
    }
    case "image/png": {
      const data = stripPngMetadata(image.data);
      return data && { data, mediaType: "image/png" };
    }
    default:
      return null;
  }
}

/** Removes a file this save uploaded and did not keep; a failure only leaves it for the sweep (Story 10.3). */
async function removeNewFile(db: PantryDb, path: string): Promise<void> {
  await removeFile(db, path);
}

/** Removes one file; a failure is only logged, with its reason, and the file is left for the sweep (Story 10.3). */
async function removeFile(db: PantryDb, path: string): Promise<void> {
  const { failed } = await removePlacePhotoFiles(db, [path]);
  if (failed !== null) console.error("pantry_photo_remove_failed", { reason: failed });
}

/**
 * The sweep after a save (Story 10.3): old photos and files without a row go.
 * Never the photo just saved: its time is clamped to the last day
 * (clampTakenAt), with the same `now` as the sweep's 30 days.
 * The photo is saved already, so nothing here may change the answer: a
 * failure is only logged, with its reason.
 */
async function sweepAfterSave(db: PantryDb, now: Date): Promise<void> {
  try {
    const outcome = await sweepPlacePhotosIn(db, { now });
    if (outcome.failed !== null) console.error("pantry_photo_remove_failed", { reason: outcome.failed });
  } catch {
    console.error("pantry_photo_remove_failed", { reason: "sweep_threw" });
  }
}

/**
 * Whether the row of photo `id` is there after save_pantry_photo answered
 * with an error: the error may have come after the commit (a lost answer).
 * `null` when that cannot be read either.
 */
async function rowAfterError(db: PantryDb, id: string): Promise<boolean | null> {
  try {
    return await photoRowExistsIn(db, id);
  } catch {
    return null;
  }
}

/**
 * Saves the photo as the latest of its place and location, in order: the
 * user; the metadata removed (`pantry_photo_failed` for a file that cannot be
 * cleaned, before anything is uploaded); the file uploaded to a new path
 * (`unauthorized` when Storage refuses it as not the user's); the row swapped
 * by save_pantry_photo, which checks the place; and the file it replaced
 * removed.
 *
 * Every way out that has not kept the new file's row removes the new file
 * (`committed`, in `finally`), also for an error that is not a
 * PantryDataError: a place that is gone or not the user's
 * (`pantry_site_gone`), a newer photo of the place already there (`stale`:
 * nothing changes, and the answer is ok, since nothing is wrong), or a
 * failure (`pantry_photo_failed`). When save_pantry_photo answers with any
 * other error, the row is looked up first: if it is there, the save went
 * through, and the file stays (logged as `pantry_photo_unconfirmed`, the
 * file before is left for the sweep). When the file before cannot be removed,
 * that is only logged, and the sweep (Story 10.3) takes it later.
 * After a save the user's photos are swept (sweepPlacePhotosIn, Story 10.3:
 * photos older than 30 days and files without a row); a failure there is
 * only logged and never changes the answer. Revalidates Hemma (AD-18) after
 * a save. Returns the photo's id, for points
 * that come later (savePlacePhotoPoints; for a stale photo they write
 * nothing).
 */
export async function savePlacePhoto(
  input: SavePlacePhotoInput,
  { now = new Date() }: { now?: Date } = {},
): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const image = withoutMetadata(input.image);
  const size = image && imageSizeOf(image.data);
  if (!image || !size) {
    console.error("pantry_photo_failed", { reason: image ? "unreadable_size" : "unclean" });
    return fail("pantry_photo_failed");
  }

  const id = crypto.randomUUID();
  const path = placePhotoPath(user.data.id, input.siteId, input.location, id, image.mediaType);
  const db = await createClient();

  try {
    await uploadPlacePhoto(db, path, image.data, image.mediaType);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (error.detail === uploadUnauthorizedDetail) {
      console.info("pantry_photo_failed", { reason: error.detail });
      return fail("unauthorized");
    }
    console.error("pantry_photo_failed", { reason: error.detail });
    return fail("pantry_photo_failed");
  }

  /** The new file's row is saved (or may be): the file stays. */
  let committed = false;
  try {
    let outcome: SavePhotoOutcome;
    try {
      outcome = await savePantryPhotoIn(db, {
        id,
        siteId: input.siteId,
        location: input.location,
        objectPath: path,
        mediaType: image.mediaType,
        width: size.width,
        height: size.height,
        takenAt: clampTakenAt(input.takenAt, now),
        reading: input.reading,
        points: input.points && input.points.length > 0 ? input.points : null,
      });
    } catch (error) {
      if (isSiteGone(error)) {
        console.info("pantry_site_gone", { reason: "photo" });
        return fail("pantry_site_gone");
      }
      const reason = error instanceof PantryDataError ? error.detail : "unknown";
      if ((await rowAfterError(db, id)) !== false) {
        // The row is there, or cannot be read: the file stays, so a row never points at a missing file.
        committed = true;
        console.error("pantry_photo_unconfirmed", { reason });
        revalidateFor("pantry_photo");
        return ok({ id });
      }
      console.error("pantry_photo_failed", { reason });
      return fail("pantry_photo_failed");
    }

    if (outcome.kind === "stale") {
      // A photo taken later is the place's latest already: this one is not kept.
      console.info("pantry_photo_stale");
      return ok({ id });
    }
    committed = true;

    if (outcome.previous !== null) await removeFile(db, outcome.previous);
    await sweepAfterSave(db, now);
    revalidateFor("pantry_photo");
    return ok({ id });
  } finally {
    if (!committed) await removeNewFile(db, path);
  }
}
