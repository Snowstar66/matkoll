import "server-only";
import type { AiJob, AiJobKind } from "@/lib/ai-job-shape";
import { fail, ok, type Result } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { AiJobsDataError, enqueueAiJobIn, loadAiJobIn, loadShownAiJobsIn, type AiJobsDb } from "../data/jobs";
import { startBy as startByFor, toAiJobs, type AiJobRow } from "../domain/ai-job";

// Starting, listing and reading AI jobs for the Route Handlers (Story 12.4,
// AD-28). Not Server Actions: the jobs are started and read by routes, and
// the Server Actions are only cancel, seen and dismiss. All of them take the
// user's session client; none logs more than a fixed reason.

/** The job in the list's shape, as the client sees it (without the result). */
function shown(rows: AiJobRow[], id: string, now: number): AiJob | null {
  return toAiJobs(rows, now).find((job) => job.id === id) ?? null;
}

export type Enqueued = {
  job: AiJob;
  /** True for a job made now; false when the same `clientKey` or an active AI-förslag job was given back. */
  created: boolean;
  /** When the job must have started at the latest (Date.now() milliseconds). */
  startBy: number;
};

/**
 * Puts a job in the queue (enqueue_ai_job). `context` is only what is needed
 * to show and judge the job, never its input. A request that started at
 * `requestStartedAt` gives the job until `startBy` to begin. `ai_queue_full`
 * when three are active; a database that cannot be reached is
 * `ai_unavailable` (logged without data).
 */
export async function enqueueAiJob(
  db: AiJobsDb,
  input: { kind: AiJobKind; clientKey: string; context: Record<string, Json>; requestStartedAt: number },
): Promise<Result<Enqueued>> {
  const startBy = startByFor(input.requestStartedAt, input.kind);
  try {
    const outcome = await enqueueAiJobIn(db, {
      kind: input.kind,
      clientKey: input.clientKey,
      context: input.context,
      queueDeadline: new Date(startBy),
    });
    if (outcome.kind === "full") return fail("ai_queue_full");
    // The list gives its queue position, which needs the user's other active jobs.
    const rows = await loadShownAiJobsIn(db);
    const job = shown(rows, outcome.job.id, Date.now()) ?? shown([outcome.job], outcome.job.id, Date.now());
    if (!job) return fail("ai_unavailable");
    return ok({ job, created: outcome.created, startBy });
  } catch (error) {
    if (!(error instanceof AiJobsDataError)) throw error;
    console.error("ai_job_error", { reason: error.detail });
    return fail("ai_unavailable");
  }
}

/** The jobs the app shows now (GET /api/ai/jobs), without results. Reads only. */
export async function listAiJobs(db: AiJobsDb, now: number = Date.now()): Promise<Result<AiJob[]>> {
  try {
    return ok(toAiJobs(await loadShownAiJobsIn(db), now));
  } catch (error) {
    if (!(error instanceof AiJobsDataError)) throw error;
    console.error("ai_job_error", { reason: error.detail });
    return fail("ai_unavailable");
  }
}

/**
 * One job with its whole result (GET /api/ai/jobs/[id]), once. `ai_job_gone`
 * when it is not the user's, is gone, was replaced, or has no result to give
 * (it is neither done nor running with a partial result: the list tells how it went). Reads only; a lost job is
 * shown as failed without writing.
 */
export async function getAiJob(
  db: AiJobsDb,
  id: string,
  now: number = Date.now(),
): Promise<Result<{ job: AiJob; result: unknown }>> {
  try {
    const row = await loadAiJobIn(db, id);
    // A result older than 24 hours is gone, also before the next enqueue removes its row.
    if (!row || row.status === "superseded") return fail("ai_job_gone");
    const job = shown([row], id, now);
    if (!job) return fail("ai_job_gone");
    // A finished result is given, and the partial one of a running job (Story 12.5: the reading of a photo,
    // before its numbers); how another job went is in the list.
    const partial = job.status === "running" && row.result != null;
    if (job.status !== "done" && !partial) return fail("ai_job_gone");
    return ok({ job, result: row.result ?? null });
  } catch (error) {
    if (!(error instanceof AiJobsDataError)) throw error;
    console.error("ai_job_error", { reason: error.detail });
    return fail("ai_unavailable");
  }
}
