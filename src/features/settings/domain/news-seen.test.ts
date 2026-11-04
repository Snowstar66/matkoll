import { describe, expect, it } from "vitest";
import { hasNewsSince } from "./news-seen";

describe("hasNewsSince", () => {
  it("is true when the newest entry is newer than what the device saw", () => {
    expect(hasNewsSince("2026-11-04", "2026-11-02")).toBe(true);
  });

  it("is true on a device that has never opened Nyheter", () => {
    expect(hasNewsSince("2026-11-04", null)).toBe(true);
  });

  it("is false once the newest entry has been seen", () => {
    expect(hasNewsSince("2026-11-04", "2026-11-04")).toBe(false);
    expect(hasNewsSince("2026-11-04", "2026-11-05")).toBe(false);
  });

  it("is false when the device cannot remember, so the dot never sticks", () => {
    expect(hasNewsSince("2026-11-04", undefined)).toBe(false);
  });
});
