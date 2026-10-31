import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { hasCardImage, readCardImage } from "@/features/things/server";

// Visa kortet (Story 18.2, AD-26, NFR-11): sends the image of the signed-in
// user's card `id`, for the thumbnail on a place's page (an <img> on the same
// site, so the session's cookies come along). The user is checked first; the
// row and the file are read with the session client, so RLS and the bucket's
// policies give only the user's own. There is never a public or signed URL,
// and the image is never sent to the AI port by this route.
//
// Every answer, also 401 and a failure, is private and never stored by a cache
// (`private, no-store`) and has `nosniff`. A card that is gone or is another
// user's, and an id that is not a uuid, all get the same 404 without a body, so
// the answer never tells them apart. Only the reason of a failure is logged,
// never the id or the path.

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function empty(status: number): Response {
  return new Response(null, { status, headers: privateHeaders });
}

function withPrivateHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function failed(error: unknown): Response {
  console.error("things_photo_unavailable", { reason: error instanceof Error ? error.name : typeof error });
  return empty(500);
}

async function checked(context: RouteContext<"/api/things/photo/[id]">): Promise<{ id: string } | { response: Response }> {
  const auth = await requireUserForRoute();
  if (auth.response) return { response: withPrivateHeaders(auth.response) };
  const { id } = await context.params;
  return z.uuid().safeParse(id).success ? { id } : { response: empty(404) };
}

export async function GET(_request: Request, context: RouteContext<"/api/things/photo/[id]">): Promise<Response> {
  try {
    const check = await checked(context);
    if ("response" in check) return check.response;
    const image = await readCardImage(check.id);
    if (!image) return empty(404);
    return new Response(image.data, {
      headers: { ...privateHeaders, "Content-Type": image.mediaType, "Content-Length": String(image.data.size) },
    });
  } catch (error) {
    return failed(error);
  }
}

export async function HEAD(_request: Request, context: RouteContext<"/api/things/photo/[id]">): Promise<Response> {
  try {
    const check = await checked(context);
    if ("response" in check) return new Response(null, { status: check.response.status, headers: check.response.headers });
    return empty((await hasCardImage(check.id)) ? 200 : 404);
  } catch (error) {
    return failed(error);
  }
}
