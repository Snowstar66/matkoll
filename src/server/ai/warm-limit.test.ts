import { beforeEach, describe, expect, it } from "vitest";
import { claimWarmUp, noteAiUsed, resetWarmUps, warmIntervalMs } from "./warm-limit";

// Story 12.2: at most one warm-up per user and model in three minutes, and
// none within three minutes of a real AI call of the user's.

const now = Date.parse("2026-10-28T12:00:00Z");
const model = "lmstudio:qwen/qwen3.6-35b-a3b";

beforeEach(() => {
  resetWarmUps();
});

describe("claimWarmUp", () => {
  it("is three minutes, less than the five after which the model is cold", () => {
    expect(warmIntervalMs).toBe(3 * 60_000);
  });

  it("lets a user wake a model once in the interval, and again after it", () => {
    expect(claimWarmUp("user", model, now)).toBe(true);
    expect(claimWarmUp("user", model, now + warmIntervalMs - 1)).toBe(false);
    expect(claimWarmUp("user", model, now + warmIntervalMs)).toBe(true);
  });

  it("keeps users and models apart", () => {
    expect(claimWarmUp("user", model, now)).toBe(true);
    expect(claimWarmUp("other", model, now)).toBe(true);
    expect(claimWarmUp("user", "lmstudio:another-model", now)).toBe(true);
  });

  it("holds the warm-up off within the interval after a real AI call, whatever the model", () => {
    noteAiUsed("user", now);
    expect(claimWarmUp("user", model, now + 60_000)).toBe(false);
    expect(claimWarmUp("other", model, now + 60_000)).toBe(true);
    expect(claimWarmUp("user", model, now + warmIntervalMs)).toBe(true);
  });
});
