import { describe, expect, it } from "vitest";
import { foodFit } from "@/features/menu-advisor";
import { amountForRecipe, recipeFitInput, struckStepWarning, struckSummaryText, withoutStruck } from "./struck-lines";

const lines = [
  { id: "a", originalText: "600 g kyckling" },
  { id: "b", originalText: "1 knippe färsk koriander", isStruck: true },
  { id: "c", originalText: "1 paprika", isStruck: false },
];

describe("withoutStruck", () => {
  it("leaves the struck lines out and keeps the order; a line without the flag counts", () => {
    expect(withoutStruck(lines).map((line) => line.id)).toEqual(["a", "c"]);
    expect(withoutStruck([])).toEqual([]);
  });
});

describe("struckSummaryText", () => {
  it("says how many lines are struck, and nothing when none is", () => {
    expect(struckSummaryText([{}, { isStruck: false }])).toBeNull();
    expect(struckSummaryText(lines)).toBe("1 ingrediens struken");
    expect(struckSummaryText([{ isStruck: true }, { isStruck: true }, {}])).toBe("2 ingredienser strukna");
  });
});

describe("struckStepWarning", () => {
  it("warns under a step that names a struck ingredient, also in another form of the word", () => {
    expect(struckStepWarning("Hacka koriandern och strö över.", ["Koriander"])).toBe("Nämner koriander, som du har strukit.");
    expect(struckStepWarning("Strö över koriander.", ["Koriander"])).toBe("Nämner koriander, som du har strukit.");
  });

  it("names several, and needs every word of a name", () => {
    expect(struckStepWarning("Rör ner lime och koriander.", ["Koriander", "Lime"])).toBe("Nämner koriander och lime, som du har strukit.");
    expect(struckStepWarning("Fräs pastan.", ["Röd currypasta"])).toBeNull();
    expect(struckStepWarning("Fräs den röda currypastan.", ["Röd currypasta"])).toBe("Nämner röd currypasta, som du har strukit.");
  });

  it("is quiet when the step does not name it, or nothing is struck", () => {
    expect(struckStepWarning("Skär kycklingen.", ["Koriander"])).toBeNull();
    expect(struckStepWarning("Hacka koriandern.", [])).toBeNull();
  });
});

describe("amountForRecipe", () => {
  it("turns what was typed for the servings shown into the recipe's own amount", () => {
    expect(amountForRecipe("3", 1)).toBe(3);
    expect(amountForRecipe("1,5", 2)).toBe(0.75);
    expect(amountForRecipe(" 4 ", 1.5)).toBe(2.6667);
  });

  it("gives null for text, zero, negative and empty", () => {
    for (const typed of ["", " ", "abc", "0", "-2", "1,2,3"]) expect(amountForRecipe(typed, 1)).toBeNull();
  });
});

describe("foodFit with a struck line", () => {
  const people = [{ name: "Anna", allergies: [], dislikes: ["koriander"], likes: ["paprika"] }];
  const recipe = { title: "Thaicurry", lines };

  it("reads the struck line as not there: the avoid note goes, the love note stays", () => {
    expect(recipeFitInput(recipe).ingredients).toEqual(["600 g kyckling", "1 paprika"]);
    expect(foodFit(recipeFitInput({ title: "Thaicurry", lines: lines.map((line) => ({ ...line, isStruck: false })) }), people)).toMatchObject([
      { kind: "dislike", text: "Anna undviker koriander" },
      { kind: "like", text: "Anna älskar paprika" },
    ]);
    expect(foodFit(recipeFitInput(recipe), people)).toMatchObject([{ kind: "like", text: "Anna älskar paprika" }]);
  });

  it("removes an allergy hit too when its line is struck", () => {
    const withGluten = { title: "Middag", lines: [{ originalText: "400 g vetemjöl", isStruck: true }] };
    expect(foodFit(recipeFitInput(withGluten), [{ name: "Bo", allergies: ["gluten"], dislikes: [], likes: [] }])).toEqual([]);
  });
});
