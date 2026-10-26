import { requireUserForRoute } from "@/features/auth/server";
import { maxPlacePhotoBodyBytes, placePhotoMediaTypes, readPlacePhotoForm } from "@/features/pantry";
import { savePlacePhoto } from "@/features/pantry/server";
import { fail, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../ai/route-support";

// Senaste foto (Story 10.1, FR-37, AD-2, AD-15, AD-26): once a write from a
// photo's lagerförslag has succeeded, the client posts the same resized photo
// that was analysed (at most maxPlacePhotoSide and 1.5 MB) here, in the
// background, as multipart/form-data with the fields `image`, `site` (the
// place the photo was taken for), `location`, `takenAt` (when it was taken),
// `reading` (a JSON list, readingSchema) and, when they have come, `points`
// (JSON, locateResultSchema). The server removes the photo's metadata,
// uploads it to the private bucket pantry-photo and makes it the latest photo
// of its place and location, replacing the one before unless that one was
// taken later. The answer is the photo's id, for points that come later
// (savePlacePhotoPoints). Pontus never sees this: the client shows nothing
// for any answer.
//
// The only Route Handler that writes (AD-2), since a Server Action takes at
// most 1 MB. It makes the same checks as one: the app's own origin (a
// multipart form can be posted cross-site without a preflight), the user, a
// Content-Length within maxPlacePhotoBodyBytes before anything is read, the
// photo's size and type on its own bytes (JPEG or PNG only: 415 otherwise),
// and Zod for every other field, each JSON field capped before it is parsed.
// The photo is never logged and never sent to the AI port. Anything thrown is
// logged with its name only: Storage and PostgREST messages can hold the
// photo's path. The default maxDuration is enough: an upload and a few
// database calls.

/** A Content-Length that is there and within the limit: the browser always sends one for a form. */
function sizeAllowed(request: Request): boolean {
  const header = request.headers.get("content-length");
  if (header === null || !/^\d+$/.test(header)) return false;
  return Number(header) <= maxPlacePhotoBodyBytes;
}

const isSavedType = (type: string): boolean => (placePhotoMediaTypes as readonly string[]).includes(type);

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  if (!sizeAllowed(request)) return respond(fail("image_too_large"), 413);
  // Size, type and pixels of the photo, checked on its own bytes (AD-15).
  const form = await readImageForm(request, ["site", "location", "takenAt", "reading", "points"], {
    maxSide: maxPlacePhotoSide,
    maxBodyBytes: maxPlacePhotoBodyBytes,
  });
  if (!form.ok) return form.response;
  // A WebP is analysed, but only a JPEG or PNG is kept, since only those are cleaned of metadata.
  if (!isSavedType(form.image.mediaType)) return respond(fail("validation"), 415);
  const fields = readPlacePhotoForm(form.fields);
  if (!fields.success) return respond(fail("validation"));

  const { site, location, takenAt, reading, points } = fields.data;
  let result: Result<{ id: string }>;
  try {
    result = await savePlacePhoto({
      image: form.image,
      siteId: site,
      location,
      takenAt,
      reading,
      points: points?.positions ?? null,
    });
  } catch (error) {
    console.error("pantry_photo_failed", { code: "pantry_photo_failed", reason: error instanceof Error ? error.name : "unknown" });
    result = fail("pantry_photo_failed");
  }
  return respond(result);
}
