import { describe, expect, it, vi } from "vitest";
import {
  AiJobsDataError,
  cancelAiJobIn,
  claimAiJobIn,
  dismissAiJobIn,
  enqueueAiJobIn,
  finishAiJobIn,
  loadAiJobActivityIn,
  loadAiJobIn,
  loadAiJobStatusIn,
  loadShownAiJobsIn,
  markAiJobSeenIn,
  setAiJobResultIn,
  type AiJobsDb,
} from "./jobs";

// The data functions with a stand-in for the session client: what is sent to
// the Postgres functions, how their answers and codes are read, and that
// nothing but a fixed reason and a code is in an error (the integration test,
// tests/integration/ai-job.test.ts, runs the functions themselves).

type Answer = { data?: unknown; error?: { code: string; message: string } | null };

const row = {
  id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22",
  kind: "suggest",
  status: "queued",
  client_key: "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11",
  context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
  error_code: null,
  created_at: "2026-10-28T12:00:00+00:00",
  started_at: null,
  finished_at: null,
  expires_at: "2026-10-28T12:02:55+00:00",
  seen_at: null,
};

/** A client whose rpc answers `rpcAnswer`, and whose queries answer `queryAnswer` after the calls they record. */
function fakeDb(rpcAnswer: Answer = {}, queryAnswer: Answer = { data: [] }) {
  const calls: [string, ...unknown[]][] = [];
  const query: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
    return query;
  };
  for (const name of ["select", "or", "order", "eq", "in", "limit"]) query[name] = chain(name);
  query.maybeSingle = async () => ({ error: null, ...queryAnswer });
  query.then = (resolve: (value: Answer) => void) => resolve({ error: null, ...queryAnswer });
  const rpc = vi.fn(async (name: string, args: unknown) => ({ error: null, data: null, ...rpcAnswer, name, args }));
  const db = { rpc, from: (table: string) => (calls.push(["from", table]), query) } as unknown as AiJobsDb;
  return { db, rpc, calls };
}

const error = (code: string) => ({ error: { code, message: "details with Mjölk in them" } });

describe("enqueueAiJobIn", () => {
  const input = {
    kind: "suggest",
    clientKey: row.client_key,
    context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
    queueDeadline: new Date("2026-10-28T12:02:55Z"),
  } as const;

  it("sends the kind, key, context and the time to start by, and reads the job and whether it was made", async () => {
    const { db, rpc } = fakeDb({ data: { created: true, job: row } });
    const outcome = await enqueueAiJobIn(db, input);
    expect(rpc).toHaveBeenCalledWith("enqueue_ai_job", {
      job_kind: "suggest",
      job_client_key: row.client_key,
      job_context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
      queue_deadline: "2026-10-28T12:02:55.000Z",
    });
    expect(outcome).toMatchObject({ kind: "queued", created: true, job: { id: row.id, status: "queued" } });
  });

  it("gives back a job that already existed as not made", async () => {
    const { db } = fakeDb({ data: { created: false, job: row } });
    expect(await enqueueAiJobIn(db, input)).toMatchObject({ kind: "queued", created: false });
  });

  it("says full for MK430, and throws a fixed reason with the code for anything else", async () => {
    expect(await enqueueAiJobIn(fakeDb(error("MK430")).db, input)).toEqual({ kind: "full" });
    const thrown = await enqueueAiJobIn(fakeDb(error("57014")).db, input).catch((caught: unknown) => caught);
    expect(thrown).toBeInstanceOf(AiJobsDataError);
    expect((thrown as AiJobsDataError).detail).toBe("enqueue_failed 57014");
    expect((thrown as Error).message).not.toMatch(/Mjölk/);
  });

  it("throws for an answer that is not the shape", async () => {
    await expect(enqueueAiJobIn(fakeDb({ data: { created: true, job: { id: "x" } } }).db, input)).rejects.toMatchObject({ detail: "invalid_row" });
    await expect(enqueueAiJobIn(fakeDb({ data: "nope" }).db, input)).rejects.toMatchObject({ detail: "invalid_answer" });
  });
});

describe("claimAiJobIn", () => {
  it("sends the running time and reads the outcome and the place in the queue", async () => {
    const { db, rpc } = fakeDb({ data: { outcome: "waiting", position: 2 } });
    expect(await claimAiJobIn(db, row.id, new Date("2026-10-28T12:02:10Z"))).toEqual({ outcome: "waiting", position: 2 });
    expect(rpc).toHaveBeenCalledWith("claim_ai_job", { job_id: row.id, run_deadline: "2026-10-28T12:02:10.000Z" });
  });

  it("throws for an unknown outcome and for a database error", async () => {
    await expect(claimAiJobIn(fakeDb({ data: { outcome: "maybe", position: 0 } }).db, row.id, new Date())).rejects.toMatchObject({ detail: "invalid_answer" });
    await expect(claimAiJobIn(fakeDb(error("40001")).db, row.id, new Date())).rejects.toMatchObject({ detail: "claim_failed 40001" });
  });
});

describe("setAiJobResultIn and finishAiJobIn", () => {
  it("writes a partial result, and says whether the job was still running", async () => {
    expect(await setAiJobResultIn(fakeDb({ data: true }).db, row.id, { a: 1 })).toBe(true);
    expect(await setAiJobResultIn(fakeDb({ data: false }).db, row.id, { a: 1 })).toBe(false);
  });

  it("finishes done with the result and no code, or failed with the code and no result", async () => {
    const done = fakeDb({ data: true });
    expect(await finishAiJobIn(done.db, row.id, { status: "done", result: { suggestions: [] } })).toBe(true);
    expect(done.rpc).toHaveBeenCalledWith("finish_ai_job", { job_id: row.id, job_status: "done", job_result: { suggestions: [] } });

    const failed = fakeDb({ data: false });
    expect(await finishAiJobIn(failed.db, row.id, { status: "failed", errorCode: "ai_invalid" })).toBe(false);
    expect(failed.rpc).toHaveBeenCalledWith("finish_ai_job", { job_id: row.id, job_status: "failed", job_error_code: "ai_invalid" });
  });

  it("throws a fixed reason when the database refuses", async () => {
    await expect(finishAiJobIn(fakeDb(error("23514")).db, row.id, { status: "done", result: {} })).rejects.toMatchObject({ detail: "finish_failed 23514" });
    await expect(setAiJobResultIn(fakeDb(error("23514")).db, row.id, {})).rejects.toMatchObject({ detail: "set_result_failed 23514" });
  });
});

describe("cancel, seen and dismiss", () => {
  it.each([
    ["cancel_ai_job", cancelAiJobIn],
    ["mark_ai_job_seen", markAiJobSeenIn],
    ["dismiss_ai_job", dismissAiJobIn],
  ] as const)("%s says ok, gone for MK431 and throws for another code", async (name, call) => {
    const ok = fakeDb();
    expect(await call(ok.db, row.id)).toBe("ok");
    expect(ok.rpc).toHaveBeenCalledWith(name, { job_id: row.id });
    expect(await call(fakeDb(error("MK431")).db, row.id)).toBe("gone");
    await expect(call(fakeDb(error("42501")).db, row.id)).rejects.toMatchObject({ detail: `${name} 42501` });
  });
});

describe("the reads", () => {
  it("reads the active jobs and the finished ones not seen, oldest first", async () => {
    const { db, calls } = fakeDb({}, { data: [row, { ...row, id: "e3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22", result: { suggestions: [] } }] });
    const rows = await loadShownAiJobsIn(db);
    expect(rows.map((shown) => shown.id)).toEqual([row.id, "e3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22"]);
    const filter = calls.find(([name]) => name === "or");
    expect(filter?.[1]).toBe("status.in.(queued,running),and(status.in.(done,failed),seen_at.is.null)");
    expect(calls.filter(([name]) => name === "order").map(([, column]) => column)).toEqual(["created_at", "id"]);
  });

  it("skips a row it cannot read, such as an unknown kind, logging once, and throws for a failed query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await loadShownAiJobsIn(fakeDb({}, { data: [{ id: "x" }, row, { ...row, kind: "from_the_future" }] }).db);
    expect(rows.map((shown) => shown.id)).toEqual([row.id]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("ai_job_rows_skipped", { count: 2 });
    log.mockRestore();
    await expect(loadShownAiJobsIn(fakeDb({}, error("42501")).db)).rejects.toMatchObject({ detail: "query_failed 42501" });
  });

  it("reads one job with its result, or null when it is not there", async () => {
    expect(await loadAiJobIn(fakeDb({}, { data: { ...row, status: "done", result: { suggestions: [] } } }).db, row.id)).toMatchObject({ status: "done" });
    expect(await loadAiJobIn(fakeDb({}, { data: null }).db, row.id)).toBeNull();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadAiJobIn(fakeDb({}, { data: { ...row, kind: "from_the_future" } }).db, row.id)).toBeNull();
    log.mockRestore();
  });

  it("reads a job's status, null when it is gone", async () => {
    expect(await loadAiJobStatusIn(fakeDb({}, { data: { status: "cancelled" } }).db, row.id)).toBe("cancelled");
    expect(await loadAiJobStatusIn(fakeDb({}, { data: null }).db, row.id)).toBeNull();
    await expect(loadAiJobStatusIn(fakeDb({}, { data: { status: "weird" } }).db, row.id)).rejects.toMatchObject({ detail: "invalid_row" });
  });

  it("reads whether a job is active and whether one began or ended within the window", async () => {
    expect(await loadAiJobActivityIn(fakeDb({}, { data: [{ id: row.id }] }).db, new Date("2026-10-28T11:57:00Z"))).toEqual({ active: true, recent: true });
    expect(await loadAiJobActivityIn(fakeDb({}, { data: [] }).db, new Date("2026-10-28T11:57:00Z"))).toEqual({ active: false, recent: false });
    const { db, calls } = fakeDb({}, { data: [] });
    await loadAiJobActivityIn(db, new Date("2026-10-28T11:57:00Z"));
    expect(calls.find(([name]) => name === "or")?.[1]).toBe(
      "started_at.gte.2026-10-28T11:57:00.000Z,and(status.in.(done,failed),finished_at.gte.2026-10-28T11:57:00.000Z)",
    );
  });
});
