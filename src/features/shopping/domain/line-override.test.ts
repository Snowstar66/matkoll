import { describe, expect, it } from "vitest";
import {
  isAmountKey,
  isOverridableKey,
  lineAmountFormSchema,
  lineOverrideRowSchema,
  restoreLineSchema,
} from "./line-override";

const planId = "33333333-3333-4333-8333-333333333333";
const gradde = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const key = `r:${gradde}:dl`;

describe("line override keys", () => {
  it("lets a recipe line be hidden and only a line with a unit be corrected", () => {
    expect([key, `r:${gradde}:-`, "t:2 citroner", `c:${id}`, "x"].map((k) => [isOverridableKey(k), isAmountKey(k)])).toEqual([
      [true, true],
      [true, false],
      [true, false],
      [false, false],
      [false, false],
    ]);
  });
});

describe("lineAmountFormSchema", () => {
  it("reads the amount with parseQuantity", () => {
    expect(lineAmountFormSchema.parse({ planId, key, amount: "1,5" })).toEqual({ planId, key, amount: 1.5, baseAmount: null });
    expect(lineAmountFormSchema.parse({ planId, key, amount: " ½ ", baseAmount: 3 })).toEqual({
      planId,
      key,
      amount: 0.5,
      baseAmount: 3,
    });
    expect(lineAmountFormSchema.safeParse({ planId, key, amount: "2", baseAmount: 0 }).success).toBe(false);
  });

  it.each([
    ["två", "Ange ett tal större än 0."],
    ["0", "Ange ett tal större än 0."],
    ["", "Ange ett tal större än 0."],
    ["1-2", "Ange ett tal större än 0."],
    ["1000000", "Ange ett tal under 1 000 000."],
    ["1".repeat(41), "Ange ett tal större än 0."],
  ])("refuses %j with %j at the amount", (amount, message) => {
    const result = lineAmountFormSchema.safeParse({ planId, key, amount });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: ["amount"], message })]);
  });

  it("refuses a key without a unit", () => {
    expect(lineAmountFormSchema.safeParse({ planId, key: `r:${gradde}:-`, amount: "2" }).success).toBe(false);
  });
});

describe("restoreLineSchema", () => {
  const previous = { id, planId, key, amount: 2, baseAmount: 3, hidden: false };
  const hiddenUpdatedAt = "2026-10-26T05:12:29.123456+00:00";

  it("takes the line's own override, or none, with the hidden row's updated_at when known", () => {
    expect(restoreLineSchema.safeParse({ planId, key, previous, hiddenUpdatedAt }).success).toBe(true);
    expect(restoreLineSchema.safeParse({ planId, key, previous: null, hiddenUpdatedAt: null }).success).toBe(true);
    expect(lineOverrideRowSchema.safeParse({ ...previous, amount: null }).success).toBe(false);
  });

  it("refuses another line's or plan's override, and an amount on a line without a unit", () => {
    expect(restoreLineSchema.safeParse({ planId, key: `r:${gradde}:g`, previous, hiddenUpdatedAt }).success).toBe(false);
    expect(restoreLineSchema.safeParse({ planId: id, key, previous, hiddenUpdatedAt }).success).toBe(false);
    expect(lineOverrideRowSchema.safeParse({ ...previous, key: `r:${gradde}:-` }).success).toBe(false);
    expect(
      lineOverrideRowSchema.safeParse({ ...previous, key: `r:${gradde}:-`, amount: null, baseAmount: null }).success,
    ).toBe(true);
  });
});
