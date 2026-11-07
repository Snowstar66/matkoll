import { beforeEach, describe, expect, it } from "vitest";
import { hideToday, isHiddenToday } from "./hide";

describe("hide until tomorrow", () => {
  beforeEach(() => localStorage.clear());

  it("hides on the day and shows again the next day", () => {
    expect(isHiddenToday("2026-11-08")).toBe(false);
    hideToday("2026-11-08");
    expect(isHiddenToday("2026-11-08")).toBe(true);
    expect(isHiddenToday("2026-11-09")).toBe(false);
  });
});
