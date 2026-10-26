import { z } from "zod";
import { recipeImportSchema } from "@/features/recipes";
import { errorMessages, type AppError } from "@/lib/errors";
import { cleanModelText, cutCodePoints, hasControlChars, normalizeTitle, suggestInputLimits } from "@/lib/suggest-input";

// What /api/ai/suggest takes and answers (FR-23, AD-9, AD-13). The pantry is
// read on the server from the session, so the client only sends the titles it
// already shows, for "Föreslå andra rätter".

/**
 * A title to avoid: no control characters, format characters removed,
 * whitespace collapsed and trimmed (cleanModelText), 1–200 characters.
 */
const avoidTitleSchema = z
  .string()
  .refine((title) => !hasControlChars(title), "A title has no control characters")
  .transform(cleanModelText)
  .pipe(z.string().min(1).max(suggestInputLimits.maxTitleChars));

/** Titles to avoid: the suggestions shown and saved, at most three. */
export const suggestRequestSchema = z.strictObject({
  avoidTitles: z.array(avoidTitleSchema).max(suggestInputLimits.maxAvoidTitles).default([]),
});
export type SuggestRequest = z.infer<typeof suggestRequestSchema>;

/**
 * The answer: one to three drafts with `sourceKind: "ai"`, each with the names
 * of the catalog ingredients its lines are matched to (as for an import).
 * Fewer than three when a draft did not pass recipeDraftSchema. Nothing is saved.
 */
export const dishSuggestionsSchema = z.object({
  suggestions: z.array(recipeImportSchema).min(1).max(3),
});
export type DishSuggestions = z.infer<typeof dishSuggestionsSchema>;
export type DishSuggestion = DishSuggestions["suggestions"][number];

/**
 * The titles the client sends to avoid, from the most wanted: cleaned like
 * the server cleans them, cut to its limit, each once and at most three.
 */
export function toAvoidTitles(titles: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const title of titles) {
    const clean = cutCodePoints(cleanModelText(title), suggestInputLimits.maxTitleChars).trim();
    const key = normalizeTitle(clean);
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    kept.push(clean);
    if (kept.length === suggestInputLimits.maxAvoidTitles) break;
  }
  return kept;
}

/**
 * `ai_rejected` for suggestions: the shared text asks for a shorter text,
 * which Pontus cannot give here.
 */
export const suggestRejectedMessage = "AI-tjänsten tog inte emot förfrågan. Försök igen senare.";

/** `validation` for suggestions: the request was refused, which Pontus cannot correct in a form. */
export const suggestValidationMessage = "Det gick inte att be om förslag. Försök igen.";

/**
 * The text AI-förslag shows for an error: its own for `ai_rejected` and `validation`, the
 * empty pantry's ("Lagret är tomt. …", shown with "Öppna Hemma"), otherwise
 * the error's own.
 */
export function suggestErrorMessage(error: Pick<AppError, "code" | "message">): string {
  if (error.code === "ai_rejected") return suggestRejectedMessage;
  if (error.code === "validation") return suggestValidationMessage;
  if (error.code === "suggest_empty_pantry") return errorMessages.suggest_empty_pantry;
  return error.message;
}

/**
 * The errors "Försök igen" can help with: the model was away, refused or
 * answered badly, a read failed, or the request was refused (`validation`).
 */
export const suggestRetryCodes: ReadonlySet<AppError["code"]> = new Set([
  "validation",
  "ai_unavailable",
  "ai_invalid",
  "ai_rejected",
  "pantry_unavailable",
  "catalog_unavailable",
]);
