import { z } from "zod";

// Units and quantities (AD-12). These are the only functions that interpret or
// display amounts. Units are never converted into each other.

export const UNITS = [
  "g",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
  "krm",
  "tsk",
  "msk",
  "st",
  "förp",
  "klyfta",
  "kruka",
  "knippe",
  "skiva",
] as const;

export const unitSchema = z.enum(UNITS);
export type Unit = z.infer<typeof unitSchema>;

/** Spellings that mean a unit, in lower case and without a trailing period. */
const unitAliases = new Map<string, Unit>([
  ...UNITS.map((unit) => [unit, unit] as const),
  ["gr", "g"],
  ["gram", "g"],
  ["kilo", "kg"],
  ["kilogram", "kg"],
  ["milliliter", "ml"],
  ["centiliter", "cl"],
  ["deciliter", "dl"],
  ["liter", "l"],
  ["lit", "l"],
  ["kryddmått", "krm"],
  ["tesked", "tsk"],
  ["teskedar", "tsk"],
  ["matsked", "msk"],
  ["matskedar", "msk"],
  ["styck", "st"],
  ["stycken", "st"],
  ["stk", "st"],
  ["förpackning", "förp"],
  ["förpackningar", "förp"],
  ["paket", "förp"],
  ["pkt", "förp"],
  ["burk", "förp"],
  ["burkar", "förp"],
  ["påse", "förp"],
  ["påsar", "förp"],
  ["ask", "förp"],
  ["askar", "förp"],
  ["flaska", "förp"],
  ["flaskor", "förp"],
  ["klyftor", "klyfta"],
  ["krukor", "kruka"],
  ["knippa", "knippe"],
  ["knippen", "knippe"],
  ["knippor", "knippe"],
  ["skivor", "skiva"],
]);

export type NormalizedUnit = { unit: Unit; known: true } | { unit: null; known: boolean };

/**
 * The unit for a written unit, e.g. "deciliter" → `dl`, "paket" → `förp`.
 * No unit at all is `{ unit: null, known: true }`; an unknown unit ("näve") is
 * `{ unit: null, known: false }`, and the caller marks the line vague.
 */
export function normalizeUnit(raw: string | null | undefined): NormalizedUnit {
  const key = (raw ?? "").normalize("NFC").trim().toLocaleLowerCase("sv-SE").replace(/\.$/, "");
  if (key === "") return { unit: null, known: true };
  const unit = unitAliases.get(key);
  return unit ? { unit, known: true } : { unit: null, known: false };
}

const unicodeFractions: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const fractionChars = Object.keys(unicodeFractions).join("");

const decimal = String.raw`\d+(?:[.,]\d+)?`;
const slash = String.raw`\d+\s*[/⁄]\s*\d+`;
const unicode = `[${fractionChars}]`;
/** One number: "1,5", "1.5", "½", "1½", "1 ½", "1/2", "1 1/2". */
const single = new RegExp(`^(?:(\\d+)\\s*(${unicode})|(\\d+)\\s+(${slash})|(${slash})|(${unicode})|(${decimal}))$`);

function parseSlash(text: string): number | null {
  const [numerator, denominator] = text.split(/[/⁄]/).map((part) => Number(part.trim()));
  return denominator > 0 ? numerator / denominator : null;
}

/** "1.500", "1 000" and "10 000,5": a "." or space before exactly three digits groups thousands. */
const grouped = /^\d{1,3}(?:[. \u00a0\u202f]\d{3})+(?:,\d+)?$/;

function parseSingle(raw: string): number | null {
  const trimmed = raw.trim();
  const text = grouped.test(trimmed) ? trimmed.replace(/[. \u00a0\u202f]/g, "") : trimmed;
  const match = single.exec(text);
  if (!match) return null;
  const [, whole, wholeFraction, mixed, mixedFraction, fraction, unicodeOnly, plain] = match;
  if (whole !== undefined) return Number(whole) + unicodeFractions[wholeFraction];
  if (mixed !== undefined) {
    const part = parseSlash(mixedFraction);
    return part === null ? null : Number(mixed) + part;
  }
  if (fraction !== undefined) return parseSlash(fraction);
  if (unicodeOnly !== undefined) return unicodeFractions[unicodeOnly];
  return Number(plain.replace(",", "."));
}

/**
 * The amount in a written quantity: "1,5" and "1.5" → 1.5, "½" → 0.5,
 * "1 1/2" → 1.5, "1.500" and "1 000" → thousands. A range ("2-3", "2–3")
 * gives its largest value, as the AI prompt does. Text that is not a positive
 * quantity gives `null`.
 */
export function parseQuantity(text: string | null | undefined): number | null {
  const parts = (text ?? "").normalize("NFC").trim().split(/\s*[-–—]\s*/);
  if (parts.length > 2) return null;
  const values = parts.map(parseSingle);
  if (values.some((value) => value === null || !Number.isFinite(value) || value <= 0)) return null;
  return Math.max(...(values as number[]));
}

/**
 * An amount with its unit for display, with Swedish decimal comma and at most
 * two decimals, rounded half up: (1.5, "dl") → "1,5 dl", (0.333, "dl") →
 * "0,33 dl", (1.005, "dl") → "1,01 dl". A positive amount that would round to
 * 0 shows as "<0,01". The only place amounts are rounded (AD-12). Missing
 * amount gives "".
 */
export function formatQuantity(amount: number | null | undefined, unit: Unit | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  // The relative epsilon lifts binary near-misses such as 1.005 (stored as
  // 1.00499…) to the half they were written as.
  const rounded = Math.round(amount * 100 * (1 + 1e-12)) / 100;
  const number = amount > 0 && rounded === 0 ? "<0,01" : String(rounded === 0 ? 0 : rounded).replace(".", ",");
  return unit ? `${number} ${unit}` : number;
}
