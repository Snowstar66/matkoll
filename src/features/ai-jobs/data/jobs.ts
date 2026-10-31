import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/lib/supabase/database.types";
import { aiJobRowSchema, aiJobStatuses, type AiJobKind, type AiJobRow, type AiJobStatus } from "../domain/ai-job";

// Every function takes the signed-in user's session client, never an admin
// client: RLS limits ai_job to the user's own rows, and the writes go through
// the Postgres functions of supabase/migrations/*_ai_job.sql (AD-28), which
// take ai_job_lock() first. Errors carry only a fixed reason and the
// Postgres code, never a result or a context.

export type AiJobsDb = SupabaseClient<Database>;

export class AiJobsDataError extends Error {
  constructor(readonly detail: string) {
    super(`ai_jobs_data: ${detail}`);
    this.name = "AiJobsDataError";
  }
}

/** The Postgres codes of enqueue_ai_job (the queue is full) and of the other functions (no such job). */
export const queueFullCode = "MK430";
export const jobGoneCode = "MK431";

const columns = "id, kind, status, client_key, context, error_code, created_at, started_at, finished_at, expires_at, seen_at";

function parseRow(row: unknown): AiJobRow {
  const parsed = aiJobRowSchema.safeParse(row);
  if (!parsed.success) throw new AiJobsDataError("invalid_row");
  return parsed.data;
}

/**
 * The rows a read gives, without those this code cannot read (a job of a
 * kind or a shape a newer or older version wrote, AD-28 backward
 * compatibility): they are skipped and counted in one log line, never a
 * reason to fail the whole list.
 */
function parseRows(rows: readonly unknown[]): AiJobRow[] {
  const jobs: AiJobRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const parsed = aiJobRowSchema.safeParse(row);
    if (parsed.success) jobs.push(parsed.data);
    else skipped += 1;
  }
  if (skipped > 0) console.error("ai_job_rows_skipped", { count: skipped });
  return jobs;
}

export type EnqueueOutcome = { kind: "queued"; created: boolean; job: AiJobRow } | { kind: "full" };

/**
 * Puts a job in the queue, or gives the one that is already there (the same
 * `clientKey`, or an active AI-förslag job): `created` says which. A fourth
 * active job is `full`. `queueDeadline` is when the job must have started.
 */
export async function enqueueAiJobIn(
  db: AiJobsDb,
  input: { kind: AiJobKind; clientKey: string; context: Record<string, Json>; queueDeadline: Date },
): Promise<EnqueueOutcome> {
  const { data, error } = await db.rpc("enqueue_ai_job", {
    job_kind: input.kind,
    job_client_key: input.clientKey,
    job_context: input.context,
    queue_deadline: input.queueDeadline.toISOString(),
  });
  if (error) {
    if (error.code === queueFullCode) return { kind: "full" };
    throw new AiJobsDataError(`enqueue_failed ${error.code}`);
  }
  const parsed = z.object({ created: z.boolean(), job: z.unknown() }).safeParse(data);
  if (!parsed.success) throw new AiJobsDataError("invalid_answer");
  return { kind: "queued", created: parsed.data.created, job: parseRow(parsed.data.job) };
}

export type ClaimOutcome = { outcome: "claimed" | "waiting" | "gone"; position: number };

/** The turn of a queued job (claim_ai_job): `claimed`, `waiting` with how many are before it, or `gone`. */
export async function claimAiJobIn(db: AiJobsDb, id: string, runDeadline: Date): Promise<ClaimOutcome> {
  const { data, error } = await db.rpc("claim_ai_job", { job_id: id, run_deadline: runDeadline.toISOString() });
  if (error) throw new AiJobsDataError(`claim_failed ${error.code}`);
  const parsed = z
    .object({ outcome: z.enum(["claimed", "waiting", "gone"]), position: z.number().int().min(0) })
    .safeParse(data);
  if (!parsed.success) throw new AiJobsDataError("invalid_answer");
  return parsed.data;
}

/** A partial result while the job runs (set_ai_job_result); false when it is not running any more. */
export async function setAiJobResultIn(db: AiJobsDb, id: string, result: Json): Promise<boolean> {
  const { data, error } = await db.rpc("set_ai_job_result", { job_id: id, job_result: result });
  if (error) throw new AiJobsDataError(`set_result_failed ${error.code}`);
  return data === true;
}

/**
 * The end of a job (finish_ai_job): false when the job was not running any
 * more (cancelled, replaced or lost), so its result is thrown away.
 */
export async function finishAiJobIn(
  db: AiJobsDb,
  id: string,
  outcome: { status: "done"; result: Json } | { status: "failed"; errorCode: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("finish_ai_job", {
    job_id: id,
    job_status: outcome.status,
    ...(outcome.status === "done" ? { job_result: outcome.result } : { job_error_code: outcome.errorCode }),
  });
  if (error) throw new AiJobsDataError(`finish_failed ${error.code}`);
  return data === true;
}

/** `gone` when the job is not the user's or is gone (MK431), otherwise `ok`. */
export type Touched = "ok" | "gone";

async function touch(
  db: AiJobsDb,
  name: "cancel_ai_job" | "mark_ai_job_seen" | "dismiss_ai_job",
  id: string,
): Promise<Touched> {
  const { error } = await db.rpc(name, { job_id: id });
  if (!error) return "ok";
  if (error.code === jobGoneCode) return "gone";
  throw new AiJobsDataError(`${name} ${error.code}`);
}

/** "Avbryt" (cancel_ai_job): a queued or running job is cancelled. */
export function cancelAiJobIn(db: AiJobsDb, id: string): Promise<Touched> {
  return touch(db, "cancel_ai_job", id);
}

/** The result has been shown (mark_ai_job_seen). */
export function markAiJobSeenIn(db: AiJobsDb, id: string): Promise<Touched> {
  return touch(db, "mark_ai_job_seen", id);
}

/** The result is closed or saved (dismiss_ai_job): the job is removed. */
export function dismissAiJobIn(db: AiJobsDb, id: string): Promise<Touched> {
  return touch(db, "dismiss_ai_job", id);
}

/**
 * The jobs the app shows: those that are queued or running, and finished
 * ones whose result or failure has not been seen. Oldest first. Cancelled
 * and replaced jobs are never shown. Includes `result`, only so the
 * count can be taken; the caller never passes it on.
 */
export async function loadShownAiJobsIn(db: AiJobsDb): Promise<AiJobRow[]> {
  const { data, error } = await db
    .from("ai_job")
    .select(`${columns}, result`)
    .or("status.in.(queued,running),and(status.in.(done,failed),seen_at.is.null)")
    .order("created_at")
    .order("id");
  if (error) throw new AiJobsDataError(`query_failed ${error.code}`);
  return parseRows(data);
}

/** One job with its result, or null when it is not the user's, is gone or is one this code cannot read. */
export async function loadAiJobIn(db: AiJobsDb, id: string): Promise<AiJobRow | null> {
  const { data, error } = await db.from("ai_job").select(`${columns}, result`).eq("id", id).maybeSingle();
  if (error) throw new AiJobsDataError(`query_failed ${error.code}`);
  return data ? (parseRows([data])[0] ?? null) : null;
}

/** A job's status, for the function that runs it to see that it was cancelled or replaced; null when gone. */
export async function loadAiJobStatusIn(db: AiJobsDb, id: string): Promise<AiJobStatus | null> {
  const { data, error } = await db.from("ai_job").select("status").eq("id", id).maybeSingle();
  if (error) throw new AiJobsDataError(`query_failed ${error.code}`);
  if (!data) return null;
  const status = z.enum(aiJobStatuses).safeParse(data.status);
  if (!status.success) throw new AiJobsDataError("invalid_row");
  return status.data;
}

/**
 * Whether the user has a job that is queued or running, and whether one
 * began (or ended well or badly) at or after `since`, for the warm-up
 * (Story 12.2): the model needs no waking while one is on its way, nor soon
 * after one. Across server instances, since it is read from the table.
 */
export async function loadAiJobActivityIn(db: AiJobsDb, since: Date): Promise<{ active: boolean; recent: boolean }> {
  const at = since.toISOString();
  const [active, recent] = await Promise.all([
    db.from("ai_job").select("id").in("status", ["queued", "running"]).limit(1),
    db
      .from("ai_job")
      .select("id")
      .or(`started_at.gte.${at},and(status.in.(done,failed),finished_at.gte.${at})`)
      .limit(1),
  ]);
  if (active.error) throw new AiJobsDataError(`query_failed ${active.error.code}`);
  if (recent.error) throw new AiJobsDataError(`query_failed ${recent.error.code}`);
  return { active: active.data.length > 0, recent: recent.data.length > 0 };
}
