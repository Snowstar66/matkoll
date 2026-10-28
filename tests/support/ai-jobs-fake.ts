import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { AiJob, AiJobKind } from "@/lib/ai-job-shape";
import { aiJobsClient, resetAiJobsClient, type AiJobActions } from "@/lib/ai-jobs-client";
import { fail, ok, type ErrorCode, type Result } from "@/lib/errors";

// A stand-in for the server of AI jobs (Story 12.4), for component tests: it
// answers the client's own fetches (POST /api/ai/jobs, GET /api/ai/jobs and
// GET /api/ai/jobs/[id]) and the Server Actions given to AiJobActionsContext,
// so the tests go through the real client, polling excepted: a test makes the
// client read the list with `read()` when the job has changed.

export type StartedJob = { path: string; body: Record<string, unknown> };

let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export function createFakeAiJobsServer() {
  let jobs: AiJob[] = [];
  const results = new Map<string, unknown>();
  const started: StartedJob[] = [];
  /** What POST answers instead of a job, once. */
  let startAnswer: Result<never> | "network" | null = null;
  const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";

  const json = (result: Result<unknown>, status = 200) => Response.json(result, { status });

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/ai/jobs" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      started.push({ path: url.pathname, body });
      if (startAnswer === "network") {
        startAnswer = null;
        throw new TypeError("Failed to fetch");
      }
      if (startAnswer) {
        const answer = startAnswer;
        startAnswer = null;
        return json(answer, 429);
      }
      const job: AiJob = {
        id: newId(),
        kind: body.kind as AiJobKind,
        status: "running",
        context: { siteId },
        errorCode: null,
        createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, started.length)).toISOString(),
        seen: false,
        ahead: 0,
        count: null,
      };
      jobs = [job, ...jobs];
      return json(ok({ job }), 202);
    }
    if (url.pathname === "/api/ai/jobs" && method === "GET") {
      // As GET /api/ai/jobs: active jobs, and finished ones that have not been seen.
      const shown = jobs.filter(
        (job) => job.status === "queued" || job.status === "running" || ((job.status === "done" || job.status === "failed") && !job.seen),
      );
      return json(ok({ jobs: shown }));
    }
    const one = /^\/api\/ai\/jobs\/([^/]+)$/.exec(url.pathname);
    if (one && method === "GET") {
      const job = jobs.find((other) => other.id === one[1]);
      // A job without a result of its own is one whose result is gone (older than 24 hours, closed elsewhere).
      if (!job || (job.status !== "done" && job.status !== "running") || !results.has(job.id)) return json(fail("ai_job_gone"), 404);
      return json(ok({ job, result: results.get(job.id) ?? null }));
    }
    throw new Error(`unexpected ${method} ${url.pathname}`);
  });

  const actions = {
    cancel: vi.fn(async (id: string) => {
      jobs = jobs.filter((job) => job.id !== id);
      return ok();
    }),
    markSeen: vi.fn(async (id: string) => {
      jobs = jobs.map((job) => (job.id === id ? { ...job, seen: true } : job));
      return ok();
    }),
    dismiss: vi.fn(async (id: string) => {
      jobs = jobs.filter((job) => job.id !== id);
      return ok();
    }),
  } satisfies AiJobActions;

  const server = {
    siteId,
    started,
    actions,
    fetch: fetchStub,
    /** The jobs the server has, newest first. */
    get jobs() {
      return jobs;
    },
    /** Starts the fake: its fetch is the browser's, and the client starts afresh. */
    install() {
      counter = 0;
      jobs = [];
      results.clear();
      started.length = 0;
      startAnswer = null;
      resetAiJobsClient();
      vi.stubGlobal("fetch", fetchStub);
      window.fetch = fetchStub as unknown as typeof window.fetch;
    },
    /** The next POST fails with `code` (a status of 429 stands for any). */
    failNextStart(code: ErrorCode | "network") {
      startAnswer = code === "network" ? "network" : (fail(code) as Result<never>);
    },
    /** The latest job the client started. */
    get latest(): AiJob {
      return jobs[0];
    },
    /** A job is queued behind others. */
    queue(id: string, ahead: number) {
      jobs = jobs.map((job) => (job.id === id ? { ...job, status: "queued", ahead } : job));
    },
    /** The job is done with `result`, as the server would list it. */
    finish(id: string, result: unknown, count: number | null = null) {
      results.set(id, result);
      jobs = jobs.map((job) => (job.id === id ? { ...job, status: "done", count } : job));
    },
    /** A running job has `result` so far (Story 12.7), with `count` in the list. */
    report(id: string, result: unknown, count: number) {
      results.set(id, result);
      jobs = jobs.map((job) => (job.id === id ? { ...job, count } : job));
    },
    /** The job did not go. */
    failJob(id: string, errorCode: ErrorCode) {
      jobs = jobs.map((job) => (job.id === id ? { ...job, status: "failed", errorCode } : job));
    },
    /** A job another device started or finished. */
    add(job: Partial<AiJob> & Pick<AiJob, "kind" | "status">, result?: unknown): AiJob {
      const full: AiJob = {
        id: newId(),
        context: { siteId },
        errorCode: null,
        createdAt: new Date(Date.UTC(2026, 9, 28, 11, 0, 0)).toISOString(),
        seen: false,
        ahead: 0,
        count: null,
        ...job,
      };
      jobs = [full, ...jobs];
      if (result !== undefined) results.set(full.id, result);
      return full;
    },
    /** The job is gone from the list (cancelled or closed elsewhere). */
    remove(id: string) {
      jobs = jobs.filter((job) => job.id !== id);
    },
    /** Makes the client read the list now, as its polling does. */
    async read() {
      await act(async () => {
        await aiJobsClient().refresh();
      });
    },
  };
  return server;
}

export type FakeAiJobsServer = ReturnType<typeof createFakeAiJobsServer>;
