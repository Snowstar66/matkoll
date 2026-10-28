import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runAiJobWith, depsFor, type AiJobWork } from "./actions/run-ai-job";
import { loadAiJobActivityIn, AiJobsDataError } from "./data/jobs";
import type { AiJob } from "./domain/ai-job";

// Server-only entry (AD-1). The ai-jobs module is general: it owns ai_job
// and knows nothing of recipes, the pantry or suggestions (AD-28). The
// routes in src/app/api/ai/jobs/ put a job together from these.

export { enqueueAiJob, getAiJob, listAiJobs, type Enqueued } from "./actions/ai-job-requests";
export type { AiJobWork, ReportAiJob } from "./actions/run-ai-job";
export { runTimes, startBy, type AiJobKind } from "./domain/ai-job";

/**
 * Runs a job that was just queued, to its end, in the background of the
 * request that took it (`after()`): waits its turn, does `work` and writes the
 * end (AD-28). Takes the session client the request made, since the input is
 * only in this request's memory and no other request can run the job. Never
 * throws.
 */
export function runAiJob(
  db: Awaited<ReturnType<typeof createClient>>,
  job: Pick<AiJob, "id" | "kind">,
  times: { startBy: number },
  work: AiJobWork,
): Promise<void> {
  return runAiJobWith(depsFor(db), job, times, work);
}

/**
 * Whether the signed-in user has an AI job that is queued or running, and
 * whether one began or ended at or after `since`, for the warm-up (Story
 * 12.2, FR-45). `null` when it cannot be read: the caller then does not
 * wake the model, since it cannot tell whether it is in use.
 */
export async function getAiJobActivity(since: Date): Promise<{ active: boolean; recent: boolean } | null> {
  try {
    return await loadAiJobActivityIn(await createClient(), since);
  } catch (error) {
    if (!(error instanceof AiJobsDataError)) throw error;
    console.error("ai_job_error", { reason: error.detail });
    return null;
  }
}
