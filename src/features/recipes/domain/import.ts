import { z } from "zod";
import { fetchErrorMessage, importInvalidMessage, type AppError } from "@/lib/errors";
import type { ImageMediaType } from "@/lib/images";
import { draftLimits, recipeDraftSchema } from "./recipe-draft";

// What the import Route Handlers (/api/ai/import and /api/ai/import/photo)
// take and answer (AD-9, AD-13).

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
 * A photo is not JSON: /api/ai/import/photo takes it as multipart/form-data
 * and builds a PhotoImport.
 */
export const importRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(maxImportTextChars) }),
  z.object({ kind: z.literal("url"), url: z.string().trim().min(1).max(maxImportUrlChars) }),
]);
export type ImportRequest = z.infer<typeof importRequestSchema>;

/**
 * A photo of a cookbook page (AD-15), as the photo Route Handler hands it to
 * importRecipe: the bytes, already checked for size, and the type read from
 * them. Only in memory for the request; never stored.
 */
export type PhotoImport = { kind: "photo"; image: { data: Uint8Array; mediaType: ImageMediaType } };

/** Everything importRecipe takes: pasted text, a link or a photo. */
export type ImportInput = ImportRequest | PhotoImport;
export type ImportKind = ImportInput["kind"];

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

/** `ai_invalid` or `import_no_recipe` for a photo: the model could not read a recipe in it. */
export const photoUnreadableMessage = "Det gick inte att tolka bilden. Ta en ny bild, välj en annan eller klistra in texten.";

/** `ai_rejected` for a photo. */
export const photoRejectedMessage = "AI-tjänsten tog inte emot bilden. Prova en tydligare bild eller försök igen senare.";

/**
 * True for a photo the model could not read a recipe from: an invalid answer
 * and no recipe look the same for a blurry photo. The ways forward are to try
 * again, take another photo or paste the text.
 */
export function isUnreadablePhoto(code: AppError["code"], kind: ImportKind): boolean {
  return kind === "photo" && (code === "ai_invalid" || code === "import_no_recipe");
}

/**
 * The text the import shows for an error: `ai_invalid` has its own import
 * text (importInvalidMessage), a fetch error names the site when it can
 * ("ica.se är inte en godkänd receptsajt."), a link without a recipe says
 * so about the page, and a photo has its own texts about the image.
 */
export function importErrorMessage(error: Pick<AppError, "code" | "message" | "fields">, kind: ImportKind = "text"): string {
  if (isUnreadablePhoto(error.code, kind)) return photoUnreadableMessage;
  if (error.code === "ai_rejected" && kind === "photo") return photoRejectedMessage;
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

/** True when "Klistra in text i stället" is the way forward for this error of a link or photo import. */
export function offersPasteTextInstead(code: AppError["code"], kind: ImportKind): boolean {
  if (kind === "url") return pasteTextInsteadCodes.has(code);
  return isUnreadablePhoto(code, kind);
}

/** Shown when "Klistra in länk" finds more than maxImportUrlChars in the clipboard. */
export const importLinkTooLongMessage =
  "Länken i urklippet är längre än 2 048 tecken och kan inte användas. Kopiera länken till receptet igen.";

/** Shown when the pasted text reaches maxImportTextChars. */
export const importTextTooLongMessage =
  "Texten får vara högst 12 000 tecken. Ta bort det som inte hör till receptet, till exempel kommentarer.";
