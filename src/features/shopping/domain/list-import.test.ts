import { describe, expect, it } from "vitest";
import {
  addedRowsText,
  addRowsText,
  existingLinesOf,
  itemsFromAi,
  maxImportItems,
  parseListText,
  reviewRows,
  rowToFormInput,
} from "./list-import";

const names = (text: string) => parseListText(text).map((item) => item.name);

describe("parseListText", () => {
  it("takes a line each and skips empty ones", () => {
    expect(names("mjölk\n\n  \nbröd\r\nsmör")).toEqual(["Mjölk", "Bröd", "Smör"]);
  });

  it.each([
    ["- Mjölk", "Mjölk"],
    ["• Mjölk", "Mjölk"],
    ["* Mjölk", "Mjölk"],
    ["☐ Mjölk", "Mjölk"],
    ["☑ Mjölk", "Mjölk"],
    ["[ ] Mjölk", "Mjölk"],
    ["[x] Mjölk", "Mjölk"],
    ["1. Mjölk", "Mjölk"],
    ["2) Mjölk", "Mjölk"],
    ["12. Mjölk", "Mjölk"],
    ["- [ ] Mjölk", "Mjölk"],
  ])("strips the decoration of %j", (line, name) => {
    expect(names(line)).toEqual([name]);
  });

  it("drops a line that is only decoration", () => {
    expect(names("- \n☐\n•\n---")).toEqual([]);
  });

  it("reads a leading amount and unit", () => {
    expect(parseListText("2 dl mjölk\n500 g smör\n1,5 kg potatis\n½ l grädde\n2dl vispgrädde")).toEqual([
      { name: "Mjölk", amount: 2, unit: "dl" },
      { name: "Smör", amount: 500, unit: "g" },
      { name: "Potatis", amount: 1.5, unit: "kg" },
      { name: "Grädde", amount: 0.5, unit: "l" },
      { name: "Vispgrädde", amount: 2, unit: "dl" },
    ]);
  });

  it("reads a trailing amount and unit", () => {
    expect(parseListText("Mjölk 2 l\nSmör (500 g)\nÄgg 12")).toEqual([
      { name: "Mjölk", amount: 2, unit: "l" },
      { name: "Smör", amount: 500, unit: "g" },
      { name: "Ägg", amount: 12, unit: "st" },
    ]);
  });

  it("takes a leading count without a unit as pieces and keeps the word", () => {
    expect(parseListText("3 bananer\n2 gula lökar\n4 mjölk")).toEqual([
      { name: "Bananer", amount: 3, unit: "st" },
      { name: "Gula lökar", amount: 2, unit: "st" },
      { name: "Mjölk", amount: 4, unit: "st" },
    ]);
  });

  it("combines decoration with an amount", () => {
    expect(parseListText("- [ ] 2 dl grädde")).toEqual([{ name: "Grädde", amount: 2, unit: "dl" }]);
  });

  it("leaves a name that only holds a number or a word after it as it is", () => {
    expect(parseListText("Coca-Cola 3%\nMjölk 3 gånger")).toEqual([
      { name: "Coca-Cola 3%", amount: null, unit: null },
      { name: "Mjölk 3 gånger", amount: null, unit: null },
    ]);
  });

  it("keeps each name once, in any case, and the first amount", () => {
    expect(parseListText("mjölk\n2 dl Mjölk\nMJÖLK\nbröd")).toEqual([
      { name: "Mjölk", amount: null, unit: null },
      { name: "Bröd", amount: null, unit: null },
    ]);
  });

  it("keeps at most maxImportItems", () => {
    const text = Array.from({ length: 80 }, (_, index) => `vara ${String.fromCharCode(97 + (index % 26))}${Math.floor(index / 26)}`).join("\n");
    expect(parseListText(text)).toHaveLength(maxImportItems);
  });

  it("gives nothing for empty text", () => {
    expect(parseListText("   \n\n")).toEqual([]);
  });
});

describe("itemsFromAi", () => {
  it("normalises units and keeps names once", () => {
    expect(
      itemsFromAi([
        { name: "mjölk", amount: 2, unit: "liter" },
        { name: "Mjölk", amount: null, unit: null },
        { name: "Ägg", amount: 6, unit: "näve" },
        { name: "  ", amount: null, unit: null },
        { name: "Kaffe" },
        { name: "Smör", amount: 0, unit: "g" },
      ]),
    ).toEqual([
      { name: "Mjölk", amount: 2, unit: "l" },
      { name: "Ägg", amount: null, unit: null },
      { name: "Kaffe", amount: null, unit: null },
      { name: "Smör", amount: null, unit: null },
    ]);
  });
});

describe("reviewRows", () => {
  const items = parseListText("Mjölk\nKaffe\nFlingor\nHavregryn");
  const existing = existingLinesOf([{ label: "mjölk" }, { label: "Cornflakes", ingredientId: "ing-flakes" }, { label: "Havre" }]);

  it("ticks every row, except what is on the list already", () => {
    const rows = reviewRows(items, [null, { id: "ing-coffee", name: "Kaffe" }, { id: "ing-flakes", name: "Flingor" }, { id: "ing-oats", name: "Havre" }], existing);
    expect(rows.map((row) => [row.name, row.exists, row.checked])).toEqual([
      ["Mjölk", true, false],
      ["Kaffe", false, true],
      // The same catalog ingredient as a line on the list.
      ["Flingor", true, false],
      // The catalog ingredient's name is a line's name.
      ["Havregryn", true, false],
    ]);
  });

  it("keeps the catalog link and a missing one", () => {
    const rows = reviewRows(items, [undefined, { id: "ing-coffee", name: "Kaffe" }], existingLinesOf([]));
    expect(rows[0]?.ingredient).toBeNull();
    expect(rows[1]?.ingredient).toEqual({ id: "ing-coffee", name: "Kaffe" });
    expect(rows.every((row) => row.checked && !row.exists)).toBe(true);
  });

  it("makes what addCustomItem takes", () => {
    const [row] = reviewRows(parseListText("1,5 dl grädde"), [{ id: "ing-cream", name: "Grädde" }], existingLinesOf([]));
    expect(rowToFormInput(row!, "3f0f1d34-0000-4000-8000-000000000000")).toEqual({
      id: "3f0f1d34-0000-4000-8000-000000000000",
      label: "Grädde",
      ingredientId: "ing-cream",
      amount: "1,5",
      unit: "dl",
    });
  });
});

describe("texts", () => {
  it("counts items", () => {
    expect(addRowsText(1)).toBe("Lägg till 1 vara");
    expect(addRowsText(3)).toBe("Lägg till 3 varor");
    expect(addedRowsText(1)).toBe("Lade till 1 vara på inköpslistan.");
    expect(addedRowsText(4)).toBe("Lade till 4 varor på inköpslistan.");
  });
});
