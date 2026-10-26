import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { withInputValidation, type LocateItemsInput, type RunOptions } from "@/server/ai/service";

// locatePlaceItems (Story 6.6) with the AI port's mock behind its input
// check, as with AI_PROVIDER=mock, and a stubbed user, and the run lock it
// shares with analyzePlace (ai-runs.ts): an analysis wins over a lookup, and
// a newer lookup over an older one.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));

const ai = withInputValidation(createMockAiService());
const locateItems = vi.fn<(input: LocateItemsInput, signal: AbortSignal, options?: RunOptions) => ReturnType<typeof ai.locateItems>>();
vi.mock("@/server/ai", () => ({ getAiService: () => ({ locateItems }) }));

const { locatePlaceItems } = await import("./locate-place-items");
const { finishRun, startRun } = await import("./ai-runs");

const kyl = {
  data: new Uint8Array(readFileSync(new URL("../../../../tests/fixtures/ai/kyl.png", import.meta.url))),
  mediaType: "image/png",
};
const labels = ["Mellanmjölk 1,5 %", "Vispgrädde 3 dl", "Smör 500 g", "Ägg", "Gurka", "Ketchup"];
const signal = () => new AbortController().signal;
const user = (id = "user") => ok({ id, email: "pontus@example.com" });

/** Holds the AI call until it is aborted, so another run comes while it is on its way. */
function holdLocate() {
  const signals: AbortSignal[] = [];
  locateItems.mockImplementationOnce(
    (_input, callSignal) =>
      new Promise((resolve) => {
        signals.push(callSignal);
        callSignal.addEventListener("abort", () => resolve(fail("ai_unavailable")), { once: true });
      }),
  );
  return signals;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  requireUser.mockReset().mockResolvedValue(user());
  locateItems.mockReset().mockImplementation(ai.locateItems);
});

describe("locatePlaceItems", () => {
  it("sends the photo and the labels to the AI with the deadline, and returns the points", async () => {
    const deadline = Date.now() + 50_000;
    const result = await locatePlaceItems({ image: kyl, labels }, { signal: signal(), deadline });
    expect(locateItems.mock.calls[0][0]).toEqual({ image: kyl, labels });
    expect(locateItems.mock.calls[0][2]).toEqual({ deadline });
    expect(result).toEqual(
      ok({
        positions: [
          { n: 1, x: 193, y: 193 },
          { n: 2, x: 432, y: 225 },
          { n: 3, x: 661, y: 258 },
          { n: 4, x: 291, y: 567 },
          { n: 5, x: 694, y: 583 },
          { n: 6, x: 146, y: 813 },
        ],
      }),
    );
  });

  it("logs how many items got no point, never the labels or the points", async () => {
    locateItems.mockResolvedValueOnce(ok({ positions: [{ n: 2, x: 1, y: 1 }], invalid: 1 }));
    expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(ok({ positions: [{ n: 2, x: 1, y: 1 }] }));
    expect(console.info).toHaveBeenCalledWith("locate_positions_missing", { count: 5 });
    const logged = JSON.stringify([vi.mocked(console.info).mock.calls, vi.mocked(console.error).mock.calls]);
    expect(logged).not.toContain("Mellanmjölk");
  });

  it("gives unauthorized without asking the AI", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(fail("unauthorized"));
    expect(locateItems).not.toHaveBeenCalled();
  });

  it("passes the AI's error on", async () => {
    locateItems.mockResolvedValueOnce(fail("ai_invalid"));
    expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(fail("ai_invalid"));
  });

  it("answers validation for labels the port does not take", async () => {
    expect(await locatePlaceItems({ image: kyl, labels: ["Mjölk\nSmör"] }, { signal: signal() })).toEqual(fail("validation"));
  });

  it("answers ai_superseded at once, without asking the AI, while an analysis of the same user is on its way", async () => {
    const analysis = startRun("user", "analyze")!;
    try {
      expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(fail("ai_superseded"));
      expect(locateItems).not.toHaveBeenCalled();
      // The analysis goes on.
      expect(analysis.signal.aborted).toBe(false);
    } finally {
      finishRun("user", analysis);
    }
    // Once it is done, a lookup runs again.
    expect((await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).ok).toBe(true);
  });

  it("is stopped by a new analysis of the same user, and answers ai_superseded", async () => {
    const signals = holdLocate();
    const running = locatePlaceItems({ image: kyl, labels }, { signal: signal() });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    const analysis = startRun("user", "analyze")!;
    expect(await running).toEqual(fail("ai_superseded"));
    expect(signals[0].aborted).toBe(true);
    expect(console.info).toHaveBeenCalledWith("locate_superseded");
    finishRun("user", analysis);
  });

  it("stops an older lookup of the same user, but not one of another user", async () => {
    const signals = holdLocate();
    const older = locatePlaceItems({ image: kyl, labels }, { signal: signal() });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    const othersSignals = holdLocate();
    requireUser.mockResolvedValueOnce(user("other"));
    const others = locatePlaceItems({ image: kyl, labels }, { signal: signal() });
    await vi.waitFor(() => expect(othersSignals).toHaveLength(1));

    expect((await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).ok).toBe(true);
    expect(await older).toEqual(fail("ai_superseded"));
    expect(othersSignals[0].aborted).toBe(false);
    // The other user's lookup ends with its own request.
    const stop = startRun("other", "analyze")!;
    expect(await others).toEqual(fail("ai_superseded"));
    finishRun("other", stop);
  });

  it("answers ai_unavailable, not ai_superseded, when the request itself went away", async () => {
    const signals = holdLocate();
    const controller = new AbortController();
    const running = locatePlaceItems({ image: kyl, labels }, { signal: controller.signal });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort();
    expect(await running).toEqual(fail("ai_unavailable"));
  });
});

describe("the run lock", () => {
  it("lets an analysis stop any run, a lookup stop only a lookup, and frees the user only for the run that has it", () => {
    const lookup = startRun("lock", "locate")!;
    const newer = startRun("lock", "locate")!;
    expect(lookup.signal.aborted).toBe(true);
    const analysis = startRun("lock", "analyze")!;
    expect(newer.signal.aborted).toBe(true);
    expect(startRun("lock", "locate")).toBeNull();
    expect(analysis.signal.aborted).toBe(false);
    // An older run that ends does not free the user.
    finishRun("lock", newer);
    expect(startRun("lock", "locate")).toBeNull();
    const second = startRun("lock", "analyze")!;
    expect(analysis.signal.aborted).toBe(true);
    finishRun("lock", second);
    const free = startRun("lock", "locate");
    expect(free).not.toBeNull();
    finishRun("lock", free!);
  });
});
