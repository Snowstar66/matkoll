"use server";

import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientSummaries, listIngredients } from "@/features/catalog/server";
import { claimOffersForAi, getActiveOffers, linkOffersToIngredient, OffersDataError, releaseOffersForAi } from "@/features/offers/server";
import { listRecipeRows, RecipeDataError } from "@/features/recipes/server";
import { getAiServiceForUser, listStores, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import type { AiService } from "@/server/ai/service";
import { revalidateFor } from "@/lib/revalidate";
import { buildOfferMatchRequest, offerLinks } from "./match-offers-request";

// Story 9.10: the offers ICA writes as product names ("Herrgård, Präst,
// Grevé") are linked to the catalog's ingredients by the AI, after the fetch
// and never inside it. The fetch (in the app, or the scheduled one on GitHub,
// which has no AI service) saves what the catalog matched by name and synonym;
// this runs when Recept opens the filter Erbjudanden, on the offers of the
// user's stores that still have no ingredient: one short text call with the
// offers' names and the ingredients' names (matchOffers), at most 60 offers.
// A link is kept on the offer rows, and a refetch carries it over by name
// (save-offer-page), and so does the stamp ai_matched_at that says the AI was asked (linked or answered "none"), so a name is asked for once. Nothing is written to the
// catalog (AD-6): no new ingredient, no synonym. A failure leaves the offers
// as they were and is only logged, so the filter works without the AI.

/** How long the model may take before the offers are left as they are. */
const matchTimeoutMs = 100_000;

/** The most ingredients read for the list the model chooses from (the request keeps 300). */
const ingredientReadLimit = 1_000;

export type MatchOffersWithAiData = {
  /** The offers linked to an ingredient now. */
  linked: number;
  /** The offers that still have no ingredient (not asked about, or the model found none). */
  open: number;
};

/**
 * Links the signed-in user's unlinked offers (all their stores, this week's)
 * to catalog ingredients with the AI. Gives the counts, `unauthorized`, or
 * `offers_unavailable` when a read fails; a model that does not answer gives
 * `linked: 0` and is logged. Idempotent: only offers still without an
 * ingredient are touched.
 */
export async function matchOffersWithAi(): Promise<Result<MatchOffersWithAiData>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    const stores = await listStores();
    const offers = (await Promise.all(stores.map((store) => getActiveOffers(store.id)))).flat();
    // An offer the AI has been asked about (linked or answered "none") is never asked again (ai_matched_at).
    const unlinked = offers.filter((offer) => offer.ingredientId === null && !offer.aiMatchedAt);
    if (unlinked.length === 0) return ok({ linked: 0, open: 0 });
    const [ingredients, rows] = await Promise.all([listIngredients(ingredientReadLimit), listRecipeRows()]);
    const used = new Set(rows.flatMap((row) => row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []))));
    const request = buildOfferMatchRequest(unlinked, ingredients, used);
    if (!request) return ok({ linked: 0, open: unlinked.length });
    // Claim the offers before asking, in one conditional update, so two visits at once ask once. Offers
    // another visit claimed meanwhile are left to it; the request is built again from the ones claimed.
    const claimed = await claimOffersForAi(request.offerGroups.flat());
    if (!claimed || claimed.length === 0) return ok({ linked: 0, open: unlinked.length });
    const claimedIds = new Set(claimed);
    const mine = buildOfferMatchRequest(
      unlinked.filter((offer) => claimedIds.has(offer.id)),
      ingredients,
      used,
    );
    if (!mine) return ok({ linked: 0, open: unlinked.length });

    const signal = AbortSignal.timeout(matchTimeoutMs + 5_000);
    let answered: Awaited<ReturnType<AiService["matchOffers"]>>;
    try {
      answered = await (await getAiServiceForUser()).matchOffers(mine.input, signal, { deadline: Date.now() + matchTimeoutMs });
    } catch {
      answered = fail("ai_unavailable");
    }
    if (!answered.ok) {
      // Nothing was learnt: give the claim back so the next visit asks again.
      await releaseOffersForAi(claimed);
      console.error("offers_match_failed", { reason: answered.error.code });
      return ok({ linked: 0, open: unlinked.length });
    }
    const links = offerLinks(mine, answered.data.pairs);
    const summaries = links.length > 0 ? await getIngredientSummaries(links.map((link) => link.ingredientId)) : {};
    let linked = 0;
    for (const link of links) {
      const summary = summaries[link.ingredientId];
      if (!summary) continue;
      const done = await linkOffersToIngredient({ offerIds: link.offerIds, ingredientId: link.ingredientId, section: summary.section });
      if (done.ok) linked += done.data;
    }
    if (linked > 0) revalidateFor("store_offer");
    console.info("offers_matched_by_ai", { asked: mine.input.offers.length, linked });
    return ok({ linked, open: unlinked.length - linked });
  } catch (error) {
    if (
      !(
        error instanceof SettingsDataError ||
        error instanceof OffersDataError ||
        error instanceof RecipeDataError ||
        error instanceof CatalogDataError
      )
    )
      throw error;
    console.error("offers_match_unavailable", { reason: error.name });
    return fail("offers_unavailable");
  }
}
