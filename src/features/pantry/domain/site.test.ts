import { describe, expect, it } from "vitest";
import {
  defaultSiteName,
  maxSiteNameChars,
  maxSites,
  normalizeSiteName,
  pantrySiteRowSchema,
  shownSiteName,
  siteLineText,
  siteSuffix,
} from "./site";

describe("siteLineText, siteSuffix and shownSiteName", () => {
  const stugan = { id: "11111111-1111-4111-8111-111111111111", name: "Stugan", siteCount: 2 };

  it("name the place when there is more than one", () => {
    expect(siteLineText(stugan)).toBe("Lager: Stugan");
    expect(siteSuffix(stugan)).toBe(" för Stugan");
    expect(shownSiteName(stugan)).toBe("Stugan");
    expect(siteLineText({ ...stugan, name: "Hemma", siteCount: 10 })).toBe("Lager: Hemma");
  });

  it("name nothing with one place, or none, as in 1.0", () => {
    for (const site of [{ ...stugan, name: "Hemma", siteCount: 1 }, { ...stugan, siteCount: 0 }, null]) {
      expect(siteLineText(site)).toBeNull();
      expect(siteSuffix(site)).toBe("");
      expect(shownSiteName(site)).toBeNull();
    }
  });

  it("keep a long name whole, so the line wraps rather than cuts it", () => {
    const name = "a".repeat(maxSiteNameChars);
    expect(siteLineText({ ...stugan, name })).toBe(`Lager: ${name}`);
  });
});

describe("normalizeSiteName", () => {
  it.each([
    ["  Stugan ", "stugan"],
    ["STUGAN", "stugan"],
    ["Stu  gan", "stu gan"],
    ["Hemma", "hemma"],
    ["ÅRE", "åre"],
    ["Torp\tvid\nsjön", "torp vid sjön"],
  ])("gives %j as %j", (name, normalized) => {
    expect(normalizeSiteName(name)).toBe(normalized);
  });

  it("gives the same name for a composed and a decomposed letter", () => {
    const ring = String.fromCodePoint(0x030a);
    const aRing = String.fromCodePoint(0x00c5);
    expect(normalizeSiteName(`A${ring}re`)).toBe(normalizeSiteName(`${aRing}re`));
  });

  it("gives hemma for the first place", () => {
    expect(defaultSiteName).toBe("Hemma");
    expect(normalizeSiteName(defaultSiteName)).toBe("hemma");
  });

  it("has the limits from AD-24", () => {
    expect(maxSiteNameChars).toBe(40);
    expect(maxSites).toBe(10);
  });
});

describe("pantrySiteRowSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("reads a row as a place", () => {
    expect(pantrySiteRowSchema.parse({ id, name: "Stugan", is_selected: true })).toEqual({
      id,
      name: "Stugan",
      isSelected: true,
    });
  });

  it.each([
    { id: "x", name: "Stugan", is_selected: false },
    { id, name: "", is_selected: false },
    { id, name: "a".repeat(41), is_selected: false },
    { id, name: "Stugan", is_selected: null },
  ])("refuses %j", (row) => {
    expect(pantrySiteRowSchema.safeParse(row).success).toBe(false);
  });
});
