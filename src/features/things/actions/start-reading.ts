import "server-only";
import { after } from "next/server";
import { requireUser } from "@/features/auth/server";
import { enqueueAiJob, runAiJob, type AiJobWork } from "@/features/ai-jobs/server";
import { getAiChoice } from "@/features/settings/server";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, ok, type Result } from "@/lib/errors";
import { imageSizeOf, stripJpegMetadata, stripPngMetadata, type ImageMediaType } from "@/lib/images";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getAiServiceFor } from "@/server/ai";
import { ThingsDataError, type ThingsDb } from "../data/client";
import {
  downloadCardFile,
  insertCardIn,
  loadCardIn,
  markCardFailedIn,
  removeCardFiles,
  reopenCardIn,
  saveReadingIn,
  uploadCardFile,
} from "../data/photos";
import { sweepCardFilesIn } from "./sweep-card-files";
import { shownStatus, thingPhotoPath, type ThingPhotoMediaType } from "../domain/thing-photo";

// Fota en plats (Story 18.2, FR-24, FR-46-FR-49, AD-2, AD-9, AD-15, AD-26,
// AD-28): the server side of a card. The Route Handlers POST /api/things/photo
// and POST /api/things/retry call it, since a Server Action takes at most 1 MB.
// The photo goes to the private bucket thing-photo without metadata, its row
// is `reading`, and an AI job (kind `things`) reads the things in the
// background of the request, with the AI choice of Inställningar (Story 17.5).
// The job saves the things itself (save_thing_reading) and the card becomes
// `done`; a job that does not go leaves the card `failed`, kept for "Försök
// igen", which reads the stored file again. The photo is only in this
// request's memory and in the bucket: never in ai_job, never logged. Only
// codes, reasons and counts are logged, never a name or a path.

/** Time kept after the model for saving the things, so the whole job fits its deadline. */
const postModelMarginMs = 5_000;

export type StartReadingInput = {
  /** The photo as the client sent it, checked by readImageForm (size, pixels and type from its own bytes). */
  image: { data: Uint8Array; mediaType: ImageMediaType };
  placeId: string;
  /** When the photo was taken, as the client says (clampTakenAt keeps it within the last day). */
  takenAt: Date;
  clientKey: string;
  requestStartedAt: number;
};

/** The photo without metadata (AD-15): a JPEG without APP1–APP15 and comments, a PNG with only the chunks that make the image; `null` for a WebP or bytes that cannot be walked. */
function withoutMetadata(image: StartReadingInput["image"]): { data: Uint8Array; mediaType: ThingPhotoMediaType } | null {
  if (image.mediaType === "image/jpeg") {
    const data = stripJpegMetadata(image.data);
    return data && { data, mediaType: "image/jpeg" };
  }
  if (image.mediaType === "image/png") {
    const data = stripPngMetadata(image.data);
    return data && { data, mediaType: "image/png" };
  }
  return null;
}

/** The job's work: the model reads the photo, the things are saved, the older cards of the place go. */
function readingWork(db: ThingsDb, userId: string, card: { id: string; placeId: string }, image: { data: Uint8Array; mediaType: string }): AiJobWork {
  return async (signal, deadline): Promise<Result<Json>> => {
    const failCard = async (code: string) => {
      try {
        await markCardFailedIn(db, card.id, code);
      } catch (error) {
        console.error("things_card_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
      }
    };

    const listed = await getAiServiceFor(await getAiChoice()).listThings({ image }, signal, { deadline: deadline - postModelMarginMs });
    if (!listed.ok) {
      await failCard(listed.error.code);
      return listed;
    }
    if (signal.aborted) {
      console.info("things_aborted");
      await failCard("ai_unavailable");
      return fail("ai_unavailable");
    }

    const { things, hiddenContainers, hiddenNote } = listed.data;
    let removed: string[];
    try {
      removed = await saveReadingIn(db, { photoId: card.id, things, note: hiddenNote, hidden: hiddenContainers });
    } catch (error) {
      const detail = error instanceof ThingsDataError ? error.detail : "unknown";
      console.error("things_save_failed", { reason: detail });
      // A card that is gone needs no mark; any other failure leaves it for "Försök igen".
      if (detail === "card_gone") return fail("things_card_gone");
      await failCard("things_unavailable");
      return fail("things_unavailable");
    }
    // The older cards of the place are replaced: their files go too. A file that stays is only logged.
    const { failed } = await removeCardFiles(db, removed);
    if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
    // Like the pantry's sweep after a save (Story 10.3): files without a row go too. Never changes the answer.
    await sweepCardFilesIn(db, userId);
    console.info("things_read", { count: things.length });
    return ok({ photoId: card.id, placeId: card.placeId, count: things.length } satisfies Json);
  };
}

/** Queues the card's job and runs it in the background of this request. */
async function queueReading(
  db: ThingsDb,
  userId: string,
  card: { id: string; placeId: string; takenAt: Date },
  image: { data: Uint8Array; mediaType: string },
  clientKey: string,
  requestStartedAt: number,
) {
  const enqueued = await enqueueAiJob(db, {
    kind: "things",
    clientKey,
    context: { placeId: card.placeId, photoId: card.id, takenAt: card.takenAt.toISOString() },
    requestStartedAt,
  });
  if (!enqueued.ok) return enqueued;
  const { job, created, startBy } = enqueued.data;
  // A job that was given back (a double tap, another tab) is run by the request that made it.
  if (created) after(() => runAiJob(db, job, { startBy }, readingWork(db, userId, card, image)));
  return ok({ job });
}

/**
 * Saves the photo as a new card of the place and starts its job, in order:
 * the user; the metadata removed (`things_photo_failed` for a file that
 * cannot be cleaned, before anything is uploaded); the file uploaded to a
 * path of its own; the row inserted as `reading` (a place that is gone or not
 * the user's is `things_place_gone`); the job queued (`ai_queue_full` when
 * three jobs are active). A card whose job could not be queued is removed
 * again, row and file, so the page never shows a card nobody reads.
 */
export async function startCardReading(input: StartReadingInput): Promise<Result<{ job: AiJob }>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const image = withoutMetadata(input.image);
  const size = image && imageSizeOf(image.data);
  if (!image || !size) {
    console.error("things_photo_failed", { reason: image ? "unreadable_size" : "unclean" });
    return fail("things_photo_failed");
  }

  const id = crypto.randomUUID();
  const path = thingPhotoPath(user.data.id, input.placeId, id, image.mediaType);
  const db = await createClient();
  const takenAt = input.takenAt;

  try {
    await uploadCardFile(db, path, image.data, image.mediaType);
  } catch (error) {
    console.error("things_photo_failed", { reason: error instanceof ThingsDataError ? error.detail : "upload_threw" });
    return fail("things_photo_failed");
  }

  let inserted: "saved" | "place_gone";
  try {
    inserted = await insertCardIn(db, {
      id,
      placeId: input.placeId,
      objectPath: path,
      mediaType: image.mediaType,
      width: size.width,
      height: size.height,
      takenAt,
    });
  } catch (error) {
    console.error("things_photo_failed", { reason: error instanceof ThingsDataError ? error.detail : "save_threw" });
    await removeCardFiles(db, [path]);
    return fail("things_photo_failed");
  }
  if (inserted === "place_gone") {
    await removeCardFiles(db, [path]);
    return fail("things_place_gone");
  }

  const queued = await queueReading(db, user.data.id, { id, placeId: input.placeId, takenAt }, image, input.clientKey, input.requestStartedAt);
  if (!queued.ok) {
    // Nobody will read this card: it goes again, the file first so the row is never left pointing at nothing.
    await removeCardFiles(db, [path]);
    const { error } = await db.from("thing_photo").delete().eq("id", id);
    if (error) console.error("things_photo_failed", { reason: `cleanup_failed ${error.code}` });
    return queued;
  }
  revalidateFor("thing_photo");
  return ok({ job: queued.data.job });
}

/**
 * "Försök igen" on a card whose reading did not go (or was lost): the stored
 * file is read again by a new job. `things_card_gone` for a card that is not
 * the user's, is gone or is not failed (shownStatus), so a double tap never
 * starts a second reading.
 */
export async function retryCardReading(input: { cardId: string; clientKey: string; requestStartedAt: number }): Promise<Result<{ job: AiJob }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const db = await createClient();

  let bytes: Uint8Array;
  let card: Awaited<ReturnType<typeof loadCardIn>>;
  try {
    card = await loadCardIn(db, input.cardId);
    if (!card || shownStatus(card, new Date()) !== "failed") return fail("things_card_gone");
    const file = await downloadCardFile(db, card.objectPath);
    if (!file) return fail("things_card_gone");
    bytes = new Uint8Array(await file.arrayBuffer());
    // Status `failed` or a stale `reading`: both are reopened.
    if (card.status === "reading") {
      const { error } = await db.from("thing_photo").update({ created_at: new Date().toISOString() }).eq("id", card.id).eq("status", "reading");
      if (error) throw new ThingsDataError(`update_failed ${error.code}`);
    } else if (!(await reopenCardIn(db, card.id))) {
      return fail("things_card_gone");
    }
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_unavailable", { reason: error.detail });
    return fail("things_unavailable");
  }

  const queued = await queueReading(
    db,
    user.data.id,
    { id: card.id, placeId: card.placeId, takenAt: card.takenAt },
    { data: bytes, mediaType: card.mediaType },
    input.clientKey,
    input.requestStartedAt,
  );
  if (!queued.ok) {
    // The card goes back to failed: it is still there to try again.
    try {
      await markCardFailedIn(db, card.id, queued.error.code);
    } catch {
      console.error("things_card_failed", { reason: "mark_threw" });
    }
    return queued;
  }
  revalidateFor("thing_photo");
  return ok({ job: queued.data.job });
}

