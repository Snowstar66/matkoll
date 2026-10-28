// Story 10.4: names as written, and as the catalog stores them. The same
// cases check catalogName (src/features/catalog/domain/name.test.ts) and the
// SQL function catalog_display_name with its trigger
// (tests/integration/catalog.test.ts), so the two rules cannot drift apart.
// Every input is trimmed, as catalogName trims before the rule.
export const catalogNameCases: readonly (readonly [input: string, stored: string])[] = [
  ["bregott", "Bregott"],
  ["mellanmjölk", "Mellanmjölk"],
  ["gul lök", "Gul lök"],
  ["Gul lök", "Gul lök"],
  ["x", "X"],
  // Swedish and other letters.
  ["ägg", "Ägg"],
  ["åkerbär", "Åkerbär"],
  ["ölkorv", "Ölkorv"],
  ["éclair", "Éclair"],
  // Decomposed "å" (a and a combining ring): only the letter changes, nothing is normalised.
  ["a\u030Akerbär", "A\u030Akerbär"],
  // The first letter, after leading quotes, brackets and emoji.
  ["(eko) mjölk", "(Eko) mjölk"],
  ['"ägg"', '"Ägg"'],
  ["\u{1F95A}ägg", "\u{1F95A}Ägg"],
  // A first word that is already mixed case is kept.
  ["iPhone-laddare", "iPhone-laddare"],
  ["pH-neutral", "pH-neutral"],
  ["eKaffe", "eKaffe"],
  ["ICA korv", "ICA korv"],
  // A digit first, or no letter: kept.
  ["7up", "7up"],
  ["!!!", "!!!"],
  // No one-letter capital, or a capital that changes the lower-case name: kept.
  ["ß-test", "ß-test"],
  ["ıstanbul", "ıstanbul"],
  ["ſalt", "ſalt"],
  // Title case and its lower case get the upper-case letter in both rules.
  ["ǅus", "Ǆus"],
  ["ǆus", "Ǆus"],
  // A letter without case.
  ["中abc", "中abc"],
];
