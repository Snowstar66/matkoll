import { useSyncExternalStore } from "react";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, ok, type Result } from "@/lib/errors";

// A stand-in for src/lib/ai-jobs-client.ts in component tests of the AI job of
// a photo (Story 12.5): the jobs the app would poll, controlled by the test.
// Use it with
//   vi.mock("@/lib/ai-jobs-client", async () => (await import("../../tests/mocks/fake-ai-jobs")).fakeAiJobsModule);
// `start` waits until the test answers the call: `answer(ok(reading))` gives
// the job, running with its reading (the cards); `answer(fail(code))` is a
// refused start. `finish(points)` ends the job (the numbers), `failJob(code)`
// ends it as failed, and `jobs` is what the list shows (a finished job that has
// been seen is not there, as on the server).

export type FakeCall = {
  path: string;
  form: FormData;
  key: string;
  job: AiJob;
  /** The server's answer to the start: the reading of the photo (as the result fetch gives it, without `points`), or why it was refused. */
  answer: (result: Result<unknown>) => void;
  /** The job ends: the points of its numbers, "failed" or "skipped". */
  finish: (points?: unknown) => void;
  /** The job ends as failed. */
  failJob: (code: string) => void;
};

type Job = AiJob & { result: unknown };

let jobs: Job[] = [];
let calls: FakeCall[] = [];
let cancelled: string[] = [];
let dismissed: string[] = [];
let seen: string[] = [];
let counter = 0;
const listeners = new Set<() => void>();
let snapshot: readonly AiJob[] = [];

/** The job as the list shows it: never with its result. */
function shownOf(job: Job): AiJob {
  const shown: Partial<Job> = { ...job };
  delete shown.result;
  return shown as AiJob;
}

function publish() {
  snapshot = jobs.filter((job) => !(job.seen && (job.status === "done" || job.status === "failed"))).map(shownOf);
  for (const listener of listeners) listener();
}

function change(id: string, edit: (job: Job) => Job | null) {
  jobs = jobs.flatMap((job) => {
    if (job.id !== id) return [job];
    const next = edit(job);
    return next ? [next] : [];
  });
  publish();
}

export const fakeAi = {
  reset() {
    jobs = [];
    calls = [];
    cancelled = [];
    dismissed = [];
    seen = [];
    counter = 0;
    snapshot = [];
  },
  get calls() {
    return calls;
  },
  get cancelled() {
    return cancelled;
  },
  get dismissed() {
    return dismissed;
  },
  get seen() {
    return seen;
  },
  get jobs(): readonly AiJob[] {
    return snapshot;
  },
  /** Puts a job in the list as the server would have it (for a result that waits when Hemma is opened). */
  add(job: Partial<AiJob> & { result?: unknown }): AiJob {
    counter += 1;
    const added: Job = {
      id: `job-${counter}`,
      kind: "analyze",
      status: "running",
      context: {},
      errorCode: null,
      createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, counter)).toISOString(),
      seen: false,
      ahead: 0,
      count: null,
      result: null,
      ...job,
    };
    jobs = [...jobs, added];
    publish();
    return added;
  },
  /** The job changes, as the queue would change it (a job that waits gets its turn, one gets its `ahead`). */
  update(id: string, patch: Partial<AiJob>) {
    change(id, (job) => ({ ...job, ...patch }));
  },
};

function countOf(result: unknown): number {
  const list = (result as { suggestions?: unknown[] } | null)?.suggestions;
  return Array.isArray(list) ? list.length : 0;
}

export const fakeAiJobsModule = {
  useAiJobs() {
    const current = useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => snapshot,
      () => snapshot,
    );
    return {
      jobs: current,
      loaded: true,
      reveals: { suggest: 0, analyze: 0, import: 0 },
      start: fakeStart,
      fetchResult: fakeFetchResult,
      reveal: () => {},
      async cancel(id: string) {
        cancelled.push(id);
        change(id, () => null);
      },
      async markSeen(id: string) {
        seen.push(id);
        change(id, (job) => ({ ...job, seen: true }));
      },
      async dismiss(id: string) {
        dismissed.push(id);
        change(id, () => null);
      },
    };
  },
  useShowingAiResults() {},
};

function fakeStart(path: string, form: Record<string, unknown> | FormData, key: string): Promise<Result<{ job: AiJob }>> {
  if (!(form instanceof FormData)) throw new Error("the photo is posted as a form");
  counter += 1;
  const job: Job = {
    id: `job-${counter}`,
    kind: "analyze",
    status: "running",
    context: { siteId: form.get("site"), location: form.get("location"), takenAt: form.get("takenAt") },
    errorCode: null,
    createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, counter)).toISOString(),
    seen: false,
    ahead: 0,
    count: null,
    result: null,
  };
  return new Promise((resolve) => {
    const shownJob = shownOf(job);
    const call: FakeCall = {
      path,
      form,
      key,
      job: shownJob,
      answer(result) {
        if (!result.ok) return resolve(fail(result.error.code));
        // As on the server: the job is there when the start is answered, and its reading comes a moment after.
        jobs = [...jobs, job];
        publish();
        resolve(ok({ job: shownJob }));
        void Promise.resolve().then(() =>
          change(job.id, (current) => ({
            ...current,
            result: { ...(result.data as object), points: null },
            count: countOf(result.data),
          })),
        );
      },
      finish(points = "skipped") {
        change(job.id, (current) => ({
          ...current,
          status: "done",
          result: { ...(current.result as object), points },
        }));
      },
      failJob(code) {
        change(job.id, (current) => ({ ...current, status: "failed", errorCode: code, result: null, count: null }));
      },
    };
    calls.push(call);
  });
}

async function fakeFetchResult(id: string): Promise<Result<{ job: AiJob; result: unknown }>> {
  const found = jobs.find((job) => job.id === id);
  if (!found) return fail("ai_job_gone");
  return ok({ job: shownOf(found), result: found.result });
}
