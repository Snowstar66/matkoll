import { z } from "zod";
import { formatQuantity, normalizeIngredientText, normalizeUnit, parseQuantity, type Unit } from "@/features/catalog";

// Basvaror (Pontus 2026-11-02): what a household always has at home, so it is
// never on the shopping list and never counts in "Saknar N varor": water, salt,
// pepper and the common spices always; sugar, flour, butter and oil in small
// amounts ("räknas som basvara upp till 1 dl"). A need above the limit
// (baking) counts as today. The one staple concept: the shopping list, the
// recipes' status and the offer suggestions all ask isStaple. Pure, so it is
// tested without a database. The default list is kept in the database
// (household_staple_defaults()).

/** The units a staple's limit is given in: volume and weight, never pieces. */
export const STAPLE_UNITS = ["g", "kg", "ml", "cl", "dl", "l", "krm", "tsk", "msk"] as const satisfies readonly Unit[];

export type StapleUnit = (typeof STAPLE_UNITS)[number];

/** A staple's limit: a need up to `maxAmount maxUnit` counts as a staple; both `null` is always. */
export type StapleLimit = { maxAmount: number; maxUnit: StapleUnit } | { maxAmount: null; maxUnit: null };

/** One of the household's staples, as Inställningar → Basvaror shows it. */
export type Staple = StapleLimit & {
  id: string;
  /** As shown: "Salt", "Vetemjöl". */
  name: string;
  /** As matched (catalog.normalizeIngredientText): "salt", "vetemjöl". */
  normalizedName: string;
};

/**
 * The household's staples as the counting reads them: by catalog ingredient
 * id (the ingredient whose name or synonym is the staple's), and by normalised
 * name, for a line without a catalog ingredient. Plain objects, so a page can
 * hand them to the browser.
 */
export type StapleRules = {
  byIngredient: Readonly<Record<string, StapleLimit>>;
  byName: Readonly<Record<string, StapleLimit>>;
};

/** No staples: everything counts as before Basvaror. */
export const noStaples: StapleRules = { byIngredient: {}, byName: {} };

const always: StapleLimit = { maxAmount: null, maxUnit: null };

const limitOf = (staple: StapleLimit): StapleLimit =>
  staple.maxAmount === null ? always : { maxAmount: staple.maxAmount, maxUnit: staple.maxUnit };

/**
 * The rules for `staples`, with `ingredientIds`: the catalog ingredients (by
 * the staple's normalised name) whose name or synonym is that name. When an
 * ingredient is reached by two staples, the first one in `staples` wins.
 */
export function stapleRules(
  staples: readonly Staple[],
  ingredientIds: Readonly<Record<string, readonly string[]>> = {},
): StapleRules {
  const byIngredient: Record<string, StapleLimit> = {};
  const byName: Record<string, StapleLimit> = {};
  for (const staple of staples) {
    const limit = limitOf(staple);
    if (!Object.hasOwn(byName, staple.normalizedName)) byName[staple.normalizedName] = limit;
    for (const id of Object.hasOwn(ingredientIds, staple.normalizedName) ? ingredientIds[staple.normalizedName] : []) {
      if (!Object.hasOwn(byIngredient, id)) byIngredient[id] = limit;
    }
  }
  return { byIngredient, byName };
}

/**
 * The limit of the staple a line is, or `null` when it is none: by its catalog
 * ingredient first, else by its name (the catalog's name, or the line's own
 * text), compared normalised.
 */
export function stapleLimitFor(
  rules: StapleRules,
  ingredientId: string | null | undefined,
  name?: string | null,
): StapleLimit | null {
  if (ingredientId && Object.hasOwn(rules.byIngredient, ingredientId)) return rules.byIngredient[ingredientId];
  const key = name ? normalizeIngredientText(name) : "";
  return key && Object.hasOwn(rules.byName, key) ? rules.byName[key] : null;
}

/** Millilitres per unit of volume: 1 krm is 1 ml, 1 tsk 5 ml, 1 msk 15 ml. */
const millilitres: Partial<Record<Unit, number>> = { ml: 1, cl: 10, dl: 100, l: 1000, krm: 1, tsk: 5, msk: 15 };
/** Grams per unit of weight. */
const grams: Partial<Record<Unit, number>> = { g: 1, kg: 1000 };

function measureOf(unit: Unit): { kind: "volume" | "weight"; factor: number } | null {
  if (millilitres[unit] !== undefined) return { kind: "volume", factor: millilitres[unit] };
  if (grams[unit] !== undefined) return { kind: "weight", factor: grams[unit] };
  return null;
}

/**
 * `amount` in `from` as an amount in `to`, for comparing a need with a staple's
 * limit only: "3 msk" is 0,45 dl. Between volume and weight a millilitre counts
 * as a gram, which is rough (a decilitre of flour weighs 60 g), but so is the
 * limit. Units that count things (st, förp, …) are never converted: `null`.
 * Everywhere else units are never converted into each other (AD-12).
 */
export function convertAmount(amount: number, from: Unit, to: Unit): number | null {
  const source = measureOf(from);
  const target = measureOf(to);
  if (!source || !target) return null;
  return (amount * source.factor) / target.factor;
}

/**
 * Whether a need of `amount unit` is within the staple's limit: always for a
 * staple without one, and for a need without an amount ("salt efter smak"),
 * which counts as small. A need in a unit that cannot be converted (st, förp;
 * `null` with an amount is pieces) is not.
 */
export function withinStapleLimit(limit: StapleLimit, amount: number | null, unit: Unit | null): boolean {
  if (limit.maxAmount === null) return true;
  if (amount === null) return true;
  const converted = convertAmount(amount, unit ?? "st", limit.maxUnit);
  if (converted === null) return false;
  return converted <= limit.maxAmount * (1 + 1e-9);
}

/** A need as isStaple reads it: a recipe line, or a sum of lines of one ingredient in one unit. */
export type StapleNeed = {
  ingredientId: string | null;
  /** The catalog's name of the ingredient, or the line's own text without one. */
  name?: string | null;
  amount: number | null;
  unit: Unit | null;
};

/** Whether the need is a staple the household has, within its limit: then it counts as at home. */
export function isStaple(rules: StapleRules, need: StapleNeed): boolean {
  const limit = stapleLimitFor(rules, need.ingredientId, need.name);
  return limit !== null && withinStapleLimit(limit, need.amount, need.unit);
}

/** "alltid", "upp till 1 dl", "upp till 50 g": a staple's limit in words, for Inställningar → Basvaror. */
export function stapleLimitText(limit: StapleLimit): string {
  return limit.maxAmount === null ? "alltid" : `upp till ${formatQuantity(limit.maxAmount, limit.maxUnit)}`;
}

/** The longest name of a staple. */
export const maxStapleNameChars = 60;

/** At most this many staples a household (the database's household_staple_limit). */
export const maxStaples = 200;

/** The footer under the shopping list when something was left out: "Basvaror räknas inte med". */
export const staplesFooterText = "Basvaror räknas inte med";

/** Something went: "Tog bort Salt." */
export function removedStapleText(name: string): string {
  return `Tog bort ${name}.`;
}

/** Something came: "Lade till Kardemumma." */
export function addedStapleText(name: string): string {
  return `Lade till ${name}.`;
}

/** "Basvaror" on the start page of Inställningar: "21 basvaror", "1 basvara". */
export function staplesCountText(count: number): string {
  return `${count} ${count === 1 ? "basvara" : "basvaror"}`;
}

/** A number glued to its unit, "50g", or with a space, "1,5 dl" and "½ tsk". */
const limitPattern = /^(.*?[\d½⅓⅔¼¾⅛⅜⅝⅞])\s*([\p{L}.]+)$/u;

/**
 * The limit typed in Basvaror's "Upp till" field: empty is always, "1 dl",
 * "1,5dl", "50 g" and "2 msk" are limits. `null` for anything else: no number,
 * a number that is not positive, or a unit that is not volume or weight
 * ("2 st").
 */
export function parseStapleLimit(text: string): StapleLimit | null {
  const trimmed = text.normalize("NFC").trim();
  if (trimmed === "") return always;
  const match = limitPattern.exec(trimmed);
  if (!match) return null;
  const amount = parseQuantity(match[1]);
  const { unit } = normalizeUnit(match[2]);
  if (amount === null || amount > 100_000 || unit === null || !(STAPLE_UNITS as readonly Unit[]).includes(unit)) return null;
  return { maxAmount: amount, maxUnit: unit as StapleUnit };
}

/** What Lägg till sends: a name, and the limit as typed. */
export const stapleFormSchema = z.object({
  name: z
    .string()
    .transform((name) => name.normalize("NFC").replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, "Skriv vad du alltid har hemma.").max(maxStapleNameChars, `Högst ${maxStapleNameChars} tecken.`))
    .refine((name) => normalizeIngredientText(name) !== "", "Skriv vad du alltid har hemma."),
  limit: z.string().max(40).optional().default(""),
});

/** A staple to add back (Ångra): its name and limit, as it was. */
export const stapleRestoreSchema = z
  .object({
    name: z.string().trim().min(1).max(maxStapleNameChars),
    maxAmount: z.number().positive().max(100_000).nullable(),
    maxUnit: z.enum(STAPLE_UNITS).nullable(),
  })
  .refine((staple) => (staple.maxAmount === null) === (staple.maxUnit === null));

export type StapleRestore = z.infer<typeof stapleRestoreSchema>;

/** Basvaror sorted for the page: the always ones first, then by name in Swedish order. */
export function compareStaples(a: Staple, b: Staple): number {
  const always = Number(b.maxAmount === null) - Number(a.maxAmount === null);
  return always || a.name.localeCompare(b.name, "sv-SE", { sensitivity: "base" });
}
