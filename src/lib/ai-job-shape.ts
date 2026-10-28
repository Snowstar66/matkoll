import { z } from "zod";

// What an AI job looks like to the client (Story 12.4, AD-28): shared by the
// ai-jobs module and the client's store (src/lib/ai-jobs-client.ts), which
// may not import a feature. Never the job's input, and never the whole
// result: the list is polled often, and the result is fetched once with
// GET /api/ai/jobs/[id].

export const aiJobKinds = ["suggest", "analyze", "import"] as const;
export type AiJobKind = (typeof aiJobKinds)[number];

export const aiJobStatuses = ["queued", "running", "done", "failed", "cancelled", "superseded"] as const;
export type AiJobStatus = (typeof aiJobStatuses)[number];

/** A job that is waiting or running: it counts for the queue and shows in the job row. */
export const activeAiJobStatuses = ["queued", "running"] as const satisfies readonly AiJobStatus[];

export const aiJobSchema = z.object({
  id: z.uuid(),
  kind: z.enum(aiJobKinds),
  status: z.enum(aiJobStatuses),
  /** What is needed to show and judge the job ({ siteId }); never an input. */
  context: z.record(z.string(), z.unknown()),
  /** The error code of a failed job (src/lib/errors.ts). */
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  /** Whether the result has been shown. */
  seen: z.boolean(),
  /** For a queued job: how many are before it (0 when it is next). */
  ahead: z.number().int().min(0),
  /** How much there is in a finished result, for "3 rättförslag är klara."; null when there is no result. */
  count: z.number().int().min(0).nullable(),
});
export type AiJob = z.infer<typeof aiJobSchema>;

export function isActive(job: Pick<AiJob, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

/** A finished job with something to show: a result, or the reason it failed. */
export function isFinishedWithNews(job: Pick<AiJob, "status">): boolean {
  return job.status === "done" || job.status === "failed";
}
