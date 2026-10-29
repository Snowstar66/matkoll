import { z } from "zod";
import { recipeImportSchema } from "@/features/recipes";
import { errorMessages, type AppError } from "@/lib/errors";
import { cleanModelText, cutCodePoints, hasControlChars, normalizeTitle, suggestInputLimits } from "@/lib/suggest-input";

// What POST /api/ai/jobs takes for AI-förslag, and the result of the job (FR-23,
// AD-9, AD-13, AD-28). The pantry is read on the server from the session, so the
// client only sends the titles it already shows, for "Föreslå andra rätter".

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
  /** `offers`: dishes built around this week's offers (Story 9.5); the server reads the offers, never the client sends them. */
  mode: z.enum(["pantry", "offers"]).default("pantry"),
  /** Story 9.13: the store whose offers `offers` mode builds on; left out, the selected store (Story 9.14: the sheet sends it with two or more stores). */
  storeId: z.guid().optional(),
  avoidTitles: z.array(avoidTitleSchema).max(suggestInputLimits.maxAvoidTitles).default([]),
});
export type SuggestRequest = z.infer<typeof suggestRequestSchema>;

/**
 * The answer: one to three drafts with `sourceKind: "ai"`, each with the names
 * of the catalog ingredients its lines are matched to (as for an import).
 * Fewer than three when a draft did not pass recipeDraftSchema. Nothing is
 * saved. `siteId` is the place whose pantry the dishes were suggested from
 * (AD-24), so the library can hide them once it shows another place; `null`
 * for a user without places (and from a server before Story 8.3).
 */
export const dishSuggestionsSchema = z.object({
  suggestions: z
    .array(
      recipeImportSchema.extend({
        /** Story 9.5: the labels of the offers the dish uses (not saved with the recipe). */
        onOffer: z.array(z.string()).default([]),
        /** Story 9.5: how many of the dish's ingredients are at home, or `null` (pantry suggestions). */
        atHome: z.object({ have: z.number().int().min(0), total: z.number().int().min(0) }).nullable().default(null),
      }),
    )
    .min(1)
    .max(3),
  mode: z.enum(["pantry", "offers"]).default("pantry"),
  siteId: z.uuid().nullable().default(null),
  /** Story 9.14: the short name of the store the offers are from, when Pontus picked one of several; else `null`. */
  storeName: z.string().max(40).nullable().default(null),
});
export type DishSuggestions = z.infer<typeof dishSuggestionsSchema>;
type DishSuggestionOut = DishSuggestions["suggestions"][number];
/** A suggestion as the UI holds it: `onOffer` and `atHome` may be left out (none). */
export type DishSuggestion = Omit<DishSuggestionOut, "onOffer" | "atHome"> & Partial<Pick<DishSuggestionOut, "onOffer" | "atHome">>;

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
 * empty pantry's ("Lagret är tomt. …", shown with "Öppna Lagersaldo"), otherwise
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
 * answered badly, a read failed, the request was refused (`validation`), or
 * the job never got to start or was lost (Story 12.4).
 */
export const suggestRetryCodes: ReadonlySet<AppError["code"]> = new Set([
  "validation",
  "ai_unavailable",
  "ai_invalid",
  "ai_rejected",
  // Story 12.4: the job did not get to start in time, or was lost with its function.
  "ai_queue_timeout",
  "ai_job_lost",
  "pantry_unavailable",
  "catalog_unavailable",
]);
