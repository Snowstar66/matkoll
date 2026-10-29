import { describe, expect, it } from "vitest";
import { atHomeText, isTrivialStaple, offersUsed, toBuyNames, toOfferNames, whyText } from "./offer-input";

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

describe("toBuyNames", () => {
  const offers = [
    { label: "Scan Falukorv", name: "falukorv", ingredientId: "f" },
    { label: "Kryddmix", name: "kryddmix", ingredientId: null },
  ];
  it("leaves out what is at home, on offer, trivial staples and repeats", () => {
    const line = (name: string, ingredientId: string | null, atHome = false) => ({ name, ingredientId, atHome });
    expect(
      toBuyNames(offers, [
        line("falukorv", "f"),
        line("kryddmix", null),
        line("mjölk", "m", true),
        line("Salt", "s"),
        line("potatis", "p"),
        line("Potatis", null),
        line("vatten", null),
      ]),
    ).toEqual(["potatis"]);
  });
  it("knows the staples", () => {
    expect(isTrivialStaple("Peppar")).toBe(true);
    expect(isTrivialStaple("potatis")).toBe(false);
  });
});

describe("whyText", () => {
  it("counts offers and home and says what to buy", () => {
    expect(whyText({ onOffer: 3, have: 1, toBuy: ["potatis"] })).toBe("3 på erbjudande · 1 hemma · köp till: potatis");
  });
  it("leaves out a zero", () => {
    expect(whyText({ onOffer: 0, have: 2, toBuy: ["lök"] })).toBe("2 hemma · köp till: lök");
    expect(whyText({ onOffer: 1, have: 0, toBuy: ["lök"] })).toBe("1 på erbjudande · köp till: lök");
  });
  it("shows three names and counts the rest", () => {
    expect(whyText({ onOffer: 1, have: 1, toBuy: ["a", "b", "c", "d", "e"] })).toBe(
      "1 på erbjudande · 1 hemma · köp till: a, b, c +2",
    );
  });
  it("says everything is covered when nothing is left to buy", () => {
    expect(whyText({ onOffer: 2, have: 3, toBuy: [] })).toBe("allt hemma eller på erbjudande");
  });
});
