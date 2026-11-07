import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("hide with storage blocked", () => {
  it("still hides for this visit", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    hideToday("2030-01-01");
    spy.mockRestore();
    expect(isHiddenToday("2030-01-01")).toBe(true);
    expect(isHiddenToday("2030-01-02")).toBe(false);
  });
});
