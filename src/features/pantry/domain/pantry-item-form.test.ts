import { describe, expect, it } from "vitest";
import {
  amountErrorMessage,
  amountTooLargeMessage,
  formFieldErrors,
  nameTooLongMessage,
  parseAmountField,
  pantryItemFormSchema,
  pantryItemSetSchema,
  pantryNewIngredientName,
  unusableNameMessage,
  type PantryItemFormInput,
} from "./pantry-item-form";

const mjolkId = "11111111-1111-4111-8111-111111111111";
const rowId = "22222222-2222-4222-8222-222222222222";

const form = (overrides: Partial<PantryItemFormInput> = {}): PantryItemFormInput => ({
  ingredient: { kind: "existing", ingredientId: mjolkId },
  amount: "",
  unit: null,
  location: "Kyl",
  replaceId: null,
  ...overrides,
});

describe("parseAmountField", () => {
  it("reads Swedish quantities and leaves an empty field unlimited", () => {
    expect(parseAmountField("1,5")).toEqual({ amount: 1.5 });
    expect(parseAmountField(" ½ ")).toEqual({ amount: 0.5 });
    expect(parseAmountField("")).toEqual({ amount: null });
    expect(parseAmountField("   ")).toEqual({ amount: null });
  });

  it.each(["två", "0", "-1", "0,0", "1 l", "abc", "1-2", "2–3", "2 — 3"])("refuses %j", (text) => {
    expect(parseAmountField(text)).toEqual({ error: amountErrorMessage });
  });

  it("refuses a million or more", () => {
    expect(parseAmountField("1 000 000")).toEqual({ error: amountTooLargeMessage });
    expect(parseAmountField("999999")).toEqual({ amount: 999999 });
  });
});

describe("pantryItemFormSchema", () => {
  it("keeps the amount and unit", () => {
    expect(pantryItemFormSchema.parse(form({ amount: "1,5", unit: "l" }))).toEqual({
      ingredient: { kind: "existing", ingredientId: mjolkId },
      location: "Kyl",
      amount: 1.5,
      unit: "l",
      replaceId: null,
    });
  });

  it("makes an empty amount unlimited, without unit", () => {
    expect(pantryItemFormSchema.parse(form({ amount: " ", unit: "g" }))).toMatchObject({ amount: null, unit: null });
  });

  it("counts an amount without unit in pieces (st)", () => {
    expect(pantryItemFormSchema.parse(form({ amount: "3", unit: "" }))).toMatchObject({ amount: 3, unit: "st" });
    expect(pantryItemFormSchema.parse(form({ amount: "3", unit: null }))).toMatchObject({ amount: 3, unit: "st" });
  });

  it("takes a new ingredient with name, section and location, with single spaces", () => {
    const parsed = pantryItemFormSchema.parse(
      form({ ingredient: { kind: "new", name: " Coca-Cola  Zero 33 cl ", section: "Dryck", location: "Skafferi" }, location: "Skafferi" }),
    );
    expect(parsed.ingredient).toEqual({
      kind: "new",
      name: "Coca-Cola Zero 33 cl",
      section: "Dryck",
      location: "Skafferi",
      defaultUnit: null,
    });
  });

  it("gives a new ingredient a default unit only when one was chosen for an amount", () => {
    const saffran = { kind: "new", name: "Saffran", section: "Skafferi", location: "Skafferi" } as const;
    const defaultUnit = (overrides: Partial<PantryItemFormInput>) => {
      const { ingredient } = pantryItemFormSchema.parse(form({ ingredient: saffran, ...overrides }));
      return ingredient.kind === "new" ? ingredient.defaultUnit : undefined;
    };
    expect(defaultUnit({ amount: "1", unit: "förp" })).toBe("förp");
    // An amount without unit is saved as st, but st is not the ingredient's unit.
    expect(defaultUnit({ amount: "1", unit: "" })).toBeNull();
    // An unlimited item has no unit, whatever the field shows.
    expect(defaultUnit({ amount: "", unit: "g" })).toBeNull();
  });

  it.each([
    ["only punctuation", "!!!", unusableNameMessage],
    ["only spaces", "   ", unusableNameMessage],
    ["too long", "a".repeat(101), nameTooLongMessage],
  ])("refuses a new ingredient's name that is %s, with a message", (_name, name, message) => {
    const parsed = pantryItemFormSchema.safeParse(
      form({ ingredient: { kind: "new", name, section: "Övrigt", location: "Kyl" }, amount: "1" }),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formFieldErrors(parsed.error)).toEqual({ ingredient: message });
  });

  it("keeps the id of the row being changed", () => {
    expect(pantryItemFormSchema.parse(form({ amount: "2", unit: "l", replaceId: rowId })).replaceId).toBe(rowId);
  });

  it.each(["två", "0", "-1"])("refuses the amount %j with the message for the field", (amount) => {
    const parsed = pantryItemFormSchema.safeParse(form({ amount, unit: "l" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formFieldErrors(parsed.error)).toEqual({ amount: amountErrorMessage });
  });

  it.each([
    ["an unknown unit", { unit: "näve" }],
    ["an unknown location", { location: "Garage" }],
    ["an ingredient id that is not a uuid", { ingredient: { kind: "existing", ingredientId: "1" } }],
    ["a new ingredient with an unknown section", { ingredient: { kind: "new", name: "Saffran", section: "Kryddhylla", location: "Kyl" } }],
    ["a replaced id that is not a uuid", { replaceId: "rad-1" }],
  ])("refuses %s, without a field message", (_name, overrides) => {
    const parsed = pantryItemFormSchema.safeParse({ ...form({ amount: "1" }), ...overrides });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formFieldErrors(parsed.error)).toEqual({});
  });
});

describe("pantryItemSetSchema", () => {
  it("takes an amount with a unit, or neither", () => {
    expect(pantryItemSetSchema.safeParse({ ingredientId: mjolkId, location: "Kyl", amount: 1, unit: "l" }).success).toBe(true);
    expect(pantryItemSetSchema.safeParse({ ingredientId: mjolkId, location: "Kyl", amount: null, unit: null }).success).toBe(true);
  });

  it.each([
    { amount: 1, unit: null },
    { amount: null, unit: "l" },
    { amount: 0, unit: "l" },
    { amount: 1e6, unit: "g" },
    { amount: Number.NaN, unit: "g" },
    { amount: Number.POSITIVE_INFINITY, unit: "g" },
  ])("refuses %j", (item) => {
    expect(pantryItemSetSchema.safeParse({ ingredientId: mjolkId, location: "Kyl", ...item }).success).toBe(false);
  });
});

describe("pantryNewIngredientName", () => {
  it("offers what was typed, trimmed with single spaces, amounts and units included", () => {
    expect(pantryNewIngredientName("  Saffran ", [])).toBe("Saffran");
    expect(pantryNewIngredientName("7up", [])).toBe("7up");
    expect(pantryNewIngredientName("Coca-Cola  Zero 33 cl", [{ id: "1", name: "Coca-Cola" }])).toBe("Coca-Cola Zero 33 cl");
  });

  it("offers nothing when a hit is the ingredient by name or synonym", () => {
    expect(pantryNewIngredientName("gul LÖK", [{ id: "1", name: "Gul lök" }])).toBeNull();
    expect(pantryNewIngredientName("rödlök", [{ id: "2", name: "Röd lök", exact: true }])).toBeNull();
    expect(pantryNewIngredientName("rödlö", [{ id: "2", name: "Röd lök", exact: false }])).toBe("rödlö");
  });

  it("offers nothing for a name the catalog cannot store", () => {
    expect(pantryNewIngredientName("!!!", [])).toBeNull();
    expect(pantryNewIngredientName("   ", [])).toBeNull();
    expect(pantryNewIngredientName("a".repeat(101), [])).toBeNull();
  });
});
