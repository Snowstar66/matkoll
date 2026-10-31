import { afterEach, describe, expect, it, vi } from "vitest";
import { reportUsage, withUsageSink } from "./usage";

const usage = { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 5 };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("reportUsage", () => {
  it("hands the usage to the sink of the running call", async () => {
    const sink = vi.fn();
    await withUsageSink(sink, () => reportUsage(usage));
    expect(sink).toHaveBeenCalledWith(usage);
  });

  it("does nothing without a sink", async () => {
    await expect(reportUsage(usage)).resolves.toBeUndefined();
  });

  it("never throws when the sink fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await withUsageSink(() => Promise.reject(new Error("db down")), () => reportUsage(usage));
    expect(error).toHaveBeenCalledWith("ai_usage_unrecorded");
  });

  it("gives up a hung sink after 3 s, so the answer is not held up", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const done = withUsageSink(() => new Promise<void>(() => {}), () => reportUsage(usage));
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(done).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("ai_usage_unrecorded");
  });
});
