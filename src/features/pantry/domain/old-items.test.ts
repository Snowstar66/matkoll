import { describe, expect, it } from "vitest";
import { byOvershoot, eatFirstTipText, expiringPantryItems, lainText, oldPantryItems, usesOldText } from "./old-items";

// Tuesday 27 October 2026, 10:00 in Stockholm.
const now = new Date("2026-10-27T09:00:00Z");

const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const row = (name: string, location: "Kyl" | "Frys" | "Skafferi", days: number | null, ingredientId = name, keepsDays: number | null = null) => ({
  ingredientId,
  name,
  location,
  createdAt: days === null ? null : daysAgo(days),
  keepsDays,
});

describe("oldPantryItems", () => {
  it("takes the items that reached the limit of their location, oldest first", () => {
    const old = oldPantryItems(
      [
        row("mjölk", "Kyl", 3),
        row("lime", "Kyl", 9),
        row("koriander", "Kyl", 12),
        row("lax", "Frys", 61),
        row("gädda", "Frys", 59),
        row("pasta", "Skafferi", 400),
        row("platshållare", "Kyl", null),
      ],
      now,
    );
    expect(old).toEqual([
      { ingredientId: "lax", name: "lax", days: 61, limit: 60 },
      { ingredientId: "koriander", name: "koriander", days: 12, limit: 7 },
      { ingredientId: "lime", name: "lime", days: 9, limit: 7 },
    ]);
  });

  it("an item is due on its last day: one day before the limit is not old, the limit and after are", () => {
    expect(oldPantryItems([row("a", "Kyl", 6)], now)).toEqual([]);
    expect(oldPantryItems([row("a", "Kyl", 7)], now)).toHaveLength(1);
    expect(oldPantryItems([row("a", "Kyl", 8)], now)).toHaveLength(1);
  });

  it("follows each ingredient's own shelf life in Kyl", () => {
    const old = oldPantryItems(
      [
        row("köttfärs", "Kyl", 2, "farce", 2),
        row("grädde", "Kyl", 4, "cream", 5),
        row("hårdost", "Kyl", 9, "cheese", 30),
        row("mjölk", "Kyl", 7, "milk", 7),
        row("fisk i frysen", "Frys", 3, "fish", 2),
      ],
      now,
    );
    expect(old).toEqual([
      { ingredientId: "milk", name: "mjölk", days: 7, limit: 7 },
      { ingredientId: "farce", name: "köttfärs", days: 2, limit: 2 },
    ]);
  });

  it("a row of the same ingredient with a shorter limit makes it due", () => {
    const old = oldPantryItems([row("köttfärs", "Kyl", 2, "farce", 2), row("köttfärs", "Kyl", 1, "farce", 2)], now);
    expect(old).toEqual([{ ingredientId: "farce", name: "köttfärs", days: 2, limit: 2 }]);
  });

  it("merges rows of one ingredient and keeps the oldest", () => {
    const old = oldPantryItems([row("lime", "Kyl", 9, "i1"), row("lime", "Frys", 70, "i1")], now);
    expect(old).toEqual([{ ingredientId: "i1", name: "lime", days: 70, limit: 60 }]);
  });

  it("is empty for nothing old", () => {
    expect(oldPantryItems([row("mjölk", "Kyl", 1)], now)).toEqual([]);
    expect(oldPantryItems([], now)).toEqual([]);
  });
});

describe("byOvershoot", () => {
  it("puts what is furthest past its limit first, then by name", () => {
    const sorted = byOvershoot([
      { ingredientId: "a", name: "Lax", days: 61, limit: 60 },
      { ingredientId: "b", name: "Köttfärs", days: 1, limit: 1 },
      { ingredientId: "c", name: "Grädde", days: 9, limit: 5 },
      { ingredientId: "d", name: "Ägg", days: 28, limit: 28 },
    ]);
    expect(sorted.map((item) => item.name)).toEqual(["Grädde", "Lax", "Köttfärs", "Ägg"]);
  });
});

describe("texts", () => {
  it("writes the row for one and for several", () => {
    expect(eatFirstTipText("Grädde", 6)).toBe("Grädde har legat i 6 dagar. Rätterna med den står först.");
    expect(eatFirstTipText("Ägg", 1)).toBe("Ägg har legat i 1 dag. Rätterna med den står först.");
  });

  it("says how long in weeks and months", () => {
    expect(lainText(1)).toBe("en dag");
    expect(lainText(2)).toBe("2 dagar");
    expect(lainText(9)).toBe("en vecka");
    expect(lainText(13)).toBe("en vecka");
    expect(lainText(21)).toBe("3 veckor");
    expect(lainText(65)).toBe("2 månader");
  });

  it("writes the reason line with the longest wait", () => {
    expect(usesOldText([{ name: "Lime", days: 9 }, { name: "Koriander", days: 10 }])).toBe(
      "Använder lime och koriander som legat en vecka",
    );
    expect(usesOldText([{ name: "lime", days: 8 }, { name: "koriander", days: 9 }, { name: "gurka", days: 30 }])).toBe(
      "Använder lime, koriander och gurka som legat 4 veckor",
    );
    expect(usesOldText([])).toBeNull();
  });
});

describe("expiringPantryItems", () => {
  it("estimates the last day as added + the days it keeps, and takes what is due by `until`", () => {
    // now: Tuesday 27 Oct. Added today with 3 days: Friday 30 Oct.
    const items = [row("grädde", "Kyl", 0, "grädde", 3), row("mjölk", "Kyl", 6), row("lime", "Kyl", 9), row("ost", "Kyl", 0, "ost", 20), row("lax", "Frys", 1), row("pasta", "Skafferi", 5)];
    const result = expiringPantryItems(items, now, "2026-11-02");
    expect(result).toEqual([
      { ingredientId: "lime", name: "lime", expiresOn: "2026-10-25", overdue: true },
      { ingredientId: "mjölk", name: "mjölk", expiresOn: "2026-10-28", overdue: false },
      { ingredientId: "grädde", name: "grädde", expiresOn: "2026-10-30", overdue: false },
    ]);
  });

  it("keeps the earliest day per ingredient and skips rows without a readable time", () => {
    const items = [row("mjölk", "Kyl", 1, "m"), row("mjölk", "Kyl", 5, "m"), { ...row("x", "Kyl", null), createdAt: "inte ett datum" }];
    expect(expiringPantryItems(items, now, "2026-11-10")).toEqual([{ ingredientId: "m", name: "mjölk", expiresOn: "2026-10-29", overdue: false }]);
  });
});
