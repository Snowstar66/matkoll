import { z } from "zod";
import { requireUserForRoute } from "@/features/auth/server";
import { getAiJob } from "@/features/ai-jobs/server";
import { fail } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { respond } from "../../route-support";

// The whole result of one AI job (Story 12.4, AD-28), fetched once when the
// client needs it: the list (GET /api/ai/jobs) is polled often and holds no
// results. `ai_job_gone` (404) for a job that is not the user's, is gone,
// is older than 24 hours or was closed on another device. Reads only.

export async function GET(_request: Request, context: RouteContext<"/api/ai/jobs/[id]">): Promise<Response> {
  const auth = await requireUserForRoute();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return respond(fail("ai_job_gone"));
  const response = respond(await getAiJob(await createClient(), id));
  // A result is private to the user: never kept by a shared cache.
  response.headers.set("cache-control", "private, no-store");
  return response;
}
