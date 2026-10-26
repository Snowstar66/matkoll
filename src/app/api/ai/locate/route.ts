import { requireUserForRoute } from "@/features/auth/server";
import { locateLabelsSchema } from "@/features/pantry";
import { locatePlaceItems } from "@/features/pantry/server";
import { fail } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../route-support";

// Nummer på fotot (Story 6.6, AD-9, AD-15): after the cards from a photo of a
// place have come from /api/ai/analyze, the client posts the same resized
// photo (at most maxPlacePhotoSide) and the answer's `reading` here, through
// src/lib/ai-client.ts, as multipart/form-data with the fields `image` and
// `labels` (a JSON list of one-line labels, locateLabelsSchema), and gets a
// point per item back. Never writes to the database (AD-2). The photo is
// only held in memory for the request: it is passed to the AI port as a
// `file` part and is never written to the database, to disk or to a log, and
// neither are the labels. The request's signal goes all the way to the
// model, so a new photo in the client stops it.
//
// The same checks as /api/ai/analyze: the app's own origin (a multipart
// form can be posted cross-site without a preflight), the user, and the
// photo's size and type on its own bytes.

// locateItems has one attempt of at most 30 s after a health check of at
// most 5 s (AD-9, Story 6.6). The whole request fits well within 60 s; the
// port gets a deadline 3 s before it, for the answer to get out.
export const maxDuration = 60;

/** Time kept after the deadline for sending the answer. */
const responseMarginS = 3;

/** The labels field: a JSON list within locateLabelsSchema, or `null`. */
function parseLabels(value: string | null): string[] | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const labels = locateLabelsSchema.safeParse(parsed);
  return labels.success ? labels.data : null;
}

export async function POST(request: Request): Promise<Response> {
  const deadline = Date.now() + (maxDuration - responseMarginS) * 1000;
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Size, type and pixels of the photo, checked on its own bytes (AD-15).
  const form = await readImageForm(request, ["labels"], { maxSide: maxPlacePhotoSide });
  if (!form.ok) return form.response;
  const labels = parseLabels(form.fields.labels);
  if (!labels) return respond(fail("validation"));

  return respond(await locatePlaceItems({ image: form.image, labels }, { signal: request.signal, deadline }));
}
