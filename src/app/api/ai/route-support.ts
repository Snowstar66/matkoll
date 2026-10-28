import { fail, type ErrorCode, type Result } from "@/lib/errors";
import { imageSideTolerance, imageSizeOf, imageTypeOf, maxImageBytes, maxImageSide, type ImageMediaType } from "@/lib/images";
import { env } from "@/server/env";

// Shared by the AI Route Handlers (AD-9): the checks that only the app itself
// may start a run, which can keep the local model busy for up to 115 s, and
// the HTTP status for each result. Also by POST /api/pantry/photo (Story
// 10.1, AD-26), which reads a photo of a place the same way.

const statusFor: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  validation: 400,
  import_no_recipe: 422,
  suggest_empty_pantry: 422,
  ai_invalid: 502,
  ai_rejected: 502,
  ai_unavailable: 503,
  // A newer analysis from the same person took over; nobody shows this answer.
  ai_superseded: 409,
  // Story 12.4: the queue is full; a job did not get to start in time; a job
  // was lost with its function; a result that no longer exists.
  ai_queue_full: 429,
  ai_queue_timeout: 504,
  ai_job_lost: 410,
  ai_job_gone: 404,
  catalog_unavailable: 503,
  pantry_unavailable: 503,
  // Story 8.4: the photo's place is removed, or not the user's; the AI was not asked.
  pantry_site_gone: 409,
  // Story 10.1: the latest photo of a place could not be saved; Story 10.2: it is gone.
  pantry_photo_failed: 500,
  pantry_photo_gone: 404,
  settings_unavailable: 503,
  fetch_invalid_url: 422,
  fetch_domain_not_allowed: 422,
  fetch_blocked: 502,
  fetch_too_large: 502,
  fetch_timeout: 504,
  // The client went away ("Avbryt"); nobody reads the answer.
  fetch_aborted: 499,
  image_too_large: 413,
  image_unsupported: 415,
};

/** The result as JSON, with the status for its error code unless `status` is given. */
export function respond<T>(result: Result<T>, status?: number): Response {
  return Response.json(result, { status: status ?? (result.ok ? 200 : (statusFor[result.error.code] ?? 500)) });
}

/** True when the browser says the request comes from another site. Requests without the headers (scripts, tests) pass. */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(env.SITE_URL).origin) return true;
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/** The request's media type, lower case and without parameters. */
export function mediaTypeOf(request: Request): string | undefined {
  return request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
}

/** The body, or why it could not be read: larger than the limit, cut off by the client, or broken. */
export type CappedBody =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; reason: "too_large" | "aborted" | "broken" };

/**
 * Reads the body, but never more than `limit` bytes: a Content-Length over it
 * is refused before reading, and a streamed body is cut off at the limit. A
 * client that goes away mid-upload ("Avbryt", a lost connection) is
 * `aborted`, not an error.
 */
export async function readCapped(request: Request, limit: number): Promise<CappedBody> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: request.signal.aborted ? "aborted" : "broken" };
  }
  return { ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) };
}

/**
 * The answer for a body that could not be read: 499 when the client went
 * away (nobody reads it; logged as info, not as an error), 400 for a broken
 * one. `too_large` is each route's own 413.
 */
export function unreadBody(reason: "aborted" | "broken"): Response {
  if (reason === "aborted") {
    console.info("request_aborted");
    return respond(fail("validation"), 499);
  }
  return respond(fail("validation"), 400);
}

/** Largest request with a photo: a photo of at most 1.5 MB with the form's headers and fields fits well within it. */
export const maxImageBodyBytes = 2 * 1024 * 1024;

/** A photo read from a form, with its type from its own bytes (AD-15). */
export type FormImage = { data: Uint8Array; mediaType: ImageMediaType };

export type ImageForm<Field extends string> =
  | { ok: true; image: FormImage; fields: Record<Field, string | null> }
  | { ok: false; response: Response };

/**
 * Reads a multipart/form-data body with a photo in the field `image` (AD-15):
 * at most maxImageBodyBytes, or `maxBodyBytes` when given (413 `image_too_large`), parsed as a form (400
 * `validation` when it is not one, or has no image), the image at most 1.5 MB
 * (413), a JPEG, PNG or WebP by its first bytes (415 `image_unsupported`) and
 * at most `maxSide` (maxImageSide, 1600, unless given; with
 * imageSideTolerance) on its longest side by its header (413). Gives the image and the text `fields` (`null` when missing or
 * not text), or the error response to send. The caller checks the origin, the
 * user and the media type first. The photo is only held in memory.
 */
export async function readImageForm<Field extends string>(
  request: Request,
  fields: readonly Field[] = [],
  { maxSide = maxImageSide, maxBodyBytes = maxImageBodyBytes }: { maxSide?: number; maxBodyBytes?: number } = {},
): Promise<ImageForm<Field>> {
  const failed = (response: Response) => ({ ok: false as const, response });
  // The photo is all that makes a request this large.
  const read = await readCapped(request, maxBodyBytes);
  if (!read.ok) return failed(read.reason === "too_large" ? respond(fail("image_too_large")) : unreadBody(read.reason));

  let form: FormData;
  try {
    // The body is already read and capped; parse it with the request's boundary.
    form = await new Response(read.bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return failed(respond(fail("validation")));
  }
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) return failed(respond(fail("validation")));
  if (file.size > maxImageBytes) return failed(respond(fail("image_too_large")));

  const data = new Uint8Array(await file.arrayBuffer());
  // The type and the size in pixels come from the bytes, whatever the client says.
  const mediaType = imageTypeOf(data);
  const size = imageSizeOf(data);
  if (!mediaType || !size) return failed(respond(fail("image_unsupported")));
  // The client resizes to maxSide; a larger image did not come through it.
  if (Math.max(size.width, size.height) > maxSide + imageSideTolerance) return failed(respond(fail("image_too_large")));

  const values = Object.fromEntries(
    fields.map((field) => {
      const value = form.get(field);
      return [field, typeof value === "string" ? value : null];
    }),
  ) as Record<Field, string | null>;
  return { ok: true, image: { data, mediaType }, fields: values };
}
