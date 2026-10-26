import { describe, expect, it } from "vitest";
import { ingredientChoiceSchema, lookupKeys, matchAgainst, proposalFrom, type CatalogSnapshot } from "./match";

const gulLok = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const rodlok = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";
const vitlok = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a03";
const salt = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a04";

const snapshot: CatalogSnapshot = {
  ingredients: new Map([
    ["gul lök", gulLok],
    ["rödlök", rodlok],
    ["vitlök", vitlok],
  ]),
  synonyms: new Map([
    ["lök", gulLok],
    ["rödlök", gulLok],
    ["havssalt", salt],
  ]),
};

const hint = (name: string, section = "kryddor", location = "skafferi", defaultUnit = "g") => ({
  name,
  section,
  location,
  defaultUnit,
});

describe("matchAgainst", () => {
  it("matches the normalised name exactly", () => {
    expect(matchAgainst([{ text: "Gul lök" }], snapshot)).toEqual([
      { kind: "match", ingredientId: gulLok, confidence: "exact" },
    ]);
  });

  it("matches a synonym", () => {
    expect(matchAgainst([{ text: "Lök, hackad" }], snapshot)).toEqual([
      { kind: "match", ingredientId: gulLok, confidence: "synonym" },
    ]);
  });

  it("prefers the name over a synonym", () => {
    expect(matchAgainst([{ text: "1 rödlök" }], snapshot)[0]).toEqual({
      kind: "match",
      ingredientId: rodlok,
      confidence: "exact",
    });
  });

  it("matches the hint's name when the text does not match", () => {
    expect(matchAgainst([{ text: "2 vitlöksklyftor", hint: hint("Vitlök") }], snapshot)[0]).toEqual({
      kind: "match",
      ingredientId: vitlok,
      confidence: "hint",
    });
    expect(matchAgainst([{ text: "Flingsalt", hint: hint("havssalt") }], snapshot)[0]).toEqual({
      kind: "match",
      ingredientId: salt,
      confidence: "hint",
    });
  });

  it("prefers the text over the hint", () => {
    expect(matchAgainst([{ text: "Lök", hint: hint("vitlök") }], snapshot)[0]).toEqual({
      kind: "match",
      ingredientId: gulLok,
      confidence: "synonym",
    });
  });

  it("prefers the hint's exact name over its synonym", () => {
    const both: CatalogSnapshot = { ingredients: new Map([["salt", salt]]), synonyms: new Map([["salt", gulLok]]) };
    expect(matchAgainst([{ text: "x", hint: hint("Salt") }], both)[0]).toMatchObject({ ingredientId: salt });
  });

  it("proposes a new ingredient from the hint, keeping the name's casing", () => {
    expect(matchAgainst([{ text: "saffran", hint: hint("Saffran") }], snapshot)).toEqual([
      { kind: "new", proposal: { name: "Saffran", section: "Skafferi", location: "Skafferi", defaultUnit: "g" } },
    ]);
  });

  it("uses Övrigt and no unit when the hint has unknown values", () => {
    expect(matchAgainst([{ text: "1 yuzu", hint: hint("Yuzu", "exotiskt", "okänt", "näve") }], snapshot)[0]).toEqual({
      kind: "new",
      proposal: { name: "Yuzu", section: "Övrigt", location: "Skafferi", defaultUnit: null },
    });
  });

  it("proposes from the cleaned text when there is no hint", () => {
    expect(matchAgainst([{ text: "2 dl Havremjölk" }], snapshot)[0]).toEqual({
      kind: "new",
      proposal: { name: "Havremjölk", section: "Övrigt", location: "Skafferi", defaultUnit: null },
    });
  });

  it("is unmatched without usable text or hint, and never matches empty text", () => {
    const empty: CatalogSnapshot = { ingredients: new Map([["", gulLok]]), synonyms: new Map([["", gulLok]]) };
    expect(matchAgainst([{ text: "  " }, { text: "2 dl", hint: hint(" ") }], empty)).toEqual([
      { kind: "unmatched" },
      { kind: "unmatched" },
    ]);
  });

  it("proposes from the hint when the text is empty", () => {
    expect(matchAgainst([{ text: "", hint: hint("Salt") }], snapshot)[0]).toMatchObject({
      kind: "new",
      proposal: { name: "Salt" },
    });
  });

  it("keeps the order of the items", () => {
    const result = matchAgainst([{ text: "saffran" }, { text: "gul lök" }, { text: "" }, { text: "lök" }], snapshot);
    expect(result.map((match) => match.kind)).toEqual(["new", "match", "unmatched", "match"]);
  });
});

describe("lookupKeys", () => {
  it("gives each line's normalised text and hint name", () => {
    expect(lookupKeys([{ text: "2 Vitlöksklyftor", hint: hint("Vitlök") }, { text: "Salt" }])).toEqual([
      "vitlöksklyftor",
      "vitlök",
      "salt",
      "",
    ]);
  });
});

describe("proposalFrom", () => {
  it("cleans the hint's name", () => {
    expect(proposalFrom({ text: "x", hint: hint(" Gul Lök ", "Frukt & grönt", "", "st") })).toEqual({
      name: "Gul Lök",
      section: "Frukt och grönt",
      location: "Skafferi",
      defaultUnit: "st",
    });
  });

  it("puts dairy in the fridge when the hint has no location", () => {
    expect(proposalFrom({ text: "x", hint: hint("Grädde", "mejeri", "?", "dl") })?.location).toBe("Kyl");
  });

  it("gives null without a name", () => {
    expect(proposalFrom({ text: "(valfritt)" })).toBeNull();
  });
});

describe("ingredientChoiceSchema", () => {
  it("accepts a kept match, a new proposal, a chosen ingredient and unmatched", () => {
    for (const ingredient of [
      { kind: "match", ingredientId: gulLok, confidence: "synonym" },
      { kind: "match", ingredientId: gulLok, confidence: "hint" },
      { kind: "new", proposal: { name: "Saffran", section: "Skafferi", location: "Skafferi", defaultUnit: null } },
      { kind: "chosen", ingredientId: rodlok },
      { kind: "unmatched" },
    ]) {
      expect(ingredientChoiceSchema.safeParse({ text: "x", ingredient }).success).toBe(true);
    }
  });

  it("rejects a proposal without a name or with an unknown section", () => {
    const proposal = { name: " ", section: "Skafferi", location: "Skafferi", defaultUnit: null };
    expect(ingredientChoiceSchema.safeParse({ text: "x", ingredient: { kind: "new", proposal } }).success).toBe(false);
    expect(
      ingredientChoiceSchema.safeParse({ text: "x", ingredient: { kind: "new", proposal: { ...proposal, name: "a", section: "Kryddor" } } }).success,
    ).toBe(false);
  });
});
