import { z } from "zod";
import { cleanIngredientText, normalizeIngredientText } from "./normalize";

// Searching the catalog while typing (AD-1: the search* exception), e.g. when
// Pontus swaps the ingredient of a recipe line. Names and synonyms are stored
// normalised (lower case), so the query is compared in lower case too.

/** At most this many hits per search. */
export const maxSearchHits = 20;

/** What searchIngredients takes: the text typed so far. */
export const ingredientSearchSchema = z.string().max(100);

export type IngredientSearchHit = { id: string; name: string };

/** The query as stored text is written: composed letters, single spaces, lower case. */
export function searchText(query: string): string {
  return query.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("sv-SE");
}

/** A candidate: an ingredient, and the normalised texts (name, synonyms) it was found by. */
export type SearchCandidate = { id: string; name: string; matchedTexts: readonly string[] };

function rank(text: string, matched: readonly string[]): number {
  if (matched.includes(text)) return 0;
  if (matched.some((value) => value.startsWith(text))) return 1;
  if (matched.some((value) => value.split(" ").some((word) => word.startsWith(text)))) return 2;
  return 3;
}

/**
 * The hits for `text`, best first: an exact name or synonym, then those that
 * start with the text, then a word that starts with it, then the rest; within
 * each, by name in Swedish order. One hit per ingredient, at most `maxSearchHits`.
 */
export function rankSearchHits(text: string, candidates: readonly SearchCandidate[]): IngredientSearchHit[] {
  const byId = new Map<string, { name: string; matched: string[] }>();
  for (const { id, name, matchedTexts } of candidates) {
    const entry = byId.get(id) ?? { name, matched: [] };
    entry.matched.push(...matchedTexts);
    byId.set(id, entry);
  }
  const collator = new Intl.Collator("sv-SE");
  return [...byId]
    .map(([id, { name, matched }]) => ({ id, name, rank: rank(text, matched) }))
    .sort((a, b) => a.rank - b.rank || collator.compare(a.name, b.name))
    .slice(0, maxSearchHits)
    .map(({ id, name }) => ({ id, name }));
}

/**
 * The name to offer as a new catalog ingredient for what Pontus typed, given
 * the hits for it: the typed text without amount and unit ("2 dl
 * Schalottenlök" → "Schalottenlök"), or `null` when nothing is left or a hit
 * already has that name (compared normalised: "gul LÖK" is "Gul lök").
 */
export function newIngredientName(query: string, hits: readonly IngredientSearchHit[]): string | null {
  const name = cleanIngredientText(query) || query.trim();
  if (!name) return null;
  const normalized = normalizeIngredientText(name);
  return hits.some((hit) => normalizeIngredientText(hit.name) === normalized) ? null : name;
}
