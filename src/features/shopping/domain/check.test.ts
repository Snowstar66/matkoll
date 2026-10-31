import { describe, expect, it } from "vitest";
import { checkChangeSchema } from "./check";

const planId = "33333333-3333-4333-8333-333333333333";
const own = "c:22222222-2222-4222-8222-222222222222";
const recipe = "r:11111111-1111-4111-8111-111111111111:dl";

describe("checkChangeSchema", () => {
  it("takes an own item's key with or without a plan (Story 17.10)", () => {
    expect(checkChangeSchema.safeParse({ planId, key: own, checked: true }).success).toBe(true);
    expect(checkChangeSchema.safeParse({ planId: null, key: own, checked: true }).success).toBe(true);
  });

  it("needs a plan for any other key", () => {
    expect(checkChangeSchema.safeParse({ planId, key: recipe, checked: true }).success).toBe(true);
    expect(checkChangeSchema.safeParse({ planId: null, key: recipe, checked: true }).success).toBe(false);
    expect(checkChangeSchema.safeParse({ planId: null, key: "t:salt", checked: true }).success).toBe(false);
  });
});
