"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { noOfferIdeas, type OfferIdeasView } from "../domain/offer-idea-set";
import { claimOfferIdeas, isOfferIdeaError, loadOfferIdeas } from "./offer-idea-set";

// The Server Actions of the saved "Nya idéer med extrapris" (Pontus 2026-11-06). The model runs in after(),
// in the background of the action, so the caller never waits for it: the action answers `pending` at once and
// the card looks again (readOfferIdeas) until the set is ready. Only one run holds a set (claimSetIn), so two
// tabs, or a fetch and a first view, never start the model twice.

const startSchema = z.strictObject({ replace: z.boolean().optional() });

/** The pending view a claimed run is shown as. */
const pending: OfferIdeasView = { ...noOfferIdeas, hasOffers: true, state: "pending" };

/**
 * Starts the ideas for the household's offer week in the background and gives the view to show: `pending` when a run
 * was started, otherwise the set as it is (another run holds it, or it is ready). `replace` asks for another set
 * ("Andra idéer"). `unauthorized`, `validation`, `offers_none` or `offers_unavailable`.
 */
export async function startOfferIdeas(input: { replace?: boolean } = {}): Promise<Result<OfferIdeasView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const claimed = await claimOfferIdeas(parsed.data.replace === true);
  if (!claimed.ok) return claimed;
  if (claimed.data.run) {
    after(claimed.data.run);
    return ok(pending);
  }
  return readOfferIdeas();
}

/**
 * The trigger after a fetch of offers (composed in the route layer, AD-1: offers never imports suggestions): ideas for
 * the week the fetch saved, unless a set is ready or on its way already. Never throws; what it answers is for the caller to ignore.
 */
export async function prepareOfferIdeas(): Promise<Result<OfferIdeasView>> {
  return startOfferIdeas({});
}

/** The set as it is now: a light read for the card to look at while the ideas are prepared. `unauthorized` or `offers_unavailable`. */
export async function readOfferIdeas(): Promise<Result<OfferIdeasView>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    return ok(await loadOfferIdeas());
  } catch (error) {
    if (!isOfferIdeaError(error)) throw error;
    console.error("offers_unavailable", { reason: "detail" in error ? error.detail : "recipes" });
    return fail("offers_unavailable");
  }
}
