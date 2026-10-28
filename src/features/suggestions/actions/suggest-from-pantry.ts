import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import type { PantrySnapshot } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import { fromAiRecipe, recipeDraftSchema, type RecipeDraft } from "@/features/recipes";
import { fail, ok, type Result } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { getAiService, type AiRecipe } from "@/server/ai";
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

export type SuggestOptions = {
  signal: AbortSignal;
  /** When the whole job must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
  /**
   * Story 12.7: called with the result so far (as the job's result: every dish
   * that has come) each time a dish has passed the checks, so the client can
   * show it before the others are ready. Never fails.
   */
  report?: (partial: Json) => Promise<void>;
};

/**
 * The check before a job is made (Story 12.4): the place's pantry is read,
 * and an empty one is `suggest_empty_pantry` at once, so no job is queued
 * and the AI is not asked. Gives the id of the place the job is about
 * (`null` for a user without places), which the job keeps as its context.
 * `pantry_unavailable` when the pantry cannot be read. Never writes.
 */
export async function checkSuggestPantry(): Promise<Result<{ siteId: string | null }>> {
  const pantry = await readPantry();
  if (!pantry.ok) return pantry;
  if (pantry.data.snapshot.size === 0) return fail("suggest_empty_pantry");
  return ok({ siteId: pantry.data.siteId });
}

/**
 * Up to three dishes from what is at home on the selected place, each as a
 * RecipeDraft with `sourceKind: "ai"` and the names of its matched catalog
 * ingredients, and the id of the place they were suggested from. In
 * order: the user, the pantry (`pantry_unavailable`; empty is
 * `suggest_empty_pantry`, and the AI is not asked in either case), the
 * pantry's names (`catalog_unavailable`, also when none of them can be
 * found), then the AI port's stream (`validation`, `ai_unavailable`,
 * `ai_rejected`, `ai_invalid`). Story 12.7: each dish is handled when it
 * comes: one matchIngredients call for its lines, fromAiRecipe, and the
 * result so far is reported. A draft that does not pass recipeDraftSchema, or
 * uses fewer than two ingredients that are at home, is left out (logged as
 * `ai_invalid`); none left is `ai_invalid`. A catalog read that fails ends
 * the run with `catalog_unavailable` when no dish is kept; otherwise the
 * dishes kept are the result. A job that is stopped is `ai_unavailable`, and
 * nothing more is read. Only one job runs at a time for a user (the queue,
 * AD-28), so nothing here keeps a lock of its own.
 */
export async function suggestFromPantry(
  request: SuggestRequest,
  { signal, deadline, report }: SuggestOptions,
): Promise<Result<DishSuggestions>> {
  const user = await requireUser();
  if (!user.ok) return user;
  return suggest(request, signal, deadline, report);
}

async function suggest(
  request: SuggestRequest,
  signal: AbortSignal,
  deadline: number | undefined,
  report: SuggestOptions["report"],
): Promise<Result<DishSuggestions>> {
  const pantry = await readPantry();
  if (!pantry.ok) return pantry;
  const snapshot = pantry.data.snapshot;
  if (signal.aborted) return stopped();
  if (snapshot.size === 0) return fail("suggest_empty_pantry");

  const pantryNames = await fromCatalog(() => getIngredientNames([...snapshot.keys()]));
  if (!pantryNames.ok) return pantryNames;
  const { input, dropped } = toSuggestInput(snapshot, pantryNames.data, request.avoidTitles);
  if (input.pantry.length === 0) {
    // There is something at home, but none of it could be named: a catalog read gone wrong, worth another try.
    console.error("catalog_unavailable", { reason: "no_names" });
    return fail("catalog_unavailable");
  }
  if (dropped > 0) console.info("suggest_pantry_trimmed", { dropped });

  const siteId = pantry.data.siteId;
  const suggestions: DishSuggestions["suggestions"] = [];
  /** Why a dish could not be read from the catalog: the run ends with it when no dish was kept. */
  const catalog: { failure: Result<never> | null } = { failure: null };

  /** One dish that has come: matched against the catalog, checked, and reported with the ones before it. */
  const takeDish = async (recipe: AiRecipe, index: number): Promise<boolean> => {
    if (signal.aborted) return false;
    const lines = recipe.ingredients.map((line) => ({ text: line.originalText, hint: line.hint }));
    const matches = await fromCatalog(() => matchIngredients(lines));
    if (!matches.ok) {
      catalog.failure = matches;
      return false;
    }
    if (signal.aborted) return false;
    const draft = recipeDraftSchema.safeParse(fromAiRecipe(recipe, matches.data, { kind: "ai" }));
    if (!draft.success) {
      const issues = draft.error.issues.map(({ path, code }) => ({ path: path.map(String), code }));
      console.error("ai_invalid", { reason: "draft", index, issues });
      return false;
    }
    const count = new Set(linkedIds(draft.data).filter((id) => snapshot.has(id))).size;
    if (count < minPantryIngredients) {
      console.error("ai_invalid", { reason: "pantry", index, count });
      return false;
    }
    const ids = [...new Set(linkedIds(draft.data))];
    const names = ids.length > 0 ? await fromCatalog(() => getIngredientNames(ids)) : ok<Record<string, string>>({});
    if (!names.ok) {
      catalog.failure = names;
      return false;
    }
    if (signal.aborted) return false;
    suggestions.push({
      draft: draft.data,
      ingredientNames: Object.fromEntries(
        ids.flatMap((id) => (id in names.data ? [[id, names.data[id]] as const] : [])),
      ),
    });
    // The drafts are plain data; the job keeps them as JSON until Pontus saves one.
    await report?.(JSON.parse(JSON.stringify({ suggestions, siteId })) as Json);
    return true;
  };

  const streamed = await getAiService().suggestDishesStream(input, signal, {
    deadline: deadline === undefined ? undefined : deadline - postModelMarginMs,
    onDish: takeDish,
  });
  if (signal.aborted) return stopped();
  if (suggestions.length === 0 && catalog.failure) return catalog.failure;
  if (!streamed.ok && suggestions.length === 0) return streamed;
  if (suggestions.length === 0) return fail("ai_invalid");
  return ok({ siteId, suggestions });
}
