import { describe, expect, it } from "vitest";
import { bestStore, bestStoreLine, bestStoreReason, fitPhrase, fittingOffers, matchNames } from "./best-store";

let n = 0;
const o = (storeId: string, ingredientId: string | null, savingPercent: number | null = null, label = "Vara") => ({
  id: `o${++n}`,
  label,
  storeId,
  ingredientId,
  savingPercent,
});

describe("bestStore", () => {
  it("prefers the store with more offers that fit the pantry and recipes", () => {
    const offers = [o("a", "x"), o("a", null), o("a", null), o("b", "x"), o("b", "y")];
    const best = bestStore(offers, ["a", "b"], new Set(["x"]), new Map([["y", 2]]));
    expect(best).toMatchObject({ storeId: "b", fits: 2, total: 2 });
  });

  it("lets a saving and then the number of offers break a tie", () => {
    expect(bestStore([o("a", null, 10), o("b", null, 40)], ["a", "b"], new Set(), new Map())?.storeId).toBe("b");
    expect(bestStore([o("a", null), o("b", null), o("b", null)], ["a", "b"], new Set(), new Map())?.storeId).toBe("b");
    expect(bestStore([o("a", null), o("b", null)], ["a", "b"], new Set(), new Map())?.storeId).toBe("a");
  });

  it("caps a staple and ignores stores without offers", () => {
    const counts = new Map([["x", 99]]);
    expect(bestStore([o("a", "x")], ["a", "b"], new Set(), counts)?.score).toBe(1.75);
    expect(bestStore([], ["a"], new Set(), counts)).toBeNull();
  });
});

describe("bestStoreReason", () => {
  it("says how many fit, else how many there are", () => {
    expect(bestStoreReason({ fits: 12, total: 30 })).toBe("12 erbjudanden passar det du brukar laga");
    expect(bestStoreReason({ fits: 1, total: 3 })).toBe("1 erbjudande passar det du brukar laga");
    expect(bestStoreReason({ fits: 0, total: 5 })).toBe("5 erbjudanden");
  });
});

describe("matches (Story 16.7)", () => {
  it("returns which offers fit, by id and cleaned name, and how", () => {
    const offers = [o("a", "x", null, "ICA. Sverige Falukorv"), o("a", "y", null, "Grädde"), o("a", "z", null, "Kaviar"), o("a", null)];
    const best = bestStore(offers, ["a"], new Set(["x"]), new Map([["y", 1]]));
    expect(best?.matches).toEqual([
      { id: offers[0].id, name: "Falukorv", source: "pantry" },
      { id: offers[1].id, name: "Grädde", source: "recipes" },
    ]);
  });

  it("fittingOffers uses the same rule across every store", () => {
    const offers = [o("a", "x"), o("b", "y"), o("b", "x")];
    const map = fittingOffers(offers, new Set(["x"]), new Map([["x", 2]]));
    expect([...map.values()]).toEqual(["both", "both"]);
    expect(map.has(offers[1].id)).toBe(false);
  });
});

describe("bestStoreLine", () => {
  const m = (name: string, source: "pantry" | "recipes" | "both" = "recipes") => ({ id: name, name, source });
  it("names the matches", () => {
    expect(matchNames([m("Falukorv"), m("Grädde")])).toBe("falukorv och grädde");
    expect(matchNames([m("Falukorv"), m("Grädde"), m("Lök")])).toBe("falukorv, grädde och lök");
    expect(matchNames([m("a"), m("b"), m("c"), m("d"), m("e")])).toBe("a, b, c +2");
    expect(matchNames([m("Lök"), m("lök")])).toBe("lök");
  });
  it("keeps one short phrase when the reasons differ", () => {
    expect(fitPhrase([m("a", "pantry"), m("b", "pantry")])).toBe("passar det du har hemma");
    expect(fitPhrase([m("a", "recipes")])).toBe("passar dina recept");
    expect(fitPhrase([m("a", "pantry"), m("b", "recipes")])).toBe("passar det du brukar laga");
    expect(bestStoreLine({ fits: 2, total: 4, matches: [m("Falukorv"), m("Grädde")] })).toBe("falukorv och grädde passar dina recept");
  });
  it("falls back to the count without names", () => {
    expect(bestStoreLine({ fits: 0, total: 5, matches: [] })).toBe("5 erbjudanden");
  });
});
