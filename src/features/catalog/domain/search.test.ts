import { describe, expect, it } from "vitest";
import { maxSearchHits, newIngredientName, rankSearchHits, searchText } from "./search";

describe("searchText", () => {
  it("is lower case, composed and has single spaces", () => {
    expect(searchText("  Gul   LÖK ")).toBe("gul lök");
    expect(searchText("Lök")).toBe("lök");
  });
});

describe("rankSearchHits", () => {
  it("puts exact, then prefix, then word prefix, then other matches first, and sorts by name within each", () => {
    const hits = rankSearchHits("lök", [
      { id: "1", name: "Vitlök", matchedTexts: ["vitlök"] },
      { id: "2", name: "Röd lök", matchedTexts: ["röd lök"] },
      { id: "3", name: "Lökpulver", matchedTexts: ["lökpulver"] },
      { id: "4", name: "Gul lök", matchedTexts: ["gul lök"] },
      { id: "4", name: "Gul lök", matchedTexts: ["lök"] },
    ]);
    expect(hits).toEqual([
      { id: "4", name: "Gul lök" },
      { id: "3", name: "Lökpulver" },
      { id: "2", name: "Röd lök" },
      { id: "1", name: "Vitlök" },
    ]);
  });

  it("gives at most maxSearchHits hits", () => {
    const candidates = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      name: `Lök ${index}`,
      matchedTexts: [`lök ${index}`],
    }));
    expect(rankSearchHits("lök", candidates)).toHaveLength(maxSearchHits);
  });
});

describe("newIngredientName", () => {
  it("offers the typed name without amount and unit", () => {
    expect(newIngredientName("2 dl Schalottenlök", [{ id: "1", name: "Rödlök" }])).toBe("Schalottenlök");
    expect(newIngredientName("  Saffran ", [])).toBe("Saffran");
  });

  it("offers nothing when a hit has the name, or nothing is typed", () => {
    expect(newIngredientName("gul LÖK", [{ id: "1", name: "Gul lök" }])).toBeNull();
    expect(newIngredientName("   ", [])).toBeNull();
  });
});
