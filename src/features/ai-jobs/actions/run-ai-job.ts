import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { isErrorCode, type Result } from "@/lib/errors";
import {
  claimAiJobIn,
  finishAiJobIn,
  loadAiJobStatusIn,
  setAiJobResultIn,
  type AiJobsDb,
  type ClaimOutcome,
} from "../data/jobs";
import { claimPollMs, guardPollMs, runTimes, type AiJobKind, type AiJobStatus } from "../domain/ai-job";

// Runs a job in the background of the request that took it (Story 12.4,
// AD-28): waits its turn in the queue, does the work with a signal of its own,
// watches that it was not cancelled or replaced, and writes the end. The
// input is only in `work`'s closure, in this request's memory; nothing of it
// goes to the database. Never `request.signal`: it no longer holds once the
// response has been sent. Only the job's id, its kind and error codes are
// logged, never a prompt, an answer or a photo.

/** Reports a partial result while the job runs (set_ai_job_result); never fails. */
export type ReportAiJob = (partial: Json) => Promise<void>;

/**
 * The work: the AI call and what follows it. It stops at `signal` (the job
 * was cancelled or replaced) and finishes by `deadline` (Date.now()
 * milliseconds). The result is the job's result, or an error code.
 */
export type AiJobWork = (signal: AbortSignal, deadline: number, report: ReportAiJob) => Promise<Result<Json>>;

export type RunTimes = {
  /** When the job must have started at the latest (Date.now() milliseconds); later is `ai_queue_timeout`. */
  startBy: number;
};

/** What runAiJob needs from the outside, so the queue, the guard and the end can be tried with a fake clock. */
export type RunDeps = {
  now: () => number;
  /** Waits `ms`, or until `signal` aborts. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  claim: (id: string, runDeadline: Date) => Promise<ClaimOutcome>;
  status: (id: string) => Promise<AiJobStatus | null>;
  setResult: (id: string, partial: Json) => Promise<boolean>;
  finish: (
    id: string,
    outcome: { status: "done"; result: Json } | { status: "failed"; errorCode: string },
  ) => Promise<boolean>;
};

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** The real dependencies, over the user's session client. */
export function depsFor(db: AiJobsDb): RunDeps {
  return {
    now: () => Date.now(),
    sleep,
    claim: (id, runDeadline) => claimAiJobIn(db, id, runDeadline),
    status: (id) => loadAiJobStatusIn(db, id),
    setResult: (id, partial) => setAiJobResultIn(db, id, partial),
    finish: (id, outcome) => finishAiJobIn(db, id, outcome),
  };
}

/** Logs a failure of the queue itself (the database), with the job's id and a fixed reason. */
function logQueueError(id: string, kind: AiJobKind, reason: string): void {
  console.error("ai_job_error", { jobId: id, kind, reason });
}

/**
 * Runs `job` to its end. Never throws: whatever goes wrong is logged and
 * leaves the job to its time, after which Postgres marks it lost (AD-28).
 */
export async function runAiJobWith(
  deps: RunDeps,
  job: { id: string; kind: AiJobKind },
  { startBy }: RunTimes,
  work: AiJobWork,
): Promise<void> {
  const { id, kind } = job;

  // 1. The queue: ask every second until it is this job's turn.
  let deadline: number;
  let reportedClaimError = false;
  for (;;) {
    const at = deps.now();
    if (at >= startBy) {
      try {
        await deps.finish(id, { status: "failed", errorCode: "ai_queue_timeout" });
      } catch {
        logQueueError(id, kind, "finish_failed");
      }
      return;
    }
    const times = runTimes(at, kind);
    try {
      const answer = await deps.claim(id, new Date(times.expiresAt));
      if (answer.outcome === "gone") return;
      if (answer.outcome === "claimed") {
        deadline = times.deadline;
        break;
      }
    } catch {
      // The database did not answer: ask again until the time to start has passed.
      if (!reportedClaimError) logQueueError(id, kind, "claim_failed");
      reportedClaimError = true;
    }
    await deps.sleep(claimPollMs);
  }

  // 2. The work, with a guard that reads the job's status while it runs.
  const controller = new AbortController();
  const finished = new AbortController();
  let stoppedByGuard = false;
  const guard = (async () => {
    while (!finished.signal.aborted) {
      await deps.sleep(guardPollMs, finished.signal);
      if (finished.signal.aborted) return;
      let status: AiJobStatus | null;
      try {
        status = await deps.status(id);
      } catch {
        // A read that failed says nothing; the next one does.
        continue;
      }
      if (status !== "running") {
        // Cancelled, replaced, lost or removed, from this or another server instance.
        stoppedByGuard = true;
        controller.abort();
        return;
      }
    }
  })();

  const report: ReportAiJob = async (partial) => {
    try {
      await deps.setResult(id, partial);
    } catch {
      logQueueError(id, kind, "set_result_failed");
    }
  };

  let result: Result<Json>;
  try {
    result = await work(controller.signal, deadline, report);
  } catch {
    // Not a known error: the job did not go, and the reason is not for Pontus.
    console.error("ai_job_error", { jobId: id, kind, reason: "work_threw" });
    result = { ok: false, error: { code: "ai_unavailable", message: "" } };
  } finally {
    finished.abort();
  }
  await guard;

  // 3. The end. A job that was cancelled or replaced gets none: its row is not ours to write any more.
  if (stoppedByGuard || controller.signal.aborted) return;
  const outcome = result.ok
    ? ({ status: "done", result: result.data } as const)
    : ({ status: "failed", errorCode: isErrorCode(result.error.code) ? result.error.code : "ai_unavailable" } as const);
  try {
    await deps.finish(id, outcome);
  } catch {
    // A result the database refuses (too large) is a failed job, so it never hangs until its time.
    logQueueError(id, kind, "finish_failed");
    if (outcome.status === "done") {
      try {
        await deps.finish(id, { status: "failed", errorCode: "ai_invalid" });
      } catch {
        logQueueError(id, kind, "finish_failed");
      }
    }
  }
}
