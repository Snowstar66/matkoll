import { describe, expect, it } from "vitest";
import { fromCompactDish } from "./compact-dish";
import { aiRecipe, compactDish, type CompactDish } from "./schemas";
import { validCompactDish, validCompactDishRecipe } from "./test-support";

type Line = CompactDish["ingredients"][number];

const dishWith = (line: Line): CompactDish => ({ ...validCompactDish, ingredients: [line] });
const base: Pick<Line, "stepIndexes" | "new"> = { stepIndexes: [0], new: null };

describe("fromCompactDish (Story 12.3)", () => {
  it.each<[string, Line, ReturnType<typeof fromCompactDish>["ingredients"][number]]>([
    [
      "an item from the pantry: Övrigt, Skafferi and the line's unit",
      { ...base, text: "2 gula lökar", amount: 2, unit: "st", name: "gul lök" },
      {
        originalText: "2 gula lökar",
        amount: 2,
        unit: "st",
        isVague: false,
        hint: { name: "gul lök", section: "Övrigt", location: "Skafferi", defaultUnit: "st" },
        stepIndexes: [0],
      },
    ],
    [
      "a new item: the catalog entry in new",
      {
        ...base,
        text: "2 dl matlagningsgrädde",
        amount: 2,
        unit: "dl",
        name: "matlagningsgrädde",
        new: { section: "Mejeri", location: "Kyl", defaultUnit: "dl" },
      },
      {
        originalText: "2 dl matlagningsgrädde",
        amount: 2,
        unit: "dl",
        isVague: false,
        hint: { name: "matlagningsgrädde", section: "Mejeri", location: "Kyl", defaultUnit: "dl" },
        stepIndexes: [0],
      },
    ],
    [
      "a vague line: no amount",
      { ...base, text: "salt", amount: null, unit: null, name: "salt", stepIndexes: [] },
      {
        originalText: "salt",
        amount: null,
        unit: null,
        isVague: true,
        hint: { name: "salt", section: "Övrigt", location: "Skafferi", defaultUnit: "st" },
        stepIndexes: [],
      },
    ],
    [
      "a count without a unit: not vague, no unit, st in the catalog",
      { ...base, text: "2 ägg", amount: 2, unit: null, name: "ägg" },
      {
        originalText: "2 ägg",
        amount: 2,
        unit: null,
        isVague: false,
        hint: { name: "ägg", section: "Övrigt", location: "Skafferi", defaultUnit: "st" },
        stepIndexes: [0],
      },
    ],
    [
      "a unit without an amount: vague, so no unit on the line, but the unit for the catalog",
      { ...base, text: "olivolja att steka i", amount: null, unit: "msk", name: "olivolja" },
      {
        originalText: "olivolja att steka i",
        amount: null,
        unit: null,
        isVague: true,
        hint: { name: "olivolja", section: "Övrigt", location: "Skafferi", defaultUnit: "msk" },
        stepIndexes: [0],
      },
    ],
  ])("%s", (_name, line, expected) => {
    const recipe = fromCompactDish(dishWith(line));
    expect(recipe.ingredients).toEqual([expected]);
    // The result is an AiRecipe as parseRecipe returns it.
    expect(aiRecipe.parse(recipe)).toEqual(recipe);
  });

  it("keeps the title, servings, time and steps", () => {
    expect(fromCompactDish(validCompactDish)).toEqual(validCompactDishRecipe);
  });

  it("takes a dish as compactDish gives it, and never shares its arrays", () => {
    const dish = compactDish.parse(validCompactDish);
    const recipe = fromCompactDish(dish);
    recipe.steps.push("Servera.");
    recipe.ingredients[0].stepIndexes.push(1);
    expect(dish.steps).toHaveLength(2);
    expect(dish.ingredients[0].stepIndexes).toEqual([0]);
  });
});
