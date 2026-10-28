import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { AiJobsDataError, type AiJobsDb } from "../data/jobs";
import type { AiJobRow } from "../domain/ai-job";

// enqueueAiJob, listAiJobs and getAiJob over stubbed data functions: what the
// routes get (queue full, the job as the client sees it, lost jobs shown as
// failed without a write) and that nothing of a result, a key or a context
// beyond the place reaches the client (Story 12.4, AD-28).

const enqueueAiJobIn = vi.fn();
const loadShownAiJobsIn = vi.fn();
const loadAiJobIn = vi.fn();
vi.mock("../data/jobs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/jobs")>()),
  enqueueAiJobIn: (...args: unknown[]) => enqueueAiJobIn(...args),
  loadShownAiJobsIn: (...args: unknown[]) => loadShownAiJobsIn(...args),
  loadAiJobIn: (...args: unknown[]) => loadAiJobIn(...args),
}));

const { enqueueAiJob, getAiJob, listAiJobs } = await import("./ai-job-requests");

const db = {} as AiJobsDb;
const now = Date.parse("2026-10-28T12:00:00Z");
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();

const row = (overrides: Partial<AiJobRow> = {}): AiJobRow => ({
  id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22",
  kind: "suggest",
  status: "queued",
  client_key: "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11",
  context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
  result: null,
  error_code: null,
  created_at: at(-1),
  started_at: null,
  finished_at: null,
  expires_at: at(100),
  seen_at: null,
  ...overrides,
});

beforeEach(() => {
  // A job's times are compared with the clock, so the clock stands still at the time of the rows.
  vi.useFakeTimers({ now, toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  enqueueAiJobIn.mockReset();
  loadShownAiJobsIn.mockReset().mockResolvedValue([]);
  loadAiJobIn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("enqueueAiJob", () => {
  const input = {
    kind: "suggest",
    clientKey: "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11",
    context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
    requestStartedAt: now,
  } as const;

  it("queues the job with 175 s to start, and gives it with its place in the queue", async () => {
    const queued = row();
    enqueueAiJobIn.mockResolvedValue({ kind: "queued", created: true, job: queued });
    loadShownAiJobsIn.mockResolvedValue([row({ id: "00000000-0000-4000-8000-000000000009", status: "running", created_at: at(-50), expires_at: at(100) }), queued]);
    const result = await enqueueAiJob(db, input);

    const [passedDb, sent] = enqueueAiJobIn.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(sent.kind).toBe("suggest");
    expect(sent.queueDeadline.getTime()).toBe(input.requestStartedAt + 175_000);
    expect(result).toMatchObject({ ok: true, data: { created: true, startBy: input.requestStartedAt + 175_000 } });
    expect(result.ok && result.data.job).toMatchObject({ id: queued.id, status: "queued", ahead: 1 });
  });

  it("says whether the job was made or given back", async () => {
    enqueueAiJobIn.mockResolvedValue({ kind: "queued", created: false, job: row() });
    const result = await enqueueAiJob(db, input);
    expect(result.ok && result.data.created).toBe(false);
  });

  it("gives ai_queue_full when three are active", async () => {
    enqueueAiJobIn.mockResolvedValue({ kind: "full" });
    expect(await enqueueAiJob(db, input)).toEqual(fail("ai_queue_full"));
    expect(loadShownAiJobsIn).not.toHaveBeenCalled();
  });

  it("gives ai_unavailable for a database that cannot be reached, logging a fixed reason only", async () => {
    enqueueAiJobIn.mockRejectedValue(new AiJobsDataError("enqueue_failed 57014"));
    expect(await enqueueAiJob(db, input)).toEqual(fail("ai_unavailable"));
    expect(console.error).toHaveBeenCalledWith("ai_job_error", { reason: "enqueue_failed 57014" });
  });

  it("throws other errors, which are bugs", async () => {
    enqueueAiJobIn.mockRejectedValue(new TypeError("bug"));
    await expect(enqueueAiJob(db, input)).rejects.toThrow("bug");
  });
});

describe("listAiJobs", () => {
  it("gives the jobs as the client sees them, with the count from a result and never the result", async () => {
    loadShownAiJobsIn.mockResolvedValue([row({ status: "done", result: { suggestions: [{ draft: { title: "Pannkakor" } }, {}] }, finished_at: at(-1) })]);
    const result = await listAiJobs(db, now);
    expect(result.ok && result.data).toHaveLength(1);
    expect(result.ok && result.data[0]).toMatchObject({ status: "done", count: 2 });
    expect(JSON.stringify(result)).not.toMatch(/Pannkakor/);
  });

  it("shows a lost job as failed with ai_job_lost, without writing anything", async () => {
    loadShownAiJobsIn.mockResolvedValue([row({ status: "running", expires_at: at(-5) })]);
    const result = await listAiJobs(db, now);
    expect(result.ok && result.data[0]).toMatchObject({ status: "failed", errorCode: "ai_job_lost" });
    expect(enqueueAiJobIn).not.toHaveBeenCalled();
  });

  it("gives ai_unavailable for a failed read", async () => {
    loadShownAiJobsIn.mockRejectedValue(new AiJobsDataError("query_failed 500"));
    expect(await listAiJobs(db, now)).toEqual(fail("ai_unavailable"));
  });
});

describe("getAiJob", () => {
  const id = "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22";

  it("gives the whole result of a finished job", async () => {
    loadAiJobIn.mockResolvedValue(row({ status: "done", result: { suggestions: [{ n: 1 }], siteId: null }, finished_at: at(-1) }));
    const result = await getAiJob(db, id, now);
    expect(result).toEqual(ok({ job: expect.objectContaining({ id, status: "done", count: 1 }), result: { suggestions: [{ n: 1 }], siteId: null } }));
  });

  it.each([
    ["a job that is not there", null],
    ["a replaced job", row({ status: "superseded", finished_at: at(-1) })],
    ["a job that is still running", row({ status: "running" })],
    ["a job that failed", row({ status: "failed", error_code: "ai_invalid", finished_at: at(-1) })],
    ["a job that was cancelled", row({ status: "cancelled", finished_at: at(-1) })],
    ["a job that was lost", row({ status: "running", expires_at: at(-5) })],
  ])("gives ai_job_gone for %s", async (_name, found) => {
    loadAiJobIn.mockResolvedValue(found);
    expect(await getAiJob(db, id, now)).toEqual(fail("ai_job_gone"));
  });

  it("gives ai_unavailable for a failed read", async () => {
    loadAiJobIn.mockRejectedValue(new AiJobsDataError("query_failed 500"));
    expect(await getAiJob(db, id, now)).toEqual(fail("ai_unavailable"));
  });
});
