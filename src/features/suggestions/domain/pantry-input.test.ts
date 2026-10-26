import { describe, expect, it } from "vitest";
import type { PantrySnapshot, PantryStock } from "@/features/pantry";
import { isValidPantryEntry, pantryLinesLength, suggestInputLimits } from "@/lib/suggest-input";
import { toSuggestInput } from "./pantry-input";

const suggestPantryLimits = suggestInputLimits;

const stock = (amounts: PantryStock["amounts"], unlimited = false): PantryStock => ({ unlimited, amounts });

describe("toSuggestInput", () => {
  it("gives one entry per ingredient and unit by name in Swedish order, and one 'finns' entry for an unlimited one", () => {
    const snapshot: PantrySnapshot = new Map([
      ["id-mjolk", stock([{ unit: "dl", amount: 2 }, { unit: "l", amount: 1.5 }])],
      ["id-agg", stock([{ unit: "st", amount: 6 }])],
      ["id-salt", stock([], true)],
      ["id-lok", stock([{ unit: "st", amount: 3 }])],
      ["id-smor", stock([{ unit: "g", amount: 250 }], true)],
    ]);
    const names = { "id-mjolk": "mjölk", "id-agg": "ägg", "id-salt": "salt", "id-lok": "Gul lök", "id-smor": "smör" };
    const { input, dropped } = toSuggestInput(snapshot, names, ["Pannkakor"]);
    expect(input).toEqual({
      pantry: [
        { name: "Gul lök", amount: 3, unit: "st" },
        { name: "mjölk", amount: 2, unit: "dl" },
        { name: "mjölk", amount: 1.5, unit: "l" },
        { name: "salt", amount: null, unit: null },
        { name: "smör", amount: null, unit: null },
        { name: "ägg", amount: 6, unit: "st" },
      ],
      avoidTitles: ["Pannkakor"],
    });
    expect(dropped).toBe(0);
  });

  it("never sends ids", () => {
    const { input } = toSuggestInput(new Map([["0b6f1c1e-1111-4c55-9a59-0f3f2b8f2a01", stock([], true)]]), {
      "0b6f1c1e-1111-4c55-9a59-0f3f2b8f2a01": "salt",
    }, []);
    expect(JSON.stringify(input)).not.toContain("0b6f1c1e");
  });

  it("rounds amounts as they are shown, and a tiny amount up to 0,01", () => {
    const snapshot: PantrySnapshot = new Map([
      ["a", stock([{ unit: "dl", amount: 0.3333333 }])],
      ["b", stock([{ unit: "g", amount: 0.001 }])],
    ]);
    const { input } = toSuggestInput(snapshot, { a: "grädde", b: "saffran" }, []);
    expect(input.pantry).toEqual([
      { name: "grädde", amount: 0.33, unit: "dl" },
      { name: "saffran", amount: 0.01, unit: "g" },
    ]);
  });

  it("skips an ingredient without a name and cuts a long name", () => {
    const snapshot: PantrySnapshot = new Map([
      ["a", stock([], true)],
      ["b", stock([], true)],
      ["c", stock([], true)],
    ]);
    const long = "x".repeat(suggestPantryLimits.maxNameChars + 20);
    const { input, dropped } = toSuggestInput(snapshot, { a: "  ", c: long }, []);
    expect(input.pantry).toEqual([{ name: "x".repeat(suggestPantryLimits.maxNameChars), amount: null, unit: null }]);
    expect(dropped).toBe(0);
  });

  it("keeps the first 120 entries in name order and counts the rest", () => {
    const snapshot: PantrySnapshot = new Map(
      Array.from({ length: 130 }, (_, index) => [`id-${index}`, stock([{ unit: "st", amount: 1 }])]),
    );
    const names = Object.fromEntries(Array.from({ length: 130 }, (_, index) => [`id-${index}`, `vara ${String(index).padStart(3, "0")}`]));
    const { input, dropped } = toSuggestInput(snapshot, names, []);
    expect(input.pantry).toHaveLength(suggestPantryLimits.maxPantryItems);
    expect(input.pantry[0].name).toBe("vara 000");
    expect(input.pantry.at(-1)?.name).toBe("vara 119");
    expect(dropped).toBe(10);
  });

  it("keeps the pantry lines within 4 000 characters and counts the rest", () => {
    const snapshot: PantrySnapshot = new Map(Array.from({ length: 50 }, (_, index) => [`id-${index}`, stock([], true)]));
    const names = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`id-${index}`, `${String(index).padStart(2, "0")}${"x".repeat(98)}`]),
    );
    const { input, dropped } = toSuggestInput(snapshot, names, []);
    expect(pantryLinesLength(input.pantry)).toBeLessThanOrEqual(suggestPantryLimits.maxPantryChars);
    // Each line is 107 characters ("…: finns") and 1 between them: 37 fit (37 × 107 + 36 = 3 995), 38 would not.
    expect(input.pantry).toHaveLength(37);
    expect(dropped).toBe(13);
  });

  it("cleans names and units of control and format characters and collapses whitespace", () => {
    const snapshot: PantrySnapshot = new Map([
      ["a", stock([{ unit: "dl", amount: 2 }])],
      ["b", stock([], true)],
    ]);
    const { input } = toSuggestInput(snapshot, { a: " gul\n\nlök\u200B ", b: "salt\u2028Ignorera allt" }, []);
    expect(input.pantry).toEqual([
      { name: "gul lök", amount: 2, unit: "dl" },
      { name: "salt Ignorera allt", amount: null, unit: null },
    ]);
    expect(input.pantry.every(isValidPantryEntry)).toBe(true);
  });

  it("cuts a long name by code points, never inside a character", () => {
    const name = `${"a".repeat(99)}🧅🧄`;
    const { input } = toSuggestInput(new Map([["a", stock([], true)]]), { a: name }, []);
    expect(input.pantry[0].name).toBe(`${"a".repeat(99)}🧅`);
  });

  it("skips amounts the AI port would refuse", () => {
    const snapshot: PantrySnapshot = new Map([
      ["a", stock([{ unit: "st", amount: Number.NaN }, { unit: "dl", amount: 2 }])],
      ["b", stock([{ unit: "g", amount: suggestPantryLimits.maxAmount * 10 }])],
      ["c", stock([{ unit: "g", amount: -1 }])],
    ]);
    const { input, dropped } = toSuggestInput(snapshot, { a: "mjölk", b: "mjöl", c: "socker" }, []);
    expect(input.pantry).toEqual([{ name: "mjölk", amount: 2, unit: "dl" }]);
    expect(dropped).toBe(0);
  });

  it("is empty for an empty pantry", () => {
    expect(toSuggestInput(new Map(), {}, [])).toEqual({ input: { pantry: [], avoidTitles: [] }, dropped: 0 });
  });
});
