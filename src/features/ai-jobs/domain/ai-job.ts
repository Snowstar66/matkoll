import { z } from "zod";
import {
  activeAiJobStatuses,
  aiJobKinds,
  aiJobSchema,
  aiJobStatuses,
  type AiJob,
  type AiJobKind,
  type AiJobStatus,
} from "@/lib/ai-job-shape";

// The rules of AI jobs (Story 12.4, FR-46-FR-49, AD-28): the kinds and states,
// the times, and what a row from Postgres becomes for the client. Pure: no
// clock of its own (the caller gives `now`).

export { activeAiJobStatuses, aiJobKinds, aiJobSchema, aiJobStatuses, type AiJob, type AiJobKind, type AiJobStatus };

/** The function's whole time (maxDuration is 300 s, AD-28): a job must be done 5 s before. */
export const functionMs = 295_000;

/** How long the model may work on a job of each kind, from when it starts (AD-28). */
export const runMs: Record<AiJobKind, number> = { suggest: 120_000, analyze: 120_000, import: 130_000, things: 120_000 };

/** A running job is lost this long after its time, so a slow finish is never cut off by the queue. */
export const expiryMarginMs = 10_000;

/** How often a waiting job asks whether it is its turn. */
export const claimPollMs = 1_000;

/** How often a running job reads its own status, to stop when it was cancelled or replaced. */
export const guardPollMs = 3_000;

/**
 * When a job taken in a request that started at `requestStartedAt` must
 * have begun at the latest (Date.now() milliseconds): early enough that its
 * whole run still fits the function's time. Later is `ai_queue_timeout`.
 */
export function startBy(requestStartedAt: number, kind: AiJobKind): number {
  return requestStartedAt + functionMs - runMs[kind];
}

/** The time a job that starts at `at` has: when the work must be done, and when the job is lost. */
export function runTimes(at: number, kind: AiJobKind): { deadline: number; expiresAt: number } {
  return { deadline: at + runMs[kind], expiresAt: at + runMs[kind] + expiryMarginMs };
}

/** A row of `ai_job` as the functions and queries give it. `result` is only there when it was selected. */
export const aiJobRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(aiJobKinds),
  status: z.enum(aiJobStatuses),
  client_key: z.uuid(),
  context: z.record(z.string(), z.unknown()),
  result: z.unknown().nullish(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  expires_at: z.string(),
  seen_at: z.string().nullable(),
});
export type AiJobRow = z.infer<typeof aiJobRowSchema>;

/**
 * A job whose time has passed without an answer is lost: the function that
 * ran it died, or it never got to start. Postgres marks it the next time the
 * queue is used (enqueue_ai_job, claim_ai_job); reads show it as failed at
 * once, without writing (AD-28).
 */
export function isLost(row: Pick<AiJobRow, "status" | "expires_at">, now: number): boolean {
  return (row.status === "queued" || row.status === "running") && Date.parse(row.expires_at) <= now;
}

function isActiveRow(row: Pick<AiJobRow, "status">): boolean {
  return (activeAiJobStatuses as readonly AiJobStatus[]).includes(row.status);
}

/** The rows in queue order: oldest first, the id breaking a tie (as claim_ai_job does). */
function inQueueOrder(a: AiJobRow, b: AiJobRow): number {
  const byTime = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : 1;
}

/** A finished job is kept this long (AD-28); enqueue_ai_job removes the older ones. */
export const keepFinishedMs = 24 * 3_600_000;

/**
 * A finished job older than 24 hours: gone for the reads (the list, and the
 * result), even before the next enqueue_ai_job removes the row.
 */
export function isOld(row: Pick<AiJobRow, "status" | "finished_at">, now: number): boolean {
  return row.status !== "queued" && row.status !== "running" && row.finished_at !== null && now - Date.parse(row.finished_at) > keepFinishedMs;
}

/** How much a result holds, for its summary: three dishes, or the suggestions of a photo. */
export function resultCount(kind: AiJobKind, result: unknown): number | null {
  if (typeof result !== "object" || result === null) return null;
  // Story 18.2: a things job has saved its things already; its result says how many.
  if (kind === "things") {
    const count = (result as { count?: unknown }).count;
    return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
  }
  const list = kind === "suggest" || kind === "analyze" ? (result as { suggestions?: unknown }).suggestions : undefined;
  return Array.isArray(list) ? list.length : null;
}

/** The recipe's title in a finished import's result ({ draft: { title } }); null for other jobs and for an odd result. */
export function resultTitle(kind: AiJobKind, result: unknown): string | null {
  if (kind !== "import" || typeof result !== "object" || result === null) return null;
  const draft = (result as { draft?: unknown }).draft;
  if (typeof draft !== "object" || draft === null) return null;
  const title = (draft as { title?: unknown }).title;
  return typeof title === "string" && title.trim() !== "" ? title : null;
}

/**
 * The jobs as the client sees them, newest first: a lost job as `failed`
 * with `ai_job_lost`, a queued job with how many are before it, and a
 * finished one with the count from its result, which is never passed on.
 * `rows` are the user's jobs; `superseded` ones are never shown (FR-49), nor
 * finished ones older than 24 hours.
 */
export function toAiJobs(rows: readonly AiJobRow[], now: number): AiJob[] {
  const live = rows.filter((row) => isActiveRow(row) && !isLost(row, now)).sort(inQueueOrder);
  const aheadOf = new Map(live.map((row, index) => [row.id, index]));
  return rows
    .filter((row) => row.status !== "superseded" && !isOld(row, now))
    .map((row): AiJob => {
      const lost = isLost(row, now);
      const status = lost ? "failed" : row.status;
      return {
        id: row.id,
        kind: row.kind,
        status,
        context: row.context,
        errorCode: lost ? "ai_job_lost" : row.error_code,
        createdAt: row.created_at,
        seen: row.seen_at !== null,
        ahead: status === "queued" ? (aheadOf.get(row.id) ?? 0) : 0,
        // A running job has a result only when it gave a partial one (Story 12.5: the cards of a photo before its numbers).
        count: status === "done" || (status === "running" && row.kind === "analyze") ? resultCount(row.kind, row.result) : null,
        // Only an import has a title; other jobs look as before.
        ...(status === "done" && row.kind === "import" ? { title: resultTitle(row.kind, row.result) } : {}),
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
