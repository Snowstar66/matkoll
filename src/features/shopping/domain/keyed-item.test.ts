import { describe, expect, it } from "vitest";
import { keyedItemsSchema } from "./keyed-item";

const planId = "33333333-3333-4333-8333-333333333333";

describe("keyedItemsSchema", () => {
  it("takes one to a hundred items with a key, a text and an optional catalog ingredient", () => {
    expect(keyedItemsSchema.safeParse({ planId, items: [{ key: "a", label: "Ost (Erbjudande)", ingredientId: null }] }).success).toBe(true);
    expect(keyedItemsSchema.safeParse({ planId, items: [] }).success).toBe(false);
    expect(keyedItemsSchema.safeParse({ planId, items: [{ key: "a", label: "  ", ingredientId: null }] }).success).toBe(false);
    expect(keyedItemsSchema.safeParse({ planId, items: [{ key: "a", label: "x".repeat(201), ingredientId: null }] }).success).toBe(false);
    expect(keyedItemsSchema.safeParse({ planId: "x", items: [{ key: "a", label: "Ost", ingredientId: null }] }).success).toBe(false);
  });
});
