import { describe, expect, it } from "vitest";
import { isQuickDish, quickMaxMinutes } from "./quick-dish";

describe("quick dishes", () => {
  it("are at most 30 minutes, and a dish with no time is not quick", () => {
    expect(quickMaxMinutes).toBe(30);
    expect(isQuickDish(30)).toBe(true);
    expect(isQuickDish(31)).toBe(false);
    expect(isQuickDish(null)).toBe(false);
    expect(isQuickDish(0)).toBe(false);
  });
});
