import { describe, expect, it } from "vitest";
import type { IngredientMatch, Unit } from "@/features/catalog";
import {
  compareWithPlace,
  groupSuggestions,
  inventoryRequest,
  maxMissingItems,
  maxReplaces,
  maxRequestReplaces,
  placeInventorySchema,
  type PlaceItem,
} from "./place-inventory";
import { maxInventoryReplaces, toPantrySuggestions, type AiPantryItemLike, type PantrySuggestion } from "./pantry-suggestion";

// The comparison of a photo with its place (Story 6.4): pure, without a
// database or a model.

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const mjolk = id(1);
const smor = id(2);
const agg = id(3);
const yoghurt = id(4);
const senap = id(5);
const gradde = id(6);
const names: Record<string, string> = {
  [mjolk]: "mjölk",
  [smor]: "smör",
  [agg]: "ägg",
  [yoghurt]: "yoghurt",
  [senap]: "senap",
  [gradde]: "grädde",
};

let rowNumber = 100;
const row = (ingredientId: string, amount: number | null, unit: Unit | null, location: PlaceItem["location"] = "Kyl"): PlaceItem => ({
  id: id(rowNumber++),
  ingredientId,
  name: names[ingredientId],
  location,
  amount,
  unit,
});

const existing = (n: string, ingredientId: string, amount: number | null, unit: Unit | null): PantrySuggestion => ({
  id: n,
  name: names[ingredientId],
  ingredient: { kind: "existing", ingredientId },
  location: "Kyl",
  amount,
  unit,
  current: null,
  change: null,
  replaces: [],
});
const fresh = (n: string, name: string, amount: number | null, unit: Unit | null): PantrySuggestion => ({
  id: n,
  name,
  ingredient: { kind: "new", proposalId: `n-${name}`, name, section: "Mejeri", location: "Kyl", defaultUnit: null },
  location: "Kyl",
  amount,
  unit,
  current: null,
  change: null,
  replaces: [],
});

const none = { location: "Kyl" as const, seenIngredientIds: new Set<string>(), incomplete: false };
const brief = (suggestions: readonly PantrySuggestion[]) => suggestions.map(({ name, change }) => [name, change]);
const missingOf = (inventory: ReturnType<typeof compareWithPlace>["inventory"]) =>
  inventory.kind === "compared" ? inventory.missing : [];

describe("compareWithPlace", () => {
  it("never counts a suggestion the AI was unsure of as unchanged, and still keeps it out of Syns inte längre (Story 6.5)", () => {
    const place = [row(senap, null, null), row(agg, 6, "st"), row(mjolk, 2, "förp")];
    const photo = [
      { ...existing("s1", senap, null, null), uncertain: true },
      { ...existing("s2", agg, 6, "st"), uncertain: true },
      existing("s3", mjolk, 2, "förp"),
    ];
    const { suggestions, inventory } = compareWithPlace(photo, place, none);
    expect(brief(suggestions)).toEqual([
      ["senap", "changed"],
      ["ägg", "changed"],
      ["mjölk", "unchanged"],
    ]);
    // The stock is the same: confirming replaces no row.
    expect(suggestions.every((suggestion) => suggestion.replaces.length === 0)).toBe(true);
    expect(missingOf(inventory)).toEqual([]);
    expect(groupSuggestions({ suggestions, inventory })).toMatchObject({ unchanged: 1, changed: [{ id: "s1" }, { id: "s2" }] });
  });

  it("groups the matrix's fridge: Nytt, Ändrat, oförändrat and Syns inte längre (also unlimited)", () => {
    const place = [
      row(mjolk, 2, "förp"),
      row(smor, null, null),
      row(agg, 6, "st"),
      row(yoghurt, 2, "förp"),
      row(senap, null, null),
    ];
    // kyl.png after toPantrySuggestions, with grädde in the catalog: smör stays unlimited, as the place has it.
    const photo = [
      existing("s1", gradde, 1, "förp"),
      existing("s4", mjolk, 1, "förp"),
      existing("s5", smor, null, null),
      existing("s6", agg, 6, "st"),
    ];
    const { suggestions, inventory } = compareWithPlace(photo, place, none);
    expect(brief(suggestions)).toEqual([
      ["grädde", "new"],
      ["mjölk", "changed"],
      ["smör", "unchanged"],
      ["ägg", "unchanged"],
    ]);
    expect(suggestions.every((suggestion) => suggestion.replaces.length === 0)).toBe(true);
    expect(suggestions[1].placeRowIds).toEqual([place[0].id]);
    expect(inventory).toEqual({
      kind: "compared",
      incomplete: false,
      missing: [
        {
          id: "missing:m1",
          ingredientId: senap,
          name: "senap",
          location: "Kyl",
          rows: [{ id: place[4].id, amount: null, unit: null }],
          stock: { unlimited: true, amounts: [] },
        },
        {
          id: "missing:m2",
          ingredientId: yoghurt,
          name: "yoghurt",
          location: "Kyl",
          rows: [{ id: place[3].id, amount: 2, unit: "förp" }],
          stock: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
        },
      ],
    });
    expect(placeInventorySchema.safeParse(inventory).success).toBe(true);
    expect(groupSuggestions({ suggestions, inventory })).toMatchObject({
      added: [{ name: "grädde" }],
      changed: [{ name: "mjölk" }],
      unchanged: 2,
      missing: [{ name: "senap" }, { name: "yoghurt" }],
      compared: true,
      incomplete: false,
    });
  });

  it("is incomplete when a suggestion is a new catalog ingredient, or when nothing on the photo is for the place", () => {
    const place = [row(yoghurt, 2, "förp")];
    expect(compareWithPlace([fresh("s1", "gurka", 2, "st")], place, none).inventory).toMatchObject({
      kind: "compared",
      incomplete: true,
      missing: [{ name: "yoghurt" }],
    });
    expect(compareWithPlace([], place, none).inventory).toMatchObject({ kind: "compared", incomplete: true });
    expect(compareWithPlace([existing("s1", agg, 6, "st")], place, none).inventory).toMatchObject({ incomplete: false });
  });

  it("compares only suggestions for the photographed place", () => {
    const kylRow = row(mjolk, 2, "förp");
    const frysRow = row(yoghurt, 1, "förp", "Frys");
    const inFrys = { ...existing("s1", mjolk, 1, "l"), location: "Frys" as const };
    const { suggestions, inventory } = compareWithPlace([inFrys], [kylRow, frysRow], none);
    // New in Frys, nothing replaced, and Kyl's mjölk is not shielded by it.
    expect(suggestions[0]).toMatchObject({ change: "new", replaces: [] });
    expect(missingOf(inventory).map(({ name, rows }) => [name, rows.map((own) => own.id)])).toEqual([["mjölk", [kylRow.id]]]);
  });

  it("never replaces measured rows with finns hemma: a photo without an amount is unchanged", () => {
    const place = [row(mjolk, 2, "förp"), row(mjolk, 1, "l"), row(smor, null, null)];
    const { suggestions } = compareWithPlace([existing("s1", mjolk, null, null), existing("s2", smor, null, null)], place, none);
    expect(suggestions.map(({ change, replaces }) => [change, replaces])).toEqual([
      ["unchanged", []],
      ["unchanged", []],
    ]);
  });

  it("replaces an unlimited row when the photo has an amount", () => {
    const unlimitedRow = row(smor, null, null);
    const { suggestions } = compareWithPlace([existing("s1", smor, 250, "g")], [unlimitedRow], none);
    expect(suggestions.map(({ change, replaces }) => [change, replaces])).toEqual([["changed", [unlimitedRow.id]]]);
  });

  it("compares every unit of the photo and the place, and replaces the place's rows in other units", () => {
    const forp = row(mjolk, 2, "förp");
    const dl = row(mjolk, 5, "dl");
    const photo = [existing("s1", mjolk, 1, "förp"), existing("s2", mjolk, 1, "l")];
    const { suggestions } = compareWithPlace(photo, [forp, dl], none);
    // Both cards replace the dl row, so confirming them one at a time ends like confirming both.
    expect(suggestions.map(({ change, replaces, placeRowIds }) => [change, replaces, placeRowIds])).toEqual([
      ["changed", [dl.id], [forp.id, dl.id]],
      ["changed", [dl.id], [forp.id, dl.id]],
    ]);

    // The same amounts in the same units: unchanged, with nothing to replace.
    const equal = compareWithPlace([existing("s1", mjolk, 1, "l"), existing("s2", mjolk, 2, "förp")], [
      row(mjolk, 2, "förp"),
      row(mjolk, 1, "l"),
    ], none);
    expect(brief(equal.suggestions)).toEqual([
      ["mjölk", "unchanged"],
      ["mjölk", "unchanged"],
    ]);
    expect(equal.suggestions.every((suggestion) => suggestion.replaces.length === 0)).toBe(true);

    // A unit the place lacks: changed, and nothing to replace when the place's units are all in the photo.
    const more = compareWithPlace([existing("s1", mjolk, 2, "förp"), existing("s2", mjolk, 1, "l")], [forp], none);
    expect(more.suggestions.map(({ change, replaces }) => [change, replaces])).toEqual([
      ["changed", []],
      ["changed", []],
    ]);
  });

  it("makes one Syns inte längre item of all an ingredient's rows, sorted by name in Swedish order", () => {
    const rows = [row(yoghurt, 2, "förp"), row(yoghurt, 5, "dl"), row(agg, 6, "st")];
    const { inventory } = compareWithPlace([existing("s1", senap, null, null)], rows, none);
    expect(missingOf(inventory).map(({ id: itemId, name, rows: own, stock }) => [itemId, name, own.length, stock])).toEqual([
      ["missing:m1", "yoghurt", 2, { unlimited: false, amounts: [{ amount: 5, unit: "dl" }, { amount: 2, unit: "förp" }] }],
      ["missing:m2", "ägg", 1, { unlimited: false, amounts: [{ amount: 6, unit: "st" }] }],
    ]);
  });

  it("never puts an ingredient the AI named in Syns inte längre, and passes incomplete on", () => {
    const { inventory } = compareWithPlace([existing("s1", agg, 6, "st")], [row(yoghurt, 2, "förp"), row(senap, null, null)], {
      ...none,
      seenIngredientIds: new Set([senap]),
      incomplete: true,
    });
    expect(inventory).toMatchObject({ kind: "compared", incomplete: true, missing: [{ name: "yoghurt" }] });
  });

  it("is empty for a place without rows and unread for one that could not be read, with change null", () => {
    const photo = [{ ...existing("s1", mjolk, 1, "förp"), change: "changed" as const, replaces: [id(9)], placeRowIds: [id(9)] }];
    for (const [rows, kind] of [
      [[], "empty"],
      [null, "unread"],
    ] as const) {
      const { suggestions, inventory } = compareWithPlace(photo, rows, none);
      expect(inventory).toEqual({ kind });
      expect(suggestions.map(({ change, replaces, placeRowIds }) => [change, replaces, placeRowIds])).toEqual([
        [null, [], undefined],
      ]);
      expect(groupSuggestions({ suggestions, inventory })).toEqual({
        added: suggestions,
        changed: [],
        unchanged: 0,
        missing: [],
        compared: false,
        incomplete: false,
      });
    }
  });

  it("gives unchanged, not false changes, for 6.1's rules: unlimited stays unlimited, and no amount takes the place's", () => {
    const place = [row(smor, null, null), row(mjolk, 2, "förp")];
    const items: AiPantryItemLike[] = [
      { label: "Smör 500 g", amount: 1, unit: "förp", hint: { name: "smör", section: "Mejeri", location: "Kyl", defaultUnit: "förp" } },
      { label: "Mjölk", amount: null, unit: null, hint: { name: "mjölk", section: "Mejeri", location: "Kyl", defaultUnit: "förp" } },
    ];
    const matches: IngredientMatch[] = [
      { kind: "match", ingredientId: smor, confidence: "exact" },
      { kind: "match", ingredientId: mjolk, confidence: "exact" },
    ];
    const built = toPantrySuggestions(items, matches, { location: "Kyl", names, current: place });
    const { suggestions, inventory } = compareWithPlace(built.suggestions, place, none);
    expect(brief(suggestions)).toEqual([
      ["mjölk", "unchanged"],
      ["smör", "unchanged"],
    ]);
    expect(inventory).toEqual({ kind: "compared", incomplete: false, missing: [] });
  });

  it("keeps at most maxMissingItems items", () => {
    const many = Array.from({ length: maxMissingItems + 5 }, (_, n) => ({ ...row(id(10_000 + n), 1, "st"), name: `vara ${n}` }));
    const { inventory } = compareWithPlace([existing("s1", agg, 6, "st")], many, none);
    expect(missingOf(inventory)).toHaveLength(maxMissingItems);
  });
});

describe("inventoryRequest", () => {
  it("sends the suggestions as items in order, the rows they replace once each, and the missing items' rows", () => {
    const a = { ...existing("s1", mjolk, 1, "förp"), replaces: [id(7)] };
    const b = { ...existing("s2", mjolk, 1, "l"), replaces: [id(7)] };
    const missing = [
      { rows: [{ id: id(8), amount: 2, unit: "förp" as const }, { id: id(9), amount: 5, unit: "dl" as const }] },
      { rows: [{ id: id(6), amount: null, unit: null }] },
    ];
    expect(inventoryRequest({ location: "Kyl", suggestions: [a, b], missing })).toEqual({
      location: "Kyl",
      items: [
        { ingredient: a.ingredient, location: "Kyl", amount: 1, unit: "förp" },
        { ingredient: b.ingredient, location: "Kyl", amount: 1, unit: "l" },
      ],
      replaceRowIds: [id(7)],
      removeRowIds: [id(8), id(9), id(6)],
      included: ["s1", "s2"],
      left: [],
    });
    expect(inventoryRequest({ location: "Frys", suggestions: [], missing: [] })).toMatchObject({
      items: [],
      replaceRowIds: [],
      removeRowIds: [],
    });
  });

  it("keeps the rows replaced within the limit, leaving out the suggestions beyond it for afterwards", () => {
    expect(maxRequestReplaces).toBe(maxInventoryReplaces);
    expect(maxReplaces).toBeLessThanOrEqual(maxRequestReplaces);
    const rows = (from: number, count: number) => Array.from({ length: count }, (_, n) => id(20_000 + from + n));
    const a = { ...existing("s1", mjolk, 1, "förp"), replaces: rows(0, 30) };
    const b = { ...existing("s2", smor, 250, "g"), replaces: rows(100, 30) };
    const c = { ...existing("s3", agg, 6, "st"), replaces: rows(200, 20) };
    const request = inventoryRequest({ location: "Kyl", suggestions: [a, b, c], missing: [] });
    expect(request.included).toEqual(["s1", "s3"]);
    expect(request.left).toEqual(["s2"]);
    expect(request.replaceRowIds).toHaveLength(50);
    expect(request.items.map((item) => item.ingredient)).toEqual([a.ingredient, c.ingredient]);
    // A single card always fits.
    expect(inventoryRequest({ location: "Kyl", suggestions: [b], missing: [] }).left).toEqual([]);
  });

  it("sends each suggestion's first label as its item's label, and none without one (Story 11.2)", () => {
    const a = { ...existing("s1", mjolk, 1, "förp"), labels: ["Arla Mellanmjölk laktosfri 1,5 l"] };
    const b = existing("s2", smor, 250, "g");
    const { items } = inventoryRequest({ location: "Kyl", suggestions: [a, b], missing: [] });
    expect(items[0]).toMatchObject({ label: "Arla Mellanmjölk laktosfri 1,5 l" });
    expect("label" in items[1]).toBe(false);
  });
});
