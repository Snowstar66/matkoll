import { requireUserForRoute } from "@/features/auth/server";
import { locationSchema } from "@/features/catalog";
import { analyzePlace } from "@/features/pantry/server";
import { fail } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../route-support";

// Lagerförslag from a photo of a place at home (FR-24, AD-9, AD-15): the
// client resizes the photo (to at most maxPlacePhotoSide, 2048 px, Story 6.5)
// and posts it through src/lib/ai-client.ts as multipart/form-data with the
// fields `image` and `location` (Kyl, Frys or Skafferi), and gets the place
// and its suggestions back. Never writes to the database (AD-2). The photo is only held in memory for the request: it is
// passed to the AI port as a `file` part and is never written to the
// database, to disk or to a log. The request's signal goes all the way to the
// model, so "Avbryt" stops it.
//
// A multipart form can be posted cross-site without a preflight, so the
// origin checks carry more weight here than for JSON; the session cookies are
// SameSite=Lax as well, so a form on another site has no session.

// The AI port's budget is 115 s in total (AD-9). The whole request must fit:
// analyzePlace gets a deadline 3 s before maxDuration, for the answer to get
// out, and gives the model the time left, with a margin for the catalog and
// pantry reads after it.
export const maxDuration = 120;

/** Time kept after the deadline for sending the answer. */
const responseMarginS = 3;

export async function POST(request: Request): Promise<Response> {
  const deadline = Date.now() + (maxDuration - responseMarginS) * 1000;
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Size, type and pixels of the photo, checked on its own bytes (AD-15).
  const form = await readImageForm(request, ["location"], { maxSide: maxPlacePhotoSide });
  if (!form.ok) return form.response;
  const location = locationSchema.safeParse(form.fields.location);
  if (!location.success) return respond(fail("validation"));

  return respond(
    await analyzePlace({ image: form.image, location: location.data }, { signal: request.signal, deadline }),
  );
}
