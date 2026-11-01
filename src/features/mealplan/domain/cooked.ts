import { z } from "zod";
import { formatQuantity, parseQuantity, unitSchema, type Unit } from "@/features/catalog";
import { aggregateNeeds, atHomeText, roundSum, type NeedLine, type PantrySnapshot } from "@/features/pantry";

// Markera som lagad (Story 13.4, FR-13): what a cooked dish takes from the
// pantry. The lines are summed per ingredient and unit (pantry.aggregateNeeds)
// and compared with the pantry as "X av Y hemma" does (pantry.coverage): only
// an amount in the same unit as the pantry's is deducted. Units are never
// converted (AD-12) and nothing is guessed: anything else is "Kontrollera
// själv". Pure, so it is tested without a database.

/** A recipe line as the sheet reads it. */
export type CookedLine = NeedLine & { id: string; originalText?: string };

/** A pantry item the dish takes from: what is at home, what the recipe needs, what is left. */
export type DeductLine = {
  /** The ingredient and unit; one line each. */
  key: string;
  ingredientId: string;
  name: string;
  unit: Unit;
  /** At home in `unit`, in the selected place. */
  current: number;
  /** What the dish needs, scaled to its servings. */
  need: number;
  /** The suggested new amount: `current - need`, never below 0. */
  suggested: number;
  /** The dish needs more than is at home, so the suggestion is 0. */
  short: boolean;
};

/** A line that is not deducted: Pontus checks it himself. */
export type CheckLine = { key: string; text: string; reason: string };

export type CookedPlan = { deduct: DeductLine[]; check: CheckLine[] };

/** What the sheet says over the lines that are not deducted. */
export const checkHeading = "Kontrollera själv";

const keyOf = (ingredientId: string, unit: Unit) => `${ingredientId}:${unit}`;

/**
 * The sheet's lines for a dish: `lines` are the recipe's own, `factor` is the
 * dish's servings over the recipe's (recipes.scaleFactor). `names` are the
 * catalog names by ingredient id; a line falls back to its written text.
 * An unlimited item, a missing item, an amount in another unit and a line
 * without an amount are "Kontrollera själv"; so is a line without a catalog
 * ingredient. The rest are deducted.
 */
export function cookedPlan(
  lines: readonly CookedLine[],
  factor: number,
  snapshot: PantrySnapshot,
  names: Readonly<Record<string, string>>,
): CookedPlan {
  const textOf = (ingredientId: string) =>
    names[ingredientId] ?? lines.find((line) => line.ingredientId === ingredientId)?.originalText ?? "Okänd vara";
  const deduct: DeductLine[] = [];
  const check: CheckLine[] = [];

  for (const line of lines) {
    if (line.ingredientId === null) {
      check.push({ key: `line:${line.id}`, text: line.originalText ?? "Okänd vara", reason: "Finns inte som vara i appen." });
    }
  }
  for (const need of aggregateNeeds(lines, factor)) {
    const text = textOf(need.ingredientId);
    const stock = snapshot.get(need.ingredientId);
    if (need.amount === null) {
      check.push({ key: `vague:${need.ingredientId}`, text, reason: "Ingen mängd i receptet." });
      continue;
    }
    const key = keyOf(need.ingredientId, need.unit);
    const same = stock?.amounts.find((amount) => amount.unit === need.unit);
    if (stock?.unlimited) {
      check.push({ key, text, reason: "Finns alltid hemma, så inget dras." });
    } else if (!stock || stock.amounts.length === 0) {
      check.push({ key, text, reason: "Finns inte i Matvaror." });
    } else if (!same) {
      check.push({ key, text, reason: `Annan enhet. ${atHomeText(stock.amounts)}` });
    } else {
      deduct.push({
        key,
        ingredientId: need.ingredientId,
        name: text,
        unit: need.unit,
        current: same.amount,
        need: need.amount,
        suggested: Math.max(0, roundSum(same.amount - need.amount)),
        short: need.amount > same.amount,
      });
    }
  }
  return { deduct, check };
}

/** "Receptet använder 2 dl": what the dish takes (Story 19.5; the old "5 dl − 2 dl → 3 dl" is gone). */
export function deductionText(line: Pick<DeductLine, "unit">, deducted: number): string {
  return `Receptet använder ${formatQuantity(deducted, line.unit)}`;
}

/** The note under a line that goes to 0: "Du har bara 1 dl hemma, så det blir 0." */
export function shortNote(line: Pick<DeductLine, "current" | "unit">): string {
  return `Receptet behöver mer än de ${formatQuantity(line.current, line.unit)} som finns hemma, så det blir 0.`;
}

/** An amount as the field shows it: "2,5". */
export const amountText = (amount: number): string => formatQuantity(amount, null);

/**
 * What is left of a line with the text in its field: the exact suggestion
 * while the text is still the one shown for it (so 0,333 is not cut to 0,33),
 * else what Pontus typed (parseNewAmount); `null` when it is not valid.
 */
export function newAmountOf(line: Pick<DeductLine, "current" | "suggested">, text: string): number | null {
  if (text.trim() === amountText(line.suggested)) return line.suggested;
  return parseNewAmount(text, line.current);
}

/**
 * The new amount Pontus typed, as a number from 0 up to what is at home, or
 * `null` when it is not one ("2,5" and "2.5" are the same; empty is not 0).
 */
export function parseNewAmount(text: string, current: number): number | null {
  const trimmed = text.trim();
  const value = /^0([.,]0*)?$/.test(trimmed) ? 0 : parseQuantity(trimmed);
  if (value === null || value > current) return null;
  return value;
}

/** What markDishCooked takes: the dish, and per line the amount to take off in its unit. */
export const markCookedSchema = z.object({
  dishId: z.uuid(),
  /** The place the sheet's amounts were computed from. */
  siteId: z.uuid().nullable(),
  deductions: z
    .array(z.object({ ingredientId: z.uuid(), unit: unitSchema, amount: z.number().positive().lt(1_000_000) }))
    .max(200),
});
export type MarkCookedInput = z.infer<typeof markCookedSchema>;

/** A pantry row a mark touched, for "Ångra": as it was, and what was taken. */
export const cookedUndoRowSchema = z.object({
  id: z.uuid(),
  site_id: z.uuid(),
  ingredient_id: z.uuid(),
  location: z.string(),
  amount: z.number(),
  unit: unitSchema,
  label: z.string().nullable(),
  created_at: z.string(),
  deducted: z.number().positive(),
  deleted: z.boolean(),
});
export type CookedUndoRow = z.infer<typeof cookedUndoRowSchema>;

/** What markDishCooked gives: when, and what "Ångra" needs. */
export type MarkedCooked = { cookedAt: string; rows: CookedUndoRow[] };

export const undoCookedSchema = z.object({ dishId: z.uuid() });
export type UndoCookedInput = z.infer<typeof undoCookedSchema>;

/** The confirmation after a dish was marked cooked, with "Ångra". */
export function cookedText(title: string, deductedCount: number): string {
  return deductedCount > 0
    ? `${title} är lagad. Matvarorna är uppdaterade.`
    : `${title} är lagad. Matvarorna är inte ändrade.`;
}

/** The confirmation after the mark was removed: the pantry stays as it is. */
export function uncookedText(title: string): string {
  return `${title} är inte längre markerad som lagad. Matvarorna är inte ändrade.`;
}
