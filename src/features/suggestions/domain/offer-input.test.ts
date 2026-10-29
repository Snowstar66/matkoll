import { describe, expect, it } from "vitest";
import { atHomeText, offersUsed, toOfferNames } from "./offer-input";

const offer = (name: string, ingredientId: string | null = null, label = name) => ({ label, name, ingredientId });

describe("toOfferNames", () => {
  it("gives names only, offers with a catalog ingredient first, each once", () => {
    const names = toOfferNames([offer("Falukorv"), offer("broccoli", "i1"), offer("Broccoli  ", "i2"), offer("grädde", "i3")]);
    expect(names).toEqual(["broccoli", "grädde", "Falukorv"]);
  });

  it("cleans names and skips empty ones", () => {
    expect(toOfferNames([offer("ost\u200B\nbit"), offer("  ")])).toEqual(["ost bit"]);
  });

  it("puts the best saving first within each group, unknown savings last", () => {
    const offer = (name: string, ingredientId: string | null, savingPercent: number | null) => ({
      label: name,
      name,
      ingredientId,
      savingPercent,
    });
    expect(
      toOfferNames([
        offer("ost", null, 40),
        offer("lax", "i1", null),
        offer("korv", "i2", 25),
        offer("bröd", null, null),
        offer("mjölk", "i3", 10),
      ]),
    ).toEqual(["korv", "mjölk", "lax", "ost", "bröd"]);
  });

  it("keeps at most 40 names and 1 000 characters", () => {
    const many = Array.from({ length: 91 }, (_, i) => offer(`vara ${i}`));
    expect(toOfferNames(many)).toHaveLength(40);
    const long = Array.from({ length: 30 }, (_, i) => offer(`${"x".repeat(60)}${i}`));
    const kept = toOfferNames(long);
    expect(kept.join("\n").length + kept.length * 2).toBeLessThanOrEqual(1_000 + kept.length);
    expect(kept.length).toBeLessThan(30);
  });
});

describe("offersUsed", () => {
  const offers = [offer("falukorv", "a", "Falukorv 29 kr"), offer("broccoli", "b", "Broccoli 15 kr"), offer("ost", null, "Ost")];

  it("labels the offers whose ingredient the dish has, in the sheet's order", () => {
    expect(offersUsed(offers, new Set(["b", "a"]), [])).toEqual(["Falukorv 29 kr", "Broccoli 15 kr"]);
  });

  it("matches an offer without a catalog ingredient by the name of a line", () => {
    expect(offersUsed(offers, new Set(), ["Ost"])).toEqual(["Ost"]);
    expect(offersUsed(offers, new Set(), ["smör"])).toEqual([]);
  });
});

describe("atHomeText", () => {
  it("says how many of the ingredients are at home", () => {
    expect(atHomeText({ have: 3, total: 6 })).toBe("3 av 6 hemma");
  });
});
