import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import type { PantrySnapshot } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import { fromAiRecipe, recipeDraftSchema, type RecipeDraft } from "@/features/recipes";
import { fail, ok, type Result } from "@/lib/errors";
import { getAiService } from "@/server/ai";
import { toSuggestInput } from "../domain/pantry-input";
import type { DishSuggestions, SuggestRequest } from "../domain/suggestions";

// The server side of AI-förslag (FR-23, AD-1, AD-2, AD-6, AD-9, AD-10). Not a
// Server Action: the Route Handler /api/ai/suggest calls it with the
// request's signal, so "Avbryt" in the client stops the model. It reads the
// pantry from the session (the client never sends it) and never writes: the
// drafts live in the client until Pontus saves one with saveRecipe, which is
// also when new catalog ingredients are created. The model gets names and
// amounts only, never ids or recipes, and the catalog links come from
// matchIngredients alone. Only codes, counts and schema paths are logged,
// never the pantry or the answer.

/** Time kept for the reads after the model, so the whole request fits its deadline. */
export const postModelMarginMs = 5_000;

/** A suggestion must use at least this many ingredients that are at home. */
export const minPantryIngredients = 2;

/**
 * The run on its way per user, in this server process: a new request stops
 * the one before, so one person never keeps the local model busy twice
 * (a second tab, a double tap that got past the client).
 */
const runs = new Map<string, AbortController>();

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

/** The request went away ("Avbryt", a newer run): nobody reads the answer, so nothing more is done. */
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
  /** When the whole request must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
};

/**
 * Three dishes from what is at home on the selected place, each as a
 * RecipeDraft with `sourceKind: "ai"` and the names of its matched catalog
 * ingredients, and the id of the place they were suggested from. In
 * order: the user (a run of theirs still on its way is stopped), the pantry
 * (`pantry_unavailable`; empty is `suggest_empty_pantry`, and the AI is not
 * asked in either case), the pantry's names (`catalog_unavailable`, also
 * when none of them can be found), the AI port (`validation`,
 * `ai_unavailable`, `ai_rejected`, `ai_invalid`), one matchIngredients call
 * for every line of the three, and fromAiRecipe. A draft that does not pass
 * recipeDraftSchema, or uses fewer than two ingredients that are at home, is
 * left out (logged as `ai_invalid`); none left is `ai_invalid`. A request
 * that goes away is `ai_unavailable`, and nothing more is read.
 */
export async function suggestFromPantry(
  request: SuggestRequest,
  { signal, deadline }: SuggestOptions,
): Promise<Result<DishSuggestions>> {
  const user = await requireUser();
  if (!user.ok) return user;

  runs.get(user.data.id)?.abort();
  const own = new AbortController();
  runs.set(user.data.id, own);
  try {
    return await suggest(request, AbortSignal.any([signal, own.signal]), deadline);
  } finally {
    if (runs.get(user.data.id) === own) runs.delete(user.data.id);
  }
}

async function suggest(
  request: SuggestRequest,
  signal: AbortSignal,
  deadline: number | undefined,
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
    if (count < minPantryIngredients) {
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
    suggestions: drafts.map((draft) => ({
      draft,
      ingredientNames: Object.fromEntries(
        linkedIds(draft).flatMap((id) => (id in names.data ? [[id, names.data[id]] as const] : [])),
      ),
    })),
  });
}
