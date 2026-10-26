import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import {
  checkLabel,
  groupBySection,
  itemsLeft,
  itemsLeftText,
  lineAmountText,
  listSummaryText,
  originsText,
  recountedText,
  restoreFailedText,
  skippedDishesText,
} from "./list-text";

const line = (overrides: Partial<ShoppingLine>): ShoppingLine => ({
  key: "r:x:dl",
  label: "X",
  amount: 1,
  unit: "dl",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom: false,
  ...overrides,
});

describe("list texts", () => {
  it("says how many items are left", () => {
    expect(itemsLeftText(1)).toBe("1 vara kvar");
    expect(itemsLeftText(12)).toBe("12 varor kvar");
    expect(itemsLeftText(0)).toBe("0 varor kvar");
    expect(itemsLeft([line({}), line({ checked: true }), line({})])).toBe(2);
  });

  it("sums up the plan under the title", () => {
    expect(listSummaryText("Vecka 44", 3, 12)).toBe("Vecka 44 · 3 rätter · 12 varor kvar");
    expect(listSummaryText("Vecka 44", 1, 1)).toBe("Vecka 44 · 1 rätt · 1 vara kvar");
    // Only own items: no dish part.
    expect(listSummaryText("Vecka 44", 0, 1)).toBe("Vecka 44 · 1 vara kvar");
  });

  it("names the items Ångra could not put back", () => {
    expect(restoreFailedText([])).toBe("Det gick inte att ångra.");
    expect(restoreFailedText(["diskmedel"])).toBe("Det gick inte att ångra diskmedel.");
    expect(restoreFailedText(["diskmedel", "Kaffe"])).toBe("Det gick inte att ångra diskmedel och Kaffe.");
    expect(restoreFailedText(["a", "b", "c"])).toBe("Det gick inte att ångra 3 varor.");
  });

  it("announces a recount with the items left", () => {
    expect(recountedText(4)).toBe("Inköpslistan är omräknad. 4 varor kvar.");
  });

  it("names the dishes a line comes from, each title once", () => {
    const titles = { d1: "Krämig kycklinggryta", d2: "Linssoppa", d3: "Linssoppa" };
    expect(originsText(["d1"], titles)).toBe("från Krämig kycklinggryta");
    expect(originsText(["d2", "d1", "d3"], titles)).toBe("från Linssoppa, Krämig kycklinggryta");
    expect(originsText(["okand"], titles)).toBeNull();
    expect(originsText([], titles)).toBeNull();
  });

  it("shows the amount, the pantry beside it, or Finns hemma?", () => {
    expect(lineAmountText(line({ amount: 3, unit: "dl" }))).toBe("3 dl");
    expect(lineAmountText(line({ amount: 1.25, unit: "dl" }))).toBe("1,25 dl");
    expect(lineAmountText(line({ amount: 2, unit: "dl", pantryNote: "hemma: 1 kg" }))).toBe("2 dl (hemma: 1 kg)");
    expect(lineAmountText(line({ amount: null, unit: null, isVague: true }))).toBe("Finns hemma?");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" } }))).toBe("");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 2 }))).toBe("×2");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 1.5 }))).toBe("×1,5");
    expect(lineAmountText(line({ amount: null, unit: null, coverage: { kind: "unlinked" }, multiplier: 1 }))).toBe("");
  });

  it("says how many dishes with deleted recipes are left out", () => {
    expect(skippedDishesText(1)).toBe("1 rätt med borttaget recept räknas inte.");
    expect(skippedDishesText(2)).toBe("2 rätter med borttagna recept räknas inte.");
  });

  it("never drops a line in a section outside SECTIONS: it is shown under Övrigt", () => {
    const groups = groupBySection([
      line({ key: "a", section: "Kyldisk" as ShoppingLine["section"] }),
      line({ key: "b", section: "Övrigt" }),
      line({ key: "c", section: "Mejeri" }),
    ]);
    expect(groups.map(({ section, lines }) => [section, lines.map((item) => item.key)])).toEqual([
      ["Mejeri", ["c"]],
      ["Övrigt", ["a", "b"]],
    ]);
  });

  it("groups lines by section in the fixed order, keeping their order", () => {
    const groups = groupBySection([
      line({ key: "a", section: "Mejeri" }),
      line({ key: "b", section: "Frukt och grönt" }),
      line({ key: "c", section: "Mejeri" }),
      line({ key: "d", section: "Övrigt" }),
    ]);
    expect(groups.map(({ section, lines }) => [section, lines.map((item) => item.key)])).toEqual([
      ["Frukt och grönt", ["b"]],
      ["Mejeri", ["a", "c"]],
      ["Övrigt", ["d"]],
    ]);
  });

  it("names the check by the line's name and what it shows to the right", () => {
    expect(checkLabel(line({ label: "Paprika, röd", amount: 1, unit: "st" }))).toBe("Paprika, röd, 1 st");
    expect(checkLabel(line({ label: "Mjöl", amount: 2, unit: "dl", pantryNote: "hemma: 1 kg" }))).toBe(
      "Mjöl, 2 dl (hemma: 1 kg)",
    );
    expect(checkLabel(line({ label: "Salt", amount: null, unit: null, isVague: true }))).toBe("Salt, finns hemma?");
    expect(checkLabel(line({ label: "En näve persilja", amount: null, unit: null }))).toBe("En näve persilja");
    expect(checkLabel(line({ label: "2 citroner", amount: null, unit: null, multiplier: 2 }))).toBe("2 citroner, ×2");
  });
});
