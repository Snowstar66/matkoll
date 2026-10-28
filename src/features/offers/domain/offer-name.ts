import { normalizeIngredientText } from "@/features/catalog";
import { charLength, oneLine } from "@/lib/one-line";

// What an offer is called (Story 9.1, AD-25): the label as the store wrote it
// ("Arla Herrgård, Präst, Grevé") and the names the catalog is asked about
// ("herrgård präst grevé", "herrgård", "präst", "grevé"). Matching is
// the catalog's own (matchIngredients, exact name or synonym); nothing here
// guesses. Pure.

/** Longest label and name, in characters, as store_offer's checks count them. */
export const maxOfferLabelChars = 120;
export const maxOfferNameChars = 100;

/** The text cut to `max` characters (code points), with "…" at the end when cut. */
export function clip(text: string, max: number): string {
  if (charLength(text) <= max) return text;
  return `${[...text].slice(0, max - 1).join("").trimEnd()}…`;
}

/** Without ®, ™ and ©, on one line. */
const withoutMarks = (text: string) => oneLine(text.replace(/[®™©]/g, ""));

/** ICA's brand without the origin it sometimes carries: "Kronfågel. Ursprung Sverige" → "Kronfågel". */
const cleanBrand = (brand: string) => withoutMarks(brand).replace(/\.\s*ursprung\b.*$/i, "").trim();

/** An amount with its unit anywhere in a name: "ca 700 g", "4-p", "6-pack", "1,5 l", "40 %". */
const amount = /(?:^|\s)(?:ca\.?\s*)?\d+(?:[.,]\d+)?\s*-?\s*(?:p|pack|st|g|hg|kg|ml|cl|dl|l|liter|%)(?=$|[\s,/])/giu;

/** The places a name with several items divides: ",", "/", " eller " and " och ". */
const separators = /\s*(?:,|\/|\s+eller\s+|\s+och\s+)\s*/iu;

export type OfferName = {
  /** Brand and name as the store wrote them, without ®™ and at most 120 characters. */
  label: string;
  /**
   * The names to look up in the catalog, normalised, in order: the whole
   * name, then each of its items. The first that matches gives the catalog
   * ingredient.
   */
  candidates: string[];
  /** The name when nothing matches: the first item, normalised (at most 100 characters). */
  fallback: string;
};

/**
 * The label and the catalog names of an offer: `{ brand: "Gårdens", name:
 * "Herrgård®, Präst®" }` gives the label "Gårdens Herrgård, Präst", the
 * candidates "herrgård präst", "herrgård" and "präst", and the fallback
 * "herrgård". The brand is left out of the names, and so are amounts.
 */
export function offerName(details: { brand: string; name: string }): OfferName {
  const brand = cleanBrand(details.brand);
  let name = withoutMarks(details.name);
  // A name that starts with the brand ("Jätten" by Jätten) is not written twice.
  const startsWithBrand = brand !== "" && name.toLowerCase().startsWith(brand.toLowerCase());
  const label = clip(brand && !startsWithBrand ? `${brand} ${name}` : name, maxOfferLabelChars);
  if (startsWithBrand && name.length > brand.length) name = name.slice(brand.length).trim();

  const whole = oneLine(name.replace(amount, " "));
  const items = whole.split(separators).map((item) => item.trim()).filter(Boolean);
  const candidates = [...new Set([whole, ...items].map((text) => clip(normalizeIngredientText(text), maxOfferNameChars)))].filter(
    Boolean,
  );
  const fallback =
    clip(normalizeIngredientText(items[0] ?? ""), maxOfferNameChars) ||
    candidates[0] ||
    clip(label.toLowerCase(), maxOfferNameChars);
  return { label, candidates, fallback };
}
