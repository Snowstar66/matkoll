import { describe, expect, it } from "vitest";
import { bestSavingFirst } from "./offer";
import { offerSaving, parsePrice, regularPriceText, savingKronor, savingText, type IcaMechanics } from "./offer-saving";

const fixed = (changes: Partial<IcaMechanics>): IcaMechanics => ({
  benefitType: "FIXED",
  quantity: 1,
  unitSign: "kr/kg",
  value1: "89",
  value2: "",
  ...changes,
});

describe("parsePrice", () => {
  it("reads plain prices only", () => {
    expect(parsePrice("111,90")).toBe(111.9);
    expect(parsePrice(" 25 ")).toBe(25);
    for (const bad of ["", null, undefined, "0", "Ord.pris 111:90 kr.", "15:00/l", "-5", "1e3"]) expect(parsePrice(bad)).toBeNull();
  });
});

describe("offerSaving", () => {
  it("compares a price per kg or item with the regular price", () => {
    expect(offerSaving(fixed({}), "111,90")).toEqual({ regularPrice: 111.9, savingPercent: 20 });
    expect(offerSaving(fixed({ unitSign: "kr/st", value1: "25" }), "31,90")).toEqual({ regularPrice: 31.9, savingPercent: 22 });
  });

  it("divides '2 för 50' by the quantity", () => {
    const multi = fixed({ quantity: 2, unitSign: ":-", value1: "2 för", value2: "50" });
    expect(offerSaving(multi, "31,90")).toEqual({ regularPrice: 31.9, savingPercent: 22 });
  });

  it("has a regular price but no saving when the units cannot be compared or it is not cheaper", () => {
    expect(offerSaving(fixed({ unitSign: "kr/l" }), "111,90")).toEqual({ regularPrice: 111.9, savingPercent: null });
    expect(offerSaving(fixed({ quantity: 3, unitSign: ":-", value1: "3 för", value2: "x" }), "10")).toEqual({ regularPrice: 10, savingPercent: null });
    expect(offerSaving(fixed({ value1: "120" }), "111,90")).toEqual({ regularPrice: 111.9, savingPercent: null });
    expect(offerSaving(fixed({ value1: "111,90" }), "111,90").savingPercent).toBeNull();
  });

  it("has no saving without a regular price", () => {
    expect(offerSaving(fixed({}), "")).toEqual({ regularPrice: null, savingPercent: null });
    expect(offerSaving(fixed({}), undefined)).toEqual({ regularPrice: null, savingPercent: null });
    expect(offerSaving(null, "50")).toEqual({ regularPrice: 50, savingPercent: null });
  });

  it("reads percent off and 'Köp 3 betala för 2' without a regular price", () => {
    expect(offerSaving({ benefitType: "PERCENT", quantity: 1, unitSign: "%", value1: "25" }, null)).toEqual({ regularPrice: null, savingPercent: 25 });
    expect(offerSaving({ benefitType: "PERCENT", unitSign: "%", value1: "0" }, null).savingPercent).toBeNull();
    expect(offerSaving({ benefitType: "PERCENT", unitSign: "%", value1: "100" }, null).savingPercent).toBeNull();
    const multi = { benefitType: "MULTI", quantity: 3, unitSign: "", value1: "Köp 3", value2: "betala för 2" };
    expect(offerSaving(multi, null).savingPercent).toBe(33);
    expect(offerSaving({ ...multi, value2: "betala för 3" }, null).savingPercent).toBeNull();
    expect(offerSaving({ ...multi, value1: "Köp 2 st" }, null).savingPercent).toBeNull();
  });
});

describe("texts", () => {
  it("writes the regular price and the saving, or nothing", () => {
    expect(regularPriceText(111.9)).toBe("Ord. 111,90 kr");
    expect(regularPriceText(30)).toBe("Ord. 30 kr");
    expect(savingText({ regularPrice: 111.9, savingPercent: 20 })).toBe("Ord. 111,90 kr · spara 20 %");
    expect(savingText({ regularPrice: null, savingPercent: 33 })).toBe("spara 33 %");
    expect(savingText({ regularPrice: 20, savingPercent: null })).toBe("Ord. 20 kr");
    expect(savingText({ regularPrice: null, savingPercent: null })).toBe("");
  });

  it("states the saving in kronor", () => {
    expect(savingKronor(111.9, 89)).toBe(22.9);
    expect(savingKronor(10, 12)).toBeNull();
  });
});

describe("bestSavingFirst", () => {
  it("puts the biggest saving first and unknown last, keeping the page's order among equals", () => {
    const list = [
      { id: "a", savingPercent: null },
      { id: "b", savingPercent: 20 },
      { id: "c", savingPercent: 40 },
      { id: "d", savingPercent: null },
      { id: "e", savingPercent: 20 },
    ];
    expect(bestSavingFirst(list).map((o) => o.id)).toEqual(["c", "b", "e", "a", "d"]);
  });
});
