import { describe, expect, it } from "vitest";
import { anna } from "./fixtures";
import { allergenTerms, allergyWarningText, ingredientWords, isVegetarian, sharedWord } from "./facts";

describe("isVegetarian", () => {
  const veg = (title: string, ingredients: string[], vegetarian?: boolean) => isVegetarian({ title, ingredients, vegetarian });
  it("reads meat and fish from the ingredient lines", () => {
    expect(veg("Bolognese", ["500 g nötfärs", "spaghetti"])).toBe(false);
    expect(veg("Lax", ["4 laxfilé"])).toBe(false);
    expect(veg("Korv", ["falukorv"])).toBe(false);
    expect(veg("Räkpasta", ["200 g räkor"])).toBe(false);
  });
  it("accepts vegetable dishes and plant-based substitutes", () => {
    expect(veg("Curry", ["blomkål", "kokosmjölk"])).toBe(true);
    expect(veg("Chili", ["500 g vegofärs", "bönor"])).toBe(true);
    expect(veg("Soppa", ["grönsaksbuljong", "morot"])).toBe(true);
  });
  it("takes the caller's flag first, and a dish without lines is not assumed vegetarian", () => {
    expect(veg("X", ["nötfärs"], true)).toBe(true);
    expect(veg("Y", ["morot"], false)).toBe(false);
    expect(veg("Z", [])).toBe(false);
  });
});

describe("allergy", () => {
  it("finds the allergens of a dish and words the warning", () => {
    expect(allergenTerms({ title: "Gryta", ingredients: ["2 dl grädde"] }, [anna])).toEqual(["laktos"]);
    expect(allergenTerms({ title: "Soppa", ingredients: ["morot"] }, [anna])).toBeNull();
    expect(allergenTerms({ title: "Soppa", ingredients: ["morot"] }, [])).toBeNull();
    expect(allergyWarningText({ title: "Gryta", ingredients: ["smör"] }, [anna])).toBe("Kan innehålla laktos (Anna)");
    expect(allergyWarningText({ title: "Soppa", ingredients: ["morot"] }, [anna])).toBeNull();
  });
});

describe("ingredient words", () => {
  it("drops measures and finds a shared word", () => {
    const a = ingredientWords(["3 dl vetemjöl", "6 dl mjölk", "1 tsk salt"]);
    expect(a.has("mjölk")).toBe(true);
    expect(a.has("salt")).toBe(false);
    expect(sharedWord(a, ingredientWords(["2 dl mjölk", "kaffe"]))).toBe("mjölk");
    expect(sharedWord(a, ingredientWords(["potatis"]))).toBeNull();
  });
});
