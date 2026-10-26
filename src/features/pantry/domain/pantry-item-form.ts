import { z } from "zod";
import {
  catalogName,
  locationSchema,
  normalizeIngredientText,
  parseQuantity,
  sectionSchema,
  unitSchema,
  type IngredientSearchHit,
  type Unit,
} from "@/features/catalog";
import { charLength, hasRefusedCodePoint, oneLine } from "@/lib/one-line";

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

/** The longest brand or kind on a pantry item (pantry_item_label_check, tests/design/pantry-checks.test.ts). */
export const maxPantryLabelLength = 60;
/** Under the field "Märke eller sort" when the text is too long. */
export const labelTooLongMessage = `Skriv högst ${maxPantryLabelLength} tecken.`;
/** Under the field "Märke eller sort" when nothing in it can be seen (only combining marks, for example). */
export const labelUnusableMessage = "Skriv bokstäver, siffror eller tecken.";

/**
 * Format characters that look blank and that a label never holds, besides
 * refusedCodePoints (src/lib/one-line.ts): the soft hyphen, the combining
 * grapheme joiner, the Hangul fillers and the word joiner. Built from code
 * points, so no invisible character is ever written in the source
 * (tests/design/invisible-characters.test.ts); pantry_item_label_check
 * refuses the same ones (tests/design/pantry-checks.test.ts).
 */
export const blankLabelCodePoints: readonly number[] = [0x00ad, 0x034f, 0x115f, 0x2060, 0x3164];
const blankLabelCharacters = blankLabelCodePoints.map((point) => String.fromCodePoint(point)).join("");
const blankInLabel = new RegExp(`[${blankLabelCharacters}]`, "u");
const blankInLabelEverywhere = new RegExp(`[${blankLabelCharacters}]`, "gu");
/** Something that can be seen: a letter, a digit, a symbol or punctuation. */
const visibleInLabel = /[\p{L}\p{N}\p{S}\p{P}]/u;

/**
 * A pantry item's brand or kind as stored (Story 11.2, FR-42, AD-19), the
 * rule of pantry_item_label_check: 1–60 characters (code points, as
 * char_length counts them), no space at either end (btrim), none of
 * refusedCodePoints or blankLabelCodePoints, and at least one character that
 * can be seen. The database's "can be seen" is wider (anything but white
 * space), so a row the database takes and this refuses is read without its
 * label (listPantryIn). toPantryLabel makes any text into one, or null.
 */
export const pantryLabelSchema = z
  .string()
  .refine((label) => !/^ | $/.test(label))
  .refine((label) => charLength(label) >= 1 && charLength(label) <= maxPantryLabelLength)
  .refine((label) => !hasRefusedCodePoint(label) && !blankInLabel.test(label))
  .refine((label) => visibleInLabel.test(label));

/** A text on one line, without the blank-looking format characters: what both ways in start from. */
function normalizeLabel(raw: string): string {
  return oneLine(oneLine(raw).replace(blankInLabelEverywhere, ""));
}

/** What toPantryLabel removes from the end of a label: spaces, an ellipsis, and a dash or comma left by a cut. */
const labelTail = /[\s….,;:\-–—]+$/u;

const graphemes = new Intl.Segmenter("sv", { granularity: "grapheme" });

/**
 * The text cut to maxPantryLabelLength characters at a grapheme boundary, so
 * an emoji or a letter with its accent is never split: at the last space
 * when there is one, otherwise after the last whole grapheme that fits.
 */
function cutLabel(text: string): string {
  if (charLength(text) <= maxPantryLabelLength) return text;
  let kept = "";
  let count = 0;
  let lastSpace = -1;
  let endsOnWord = false;
  for (const { segment } of graphemes.segment(text)) {
    const length = charLength(segment);
    if (count + length > maxPantryLabelLength) {
      endsOnWord = segment === " ";
      break;
    }
    if (segment === " ") lastSpace = kept.length;
    kept += segment;
    count += length;
  }
  if (endsOnWord || lastSpace <= 0) return kept;
  return kept.slice(0, lastSpace);
}

/**
 * A text as a pantry item's label, or `null` when nothing usable is left: on
 * one line without blank-looking characters, cut to maxPantryLabelLength
 * characters at a grapheme boundary (cutLabel), with an ellipsis, spaces and
 * a dash or comma at the end removed, never added, and checked with
 * pantryLabelSchema. For the model's labels ("Arla Mellanmjölk laktosfri
 * 1,5 l"); the sheet's field is refused instead when it is too long
 * (parseLabelField).
 */
export function toPantryLabel(raw: string | null | undefined): string | null {
  const label = cutLabel(normalizeLabel(raw ?? "")).replace(labelTail, "");
  return pantryLabelSchema.safeParse(label).success ? label : null;
}

/**
 * The label a confirmed lagerförslag gives its pantry item (Story 11.2,
 * FR-42): the first of the model's labels (Story 6.5) that is more than the
 * item's name ("Ägg" for "ägg" says nothing more), as toPantryLabel makes it,
 * or `null`. Here rather than in pantry-suggestion.ts, so place-inventory.ts
 * can use it too; that file exports it as well.
 */
export function suggestionLabel(suggestion: { name: string; labels?: readonly string[] }): string | null {
  const name = normalizeIngredientText(suggestion.name);
  for (const raw of suggestion.labels ?? []) {
    const label = toPantryLabel(raw);
    if (label !== null && normalizeIngredientText(label) !== name) return label;
  }
  return null;
}

/**
 * The field "Märke eller sort" as typed: on one line without blank-looking
 * characters, and `null` when empty, so an emptied field removes the label.
 * Too long, or nothing that can be seen, is the message to show under the
 * field. The field has no maxLength, which would count UTF-16 units: the
 * limit is counted here, in characters.
 */
export function parseLabelField(text: string): { label: string | null } | { error: string } {
  const label = normalizeLabel(text);
  if (label === "") return { label: null };
  if (charLength(label) > maxPantryLabelLength) return { error: labelTooLongMessage };
  if (!pantryLabelSchema.safeParse(label).success) return { error: labelUnusableMessage };
  return { label };
}

/** A name as typed, trimmed and with single spaces: "  Coca-Cola  Zero 33 cl " → "Coca-Cola Zero 33 cl". */
export function collapseName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A search hit in the sheet Lagervara; `exact` when the typed text is its name or one of its synonyms. */
export type PantrySearchHit = IngredientSearchHit & { exact?: boolean };

/**
 * The name to offer as a new catalog ingredient in the sheet Lagervara: what
 * Pontus typed, trimmed with single spaces and with an uppercase first letter
 * as the catalog stores it ("bregott" → "Bregott", Story 10.4). Amounts and
 * units stay, since the sheet has fields of its own for them ("7up",
 * "Coca-Cola Zero 33 cl"). None
 * when the name has nothing the catalog can store, or when a hit already is
 * the ingredient: its name or a synonym is the typed text, normalised.
 */
export function pantryNewIngredientName(query: string, hits: readonly PantrySearchHit[]): string | null {
  const name = collapseName(query);
  const normalized = normalizeIngredientText(name);
  if (!normalized || name.length > maxIngredientNameLength) return null;
  const taken = hits.some((hit) => hit.exact || normalizeIngredientText(hit.name) === normalized);
  return taken ? null : catalogName(name);
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

/** The longest text the field "Märke eller sort" may send; longer is refused before it is read. */
const maxLabelFieldLength = 400;

/**
 * What the sheet sends: the ingredient, the amount as typed (empty for
 * unlimited), the unit (null or "" for none), the location, the place the
 * sheet was opened for (`siteId`, FR-33: the item is saved there, also when
 * Hemma has selected another place since), and the id of the row being
 * changed, if any. A new ingredient gets a default unit only
 * when Pontus chose one for an amount; never the `st` of an amount without
 * unit, and never from an unlimited item.
 */
export const pantryItemFormSchema = z
  .object({
    ingredient: pantryIngredientSchema,
    amount: z.string().max(40),
    unit: z.union([unitSchema, z.literal(""), z.null()]),
    location: locationSchema,
    siteId: z.uuid(),
    replaceId: z.uuid().nullable(),
    /**
     * Story 11.2: the field "Märke eller sort" as typed; empty removes the
     * label. Left out by a client of before the story, which keeps it.
     */
    label: z.string().max(maxLabelFieldLength).optional(),
  })
  .transform((form, context) => {
    const parsed = parseAmountField(form.amount);
    const parsedLabel = form.label === undefined ? { label: undefined } : parseLabelField(form.label);
    if ("error" in parsedLabel) {
      context.addIssue({ code: "custom", path: ["label"], message: parsedLabel.error });
    }
    if ("error" in parsed) {
      context.addIssue({ code: "custom", path: ["amount"], message: parsed.error });
    }
    if ("error" in parsed || "error" in parsedLabel) return z.NEVER;
    const { amount } = parsed;
    const { label } = parsedLabel;
    // Without an amount the item is unlimited and has no unit; an amount without a unit is pieces.
    const unit: Unit | null = amount === null ? null : form.unit || unitWithoutUnit;
    const ingredient =
      form.ingredient.kind === "new"
        ? { ...form.ingredient, defaultUnit: amount === null ? null : form.unit || null }
        : form.ingredient;
    return {
      ingredient,
      location: form.location,
      amount,
      unit,
      siteId: form.siteId,
      replaceId: form.replaceId,
      ...(label === undefined ? {} : { label }),
    };
  });
export type PantryItemFormInput = z.input<typeof pantryItemFormSchema>;
export type PantryItemForm = z.output<typeof pantryItemFormSchema>;

/**
 * One item for setPantryItems (AD-19): the amount is set exactly for the
 * ingredient, location and unit. Amount and unit are both null (unlimited)
 * or both set. `label` (Story 11.2): a text sets the item's label, and
 * leaving it out keeps the label the row has. `null` removes it only from
 * the row being edited (`replaceId`); on any other row it keeps the label.
 */
const pantryItemSetShape = z.object({
  ingredientId: z.uuid(),
  location: locationSchema,
  amount: z.number().positive().lt(maxPantryAmount).nullable(),
  unit: unitSchema.nullable(),
  label: pantryLabelSchema.nullable().optional(),
});
const amountHasUnit = (item: { amount: number | null; unit: string | null }) =>
  (item.amount === null) === (item.unit === null);

/**
 * `photoLabel` (Story 11.2, after review): a label from a photo (the model's,
 * suggestionLabel). It fills the row's label only when the row has none, so
 * a label Pontus wrote is never replaced by the model's. `label` wins when an
 * item has both.
 */
export const pantryItemSetSchema = pantryItemSetShape
  .extend({ photoLabel: pantryLabelSchema.optional() })
  .refine(amountHasUnit, { path: ["unit"] });
export type PantryItemSet = z.infer<typeof pantryItemSetSchema>;

/**
 * A pantry row as removePantryItem returns it and restorePantryItem takes it
 * back, with the same id (AD-19, AD-20), and with its place (`siteId`, AD-24)
 * when the database gave it, so "Ångra" puts it back on its own place. Story
 * 11.2: also with its label and the time it was added (`createdAt`, as the
 * database gives it), so "Ångra" puts them back; restore_pantry_item makes a
 * time later than now into now.
 */
export const pantryRowSchema = pantryItemSetShape
  .extend({ id: z.uuid(), siteId: z.uuid().optional(), createdAt: z.iso.datetime({ offset: true }).optional() })
  .refine(amountHasUnit, { path: ["unit"] });
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
