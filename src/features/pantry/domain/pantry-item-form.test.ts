import { describe, expect, it } from "vitest";
import {
  amountErrorMessage,
  amountTooLargeMessage,
  formFieldErrors,
  labelTooLongMessage,
  maxPantryLabelLength,
  nameTooLongMessage,
  parseAmountField,
  parseLabelField,
  pantryItemFormSchema,
  pantryItemSetSchema,
  pantryLabelSchema,
  pantryRowSchema,
  pantryNewIngredientName,
  suggestionLabel,
  toPantryLabel,
  unusableNameMessage,
  type PantryItemFormInput,
} from "./pantry-item-form";

const mjolkId = "11111111-1111-4111-8111-111111111111";
const rowId = "22222222-2222-4222-8222-222222222222";
const siteId = "44444444-4444-4444-8444-444444444444";

const form = (overrides: Partial<PantryItemFormInput> = {}): PantryItemFormInput => ({
  ingredient: { kind: "existing", ingredientId: mjolkId },
  amount: "",
  unit: null,
  location: "Kyl",
  siteId,
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
      siteId,
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
    ["a place that is not an id", { siteId: "Stugan" }],
    ["no place", { siteId: undefined }],
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

describe("pantryRowSchema", () => {
  const row = { id: rowId, ingredientId: mjolkId, location: "Kyl", amount: 1, unit: "l" };

  it("takes a row with its id, with an amount and unit or neither", () => {
    expect(pantryRowSchema.parse(row)).toEqual(row);
    expect(pantryRowSchema.safeParse({ ...row, amount: null, unit: null }).success).toBe(true);
  });

  it.each([
    { id: "rad-1" },
    { id: undefined },
    { amount: 1, unit: null },
    { amount: null, unit: "l" },
    { location: "Garage" },
    { amount: -1 },
  ])("refuses %j", (overrides) => {
    expect(pantryRowSchema.safeParse({ ...row, ...overrides }).success).toBe(false);
  });
});

describe("pantryNewIngredientName", () => {
  it("offers what was typed, trimmed with single spaces, amounts and units included", () => {
    expect(pantryNewIngredientName("  Saffran ", [])).toBe("Saffran");
    expect(pantryNewIngredientName("7up", [])).toBe("7up");
    // Story 10.4: with an uppercase first letter, as the catalog stores it.
    expect(pantryNewIngredientName("bregott", [])).toBe("Bregott");
    expect(pantryNewIngredientName("ägg", [])).toBe("Ägg");
    expect(pantryNewIngredientName("Coca-Cola  Zero 33 cl", [{ id: "1", name: "Coca-Cola" }])).toBe("Coca-Cola Zero 33 cl");
  });

  it("offers nothing when a hit is the ingredient by name or synonym", () => {
    expect(pantryNewIngredientName("gul LÖK", [{ id: "1", name: "Gul lök" }])).toBeNull();
    expect(pantryNewIngredientName("rödlök", [{ id: "2", name: "Röd lök", exact: true }])).toBeNull();
    expect(pantryNewIngredientName("rödlö", [{ id: "2", name: "Röd lök", exact: false }])).toBe("Rödlö");
  });

  it("offers nothing for a name the catalog cannot store", () => {
    expect(pantryNewIngredientName("!!!", [])).toBeNull();
    expect(pantryNewIngredientName("   ", [])).toBeNull();
    expect(pantryNewIngredientName("a".repeat(101), [])).toBeNull();
  });
});

// Story 11.2 (FR-42): the label of a pantry item.
const zeroWidthSpace = String.fromCodePoint(0x200b);
const rightToLeftMark = String.fromCodePoint(0x200f);

describe("pantryLabelSchema", () => {
  it.each(["Arla laktosfri", "Ä", "a".repeat(maxPantryLabelLength), "Coca-Cola  Zero"])("takes %j", (label) => {
    expect(pantryLabelSchema.safeParse(label).success).toBe(true);
  });

  it("counts characters as Postgres does, so 60 emoji are one label", () => {
    expect(pantryLabelSchema.safeParse(String.fromCodePoint(0x1f95b).repeat(maxPantryLabelLength)).success).toBe(true);
    expect(pantryLabelSchema.safeParse(String.fromCodePoint(0x1f95b).repeat(maxPantryLabelLength + 1)).success).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["a space first", " Arla"],
    ["a space last", "Arla "],
    ["61 characters", "a".repeat(maxPantryLabelLength + 1)],
    ["a line break", "Arla\nlaktosfri"],
    ["a zero-width space", `Arla${zeroWidthSpace}`],
    ["a right-to-left mark", `${rightToLeftMark}Arla`],
  ])("refuses %s", (_case, label) => {
    expect(pantryLabelSchema.safeParse(label).success).toBe(false);
  });
});

describe("toPantryLabel", () => {
  it("keeps a short label as it is", () => {
    expect(toPantryLabel("Arla Mellanmjölk laktosfri 1,5 l")).toBe("Arla Mellanmjölk laktosfri 1,5 l");
  });

  it.each([null, undefined, "", "   ", "…", zeroWidthSpace])("is null for %j", (raw) => {
    expect(toPantryLabel(raw)).toBeNull();
  });

  it("puts the label on one line without invisible marks", () => {
    expect(toPantryLabel(`  Arla\n  laktosfri${zeroWidthSpace} `)).toBe("Arla laktosfri");
  });

  it("cuts a long label at the last whole word within 60 characters, without an ellipsis", () => {
    const words = "Arla Ko ekologisk mellanmjölk laktosfri 1,5 % fetthalt i kartong om en och en halv liter";
    const label = toPantryLabel(words)!;
    expect(label).toBe("Arla Ko ekologisk mellanmjölk laktosfri 1,5 % fetthalt i");
    expect(label.length).toBeLessThanOrEqual(maxPantryLabelLength);
    expect(words.startsWith(label)).toBe(true);
    expect(pantryLabelSchema.safeParse(label).success).toBe(true);
  });

  it("keeps the first 60 characters when they end on a whole word", () => {
    const sixty = `${"a".repeat(29)} ${"b".repeat(30)}`;
    expect(toPantryLabel(`${sixty} cccc`)).toBe(sixty);
  });

  it("cuts in the middle of a word when there is no space to cut at", () => {
    expect(toPantryLabel("x".repeat(120))).toBe("x".repeat(maxPantryLabelLength));
  });

  it("removes an ellipsis, a dash or a comma left at the end", () => {
    expect(toPantryLabel("Arla mjölk …")).toBe("Arla mjölk");
    expect(toPantryLabel(`${"a".repeat(55)}, - ${"b".repeat(10)}`)).toBe("a".repeat(55));
  });

  it("counts characters, not UTF-16 units", () => {
    const label = toPantryLabel(String.fromCodePoint(0x1f95b).repeat(70))!;
    expect([...label]).toHaveLength(maxPantryLabelLength);
    expect(pantryLabelSchema.safeParse(label).success).toBe(true);
  });
});

describe("parseLabelField", () => {
  it("gives the text on one line, and null for an empty field", () => {
    expect(parseLabelField("  Arla   laktosfri ")).toEqual({ label: "Arla laktosfri" });
    expect(parseLabelField("   ")).toEqual({ label: null });
    expect(parseLabelField("")).toEqual({ label: null });
  });

  it("refuses more than 60 characters instead of cutting them", () => {
    expect(parseLabelField("a".repeat(maxPantryLabelLength))).toEqual({ label: "a".repeat(maxPantryLabelLength) });
    expect(parseLabelField("a".repeat(maxPantryLabelLength + 1))).toEqual({ error: labelTooLongMessage });
  });
});

describe("suggestionLabel", () => {
  it("is the first label, made a pantry label", () => {
    expect(suggestionLabel({ name: "Mellanmjölk", labels: ["Arla Mellanmjölk laktosfri 1,5 l", "Mjölk"] })).toBe(
      "Arla Mellanmjölk laktosfri 1,5 l",
    );
    expect(suggestionLabel({ name: "Mjölk", labels: ["x".repeat(120)] })).toBe("x".repeat(maxPantryLabelLength));
  });

  it("is null without labels, or when the first only is the name", () => {
    expect(suggestionLabel({ name: "Mjölk" })).toBeNull();
    expect(suggestionLabel({ name: "Mjölk", labels: [] })).toBeNull();
    expect(suggestionLabel({ name: "ägg", labels: ["Ägg"] })).toBeNull();
  });
});

describe("pantryItemFormSchema's label", () => {
  it("sets the field's text, removes the label when empty, and keeps it when left out", () => {
    expect(pantryItemFormSchema.parse(form({ label: " Arla " }))).toMatchObject({ label: "Arla" });
    expect(pantryItemFormSchema.parse(form({ label: "" }))).toMatchObject({ label: null });
    expect("label" in pantryItemFormSchema.parse(form())).toBe(false);
  });

  it("refuses 61 characters with the field's message", () => {
    const parsed = pantryItemFormSchema.safeParse(form({ label: "a".repeat(maxPantryLabelLength + 1) }));
    expect(parsed.success).toBe(false);
    expect(formFieldErrors(parsed.error!)).toEqual({ label: labelTooLongMessage });
  });

  it("gives both fields' messages at once", () => {
    const parsed = pantryItemFormSchema.safeParse(form({ amount: "två", label: "a".repeat(maxPantryLabelLength + 1) }));
    expect(formFieldErrors(parsed.error!)).toEqual({ amount: amountErrorMessage, label: labelTooLongMessage });
  });
});

describe("the label and time on a set item and a row", () => {
  const item = { ingredientId: mjolkId, location: "Kyl", amount: 1, unit: "l" } as const;

  it("takes a label, null or none on an item", () => {
    expect(pantryItemSetSchema.parse({ ...item, label: "Arla" })).toEqual({ ...item, label: "Arla" });
    expect(pantryItemSetSchema.parse({ ...item, label: null })).toEqual({ ...item, label: null });
    expect(pantryItemSetSchema.parse(item)).toEqual(item);
    expect(pantryItemSetSchema.safeParse({ ...item, label: " Arla" }).success).toBe(false);
  });

  it("takes a row's time as the database writes it", () => {
    const row = { ...item, id: rowId, label: "Arla", createdAt: "2026-10-20T08:15:00.123456+00:00" };
    expect(pantryRowSchema.parse(row)).toEqual(row);
    expect(pantryRowSchema.safeParse({ ...row, createdAt: "igår" }).success).toBe(false);
  });
});
