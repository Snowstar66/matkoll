import { describe, expect, it } from "vitest";
import { fitRank, foodFit, foodPrefsOf, hasAllergyNote, hasFitPreferences, lineHasAllergen, rankByFit, recipeFits, type FitPerson } from "./dish-fit";

const person = (name: string, own: Partial<Omit<FitPerson, "name">> = {}): FitPerson => ({ name, allergies: [], dislikes: [], likes: [], ...own });
const gryta = { name: "Kycklinggryta", ingredients: ["600 g kycklingfilé", "2 vitlöksklyftor", "2 dl grädde", "1 röd paprika", "1 knippe koriander"] };

describe("foodFit", () => {
  it("has no notes when nobody has anything filled in", () => {
    expect(foodFit(gryta, [])).toEqual([]);
    expect(foodFit(gryta, [person("Anna")])).toEqual([]);
  });

  it("says who avoids what, with the same matching as the menu advisor (a word or the start of one)", () => {
    expect(foodFit(gryta, [person("Anna", { dislikes: ["Vitlök", "koriander"] })])).toEqual([{ kind: "dislike", text: "Anna undviker vitlök och koriander" }]);
    // "ris" is not "grisfötter"-style hits, and "ost" is not "ostron": the advisor's rules.
    expect(foodFit({ name: "Ostron", ingredients: ["12 ostron"] }, [person("Anna", { dislikes: ["ost"] })])).toEqual([]);
  });

  it("finds a synonym (cilantro for koriander) and names what is loved", () => {
    expect(foodFit(gryta, [person("Bo", { dislikes: ["cilantro"], likes: ["paprika", "lax"] })])).toEqual([
      { kind: "dislike", text: "Bo undviker cilantro" },
      { kind: "like", text: "Bo älskar paprika" },
    ]);
  });

  it("does not call the same word both avoided and loved", () => {
    expect(foodFit(gryta, [person("Cia", { dislikes: ["paprika"], likes: ["paprika"] })])).toEqual([{ kind: "dislike", text: "Cia undviker paprika" }]);
  });

  it("gives one allergy note per allergen with everyone it concerns, first, in red words", () => {
    const notes = foodFit(gryta, [person("Anna", { allergies: ["laktos"], dislikes: ["vitlök"] }), person("Bo", { allergies: ["laktos", "fisk"] })]);
    expect(notes).toEqual([
      { kind: "allergy", text: "Kan innehålla laktos (Anna, Bo)" },
      { kind: "dislike", text: "Anna undviker vitlök" },
    ]);
    expect(hasAllergyNote(notes)).toBe(true);
  });

  it("matches the dish's name too, and keeps at most three tags in a note", () => {
    expect(foodFit({ name: "Pasta carbonara", ingredients: [] }, [person("Anna", { dislikes: ["pasta"] })])).toEqual([{ kind: "dislike", text: "Anna undviker pasta" }]);
    const four = foodFit({ name: "Mix", ingredients: ["lök", "vitlök", "paprika", "tomat"] }, [person("Anna", { dislikes: ["lök", "vitlök", "paprika", "tomat"] })]);
    expect(four).toEqual([{ kind: "dislike", text: "Anna undviker lök, vitlök och paprika" }]);
  });
});

describe("lineHasAllergen", () => {
  it.each([
    ["gluten", "400 g pasta", true],
    ["gluten", "2 dl vetemjöl", true],
    ["gluten", "2 dl mjölk", false],
    ["gluten", "4 skivor surdegsbröd", true],
    ["gluten", "400 g glutenfri pasta", false],
    ["gluten", "2 dl majsmjöl", false],
    ["laktos", "2 dl grädde", true],
    ["laktos", "100 g riven ost", true],
    ["laktos", "3 dl laktosfri mjölk", false],
    ["laktos", "12 ostron", false],
    ["laktos", "2 smörgåsar", false],
    ["notter", "1 dl hackade valnötter", true],
    ["notter", "500 g mandelpotatis", false],
    ["notter", "500 g nötfärs", false],
    ["skaldjur", "300 g räkor", true],
    ["fisk", "400 g laxfilé", true],
    ["agg", "4 ägg", true],
    ["agg", "1 äggplanta", false],
    ["soja", "2 msk sojasås", true],
    ["sesam", "1 msk tahini", true],
  ] as const)("%s in %s: %s", (allergen, line, expected) => {
    expect(lineHasAllergen(allergen, line)).toBe(expected);
  });
});

describe("fitRank and rankByFit", () => {
  it("ranks an allergy lowest, then an Undviker, then nothing, then only Älskar", () => {
    expect(fitRank([{ kind: "allergy", text: "a" }, { kind: "like", text: "b" }])).toBe(-2);
    expect(fitRank([{ kind: "dislike", text: "a" }, { kind: "like", text: "b" }])).toBe(-1);
    expect(fitRank([])).toBe(0);
    expect(fitRank([{ kind: "like", text: "b" }])).toBe(1);
  });

  it("keeps the order when no item has a note, and otherwise keeps the given order among equals", () => {
    const items = ["a", "b", "c", "d"];
    expect(rankByFit(items, () => [])).toEqual(items);
    const notes: Record<string, { kind: "dislike" | "like"; text: string }[]> = { a: [{ kind: "dislike", text: "x" }], c: [{ kind: "like", text: "y" }] };
    expect(rankByFit(items, (item) => notes[item] ?? [])).toEqual(["c", "b", "d", "a"]);
  });
});

describe("recipeFits", () => {
  const recipes = [
    { id: "r1", title: "Gryta", lines: [{ originalText: "2 vitlöksklyftor" }] },
    { id: "r2", title: "Soppa", lines: [{ originalText: "1 lök" }] },
  ];
  it("gives the notes of the recipes that have any, by id", () => {
    expect(recipeFits(recipes, [person("Anna", { dislikes: ["vitlök"] })])).toEqual({ r1: [{ kind: "dislike", text: "Anna undviker vitlök" }] });
  });
  it("gives {} for a household with nothing filled in", () => {
    expect(recipeFits(recipes, [person("Anna")])).toEqual({});
    expect(recipeFits(recipes, [])).toEqual({});
  });
});

describe("foodPrefsOf", () => {
  it("is null when nothing is filled in", () => {
    expect(foodPrefsOf([person("Anna")])).toBeNull();
    expect(hasFitPreferences([person("Anna")])).toBe(false);
  });

  it("gives the lists without names, each word once, in lower case, and Älskar without what someone avoids", () => {
    const prefs = foodPrefsOf([
      person("Anna", { allergies: ["laktos", "notter"], dislikes: ["Koriander"], likes: ["Paprika", "Svamp"] }),
      person("Bo", { allergies: ["laktos"], dislikes: ["koriander", "svamp"], likes: ["paprika"] }),
    ]);
    expect(prefs).toEqual({ allergies: ["laktos", "nötter"], avoid: ["koriander", "svamp"], love: ["paprika"] });
    expect(JSON.stringify(prefs)).not.toMatch(/Anna|Bo/);
  });

  it("sends at most twelve words per list", () => {
    const many = Array.from({ length: 20 }, (_, index) => `tag${index}`);
    expect(foodPrefsOf([person("Anna", { dislikes: many })])?.avoid).toHaveLength(12);
  });
});
