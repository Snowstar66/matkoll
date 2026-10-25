import { describe, expect, it } from "vitest";
import { LOCATIONS, toLocation } from "./locations";
import { SECTIONS, type Section } from "./sections";

describe("LOCATIONS", () => {
  it("is Kyl, Frys, Skafferi", () => {
    expect(LOCATIONS).toEqual(["Kyl", "Frys", "Skafferi"]);
  });
});

describe("toLocation", () => {
  it.each([
    ["kylskåp", "Kyl"],
    ["frysen", "Frys"],
    ["torrvaror", "Skafferi"],
    ["Kyl", "Kyl"],
    [" SKAFFERI ", "Skafferi"],
  ])("%s → %s", (raw, location) => {
    expect(toLocation(raw, "Övrigt")).toBe(location);
  });

  it("composes decomposed letters", () => {
    expect(toLocation("kylska\u030ap", "Övrigt")).toBe("Kyl");
  });

  it.each(["constructor", "__proto__", "toString"])("does not treat %s as a location", (raw) => {
    expect(toLocation(raw, "Mejeri")).toBe("Kyl");
    expect(toLocation(raw, "Bröd")).toBe("Skafferi");
  });

  it("prefers a known location over the section", () => {
    expect(toLocation("skafferi", "Mejeri")).toBe("Skafferi");
  });

  const fromSection: Record<Section, string> = {
    "Frukt och grönt": "Skafferi",
    Bröd: "Skafferi",
    Mejeri: "Kyl",
    "Kött och fisk": "Kyl",
    Chark: "Kyl",
    Frys: "Frys",
    Skafferi: "Skafferi",
    Dryck: "Skafferi",
    Övrigt: "Skafferi",
  };

  it.each(SECTIONS)("an unknown location in %s follows the section", (section) => {
    expect(toLocation("okänt", section)).toBe(fromSection[section]);
    expect(toLocation(null, section)).toBe(fromSection[section]);
  });
});
