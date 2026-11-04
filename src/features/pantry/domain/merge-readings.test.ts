import { describe, expect, it } from "vitest";
import type { PantrySuggestion } from "./pantry-suggestion";
import { mergeReadings, photoOf, type ReadingPart } from "./merge-readings";
import type { MissingItem } from "./place-inventory";

const mjolk = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const smor = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";
const ost = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a03";
const row1 = "7f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const row2 = "7f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";
const site = { id: "55555555-5555-4555-8555-555555555555", name: "Hemma" };

function suggestion(id: string, name: string, extra: Partial<PantrySuggestion> = {}): PantrySuggestion {
  return {
    id,
    name,
    ingredient: { kind: "new", proposalId: `n-${name}`, name, section: "Mejeri", location: "Kyl", defaultUnit: null },
    location: "Kyl",
    amount: 1,
    unit: "förp",
    current: null,
    change: null,
    replaces: [],
    ...extra,
  };
}

const existing = (id: string) => ({ ingredient: { kind: "existing" as const, ingredientId: id } });
const missingItem = (id: string, ingredientId: string, name: string): MissingItem => ({
  id,
  ingredientId,
  name,
  location: "Kyl",
  rows: [{ id: row2, amount: 1, unit: "förp" }],
  stock: { unlimited: false, amounts: [{ amount: 1, unit: "förp" }] },
});

function part(extra: Partial<ReadingPart>): ReadingPart {
  return { site, location: "Kyl", suggestions: [], dropped: 0, inventory: { kind: "empty" }, points: null, ...extra };
}

describe("mergeReadings (Kylfoto, flera foton)", () => {
  it("gives one photo back as it is, with its points and range", () => {
    const only = part({
      suggestions: [suggestion("s1", "grädde", { itemNumbers: [1] })],
      reading: ["Grädde"],
      points: { positions: [{ n: 1, x: 100, y: 200 }] },
    });
    const merged = mergeReadings([only]);
    expect(merged.result).toEqual({ site, location: "Kyl", suggestions: only.suggestions, dropped: 0, inventory: { kind: "empty" }, reading: ["Grädde"] });
    expect([...merged.points]).toEqual([[1, { n: 1, x: 100, y: 200 }]]);
    expect(merged.ranges).toEqual([{ first: 1, last: 1 }]);
  });

  it("numbers the items on over the photos, with each photo's points and range", () => {
    const merged = mergeReadings([
      part({
        suggestions: [suggestion("s1", "grädde", { itemNumbers: [1] }), suggestion("s2", "ägg", { itemNumbers: [2] })],
        reading: ["Grädde", "Ägg"],
        points: { positions: [{ n: 1, x: 100, y: 100 }, { n: 2, x: 200, y: 200 }] },
      }),
      part({
        suggestions: [suggestion("s1", "ketchup", { itemNumbers: [1] })],
        reading: ["Ketchup"],
        points: { positions: [{ n: 1, x: 900, y: 900 }] },
      }),
    ]);
    expect(merged.result.suggestions.map((row) => [row.id, row.name, row.itemNumbers])).toEqual([
      ["s1", "grädde", [1]],
      ["s2", "ägg", [2]],
      ["s1.2", "ketchup", [3]],
    ]);
    expect(merged.result.reading).toEqual(["Grädde", "Ägg", "Ketchup"]);
    expect([...merged.points.keys()]).toEqual([1, 2, 3]);
    expect(merged.points.get(3)).toEqual({ n: 3, x: 900, y: 900 });
    expect(merged.ranges).toEqual([
      { first: 1, last: 2 },
      { first: 3, last: 3 },
    ]);
    expect([photoOf(2, merged.ranges), photoOf(3, merged.ranges), photoOf(4, merged.ranges)]).toEqual([0, 1, -1]);
  });

  it("makes the same catalog ingredient, or the same name, one row with the amounts summed in the same unit", () => {
    const merged = mergeReadings([
      part({
        suggestions: [
          suggestion("s1", "mjölk", { ...existing(mjolk), amount: 1, itemNumbers: [1], labels: ["Arla mellanmjölk"] }),
          suggestion("s2", "Grädde", { amount: 2, itemNumbers: [2] }),
        ],
        reading: ["Arla mellanmjölk", "Grädde"],
      }),
      part({
        suggestions: [
          suggestion("s1", "mjölk", { ...existing(mjolk), amount: 2, itemNumbers: [1], labels: ["Garant mjölk"], uncertain: true }),
          suggestion("s2", " grädde ", { amount: 1, itemNumbers: [2] }),
          suggestion("s3", "mjölk", { ...existing(mjolk), amount: 6, unit: "st", itemNumbers: [3] }),
        ],
        reading: ["Garant mjölk", "grädde", "Mjölk"],
      }),
    ]);
    expect(merged.result.suggestions.map((row) => [row.name, row.amount, row.unit, row.itemNumbers, row.uncertain ?? false])).toEqual([
      ["mjölk", 3, "förp", [1, 3], true],
      ["Grädde", 3, "förp", [2, 4], false],
      // Another unit stays its own row, as from one photo.
      ["mjölk", 6, "st", [5], false],
    ]);
    expect(merged.result.suggestions[0].labels).toEqual(["Arla mellanmjölk", "Garant mjölk"]);
  });

  it("keeps an amount unknown when one photo has none", () => {
    const merged = mergeReadings([
      part({ suggestions: [suggestion("s1", "senap", { amount: null, unit: null })] }),
      part({ suggestions: [suggestion("s1", "senap", { amount: null, unit: null })] }),
    ]);
    expect(merged.result.suggestions.map((row) => [row.amount, row.unit])).toEqual([[null, null]]);
  });

  it("counts an item as missing only when no photo shows it", () => {
    const compared = (missing: MissingItem[]) => ({ kind: "compared" as const, missing, incomplete: false });
    const merged = mergeReadings([
      part({ inventory: compared([missingItem("missing:m1", ost, "ost"), missingItem("missing:m2", smor, "smör")]) }),
      part({
        suggestions: [suggestion("s1", "smör", { ...existing(smor), change: "new" })],
        inventory: compared([missingItem("missing:m1", ost, "ost")]),
      }),
    ]);
    expect(merged.result.inventory).toEqual({ kind: "compared", missing: [missingItem("missing:m1", ost, "ost")], incomplete: false });
  });

  it("compares an ingredient again from the summed amounts, and replaces only what every photo left to replace", () => {
    const current = { unlimited: false, amounts: [{ amount: 2, unit: "förp" as const }, { amount: 1, unit: "st" as const }] };
    const compared = { kind: "compared" as const, missing: [], incomplete: false };
    const merged = mergeReadings([
      part({
        suggestions: [suggestion("s1", "mjölk", { ...existing(mjolk), amount: 1, current, change: "changed", replaces: [row1] })],
        inventory: compared,
      }),
      part({
        suggestions: [suggestion("s1", "mjölk", { ...existing(mjolk), amount: 1, current, change: "changed", replaces: [row1] })],
        inventory: compared,
      }),
    ]);
    // 1 + 1 förp is still not 2 förp and 1 st: changed, and the st row goes.
    expect(merged.result.suggestions.map((row) => [row.amount, row.change, row.replaces])).toEqual([[2, "changed", [row1]]]);

    const same = { unlimited: false, amounts: [{ amount: 2, unit: "förp" as const }] };
    const matching = mergeReadings([
      part({ suggestions: [suggestion("s1", "mjölk", { ...existing(mjolk), current: same, change: "changed" })], inventory: compared }),
      part({ suggestions: [suggestion("s1", "mjölk", { ...existing(mjolk), current: same, change: "changed" })], inventory: compared }),
    ]);
    // Two photos of one package each: the 2 förp the place has, so it matches.
    expect(matching.result.suggestions.map((row) => [row.amount, row.change, row.replaces])).toEqual([[2, "unchanged", []]]);
  });

  it("is unread when a photo could not be compared, and adds what was dropped", () => {
    const merged = mergeReadings([
      part({ suggestions: [suggestion("s1", "ost", { change: "new" })], dropped: 1, inventory: { kind: "compared", missing: [], incomplete: true } }),
      part({ dropped: 2, inventory: { kind: "unread" } }),
    ]);
    expect(merged.result.inventory).toEqual({ kind: "unread" });
    expect(merged.result.suggestions[0].change).toBeNull();
    expect(merged.result.dropped).toBe(3);
  });

  it("leaves out the point of a placeholder item and points beyond the reading", () => {
    const merged = mergeReadings([
      part({ reading: ["Ost"] }),
      part({ reading: ["vara", "Ägg"], points: { positions: [{ n: 1, x: 1, y: 1 }, { n: 2, x: 2, y: 2 }, { n: 3, x: 3, y: 3 }] } }),
    ]);
    expect([...merged.points.keys()]).toEqual([3]);
  });
});
