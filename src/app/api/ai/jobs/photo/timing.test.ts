import { afterEach, describe, expect, it, vi } from "vitest";
import { clientMs, logAnalyzeTiming } from "./timing";

// Kylfoto A: the analyze_timing log takes only whole milliseconds the client
// could have measured, and logs the steps that were reached.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clientMs", () => {
  it.each([
    ["0", 0],
    ["310", 310],
    ["60000", 60_000],
  ])("takes %s", (value, ms) => {
    expect(clientMs(value)).toBe(ms);
  });

  it.each([null, undefined, "", "-1", "1.5", "abc", "60001", "1234567", " 12"])("leaves out %s", (value) => {
    expect(clientMs(value)).toBeUndefined();
  });
});

describe("logAnalyzeTiming", () => {
  it("logs the steps that were reached, and leaves out the rest", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logAnalyzeTiming({ uploadMs: 40, queueMs: 15, modelMs: undefined, side: 1600, bytes: 420_000, outcome: "ai_unavailable" });
    expect(info).toHaveBeenCalledWith("analyze_timing", {
      uploadMs: 40,
      queueMs: 15,
      side: 1600,
      bytes: 420_000,
      outcome: "ai_unavailable",
    });
  });
});
