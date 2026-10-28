import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiJob } from "./ai-job-shape";
import { createAiJobsClient, pollIntervalMs, type AiJobsEnv } from "./ai-jobs-client";
import { fail, ok, type Result } from "./errors";

// The client's store with a fake clock, a fake document and a fake server:
// the polling (every two seconds while a job is active and the tab is
// visible, once when the tab is shown, once at the start), what a job that
// has just been started does to the list, the jobs that finish, and that a
// read that fails changes nothing (Story 12.4, AD-28).

const job = (id: number, overrides: Partial<AiJob> = {}): AiJob => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  kind: "suggest",
  status: "running",
  context: {},
  errorCode: null,
  createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, id)).toISOString(),
  seen: false,
  ahead: 0,
  count: null,
  ...overrides,
});

let now = 0;
let visible = true;
let visibilityListeners: (() => void)[] = [];
/** The timers the client has set, run by the test. */
let timers: { callback: () => void; at: number; handle: number }[] = [];
let nextHandle = 0;
/** What GET /api/ai/jobs answers: a result, or a failure. */
let list: Result<{ jobs: AiJob[] }> | "network";
const fetchStub = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

const env: AiJobsEnv = {
  fetch: (input, init) => fetchStub(String(input), init),
  now: () => now,
  setTimeout: (callback, ms) => {
    const handle = ++nextHandle;
    timers.push({ callback, at: now + ms, handle });
    return handle;
  },
  clearTimeout: (handle) => {
    timers = timers.filter((timer) => timer.handle !== handle);
  },
  visible: () => visible,
  onVisibilityChange: (listener) => {
    visibilityListeners.push(listener);
    return () => {
      visibilityListeners = visibilityListeners.filter((other) => other !== listener);
    };
  },
};

/** Moves the clock on and runs what is due, letting the answers of fetch in between. */
async function advance(ms: number) {
  now += ms;
  for (;;) {
    const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers = timers.filter((timer) => timer !== due);
    due.callback();
    await flush();
  }
  await flush();
}

/** Lets pending promises settle. */
const flush = async () => {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
};

beforeEach(() => {
  now = Date.parse("2026-10-28T12:00:00Z");
  visible = true;
  visibilityListeners = [];
  timers = [];
  list = ok({ jobs: [] });
  fetchStub.mockReset().mockImplementation(async (input, init) => {
    if (input === "/api/ai/jobs" && (init?.method ?? "GET") === "GET") {
      if (list === "network") throw new TypeError("Failed to fetch");
      return Response.json(list);
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${input}`);
  });
});

const reads = () => fetchStub.mock.calls.filter(([input, init]) => input === "/api/ai/jobs" && (init?.method ?? "GET") === "GET").length;

describe("polling", () => {
  it("reads the list once when the app loads, and does not poll while no job is active", async () => {
    const client = createAiJobsClient(env);
    client.init();
    await flush();
    expect(reads()).toBe(1);
    expect(client.getSnapshot().loaded).toBe(true);
    await advance(60_000);
    expect(reads()).toBe(1);
  });

  it("reads every two seconds while a job is active, and stops when none is", async () => {
    list = ok({ jobs: [job(1)] });
    const client = createAiJobsClient(env);
    client.init();
    await flush();
    expect(reads()).toBe(1);
    await advance(pollIntervalMs - 1);
    expect(reads()).toBe(1);
    await advance(1);
    expect(reads()).toBe(2);
    await advance(pollIntervalMs);
    expect(reads()).toBe(3);

    list = ok({ jobs: [job(1, { status: "done", count: 3 })] });
    await advance(pollIntervalMs);
    expect(reads()).toBe(4);
    await advance(60_000);
    expect(reads()).toBe(4);
  });

  it("does not read while the tab is hidden, and reads once at once when it is shown again", async () => {
    list = ok({ jobs: [job(1)] });
    const client = createAiJobsClient(env);
    client.init();
    await flush();
    expect(reads()).toBe(1);

    visible = false;
    for (const listener of visibilityListeners) listener();
    await advance(30_000);
    expect(reads()).toBe(1);

    visible = true;
    for (const listener of visibilityListeners) listener();
    await flush();
    expect(reads()).toBe(2);
    // And the polling goes on.
    await advance(pollIntervalMs);
    expect(reads()).toBe(3);
  });

  it("stops everything when the client is stopped", async () => {
    list = ok({ jobs: [job(1)] });
    const client = createAiJobsClient(env);
    const stop = client.init();
    await flush();
    stop();
    expect(visibilityListeners).toHaveLength(0);
    await advance(30_000);
    expect(reads()).toBe(1);
  });

  it("changes nothing when a read fails, and tries again at the next time", async () => {
    list = ok({ jobs: [job(1)] });
    const client = createAiJobsClient(env);
    client.init();
    await flush();
    const before = client.getSnapshot();

    list = "network";
    await advance(pollIntervalMs);
    expect(client.getSnapshot()).toBe(before);
    list = fail("unauthorized");
    await advance(pollIntervalMs);
    expect(client.getSnapshot()).toBe(before);
    expect(reads()).toBe(3);

    list = ok({ jobs: [job(1, { status: "done", count: 1 })] });
    await advance(pollIntervalMs);
    expect(client.getSnapshot().jobs[0].status).toBe("done");
  });

  it("joins a read that is on its way instead of making another", async () => {
    const client = createAiJobsClient(env);
    await Promise.all([client.refresh(), client.refresh(), client.refresh()]);
    expect(reads()).toBe(1);
  });
});

describe("the jobs that finish", () => {
  it("tells the listeners about a job that went from active to done or failed, once, and not about what was already finished at the start", async () => {
    list = ok({ jobs: [job(1), job(2, { status: "done", count: 2 })] });
    const client = createAiJobsClient(env);
    const finished = vi.fn();
    client.onFinished(finished);
    client.init();
    await flush();
    expect(finished).not.toHaveBeenCalled();

    list = ok({ jobs: [job(1, { status: "done", count: 3 }), job(2, { status: "done", count: 2 })] });
    await advance(pollIntervalMs);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished.mock.calls[0][0].map((done: AiJob) => done.id)).toEqual([job(1).id]);

    await advance(pollIntervalMs);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("tells about a failed job too, and not about one that was cancelled or went away", async () => {
    list = ok({ jobs: [job(1), job(2), job(3)] });
    const client = createAiJobsClient(env);
    const finished = vi.fn();
    client.onFinished(finished);
    client.init();
    await flush();

    // 1 failed, 2 is gone from the list (cancelled or closed elsewhere), 3 goes on.
    list = ok({ jobs: [job(1, { status: "failed", errorCode: "ai_invalid" }), job(3)] });
    await advance(pollIntervalMs);
    expect(finished.mock.calls[0][0].map((done: AiJob) => done.id)).toEqual([job(1).id]);
  });
});

describe("start", () => {
  it("posts JSON with the key, puts the job in the list at once, and starts the polling", async () => {
    fetchStub.mockImplementationOnce(async () => Response.json(ok({ job: job(1, { status: "queued" }) }), { status: 202 }));
    const client = createAiJobsClient(env);
    const result = await client.start("/api/ai/jobs", { kind: "suggest", avoidTitles: ["Pannkakor"] }, "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11");

    expect(result.ok && result.data.job.id).toBe(job(1).id);
    const [path, init] = fetchStub.mock.calls[0];
    expect(path).toBe("/api/ai/jobs");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "suggest",
      avoidTitles: ["Pannkakor"],
      clientKey: "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11",
    });
    expect(client.getSnapshot().jobs.map((shown) => shown.id)).toEqual([job(1).id]);

    list = ok({ jobs: [job(1, { status: "queued" })] });
    await advance(pollIntervalMs);
    expect(reads()).toBe(1);
  });

  it("posts a form with the key added, for a photo", async () => {
    fetchStub.mockImplementationOnce(async () => Response.json(ok({ job: job(1) }), { status: 202 }));
    const client = createAiJobsClient(env);
    const form = new FormData();
    form.set("image", new Blob(["x"]), "kylen.jpg");
    await client.start("/api/ai/jobs/photo", form, "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11");
    const [, init] = fetchStub.mock.calls[0];
    expect(init?.body).toBe(form);
    expect(form.get("clientKey")).toBe("6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11");
  });

  it("keeps a job that a read on its way missed, for a few seconds, and then lets the server's list decide", async () => {
    fetchStub.mockImplementationOnce(async () => Response.json(ok({ job: job(1) }), { status: 202 }));
    const client = createAiJobsClient(env);
    await client.start("/api/ai/jobs", { kind: "suggest" }, "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11");

    list = ok({ jobs: [] });
    await client.refresh();
    expect(client.getSnapshot().jobs).toHaveLength(1);
    now += 11_000;
    await client.refresh();
    expect(client.getSnapshot().jobs).toHaveLength(0);
  });

  it.each([
    ["the error code of the server", Response.json(fail("ai_queue_full"), { status: 429 }), "ai_queue_full"],
    ["an answer that is not JSON", new Response("<html>", { status: 502 }), "ai_unavailable"],
    ["an answer that is not the shape", Response.json(ok({ job: { id: "x" } })), "ai_unavailable"],
  ])("gives %s as the error, and no job", async (_name, response, code) => {
    fetchStub.mockImplementationOnce(async () => response);
    const client = createAiJobsClient(env);
    const result = await client.start("/api/ai/jobs", { kind: "suggest" }, "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11");
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(client.getSnapshot().jobs).toHaveLength(0);
  });

  it("gives ai_unavailable for a network error", async () => {
    fetchStub.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const client = createAiJobsClient(env);
    expect(await client.start("/api/ai/jobs", { kind: "suggest" }, "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11")).toMatchObject({
      ok: false,
      error: { code: "ai_unavailable" },
    });
  });
});

describe("fetchResult", () => {
  it("fetches the whole result of a job once", async () => {
    fetchStub.mockImplementationOnce(async () => Response.json(ok({ job: job(1, { status: "done", count: 1 }), result: { suggestions: [] } })));
    const client = createAiJobsClient(env);
    const result = await client.fetchResult(job(1).id);
    expect(fetchStub.mock.calls[0][0]).toBe(`/api/ai/jobs/${job(1).id}`);
    expect(result.ok && result.data.result).toEqual({ suggestions: [] });
  });

  it("gives ai_job_gone for a result that is not there any more", async () => {
    fetchStub.mockImplementationOnce(async () => Response.json(fail("ai_job_gone"), { status: 404 }));
    const client = createAiJobsClient(env);
    expect(await client.fetchResult(job(1).id)).toMatchObject({ ok: false, error: { code: "ai_job_gone" } });
  });
});

describe("what Pontus does here", () => {
  it("settles a job as seen or gone at once, and an older read does not bring it back", async () => {
    list = ok({ jobs: [job(1, { status: "done", count: 1 }), job(2)] });
    const client = createAiJobsClient(env);
    client.init();
    await flush();

    client.settle(job(1).id, "seen");
    expect(client.getSnapshot().jobs.find((shown) => shown.id === job(1).id)?.seen).toBe(true);
    client.settle(job(2).id, "gone");
    expect(client.getSnapshot().jobs.map((shown) => shown.id)).toEqual([job(1).id]);

    // A read that still has both, as one that was on its way would.
    await client.refresh();
    expect(client.getSnapshot().jobs.map((shown) => [shown.id, shown.seen])).toEqual([[job(1).id, true]]);
  });

  it("counts the times a result was asked to be shown, per kind", () => {
    const client = createAiJobsClient(env);
    client.reveal("suggest");
    client.reveal("suggest");
    client.reveal("analyze");
    expect(client.getSnapshot().reveals).toEqual({ suggest: 2, analyze: 1, import: 0 });
  });

  it("knows which results are on the screen", () => {
    const client = createAiJobsClient(env);
    expect(client.isShowing("suggest")).toBe(false);
    const stopOne = client.markShowing("suggest");
    const stopTwo = client.markShowing("suggest");
    expect(client.isShowing("suggest")).toBe(true);
    expect(client.isShowing("analyze")).toBe(false);
    stopOne();
    expect(client.isShowing("suggest")).toBe(true);
    stopTwo();
    expect(client.isShowing("suggest")).toBe(false);
  });

  it("tells subscribers when the state changes", async () => {
    const client = createAiJobsClient(env);
    const changed = vi.fn();
    const stop = client.subscribe(changed);
    await client.refresh();
    expect(changed).toHaveBeenCalled();
    changed.mockClear();
    stop();
    client.reveal("suggest");
    expect(changed).not.toHaveBeenCalled();
  });
});
