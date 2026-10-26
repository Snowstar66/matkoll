import { describe, expect, it } from "vitest";
import { SECTIONS, toSection } from "./sections";

describe("SECTIONS", () => {
  it("has the fixed order from AD-12", () => {
    expect(SECTIONS).toEqual([
      "Frukt och grönt",
      "Bröd",
      "Mejeri",
      "Kött och fisk",
      "Chark",
      "Frys",
      "Skafferi",
      "Dryck",
      "Övrigt",
    ]);
  });
});

describe("toSection", () => {
  it.each([
    ["mejeri", "Mejeri"],
    ["Frukt & grönt", "Frukt och grönt"],
    ["frukt och grönt", "Frukt och grönt"],
    ["kött", "Kött och fisk"],
    ["Kött & fisk", "Kött och fisk"],
    ["kryddor", "Skafferi"],
    ["torrvaror", "Skafferi"],
    ["Chark", "Chark"],
    ["fryst", "Frys"],
    ["drycker", "Dryck"],
    ["  BRÖD ", "Bröd"],
  ])("%s → %s", (raw, section) => {
    expect(toSection(raw)).toBe(section);
  });

  it("composes decomposed letters", () => {
    expect(toSection("O\u0308vrigt")).toBe("Övrigt");
    expect(toSection("bro\u0308d")).toBe("Bröd");
  });

  it.each(["okänt", "", "constructor", "__proto__", "toString", null, undefined])("%s → Övrigt", (raw) => {
    expect(toSection(raw)).toBe("Övrigt");
  });

  it("knows every section by its own name", () => {
    for (const section of SECTIONS) expect(toSection(section)).toBe(section);
  });
});
