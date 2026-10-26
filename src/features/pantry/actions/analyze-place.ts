import "server-only";
import { requireUser } from "@/features/auth/server";
import type { IngredientMatch, Location } from "@/features/catalog";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getAiService, minLoopRepeats, type ImageInput } from "@/server/ai";
import { PantryDataError } from "../data/client";
import { listPantryIn } from "../data/queries";
import { compareWithPlace, placeInventorySchema, withoutComparison } from "../domain/place-inventory";
import type { PantryItem } from "../domain/pantry-item";
import {
  maxPantrySuggestions,
  pantrySuggestionSchema,
  toPantrySuggestions,
  type AnalyzeResult,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";

// The server side of "Fotografera kylen" (FR-24, AD-1, AD-2, AD-6, AD-9,
// AD-15). Not a Server Action: the Route Handler /api/ai/analyze calls it
// with the request's signal, so "Avbryt" in the client stops the model. It
// never writes: the suggestions live in the client until Pontus confirms
// them (Story 6.2), which is also when new catalog ingredients are created.
// The photo is only passed on to the AI port; it is never stored or logged,
// and neither are the items or names. Only codes, reasons and counts are
// logged.

/** Time kept for the reads after the model, so the whole request fits its deadline. */
export const postModelMarginMs = 5_000;

/** Less time than this left before the deadline: a read after the model is not started. */
export const minReadMs = 2_000;

/**
 * The analysis on its way per user, in this server process only (a second
 * server instance has its own): a new photo stops the one before, which then
 * answers `ai_superseded`, so one person never keeps the local model busy
 * twice (a second tab, a double tap that got past the client).
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
 * The place's items for "I kylen nu", or `null` (logged as
 * `pantry_unavailable`) when they cannot be read: the analysis goes on
 * without them.
 */
async function readPlace(location: Location): Promise<PantryItem[] | null> {
  try {
    return await listPantryIn(await createClient(), location, getIngredientNames);
  } catch (error) {
    if (error instanceof PantryDataError) {
      console.error("pantry_unavailable", { reason: error.detail });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_unavailable", { reason: `catalog_${error.code}` });
    } else {
      throw error;
    }
    return null;
  }
}

/** The request went away ("Avbryt", a newer photo): nobody reads the answer, so nothing more is done. */
function stopped() {
  console.info("analyze_aborted");
  return fail("ai_unavailable");
}

/** Too little time is left before the deadline for a read the answer needs. */
function outOfTime() {
  console.error("ai_unavailable", { reason: "deadline" });
  return fail("ai_unavailable");
}

export type AnalyzePlaceInput = {
  /** The photo, resized in the client and checked by the Route Handler (AD-15). */
  image: ImageInput;
  /** The place the photo shows; every suggestion gets it. */
  location: Location;
};

export type AnalyzePlaceOptions = {
  signal: AbortSignal;
  /** When the whole request must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
};

/**
 * Lagerförslag from a photo of a place. In order: the user (an analysis of
 * theirs still on its way is stopped), the AI port's analyzeImage
 * (`validation`, `ai_unavailable`, `ai_rejected`, `ai_invalid`), the first
 * 40 items (the rest logged as a count), one matchIngredients call for them
 * and the matched names (`catalog_unavailable`), the place's items for "I
 * kylen nu" (a failed read is logged and leaves them out; skipped when the
 * deadline is near), toPantrySuggestions, pantrySuggestionSchema for each
 * suggestion, and compareWithPlace against the place's items (Story 6.4:
 * `inventory`, `unread` when they could not be read; incomplete also when
 * the AI repeated a label in a loop, Story 6.5). Items and suggestions
 * left out are counted in `dropped` and logged as counts. No item is fine:
 * an empty list. A request that goes away
 * is `ai_unavailable`, one stopped by a newer analysis of the same user is
 * `ai_superseded`, and nothing more is read. With less than minReadMs left
 * before the deadline, a read the answer needs is `ai_unavailable`. Never
 * writes (AD-2).
 */
export async function analyzePlace(
  input: AnalyzePlaceInput,
  { signal, deadline }: AnalyzePlaceOptions,
): Promise<Result<AnalyzeResult>> {
  const user = await requireUser();
  if (!user.ok) return user;

  runs.get(user.data.id)?.abort();
  const own = new AbortController();
  runs.set(user.data.id, own);
  try {
    const result = await analyze(input, AbortSignal.any([signal, own.signal]), deadline);
    if (own.signal.aborted && !signal.aborted) {
      console.info("analyze_superseded");
      return fail("ai_superseded");
    }
    return result;
  } finally {
    if (runs.get(user.data.id) === own) runs.delete(user.data.id);
  }
}

async function analyze(
  { image, location }: AnalyzePlaceInput,
  signal: AbortSignal,
  deadline: number | undefined,
): Promise<Result<AnalyzeResult>> {
  const analyzed = await getAiService().analyzeImage({ image, place: location }, signal, {
    deadline: deadline === undefined ? undefined : deadline - postModelMarginMs,
  });
  if (!analyzed.ok) return analyzed;
  if (signal.aborted) return stopped();

  const { invalid, repeated } = analyzed.data;
  const items = analyzed.data.items.slice(0, maxPantrySuggestions);
  const trimmed = analyzed.data.items.length - items.length;
  if (trimmed > 0) console.info("analyze_items_trimmed", { dropped: trimmed });
  if (repeated > 0) console.info("analyze_items_repeated", { count: repeated });
  const timeLeft = () => (deadline === undefined ? Infinity : deadline - Date.now());
  // No item: nothing to match, but the place is still compared (everything there is "Syns inte längre").
  let matched: IngredientMatch[] = [];
  let names: Record<string, string> = {};
  if (items.length > 0) {
    if (timeLeft() < minReadMs) return outOfTime();
    const matches = await fromCatalog(() => matchIngredients(items.map((item) => ({ text: item.label, hint: item.hint }))));
    if (!matches.ok) return matches;
    if (signal.aborted) return stopped();
    matched = matches.data;
  }

  const ids = [...new Set(matched.flatMap((match: IngredientMatch) => (match.kind === "match" ? [match.ingredientId] : [])))];
  if (ids.length > 0) {
    if (timeLeft() < minReadMs) return outOfTime();
    const found = await fromCatalog(() => getIngredientNames(ids));
    if (!found.ok) return found;
    if (signal.aborted) return stopped();
    names = found.data;
  }

  // "I kylen nu" is extra: near the deadline the suggestions come without it.
  let current: PantryItem[] | null = null;
  if (timeLeft() >= minReadMs) current = await readPlace(location);
  else console.info("analyze_place_skipped", { reason: "deadline" });

  const built = toPantrySuggestions(items, matched, { location, names, current });
  logDropped({ ...built.dropped, invalid });
  // The schema the client checks, per suggestion: one that would not pass is left out, never the whole answer.
  const suggestions = built.suggestions.filter(
    (suggestion: PantrySuggestion) => pantrySuggestionSchema.safeParse(suggestion).success,
  );
  const outputInvalid = built.suggestions.length - suggestions.length;
  if (outputInvalid > 0) console.error("analyze_output_invalid", { count: outputInvalid });
  const { unmatched, unnamed, unusable } = built.dropped;
  const dropped = invalid + unmatched + unnamed + unusable + outputInvalid;
  // Story 6.4: the suggestions against the place's rows. An ingredient the AI
  // named is never "Syns inte längre", also when its suggestion was left out
  // or the AI was unsure of it (Story 6.5); items that could not be read or
  // were cut (and new catalog ingredients, in compareWithPlace) make the
  // comparison incomplete, and so does a repetition loop (Story 6.5): a model
  // that repeats itself may have stopped looking at the rest of the photo. A
  // single duplicate is only merged.
  const compared = compareWithPlace(suggestions, current, {
    location,
    seenIngredientIds: new Set(ids),
    incomplete: dropped > 0 || trimmed > 0 || repeated >= minLoopRepeats,
  });
  // The schema the client checks: a comparison that would not pass (a row the
  // domain cannot read) is left out, never the whole answer, and the
  // suggestions are then outside any comparison.
  if (!placeInventorySchema.safeParse(compared.inventory).success) {
    console.error("analyze_inventory_invalid");
    return ok({ location, suggestions: suggestions.map(withoutComparison), dropped, inventory: { kind: "unread" } });
  }
  return ok({ location, suggestions: compared.suggestions, dropped, inventory: compared.inventory });
}

/** Counts only, never the items or their names. */
function logDropped(counts: { unmatched: number; unnamed: number; unusable: number; invalid: number }) {
  if (Object.values(counts).some((count) => count > 0)) console.info("analyze_items_dropped", counts);
}
