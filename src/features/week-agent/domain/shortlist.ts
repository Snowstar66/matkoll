import { fitRank, foodFit, type FitNote } from "@/features/menu-advisor";
import { allergenTerms, ingredientWords, isVegetarian, kindOf, sharedWord } from "./facts";
import type { ExcludedDish, RecipeCandidate, ShortlistContext } from "./types";

// The code's half of the planning: from the household's whole library to a short, ranked list the model (or the
// fallback) chooses from. Allergies are a HARD rule here and again in planAroundFixed/validatePicks: a dish that may
// hold an allergen of anyone in the household is never in the list, and is reported by name. Everything else only
// ranks. Pure and deterministic: the same input gives the same list.

export const maxShortlist = 30;
/** A dish with at most this many minutes counts as quick. */
export const quickMinutes = 35;
const maxPerKind = 8;

export type ShortlistResult = { candidates: RecipeCandidate[]; excludedForAllergy: ExcludedDish[] };

/** The weights of the ranking, exported so tests (and a later tuning) can name them. */
export const weights = {
  fit: 10,
  offer: 8,
  offerLow: 12,
  useSoon: 10,
  useSoonExtra: 3,
  quick: 4,
  sharesWithFixed: 2,
  recent: [0, -12, -6, -3, -3] as const,
} as const;

function recentPenalty(weeksAgo: number | undefined): number {
  if (weeksAgo === undefined || weeksAgo < 1) return 0;
  return weights.recent[Math.min(weeksAgo, weights.recent.length - 1)];
}

/** The score of one candidate (higher is better): taste, offers, use-soon, quick weekdays, recent repeats, a shared ingredient with a fixed dish. */
export function scoreCandidate(candidate: RecipeCandidate, ctx: ShortlistContext, notes?: readonly FitNote[]): number {
  const { settings } = ctx;
  const fit = notes ?? foodFit({ name: candidate.title, ingredients: [...candidate.ingredients] }, ctx.people);
  let score = fitRank(fit) * weights.fit;
  const offers = candidate.offers ?? [];
  if (settings.favourOffers && offers.length > 0) score += settings.budget === "low" ? weights.offerLow : weights.offer;
  const soon = candidate.useSoon ?? [];
  if (settings.useSoonFirst && soon.length > 0) score += weights.useSoon + (Math.min(soon.length, 3) - 1) * weights.useSoonExtra;
  if (settings.quickWeekdays && candidate.totalMinutes !== null && candidate.totalMinutes <= quickMinutes) score += weights.quick;
  score += recentPenalty(ctx.recent.filter((entry) => entry.recipeId === candidate.id).reduce<number | undefined>((best, entry) => (best === undefined ? entry.weeksAgo : Math.min(best, entry.weeksAgo)), undefined));
  if (ctx.fixedDays.length > 0) {
    const words = ingredientWords(candidate.ingredients);
    if (ctx.fixedDays.some((fixed) => sharedWord(words, ingredientWords(fixed.ingredients)))) score += weights.sharesWithFixed;
  }
  return score;
}

/** Keeps what passes `keep`, unless that leaves fewer than `min`: then nothing is filtered (a rule that empties the list is not a rule). */
function softFilter<T>(list: T[], keep: (item: T) => boolean, min: number): T[] {
  const kept = list.filter(keep);
  return kept.length >= min ? kept : list;
}

/**
 * The ranked shortlist, best first, at most `max`. In order: duplicates and dishes already fixed on the week out;
 * the allergy rule (hard); a low budget drops dishes marked costly while enough remain; the score ranks; no more than
 * eight of one kind of dish; enough vegetarian dishes for the vegetarian days. Equal scores keep the title's order.
 */
export function buildShortlist(pool: readonly RecipeCandidate[], ctx: ShortlistContext, max: number = maxShortlist): ShortlistResult {
  const fixedIds = new Set(ctx.fixedDays.flatMap((fixed) => (fixed.recipeId ? [fixed.recipeId] : [])));
  const seen = new Set<string>();
  const excludedForAllergy: ExcludedDish[] = [];
  const safe: RecipeCandidate[] = [];
  for (const candidate of pool) {
    if (seen.has(candidate.id) || fixedIds.has(candidate.id)) continue;
    seen.add(candidate.id);
    const terms = allergenTerms(candidate, ctx.people);
    if (terms) excludedForAllergy.push({ recipeId: candidate.id, title: candidate.title, allergens: terms });
    else safe.push(candidate);
  }
  const needed = Math.max(ctx.settings.dinners, 1);
  const affordable = ctx.settings.budget === "low" ? softFilter(safe, (c) => c.costLevel !== "high", needed + 3) : safe;
  const ranked = affordable
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, ctx) }))
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title, "sv") || a.candidate.id.localeCompare(b.candidate.id))
    .map((entry) => entry.candidate);

  const perKind = new Map<string, number>();
  const picked: RecipeCandidate[] = [];
  const overflow: RecipeCandidate[] = [];
  for (const candidate of ranked) {
    const kind = kindOf(candidate);
    const count = perKind.get(kind) ?? 0;
    if (count >= maxPerKind || picked.length >= max) overflow.push(candidate);
    else {
      perKind.set(kind, count + 1);
      picked.push(candidate);
    }
  }
  // Too few after the kind cap: take the rest in rank order.
  for (const candidate of overflow) if (picked.length < Math.min(max, needed + 6)) picked.push(candidate);

  const vegDays = ctx.settings.vegetarianDays.length;
  if (vegDays > 0) {
    const vegInPicked = picked.filter(isVegetarian);
    const missing = Math.min(vegDays + 1, 5) - vegInPicked.length;
    if (missing > 0) {
      const extra = ranked.filter((candidate) => isVegetarian(candidate) && !picked.includes(candidate)).slice(0, missing);
      // Make room by dropping the lowest-ranked non-vegetarian dishes.
      for (const candidate of extra) {
        const dropAt = picked.map((p, i) => (isVegetarian(p) ? -1 : i)).filter((i) => i >= 0).at(-1);
        if (picked.length >= max && dropAt !== undefined) picked.splice(dropAt, 1);
        picked.push(candidate);
      }
      picked.sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
    }
  }
  return { candidates: picked.slice(0, max), excludedForAllergy };
}
