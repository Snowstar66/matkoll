import { normalizeUnit } from "./units";

// The one normalisation of ingredient text (AD-6). Catalog names and synonyms
// are stored normalised, and matching compares normalised text only.
// cleanIngredientText does the same work but keeps the original casing; it
// gives the display name of a proposed ingredient.

const inflections = (...words: string[][]) => new Set(words.flat());

/** Preparation words that never change what is bought; removed anywhere. */
const preparationWords = inflections(
  ["hackad", "hackat", "hackade"],
  ["finhackad", "finhackat", "finhackade"],
  ["grovhackad", "grovhackat", "grovhackade"],
  ["skivad", "skivat", "skivade"],
  ["tärnad", "tärnat", "tärnade"],
  ["pressad", "pressat", "pressade"],
  ["strimlad", "strimlat", "strimlade"],
  ["rumsvarm", "rumsvarmt", "rumsvarma"],
);

/**
 * Words that can name a product of their own ("torkade tomater", "riven ost",
 * "rökt lax"). Removed only after a comma, where they describe the handling:
 * "Persilja, färsk" → "persilja".
 */
const afterCommaWords = inflections(
  ["torkad", "torkat", "torkade"],
  ["fryst", "frysta"],
  ["färsk", "färskt", "färska"],
  ["riven", "rivet", "rivna"],
  ["smält", "smälta"],
  ["rökt", "rökta"],
  ["fint", "grovt", "tunt"],
);

/** Phrases at the end of a line or part that say when to use it, not what it is. */
const trailingPhrases = ["efter smak", "efter behov", "till servering", "till garnering", "till stekning"];

const approximately = new Set(["ca", "ca.", "cirka", "ungefär"]);

/** Amounts written as words: "två ägg", "ett par ägg", "lite salt", "några droppar". */
const amountWords = new Set([
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
  "elva",
  "tolv",
  "några",
  "lite",
]);

/** Vague measures that are not catalog units; removed after an amount like a unit. */
const measureWords = new Set([
  "näve",
  "nävar",
  "nypa",
  "nypor",
  "kvist",
  "kvistar",
  "bit",
  "bitar",
  "skvätt",
  "stänk",
  "droppe",
  "droppar",
  "par",
  "handfull",
  "handfullar",
  "blad",
  "huvud",
  "huvuden",
  "stjälk",
  "stjälkar",
  "tumme",
  "cm",
]);

const fractions = "½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞";
/** A token that is part of a leading number: "1", "1,5", "½", "1/2", "2-3", "–". */
const numberToken = new RegExp(`^[\\d.,/⁄${fractions}–—-]+$`);
/** A number glued to a unit: "500g", "2dl", "1,5dl". */
const gluedUnit = new RegExp(`^([\\d.,/⁄${fractions}]+)(\\p{L}+\\.?)$`, "u");
const listMarker = /^[\s•*·\-–—]+/;
const punctuation = /[.:;!?"”“'’*•·]/g;

/** Text without anything in parentheses, nested or left unclosed. */
function withoutParentheses(text: string): string {
  let depth = 0;
  let result = "";
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      result += char;
      continue;
    }
    result += " ";
  }
  return result;
}

const lower = (word: string) => word.toLocaleLowerCase("sv-SE");
const isUnitWord = (word: string) => normalizeUnit(word.replace(/[.,]$/, "")).unit !== null;
const isMeasureWord = (word: string) => measureWords.has(lower(word).replace(/[.,]$/, ""));

/** Index of the first word after a leading amount and its unit or measure, or 0 without an amount. */
function amountEnd(words: string[]): number {
  let index = 0;
  if (approximately.has(lower(words[index] ?? ""))) index++;
  const start = index;
  while (index < words.length && (numberToken.test(words[index]) || amountWords.has(lower(words[index])))) index++;
  if (index === start) return 0;
  if (index < words.length && (isUnitWord(words[index]) || isMeasureWord(words[index]))) index++;
  return index;
}

/** Removes trailing phrases and handling words from one comma-separated part. */
function cleanPart(part: string, afterComma: boolean): string {
  let words = part.replace(punctuation, " ").split(/\s+/).filter(Boolean);
  for (let removed = true; removed; ) {
    removed = false;
    const tail = lower(words.join(" "));
    for (const phrase of trailingPhrases) {
      if (tail === phrase || tail.endsWith(` ${phrase}`)) {
        words = words.slice(0, words.length - phrase.split(" ").length);
        removed = true;
      }
    }
  }
  return words
    .filter((word) => !preparationWords.has(lower(word)) && !(afterComma && afterCommaWords.has(lower(word))))
    .join(" ");
}

/**
 * Ingredient text without list marker, leading amount and unit (also glued,
 * "500g", or in words, "ett par"), parentheses, trailing phrases ("efter
 * smak") and handling words, in its original casing: "1 Lök, hackad" → "Lök".
 */
export function cleanIngredientText(text: string | null | undefined): string {
  const words = withoutParentheses((text ?? "").normalize("NFC"))
    .replace(listMarker, "")
    .split(/\s+/)
    .filter(Boolean);

  const first = approximately.has(lower(words[0] ?? "")) ? 1 : 0;
  const glued = gluedUnit.exec(words[first] ?? "");
  if (glued && isUnitWord(glued[2])) words.splice(first, 1, glued[1], glued[2]);

  return words
    .slice(amountEnd(words))
    .join(" ")
    .split(",")
    .map((part, index) => cleanPart(part, index > 0))
    .filter(Boolean)
    .join(" ");
}

/**
 * The normalised form of ingredient text: cleaned and in lower case.
 * "1 Lök, hackad" → "lök", "2 dl Grädde (40 %)" → "grädde". Empty text
 * gives "", which never matches.
 */
export function normalizeIngredientText(text: string | null | undefined): string {
  return lower(cleanIngredientText(text));
}
