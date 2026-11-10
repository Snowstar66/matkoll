import { describe, expect, it } from "vitest";
import { compoundHead, nameCandidates } from "./names";

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

describe("compound fallback", () => {
  it("cuts a compound down to an allowlisted head noun, last", () => {
    expect(nameCandidates("pankoströbröd")).toEqual(["pankoströbröd", "ströbröd"]);
    expect(nameCandidates("caesardressing")).toEqual(["caesardressing", "dressing"]);
    expect(nameCandidates("tryffelolja")).toEqual(["tryffelolja", "olja"]);
    expect(nameCandidates("vitlöksmajonnäs")).toEqual(["vitlöksmajonnäs", "majonnäs"]);
    expect(nameCandidates("kycklingbuljong")).toEqual(["kycklingbuljong", "buljong"]);
    expect(nameCandidates("hallonsylt")).toEqual(["hallonsylt", "sylt"]);
    expect(nameCandidates("surdegsbröd")).toEqual(["surdegsbröd", "bröd"]);
    expect(nameCandidates("cheddarost")).toEqual(["cheddarost", "ost"]);
    expect(nameCandidates("chorizokorv")).toEqual(["chorizokorv", "korv"]);
    expect(nameCandidates("honungssenap")).toEqual(["honungssenap", "senap"]);
    expect(nameCandidates("rödpesto")).toEqual(["rödpesto", "pesto"]);
  });
  it("cuts shrimp compounds down to räkor and räka", () => {
    expect(nameCandidates("jätteräka")).toEqual(["jätteräka", "räka"]);
    expect(nameCandidates("tigerräkor")).toEqual(["tigerräkor", "räkor"]);
  });
  it("drops a remark in brackets", () => {
    expect(nameCandidates("ägg (stora)")).toEqual(["ägg (stora)", "ägg"]);
  });
  it("takes the longest head: ströbröd before bröd", () => {
    expect(compoundHead("pankoströbröd")).toBe("ströbröd");
    expect(compoundHead("surdegsbröd")).toBe("bröd");
  });
  it("uses the last word, after the descriptive words", () => {
    expect(nameCandidates("färsk caesardressing")).toEqual(["färsk caesardressing", "caesardressing", "dressing"]);
    expect(nameCandidates("god tryffelolja")).toEqual(["god tryffelolja", "tryffelolja", "olja"]);
  });
  it("never cuts pasta, mjöl, socker or other endings that change the food", () => {
    for (const word of ["chipotlepasta", "currypasta", "rågmjöl", "vaniljsocker", "sojafärs", "laxfilé", "havregrädde", "jordnötssmör", "kokosyoghurt", "tomatsås", "svartris"]) {
      expect(nameCandidates(word)).toEqual([word]);
      expect(compoundHead(word)).toBeNull();
    }
  });
  it("needs a front part of three letters and an ending of three", () => {
    for (const word of ["kost", "ost", "rost", "gäst", "frost", "bröd", "korv", "olja", "sylt"]) {
      expect(compoundHead(word)).toBeNull();
    }
    expect(compoundHead("getost")).toBe("ost");
  });
});
