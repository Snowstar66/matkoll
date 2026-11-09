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

/** Units that count whole things: what is bought in them is a whole number (decision 2026-10-26). */
export const COUNT_UNITS = ["st", "förp", "klyfta", "kruka", "knippe", "skiva"] as const satisfies readonly Unit[];

const countUnits: ReadonlySet<Unit> = new Set(COUNT_UNITS);

/** Whether `unit` counts whole things (COUNT_UNITS). */
export function isCountUnit(unit: Unit | null | undefined): boolean {
  return unit !== null && unit !== undefined && countUnits.has(unit);
}

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

/**
 * Units a recipe writes that the catalog does not have, with the catalog unit
 * and the amount of it that one of them makes. Read only when a recipe is
 * imported (importAmount), never in the catalog's own operations.
 *
 * AD-12 says units are never converted into each other, and that holds for the
 * pantry, the list and the shopping needs. A recipe from an American blog or a
 * caption is another matter: dropping "2 cups flour" to a line without amount
 * is worse than "4,8 dl". So the import converts once, and `originalText`
 * keeps the line as the source wrote it. The sizes are rough on purpose
 * (a näve is about a dl, a glas two); the amount shown is rounded to match.
 */
const foreignUnits = new Map<string, { unit: Unit; per: number }>([
  // Swedish measures the catalog has no unit for.
  ["nypa", { unit: "krm", per: 1 }],
  ["nypor", { unit: "krm", per: 1 }],
  ["näve", { unit: "dl", per: 1 }], // ungefär
  ["nävar", { unit: "dl", per: 1 }],
  ["kvist", { unit: "st", per: 1 }],
  ["kvistar", { unit: "st", per: 1 }],
  ["bit", { unit: "st", per: 1 }],
  ["bitar", { unit: "st", per: 1 }],
  ["glas", { unit: "dl", per: 2 }], // ungefär
  ["bunt", { unit: "knippe", per: 1 }],
  ["buntar", { unit: "knippe", per: 1 }],
  ["huvud", { unit: "st", per: 1 }],
  ["huvuden", { unit: "st", per: 1 }],
  // English and American.
  ["tbsp", { unit: "msk", per: 1 }],
  ["tbs", { unit: "msk", per: 1 }],
  ["tablespoon", { unit: "msk", per: 1 }],
  ["tablespoons", { unit: "msk", per: 1 }],
  ["tsp", { unit: "tsk", per: 1 }],
  ["teaspoon", { unit: "tsk", per: 1 }],
  ["teaspoons", { unit: "tsk", per: 1 }],
  ["cup", { unit: "dl", per: 2.4 }],
  ["cups", { unit: "dl", per: 2.4 }],
  ["oz", { unit: "g", per: 28 }],
  ["ounce", { unit: "g", per: 28 }],
  ["ounces", { unit: "g", per: 28 }],
  ["lb", { unit: "g", per: 454 }],
  ["lbs", { unit: "g", per: 454 }],
  ["pound", { unit: "g", per: 454 }],
  ["pounds", { unit: "g", per: 454 }],
  ["fl oz", { unit: "cl", per: 3 }],
  ["fl. oz", { unit: "cl", per: 3 }],
  ["fluid ounce", { unit: "cl", per: 3 }],
  ["fluid ounces", { unit: "cl", per: 3 }],
  ["pinch", { unit: "krm", per: 1 }],
  ["pinches", { unit: "krm", per: 1 }],
  ["dash", { unit: "krm", per: 1 }],
  ["handful", { unit: "dl", per: 1 }], // ungefär
  ["handfuls", { unit: "dl", per: 1 }],
  ["can", { unit: "förp", per: 1 }],
  ["cans", { unit: "förp", per: 1 }],
  ["package", { unit: "förp", per: 1 }],
  ["packages", { unit: "förp", per: 1 }],
  ["pkg", { unit: "förp", per: 1 }],
  ["clove", { unit: "klyfta", per: 1 }],
  ["cloves", { unit: "klyfta", per: 1 }],
  ["bunch", { unit: "knippe", per: 1 }],
  ["bunches", { unit: "knippe", per: 1 }],
  ["stick", { unit: "g", per: 113 }], // a stick of butter
  ["sticks", { unit: "g", per: 113 }],
  ["slice", { unit: "skiva", per: 1 }],
  ["slices", { unit: "skiva", per: 1 }],
  ["piece", { unit: "st", per: 1 }],
  ["pieces", { unit: "st", per: 1 }],
]);

/** A converted amount, rounded the way a person would write it: whole grams (fives from 50), halves of a dl or cl from 2, else a tenth. */
function roundImported(amount: number, unit: Unit): number {
  if (unit === "g") return amount >= 50 ? Math.round(amount / 5) * 5 : Math.round(amount);
  if ((unit === "dl" || unit === "cl") && amount >= 2) return Math.round(amount * 2) / 2;
  return Math.round(amount * 10) / 10;
}

/**
 * An amount and the unit it is written in, as the catalog has them, for a line
 * of an imported recipe: "2 dl" stays, "2 cups" becomes 4,8 dl → 5 dl,
 * "1 näve" becomes 1 dl. A catalog unit or no unit keeps the amount as is;
 * a unit that is neither the catalog's nor in the table above gives `null`,
 * and the caller keeps the line's original text only.
 */
export function importAmount(amount: number, rawUnit: string | null | undefined): { amount: number; unit: Unit | null } | null {
  const known = normalizeUnit(rawUnit);
  if (known.known) return { amount, unit: known.unit };
  const key = (rawUnit ?? "").normalize("NFC").trim().toLocaleLowerCase("sv-SE").replace(/\.$/, "").replace(/\s+/g, " ");
  const foreign = foreignUnits.get(key);
  if (!foreign) return null;
  return { amount: foreign.per === 1 ? amount : roundImported(amount * foreign.per, foreign.unit), unit: foreign.unit };
}

/**
 * Units a Swedish recipe writes inside the noun, by the noun's ending:
 * "vitlöksklyftor" is klyfta, "dillknippe" knippe, "basilikakruka" kruka,
 * "skinkskivor" skiva. Only units the catalog has; "dillkvist" has none.
 */
const nounUnits: readonly (readonly [RegExp, Unit])[] = [
  [/klyft(?:a|an|or|orna)$/, "klyfta"],
  [/knipp(?:e|en|a|or)$/, "knippe"],
  [/kruk(?:a|or)$/, "kruka"],
  [/skiv(?:a|or)$/, "skiva"],
];

/** What may stand before the noun: a number, a fraction or a range, "ca" or a number word. */
const leadWords = new Set([
  "ca",
  "ca.",
  "cirka",
  "ungefär",
  "en",
  "ett",
  "två",
  "tre",
  "fyra",
  "fem",
  "sex",
  "sju",
  "åtta",
  "nio",
  "tio",
  "tolv",
  "halv",
  "halva",
]);
const leadNumber = /^[\d½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞.,/⁄–-]+$/;
/** Words of size that may stand between the amount and the noun: "2 stora vitlöksklyftor". */
const sizeWords = new Set(["stor", "stora", "liten", "små", "medelstor", "medelstora", "hel", "hela", "färsk", "färska"]);

/** The unit `noun` names by its ending ("vitlöksklyftor" → klyfta), or `null`. */
export function unitOfNoun(noun: string | null | undefined): Unit | null {
  const word = (noun ?? "").normalize("NFC").trim().toLocaleLowerCase("sv-SE");
  return nounUnits.find(([ending]) => ending.test(word))?.[1] ?? null;
}

/**
 * Cloves in a whole one (a garlic bulb), on the low side so nothing asks for
 * too little (decision 2026-11-08). The one conversion between units: the
 * shopping list buys klyftor as whole ones, and a recipe's klyftor count
 * whole ones at home.
 */
export const CLOVES_PER_WHOLE = 10;

/**
 * The unit a recipe line writes inside its noun, right after the amount:
 * "2 vitlöksklyftor" and "3 klyftor vitlök, pressade" → klyfta, "2 stora
 * vitlöksklyftor" too. Only the first word after the amount counts (after a
 * word of size such as "stora"), before a comma or parenthesis, so "1 citron,
 * i klyftor", "1 citron i klyftor" and "1 vitlök" give `null`. For the lines
 * the AI reads as an amount without a unit.
 */
export function unitInNoun(text: string | null | undefined): Unit | null {
  const head = (text ?? "").normalize("NFC").toLocaleLowerCase("sv-SE").split(/[,(;:]/)[0];
  const words = head.split(/\s+/).filter((word) => word !== "");
  let start = 0;
  while (start < words.length && (leadNumber.test(words[start]) || leadWords.has(words[start]))) start++;
  if (start === 0) return null;
  if (sizeWords.has(words[start])) start++;
  return unitOfNoun(words[start]?.replace(/[^\p{L}]+$/u, ""));
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
 * The amount as it is shown: at most two decimals, rounded half up, so 1.005
 * is 1.01. The one display rounding (AD-12): formatQuantity shows it, and
 * pantry.coverage compares at it, so a line is never short while its amount
 * and what is at home read the same.
 */
export function displayAmount(amount: number): number {
  // The relative epsilon lifts binary near-misses such as 1.005 (stored as
  // 1.00499…) to the half they were written as.
  return Math.round(amount * 100 * (1 + 1e-12)) / 100;
}

/**
 * An amount with its unit for display, with Swedish decimal comma and at most
 * two decimals, rounded half up (displayAmount): (1.5, "dl") → "1,5 dl",
 * (0.333, "dl") → "0,33 dl", (1.005, "dl") → "1,01 dl". A positive amount that
 * would round to 0 shows as "<0,01". Missing amount gives "".
 */
export function formatQuantity(amount: number | null | undefined, unit: Unit | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "";
  const rounded = displayAmount(amount);
  const number = amount > 0 && rounded === 0 ? "<0,01" : String(rounded === 0 ? 0 : rounded).replace(".", ",");
  return unit ? `${number} ${unit}` : number;
}
