import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import { getActiveRecipeDomains, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { getAiService, type ParseRecipeInput } from "@/server/ai";
import { checkLinkSyntax, extractRecipePage, fetchRecipePage } from "@/server/fetch";
import { fromAiRecipe, type RecipeSource } from "../domain/from-ai-recipe";
import { maxImportTextChars, type ImportRequest, type RecipeImport } from "../domain/import";
import { recipeDraftSchema } from "../domain/recipe-draft";

// The server side of importing pasted text or a link (AD-2, AD-9, AD-10,
// AD-11). Not a Server Action: the Route Handler /api/ai/import calls it with
// the request's signal, so "Avbryt" in the client stops the fetch and the
// model call. It never writes: the draft lives in the client until Pontus
// saves it (Story 1.7).

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

/** The approved recipe sites; a failed query becomes `settings_unavailable`. */
async function approvedDomains(): Promise<Result<string[]>> {
  try {
    return ok(await getActiveRecipeDomains());
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_unavailable", { reason: error.detail });
    return fail("settings_unavailable");
  }
}

/**
 * Fetches the page with the fetch port, only from the user's approved sites
 * (AD-11), and reads its Recipe JSON-LD and readable text as input to
 * parseRecipe, cut to the AI port's limit. The source is the page's address
 * after redirects, with the JSON-LD's image.
 */
async function readRecipePage(
  url: string,
  signal: AbortSignal,
): Promise<Result<{ input: ParseRecipeInput; source: RecipeSource }>> {
  // A link that can never be fetched is refused before the sites are read.
  if (!checkLinkSyntax(url)) return fail("fetch_invalid_url");
  const domains = await approvedDomains();
  if (!domains.ok) return domains;
  const page = await fetchRecipePage(url, { allowedDomains: domains.data, signal });
  if (!page.ok) return page;
  const { text, jsonLd, imageUrl } = extractRecipePage(page.data.html, maxImportTextChars);
  if (!text && !jsonLd) return fail("import_no_recipe");
  return ok({
    input: { text: text || undefined, jsonLd: jsonLd ?? undefined },
    source: { kind: "url", url: page.data.url, imageUrl },
  });
}

/**
 * Parses pasted text, or a recipe page from a link, with the AI port, matches
 * each line against the catalog and maps the answer with fromAiRecipe. Fails
 * with `unauthorized`, `validation`, for a link `settings_unavailable` and the
 * fetch port's codes (`fetch_invalid_url`, `fetch_domain_not_allowed`,
 * `fetch_blocked`, `fetch_timeout`, `fetch_too_large`), the AI port's codes
 * (`import_no_recipe`, `ai_unavailable`, `ai_rejected`, `ai_invalid`) or
 * `catalog_unavailable`. A draft that does not pass recipeDraftSchema is
 * `ai_invalid`.
 */
export async function importRecipe(
  input: ImportRequest,
  { signal }: { signal: AbortSignal },
): Promise<Result<RecipeImport>> {
  const user = await requireUser();
  if (!user.ok) return user;

  let parseInput: ParseRecipeInput;
  let source: RecipeSource;
  if (input.kind === "url") {
    const page = await readRecipePage(input.url, signal);
    if (!page.ok) return page;
    ({ input: parseInput, source } = page.data);
  } else {
    parseInput = { text: input.text };
    source = { kind: "text" };
  }

  const parsed = await getAiService().parseRecipe(parseInput, signal);
  if (!parsed.ok) return parsed;
  const recipe = parsed.data;

  const matches = await fromCatalog(() =>
    matchIngredients(recipe.ingredients.map((line) => ({ text: line.originalText, hint: line.hint }))),
  );
  if (!matches.ok) return matches;

  const draft = recipeDraftSchema.safeParse(fromAiRecipe(recipe, matches.data, source));
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
