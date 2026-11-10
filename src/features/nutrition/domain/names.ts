// Name fallbacks for finding an ingredient's nutrition row. Conservative: the
// exact name always comes first, then the name without descriptive words, then
// the last word of a multi-word name ("fast potatis" -> "potatis"), and last a
// compound word whose ending is on a short allowlist of head nouns where the
// ending decides the food ("pankoströbröd" -> "ströbröd"). Nothing else is guessed.

/** Words that describe the state of an ingredient, not what it is. */
const DESCRIPTIVE = new Set([
  "färsk", "färska", "hackad", "hackade", "riven", "rivna", "skivad", "skivade", "tärnad", "tärnade",
  "kokt", "kokta", "fryst", "frysta", "djupfryst", "djupfrysta", "ekologisk", "ekologiska", "krav",
  "finhackad", "finhackade", "strimlad", "strimlade", "pressad", "pressade", "malen", "malda", "torkad", "torkade",
  "stekt", "stekta", "rökt", "rökta", "skalad", "skalade", "mogen", "mogna", "stor", "stora", "liten", "små", "medelstor",
  "ca", "lite", "gärna", "svensk", "svenska",
]);

/**
 * Head nouns a compound word may be cut down to, longest first. Only endings where the ending
 * alone decides what the food is, and where the table has a row of that name (a design test
 * checks it). Left out on purpose, because the front part changes the food: pasta (chipotlepasta,
 * currypasta), mjöl and socker (rågmjöl, vaniljsocker), färs (sojafärs), filé (laxfilé vs
 * kycklingfilé), grädde (havregrädde), smör (jordnötssmör), yoghurt, sås, ris, ägg.
 */
export const COMPOUND_HEADS: readonly string[] = [
  "ströbröd",
  "majonnäs",
  "buljong",
  "räkor",
  "räka",
  "dressing",
  "senap",
  "olja",
  "pesto",
  "sylt",
  "bröd",
  "korv",
  "ost",
].sort((a, b) => b.length - a.length);

/** Shortest ending and shortest front part a compound is cut at ("kost" is not "k" + "ost"). */
const MIN_HEAD = 3;
const MIN_PREFIX = 3;

/** The allowlisted head noun `word` ends in ("pankoströbröd" -> "ströbröd"), or `null`; the word itself is not cut. */
export function compoundHead(word: string): string | null {
  for (const head of COMPOUND_HEADS) {
    if (head.length >= MIN_HEAD && word.length - head.length >= MIN_PREFIX && word.endsWith(head)) return head;
  }
  return null;
}

/**
 * Normalised names to try for `name`, most specific first, without duplicates
 * (the name itself is the first).
 */
export function nameCandidates(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const add = (candidate: string) => {
    if (candidate && !out.includes(candidate)) out.push(candidate);
  };
  add(words.join(" "));
  const kept = words.filter((word) => !DESCRIPTIVE.has(word));
  if (kept.length > 0 && kept.length < words.length) add(kept.join(" "));
  if (kept.length > 1) add(kept[kept.length - 1]);
  const last = (kept.length > 0 ? kept : words).at(-1);
  const head = last ? compoundHead(last) : null;
  if (head) add(head);
  return out;
}
