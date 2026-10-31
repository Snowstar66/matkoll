import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { withInputValidation, type LocateItemsInput, type RunOptions } from "@/server/ai/service";

// locatePlaceItems (Story 6.6, 12.5) with the AI port's mock behind its input
// check, as with AI_PROVIDER=mock: the second step of a photo's job.

const ai = withInputValidation(createMockAiService());
const locateItems = vi.fn<(input: LocateItemsInput, signal: AbortSignal, options?: RunOptions) => ReturnType<typeof ai.locateItems>>();
vi.mock("@/features/settings/server", () => ({ getAiServiceForUser: async () => ({ locateItems }) }));

const { locatePlaceItems } = await import("./locate-place-items");

const kyl = {
  data: new Uint8Array(readFileSync(new URL("../../../../tests/fixtures/ai/kyl.png", import.meta.url))),
  mediaType: "image/png",
};
const labels = ["Mellanmjölk 1,5 %", "Vispgrädde 3 dl", "Smör 500 g", "Ägg", "Gurka", "Ketchup"];
const signal = () => new AbortController().signal;

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

  it("passes the AI's error on", async () => {
    locateItems.mockResolvedValueOnce(fail("ai_invalid"));
    expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(fail("ai_invalid"));
  });

  it("answers validation for labels the port does not take", async () => {
    expect(await locatePlaceItems({ image: kyl, labels: ["Mjölk\nSmör"] }, { signal: signal() })).toEqual(fail("validation"));
  });

  it("answers ai_unavailable when the job is stopped while the AI is asked", async () => {
    const signals = holdLocate();
    const controller = new AbortController();
    const running = locatePlaceItems({ image: kyl, labels }, { signal: controller.signal });
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    controller.abort();
    expect(await running).toEqual(fail("ai_unavailable"));
  });
});
