import { z } from "zod";
import { parseQuantity, unitSchema, type Unit } from "@/features/catalog";

// Pontus's own items on the shopping list (Story 3.5, FR-17, AD-8): free text
// that may point at a catalog ingredient, with an optional amount and unit.
// One schema for the sheet "Lägg till egen vara" and addCustomItem (AD-12).
// Pure, so it is tested without a database.

/** Under the text field when it is empty (EXPERIENCE.md, Voice and Tone). */
export const labelRequiredMessage = "Skriv vad du vill lägga till.";
/**
 * The longest text, in characters (code points), as the database counts it
 * (shopping_custom_item_label_check, char_length).
 */
export const maxCustomLabelLength = 200;
export const labelTooLongMessage = `Texten får vara högst ${maxCustomLabelLength} tecken.`;
/** Under the amount when it is not a positive number. */
export const customAmountErrorMessage = "Ange ett tal större än 0.";
/** Amounts must stay below this (shopping_custom_item_amount_check). */
export const maxCustomAmount = 1_000_000;
export const customAmountTooLargeMessage = "Ange ett tal under 1 000 000.";
/** Under the unit when an amount has none: both or neither (shopping_custom_item_amount_unit_check). */
export const unitRequiredMessage = "Välj en enhet.";
/** The most characters the amount field takes. */
export const maxCustomAmountChars = 40;

/**
 * Text as typed, trimmed and with single spaces. What counts as space is
 * JavaScript's \s, which shopping_custom_item_label_check matches, so a text
 * empty here is refused there too.
 */
export function collapseLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The text's length in characters (code points), as Postgres's char_length counts it. */
export function labelLength(text: string): number {
  return [...text].length;
}

/**
 * An amount as a form field shows it to change: exact, with a decimal comma
 * and never in exponent form, "0,3333333333333333", "1500000".
 */
export function exactAmountText(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "";
  return amount.toLocaleString("sv-SE", { useGrouping: false, maximumFractionDigits: 20 }).replace("\u2212", "-");
}

/**
 * The amount in the field as typed: empty is `null`; otherwise a positive
 * quantity read by parseQuantity ("1,5", "½") below maxCustomAmount, or the
 * message to show at the field. A range ("1-2") is not one amount.
 */
export function parseCustomAmount(text: string): { amount: number | null } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { amount: null };
  if (/[-–—]/.test(trimmed)) return { error: customAmountErrorMessage };
  const amount = parseQuantity(trimmed);
  if (amount === null || !(amount > 0)) return { error: customAmountErrorMessage };
  if (amount >= maxCustomAmount) return { error: customAmountTooLargeMessage };
  return { amount };
}

/**
 * What the sheet sends and addCustomItem takes: the plan the list was counted
 * for, the text, the catalog ingredient Pontus chose among the suggestions
 * (or none), the amount as typed and the unit ("" for none). `id` is made by
 * the client and kept while the form is unchanged, so a retry after a lost
 * answer adds the item once (AD-20). Amount and unit are both given or neither: an amount without
 * a unit gives "Välj en enhet." at the unit, a unit without an amount the
 * amount's message.
 */
export const customItemFormSchema = z
  .object({
    id: z.uuid().optional(),
    planId: z.uuid(),
    label: z.string(),
    ingredientId: z.uuid().nullable().optional(),
    amount: z.string(),
    unit: z.union([unitSchema, z.literal(""), z.null()]),
  })
  .transform((form, context) => {
    let valid = true;
    const issue = (field: "label" | "amount" | "unit", message: string) => {
      valid = false;
      context.addIssue({ code: "custom", path: [field], message });
    };
    const label = collapseLabel(form.label);
    if (!label) issue("label", labelRequiredMessage);
    else if (labelLength(label) > maxCustomLabelLength) issue("label", labelTooLongMessage);
    const parsed: ReturnType<typeof parseCustomAmount> =
      form.amount.length > maxCustomAmountChars ? { error: customAmountErrorMessage } : parseCustomAmount(form.amount);
    const unit: Unit | null = form.unit || null;
    if ("error" in parsed) issue("amount", parsed.error);
    else if (parsed.amount !== null && unit === null) issue("unit", unitRequiredMessage);
    else if (parsed.amount === null && unit !== null) issue("amount", customAmountErrorMessage);
    if (!valid || "error" in parsed) return z.NEVER;
    return {
      ...(form.id ? { id: form.id } : {}),
      planId: form.planId,
      label,
      ingredientId: form.ingredientId ?? null,
      amount: parsed.amount,
      unit,
    };
  });
export type CustomItemFormInput = z.input<typeof customItemFormSchema>;
export type CustomItemForm = z.output<typeof customItemFormSchema>;

/**
 * An own item as stored (shopping_custom_item): what removeCustomItem returns
 * and restoreCustomItem puts back with the same id (AD-20), and what the
 * list's overlay holds (AD-8).
 */
export const customItemRowSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    label: z
      .string()
      .refine((label) => label.trim() !== "" && labelLength(label) <= maxCustomLabelLength),
    ingredientId: z.uuid().nullable(),
    amount: z.number().positive().lt(maxCustomAmount).nullable(),
    unit: unitSchema.nullable(),
  })
  .refine((row) => (row.amount === null) === (row.unit === null), { path: ["unit"] });
export type CustomItemRow = z.infer<typeof customItemRowSchema>;

/** An own item as the list reads it: computeList's overlay.customItems. */
export type CustomListItem = Pick<CustomItemRow, "id" | "label" | "ingredientId" | "amount" | "unit">;

/**
 * The form's own messages by field name (`label`, `amount`, `unit`), the
 * first per field, for `fail("validation", fields)` and the sheet. Zod's
 * built-in messages are English and never shown, so only custom issues count.
 */
export function customItemFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (issue.code === "custom" && field && !(field in fields)) fields[field] = issue.message;
  }
  return fields;
}
