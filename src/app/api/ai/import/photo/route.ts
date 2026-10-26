import { requireUserForRoute } from "@/features/auth/server";
import { importRecipe } from "@/features/recipes/server";
import { fail } from "@/lib/errors";
import { imageSideTolerance, imageSizeOf, imageTypeOf, maxImageBytes, maxImageSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../../route-support";

// Import of a recipe from a photo of a cookbook page (AD-9, AD-15): the client
// resizes the photo and posts it through src/lib/ai-client.ts as
// multipart/form-data with the field `image`, and gets a RecipeDraft back.
// The photo is only held in memory for the request: it is passed to the AI
// port as a `file` part and is never written to the database, to disk or to a
// log. The request's signal goes to the model, so "Avbryt" stops it.
//
// A multipart form can be posted cross-site without a preflight, so the
// origin checks carry more weight here than for JSON; the session cookies are
// SameSite=Lax as well, so a form on another site has no session.

// The AI port's budget is 115 s in total (AD-9).
export const maxDuration = 120;

/** Largest request body: a photo of at most 1.5 MB with the form's headers fits well within it. */
const maxBodyBytes = 2 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // The photo is all that makes a request this large.
  const read = await readCapped(request, maxBodyBytes);
  if (!read.ok) return read.reason === "too_large" ? respond(fail("image_too_large")) : unreadBody(read.reason);

  let form: FormData;
  try {
    // The body is already read and capped; parse it with the request's boundary.
    form = await new Response(read.bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return respond(fail("validation"));
  }
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) return respond(fail("validation"));
  if (file.size > maxImageBytes) return respond(fail("image_too_large"));

  const data = new Uint8Array(await file.arrayBuffer());
  // The type and the size in pixels come from the bytes, whatever the client says.
  const mediaType = imageTypeOf(data);
  const size = imageSizeOf(data);
  if (!mediaType || !size) return respond(fail("image_unsupported"));
  // The client resizes to maxImageSide; a larger image did not come through it.
  if (Math.max(size.width, size.height) > maxImageSide + imageSideTolerance) return respond(fail("image_too_large"));

  return respond(await importRecipe({ kind: "photo", image: { data, mediaType } }, { signal: request.signal }));
}
