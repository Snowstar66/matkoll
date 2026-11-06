import "server-only";
import { randomUUID } from "node:crypto";
import { getActiveOffers, OffersDataError } from "@/features/offers/server";
import { listRecipeTitles, RecipeDataError } from "@/features/recipes/server";
import { listStores, SettingsDataError } from "@/features/settings/server";
import { toAvoidTitles } from "../domain/suggestions";
import { createClient } from "@/lib/supabase/server";
import { fail, ok, type Result } from "@/lib/errors";
import { claimSetIn, failSetIn, finishSetIn, loadSetIn, OfferIdeaSetError } from "../data/offer-idea-set";
import { maxOfferIdeas, noOfferIdeas, parseSavedIdeas, toOfferIdeasView, type OfferIdeasView, type SavedIdea } from "../domain/offer-idea-set";
import { suggestFromPantry } from "./suggest-from-pantry";

// The saved "Nya idéer med extrapris" (Pontus 2026-11-06). The server side: what the card and Matsedel
// read (loadOfferIdeas), and the background run (runOfferIdeas) that the Server Action startOfferIdeas
// starts with after(). The run is suggestFromPantry in the mode offers, as the AI job of Story 9.5, with
// its own deadline; its answer is kept in offer_idea_set, never anywhere else. Model input stays names only.

/** How long the model may take before the set is marked failed. */
const runTimeoutMs = 100_000;

/** What these reads and writes throw that is expected (logged by the caller, codes only). */
export function isOfferIdeaError(error: unknown): error is OfferIdeaSetError | OffersDataError | SettingsDataError | RecipeDataError {
  return error instanceof OfferIdeaSetError || error instanceof OffersDataError || error instanceof SettingsDataError || error instanceof RecipeDataError;
}

/** The week of the user's offers (the latest among all stores), or `null` without offers. Throws what the reads throw. */
export async function offerWeekOfUser(): Promise<string | null> {
  const stores = await listStores();
  const offers = (await Promise.all(stores.map((store) => getActiveOffers(store.id)))).flat();
  return offers.map((offer) => offer.weekStart).sort().at(-1) ?? null;
}

/**
 * The saved set for the household's offer week, as the card shows it: ideas already saved as a recipe leave it.
 * `noOfferIdeas` (nothing to show) without offers. Throws OfferIdeaSetError, OffersDataError, SettingsDataError or RecipeDataError.
 */
export async function loadOfferIdeas(): Promise<OfferIdeasView> {
  const week = await offerWeekOfUser();
  if (week === null) return noOfferIdeas;
  const [row, recipes] = await Promise.all([loadSetIn(await createClient(), week), listRecipeTitles()]);
  return toOfferIdeasView(row, recipes.map((recipe) => recipe.title), new Date());
}

/** The run's answer as saved ideas: at most three, each with the id it is saved under. */
function toSavedIdeas(suggestions: readonly Omit<SavedIdea, "recipeId">[]): SavedIdea[] {
  return suggestions.slice(0, maxOfferIdeas).map((idea) => ({ ...idea, recipeId: randomUUID() }));
}

/**
 * Starts the run for the household's offer week, in the background of the calling Server Action (the caller
 * schedules `run` with after()): claims the set, and gives the run to do, or `null` when another run holds
 * the set or it is ready already (and `replace` is not asked). `offers_none` without offers. Never runs the model itself.
 */
export async function claimOfferIdeas(replace: boolean): Promise<Result<{ run: (() => Promise<void>) | null }>> {
  let week: string | null;
  try {
    week = await offerWeekOfUser();
  } catch (error) {
    if (!isOfferIdeaError(error)) throw error;
    console.error("offers_unavailable", { reason: error instanceof OfferIdeaSetError || error instanceof OffersDataError || error instanceof SettingsDataError ? error.detail : "recipes" });
    return fail("offers_unavailable");
  }
  if (week === null) return fail("offers_none");
  const db = await createClient();
  let token: string | null;
  let avoid: string[] = [];
  /** The set that "Andra idéer" replaces, given back if no other set can be made, so the user is never left without ideas. */
  let previous: { intro: string; ideas: SavedIdea[] } | null = null;
  try {
    if (replace) {
      // The ideas of the set that is replaced are not asked for again.
      const before = await loadSetIn(db, week);
      const ideas = parseSavedIdeas(before?.ideas);
      avoid = toAvoidTitles(ideas.map((idea) => idea.draft.title));
      if (before?.status === "ready" && ideas.length > 0) previous = { intro: before.intro, ideas };
    }
    token = await claimSetIn(db, week, replace, new Date());
  } catch (error) {
    if (!(error instanceof OfferIdeaSetError)) throw error;
    console.error("offers_unavailable", { reason: error.detail });
    return fail("offers_unavailable");
  }
  if (token === null) return ok({ run: null });
  const held = token;
  return ok({
    run: async () => {
      try {
        const answered = await suggestFromPantry(
          { mode: "offers", avoidTitles: avoid },
          { signal: AbortSignal.timeout(runTimeoutMs), deadline: Date.now() + runTimeoutMs },
        );
        if (answered.ok) {
          const ideas = toSavedIdeas(answered.data.suggestions);
          await finishSetIn(db, week, held, { intro: answered.data.intro, ideas });
          console.info("offer_ideas_ready", { ideas: ideas.length });
        } else {
          console.error("offer_ideas_failed", { reason: answered.error.code });
          if (previous) await finishSetIn(db, week, held, previous);
          else await failSetIn(db, week, held, answered.error.code);
        }
      } catch (error) {
        console.error("offer_ideas_failed", { reason: error instanceof OfferIdeaSetError ? error.detail : "exception" });
        try {
          if (previous) await finishSetIn(db, week, held, previous);
          else await failSetIn(db, week, held, "ai_unavailable");
        } catch {
          // The set stays pending until its claim goes stale, and the next view takes it over.
        }
      }
    },
  });
}
