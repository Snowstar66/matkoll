import { z } from "zod";
import { fetchErrorMessage, importInvalidMessage, type AppError } from "@/lib/errors";
import { draftLimits, recipeDraftSchema } from "./recipe-draft";

// What the import Route Handler (/api/ai/import) takes and answers (AD-9, AD-13).

/**
 * Most characters of recipe text, the same as the AI port's limit
 * (inputLimits.maxTextChars in src/server/ai/service.ts). For a link, the
 * page's text and JSON-LD are cut to fit it together.
 */
export const maxImportTextChars = 12_000;

/** Longest link, the same as a saved recipe's source_url. */
export const maxImportUrlChars = draftLimits.urlChars;

/**
 * The request body: pasted text, or a link to a recipe page. The link is only
 * checked for length here; whether it is a usable https address on an approved
 * site is the fetch port's answer (fetch_invalid_url, fetch_domain_not_allowed).
 * Photo (Story 1.9) is added here.
 */
export const importRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(maxImportTextChars) }),
  z.object({ kind: z.literal("url"), url: z.string().trim().min(1).max(maxImportUrlChars) }),
]);
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportKind = ImportRequest["kind"];

/**
 * The answer: the draft, and the names of the catalog ingredients its lines
 * are matched to (by id), so the preview can show them. Nothing is saved.
 */
export const recipeImportSchema = z.object({
  draft: recipeDraftSchema,
  ingredientNames: z.record(z.string(), z.string()),
});
export type RecipeImport = z.infer<typeof recipeImportSchema>;

/** `import_no_recipe` for a link: the page, not the text, had no recipe. */
export const noRecipeOnPageMessage = "Det gick inte att hitta något recept på sidan.";

/**
 * The text the import shows for an error: `ai_invalid` has its own import
 * text (importInvalidMessage), a fetch error names the site when it can
 * ("ica.se är inte en godkänd receptsajt."), and a link without a recipe says
 * so about the page.
 */
export function importErrorMessage(error: Pick<AppError, "code" | "message" | "fields">, kind: ImportKind = "text"): string {
  if (error.code === "ai_invalid") return importInvalidMessage;
  if (error.code === "import_no_recipe" && kind === "url") return noRecipeOnPageMessage;
  return fetchErrorMessage(error);
}

/** Errors of a link import that "Klistra in text i stället" helps with (EXPERIENCE.md, State Patterns). */
export const pasteTextInsteadCodes: ReadonlySet<AppError["code"]> = new Set([
  "fetch_blocked",
  "fetch_timeout",
  "fetch_too_large",
  "import_no_recipe",
]);

/** Shown when "Klistra in länk" finds more than maxImportUrlChars in the clipboard. */
export const importLinkTooLongMessage =
  "Länken i urklippet är längre än 2 048 tecken och kan inte användas. Kopiera länken till receptet igen.";

/** Shown when the pasted text reaches maxImportTextChars. */
export const importTextTooLongMessage =
  "Texten får vara högst 12 000 tecken. Ta bort det som inte hör till receptet, till exempel kommentarer.";
