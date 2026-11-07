// UX-13b: the kind of dish a recipe without its own photo is drawn as (DishArt).
// Swedish keyword rules on the title, then on the ingredient lines: no AI call
// and nothing stored, so the same recipe gets the same drawing everywhere.
// Pure, so it is tested without a database.

export const DISH_KINDS = [
  "gryta",
  "soppa",
  "ugnsratt",
  "gratang",
  "fisk",
  "kyckling",
  "kott",
  "pasta",
  "wok",
  "sallad",
  "paj",
  "bakat",
  "tallrik",
] as const;
export type DishKind = (typeof DISH_KINDS)[number];

/** The drawing when nothing in the recipe names a kind of dish. */
export const defaultDishKind: DishKind = "tallrik";

type Rule = { kind: DishKind; pattern: RegExp };

// What the dish looks like on the table. The form wins over what the dish is
// made of, so "Kycklinggryta" is a pot and "Laxpasta" a bowl of pasta.
const formRules: readonly Rule[] = [
  { kind: "soppa", pattern: /soppa|soppor|ramen|chowder|gazpacho|bisque|minestrone|borsjtj/ },
  { kind: "gratang", pattern: /gratäng|gratin|frestelse/ },
  { kind: "paj", pattern: /paj|quiche/ },
  { kind: "sallad", pattern: /sallad|coleslaw|tabbouleh|bowl$/ },
  { kind: "wok", pattern: /wok|nudlar|nudel|chowmein|padthai|stektris|friedrice/ },
  {
    kind: "pasta",
    pattern:
      /pasta|spagetti|spaghetti|makaron|penne|tagliatelle|fusilli|lasagne|lasagna|tortellini|ravioli|gnocchi|linguine|fettuccine|farfalle|rigatoni|pappardelle|cannelloni|carbonara|bolognese|orzo/,
  },
  {
    kind: "gryta",
    pattern: /gryta|grytor|curry|chili|stroganoff|gulasch|ragu|ragù|tagine|korma|dal$|dahl|stuvning|kalops|lapskojs|bourguignon|masala/,
  },
  {
    kind: "bakat",
    pattern:
      /bröd|(?<!kött|fisk|kyckling|vego|kål|potatis)bull(e|ar)|(?<!pann|fisk|potatis)kak(a|or)$|tårta|tårtor|muffin|scones|cookies|brownie|bakelse|biskvi|semla|semlor|mazarin|längd|focaccia|baguette|croissant|kringla/,
  },
];

// What the dish is made of.
const proteinRules: readonly Rule[] = [
  { kind: "fisk", pattern: /fisk|lax|torsk|^sej|sill|räk|tonfisk|makrill|kolja|röding|gös|forell|skaldjur|musslor|krabb|hummer|kräft|scampi|pangasius|abborre|gädda/ },
  { kind: "kyckling", pattern: /kyckling|kalkon|höns|^anka|ankbröst|fågel/ },
  {
    kind: "kott",
    pattern:
      /kött|färs$|färsen|biff|fläsk|skinka|bacon|karré|revben|oxfilé|högrev|entrecote|entrecôte|lamm|kalv|vilt|älg|hjort|korv|chorizo|kassler|kotlett|pulled|^nöt/,
  },
];

// A dish made in the oven, the weakest: "Ugnsbakad lax" is a fish.
const ovenRules: readonly Rule[] = [{ kind: "ugnsratt", pattern: /^ugn|form$|formen|lådan?$|moussaka/ }];

/** Seasonings and stand-ins: "kycklingbuljong", "fisksås" and "vegofärs" name no protein. */
const notProtein = /buljong|fond|tärning|krydd|fisksås|ostronsås|vego|vegetar|veggie|soja|quorn|växtbaserad|anjovis|ansjovis|pastej/;

/** Words that bind the dish to what is served with it: "Lax med potatis", "Kyckling i curry". */
const joiners = new Set(["med", "i", "på", "och", "till", "samt", "à", "a", "la", "le", "with", "and", "under", "över"]);

/** Two-word names written as one, so they match as one word. */
const phrases: readonly [RegExp, string][] = [
  [/chow\s+mein/g, "chowmein"],
  [/pad\s+thai/g, "padthai"],
  [/stekt\s+ris/g, "stektris"],
  [/fried\s+rice/g, "friedrice"],
];

function wordsOf(text: string): string[] {
  let lower = text.toLowerCase();
  for (const [pattern, word] of phrases) lower = lower.replace(pattern, word);
  return lower.match(/[a-zåäöéèüùà]+/g) ?? [];
}

/** The last place in `word` that `pattern` matches, or -1. */
function lastMatch(word: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, "g");
  let last = -1;
  for (const match of word.matchAll(global)) last = match.index;
  return last;
}

/**
 * The kind one word names. In a Swedish compound the last part is the dish
 * ("pastasallad" is a salad, "nudelsoppa" a soup), so of several matches the
 * one furthest into the word wins.
 */
function kindOfWord(word: string, rules: readonly Rule[]): DishKind | null {
  if (rules === proteinRules && notProtein.test(word)) return null;
  let best: { kind: DishKind; at: number } | null = null;
  for (const { kind, pattern } of rules) {
    const at = lastMatch(word, pattern);
    if (at >= 0 && (best === null || at > best.at)) best = { kind, at };
  }
  return best?.kind ?? null;
}

/** The first kind the words name, read in order. */
function firstKind(words: readonly string[], rules: readonly Rule[]): DishKind | null {
  for (const word of words) {
    const kind = kindOfWord(word, rules);
    if (kind) return kind;
  }
  return null;
}

/** The protein most ingredient lines name; ties go to fish, then chicken, then meat. */
function mainProtein(ingredients: readonly string[]): DishKind | null {
  const counts = new Map<DishKind, number>();
  for (const line of ingredients) {
    const named = new Set(wordsOf(line).flatMap((word) => kindOfWord(word, proteinRules) ?? []));
    for (const kind of named) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let best: DishKind | null = null;
  for (const { kind } of proteinRules) if ((counts.get(kind) ?? 0) > (best ? (counts.get(best) ?? 0) : 0)) best = kind;
  return best;
}

/** The kind a part of the title names: a form first, then a protein, then a dish made in the oven. */
function kindOfPart(words: readonly string[]): DishKind | null {
  return firstKind(words, formRules) ?? firstKind(words, proteinRules) ?? firstKind(words, ovenRules);
}

/**
 * The kind of dish from the title and the ingredient lines (or names):
 * 1. the title's main part, up to "med", "i", "och" …: a form of dish it
 *    names ("Fiskgratäng", "Kyckling tikka masala"), else a protein ("Ugnsbakad
 *    lax"), else a dish made in the oven ("Ugnspannkaka");
 * 2. the rest of the title the same way ("Tacos med köttfärs");
 * 3. the protein most ingredient lines name, seasonings left out;
 * 4. else a plate.
 */
export function dishKind(title: string, ingredients: readonly string[] = []): DishKind {
  const words = wordsOf(title);
  const cut = words.findIndex((word, index) => index > 0 && joiners.has(word));
  const main = cut === -1 ? words : words.slice(0, cut);
  const rest = cut === -1 ? [] : words.slice(cut);
  return kindOfPart(main) ?? kindOfPart(rest) ?? mainProtein(ingredients) ?? defaultDishKind;
}
