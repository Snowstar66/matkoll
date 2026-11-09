import { describe, expect, it } from "vitest";
import { dish, person } from "./fixtures";
import { addTag, matchPreference, maxTagLength, maxTags, normalizeText, parseTags, softFitFor } from "./preferences";

const d = (patch: Parameters<typeof dish>[0]) => dish({ kategori: "ej_tillampligt", forklaring: "", ...patch });

describe("normalizeText", () => {
  it("lower-cases, drops accents but keeps å, ä, ö", () => {
    expect(normalizeText("Champiñón ÅÄÖ Café")).toBe("champinon åäö cafe");
  });
});

describe("matchPreference", () => {
  it("matches a whole word and the start of a compound word", () => {
    expect(matchPreference("vitlök", d({ originalnamn: "Vitlökssås" }))).toBe(true);
    expect(matchPreference("vitlök", d({ originalnamn: "Bröd", huvudingredienser: ["vitlök", "smör"] }))).toBe(true);
    expect(matchPreference("Vitlök", d({ originalnamn: "Bröd", forklaring: "Serveras med vitlöksmajonnäs." }))).toBe(true);
  });

  it("does not match in the middle of a word", () => {
    expect(matchPreference("ris", d({ originalnamn: "Grisfötter" }))).toBe(false);
    expect(matchPreference("ris", d({ originalnamn: "Paris-bricka" }))).toBe(false);
    expect(matchPreference("ris", d({ originalnamn: "Ris med curry" }))).toBe(true);
    expect(matchPreference("lök", d({ originalnamn: "Vitlöksbröd" }))).toBe(false);
    expect(matchPreference("ost", d({ originalnamn: "Ostron" }))).toBe(false);
    expect(matchPreference("ägg", d({ originalnamn: "Äggplanta" }))).toBe(false);
  });

  it("finds synonyms both ways in Swedish, English and Spanish", () => {
    expect(matchPreference("koriander", d({ originalnamn: "Salsa", huvudingredienser: ["cilantro"] }))).toBe(true);
    expect(matchPreference("cilantro", d({ originalnamn: "Dip med koriander" }))).toBe(true);
    expect(matchPreference("garlic", d({ originalnamn: "Gambas al ajillo", forklaring: "Räkor med ajo." }))).toBe(true);
    expect(matchPreference("vitlök", d({ originalnamn: "Gambas al ajo" }))).toBe(true);
    expect(matchPreference("svamp", d({ originalnamn: "Champiñones al ajillo" }))).toBe(true);
    expect(matchPreference("paprika", d({ originalnamn: "Stuffed bell pepper" }))).toBe(true);
    expect(matchPreference("queso", d({ originalnamn: "Ost på bröd" }))).toBe(true);
    expect(matchPreference("lök", d({ originalnamn: "Cebolla frita" }))).toBe(true);
    expect(matchPreference("lök", d({ originalnamn: "Rödlök i sallad" }))).toBe(true);
  });

  it("is a soft match for paprika and paprikapulver", () => {
    expect(matchPreference("paprika", d({ originalnamn: "Gryta", huvudingredienser: ["paprikapulver"] }))).toBe(true);
  });

  it("matches dishes by name and keeps chili apart from kryddstarkt", () => {
    expect(matchPreference("nasi goreng", d({ originalnamn: "Nasi Goreng Special" }))).toBe(true);
    expect(matchPreference("nasi goreng", d({ originalnamn: "Nasi med ris" }))).toBe(false);
    expect(matchPreference("kryddstarkt", d({ originalnamn: "Pollo picante" }))).toBe(true);
    expect(matchPreference("chili", d({ originalnamn: "Stark gryta" }))).toBe(false);
  });

  it("lets fisk and skaldjur use the dish category", () => {
    expect(matchPreference("fisk", d({ originalnamn: "Dorada", kategori: "fisk" }))).toBe(true);
    expect(matchPreference("skaldjur", d({ originalnamn: "Pulpo", kategori: "skaldjur" }))).toBe(true);
    expect(matchPreference("fisk", d({ originalnamn: "Biff", kategori: "kott" }))).toBe(false);
  });

  it("matches an unknown free word as itself", () => {
    expect(matchPreference("rödbetor", d({ originalnamn: "Rödbetor med fetaost" }))).toBe(true);
    expect(matchPreference("", d({ originalnamn: "Biff" }))).toBe(false);
  });
});

describe("tags", () => {
  it("parses stored lists: trimmed, no repeats, no markup, limits, bad types", () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags("x")).toEqual([]);
    expect(parseTags([" Koriander ", "koriander", 5, "<b>x</b>", "", "x".repeat(maxTagLength + 1), "Nasi  goreng"])).toEqual(["Koriander", "Nasi goreng"]);
    expect(parseTags(Array.from({ length: 50 }, (_, i) => `tag${i}`))).toHaveLength(maxTags);
  });

  it("addTag trims, keeps the spelling and refuses repeats, long and full", () => {
    expect(addTag([], "  Vitlök ").tags).toEqual(["Vitlök"]);
    expect(addTag(["Vitlök"], "vitlök").error).toMatch(/redan/);
    expect(addTag([], "x".repeat(maxTagLength + 1)).error).toMatch(/Max/);
    expect(addTag([], "<script>").error).not.toBeNull();
    expect(addTag(Array.from({ length: maxTags }, (_, i) => `t${i}`), "ny").error).toMatch(/Max/);
    expect(addTag(["a"], "   ")).toEqual({ tags: ["a"], error: null });
  });
});

describe("softFitFor", () => {
  it("names what each person avoids and loves in a dish, dislike winning over a like of the same word", () => {
    const anna = person({ id: "a", name: "Anna", dislikes: ["vitlök"], likes: ["paprika", "Vitlök"] });
    const bo = person({ id: "b", name: "Bo" });
    const fits = softFitFor(d({ originalnamn: "Paprikagryta", huvudingredienser: ["vitlök"] }), [anna, bo]);
    expect(fits).toEqual([{ person: anna, dislikes: ["vitlök"], likes: ["paprika"] }]);
  });
});
