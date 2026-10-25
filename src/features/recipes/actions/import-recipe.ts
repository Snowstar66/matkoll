import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { getAiService } from "@/server/ai";
import { fromAiRecipe } from "../domain/from-ai-recipe";
import type { RecipeImport } from "../domain/import";
import { recipeDraftSchema } from "../domain/recipe-draft";

// The server side of importing pasted text (AD-2, AD-9, AD-10). Not a Server
// Action: the Route Handler /api/ai/import calls it with the request's signal,
// so "Avbryt" in the client stops the model call. It never writes: the draft
// lives in the client until Pontus saves it (Story 1.7).

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
 * Parses the text with the AI port, matches each line against the catalog and
 * maps the answer with fromAiRecipe. Fails with `unauthorized`, `validation`,
 * the AI port's codes (`import_no_recipe`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`) or `catalog_unavailable`. A draft that does not pass
 * recipeDraftSchema is `ai_invalid`.
 */
export async function importRecipe(
  input: { text: string },
  { signal }: { signal: AbortSignal },
): Promise<Result<RecipeImport>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const parsed = await getAiService().parseRecipe({ text: input.text }, signal);
  if (!parsed.ok) return parsed;
  const recipe = parsed.data;

  const matches = await fromCatalog(() =>
    matchIngredients(recipe.ingredients.map((line) => ({ text: line.originalText, hint: line.hint }))),
  );
  if (!matches.ok) return matches;

  const draft = recipeDraftSchema.safeParse(fromAiRecipe(recipe, matches.data, { kind: "text" }));
  if (!draft.success) {
    console.error("ai_invalid", { reason: "draft" });
    return fail("ai_invalid");
  }

  const matchedIds = draft.data.lines.flatMap(({ ingredient }) =>
    ingredient.kind === "match" || ingredient.kind === "chosen" ? [ingredient.ingredientId] : [],
  );
  const names = matchedIds.length > 0 ? await fromCatalog(() => getIngredientNames(matchedIds)) : ok<Record<string, string>>({});
  if (!names.ok) return names;
  return ok({ draft: draft.data, ingredientNames: names.data });
}
