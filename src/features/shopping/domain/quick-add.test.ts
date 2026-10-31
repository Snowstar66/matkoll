import { describe, expect, it } from "vitest";
import { maxQuickItems, quickAddedText, splitQuickText } from "./quick-add";

describe("splitQuickText", () => {
  it("splits on och, commas, semicolons and line breaks and capitalises", () => {
    expect(splitQuickText("mjölk och ägg")).toEqual(["Mjölk", "Ägg"]);
    expect(splitQuickText("mjölk, ägg och smör")).toEqual(["Mjölk", "Ägg", "Smör"]);
    expect(splitQuickText("mjölk\nägg;smör")).toEqual(["Mjölk", "Ägg", "Smör"]);
    expect(splitQuickText("öl & chips")).toEqual(["Öl", "Chips"]);
  });

  it("does not split inside a word that holds och", () => {
    expect(splitQuickText("mochaccino och lochness")).toEqual(["Mochaccino", "Lochness"]);
    expect(splitQuickText("och")).toEqual([]);
  });

  it("trims, drops empty and repeated items, keeps the rest as said", () => {
    expect(splitQuickText("  mjölk ,, och  Mjölk , arla  mjölk ")).toEqual(["Mjölk", "Arla mjölk"]);
    expect(splitQuickText("  ,  och ")).toEqual([]);
  });

  it("caps at 20 items and 200 characters each", () => {
    const many = Array.from({ length: 30 }, (_, index) => `vara ${index}`).join(", ");
    expect(splitQuickText(many)).toHaveLength(maxQuickItems);
    expect([...splitQuickText("å".repeat(500))[0]!]).toHaveLength(200);
  });
});

describe("quickAddedText", () => {
  it("lists what was added", () => {
    expect(quickAddedText(["Mjölk", "Ägg"])).toBe("La till: Mjölk, Ägg");
  });
});
