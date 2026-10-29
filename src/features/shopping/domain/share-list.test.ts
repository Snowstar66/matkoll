import { describe, expect, it } from "vitest";
import type { ShoppingLine } from "./compute-list";
import { shareListText } from "./share-list";

const line = (overrides: Partial<ShoppingLine>): ShoppingLine => ({
  key: "r:x:st",
  label: "X",
  amount: 1,
  unit: "st",
  isVague: false,
  coverage: { kind: "missing" },
  section: "Övrigt",
  origins: [],
  checked: false,
  isCustom: false,
  ...overrides,
});

describe("shareListText (Story 14.2)", () => {
  it("groups by department with plain lines and no store format", () => {
    const text = shareListText([
      line({ label: "Gul lök", section: "Frukt och grönt", amount: 1, unit: "st" }),
      line({ label: "Persilja", section: "Frukt och grönt", amount: null, unit: null, isVague: true }),
      line({ label: "Grädde", section: "Mejeri", amount: 2, unit: "dl" }),
    ]);
    expect(text).toBe("Frukt & grönt\n- Gul lök 1 st\n- Persilja\n\nMejeri & ägg\n- Grädde 2 dl");
    expect(text).not.toContain("Matkoll");
  });

  it("keeps lines without an amount, so Persilja and Smör are shared (Story 16.5)", () => {
    const text = shareListText([
      line({ label: "Persilja", section: "Frukt och grönt", amount: null, unit: null, isVague: true }),
      line({ label: "Smör", section: "Mejeri", amount: null, unit: null, isVague: true }),
      line({ label: "Falukorv", section: "Kött och fisk", amount: 500, unit: "g" }),
    ]);
    expect(text).toContain("- Persilja");
    expect(text).toContain("- Smör");
    expect(text).toContain("- Falukorv 500 g");
  });

  it("leaves out checked lines, and a department left empty", () => {
    const text = shareListText([
      line({ label: "Gul lök", section: "Frukt och grönt", checked: true }),
      line({ label: "Grädde", section: "Mejeri", amount: 2, unit: "dl" }),
    ]);
    expect(text).toBe("Mejeri & ägg\n- Grädde 2 dl");
  });

  it("gives an empty text for no lines", () => {
    expect(shareListText([])).toBe("");
    expect(shareListText([line({ checked: true })])).toBe("");
  });
});
