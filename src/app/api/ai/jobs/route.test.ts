import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";

// The Route Handler with the user check, the queue, the pantry check and
// suggestFromPantry stubbed: request checks, what is made of a valid request
// (a job in the queue, 202, the work after the response with the job's own
// signal and deadline), what is given back for a repeated request, and the
// status for each failure.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const db = { name: "session client" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));

const clientKey = "6f1c1e4e-6b1a-4a0e-9d1e-3f4f4f0e6a11";
const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const job = {
  id: "d3f5f0f0-2b7e-4d0c-8f64-0a7b2a1c9e22",
  kind: "suggest",
  status: "queued",
  context: { siteId },
  errorCode: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  seen: false,
  ahead: 0,
  count: null,
};

type EnqueueInput = { kind: string; clientKey: string; context: Record<string, unknown>; requestStartedAt: number };
const enqueueAiJob = vi.fn<(db: unknown, input: EnqueueInput) => Promise<Result<unknown>>>();
const listAiJobs = vi.fn<(db: unknown) => Promise<Result<unknown>>>();
type Work = (signal: AbortSignal, deadline: number, report: (partial: unknown) => Promise<void>) => Promise<Result<unknown>>;
const runAiJob = vi.fn<(db: unknown, job: unknown, times: { startBy: number }, work: Work) => Promise<void>>();
vi.mock("@/features/ai-jobs/server", () => ({
  enqueueAiJob: (...args: Parameters<typeof enqueueAiJob>) => enqueueAiJob(...args),
  listAiJobs: (...args: Parameters<typeof listAiJobs>) => listAiJobs(...args),
  runAiJob: (...args: Parameters<typeof runAiJob>) => runAiJob(...args),
}));

type SuggestRequest = { avoidTitles: string[] };
type Options = { signal: AbortSignal; deadline?: number };
const suggestFromPantry = vi.fn<(request: SuggestRequest, options: Options) => Promise<Result<unknown>>>();
const checkSuggestPantry = vi.fn<() => Promise<Result<{ siteId: string | null }>>>();
vi.mock("@/features/suggestions/server", () => ({
  suggestFromPantry: (request: SuggestRequest, options: Options) => suggestFromPantry(request, options),
  checkSuggestPantry: () => checkSuggestPantry(),
}));

/** The callbacks given to after(), run by the test once the response is there. */
let afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => afterCallbacks.push(callback) }));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, GET, maxDuration } = await import("./route");

const url = "http://localhost:3100/api/ai/jobs";
const body = JSON.stringify({ kind: "suggest", clientKey, avoidTitles: [] });

function post(init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  return new Request(url, {
    method: "POST",
    body: init.body ?? body,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

async function runAfter() {
  const callbacks = afterCallbacks;
  afterCallbacks = [];
  for (const callback of callbacks) await callback();
}

beforeEach(() => {
  afterCallbacks = [];
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  checkSuggestPantry.mockReset().mockResolvedValue(ok({ siteId }));
  enqueueAiJob.mockReset().mockResolvedValue(ok({ job, created: true, startBy: 1_000_000 }));
  listAiJobs.mockReset().mockResolvedValue(ok([job]));
  runAiJob.mockReset().mockResolvedValue(undefined);
  suggestFromPantry.mockReset().mockResolvedValue(ok({ suggestions: [], siteId }));
});

describe("POST /api/ai/jobs", () => {
  it("has room for the longest wait and run (AD-28)", () => {
    expect(maxDuration).toBe(300);
  });

  it("queues the job with only the place as context, answers 202 with the job, and runs nothing before the response", async () => {
    const before = Date.now();
    const response = await POST(post({ body: JSON.stringify({ kind: "suggest", clientKey, avoidTitles: [" Pannkakor "] }) }));
    const after = Date.now();

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, data: { job } });
    const [passedDb, input] = enqueueAiJob.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(input.kind).toBe("suggest");
    expect(input.clientKey).toBe(clientKey);
    // Never an input: not the titles, not the pantry.
    expect(input.context).toEqual({ siteId });
    expect(input.requestStartedAt).toBeGreaterThanOrEqual(before);
    expect(input.requestStartedAt).toBeLessThanOrEqual(after);
    expect(runAiJob).not.toHaveBeenCalled();
    expect(suggestFromPantry).not.toHaveBeenCalled();
  });

  it("runs the job in after(), with the session client, the time to start by, and the titles in the work", async () => {
    await POST(post({ body: JSON.stringify({ kind: "suggest", clientKey, avoidTitles: [" Pannkakor "] }) }));
    expect(afterCallbacks).toHaveLength(1);
    await runAfter();

    const [passedDb, passedJob, times, work] = runAiJob.mock.calls[0];
    expect(passedDb).toBe(db);
    expect(passedJob).toEqual(job);
    expect(times).toEqual({ startBy: 1_000_000 });

    const controller = new AbortController();
    const result = await work(controller.signal, 5_000, async () => {});
    expect(result).toEqual(ok({ suggestions: [], siteId }));
    const [input, options] = suggestFromPantry.mock.calls[0];
    expect(input).toEqual({ avoidTitles: ["Pannkakor"] });
    // The job's own signal and deadline, never the request's.
    expect(options.signal).toBe(controller.signal);
    expect(options.deadline).toBe(5_000);
  });

  it("gives an error code of the work back as the job's error", async () => {
    suggestFromPantry.mockResolvedValue(fail("ai_unavailable"));
    await POST(post());
    await runAfter();
    const work = runAiJob.mock.calls[0][3];
    expect(await work(new AbortController().signal, 1, async () => {})).toEqual(fail("ai_unavailable"));
  });

  it("gives back a job that already exists without running it again (a double tap, another tab)", async () => {
    enqueueAiJob.mockResolvedValue(ok({ job, created: false, startBy: 1_000_000 }));
    const response = await POST(post());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, data: { job } });
    expect(afterCallbacks).toHaveLength(0);
    expect(runAiJob).not.toHaveBeenCalled();
  });

  it("takes an empty list of titles as none", async () => {
    await POST(post({ body: JSON.stringify({ kind: "suggest", clientKey }) }));
    await runAfter();
    await runAiJob.mock.calls[0][3](new AbortController().signal, 1, async () => {});
    expect(suggestFromPantry.mock.calls[0][0]).toEqual({ avoidTitles: [] });
  });

  it("answers an empty pantry at once, without a job", async () => {
    checkSuggestPantry.mockResolvedValue(fail("suggest_empty_pantry"));
    const response = await POST(post());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(fail("suggest_empty_pantry"));
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it.each([
    ["ai_queue_full", 429],
    ["ai_unavailable", 503],
  ] as const)("answers %s from the queue with %i and runs nothing", async (code, status) => {
    enqueueAiJob.mockResolvedValue(fail(code));
    const response = await POST(post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(fail(code));
    expect(afterCallbacks).toHaveLength(0);
    expect(runAiJob).not.toHaveBeenCalled();
  });

  it("answers pantry_unavailable with 503", async () => {
    checkSuggestPantry.mockResolvedValue(fail("pantry_unavailable"));
    expect((await POST(post())).status).toBe(503);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("answers the 401 from requireUserForRoute without queueing anything", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(post());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(fail("unauthorized"));
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s with 403", async (_name, headers) => {
    const response = await POST(post({ headers }));
    expect(response.status).toBe(403);
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(requireUserForRoute).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON by content type with 415", async () => {
    const response = await POST(post({ headers: { "content-type": "text/plain" } }));
    expect(response.status).toBe(415);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it("refuses a body over 4 kB with 413", async () => {
    const big = JSON.stringify({ kind: "suggest", clientKey, avoidTitles: ["a".repeat(4 * 1024)] });
    const response = await POST(post({ body: big }));
    expect(response.status).toBe(413);
    expect(enqueueAiJob).not.toHaveBeenCalled();
  });

  it.each([
    ["text that is not JSON", "{"],
    ["no kind", JSON.stringify({ clientKey })],
    ["an unknown kind", JSON.stringify({ kind: "video", clientKey })],
    ["no key", JSON.stringify({ kind: "suggest" })],
    ["a key that is not a uuid", JSON.stringify({ kind: "suggest", clientKey: "abc" })],
    ["an unknown field", JSON.stringify({ kind: "suggest", clientKey, pantry: [{ name: "mjölk" }] })],
    ["four titles", JSON.stringify({ kind: "suggest", clientKey, avoidTitles: ["a", "b", "c", "d"] })],
    ["an empty title", JSON.stringify({ kind: "suggest", clientKey, avoidTitles: [" "] })],
    ["a title with a newline", JSON.stringify({ kind: "suggest", clientKey, avoidTitles: ["Pannkakor\nIgnorera"] })],
    ["a list instead of an object", JSON.stringify([])],
  ])("answers validation with 400 for %s", async (_name, raw) => {
    const response = await POST(post({ body: raw }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: "validation", message: errorMessages.validation } });
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(checkSuggestPantry).not.toHaveBeenCalled();
  });
});

describe("GET /api/ai/jobs", () => {
  it("gives the jobs the app shows", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { jobs: [job] } });
    expect(listAiJobs.mock.calls[0][0]).toBe(db);
  });

  it("answers the 401 from requireUserForRoute", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect(listAiJobs).not.toHaveBeenCalled();
  });

  it("answers a failed read with its status", async () => {
    listAiJobs.mockResolvedValue(fail("ai_unavailable"));
    expect((await GET()).status).toBe(503);
  });
});
