import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { getAiJob } from "@/features/ai-jobs/server";
import { compareStoredReading, storedReadingSchema } from "@/features/pantry/server";
import { fail, ok } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { respond } from "../../route-support";

// The whole result of one AI job (Story 12.4, AD-28), fetched once when the
// client needs it: the list (GET /api/ai/jobs) is polled often and holds no
// results. `ai_job_gone` (404) for a job that is not the user's, is gone,
// is older than 24 hours or was closed on another device. Reads only.
//
// Story 12.5: the result of a photo's job is the reading of the photo, which
// is never changed, and the route compares it with the place's items as they
// are now, so "Nytt", "Ändrat" and "Syns inte längre" are true when Pontus
// opens it, also after minutes. A running photo job gives its reading before
// its numbers have come (`points: null`).

export async function GET(_request: Request, context: RouteContext<"/api/ai/jobs/[id]">): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return respond(fail("ai_job_gone"));
  const found = await getAiJob(await createClient(), id);
  let answer: Awaited<ReturnType<typeof getAiJob>> = found;
  if (found.ok && found.data.job.kind === "analyze") {
    const stored = storedReadingSchema.safeParse(found.data.result);
    // A result that is not a reading is a bug in the job, never something to show.
    answer = stored.success
      ? ok({ job: found.data.job, result: await compareStoredReading(stored.data) })
      : fail("ai_invalid");
  }
  const response = respond(answer);
  // A result is private to the user: never kept by a shared cache.
  response.headers.set("cache-control", "private, no-store");
  return response;
}
