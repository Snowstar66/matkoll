// Name fallbacks for finding an ingredient's nutrition row. Conservative: the
// exact name always comes first, then the name without descriptive words, then
// the last word of a multi-word name ("fast potatis" -> "potatis"). Nothing
// else is guessed.

/** Words that describe the state of an ingredient, not what it is. */
const DESCRIPTIVE = new Set([
  "färsk", "färska", "hackad", "hackade", "riven", "rivna", "skivad", "skivade", "tärnad", "tärnade",
  "kokt", "kokta", "fryst", "frysta", "djupfryst", "djupfrysta", "ekologisk", "ekologiska", "krav",
  "finhackad", "finhackade", "strimlad", "strimlade", "pressad", "pressade", "malen", "malda", "torkad", "torkade",
  "stekt", "stekta", "rökt", "rökta", "skalad", "skalade", "mogen", "mogna", "stor", "stora", "liten", "små", "medelstor",
  "ca", "lite", "gärna", "svensk", "svenska",
]);

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
  return out;
}
