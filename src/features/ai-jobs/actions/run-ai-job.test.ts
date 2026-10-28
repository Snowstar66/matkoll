import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import type { ClaimOutcome } from "../data/jobs";
import { claimPollMs, guardPollMs, runMs, runTimes, startBy } from "../domain/ai-job";
import { runAiJobWith, type AiJobWork, type RunDeps } from "./run-ai-job";

// runAiJob with a fake clock and fake database functions: waiting its turn in
// the queue, the time to start by, the work with its own signal and deadline,
// the guard that stops a cancelled or replaced job, and the end (Story 12.4,
// AD-28). The real clock and the real timers are never used.

const job = { id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22", kind: "suggest" } as const;
const start = Date.parse("2026-10-28T12:00:00Z");

let deps: {
  [Key in keyof RunDeps]: ReturnType<typeof vi.fn<RunDeps[Key]>>;
};
let claims: ClaimOutcome[];
let statuses: ("queued" | "running" | "done" | "failed" | "cancelled" | "superseded" | null)[];
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ now: start });
  claims = [{ outcome: "claimed", position: 0 }];
  statuses = [];
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  deps = {
    now: vi.fn(() => Date.now()),
    sleep: vi.fn((ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    })),
    claim: vi.fn(async () => claims.shift() ?? { outcome: "waiting", position: 1 }),
    status: vi.fn(async () => (statuses.length > 0 ? statuses.shift()! : "running")),
    setResult: vi.fn(async () => true),
    finish: vi.fn(async () => true),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const run = (work: AiJobWork, startByTime = startBy(start, "suggest")) =>
  runAiJobWith(deps as unknown as RunDeps, job, { startBy: startByTime }, work);

/** Runs `run` while the fake clock goes on until it is done. */
async function runToEnd(work: AiJobWork, startByTime?: number) {
  const done = run(work, startByTime);
  await vi.runAllTimersAsync();
  await done;
}

describe("the times", () => {
  it("must start 120 s before the function's end for a suggestion, and has 130 s for an import (AD-28)", () => {
    expect(startBy(start, "suggest")).toBe(start + 175_000);
    expect(startBy(start, "analyze")).toBe(start + 175_000);
    expect(startBy(start, "import")).toBe(start + 165_000);
    expect(runTimes(start, "suggest")).toEqual({ deadline: start + 120_000, expiresAt: start + 130_000 });
    expect(runTimes(start, "import")).toEqual({ deadline: start + 130_000, expiresAt: start + 140_000 });
    expect(runMs.suggest + startBy(0, "suggest")).toBe(295_000);
  });
});

describe("runAiJob, when it is the job's turn", () => {
  it("claims the job with its running time, gives the work its own signal and deadline, and finishes done with the result", async () => {
    const work = vi.fn<AiJobWork>(async (signal, deadline) => {
      expect(signal.aborted).toBe(false);
      expect(deadline).toBe(start + 120_000);
      return ok({ suggestions: [] } as Json);
    });
    await runToEnd(work);

    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(deps.claim).toHaveBeenCalledWith(job.id, new Date(start + 130_000));
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "done", result: { suggestions: [] } });
    expect(deps.finish).toHaveBeenCalledTimes(1);
  });

  it("finishes failed with the error code the work gave", async () => {
    await runToEnd(async () => fail("ai_invalid"));
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "failed", errorCode: "ai_invalid" });
  });

  it("turns an error it does not know into ai_unavailable, logging only the job's id, kind and a fixed reason", async () => {
    await runToEnd(async () => {
      throw new Error("the pantry had Mjölk and the answer was Pannkakor");
    });
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "failed", errorCode: "ai_unavailable" });
    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain(job.id);
    expect(logged).not.toMatch(/Mjölk|Pannkakor/);
  });

  it("finishes failed with ai_invalid when the database refuses the result (too large), so the job never hangs", async () => {
    deps.finish.mockRejectedValueOnce(new Error("check violation"));
    await runToEnd(async () => ok({ big: true } as Json));
    expect(deps.finish.mock.calls.map(([, outcome]) => outcome)).toEqual([
      { status: "done", result: { big: true } },
      { status: "failed", errorCode: "ai_invalid" },
    ]);
  });

  it("passes a partial result on through report, and goes on when it cannot be written", async () => {
    deps.setResult.mockRejectedValueOnce(new Error("down"));
    await runToEnd(async (_signal, _deadline, report) => {
      await report({ first: 1 });
      await report({ second: 2 });
      return ok({} as Json);
    });
    expect(deps.setResult).toHaveBeenCalledTimes(2);
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "done", result: {} });
  });
});

describe("runAiJob, the queue", () => {
  it("asks every second while it waits, and starts when it is the turn", async () => {
    claims = [
      { outcome: "waiting", position: 2 },
      { outcome: "waiting", position: 1 },
      { outcome: "claimed", position: 0 },
    ];
    const work = vi.fn<AiJobWork>(async () => ok({} as Json));
    const done = run(work);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(claimPollMs);
    expect(deps.claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(claimPollMs);
    expect(deps.claim).toHaveBeenCalledTimes(3);
    await vi.runAllTimersAsync();
    await done;

    expect(work).toHaveBeenCalledTimes(1);
    // The running time counts from the turn, not from when the job was queued.
    expect(deps.claim.mock.calls[2][1]).toEqual(new Date(start + 2 * claimPollMs + 130_000));
    expect(work.mock.calls[0][1]).toBe(start + 2 * claimPollMs + 120_000);
  });

  it("stops when the job is gone (cancelled, replaced, lost), without work and without an end", async () => {
    claims = [{ outcome: "waiting", position: 1 }, { outcome: "gone", position: 0 }];
    const work = vi.fn<AiJobWork>();
    await runToEnd(work);
    expect(work).not.toHaveBeenCalled();
    expect(deps.finish).not.toHaveBeenCalled();
  });

  it("gives ai_queue_timeout when it did not get to start in time", async () => {
    deps.claim.mockImplementation(async () => ({ outcome: "waiting", position: 1 }));
    const work = vi.fn<AiJobWork>();
    await runToEnd(work);

    expect(work).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "failed", errorCode: "ai_queue_timeout" });
    // Asked every second until the time to start by (175 s), and no longer.
    expect(deps.claim.mock.calls.length).toBeGreaterThanOrEqual(175);
    expect(deps.claim.mock.calls.length).toBeLessThanOrEqual(176);
  });

  it("gives ai_queue_timeout at once when the time to start by has already passed", async () => {
    const work = vi.fn<AiJobWork>();
    await runToEnd(work, start - 1);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "failed", errorCode: "ai_queue_timeout" });
  });

  it("asks again when the database does not answer, logging it once, until the time to start by", async () => {
    let calls = 0;
    deps.claim.mockImplementation(async () => {
      calls += 1;
      if (calls < 4) throw new Error("down");
      return { outcome: "claimed", position: 0 };
    });
    const work = vi.fn<AiJobWork>(async () => ok({} as Json));
    await runToEnd(work);
    expect(work).toHaveBeenCalledTimes(1);
    expect((errors.mock.calls as unknown[][]).filter(([event]) => event === "ai_job_error")).toHaveLength(1);
  });

  it("never throws, also when the end cannot be written", async () => {
    deps.finish.mockRejectedValue(new Error("down"));
    await expect(runToEnd(async () => fail("ai_invalid"))).resolves.toBeUndefined();
  });
});

describe("runAiJob, the guard", () => {
  /** A work that runs until its signal aborts, or until `finishAfterMs`. */
  function slowWork(finishAfterMs: number, log: { aborted: boolean | null } = { aborted: null }): AiJobWork {
    return (signal) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          log.aborted = false;
          resolve(ok({ done: true } as Json));
        }, finishAfterMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          log.aborted = true;
          resolve(fail("ai_unavailable"));
        });
      });
  }

  it("reads the job's status every three seconds while it runs, and goes on while it is running", async () => {
    const done = run(slowWork(10_000));
    await vi.advanceTimersByTimeAsync(guardPollMs - 1);
    expect(deps.status).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(guardPollMs);
    expect(deps.status).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    await done;
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "done", result: { done: true } });
  });

  it.each(["cancelled", "superseded", "failed", null] as const)("aborts the work within three seconds when the job is %s, and writes no end", async (status) => {
    statuses = ["running", status];
    const log = { aborted: null as boolean | null };
    const done = run(slowWork(60_000, log));
    await vi.advanceTimersByTimeAsync(guardPollMs * 2 - 1);
    expect(log.aborted).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(log.aborted).toBe(true);
    await vi.runAllTimersAsync();
    await done;
    // The row is not ours to write any more.
    expect(deps.finish).not.toHaveBeenCalled();
  });

  it("is not stopped by a status that could not be read", async () => {
    deps.status.mockRejectedValueOnce(new Error("down"));
    const log = { aborted: null as boolean | null };
    const done = run(slowWork(5_000, log));
    await vi.runAllTimersAsync();
    await done;
    expect(log.aborted).toBe(false);
    expect(deps.finish).toHaveBeenCalledWith(job.id, { status: "done", result: { done: true } });
  });

  it("stops reading the status once the work is done", async () => {
    const done = run(async () => ok({} as Json));
    await vi.runAllTimersAsync();
    await done;
    const reads = deps.status.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.status.mock.calls.length).toBe(reads);
  });
});

describe("two instances", () => {
  it("lets only the one that is claimed work: the other asks again and never calls its work", async () => {
    // One database: the first to ask is claimed, the other waits until the first has finished.
    let taken = false;
    const shared = async (): Promise<ClaimOutcome> => {
      if (taken) return { outcome: "waiting", position: 1 };
      taken = true;
      return { outcome: "claimed", position: 0 };
    };
    const first = { ...deps, claim: vi.fn(shared), finish: vi.fn(async () => (taken = false, true)) };
    const second = { ...deps, claim: vi.fn(shared), finish: vi.fn(async () => true) };
    const order: string[] = [];
    const a = runAiJobWith(first as unknown as RunDeps, job, { startBy: start + 175_000 }, async () => {
      order.push("a start");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      order.push("a end");
      return ok({} as Json);
    });
    const b = runAiJobWith(second as unknown as RunDeps, { ...job, id: "other" }, { startBy: start + 175_000 }, async () => {
      order.push("b start");
      return ok({} as Json);
    });
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(order).toEqual(["a start", "a end", "b start"]);
  });
});
