import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail } from "@/lib/errors";

// The Route Handler with the user check, the runs on their way, the AI port
// and after() stubbed: request checks, always 202 for a valid request, the
// warm-up only after the response, and the limits per user and kind.

const requireUserForRoute = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUserForRoute: () => requireUserForRoute() }));

const hasAiRunOnItsWay = vi.fn<(userId: string) => boolean>();
vi.mock("@/features/pantry/server", () => ({ hasAiRunOnItsWay: (userId: string) => hasAiRunOnItsWay(userId) }));

const isSuggesting = vi.fn<(userId: string) => boolean>();
vi.mock("@/features/suggestions/server", () => ({ isSuggesting: (userId: string) => isSuggesting(userId) }));

const warmUp = vi.fn<(kind: string, signal: AbortSignal) => Promise<string>>();
vi.mock("@/server/ai", () => ({
  warmUpKinds: ["image", "text"],
  getAiService: () => ({ warmUp: (kind: string, signal: AbortSignal) => warmUp(kind, signal) }),
}));

/** The callbacks given to after(), run by the test once the response is there. */
let afterCallbacks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (callback: () => Promise<void>) => afterCallbacks.push(callback) }));

vi.mock("@/server/env", () => ({ env: { SITE_URL: "http://localhost:3100" } }));

const { POST, maxDuration } = await import("./route");
const { resetWarmUps, warmIntervalMs } = await import("./warm-limit");

const url = "http://localhost:3100/api/ai/warm";

function post(init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  return new Request(url, {
    method: "POST",
    body: init.body ?? JSON.stringify({ kind: "image" }),
    headers: { "content-type": "application/json", ...init.headers },
  });
}

async function runAfter() {
  const callbacks = afterCallbacks;
  afterCallbacks = [];
  for (const callback of callbacks) await callback();
}

let infos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetWarmUps();
  afterCallbacks = [];
  requireUserForRoute.mockReset().mockResolvedValue({ user: { id: "user", email: "pontus@example.com" } });
  hasAiRunOnItsWay.mockReset().mockReturnValue(false);
  isSuggesting.mockReset().mockReturnValue(false);
  warmUp.mockReset().mockResolvedValue("ok");
  infos = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/ai/warm", () => {
  it("has room for the warm-up's 30 s", () => {
    expect(maxDuration).toBe(60);
  });

  it.each(["image", "text"])("answers 202 without a body at once, and wakes %s only after the response", async (kind) => {
    const response = await POST(post({ body: JSON.stringify({ kind }) }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(warmUp).not.toHaveBeenCalled();

    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);
    expect(warmUp.mock.calls[0][0]).toBe(kind);
    expect(warmUp.mock.calls[0][1].aborted).toBe(false);
    expect(infos).toHaveBeenCalledWith("ai_warm", { kind, outcome: "ok" });
  });

  it("logs the port's answer: skipped on a provider that is never cold, unavailable when LM Studio is off", async () => {
    warmUp.mockResolvedValueOnce("skipped");
    expect((await POST(post({ body: JSON.stringify({ kind: "text" }) }))).status).toBe(202);
    await runAfter();
    expect(infos).toHaveBeenCalledWith("ai_warm", { kind: "text", outcome: "skipped" });

    warmUp.mockRejectedValueOnce(new Error("unexpected"));
    expect((await POST(post())).status).toBe(202);
    await runAfter();
    expect(infos).toHaveBeenCalledWith("ai_warm", { kind: "image", outcome: "unavailable" });
  });

  it("wakes the same kind at most once in five minutes per user, and each kind and user on its own", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T12:00:00Z"), toFake: ["Date"] });
    expect((await POST(post())).status).toBe(202);
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + warmIntervalMs - 1_000);
    expect((await POST(post())).status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(infos).toHaveBeenCalledWith("ai_warm", { kind: "image", outcome: "skipped" });

    // Another kind, and another user, are not held back.
    expect((await POST(post({ body: JSON.stringify({ kind: "text" }) }))).status).toBe(202);
    requireUserForRoute.mockResolvedValueOnce({ user: { id: "other", email: "other@example.com" } });
    expect((await POST(post())).status).toBe(202);
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(3);

    vi.setSystemTime(Date.now() + 1_000);
    expect((await POST(post())).status).toBe(202);
    await runAfter();
    expect(warmUp).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["an analysis or a lookup of the numbers", () => hasAiRunOnItsWay.mockReturnValue(true)],
    ["AI-förslag", () => isSuggesting.mockReturnValue(true)],
  ])("skips the warm-up while %s of the user's is on its way, without using up the limit", async (_name, busy) => {
    busy();
    const response = await POST(post({ body: JSON.stringify({ kind: "text" }) }));
    expect(response.status).toBe(202);
    expect(afterCallbacks).toHaveLength(0);
    expect(infos).toHaveBeenCalledWith("ai_warm", { kind: "text", outcome: "skipped" });
    expect(hasAiRunOnItsWay.mock.calls.concat(isSuggesting.mock.calls)[0]).toEqual(["user"]);

    hasAiRunOnItsWay.mockReturnValue(false);
    isSuggesting.mockReturnValue(false);
    await POST(post({ body: JSON.stringify({ kind: "text" }) }));
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
