import { describe, expect, it } from "vitest";
import { catalogName, nameInSentence } from "./name";
import { normalizeIngredientText } from "./normalize";

describe("catalogName (Story 10.4)", () => {
  it("gives the first letter a capital and keeps the rest as written", () => {
    expect(catalogName("bregott")).toBe("Bregott");
    expect(catalogName("mellanmjölk")).toBe("Mellanmjölk");
    expect(catalogName("gul lök")).toBe("Gul lök");
    expect(catalogName("iPhone-laddare")).toBe("IPhone-laddare");
    expect(catalogName("Coca-Cola Zero 33 cl")).toBe("Coca-Cola Zero 33 cl");
  });

  it("handles å, ä, ö and other letters by Swedish rules", () => {
    expect(catalogName("ägg")).toBe("Ägg");
    expect(catalogName("åkerbär")).toBe("Åkerbär");
    expect(catalogName("ölkorv")).toBe("Ölkorv");
    expect(catalogName("éclair")).toBe("Éclair");
    // A decomposed "å" (a and a combining ring) is composed first.
    expect(catalogName("åkerbär")).toBe("Åkerbär");
  });

  it("trims, and leaves a name without a lowercase first letter as it is", () => {
    expect(catalogName("  smör ")).toBe("Smör");
    expect(catalogName("7up")).toBe("7up");
    expect(catalogName("ICA korv")).toBe("ICA korv");
    // No one-letter capital: kept, as the migration catalog_name_capital keeps it.
    expect(catalogName("ßtest")).toBe("ßtest");
    expect(catalogName("")).toBe("");
  });

  it("never changes the normalised name", () => {
    for (const name of ["bregott", "ägg", "Gul lök", "mellanmjölk"]) {
      expect(normalizeIngredientText(catalogName(name))).toBe(normalizeIngredientText(name));
    }
  });
});

describe("nameInSentence (Story 10.4)", () => {
  it("starts a name inside a sentence in lower case", () => {
    expect(nameInSentence("Mjölk")).toBe("mjölk");
    expect(nameInSentence("Ägg")).toBe("ägg");
    expect(nameInSentence("Gul lök")).toBe("gul lök");
    expect(nameInSentence("diskmedel")).toBe("diskmedel");
    expect(nameInSentence("2 citroner")).toBe("2 citroner");
  });

  it("keeps an abbreviation in capitals as written", () => {
    expect(nameInSentence("ICA-korv")).toBe("ICA-korv");
    expect(nameInSentence("BBQ-sås")).toBe("BBQ-sås");
    expect(nameInSentence("HP-sås")).toBe("HP-sås");
  });
});
