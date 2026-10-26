import { z } from "zod";
import { customAmountErrorMessage, maxCustomAmount, maxCustomAmountChars, parseCustomAmount } from "./custom-item";
import { lineKeySchema, parseLineKey } from "./line-key";

// Corrected amounts and hidden lines on the shopping list (Story 3.6, FR-17,
// AD-8): shopping_line_override holds, per meal plan and recipe line key, an
// amount that replaces the counted one and whether the line is hidden.
// computeList applies them as long as the key is the same. Pure, so it is
// tested without a database.
//
// - Only a recipe line has an override: an own item (`c:`) has its own amount
//   and is removed for good (Story 3.5).
// - Only a line with a unit (`r:<id>:<unit>`) has an amount to correct; a
//   vague line (`r:<id>:-`) and a line without a catalog ingredient (`t:`)
//   can only be hidden.

/** An override as the list reads it: computeList's overlay.overrides. */
export type LineOverride = {
  /** The line's key (line-key.ts). */
  key: string;
  /** The corrected amount in the key's unit, or `null` for the counted one. */
  amount: number | null;
  /**
   * The amount the list counted when the correction was saved, so the row can
   * say when the counted amount has changed since; `null` when not known.
   */
  baseAmount: number | null;
  /** Hidden ("Ta bort"): the line is left out of the list. */
  hidden: boolean;
};

/** Whether the line has an override at all: a recipe line, never an own item. */
export function isOverridableKey(key: string): boolean {
  const parsed = parseLineKey(key);
  return parsed !== null && parsed.kind !== "custom";
}

/** Whether the line's amount can be corrected: a line with a unit. */
export function isAmountKey(key: string): boolean {
  return parseLineKey(key)?.kind === "recipe";
}

const overridableKeySchema = lineKeySchema.refine(isOverridableKey, { message: "invalid_line_key" });
const amountKeySchema = lineKeySchema.refine(isAmountKey, { message: "invalid_line_key" });

/**
 * An override as stored (shopping_line_override): what hideLine returns and
 * restoreLine puts back with the same id (AD-20).
 */
export const lineOverrideRowSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid(),
    key: overridableKeySchema,
    amount: z.number().positive().lt(maxCustomAmount).nullable(),
    baseAmount: z.number().positive().lt(maxCustomAmount).nullable(),
    hidden: z.boolean(),
  })
  .refine((row) => row.amount === null || isAmountKey(row.key), { path: ["amount"] })
  .refine((row) => row.baseAmount === null || row.amount !== null, { path: ["baseAmount"] });
export type LineOverrideRow = z.infer<typeof lineOverrideRowSchema>;

/** The hidden row's updated_at as hideLine returns it; restoreLine compares it to see a later change. */
const timestampSchema = z.string().min(1).max(64);

/**
 * What hideLine returns: the line's override as it was before, or `null`
 * when it had none (a line hidden already gives its row as not hidden, so
 * "Ångra" always brings it back), and the hidden row's updated_at.
 */
export type HiddenLine = { previous: LineOverrideRow | null; hiddenUpdatedAt: string };

/** A line of a plan: what hideLine and clearLineAmount take. */
export const lineRefSchema = z.object({ planId: z.uuid(), key: overridableKeySchema });
export type LineRef = z.infer<typeof lineRefSchema>;

/** A line whose amount can be corrected: what clearLineAmount takes. */
export const amountLineRefSchema = z.object({ planId: z.uuid(), key: amountKeySchema });

/**
 * What restoreLine takes: the line, its override as hideLine returned it (or
 * `null` when it had none) and the hidden row's updated_at from hideLine
 * (`null` when not known). The row must be the line's own.
 */
export const restoreLineSchema = z
  .object({
    planId: z.uuid(),
    key: overridableKeySchema,
    previous: lineOverrideRowSchema.nullable(),
    hiddenUpdatedAt: timestampSchema.nullable(),
  })
  .refine(({ planId, key, previous }) => previous === null || (previous.planId === planId && previous.key === key), {
    path: ["previous"],
  });
export type RestoreLine = z.infer<typeof restoreLineSchema>;

/**
 * What the detail's amount field sends and setLineAmount takes: the plan the
 * list was counted for, the line's key (a line with a unit) and the amount as
 * typed. The amount is read by parseQuantity ("1,5", "½") and must be above 0
 * and below 1 000 000; empty or anything else gives "Ange ett tal större än
 * 0." at the field.
 */
export const lineAmountFormSchema = z
  .object({
    planId: z.uuid(),
    key: amountKeySchema,
    amount: z.string(),
    /** The amount the list counted when the detail opened; stored beside the correction. */
    baseAmount: z.number().positive().lt(maxCustomAmount).nullable().optional(),
  })
  .transform((form, context) => {
    const parsed: ReturnType<typeof parseCustomAmount> =
      form.amount.length > maxCustomAmountChars ? { error: customAmountErrorMessage } : parseCustomAmount(form.amount);
    if ("error" in parsed || parsed.amount === null) {
      context.addIssue({ code: "custom", path: ["amount"], message: "error" in parsed ? parsed.error : customAmountErrorMessage });
      return z.NEVER;
    }
    return { planId: form.planId, key: form.key, amount: parsed.amount, baseAmount: form.baseAmount ?? null };
  });
export type LineAmountFormInput = z.input<typeof lineAmountFormSchema>;
export type LineAmountForm = z.output<typeof lineAmountFormSchema>;

/**
 * The amount field's message, for `fail("validation", fields)` and the
 * detail: `{ amount: "Ange ett tal större än 0." }`, or `{}` when the refusal
 * is not about the amount (a key or plan that is not one).
 */
export function lineAmountFieldErrors(error: z.ZodError): Record<string, string> {
  const issue = error.issues.find((one) => one.code === "custom" && one.path[0] === "amount");
  return issue ? { amount: issue.message } : {};
}
