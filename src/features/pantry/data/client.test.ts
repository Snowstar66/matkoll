import { describe, expect, it } from "vitest";
import { isSiteGone, PantryDataError, pantryWriteError, siteGoneCode, siteGoneDetail } from "./client";

describe("pantryWriteError and isSiteGone", () => {
  it("give site_gone for a place that is gone (MK410), whatever the write", () => {
    for (const reason of ["add_failed", "set_failed", "restore_failed"]) {
      const error = pantryWriteError(reason, siteGoneCode);
      expect(error).toEqual(new PantryDataError(siteGoneDetail));
      expect(isSiteGone(error)).toBe(true);
    }
  });

  it("keep the reason and code for every other refusal", () => {
    const error = pantryWriteError("set_failed", "23503");
    expect(error).toEqual(new PantryDataError("set_failed 23503"));
    expect(isSiteGone(error)).toBe(false);
    expect(isSiteGone(new Error(siteGoneDetail))).toBe(false);
  });
});
