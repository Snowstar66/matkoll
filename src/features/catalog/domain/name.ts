// A catalog ingredient's display name (Story 10.4). The name is stored with
// an uppercase first letter, whatever source it comes from ("bregott" →
// "Bregott", "ägg" → "Ägg"); the rest is kept as written. Only `name`
// changes: normalized_name, matching and search stay lower case
// (normalizeIngredientText, AD-6).

/**
 * The name as the catalog stores it: trimmed, with an uppercase first letter
 * (Swedish rules, so å, ä and ö work). A letter without a one-letter capital
 * ("ß") is kept, as the migration catalog_name_capital keeps it.
 */
export function catalogName(name: string): string {
  const trimmed = name.normalize("NFC").trim();
  const [first = ""] = trimmed;
  const upper = first.toLocaleUpperCase("sv-SE");
  return [...upper].length === 1 ? upper + trimmed.slice(first.length) : trimmed;
}

/**
 * A name inside a sentence or a running list, after other words: "Det gick
 * inte att ångra mjölk.", "Med: gul lök, grädde". The first letter is made
 * lower case, unless the first word is an abbreviation in capitals ("ICA-korv",
 * "BBQ-sås"), which keeps its spelling.
 */
export function nameInSentence(name: string): string {
  const [firstWord = ""] = name.split(/[\s-]/, 1);
  const letters = [...firstWord].filter((char) => /\p{L}/u.test(char));
  if (letters.length > 1 && letters.every((char) => char !== char.toLocaleLowerCase("sv-SE"))) return name;
  const [first = ""] = name;
  return first.toLocaleLowerCase("sv-SE") + name.slice(first.length);
}
