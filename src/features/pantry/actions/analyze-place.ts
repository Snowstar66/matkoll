import "server-only";
import type { IngredientMatch, Location } from "@/features/catalog";
import { CatalogDataError, getIngredientNames, getIngredientSummaries, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getAiService, minLoopRepeats, type ImageInput } from "@/server/ai";
import { PantryDataError } from "../data/client";
import { readingLabel, readingSchema } from "../domain/photo-numbers";
import { listPantryIn } from "../data/queries";
import { loadPantrySitesIn } from "../data/sites";
import type { PantrySite, PhotoSite } from "../domain/site";
import { compareWithPlace, placeInventorySchema, stockByIngredient, withoutComparison } from "../domain/place-inventory";
import type { PhotoJobResult, StoredReading } from "../domain/photo-job";
import type { PantryItem } from "../domain/pantry-item";
import {
  maxPantrySuggestions,
  pantrySuggestionSchema,
  toPantrySuggestions,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";

// The server side of "Fotografera kylen" (FR-24, AD-1, AD-2, AD-6, AD-9,
// AD-15), as the first step of a photo's AI job (Story 12.5, AD-28): the
// Route Handler /api/ai/jobs/photo calls readPhoto in the job's background
// with the job's signal, so "Avbryt" and a newer photo of the same place stop
// the model. It never writes: the suggestions live in the job's result and
// then in the client until Pontus confirms them (Story 6.2), which is also
// when new catalog ingredients are created. The photo is only passed on to the
// AI port; it is never stored or logged, and neither are the items or names.
// Only codes, reasons and counts are logged.

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
    return await listPantryIn(await createClient(), location, getIngredientSummaries, siteId);
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

/** The place a photo is of, as the answer gives it, or why there is none to analyse for. */
export type SiteLookup = { ok: true; site: PhotoSite | null } | { ok: false; result: Result<never> };

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
export async function lookUpSite(siteId: string | undefined): Promise<SiteLookup> {
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


export type ReadPhotoInput = {
  /** The photo, resized in the client and checked by the Route Handler (AD-15). */
  image: ImageInput;
  /** The place the photo shows; every suggestion gets it. */
  location: Location;
  /** The place (pantry_site) the photo was taken for, as lookUpSite found it; `null` for a user without places. */
  site: PhotoSite | null;
};

export type ReadPhotoOptions = {
  /** The job's signal: the job was cancelled or replaced. */
  signal: AbortSignal;
  /** When the job must be done (Date.now() milliseconds); the model gets the time left but postModelMarginMs. */
  deadline?: number;
};

/**
 * The first step of a photo's job (Story 12.5): the reading. In order: the
 * AI port's analyzeImage (`validation`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`), the first 25 items (the rest logged as a count), one
 * matchIngredients call for them and the matched names
 * (`catalog_unavailable`), the items in the location of the place (a failed
 * read is logged and leaves them out; skipped when the deadline is near, for
 * "I kylen nu" in the amounts), toPantrySuggestions, and
 * pantrySuggestionSchema for each suggestion. Items and suggestions left out
 * are counted in `dropped` and logged as counts. The result is kept by the
 * job: the suggestions outside any comparison, the ingredients the AI named
 * and whether the comparison is incomplete (dropped or cut items, or a
 * repetition loop, Story 6.5); compareStoredReading makes the comparison
 * when the result is fetched. `ai_unavailable` when the job is stopped, or
 * with less than minReadMs left before the deadline for a read it needs.
 * Never writes the pantry (AD-2). Only counts are logged, never items or
 * names; analyzeImage gets only the photo and the location (AD-9).
 */
export async function readPhoto(
  { image, location, site }: ReadPhotoInput,
  { signal, deadline }: ReadPhotoOptions,
): Promise<Result<StoredReading>> {
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
  return ok({
    site,
    location,
    suggestions: suggestions.map(withoutComparison),
    dropped,
    seen: ids,
    // Items that could not be read or were cut make the comparison incomplete, and so does a repetition loop (Story 6.5).
    incomplete: dropped > 0 || trimmed > 0 || repeated >= minLoopRepeats,
    ...readingOf(items),
    points: null,
  });
}

/**
 * The reading of a photo's job as the client shows it (Story 6.4, 12.5): the
 * suggestions against the place's items as they are now, so "Nytt",
 * "Ändrat" and "Syns inte längre" are true when Pontus opens the result, also
 * when it waited for minutes. `inventory` is `unread` when the items cannot
 * be read. The stored reading is never changed. A comparison that would not
 * pass the client's schema is left out, never the whole answer.
 */
export async function compareStoredReading(stored: StoredReading): Promise<PhotoJobResult> {
  const { site, location, suggestions, dropped, seen, incomplete, reading, points } = stored;
  const current = await readPlace(location, site?.id);
  const compared = compareWithPlace(suggestions, current, {
    location,
    seenIngredientIds: new Set(seen),
    incomplete,
  });
  // "Nu: …" on a card is the place as it is now, not as it was when the photo was read.
  const stocks = current ? stockByIngredient(current.filter((row) => row.location === location)) : null;
  const live = compared.suggestions.map(
    (suggestion): PantrySuggestion =>
      stocks && suggestion.location === location && suggestion.ingredient.kind === "existing"
        ? { ...suggestion, current: stocks.get(suggestion.ingredient.ingredientId) ?? null }
        : suggestion,
  );
  const base = { site, location, dropped, ...(reading === undefined ? {} : { reading }), points };
  if (!placeInventorySchema.safeParse(compared.inventory).success) {
    console.error("analyze_inventory_invalid");
    return { ...base, suggestions: suggestions.map(withoutComparison), inventory: { kind: "unread" } };
  }
  return { ...base, suggestions: live, inventory: compared.inventory };
}

/**
 * Story 6.6: the kept items (the first maxPantrySuggestions) in reading
 * order, also those left out of the suggestions, so a card's number
 * (itemNumbers) is its items' place in this list; the job sends it to the
 * numbers step with the photo (locatePlaceItems). Checked with the client's schema: one that
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
