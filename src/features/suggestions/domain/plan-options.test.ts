import { describe, expect, it } from "vitest";
import { dealOf, offerSavingKr, onWeekIds, optionsForTab, planMeta, planOptions, savingPhrase, type PlanOffer, type PlanRecipe } from "./plan-options";

const offers: PlanOffer[] = [
  { label: "Falukorv", name: "Falukorv", ingredientId: "korv", savingPercent: 20, price: "20 kr/st", regularPrice: 30 },
  { label: "Grädde", name: "Grädde", ingredientId: "cream", savingPercent: 10, price: "18 kr/st", regularPrice: 29 },
  { label: "Laxfilé", name: "Laxfilé", ingredientId: "lax", savingPercent: 25, price: null, regularPrice: null },
];

function recipe(id: string, lines: [string, string | null, boolean?][], extra: Partial<PlanRecipe> = {}): PlanRecipe {
  return {
    id,
    title: id,
    isFavorite: false,
    imageUrl: null,
    totalMinutes: null,
    servings: 4,
    lines: lines.map(([name, ingredientId, atHome = false]) => ({ name, ingredientId, atHome, amount: 1, unit: "st" })),
    ...extra,
  };
}

describe("savings", () => {
  it("counts kronor from the regular price and the offer's own price", () => {
    expect(offerSavingKr(offers[0])).toBe(10);
    expect(offerSavingKr(offers[2])).toBeNull();
  });

  it("says kronor, else percent, else nothing", () => {
    expect(savingPhrase({ savingKr: 21, savingPercent: 10 })).toBe("−21 kr");
    expect(savingPhrase({ savingKr: null, savingPercent: 25 })).toBe("−25 %");
    expect(savingPhrase({ savingKr: null, savingPercent: null })).toBe("");
  });
});

describe("dealOf", () => {
  it("adds the kronor of the offers a dish uses and names them", () => {
    const deal = dealOf(offers, recipe("a", [["Falukorv", "korv"], ["Grädde", "cream"]]));
    expect(deal).toMatchObject({ savingKr: 21, text: "Falukorv och grädde på erbjudande · −21 kr" });
  });

  it("falls back to percent when no offer has a price to compare", () => {
    expect(dealOf(offers, recipe("a", [["Lax", "lax"]]))?.text).toBe("Laxfilé på erbjudande · −25 %");
  });

  it("is null when nothing used is on offer, and for a spice on offer", () => {
    expect(dealOf(offers, recipe("a", [["Ris", "rice"]]))).toBeNull();
    const spice = recipe("b", []);
    expect(dealOf(offers, { lines: [{ name: "Grädde", ingredientId: "cream", atHome: false, amount: 1, unit: "tsk" }] })).toBeNull();
    expect(dealOf(offers, spice)).toBeNull();
  });
});

describe("planMeta", () => {
  it("prefers the cook count, else the time", () => {
    expect(planMeta({ isFavorite: true, totalMinutes: 30 }, 6)).toBe("Favorit · lagad 6 gånger");
    expect(planMeta({ isFavorite: true, totalMinutes: 30 }, 1)).toBe("Favorit · lagad 1 gång");
    expect(planMeta({ isFavorite: true, totalMinutes: 30 }, 0)).toBe("Favorit · 30 min");
    expect(planMeta({ isFavorite: false, totalMinutes: 25 }, 0)).toBe("25 min");
  });
});

describe("planOptions and the tabs", () => {
  const recipes = [
    recipe("Linssoppa", [["Linser", "lins"]], { totalMinutes: 40 }),
    recipe("Korvstroganoff", [["Falukorv", "korv"], ["Grädde", "cream"], ["Ris", "rice", true]], { isFavorite: true }),
    recipe("Laxpasta", [["Lax", "lax"]], { isFavorite: true }),
    recipe("Tacos", [["Köttfärs", "farsch"]], { isFavorite: true }),
  ];
  const options = planOptions(offers, recipes, { Tacos: 9, Laxpasta: 2 });

  it("counts what is left to buy, with what is at home taken off, and never ranks by the pantry", () => {
    expect(options.find((o) => o.id === "Korvstroganoff")?.buy).toBe(2);
  });

  it("Favoriter: favourites, the most cooked first", () => {
    expect(optionsForTab(options, "favorites").map((o) => o.id)).toEqual(["Tacos", "Laxpasta", "Korvstroganoff"]);
  });

  it("På erbjudande: only dishes with a main ingredient on offer, the most saved first", () => {
    expect(optionsForTab(options, "offers").map((o) => o.id)).toEqual(["Korvstroganoff", "Laxpasta"]);
  });

  it("Alla recept: every recipe by title", () => {
    expect(optionsForTab(options, "all").map((o) => o.id)).toEqual(["Korvstroganoff", "Laxpasta", "Linssoppa", "Tacos"]);
  });

  it("knows which recipes are on the week", () => {
    const ids = onWeekIds([{ recipeId: "Tacos" }, { recipeId: null }]);
    expect(ids.has("Tacos")).toBe(true);
    expect(ids.size).toBe(1);
  });
});
