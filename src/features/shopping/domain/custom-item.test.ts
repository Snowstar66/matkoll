import { describe, expect, it } from "vitest";
import {
  customItemFieldErrors,
  customItemFormSchema,
  customItemRowSchema,
  parseCustomAmount,
  type CustomItemFormInput,
} from "./custom-item";

const planId = "33333333-3333-4333-8333-333333333333";
const ingredientId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";

const form = (changes: Partial<CustomItemFormInput> = {}): CustomItemFormInput => ({
  planId,
  label: "diskmedel",
  amount: "",
  unit: "",
  ...changes,
});

function errors(input: CustomItemFormInput): Record<string, string> {
  const parsed = customItemFormSchema.safeParse(input);
  return parsed.success ? {} : customItemFieldErrors(parsed.error);
}

describe("customItemFormSchema", () => {
  it("takes text alone, trimmed with single spaces, without amount, unit or catalog ingredient", () => {
    expect(customItemFormSchema.parse(form({ label: "  diskmedel   till  maskinen " }))).toEqual({
      planId,
      label: "diskmedel till maskinen",
      ingredientId: null,
      amount: null,
      unit: null,
    });
  });

  it("takes an amount as typed with a unit, a catalog ingredient and the client's id", () => {
    expect(customItemFormSchema.parse(form({ id, label: "Kaffe", ingredientId, amount: "1,5", unit: "förp" }))).toEqual({
      id,
      planId,
      label: "Kaffe",
      ingredientId,
      amount: 1.5,
      unit: "förp",
    });
    expect(customItemFormSchema.parse(form({ amount: "½", unit: "kg" }))).toMatchObject({ amount: 0.5, unit: "kg" });
  });

  it.each(["", "   ", "\n", "\t\r\n", "\u00a0\u3000\ufeff"])("asks for text when it is %j", (label) => {
    expect(errors(form({ label }))).toEqual({ label: "Skriv vad du vill lägga till." });
  });

  it("refuses text longer than 200 characters, counted as the database counts them", () => {
    expect(errors(form({ label: "a".repeat(201) }))).toEqual({ label: "Texten får vara högst 200 tecken." });
    expect(errors(form({ label: "a".repeat(200) }))).toEqual({});
    // An emoji is two UTF-16 units but one character to char_length.
    expect(errors(form({ label: "😀".repeat(200) }))).toEqual({});
    expect(errors(form({ label: "😀".repeat(201) }))).toEqual({ label: "Texten får vara högst 200 tecken." });
  });

  it("marks the amount when it is longer than the field takes", () => {
    expect(errors(form({ amount: "1".repeat(41), unit: "st" }))).toEqual({ amount: "Ange ett tal större än 0." });
  });

  it.each(["0", "-1", "abc", "1-2", "0,0"])("refuses the amount %j", (amount) => {
    expect(errors(form({ amount, unit: "st" }))).toEqual({ amount: "Ange ett tal större än 0." });
  });

  it("refuses an amount of a million or more", () => {
    expect(errors(form({ amount: "1000000", unit: "g" }))).toEqual({ amount: "Ange ett tal under 1 000 000." });
  });

  it("asks for a unit with an amount, and for an amount with a unit", () => {
    expect(errors(form({ amount: "2", unit: "" }))).toEqual({ unit: "Välj en enhet." });
    expect(errors(form({ amount: "2", unit: null }))).toEqual({ unit: "Välj en enhet." });
    expect(errors(form({ amount: " ", unit: "st" }))).toEqual({ amount: "Ange ett tal större än 0." });
  });

  it("gives every field's message at once", () => {
    expect(errors(form({ label: "", amount: "x", unit: "st" }))).toEqual({
      label: "Skriv vad du vill lägga till.",
      amount: "Ange ett tal större än 0.",
    });
  });

  it.each([
    [{ planId: "inte-ett-id" }],
    [{ ingredientId: "kaffe" }],
    [{ id: "inte-ett-id" }],
    [{ unit: "liter" }],
  ])("refuses %j without a field message", (changes) => {
    const parsed = customItemFormSchema.safeParse(form(changes as Partial<CustomItemFormInput>));
    expect(parsed.success).toBe(false);
  });
});

describe("parseCustomAmount", () => {
  it("reads empty as no amount", () => {
    expect(parseCustomAmount("  ")).toEqual({ amount: null });
    expect(parseCustomAmount("2")).toEqual({ amount: 2 });
  });
});

describe("customItemRowSchema", () => {
  const row = { id, planId, label: "Kaffe", ingredientId, amount: 2, unit: "förp" as const };

  it("takes a stored item", () => {
    expect(customItemRowSchema.parse(row)).toEqual(row);
    expect(customItemRowSchema.parse({ ...row, ingredientId: null, amount: null, unit: null })).toMatchObject({ amount: null });
  });

  it.each([
    [{ amount: 2, unit: null }],
    [{ amount: null, unit: "st" }],
    [{ amount: 0, unit: "st" }],
    [{ label: " " }],
    [{ label: "\t\n" }],
    [{ label: "a".repeat(201) }],
    [{ id: "x" }],
  ])("refuses %j", (changes) => {
    expect(customItemRowSchema.safeParse({ ...row, ...changes }).success).toBe(false);
  });
});
