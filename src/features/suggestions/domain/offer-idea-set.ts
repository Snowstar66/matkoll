import { z } from "zod";
import { normalizeTitle } from "@/lib/suggest-input";
import { dishSuggestionsSchema, type DishSuggestion } from "./suggestions";

// The saved set of "Nya idéer med extrapris" (Pontus 2026-11-06): the AI job runs in the background
// when the offers are fetched (or on the first view), and its answer is kept per household and offer
// week, so the card Rätter med extrapris and Matsedel's På erbjudande show the same ready ideas.
// Pure, so it is tested without a database or a model.

/** At most this many ideas are shown. */
export const maxOfferIdeas = 3;

/** A set still pending after this long belongs to a run that died, and is taken over. */
export const staleSetMs = 5 * 60 * 1000;

/** How often a pending set is looked at again. */
export const pollSetMs = 4_000;

/** One saved idea: a savable draft with its why, and the id it gets as a recipe (made once, so saving twice never makes a copy). */
export const savedIdeaSchema = dishSuggestionsSchema.shape.suggestions.element.extend({ recipeId: z.uuid() });
export type SavedIdea = z.infer<typeof savedIdeaSchema>;

/** An idea as the UI holds it: the suggestion and its recipe id. */
export type OfferIdea = DishSuggestion & { recipeId: string };

export type OfferIdeasState = "none" | "pending" | "ready" | "failed";

/** What the card and Matsedel show. `hasOffers` is false when there is nothing to build ideas on (nothing is shown then). */
export type OfferIdeasView = {
  hasOffers: boolean;
  state: OfferIdeasState;
  intro: string;
  ideas: OfferIdea[];
  /** The app's error code of a failed set; `null` otherwise. */
  errorCode: string | null;
};

export const noOfferIdeas: OfferIdeasView = { hasOffers: false, state: "none", intro: "", ideas: [], errorCode: null };

/** The row as the data layer reads it. */
export type OfferIdeaSetRow = {
  status: string;
  claimedAt: string;
  intro: string;
  ideas: unknown;
  errorCode: string | null;
};

/** The ideas of a stored `ideas` value that still pass the schema (anything else is left out). */
export function parseSavedIdeas(value: unknown): SavedIdea[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = savedIdeaSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The ideas whose title is not already a recipe of the household (saved from here, or the same dish another way), at most three. */
export function dropSavedIdeas<T extends { draft: { title: string } }>(ideas: readonly T[], savedTitles: readonly string[]): T[] {
  const taken = new Set(savedTitles.map(normalizeTitle));
  return ideas.filter((idea) => !taken.has(normalizeTitle(idea.draft.title))).slice(0, maxOfferIdeas);
}

/**
 * The view of a stored set. No row, or a pending one that no run holds any more, is `none` (the first view
 * then starts one); a ready set whose ideas are all saved is `ready` with none left.
 */
export function toOfferIdeasView(row: OfferIdeaSetRow | null, savedTitles: readonly string[], now: Date): OfferIdeasView {
  const base = { ...noOfferIdeas, hasOffers: true };
  if (!row) return base;
  if (row.status === "pending") {
    return now.getTime() - new Date(row.claimedAt).getTime() > staleSetMs ? base : { ...base, state: "pending" };
  }
  if (row.status === "failed") return { ...base, state: "failed", errorCode: row.errorCode };
  if (row.status !== "ready") return base;
  const ideas = dropSavedIdeas(parseSavedIdeas(row.ideas), savedTitles);
  return { ...base, state: "ready", intro: ideas.length > 0 ? row.intro : "", ideas };
}
