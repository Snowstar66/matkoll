import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { PantryDataError, readPlacePhotoImage } from "@/features/pantry/server";

// Visa senaste fotot (Story 10.2, FR-38, AD-26, NFR-11): sends the image of
// the signed-in user's saved photo `id`, for the photo sheet in Lagersaldo (an
// <img> on the same site, so the session's cookies come along). The user is
// checked first; the row and the file are read with the session client, so
// RLS and the bucket's policies give only the user's own. There is never a
// public or signed URL, and the image is never sent to the AI port.
//
// The answer is private and never stored by a cache (`private, no-store`),
// with the row's type and `nosniff`. A photo that is gone, was taken more
// than 30 days ago, or is another user's, and an id that is not a uuid, all
// get the same 404 without a body, so the answer never tells them apart.
// Only the reason of a failure is logged, never the id or the path.

const noStore = { "Cache-Control": "private, no-store" };

/** The same answer for every photo that is not there for this user. */
function gone(): Response {
  return new Response(null, { status: 404, headers: noStore });
}

export async function GET(_request: Request, context: RouteContext<"/api/pantry/photo/[id]">): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return gone();

  try {
    const image = await readPlacePhotoImage(id);
    if (!image) return gone();
    return new Response(image.data, {
      headers: {
        ...noStore,
        "Content-Type": image.mediaType,
        "Content-Length": String(image.data.size),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_unavailable", { reason: error.detail });
    return new Response(null, { status: 503, headers: noStore });
  }
}
