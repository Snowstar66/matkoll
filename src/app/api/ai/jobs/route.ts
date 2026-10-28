import { after } from "next/server";
import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { enqueueAiJob, listAiJobs, runAiJob } from "@/features/ai-jobs/server";
import { suggestRequestSchema } from "@/features/suggestions";
import { checkSuggestPantry, suggestFromPantry } from "@/features/suggestions/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { isCrossSite, mediaTypeOf, readCapped, respond, unreadBody } from "../route-support";

// AI jobs (Story 12.4, FR-46-FR-49, AD-28). The client starts a job with POST
// and gets it back at once (202): the AI works in the background of this
// request, in after(), when it is the job's turn in the queue. GET gives the
// jobs the app shows, without their results (GET /api/ai/jobs/[id] gives one
// result). AI-förslag are the first kind.
//
// POST only writes ai_job, through Postgres functions, and only with the same
// checks as a Server Action: the app's own origin, a session, JSON, a small
// body and Zod (AD-2). What the job needs to run, here the titles to avoid,
// stays in this request's memory (AD-15, AD-28): ai_job holds the place's id
// and nothing else. The job is run by this request alone: no other request
// can take it over, so a request that dies leaves a job that is lost when its
// time passes. Never request.signal inside after(): it does not hold once the
// response has been sent.

// The function lives as long as the longest job can wait and run (AD-28).
export const maxDuration = 300;

/** Largest request body: three titles of 200 characters, as UTF-8 and JSON, fit well within it. */
const maxBodyBytes = 4 * 1024;

const startSchema = z.discriminatedUnion("kind", [
  suggestRequestSchema.extend({ kind: z.literal("suggest"), clientKey: z.uuid() }),
]);

export async function POST(request: Request): Promise<Response> {
  const requestStartedAt = Date.now();
  if (isCrossSite(request)) return respond(fail("unauthorized"), 403);

  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;

  if (mediaTypeOf(request) !== "application/json") return respond(fail("validation"), 415);
  const read = await readCapped(request, maxBodyBytes);
  if (!read.ok) return read.reason === "too_large" ? respond(fail("validation"), 413) : unreadBody(read.reason);

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(read.bytes));
  } catch {
    return respond(fail("validation"));
  }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return respond(fail("validation"));
  const { clientKey, avoidTitles } = parsed.data;

  // What needs no AI is checked first, so nothing is queued for it: an empty pantry is its own answer.
  const checked = await checkSuggestPantry();
  if (!checked.ok) return respond(checked);

  // The session client is made here, where the request's cookies are, and handed to the background run.
  const db = await createClient();
  const enqueued = await enqueueAiJob(db, {
    kind: "suggest",
    clientKey,
    context: { siteId: checked.data.siteId },
    requestStartedAt,
  });
  if (!enqueued.ok) return respond(enqueued);
  const { job, created, startBy } = enqueued.data;

  // A job that was given back (a double tap, another tab) is run by the request that made it.
  if (created) {
    after(() =>
      runAiJob(db, job, { startBy }, async (signal, deadline): Promise<Result<Json>> => {
        const result = await suggestFromPantry({ avoidTitles }, { signal, deadline });
        // The drafts are plain data; the job keeps them as JSON until Pontus saves one.
        return result.ok ? ok(JSON.parse(JSON.stringify(result.data)) as Json) : result;
      }),
    );
  }
  return respond(ok({ job }), 202);
}

export async function GET(): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;
  const listed = await listAiJobs(await createClient());
  return respond(listed.ok ? ok({ jobs: listed.data }) : listed);
}
