import { describe, expect, it } from "vitest";
import { comparePantryItems, snapshotFor, splitPantryItems, toSnapshot, type PantryItem } from "./pantry-item";

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  siteId: "hemma",
  ingredientId: `ingredient-${overrides.name}`,
  location: "Kyl",
  amount: null,
  unit: null,
  ...overrides,
});

describe("toSnapshot", () => {
  it("sums one ingredient and unit over locations and marks an item without amount unlimited", () => {
    const snapshot = toSnapshot([
      { ingredientId: "mjolk", amount: 1, unit: "l" },
      { ingredientId: "mjolk", amount: 1, unit: "l" },
      { ingredientId: "salt", amount: null, unit: null },
    ]);
    expect(snapshot).toEqual(
      new Map([
        ["mjolk", { unlimited: false, amounts: [{ unit: "l", amount: 2 }] }],
        ["salt", { unlimited: true, amounts: [] }],
      ]),
    );
  });

  it("keeps units apart, in the order of UNITS, and never converts them", () => {
    const snapshot = toSnapshot([
      { ingredientId: "mjol", amount: 2, unit: "dl" },
      { ingredientId: "mjol", amount: 1, unit: "kg" },
      { ingredientId: "mjol", amount: 500, unit: "g" },
      { ingredientId: "mjol", amount: 0.5, unit: "dl" },
    ]);
    expect(snapshot.get("mjol")).toEqual({
      unlimited: false,
      amounts: [
        { unit: "g", amount: 500 },
        { unit: "kg", amount: 1 },
        { unit: "dl", amount: 2.5 },
      ],
    });
  });

  it("is unlimited when any row has no amount, and still sums the rows that have one", () => {
    const snapshot = toSnapshot([
      { ingredientId: "smor", amount: 250, unit: "g" },
      { ingredientId: "smor", amount: null, unit: null },
    ]);
    expect(snapshot.get("smor")).toEqual({ unlimited: true, amounts: [{ unit: "g", amount: 250 }] });
  });

  it("drops binary noise from the sums", () => {
    const snapshot = toSnapshot([
      { ingredientId: "gradde", amount: 0.1, unit: "l" },
      { ingredientId: "gradde", amount: 0.2, unit: "l" },
      { ingredientId: "mjol", amount: 0.3, unit: "kg" },
      { ingredientId: "mjol", amount: 0.5, unit: "kg" },
    ]);
    expect(snapshot.get("gradde")?.amounts).toEqual([{ unit: "l", amount: 0.3 }]);
    expect(snapshot.get("mjol")?.amounts).toEqual([{ unit: "kg", amount: 0.8 }]);
  });

  it("gives an empty snapshot for an empty pantry", () => {
    expect(toSnapshot([])).toEqual(new Map());
  });
});

describe("comparePantryItems", () => {
  it("sorts by name in Swedish order, then unlimited first, then by unit and id", () => {
    const items = [
      item({ id: "1", name: "Ägg", amount: 6, unit: "st" }),
      item({ id: "2", name: "Ost", amount: 1, unit: "kg" }),
      item({ id: "3", name: "Mjölk", amount: 1, unit: "l" }),
      item({ id: "4", name: "Ost", amount: 200, unit: "g" }),
      item({ id: "5", name: "Ost" }),
      item({ id: "6", name: "Zucchini", amount: 1, unit: "st" }),
      item({ id: "7", name: "Åkerbär", amount: 1, unit: "dl" }),
      item({ id: "0", name: "mjölk", amount: 1, unit: "l" }),
    ];
    expect([...items].sort(comparePantryItems).map((entry) => entry.id)).toEqual(["0", "3", "5", "4", "2", "6", "7", "1"]);
  });
});

describe("splitPantryItems", () => {
  it("puts items with an amount in rows and unlimited items in tags, keeping the order", () => {
    const mjolk = item({ id: "1", name: "Mjölk", amount: 1, unit: "l" });
    const salt = item({ id: "2", name: "Salt" });
    const smor = item({ id: "3", name: "Smör", amount: 250, unit: "g" });
    expect(splitPantryItems([mjolk, salt, smor])).toEqual({ withAmount: [mjolk, smor], unlimited: [salt] });
  });
});

describe("snapshotFor", () => {
  it("keeps only the ingredients asked for that are at home", () => {
    const snapshot = toSnapshot([
      { ingredientId: "gradde", amount: 2, unit: "dl" },
      { ingredientId: "salt", amount: null, unit: null },
      { ingredientId: "mjol", amount: 1, unit: "kg" },
    ]);
    const part = snapshotFor(snapshot, ["gradde", "salt", null, "agg", "gradde"]);
    expect([...part.keys()]).toEqual(["gradde", "salt"]);
    expect(part.get("gradde")).toEqual(snapshot.get("gradde"));
  });
});
