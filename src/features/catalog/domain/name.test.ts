import { describe, expect, it } from "vitest";
import { catalogNameCases } from "../../../../tests/fixtures/catalog-name-cases";
import { catalogName, nameInSentence, nameInText, sentenceStart } from "./name";
import { normalizeIngredientText } from "./normalize";

describe("catalogName (Story 10.4)", () => {
  it.each(catalogNameCases)("stores %j as %j", (input, stored) => {
    expect(catalogName(input)).toBe(stored);
  });

  it("trims first", () => {
    expect(catalogName("  smör ")).toBe("Smör");
    expect(catalogName("")).toBe("");
  });

  it("never changes the normalised name", () => {
    for (const [input] of catalogNameCases) {
      expect(normalizeIngredientText(catalogName(input))).toBe(normalizeIngredientText(input));
    }
  });

  it("is idempotent", () => {
    for (const [input] of catalogNameCases) expect(catalogName(catalogName(input))).toBe(catalogName(input));
  });
});

describe("nameInSentence (Story 10.4)", () => {
  it("starts a catalog name inside a sentence in lower case", () => {
    expect(nameInSentence("Mjölk")).toBe("mjölk");
    expect(nameInSentence("Ägg")).toBe("ägg");
    expect(nameInSentence("Gul lök")).toBe("gul lök");
    expect(nameInSentence("(Eko) mjölk")).toBe("(eko) mjölk");
    expect(nameInSentence("diskmedel")).toBe("diskmedel");
    expect(nameInSentence("2 citroner")).toBe("2 citroner");
  });

  it("keeps a word of its own: mixed case, capitals, or one letter before a hyphen", () => {
    for (const name of ["Coca-Cola", "McCain", "ICA-korv", "BBQ-sås", "HP-sås", "ICA:s korv", "D-vitamin", "A-fil", "K-märkt"]) {
      expect(nameInSentence(name)).toBe(name);
    }
  });
});

describe("sentenceStart and nameInText (Story 10.4)", () => {
  it("gives a sentence's first name a capital, unless its first word is mixed case", () => {
    expect(sentenceStart("diskmedel")).toBe("Diskmedel");
    expect(sentenceStart("iPhone-laddare")).toBe("iPhone-laddare");
    expect(sentenceStart("2 citroner")).toBe("2 citroner");
  });

  it("lowers a catalog name inside a sentence, never the user's own text", () => {
    expect(nameInText("Kaffe", "inside")).toBe("kaffe");
    expect(nameInText({ text: "Kaffe från Gevalia", own: true }, "inside")).toBe("Kaffe från Gevalia");
    expect(nameInText({ text: "diskmedel", own: true }, "start")).toBe("Diskmedel");
  });
});
