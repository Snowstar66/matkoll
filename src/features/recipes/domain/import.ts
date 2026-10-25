import { z } from "zod";
import { importInvalidMessage, type AppError } from "@/lib/errors";
import { recipeDraftSchema } from "./recipe-draft";

// What the import Route Handler (/api/ai/import) takes and answers (AD-9, AD-13).

/**
 * Most characters of recipe text, the same as the AI port's limit
 * (inputLimits.maxTextChars in src/server/ai/service.ts).
 */
export const maxImportTextChars = 12_000;

/** The request body. Link (Story 1.8) and photo (Story 1.9) are added here. */
export const importRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(maxImportTextChars) }),
]);
export type ImportRequest = z.infer<typeof importRequestSchema>;

/**
 * The answer: the draft, and the names of the catalog ingredients its lines
 * are matched to (by id), so the preview can show them. Nothing is saved.
 */
export const recipeImportSchema = z.object({
  draft: recipeDraftSchema,
  ingredientNames: z.record(z.string(), z.string()),
});
export type RecipeImport = z.infer<typeof recipeImportSchema>;

/** The text the import shows for an error; `ai_invalid` has its own import text (importInvalidMessage). */
export function importErrorMessage(error: Pick<AppError, "code" | "message">): string {
  return error.code === "ai_invalid" ? importInvalidMessage : error.message;
}

/** Shown when the pasted text reaches maxImportTextChars. */
export const importTextTooLongMessage =
  "Texten får vara högst 12 000 tecken. Ta bort det som inte hör till receptet, till exempel kommentarer.";
