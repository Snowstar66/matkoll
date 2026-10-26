import { describe, expect, it } from "vitest";
import { addToPantryItemSchema, addToPantryItemsSchema, maxAdditionKeyChars } from "./add-to-pantry";

const kaffe = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";

describe("addToPantryItemSchema", () => {
  it("takes an item with an amount and unit, with or without location", () => {
    expect(addToPantryItemSchema.parse({ key, ingredientId: kaffe, amount: 2, unit: "förp" })).toEqual({
      key,
      ingredientId: kaffe,
      amount: 2,
      unit: "förp",
    });
    expect(addToPantryItemSchema.parse({ key, ingredientId: kaffe, amount: 1.5, unit: "dl", location: "Kyl" }).location).toBe(
      "Kyl",
    );
  });

  it("takes an item without amount and unit, which makes the ingredient unlimited", () => {
    expect(addToPantryItemSchema.safeParse({ key, ingredientId: kaffe, amount: null, unit: null }).success).toBe(true);
  });

  it.each([
    ["an amount without unit", { amount: 2, unit: null }],
    ["a unit without amount", { amount: null, unit: "st" }],
    ["zero", { amount: 0, unit: "st" }],
    ["a negative amount", { amount: -1, unit: "st" }],
    ["an amount the pantry cannot keep", { amount: 1_000_000, unit: "st" }],
    ["NaN", { amount: Number.NaN, unit: "st" }],
    ["a unit outside UNITS", { amount: 1, unit: "liter" }],
    ["a location outside LOCATIONS", { amount: 1, unit: "st", location: "Garage" }],
    ["an empty key", { key: " ", amount: 1, unit: "st" }],
    ["a key that is too long", { key: "k".repeat(maxAdditionKeyChars + 1), amount: 1, unit: "st" }],
    ["an ingredient that is not an id", { ingredientId: "kaffe", amount: 1, unit: "st" }],
  ])("refuses %s", (_, change) => {
    expect(addToPantryItemSchema.safeParse({ key, ingredientId: kaffe, ...change }).success).toBe(false);
  });

  it("needs at least one item", () => {
    expect(addToPantryItemsSchema.safeParse([]).success).toBe(false);
  });
});
