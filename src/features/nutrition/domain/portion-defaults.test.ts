import { describe, expect, it } from "vitest";
import { food, per } from "./fixtures";
import { isNegligible } from "./negligible";
import { defaultPortionGrams, lengthGrams } from "./portion-defaults";

const p = per(100, 1, 1, 1, 1);

describe("defaultPortionGrams", () => {
  it("gives dry weights for rice, pasta, noodles and potatoes", () => {
    expect(defaultPortionGrams(food("jasminris", "raffinerad", p), "jasminris")).toBe(75);
    expect(defaultPortionGrams(food("ris", "raffinerad", p), "ris")).toBe(75);
    expect(defaultPortionGrams(food("brunt ris", "fullkorn", p), "brunt ris")).toBe(75);
    expect(defaultPortionGrams(food("spaghetti", "raffinerad", p), "spaghetti")).toBe(90);
    expect(defaultPortionGrams(food("penne", "raffinerad", p), "penne")).toBe(90);
    expect(defaultPortionGrams(food("risnudlar", "raffinerad", p), "risnudlar")).toBe(80);
    expect(defaultPortionGrams(food("couscous", "raffinerad", p), "couscous")).toBe(70);
    expect(defaultPortionGrams(food("potatis", "raffinerad", p), "potatis")).toBe(200);
    expect(defaultPortionGrams(food("havregryn", "fullkorn", p), "havregryn")).toBe(50);
    expect(defaultPortionGrams(food("tortilla", "raffinerad", p), "tortilla")).toBe(60);
    expect(defaultPortionGrams(food("bröd", "raffinerad", p), "bröd")).toBe(60);
  });

  it("gives protein portions by group, an egg by its piece weight", () => {
    expect(defaultPortionGrams(food("lax", "fisk", p), "lax")).toBe(130);
    expect(defaultPortionGrams(food("nötfärs", "rott_kott", p), "nötfärs")).toBe(130);
    expect(defaultPortionGrams(food("kycklingfilé", "fagel", p), "kycklingfilé")).toBe(140);
    expect(defaultPortionGrams(food("ägg", "agg", p, { gramsPerPiece: 60 }), "ägg")).toBe(60);
    expect(defaultPortionGrams(food("ägg", "agg", p), "ägg")).toBe(55);
    expect(defaultPortionGrams(food("tofu", "baljvaxt", p, { lmvNumber: 905 }), "tofu")).toBe(120);
    expect(defaultPortionGrams(food("röda linser", "baljvaxt", p), "röda linser")).toBe(60);
    expect(defaultPortionGrams(food("kikärtor", "baljvaxt", p), "kikärtor")).toBe(100);
  });

  it("gives 100 g of a carrying vegetable but nothing for flavouring ones", () => {
    expect(defaultPortionGrams(food("broccoli", "gronsak", p), "broccoli")).toBe(100);
    expect(defaultPortionGrams(food("vitlök", "gronsak", p), "vitlök")).toBeNull();
    expect(defaultPortionGrams(food("gul lök", "gronsak", p), "gul lök")).toBeNull();
    expect(defaultPortionGrams(food("persilja", "gronsak", p), "persilja")).toBeNull();
    expect(defaultPortionGrams(food("citron", "gronsak", p), "citron")).toBeNull();
  });

  it("gives null for fat, sugar, dairy, other, spices, flour and crumbs", () => {
    expect(defaultPortionGrams(food("grädde", "fett", p), "grädde")).toBeNull();
    expect(defaultPortionGrams(food("socker", "socker", p), "socker")).toBeNull();
    expect(defaultPortionGrams(food("grädde", "mejeri", p), "grädde")).toBeNull();
    expect(defaultPortionGrams(food("ost", "mejeri", p), "ost")).toBeNull();
    expect(defaultPortionGrams(food("honung", "ovrigt", p), "honung")).toBeNull();
    expect(defaultPortionGrams(food("salt", "ej_raknad", null, { lmvNumber: null }), "salt")).toBeNull();
    expect(defaultPortionGrams(food("vetemjöl", "raffinerad", p), "vetemjöl")).toBeNull();
    expect(defaultPortionGrams(food("ströbröd", "raffinerad", p), "ströbröd")).toBeNull();
  });

  it("gives null for an unknown ingredient", () => {
    expect(defaultPortionGrams(null, "okänd sak")).toBeNull();
    expect(defaultPortionGrams(food("konstig", "raffinerad", p), "konstig")).toBeNull();
  });
});

describe("cooking fat", () => {
  it("is 5 g per person for oil, butter and margarine", () => {
    for (const name of ["matolja", "rapsolja", "olivolja", "smör", "margarin"]) {
      expect(defaultPortionGrams(food(name, "fett", p), name)).toBe(5);
    }
  });
});

describe("lengthGrams", () => {
  const ginger = food("färsk ingefära", "gronsak", p);
  it("reads cm from the text: 5 g per cm of ginger", () => {
    expect(lengthGrams("5 cm färsk ingefära", ginger, "färsk ingefära")).toBe(25);
    expect(lengthGrams("2,5 cm ingefära", ginger, "ingefära")).toBe(12.5);
  });
  it("gives null without cm or for other foods", () => {
    expect(lengthGrams("färsk ingefära", ginger, "färsk ingefära")).toBeNull();
    expect(lengthGrams(undefined, ginger, "ingefära")).toBeNull();
    expect(lengthGrams("5 cm gurka", food("gurka", "gronsak", p), "gurka")).toBeNull();
  });
});

describe("isNegligible", () => {
  it("is true for ginger, garlic, herbs, stock and soy, false for onion, potato puree and oil", () => {
    for (const name of ["färsk ingefära", "vitlök", "chili", "citron", "persilja", "grönsaksbuljong", "senap", "soja", "tomatpuré", "kapris"]) {
      expect(isNegligible(null, name)).toBe(true);
    }
    for (const name of ["gul lök", "purjolök", "potatismos", "olivolja", "sojabönor", "tomat"]) {
      expect(isNegligible(null, name)).toBe(false);
    }
  });
});
