import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";
import { noteAiUsed, resetWarmUps, warmIntervalMs } from "@/server/ai/warm-limit";

// The Route Handler with the user check, the runs on their way, the AI port
// and after() stubbed: request checks, always 202 for a valid request, the
// warm-up only after the response, the limit per user and model, and the
// log line with its reason and time.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const hasAiRunOnItsWay = vi.fn<(userId: string) => boolean>();
vi.mock("@/features/pantry/server", () => ({ hasAiRunOnItsWay: (userId: string) => hasAiRunOnItsWay(userId) }));

// What the user's AI jobs say (Story 12.4): one is queued or running, or one began or ended
// within the warm-up limit. null when the table cannot be read.
const getAiJobActivity = vi.fn<(since: Date) => Promise<{ active: boolean; recent: boolean } | null>>();
vi.mock("@/features/ai-jobs/server", () => ({ getAiJobActivity: (since: Date) => getAiJobActivity(since) }));

type Options = { isBusy?: () => boolean | Promise<boolean> };
const warmUp = vi.fn<(kind: string, signal: AbortSignal, options?: Options) => Promise<unknown>>();
const warmUpKey = vi.fn<(kind: string) => string | null>();
const getAiService = vi.fn(() => ({ warmUp, warmUpKey }));
vi.mock("@/server/ai", () => ({ warmUpKinds: ["image", "text"], getAiService: () => getAiService() }));

/** The callbacks given to after(), run by the test once the response is there. */
let afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => afterCallbacks.push(callback) }));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, maxDuration } = await import("./route");

const url = "http://localhost:3100/api/ai/warm";
const model = "lmstudio:qwen/qwen3.6-35b-a3b";

function post(init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  return new Request(url, {
    method: "POST",
    body: init.body ?? JSON.stringify({ kind: "image" }),
    headers: { "content-type": "application/json", ...init.headers },
  });
}
const postKind = (kind: string) => post({ body: JSON.stringify({ kind }) });

async function runAfter() {
  const callbacks = afterCallbacks;
  afterCallbacks = [];
  for (const callback of callbacks) await callback();
}

let infos: ReturnType<typeof vi.spyOn>;
/** The ai_warm log lines, without the time. */
const logged = () =>
  (infos.mock.calls as unknown[][])
    .filter(([event]) => event === "ai_warm")
    .map(([, details]) => {
      const { durationMs, ...rest } = details as { durationMs: number };
      expect(typeof durationMs).toBe("number");
      return rest;
    });

beforeEach(() => {
  resetWarmUps();
  afterCallbacks = [];
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  hasAiRunOnItsWay.mockReset().mockReturnValue(false);
  getAiJobActivity.mockReset().mockResolvedValue({ active: false, recent: false });
  warmUp.mockReset().mockResolvedValue({ outcome: "ok" });
  warmUpKey.mockReset().mockReturnValue(model);
  getAiService.mockClear();
  infos = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/ai/warm", () => {
  it("has room for the warm-up's 50 s", () => {
    expect(maxDuration).toBe(60);
  });

  it.each(["image", "text"])("answers 202 without a body at once, and wakes %s only after the response", async (kind) => {
    const response = await POST(postKind(kind));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(warmUp).not.toHaveBeenCalled();

    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);
    const [calledKind, signal] = warmUp.mock.calls[0];
    expect(calledKind).toBe(kind);
    // Its own deadline within maxDuration, never the request's signal.
    expect(signal.aborted).toBe(false);
    expect(logged()).toEqual([{ kind, outcome: "ok" }]);
  });

  it("asks again whether a real call started, just before the model is called", async () => {
    await POST(post());
    await runAfter();
    const isBusy = warmUp.mock.calls[0][2]?.isBusy;
    expect(await isBusy?.()).toBe(false);
    getAiJobActivity.mockResolvedValue({ active: true, recent: true });
    expect(await isBusy?.()).toBe(true);
    // An analysis in this server process counts too (until Story 12.5 makes it a job).
    getAiJobActivity.mockResolvedValue({ active: false, recent: false });
    hasAiRunOnItsWay.mockReturnValue(true);
    expect(await isBusy?.()).toBe(true);
    // Not knowing is busy: the model is left alone.
    hasAiRunOnItsWay.mockReturnValue(false);
    getAiJobActivity.mockResolvedValue(null);
    expect(await isBusy?.()).toBe(true);
  });

  it("logs the port's result with its reason, never more", async () => {
    warmUp.mockResolvedValueOnce({ outcome: "unavailable", reason: "model_not_loaded" });
    await POST(post());
    await runAfter();
    expect(logged()).toEqual([{ kind: "image", outcome: "unavailable", reason: "model_not_loaded" }]);
  });

  it.each([
    ["the port throws", () => warmUp.mockRejectedValueOnce(new Error("unexpected"))],
    [
      "getAiService throws after the response",
      () => getAiService.mockReturnValueOnce({ warmUp, warmUpKey }).mockImplementationOnce(() => {
        throw new Error("env");
      }),
    ],
  ])("logs unavailable when %s, and never throws", async (_name, arrange) => {
    arrange();
    expect((await POST(post())).status).toBe(202);
    await expect(runAfter()).resolves.toBeUndefined();
    expect(logged()).toEqual([{ kind: "image", outcome: "unavailable", reason: "connection" }]);
  });

  it("answers 202 and logs unavailable when the AI settings cannot be read at all", async () => {
    getAiService.mockImplementationOnce(() => {
      throw new Error("env");
    });
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "image", outcome: "unavailable", reason: "connection" }]);
  });

  it("does nothing for a provider that is never cold", async () => {
    warmUpKey.mockReturnValue(null);
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "image", outcome: "skipped", reason: "provider" }]);
  });

  it("wakes a user's model at most once in three minutes, for both kinds, and each user on their own", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T12:00:00Z"), toFake: ["Date"] });
    await POST(post());
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);

    // The same model: text is held back too.
    vi.setSystemTime(Date.now() + warmIntervalMs - 1_000);
    expect((await POST(postKind("text"))).status).toBe(202);
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged().slice(1)).toEqual([
      { kind: "text", outcome: "skipped", reason: "limited" },
      { kind: "image", outcome: "skipped", reason: "limited" },
    ]);

    requireUserForRoute.mockResolvedValueOnce({ user: { id: "other", email: "other@example.com" } });
    await POST(post());
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + 1_000);
    await POST(postKind("text"));
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(3);
  });

  it("does not wake right after a real AI call of the user's finished", async () => {
    noteAiUsed("user");
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "image", outcome: "skipped", reason: "limited" }]);
  });

  it("does not wake right after an AI job of the user's began or ended, whichever server instance ran it (Story 12.4)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T12:00:00Z"), toFake: ["Date"] });
    getAiJobActivity.mockResolvedValue({ active: false, recent: true });
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "image", outcome: "skipped", reason: "limited" }]);
    // Asked about the window of the limit, counted back from now.
    expect(getAiJobActivity.mock.calls[0][0].getTime()).toBe(Date.now() - warmIntervalMs);

    // It does not use up the limit: with no job in the window the warm-up goes.
    getAiJobActivity.mockResolvedValue({ active: false, recent: false });
    await POST(post());
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);
  });

  it("does not wake when the AI jobs cannot be read", async () => {
    getAiJobActivity.mockResolvedValue(null);
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "image", outcome: "skipped", reason: "busy" }]);
  });

  it.each([
    ["an analysis or a lookup of the numbers", () => hasAiRunOnItsWay.mockReturnValue(true)],
    ["an AI job, queued or running", () => getAiJobActivity.mockResolvedValue({ active: true, recent: true })],
  ])("skips the warm-up while %s of the user's is on its way, without using up the limit", async (_name, busy) => {
    busy();
    expect((await POST(postKind("text"))).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(logged()).toEqual([{ kind: "text", outcome: "skipped", reason: "busy" }]);

    hasAiRunOnItsWay.mockReturnValue(false);
    getAiJobActivity.mockResolvedValue({ active: false, recent: false });
    await POST(postKind("text"));
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);
  });

  it("answers the 401 from requireUserForRoute without waking anything", async () => {
    requireUserForRoute.mockResolvedValue({ response: Response.json(fail("unauthorized"), { status: 401 }) });
    const response = await POST(post());
    expect(response.status).toBe(401);
    expect(afterCallbacks).toHaveLength(0);
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s with 403", async (_name, headers) => {
    const response = await POST(post({ headers }));
    expect(response.status).toBe(403);
    expect(requireUserForRoute).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it.each([
    ["an unknown kind", JSON.stringify({ kind: "video" })],
    ["no kind", "{}"],
    ["a body that is not JSON", "kind=image"],
  ])("refuses %s with 400 validation", async (_name, body) => {
    const response = await POST(post({ body }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refuses a body over 256 bytes with 413", async () => {
    const response = await POST(post({ body: JSON.stringify({ kind: "image", pad: "x".repeat(256) }) }));
    expect(response.status).toBe(413);
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refuses a body that is not JSON by content type with 415", async () => {
    const response = await POST(post({ headers: { "content-type": "text/plain" } }));
    expect(response.status).toBe(415);
    expect(afterCallbacks).toHaveLength(0);
  });
});
