import { describe, expect, it } from "vitest";
import { bestStore, bestStoreReason } from "./best-store";

const o = (storeId: string, ingredientId: string | null, savingPercent: number | null = null) => ({ storeId, ingredientId, savingPercent });

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
