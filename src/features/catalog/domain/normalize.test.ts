import { describe, expect, it } from "vitest";
import { cleanIngredientText, normalizeIngredientText } from "./normalize";

describe("normalizeIngredientText", () => {
  it.each([
    ["1 Lök, hackad", "lök"],
    ["  Gul lök ", "gul lök"],
    ["2 dl Grädde (40 %)", "grädde"],
    ["1 1/2 msk olivolja", "olivolja"],
    ["2-3 klyftor vitlök, pressade", "vitlök"],
    ["½ tsk salt", "salt"],
    ["ca 2 dl mjölk", "mjölk"],
    ["1 paket smör, rumsvarmt", "smör"],
    ["500 g kycklingfilé, strimlad", "kycklingfilé"],
    ["3 st ägg", "ägg"],
    ["3 ägg", "ägg"],
    ["Persilja, färsk, finhackad", "persilja"],
    ["Salt och peppar", "salt och peppar"],
    ["1 burk krossade tomater", "krossade tomater"],
    ["1 000 g vetemjöl", "vetemjöl"],
    ["dl", "dl"],
    ["Gurka", "gurka"],
    ["Ca", "ca"],
  ])("%j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  describe("preparation words", () => {
    it.each([
      ["Hackad lök", "lök"],
      ["Finhackad persilja", "persilja"],
      ["2 tärnade morötter", "morötter"],
      ["Strimlad purjolök", "purjolök"],
      ["Rumsvarmt smör", "smör"],
      ["Lök, fint hackad", "lök"],
    ])("removes them anywhere: %j → %j", (text, normalized) => {
      expect(normalizeIngredientText(text)).toBe(normalized);
    });

    it.each([
      ["Torkade tomater", "torkade tomater"],
      ["Frysta ärtor", "frysta ärtor"],
      ["Färsk pasta", "färsk pasta"],
      ["Riven ost", "riven ost"],
      ["Smält smör", "smält smör"],
      ["Rökt lax", "rökt lax"],
      ["Grovt salt", "grovt salt"],
    ])("keeps words that name a product: %j → %j", (text, normalized) => {
      expect(normalizeIngredientText(text)).toBe(normalized);
    });

    it.each([
      ["Tomater, torkade", "tomater"],
      ["Ärtor, frysta", "ärtor"],
      ["Basilika, färsk", "basilika"],
      ["Parmesan, riven", "parmesan"],
      ["Smör, smält", "smör"],
      ["Lax, rökt", "lax"],
    ])("removes them after a comma: %j → %j", (text, normalized) => {
      expect(normalizeIngredientText(text)).toBe(normalized);
    });
  });

  it.each([
    ["500g kycklingfilé", "kycklingfilé"],
    ["2dl grädde", "grädde"],
    ["1,5dl mjölk", "mjölk"],
    ["1½dl socker", "socker"],
    ["ca 500g färs", "färs"],
    ["2st ägg", "ägg"],
  ])("removes an amount glued to its unit: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it.each([
    ["En lök", "lök"],
    ["Ett ägg", "ägg"],
    ["Två morötter", "morötter"],
    ["tre msk olja", "olja"],
    ["Fyra potatisar", "potatisar"],
    ["Ett par ägg", "ägg"],
    ["Några droppar tabasco", "tabasco"],
    ["Lite salt", "salt"],
    ["En nypa salt", "salt"],
    ["några rädisor", "rädisor"],
  ])("removes amounts in words: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it.each([
    ["1 näve spenat", "spenat"],
    ["1 kvist rosmarin", "rosmarin"],
    ["2 bitar ingefära", "ingefära"],
    ["3 cm ingefära", "ingefära"],
    ["1 skvätt olja", "olja"],
  ])("removes a vague measure after an amount: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it("removes a measure word only after an amount", () => {
    expect(normalizeIngredientText("Bit choklad")).toBe("bit choklad");
    expect(normalizeIngredientText("Skiva bröd")).toBe("skiva bröd");
  });

  it.each([
    ["Salt efter smak", "salt"],
    ["Salt och peppar efter smak", "salt och peppar"],
    ["Persilja till garnering", "persilja"],
    ["Citron, till servering", "citron"],
    ["Smör till stekning", "smör"],
    ["Peppar, efter behov", "peppar"],
  ])("removes a trailing phrase: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it.each([
    ["• 2 dl mjölk", "mjölk"],
    ["* Salt", "salt"],
    ["- 1 lök", "lök"],
    ["· Peppar", "peppar"],
    ["–  3 ägg", "ägg"],
  ])("removes a list marker: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it.each([
    ["Grädde (40 % (vispgrädde))", "grädde"],
    ["Grädde (40 %", "grädde"],
    ["Grädde 40 %)", "grädde 40 %"],
    ["(valfritt) Gräslök", "gräslök"],
  ])("removes nested and unclosed parentheses: %j → %j", (text, normalized) => {
    expect(normalizeIngredientText(text)).toBe(normalized);
  });

  it("composes decomposed letters", () => {
    expect(normalizeIngredientText("Grädde")).toBe("grädde");
  });

  it.each(["", "   ", "2 dl", "(valfritt)", "1 kvist", "Ett par", "efter smak", null, undefined])(
    "gives an empty string for %j",
    (text) => {
      expect(normalizeIngredientText(text)).toBe("");
    },
  );
});

describe("cleanIngredientText", () => {
  it.each([
    ["1 Lök, hackad", "Lök"],
    ["  Gul lök ", "Gul lök"],
    ["2 dl Grädde (40 %)", "Grädde"],
    ["Saffran", "Saffran"],
    ["500g Kycklingfilé, strimlad", "Kycklingfilé"],
  ])("keeps the casing: %j → %j", (text, cleaned) => {
    expect(cleanIngredientText(text)).toBe(cleaned);
  });
});
