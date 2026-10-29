// The small store badge on an offer row (Story 9.13): a short name derived
// from the store's name ("Maxi ICA Stormarknad Östersund" → "Maxi", "ICA
// Kvantum Krokom" → "Krokom"), and the colour token of its chain. Pure.

/** Words that name the chain or the kind of store, not the place. */
const kindWords = new Set(["ica", "maxi", "kvantum", "supermarket", "nära", "stormarknad", "willys", "hemköp", "coop", "lidl"]);
/** The longest badge, in characters, so a long place name never fills the row. */
export const maxStoreBadgeChars = 12;

/** "Maxi" for a Maxi store; else the first word that is not a chain or store-kind word ("Krokom"); else the first word, cut. */
export function storeBadgeText(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Butik";
  const clip = (word: string) => (word.length > maxStoreBadgeChars ? `${word.slice(0, maxStoreBadgeChars - 1)}…` : word);
  if (words[0].toLowerCase() === "maxi") return "Maxi";
  const place = words.find((word) => !kindWords.has(word.toLowerCase()));
  return clip(place ?? words[0]);
}

/** The colour of the badge: ICA has its own, every other chain the neutral one. */
export function storeBadgeTone(chain: string): "ica" | "other" {
  return chain === "ICA" ? "ica" : "other";
}

/** What a row's badge shows. */
export type StoreBadgeInfo = { text: string; tone: "ica" | "other" };

/** A store as the offer list needs it: for the badge, the filter pills and the note on the shopping list. */
export type OfferStoreInfo = { id: string; name: string; chain: string };
