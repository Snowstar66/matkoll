import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import type { PantrySnapshot } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import { getActiveOffers, OffersDataError } from "@/features/offers/server";
import type { StoreOffer } from "@/features/offers";
import { getSelectedStore, listStores, SettingsDataError } from "@/features/settings/server";
import { fromAiRecipe, recipeDraftSchema, type RecipeDraft } from "@/features/recipes";
import { fail, ok, type Result } from "@/lib/errors";
import { getAiService } from "@/server/ai";
import { offersUsed, toOfferNames } from "../domain/offer-input";
import { toSuggestInput } from "../domain/pantry-input";
import type { DishSuggestions, SuggestRequest } from "../domain/suggestions";

// The server side of AI-förslag (FR-23, AD-1, AD-2, AD-6, AD-9, AD-10, AD-28).
// Not a Server Action: POST /api/ai/jobs runs it as the work of an AI job
// (Story 12.4), with the job's signal, so "Avbryt" stops the model, and the
// job's deadline. Its result is the job's result. It reads the pantry from
// the session (the client never sends it) and never writes: the drafts live in
// the job's result until Pontus saves one with saveRecipe, which is also when
// new catalog ingredients are created. The model gets names and
// amounts only, never ids or recipes, and the catalog links come from
// matchIngredients alone. Only codes, counts and schema paths are logged,
// never the pantry or the answer.

/** Time kept for the reads after the model, so the whole request fits its deadline. */
export const postModelMarginMs = 5_000;

/** A suggestion must use at least this many ingredients that are at home. */
export const minPantryIngredients = 2;

/** Runs a catalog read; a failed query becomes `catalog_unavailable`, anything else is a bug and is thrown. */
async function fromCatalog<T>(read: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await read());
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("catalog_unavailable", { reason: error.code });
    return fail("catalog_unavailable");
  }
}

/**
 * The selected place's pantry and the place's id, read as the library reads
 * them for its status (pantry.getPantryForStatus, AD-24); a place or pantry
 * that cannot be read (logged there) becomes `pantry_unavailable`.
 */
async function readPantry(): Promise<Result<{ snapshot: PantrySnapshot; siteId: string | null }>> {
  const { site, snapshot } = await getPantryForStatus();
  return snapshot ? ok({ snapshot, siteId: site?.id ?? null }) : fail("pantry_unavailable");
}

/** The job was stopped ("Avbryt", a newer photo): nobody reads the answer, so nothing more is done. */
function stopped() {
  console.info("suggest_aborted");
  return fail("ai_unavailable");
}

/** The catalog ids a draft's lines are linked to. */
function linkedIds(draft: RecipeDraft): string[] {
  return draft.lines.flatMap(({ ingredient }) =>
    ingredient.kind === "match" || ingredient.kind === "chosen" ? [ingredient.ingredientId] : [],
  );
}

/**
 * The active offers of the store `storeId` (Story 9.13), else the selected store's (Story 9.5), for the dishes built around
 * them. `offers_store_missing` without a store, `offers_none` without offers
 * and `offers_unavailable` when the store or the offers cannot be read
 * (logged, codes only).
 */
async function readOffers(storeId?: string): Promise<Result<StoreOffer[]>> {
  try {
    // Story 9.13: a given store (one of the user's own), else the selected one.
    const store = storeId ? ((await listStores()).find((candidate) => candidate.id === storeId) ?? null) : await getSelectedStore();
    if (!store) return fail("offers_store_missing");
    const offers = await getActiveOffers(store.id);
    return offers.length > 0 ? ok(offers) : fail("offers_none");
  } catch (error) {
    if (!(error instanceof SettingsDataError || error instanceof OffersDataError)) throw error;
    console.error("offers_unavailable", { reason: error.detail });
    return fail("offers_unavailable");
  }
}

/** True for a line linked to a catalog ingredient that is in the pantry. */
function isLinkedAtHome(ingredient: RecipeDraft["lines"][number]["ingredient"], snapshot: PantrySnapshot): boolean {
  return (ingredient.kind === "match" || ingredient.kind === "chosen") && snapshot.has(ingredient.ingredientId);
}

export type SuggestMode = SuggestRequest["mode"];

/** What the job is asked: the mode is "pantry" when left out. */
export type SuggestJobRequest = Omit<SuggestRequest, "mode"> & { mode?: SuggestMode };

export type SuggestOptions = {
  signal: AbortSignal;
  /** When the whole job must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
};

/**
 * The check before a job is made (Story 12.4): the place's pantry is read,
 * and an empty one is `suggest_empty_pantry` at once, so no job is queued
 * and the AI is not asked. Gives the id of the place the job is about
 * (`null` for a user without places), which the job keeps as its context.
 * `pantry_unavailable` when the pantry cannot be read. Never writes.
 */
export async function checkSuggestPantry(mode: SuggestMode = "pantry", storeId?: string): Promise<Result<{ siteId: string | null }>> {
  const pantry = await readPantry();
  if (!pantry.ok) return pantry;
  if (mode === "offers") {
    // Around offers an empty pantry is fine; without offers there is nothing to build on.
    const offers = await readOffers(storeId);
    return offers.ok ? ok({ siteId: pantry.data.siteId }) : offers;
  }
  if (pantry.data.snapshot.size === 0) return fail("suggest_empty_pantry");
  return ok({ siteId: pantry.data.siteId });
}

/**
 * Three dishes from what is at home on the selected place, each as a
 * RecipeDraft with `sourceKind: "ai"` and the names of its matched catalog
 * ingredients, and the id of the place they were suggested from. In
 * order: the user, the pantry (`pantry_unavailable`; empty is
 * `suggest_empty_pantry`, and the AI is not asked in either case), the
 * pantry's names (`catalog_unavailable`, also when none of them can be
 * found), the AI port (`validation`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`), one matchIngredients call for every line of the three, and
 * fromAiRecipe. A draft that does not pass recipeDraftSchema, or uses fewer
 * than two ingredients that are at home, is left out (logged as
 * `ai_invalid`); none left is `ai_invalid`. A job that is stopped is
 * `ai_unavailable`, and nothing more is read. Only one job runs at a time
 * for a user (the queue, AD-28), so nothing here keeps a lock of its own.
 */
export async function suggestFromPantry(
  request: SuggestJobRequest,
  { signal, deadline }: SuggestOptions,
): Promise<Result<DishSuggestions>> {
  const user = await requireUser();
  if (!user.ok) return user;
  return suggest(request, signal, deadline);
}

async function suggest(
  request: SuggestJobRequest,
  signal: AbortSignal,
  deadline: number | undefined,
): Promise<Result<DishSuggestions>> {
  const pantry = await readPantry();
  if (!pantry.ok) return pantry;
  const snapshot = pantry.data.snapshot;
  if (signal.aborted) return stopped();
  const byOffers = request.mode === "offers";
  if (snapshot.size === 0 && !byOffers) return fail("suggest_empty_pantry");

  // Story 9.5: the offers are read here, in the job, and only their names go to the model.
  let offers: StoreOffer[] = [];
  if (byOffers) {
    const read = await readOffers(request.storeId);
    if (!read.ok) return read;
    offers = read.data;
  }

  const pantryNames = await fromCatalog(() => getIngredientNames([...snapshot.keys()]));
  if (!pantryNames.ok) return pantryNames;
  const { input, dropped } = toSuggestInput(snapshot, pantryNames.data, request.avoidTitles);
  if (byOffers) {
    input.offers = toOfferNames(offers);
    if (input.offers.length === 0) return fail("offers_none");
  }
  if (input.pantry.length === 0 && snapshot.size > 0) {
    // There is something at home, but none of it could be named: a catalog read gone wrong, worth another try.
    console.error("catalog_unavailable", { reason: "no_names" });
    return fail("catalog_unavailable");
  }
  if (dropped > 0) console.info("suggest_pantry_trimmed", { dropped });

  const suggested = await getAiService().suggestDishes(input, signal, {
    deadline: deadline === undefined ? undefined : deadline - postModelMarginMs,
  });
  if (!suggested.ok) return suggested;
  if (signal.aborted) return stopped();
  const recipes = suggested.data;

  const lines = recipes.flatMap((recipe) => recipe.ingredients.map((line) => ({ text: line.originalText, hint: line.hint })));
  const matches = await fromCatalog(() => matchIngredients(lines));
  if (!matches.ok) return matches;

  const drafts: RecipeDraft[] = [];
  let start = 0;
  recipes.forEach((recipe, index) => {
    const lineMatches = matches.data.slice(start, start + recipe.ingredients.length);
    start += recipe.ingredients.length;
    const draft = recipeDraftSchema.safeParse(fromAiRecipe(recipe, lineMatches, { kind: "ai" }));
    if (!draft.success) {
      const issues = draft.error.issues.map(({ path, code }) => ({ path: path.map(String), code }));
      console.error("ai_invalid", { reason: "draft", index, issues });
      return;
    }
    const count = new Set(linkedIds(draft.data).filter((id) => snapshot.has(id))).size;
    if (!byOffers && count < minPantryIngredients) {
      console.error("ai_invalid", { reason: "pantry", index, count });
      return;
    }
    drafts.push(draft.data);
  });
  if (drafts.length === 0) return fail("ai_invalid");

  if (signal.aborted) return stopped();
  const ids = [...new Set(drafts.flatMap(linkedIds))];
  const names = ids.length > 0 ? await fromCatalog(() => getIngredientNames(ids)) : ok<Record<string, string>>({});
  if (!names.ok) return names;
  return ok({
    siteId: pantry.data.siteId,
    mode: request.mode ?? "pantry",
    suggestions: drafts.map((draft) => {
      const linked = linkedIds(draft);
      const ingredientNames = Object.fromEntries(
        linked.flatMap((id) => (id in names.data ? [[id, names.data[id]] as const] : [])),
      );
      if (!byOffers) return { draft, ingredientNames, onOffer: [], atHome: null };
      const lineNames = draft.lines.map((line) => line.hint?.name ?? line.originalText);
      return {
        draft,
        ingredientNames,
        onOffer: offersUsed(offers, new Set(linked), [...lineNames, ...Object.values(ingredientNames)]),
        // "X av Y hemma": the lines linked to something in the pantry, of all lines.
        atHome: {
          have: draft.lines.filter(({ ingredient }) => isLinkedAtHome(ingredient, snapshot)).length,
          total: draft.lines.length,
        },
      };
    }),
  });
}
