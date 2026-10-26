import "server-only";
import { requireUser } from "@/features/auth/server";
import type { IngredientMatch, Location } from "@/features/catalog";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getAiService, minLoopRepeats, type ImageInput } from "@/server/ai";
import { PantryDataError } from "../data/client";
import { readingLabel, readingSchema } from "../domain/photo-numbers";
import { finishRun, startRun } from "./ai-runs";
import { listPantryIn } from "../data/queries";
import { loadPantrySitesIn } from "../data/sites";
import type { PantrySite, PhotoSite } from "../domain/site";
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
 * The items in `location` of the place `siteId` for "I kylen nu", or `null`
 * (logged as `pantry_unavailable`) when they cannot be read: the analysis
 * goes on without them. Without `siteId` (a user without places) the
 * selected place, which is empty then.
 */
async function readPlace(location: Location, siteId: string | undefined): Promise<PantryItem[] | null> {
  try {
    return await listPantryIn(await createClient(), location, getIngredientNames, siteId);
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
  /**
   * Story 8.4: the place (pantry_site) Hemma showed when the photo was taken,
   * checked as a uuid by the Route Handler. Missing only from a client of
   * version 1.0 during a deploy (AD-5): the selected place.
   */
  siteId?: string;
};

/** The place a photo is of, as the answer gives it, or why there is none to analyse for. */
type SiteLookup = { ok: true; site: PhotoSite | null } | { ok: false; result: Result<never> };

/**
 * Story 8.4: the place `siteId` among the user's places, or the selected one
 * without `siteId`; read before the AI is asked, since a photo of a place
 * that is gone cannot be saved anyway. A place that is not the user's (gone,
 * or another user's) is `pantry_site_gone`, and places that cannot be read
 * `pantry_unavailable`, whatever the error (logged with the reason only,
 * never a name), so the route never answers an unstructured 500. Only a user
 * without places has none (`site: null`); a user with places but none
 * selected is `pantry_site_gone`, never `site: null`, so nothing from the
 * photo can fall back to whatever is selected later.
 */
async function lookUpSite(siteId: string | undefined): Promise<SiteLookup> {
  let sites: PantrySite[];
  try {
    sites = await loadPantrySitesIn(await createClient());
  } catch (error) {
    console.error("pantry_unavailable", {
      reason: error instanceof PantryDataError ? error.detail : error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, result: fail("pantry_unavailable") };
  }
  if (sites.length === 0) return { ok: true, site: null };
  const site = siteId === undefined ? sites.find((other) => other.isSelected) : sites.find((other) => other.id === siteId);
  if (site) return { ok: true, site: { id: site.id, name: site.name } };
  console.info("pantry_site_gone", { reason: siteId === undefined ? "no_selected_site" : "analyze" });
  return { ok: false, result: fail("pantry_site_gone") };
}

export type AnalyzePlaceOptions = {
  signal: AbortSignal;
  /** When the whole request must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
};

/**
 * Lagerförslag from a photo of a place. In order: the user (an analysis of
 * theirs still on its way is stopped), the place (Story 8.4: `siteId` among
 * the user's places, else the selected one; `pantry_site_gone` or
 * `pantry_unavailable` before the AI is asked, see lookUpSite), the AI
 * port's analyzeImage
 * (`validation`, `ai_unavailable`, `ai_rejected`, `ai_invalid`), the first
 * 40 items (the rest logged as a count), one matchIngredients call for them
 * and the matched names (`catalog_unavailable`), the items in the location
 * of that place for "I kylen nu" (a failed read is logged and leaves them out; skipped when the
 * deadline is near), toPantrySuggestions, pantrySuggestionSchema for each
 * suggestion, and compareWithPlace against the place's items (Story 6.4:
 * `inventory`, `unread` when they could not be read; incomplete also when
 * the AI repeated a label in a loop, Story 6.5). Items and suggestions
 * left out are counted in `dropped` and logged as counts. No item is fine:
 * an empty list. A request that goes away
 * is `ai_unavailable`, one stopped by a newer analysis of the same user is
 * `ai_superseded`, and nothing more is read. With less than minReadMs left
 * before the deadline, a read the answer needs is `ai_unavailable`. Never
 * writes (AD-2). Story 6.6: the answer has the items in reading order
 * (`reading`), and each suggestion the numbers of its items in it. Story
 * 8.4: the answer has the analysed place (`site`, id and name), which every
 * write from the suggestions sends; analyzeImage gets only the photo and the
 * location, never the place (AD-9).
 */
export async function analyzePlace(
  input: AnalyzePlaceInput,
  { signal, deadline }: AnalyzePlaceOptions,
): Promise<Result<AnalyzeResult>> {
  const user = await requireUser();
  if (!user.ok) return user;

  // An analysis always starts: it stops any run of the same user on its way
  // (ai-runs.ts), also when its place turns out to be gone.
  const own = startRun(user.data.id, "analyze");
  try {
    // Story 8.4: the place before the model, which may take 100 s for a photo that could not be saved.
    const looked = await lookUpSite(input.siteId);
    if (!looked.ok) return looked.result;
    if (signal.aborted) return stopped();
    if (own.signal.aborted) {
      console.info("analyze_superseded");
      return fail("ai_superseded");
    }
    const result = await analyze(input, looked.site, AbortSignal.any([signal, own.signal]), deadline);
    if (own.signal.aborted && !signal.aborted) {
      console.info("analyze_superseded");
      return fail("ai_superseded");
    }
    return result;
  } finally {
    finishRun(user.data.id, own);
  }
}

async function analyze(
  { image, location }: AnalyzePlaceInput,
  site: PhotoSite | null,
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
  if (timeLeft() >= minReadMs) current = await readPlace(location, site?.id);
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
  const reading = readingOf(items);
  // The schema the client checks: a comparison that would not pass (a row the
  // domain cannot read) is left out, never the whole answer, and the
  // suggestions are then outside any comparison.
  if (!placeInventorySchema.safeParse(compared.inventory).success) {
    console.error("analyze_inventory_invalid");
    return ok({
      site,
      location,
      suggestions: suggestions.map(withoutComparison),
      dropped,
      inventory: { kind: "unread" },
      ...reading,
    });
  }
  return ok({ site, location, suggestions: compared.suggestions, dropped, inventory: compared.inventory, ...reading });
}

/**
 * Story 6.6: the kept items (the first maxPantrySuggestions) in reading
 * order, also those left out of the suggestions, so a card's number
 * (itemNumbers) is its items' place in this list; the client sends it back
 * with the photo to /api/ai/locate. Checked with the client's schema: one that
 * would not pass is left out (logged as analyze_reading_invalid), never the
 * whole answer, and the cards then have no numbers.
 */
function readingOf(items: readonly { label: string }[]): { reading?: string[] } {
  const reading = readingSchema.safeParse(items.map((item) => readingLabel(item.label)));
  if (reading.success) return { reading: reading.data };
  console.error("analyze_reading_invalid");
  return {};
}

/** Counts only, never the items or their names. */
function logDropped(counts: { unmatched: number; unnamed: number; unusable: number; invalid: number }) {
  if (Object.values(counts).some((count) => count > 0)) console.info("analyze_items_dropped", counts);
}
