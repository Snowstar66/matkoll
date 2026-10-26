import { fail, type ErrorCode, type Result } from "@/lib/errors";
import { env } from "@/server/env";

// Shared by the AI Route Handlers (AD-9): the checks that only the app itself
// may start a run, which can keep the local model busy for up to 115 s, and
// the HTTP status for each result.

const statusFor: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  validation: 400,
  import_no_recipe: 422,
  ai_invalid: 502,
  ai_rejected: 502,
  ai_unavailable: 503,
  catalog_unavailable: 503,
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
