import { after } from "next/server";
import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { enqueueAiJob, functionMs, runAiJob } from "@/features/ai-jobs/server";
import { locationSchema } from "@/features/catalog";
import { locatePlaceItems, lookUpSite, readPhoto } from "@/features/pantry/server";
import { readingSchema } from "@/features/pantry";
import { fail, ok, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { isCrossSite, mediaTypeOf, readImageForm, respond } from "../../route-support";

// The AI job of a photo of a place (Story 12.5, FR-24, FR-46-FR-49, AD-9,
// AD-15, AD-28). The client resizes the photo (to at most maxPlacePhotoSide,
// Story 6.5) and posts it as multipart/form-data with the fields `image`,
// `kind` (analyze), `clientKey`, `location` (Kyl, Frys or Skafferi), `site`
// (the id of the place Hemma showed, Story 8.4) and `takenAt`, and gets the job
// back at once (202). In the background of this request, when it is the job's
// turn in the queue, the job reads the photo and then looks up the numbers on
// it; the reading is written as a partial result as soon as it is there (the
// cards come first), the numbers with the end. A newer photo of the same place
// replaces the job (`superseded`, enqueue_ai_job), and the guard of the job
// stops it, so the numbers of a replaced photo are never looked up.
//
// The photo is only in this request's memory, in the closure of the job: never
// in ai_job (its context is the place, the location and the time), on disk, in
// a log or in a cache. Nothing of it, its reading or its names is logged.
//
// A multipart form can be posted cross-site without a preflight, so the origin
// checks carry more weight here than for JSON; the session cookies are
// SameSite=Lax as well, so a form on another site has no session. Never
// request.signal inside after(): it does not hold once the response is sent.

// The function lives as long as the longest job can wait and run (AD-28).
export const maxDuration = 300;

/** The numbers have at most this long (the AI port's locate attempt, AD-9). */
const locateMs = 30_000;
/** Less than this left of the function's time after the reading: the numbers are skipped. */
const minLocateLeftMs = 40_000;
/** Less than this left of the job's own time after the reading: the numbers are skipped. */
const minLocateRunMs = 8_000;

const formSchema = z.object({
  kind: z.literal("analyze"),
  clientKey: z.uuid(),
  location: locationSchema,
  /** The place the photo was taken for; missing only from a client of before Story 8.4: the selected place. */
  site: z.uuid().optional(),
  /** When the photo was taken, as the client says; kept as the job's context. */
  takenAt: z.iso.datetime(),
});

/** A value that is plain data, as the job keeps it. */
function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "multipart/form-data") return respond(fail("validation"), 415);
  // Size, type and pixels of the photo, checked on its own bytes (AD-15).
  const form = await readImageForm(request, ["kind", "clientKey", "location", "site", "takenAt"], {
    maxSide: maxPlacePhotoSide,
  });
  if (!form.ok) return form.response;
  const parsed = formSchema.safeParse({
    kind: form.fields.kind,
    clientKey: form.fields.clientKey,
    location: form.fields.location,
    site: form.fields.site ?? undefined,
    takenAt: form.fields.takenAt,
  });
  if (!parsed.success) return respond(fail("validation"));
  const { clientKey, location, site, takenAt } = parsed.data;

  // Story 8.4: the place before anything is queued, since a photo of a place that is gone could not be saved anyway.
  const looked = await lookUpSite(site);
  if (!looked.ok) return respond(looked.result);
  const photoSite = looked.site;

  // The session client is made here, where the request's cookies are, and handed to the background run.
  const db = await createClient();
  const enqueued = await enqueueAiJob(db, {
    kind: "analyze",
    clientKey,
    context: { siteId: photoSite?.id ?? null, location, takenAt },
    requestStartedAt,
  });
  if (!enqueued.ok) return respond(enqueued);
  const { job, created, startBy } = enqueued.data;

  // A job that was given back (a double tap, another tab) is run by the request that made it.
  if (created) {
    const image = form.image;
    after(() =>
      runAiJob(db, job, { startBy }, async (signal, deadline, report): Promise<Result<Json>> => {
        const read = await readPhoto({ image, location, site: photoSite }, { signal, deadline });
        if (!read.ok) return read;
        const reading = read.data;
        // The cards first: the reading is the job's result as soon as it is there.
        await report(asJson(reading));

        // Numbers only when some card has an item to point at (Story 6.6); the comparison, made later, only hides some.
        const parsedLabels = readingSchema.safeParse(reading.reading);
        const labels = parsedLabels.success ? parsedLabels.data : [];
        const numberable =
          labels.length > 0 &&
          reading.suggestions.some((suggestion) => (suggestion.itemNumbers ?? []).length > 0);
        const functionLeft = requestStartedAt + functionMs - Date.now();
        const runLeft = deadline - Date.now();
        let points: Json = "skipped";
        if (numberable && functionLeft >= minLocateLeftMs && runLeft >= minLocateRunMs && !signal.aborted) {
          const located = await locatePlaceItems(
            { image, labels },
            { signal, deadline: Math.min(Date.now() + locateMs, deadline) },
          );
          // A lookup that fails leaves the cards without numbers; the job has still read the photo.
          points = located.ok ? asJson(located.data) : "failed";
          if (!located.ok) console.info("locate_failed", { code: located.error.code });
        }
        return ok(asJson({ ...reading, points }));
      }),
    );
  }
  return respond(ok({ job }), 202);
}
