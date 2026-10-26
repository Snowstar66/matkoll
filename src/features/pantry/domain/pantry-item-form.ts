import { z } from "zod";
import {
  locationSchema,
  normalizeIngredientText,
  parseQuantity,
  sectionSchema,
  unitSchema,
  type IngredientSearchHit,
  type Unit,
} from "@/features/catalog";

// The sheet Lagervara (FR-11, AD-12, AD-19): one schema for the form and
// savePantryItem. An item points at a catalog ingredient, existing or new;
// it has an amount as typed ("1,5", "½") and a unit, or no amount, which
// makes it unlimited. Pure, so it is tested without a database.

/** Under the field when the amount is not a positive number (EXPERIENCE.md, Voice and Tone). */
export const amountErrorMessage = "Ange ett tal större än 0.";
/** Under the field when the amount is above what the pantry keeps (pantry_item_amount_max_check). */
export const amountTooLargeMessage = "Ange ett tal under 1 000 000.";
/** Amounts must stay below this (pantry_item_amount_max_check). */
export const maxPantryAmount = 1_000_000;
/** A unit is needed with an amount (pantry_item_unlimited_check); without one an amount counts pieces. */
export const unitWithoutUnit: Unit = "st";

/** The longest name of a new catalog ingredient. */
export const maxIngredientNameLength = 100;
/** When a new ingredient's name has nothing the catalog can store (only punctuation, e.g. "!!!"). */
export const unusableNameMessage = "Skriv ett namn med bokstäver eller siffror.";
export const nameTooLongMessage = `Namnet får vara högst ${maxIngredientNameLength} tecken.`;

/** A name as typed, trimmed and with single spaces: "  Coca-Cola  Zero 33 cl " → "Coca-Cola Zero 33 cl". */
export function collapseName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A search hit in the sheet Lagervara; `exact` when the typed text is its name or one of its synonyms. */
export type PantrySearchHit = IngredientSearchHit & { exact?: boolean };

/**
 * The name to offer as a new catalog ingredient in the sheet Lagervara: what
 * Pontus typed, trimmed with single spaces. Amounts and units stay, since the
 * sheet has fields of its own for them ("7up", "Coca-Cola Zero 33 cl"). None
 * when the name has nothing the catalog can store, or when a hit already is
 * the ingredient: its name or a synonym is the typed text, normalised.
 */
export function pantryNewIngredientName(query: string, hits: readonly PantrySearchHit[]): string | null {
  const name = collapseName(query);
  const normalized = normalizeIngredientText(name);
  if (!normalized || name.length > maxIngredientNameLength) return null;
  const taken = hits.some((hit) => hit.exact || normalizeIngredientText(hit.name) === normalized);
  return taken ? null : name;
}

/**
 * The amount in the field as typed: empty is `null` (unlimited); otherwise a
 * positive quantity read by parseQuantity ("1,5", "½") below the pantry's
 * maximum, or the message to show under the field.
 */
export function parseAmountField(text: string): { amount: number | null } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { amount: null };
  // A range ("1-2", "2–3") is not an amount at home; parseQuantity would take its largest value.
  if (/[-–—]/.test(trimmed)) return { error: amountErrorMessage };
  const amount = parseQuantity(trimmed);
  if (amount === null) return { error: amountErrorMessage };
  if (amount >= maxPantryAmount) return { error: amountTooLargeMessage };
  return { amount };
}

/** The item's catalog ingredient: one already in the catalog, or one created when the item is saved (AD-6). */
export const pantryIngredientSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), ingredientId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    name: z
      .string()
      .transform(collapseName)
      .refine((name) => normalizeIngredientText(name) !== "", unusableNameMessage)
      .refine((name) => name.length <= maxIngredientNameLength, nameTooLongMessage),
    section: sectionSchema,
    location: locationSchema,
  }),
]);
export type PantryIngredient = z.infer<typeof pantryIngredientSchema>;

/**
 * What the sheet sends: the ingredient, the amount as typed (empty for
 * unlimited), the unit (null or "" for none), the location, and the id of
 * the row being changed, if any. A new ingredient gets a default unit only
 * when Pontus chose one for an amount; never the `st` of an amount without
 * unit, and never from an unlimited item.
 */
export const pantryItemFormSchema = z
  .object({
    ingredient: pantryIngredientSchema,
    amount: z.string().max(40),
    unit: z.union([unitSchema, z.literal(""), z.null()]),
    location: locationSchema,
    replaceId: z.uuid().nullable(),
  })
  .transform((form, context) => {
    const parsed = parseAmountField(form.amount);
    if ("error" in parsed) {
      context.addIssue({ code: "custom", path: ["amount"], message: parsed.error });
      return z.NEVER;
    }
    const { amount } = parsed;
    // Without an amount the item is unlimited and has no unit; an amount without a unit is pieces.
    const unit: Unit | null = amount === null ? null : form.unit || unitWithoutUnit;
    const ingredient =
      form.ingredient.kind === "new"
        ? { ...form.ingredient, defaultUnit: amount === null ? null : form.unit || null }
        : form.ingredient;
    return { ingredient, location: form.location, amount, unit, replaceId: form.replaceId };
  });
export type PantryItemFormInput = z.input<typeof pantryItemFormSchema>;
export type PantryItemForm = z.output<typeof pantryItemFormSchema>;

/**
 * One item for setPantryItems (AD-19): the amount is set exactly for the
 * ingredient, location and unit. Amount and unit are both null (unlimited)
 * or both set.
 */
const pantryItemSetShape = z.object({
  ingredientId: z.uuid(),
  location: locationSchema,
  amount: z.number().positive().lt(maxPantryAmount).nullable(),
  unit: unitSchema.nullable(),
});
const amountHasUnit = (item: { amount: number | null; unit: string | null }) =>
  (item.amount === null) === (item.unit === null);

export const pantryItemSetSchema = pantryItemSetShape.refine(amountHasUnit, { path: ["unit"] });
export type PantryItemSet = z.infer<typeof pantryItemSetSchema>;

/**
 * A pantry row as removePantryItem returns it and restorePantryItem takes it
 * back, with the same id (AD-19, AD-20).
 */
export const pantryRowSchema = pantryItemSetShape.extend({ id: z.uuid() }).refine(amountHasUnit, { path: ["unit"] });
export type PantryRow = z.infer<typeof pantryRowSchema>;

/**
 * The form's own messages by field name (`amount`), the first per field, for
 * `fail("validation", fields)` and the sheet. Zod's built-in messages are
 * English and never shown, so only the schema's custom issues count.
 */
export function formFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (issue.code === "custom" && field && !(field in fields)) fields[field] = issue.message;
  }
  return fields;
}
