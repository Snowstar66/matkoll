import { after } from "next/server";
import { enqueueAiJob, runAiJob } from "@/features/ai-jobs/server";
import type { ImportInput } from "@/features/recipes";
import { importRecipe, prepareImport } from "@/features/recipes/server";
import { ok, type Result } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { respond } from "../route-support";

// Starts a recipe import as an AI job (Story 12.6, AD-28), for both routes:
// /api/ai/jobs (text and link) and /api/ai/jobs/photo. What needs no AI is
// checked first (prepareImport), so a bad link, a site that is not approved
// or a text that is too long answers at once and queues nothing. The input
// (the text, the link, the photo) stays in this request's memory in the
// background run; ai_job holds only the kind of input and a link's domain.

export async function startImportJob(input: ImportInput, clientKey: string, requestStartedAt: number): Promise<Response> {
  const prepared = await prepareImport(input);
  if (!prepared.ok) return respond(prepared);

  // The session client is made here, where the request's cookies are, and handed to the background run.
  const db = await createClient();
  const enqueued = await enqueueAiJob(db, {
    kind: "import",
    clientKey,
    context: prepared.data,
    requestStartedAt,
  });
  if (!enqueued.ok) return respond(enqueued);
  const { job, created, startBy } = enqueued.data;

  // A job that was given back (a double tap, another tab) is run by the request that made it.
  if (created) {
    after(() =>
      runAiJob(db, job, { startBy }, async (signal): Promise<Result<Json>> => {
        const result = await importRecipe(input, { signal });
        // The draft is plain data; the job keeps it as JSON until Pontus saves it or lets it go.
        return result.ok ? ok(JSON.parse(JSON.stringify(result.data)) as Json) : result;
      }),
    );
  }
  return respond(ok({ job }), 202);
}
