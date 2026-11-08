import { describe, expect, it } from "vitest";
import { nameCandidates } from "./names";

describe("nameCandidates", () => {
  it("starts with the exact name", () => {
    expect(nameCandidates("fransyska")).toEqual(["fransyska"]);
  });
  it("strips descriptive words, then falls back to the last word", () => {
    expect(nameCandidates("färsk hackad persilja")).toEqual(["färsk hackad persilja", "persilja"]);
    expect(nameCandidates("riven ost")).toEqual(["riven ost", "ost"]);
  });
  it("tries the last word of a multi-word name", () => {
    expect(nameCandidates("fast potatis")).toEqual(["fast potatis", "potatis"]);
    expect(nameCandidates("gul fast potatis")).toEqual(["gul fast potatis", "potatis"]);
  });
  it("keeps the stripped name when it still has several words", () => {
    expect(nameCandidates("kokta röda linser")).toEqual(["kokta röda linser", "röda linser", "linser"]);
  });
  it("handles empty input", () => {
    expect(nameCandidates("  ")).toEqual([]);
  });
});
