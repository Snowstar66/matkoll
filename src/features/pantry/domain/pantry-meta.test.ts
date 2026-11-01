import { describe, expect, it } from "vitest";
import type { PantryItem } from "./pantry-item";
import {
  addedText,
  filterPantry,
  msUntilStockholmMidnight,
  pantrySearchText,
  stockholmDayKey,
  groupPantryByCategory,
  pantryMetaText,
  pantrySearchLabel,
  daysSinceAdded,
  oldItemText,
  oldLimitDays,
} from "./pantry-meta";

// A fixed now: Tuesday 27 October 2026, 10:00 in Stockholm (CET, UTC+1).
const now = new Date("2026-10-27T09:00:00Z");

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  siteId: "site",
  ingredientId: `ingredient-${overrides.id}`,
  location: "Kyl",
  amount: null,
  unit: null,
  label: null,
  createdAt: "2026-10-27T08:00:00Z",
  section: "Mejeri",
  ...overrides,
});

describe("addedText", () => {
  it("counts calendar days in Stockholm", () => {
    expect(addedText("2026-10-27T08:00:00Z", now)).toBe("Tillagd idag");
    // 00:30 in Stockholm today, 23:30 the day before in UTC.
    expect(addedText("2026-10-26T23:30:00Z", now)).toBe("Tillagd idag");
    // 23:30 yesterday in Stockholm.
    expect(addedText("2026-10-26T22:30:00Z", now)).toBe("Tillagd igår");
    expect(addedText("2026-10-26T06:00:00Z", now)).toBe("Tillagd igår");
    expect(addedText("2026-10-25T06:00:00Z", now)).toBe("Tillagd för 2 dagar sedan");
    expect(addedText("2026-10-21T06:00:00Z", now)).toBe("Tillagd för 6 dagar sedan");
    expect(addedText("2026-10-14T06:00:00Z", now)).toBe("Tillagd för 13 dagar sedan");
  });

  it("writes the date from 14 days, with the year when it is another", () => {
    expect(addedText("2026-10-13T06:00:00Z", now)).toBe("Tillagd 13 okt");
    expect(addedText("2026-10-02T06:00:00Z", now)).toBe("Tillagd 2 okt");
    expect(addedText("2026-03-05T06:00:00Z", now)).toBe("Tillagd 5 mars");
    expect(addedText("2025-10-24T06:00:00Z", now)).toBe("Tillagd 24 okt 2025");
    // New Year's Eve 23:30 in Stockholm is still the old year.
    expect(addedText("2025-12-31T22:30:00Z", new Date("2026-02-01T09:00:00Z"))).toBe("Tillagd 31 dec 2025");
  });

  it("holds over the change to summer and winter time", () => {
    // Winter time began on 25 October 2026: two calendar days, though 49 hours.
    expect(addedText("2026-10-25T08:00:00Z", new Date("2026-10-27T09:00:00Z"))).toBe("Tillagd för 2 dagar sedan");
    // Summer time began on 29 March 2026.
    expect(addedText("2026-03-28T23:30:00Z", new Date("2026-03-29T22:30:00Z"))).toBe("Tillagd igår");
  });

  it("says today for a time after now, and nothing for one that cannot be read", () => {
    expect(addedText("2026-10-28T09:00:00Z", now)).toBe("Tillagd idag");
    expect(addedText("inte en tid", now)).toBeNull();
  });
});

describe("pantryMetaText", () => {
  it("is the brand when there is one, else when the item was added", () => {
    expect(pantryMetaText({ label: "Arla laktosfri", createdAt: "2026-10-21T06:00:00Z" }, now)).toBe("Arla laktosfri");
    expect(pantryMetaText({ label: null, createdAt: "2026-10-21T06:00:00Z" }, now)).toBe("Tillagd för 6 dagar sedan");
    expect(pantryMetaText({ label: null, createdAt: null }, now)).toBeNull();
    // A brand of only spaces is none.
    expect(pantryMetaText({ label: "   ", createdAt: "2026-10-21T06:00:00Z" }, now)).toBe("Tillagd för 6 dagar sedan");
    expect(pantryMetaText({ label: " Arla ", createdAt: null }, now)).toBe("Arla");
  });
});

describe("groupPantryByCategory", () => {
  // The matrix in the spec: the fridge.
  const mellanmjolk = item({ id: "1", name: "Mellanmjölk", label: "Arla laktosfri" });
  const graddfil = item({ id: "2", name: "Gräddfil", createdAt: "2026-10-21T06:00:00Z" });
  const agg = item({ id: "3", name: "Ägg" });
  const kyckling = item({ id: "4", name: "Kycklingfilé", section: "Kött och fisk" });
  const senap = item({ id: "5", name: "Senap", section: "Skafferi", label: "Johnny's" });
  const gurka = item({ id: "6", name: "Gurka", section: "Frukt och grönt" });
  const kyl = [mellanmjolk, graddfil, agg, kyckling, senap, gurka];

  it("puts the categories in the store's order and the items in Swedish alphabetical order", () => {
    const groups = groupPantryByCategory(kyl);
    expect(groups.map(({ category, items }) => [category, items.map(({ name }) => name)])).toEqual([
      ["Frukt & grönt", ["Gurka"]],
      ["Mejeri & ägg", ["Gräddfil", "Mellanmjölk", "Ägg"]],
      ["Kött, fisk & chark", ["Kycklingfilé"]],
      ["Såser & smaksättare", ["Senap"]],
    ]);
  });

  it("puts an unlimited item in its category like the others, and leaves out empty ones", () => {
    const salt = item({ id: "7", name: "Salt", section: "Skafferi", location: "Skafferi" });
    const pasta = item({ id: "8", name: "Pasta", section: "Skafferi", location: "Skafferi", amount: 500, unit: "g" });
    expect(groupPantryByCategory([salt, pasta]).map(({ category, items }) => [category, items.length])).toEqual([
      ["Skafferi", 1],
      ["Såser & smaksättare", 1],
    ]);
    expect(groupPantryByCategory([])).toEqual([]);
  });

  it("does not change the list it is given", () => {
    const given = [agg, graddfil];
    groupPantryByCategory(given);
    expect(given).toEqual([agg, graddfil]);
  });
});

describe("filterPantry", () => {
  const mellanmjolk = item({ id: "1", name: "Mellanmjölk", label: "Arla laktosfri" });
  const senap = item({ id: "5", name: "Senap", section: "Skafferi", label: "Johnny's" });
  const agg = item({ id: "3", name: "Ägg" });
  const items = [mellanmjolk, senap, agg];

  it("matches the name and the brand without regard to case", () => {
    expect(filterPantry(items, "mjö")).toEqual([mellanmjolk]);
    expect(filterPantry(items, "MJÖ")).toEqual([mellanmjolk]);
    expect(filterPantry(items, "johnny")).toEqual([senap]);
    expect(filterPantry(items, " arla  laktos ")).toEqual([mellanmjolk]);
    expect(filterPantry(items, "xyz")).toEqual([]);
  });

  it("keeps å, ä and ö letters of their own", () => {
    expect(filterPantry(items, "ägg")).toEqual([agg]);
    expect(filterPantry(items, "agg")).toEqual([]);
    expect(filterPantry(items, "mjo")).toEqual([]);
  });

  it("matches every word of the search against the name and the brand together", () => {
    expect(filterPantry(items, "mjölk arla")).toEqual([mellanmjolk]);
    expect(filterPantry(items, "arla mjölk")).toEqual([mellanmjolk]);
    expect(filterPantry(items, "mjölk garant")).toEqual([]);
  });

  it("takes marks off other letters than å, ä and ö, and reads curly apostrophes as straight", () => {
    const creme = item({ id: "8", name: "Crème fraiche" });
    const jalapeno = item({ id: "9", name: "Jalapeño" });
    const more = [...items, creme, jalapeno];
    expect(filterPantry(more, "creme")).toEqual([creme]);
    expect(filterPantry(more, "CRÈME")).toEqual([creme]);
    expect(filterPantry(more, "jalapeno")).toEqual([jalapeno]);
    expect(filterPantry(more, "johnny\u2019s")).toEqual([senap]);
    expect(filterPantry(more, "johnny\u02BCs")).toEqual([senap]);
    // An ö written as o and a combining mark (NFD) is still ö.
    expect(filterPantry(more, "mjo\u0308")).toEqual([mellanmjolk]);
    expect(pantrySearchText("  Smör\u0301 ")).toBe("smör");
  });

  it("keeps every item for an empty search", () => {
    expect(filterPantry(items, "")).toBe(items);
    expect(filterPantry(items, "   ")).toBe(items);
  });
});

describe("the search texts", () => {
  it("name the location in definite form", () => {
    expect(pantrySearchLabel("Kyl")).toBe("Sök i kylen");
    expect(pantrySearchLabel("Frys")).toBe("Sök i frysen");
    expect(pantrySearchLabel("Skafferi")).toBe("Sök i skafferiet");
  });
});

describe("the day in Stockholm", () => {
  it("gives the calendar day in Stockholm, also around midnight", () => {
    expect(stockholmDayKey(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    expect(stockholmDayKey(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-26");
    // Summer time: UTC+2.
    expect(stockholmDayKey(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });

  it("counts the time to the next midnight in Stockholm", () => {
    // 10:00 in Stockholm (CET): 14 hours left.
    expect(msUntilStockholmMidnight(new Date("2026-10-27T09:00:00Z"))).toBe(14 * 60 * 60 * 1000);
    // 23:59:59.5: at least a second.
    expect(msUntilStockholmMidnight(new Date("2026-10-27T22:59:59.500Z"))).toBe(1000);
  });
});

describe("oldLimitDays", () => {
  it("is 7 days for Kyl, 60 for Frys and none for Skafferi", () => {
    expect(oldLimitDays("Kyl")).toBe(7);
    expect(oldLimitDays("Frys")).toBe(60);
    expect(oldLimitDays("Skafferi")).toBeNull();
  });
});

describe("daysSinceAdded", () => {
  it("counts calendar days in Stockholm", () => {
    expect(daysSinceAdded("2026-10-27T08:00:00Z", now)).toBe(0);
    expect(daysSinceAdded("2026-10-26T22:30:00Z", now)).toBe(1); // 23:30 on the 26th in Stockholm
  });

  it("is never negative and null for a time that cannot be read", () => {
    expect(daysSinceAdded("2026-11-05T08:00:00Z", now)).toBe(0);
    expect(daysSinceAdded("not a time", now)).toBeNull();
  });
});

describe("oldItemText", () => {
  const added = (days: number) => ({ createdAt: new Date(now.getTime() - days * 86_400_000).toISOString() });

  it("labels a Kyl item only after more than 7 days", () => {
    expect(oldItemText(added(7), "Kyl", now)).toBeNull();
    expect(oldItemText(added(8), "Kyl", now)).toBe("8 dagar");
    expect(oldItemText(added(9), "Kyl", now)).toBe("9 dagar");
  });

  it("labels a Frys item only after more than 60 days", () => {
    expect(oldItemText(added(60), "Frys", now)).toBeNull();
    expect(oldItemText(added(61), "Frys", now)).toBe("61 dagar");
  });

  it("never labels a Skafferi item", () => {
    expect(oldItemText(added(900), "Skafferi", now)).toBeNull();
  });

  it("gives nothing for a placeholder without a time or an unreadable one", () => {
    expect(oldItemText({ createdAt: null }, "Kyl", now)).toBeNull();
    expect(oldItemText({ createdAt: "x" }, "Kyl", now)).toBeNull();
  });
});
