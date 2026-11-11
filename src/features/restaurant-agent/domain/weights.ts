import type { Candidate, CuisineId, PlaceKind, RestaurantSettings } from "./types";

// "Sugen på" and household-preference weighting of candidates. Pure. It uses only what the finder gave (kind and
// distance), never Google text. The household's tastes are this module's own small type, structurally the same as
// menu-advisor's Person.tastes (AD-1: the route layer maps one to the other; no import between features).

/** One person as far as weighting needs: tastes by key, -2 Ogillar, -1 Hellre inte, 1 Gillar, 2 Älskar. */
export type HouseholdTaster = { tastes: Readonly<Record<string, number>> };

/** Which taste keys (menu-advisor's tasteGroups keys) each cuisine touches. */
export const cuisineTasteKeys: Readonly<Record<CuisineId, readonly string[]>> = {
  pizza: ["pizza"],
  asiatiskt: ["ris", "starkt"],
  italienskt: ["pasta", "pizza"],
  fisk: ["fisk", "skaldjur"],
  hamburgare: ["burgare", "kott"],
  husmanskost: ["kott"],
  mexikanskt: ["tacos", "starkt"],
  indiskt: ["starkt", "ris"],
  vegetariskt: ["vegetariskt"],
  sushi: ["fisk", "ris"],
};

export const sugenPaBonus = 3;
const maxDistanceScore = 2;

const isCuisine = (kind: PlaceKind): kind is CuisineId => kind in cuisineTasteKeys;

/** +3 when the place is one of the niches the user is "sugen på"; 0 otherwise (and when none are picked). */
export function sugenPaWeight(kind: PlaceKind, picked: readonly CuisineId[]): number {
  return isCuisine(kind) && picked.includes(kind) ? sugenPaBonus : 0;
}

/**
 * How well a cuisine fits the household: for each person the average of their opinions on its taste keys, summed over
 * people and divided by their number (so a big party does not outweigh a small one). A hated key (-2) counts double
 * negative. Unknown kinds and people with no opinion give 0.
 */
export function householdFit(kind: PlaceKind, people: readonly HouseholdTaster[]): number {
  if (!isCuisine(kind) || people.length === 0) return 0;
  const keys = cuisineTasteKeys[kind];
  const total = people.reduce((sum, person) => {
    const values = keys.map((key) => person.tastes[key] ?? 0).map((value) => (value <= -2 ? -4 : value));
    return sum + values.reduce((a, b) => a + b, 0) / keys.length;
  }, 0);
  return total / people.length;
}

/** Closer is better, a little: 2 at the door down to 0 at the edge of the radius. */
export function distanceScore(distanceM: number, radiusM: number): number {
  if (!Number.isFinite(distanceM) || radiusM <= 0) return 0;
  const share = Math.min(Math.max(distanceM / radiusM, 0), 1);
  return Math.round((1 - share) * maxDistanceScore * 100) / 100;
}

export type RankedCandidate = { candidate: Candidate; score: number };

/**
 * Candidates best first: sugen på, then the household's fit, then distance. Ties keep the finder's order. A candidate
 * outside the radius is dropped. This only orders; it never hides a place for a taste.
 */
export function rankCandidates(candidates: readonly Candidate[], settings: RestaurantSettings, people: readonly HouseholdTaster[]): RankedCandidate[] {
  return candidates
    .filter((candidate) => candidate.distanceM <= settings.radiusM)
    .map((candidate, index) => ({
      candidate,
      index,
      score: sugenPaWeight(candidate.kind, settings.cuisines) + householdFit(candidate.kind, people) + distanceScore(candidate.distanceM, settings.radiusM),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate, score }) => ({ candidate, score }));
}
