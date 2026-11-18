import { describe, expect, it } from "vitest";
import { tourSeenCookie, tourSeenCookieText } from "./tour-cookie";

describe("tourSeenCookieText", () => {
  it("is a year-long cookie for the whole app with the person's id", () => {
    expect(tourSeenCookieText("abc-123", false)).toBe(`${tourSeenCookie}=abc-123; path=/; max-age=31536000; samesite=lax`);
  });
  it("is secure on https", () => {
    expect(tourSeenCookieText("abc", true)).toMatch(/; secure$/);
  });
});
