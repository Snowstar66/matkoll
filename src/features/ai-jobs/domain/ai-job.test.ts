import { describe, expect, it } from "vitest";
import { aiJobSchema, isLost, isOld, resultCount, toAiJobs, type AiJobRow } from "./ai-job";

const now = Date.parse("2026-10-28T12:00:00Z");
const at = (seconds: number) => new Date(now + seconds * 1000).toISOString();

let counter = 0;
function row(overrides: Partial<AiJobRow> = {}): AiJobRow {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    kind: "suggest",
    status: "queued",
    client_key: `10000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    context: { siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01" },
    result: null,
    error_code: null,
    created_at: at(-counter),
    started_at: null,
    finished_at: null,
    expires_at: at(100),
    seen_at: null,
    ...overrides,
  };
}

describe("isLost", () => {
  it("is a queued or running job whose time has passed", () => {
    expect(isLost(row({ status: "queued", expires_at: at(-1) }), now)).toBe(true);
    expect(isLost(row({ status: "running", expires_at: at(0) }), now)).toBe(true);
    expect(isLost(row({ status: "running", expires_at: at(1) }), now)).toBe(false);
  });

  it("is never a job that has ended, whatever its time", () => {
    for (const status of ["done", "failed", "cancelled", "superseded"] as const) {
      expect(isLost(row({ status, expires_at: at(-100) }), now)).toBe(false);
    }
  });
});

describe("resultCount", () => {
  it("counts the dishes of a suggestion result, and nothing for another shape", () => {
    expect(resultCount("suggest", { suggestions: [1, 2, 3] })).toBe(3);
    expect(resultCount("suggest", { suggestions: [] })).toBe(0);
    expect(resultCount("suggest", {})).toBeNull();
    expect(resultCount("suggest", null)).toBeNull();
    expect(resultCount("suggest", "text")).toBeNull();
  });
});

describe("toAiJobs", () => {
  it("gives the shape the client takes, without the result or the key", () => {
    const done = row({
      status: "done",
      result: { suggestions: [{ draft: { title: "Pannkakor" } }, {}, {}] },
      finished_at: at(-5),
      seen_at: at(-1),
    });
    const [job] = toAiJobs([done], now);
    expect(aiJobSchema.parse(job)).toEqual(job);
    expect(job).toEqual({
      id: done.id,
      kind: "suggest",
      status: "done",
      context: done.context,
      errorCode: null,
      createdAt: done.created_at,
      seen: true,
      ahead: 0,
      count: 3,
    });
    // Never the result, the key or a title.
    expect(JSON.stringify(job)).not.toMatch(/Pannkakor|client_key|result/);
  });

  it("shows a job whose time has passed as failed with ai_job_lost, without counting it in the queue", () => {
    const lost = row({ status: "running", started_at: at(-200), expires_at: at(-10), created_at: at(-300) });
    const waiting = row({ status: "queued", created_at: at(-100) });
    const jobs = toAiJobs([lost, waiting], now);
    expect(jobs.find((job) => job.id === lost.id)).toMatchObject({ status: "failed", errorCode: "ai_job_lost", ahead: 0 });
    // The lost job does not stand in front of the waiting one.
    expect(jobs.find((job) => job.id === waiting.id)).toMatchObject({ status: "queued", ahead: 0 });
  });

  it("says how many are before a queued job, the running one and the older queued ones, oldest first", () => {
    const running = row({ status: "running", created_at: at(-30), started_at: at(-20), expires_at: at(100) });
    const first = row({ status: "queued", created_at: at(-20) });
    const second = row({ status: "queued", created_at: at(-10) });
    const jobs = toAiJobs([second, first, running], now);
    expect(jobs.map((job) => [job.id, job.ahead])).toEqual([
      [second.id, 2],
      [first.id, 1],
      [running.id, 0],
    ]);
    expect(jobs.map((job) => job.id)).toEqual([second.id, first.id, running.id]);
  });

  it("breaks a tie in time by the id, as claim_ai_job does", () => {
    const a = row({ id: "00000000-0000-4000-8000-00000000000a", created_at: at(-5) });
    const b = row({ id: "00000000-0000-4000-8000-00000000000b", created_at: at(-5) });
    const jobs = toAiJobs([b, a], now);
    expect(jobs.find((job) => job.id === a.id)?.ahead).toBe(0);
    expect(jobs.find((job) => job.id === b.id)?.ahead).toBe(1);
  });

  it("never shows a replaced job (FR-49), and keeps a failed job's code and a cancelled one", () => {
    const failed = row({ status: "failed", error_code: "ai_invalid", finished_at: at(-1) });
    const replaced = row({ kind: "analyze", status: "superseded", finished_at: at(-1) });
    const cancelled = row({ status: "cancelled", finished_at: at(-1), seen_at: at(-1) });
    const jobs = toAiJobs([failed, replaced, cancelled], now);
    expect(jobs.map((job) => job.id).sort()).toEqual([failed.id, cancelled.id].sort());
    expect(jobs.find((job) => job.id === failed.id)).toMatchObject({ status: "failed", errorCode: "ai_invalid", seen: false });
  });

  it("does not show a finished job older than 24 hours, whether it was seen or not, and shows a younger one", () => {
    const hours = (count: number) => new Date(now - count * 3_600_000).toISOString();
    const old = row({ status: "done", result: { suggestions: [] }, finished_at: hours(25) });
    const young = row({ status: "done", result: { suggestions: [] }, finished_at: hours(23) });
    expect(isOld(old, now)).toBe(true);
    expect(isOld(young, now)).toBe(false);
    expect(isOld(row({ status: "running" }), now)).toBe(false);
    expect(toAiJobs([old, young], now).map((job) => job.id)).toEqual([young.id]);
  });

  it("gives no count for a job that is not done", () => {
    expect(toAiJobs([row({ status: "running", result: { suggestions: [1] } })], now)[0].count).toBeNull();
  });

  it("counts the suggestions of a photo's job as soon as its reading is there, before it is done (Story 12.5)", () => {
    const running = row({ kind: "analyze", status: "running", result: { suggestions: [1, 2], points: null } });
    expect(toAiJobs([running], now)[0].count).toBe(2);
    expect(toAiJobs([row({ kind: "analyze", status: "running", result: null })], now)[0].count).toBeNull();
    expect(toAiJobs([{ ...running, status: "done" }], now)[0].count).toBe(2);
  });
});
