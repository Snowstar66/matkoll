import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { hasPlacePhoto, PantryDataError, readPlacePhotoImage } from "@/features/pantry/server";

// Visa senaste fotot (Story 10.2, FR-38, AD-26, NFR-11): sends the image of
// the signed-in user's saved photo `id`, for the photo sheet in Lagersaldo (an
// <img> on the same site, so the session's cookies come along). The user is
// checked first; the row and the file are read with the session client, so
// RLS and the bucket's policies give only the user's own. There is never a
// public or signed URL, and the image is never sent to the AI port.
//
// Every answer, also 401 and a failure, is private and never stored by a
// cache (`private, no-store`) and has `nosniff`; the photo has the row's
// type. A photo that is gone, was taken more than 30 days ago, or is another
// user's, and an id that is not a uuid, all get the same 404 without a body,
// so the answer never tells them apart. HEAD answers the same statuses
// without downloading the file: the sheet asks it when the image cannot be
// shown. Only the reason of a failure is logged, never the id or the path.

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** An answer without a body, with the private headers. */
function empty(status: number): Response {
  return new Response(null, { status, headers: privateHeaders });
}

/** `response` with the private headers added (the 401 from requireUserForRoute). */
function withPrivateHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

/** A failure: 503 for one the pantry module knows, 500 for a bug, with the reason only. */
function failed(error: unknown): Response {
  if (error instanceof PantryDataError) {
    console.error("pantry_photo_unavailable", { reason: error.detail });
    return empty(503);
  }
  // Never the message, which may hold the id or the path.
  console.error("pantry_photo_unavailable", { reason: `unexpected ${error instanceof Error ? error.name : typeof error}` });
  return empty(500);
}

/** The checked user and id, or the answer to give instead. */
async function checked(context: RouteContext<"/api/pantry/photo/[id]">): Promise<{ id: string } | { response: Response }> {
  const auth = await requireUserForRoute();
  if (auth.response) return { response: withPrivateHeaders(auth.response) };
  const { id } = await context.params;
  return z.uuid().safeParse(id).success ? { id } : { response: empty(404) };
}

export async function GET(_request: Request, context: RouteContext<"/api/pantry/photo/[id]">): Promise<Response> {
  try {
    const check = await checked(context);
    if ("response" in check) return check.response;
    const image = await readPlacePhotoImage(check.id);
    if (!image) return empty(404);
    return new Response(image.data, {
      headers: {
        ...privateHeaders,
        "Content-Type": image.mediaType,
        "Content-Length": String(image.data.size),
      },
    });
  } catch (error) {
    return failed(error);
  }
}

export async function HEAD(_request: Request, context: RouteContext<"/api/pantry/photo/[id]">): Promise<Response> {
  try {
    const check = await checked(context);
    if ("response" in check) return new Response(null, { status: check.response.status, headers: check.response.headers });
    return empty((await hasPlacePhoto(check.id)) ? 200 : 404);
  } catch (error) {
    return failed(error);
  }
}
