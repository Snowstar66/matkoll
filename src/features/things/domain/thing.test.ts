import { describe, expect, it } from "vitest";
import { groupByCategory, isMaybe, thingCategories, thingMeta, thingTiles, unseenText } from "./thing";

describe("categories", () => {
  it("each has a tile", () => {
    for (const category of thingCategories) expect(thingTiles[category].icon).not.toBe("");
  });

  it("groups things in the order of the categories, each in its own order, and leaves empty ones out", () => {
    const groups = groupByCategory([
      { category: "Trädgård", name: "Spade" },
      { category: "Verktyg", name: "Hammare" },
      { category: "Verktyg", name: "Såg" },
    ] as const);
    expect(groups.map((group) => [group.category, group.things.map((thing) => thing.name)])).toEqual([
      ["Verktyg", ["Hammare", "Såg"]],
      ["Trädgård", ["Spade"]],
    ]);
  });
});

describe("a thing's row", () => {
  it("says where in the photo, with kanske first for a guess", () => {
    expect(thingMeta({ confidence: "high", whereHint: "på väggen" })).toBe("på väggen");
    expect(thingMeta({ confidence: "medium", whereHint: "golvet" })).toBe("golvet");
    expect(thingMeta({ confidence: "low", whereHint: "överst, höger" })).toBe("kanske · överst, höger");
    expect(thingMeta({ confidence: "low", whereHint: null })).toBe("kanske");
    expect(thingMeta({ confidence: "high", whereHint: null })).toBe("");
    expect(isMaybe({ confidence: "low" })).toBe(true);
    expect(isMaybe({ confidence: "medium" })).toBe(false);
  });

  it("says what is not visible, by count, else in the model's words, else nothing", () => {
    expect(unseenText(3, null)).toBe("Innehållet i 3 lådor syns inte – fota insidan");
    expect(unseenText(1, "x")).toBe("Innehållet i 1 låda syns inte – fota insidan");
    expect(unseenText(0, "Innehållet i en påse syns inte.")).toBe("Innehållet i en påse syns inte.");
    expect(unseenText(0, null)).toBeNull();
  });
});
