import { requireUserForRoute } from "@/features/auth/server";
import { clampTakenAt, thingPhotoFormSchema } from "@/features/things";
import { startCardReading } from "@/features/things/server";
import { fail, ok, type Result } from "@/lib/errors";
import type { AiJob } from "@/lib/ai-job-shape";
import { maxPlacePhotoSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../ai/route-support";

// Fota en plats (Story 18.2, FR-24, FR-46-FR-49, AD-2, AD-15, AD-26, AD-28):
// the client resizes the photo (to at most maxPlacePhotoSide, as for Lagersaldo)
// and posts it as multipart/form-data with the fields `image`, `clientKey`,
// `place` (the id of the place the photo is for) and `takenAt`. The server
// removes the photo's metadata, uploads it to the private bucket thing-photo,
// saves the card as `reading` and queues an AI job that lists the things in the
// background of this request; the answer is that job (202), which the app shows
// in its job row. The place's page shows the card and, when the job is done, the
// things. Same checks as the other photo routes: the app's own origin (a
// multipart form can be posted cross-site without a preflight), the user, a
// body within the limit before anything is read, the photo's size and type on
// its own bytes (JPEG or PNG only: 415 otherwise) and Zod for every other
// field. The photo is never logged. A new card is added to
// its place; with `replaces` (Ta om) it takes the place of that one card when
// its job is done (Story 18.11).

// The function lives as long as the longest job can wait and run (AD-28).
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  const form = await readImageForm(request, ["clientKey", "place", "takenAt", "replaces"], { maxSide: maxPlacePhotoSide });
  if (!form.ok) return form.response;
  // A WebP can be read by the AI, but only a JPEG or PNG is kept, since only those are cleaned of metadata.
  if (form.image.mediaType === "image/webp") return respond(fail("validation"), 415);
  const fields = thingPhotoFormSchema.safeParse(form.fields);
  if (!fields.success) return respond(fail("validation"));

  let result: Result<{ job: AiJob }>;
  try {
    result = await startCardReading({
      image: form.image,
      placeId: fields.data.place,
      replacesId: fields.data.replaces,
      takenAt: clampTakenAt(fields.data.takenAt, new Date()),
      clientKey: fields.data.clientKey,
      requestStartedAt,
    });
  } catch (error) {
    console.error("things_photo_failed", { code: "things_photo_failed", reason: error instanceof Error ? error.name : "unknown" });
    result = fail("things_photo_failed");
  }
  return result.ok ? respond(ok({ job: result.data.job }), 202) : respond(result);
}
