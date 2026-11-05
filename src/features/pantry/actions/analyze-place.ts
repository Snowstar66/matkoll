import "server-only";
import { getAiServiceForUser } from "@/features/settings/server";
import type { IngredientMatch, Location } from "@/features/catalog";
import { CatalogDataError, getIngredientNames, getIngredientSummaries, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { minLoopRepeats, type AnalyzeImageResult, type ImageInput, type PhotoItem } from "@/server/ai";
import { PantryDataError } from "../data/client";
import { locateResultSchema, readingLabel, readingSchema } from "../domain/photo-numbers";
import { listPantryIn } from "../data/queries";
import { loadPantrySitesIn } from "../data/sites";
import type { PantrySite, PhotoSite } from "../domain/site";
import { compareWithPlace, placeInventorySchema, stockByIngredient, withoutComparison } from "../domain/place-inventory";
import type { PhotoJobResult, PhotoPoints, StoredReading } from "../domain/photo-job";
import type { PantryItem } from "../domain/pantry-item";
import {
  maxPantrySuggestions,
  pantrySuggestionSchema,
  toPantrySuggestions,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";

// The server side of "Fotografera kylen" (FR-24, AD-1, AD-2, AD-6, AD-9,
// AD-15), as the photo's AI job (Story 12.5, AD-28): the
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
  /** Kylfoto A: filled in with how long the steps took, for the caller's analyze_timing log. */
  timings?: ReadPhotoTimings;
  /**
   * Kylfoto C: the reading as far as it has come, while the model is still
   * writing (about once a second, never after the model has answered or the
   * job is stopped), so the rows and their numbers can show up one by one.
   * Only with a model that streams; the end is still the returned result.
   * Never fails.
   */
  report?: (partial: StoredReading) => Promise<void>;
  /** Kylfoto C: the least time between two reports, in milliseconds; a second without it. */
  reportEveryMs?: number;
};

/** Kylfoto A: milliseconds per step of readPhoto; a step that was not reached is left out. */
export type ReadPhotoTimings = {
  /** The AI port's analyzeImage, with its new attempts. */
  modelMs?: number;
  /** From the model's answer to the reading: the matching, the names and the wait for the place; only for a reading. */
  postMs?: number;
};

/**
 * A photo's job (Story 12.5): the reading, and since Kylfoto B the points
 * on the photo from the same answer (pointsOf). In order: the AI port's
 * analyzeImage (`validation`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`), the first 25 items (the rest logged as a count), one
 * matchIngredients call for them and the matched names
 * (`catalog_unavailable`), the items in the location of the place (read
 * while the model works, Kylfoto A; a failed read is logged and leaves them
 * out; not waited for when the deadline is near, for "I kylen nu" in the
 * amounts), toPantrySuggestions, and
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
  { signal, deadline, timings = {}, report, reportEveryMs = reportIntervalMs }: ReadPhotoOptions,
): Promise<Result<StoredReading>> {
  const timeLeft = () => (deadline === undefined ? Infinity : deadline - Date.now());
  // Kylfoto A: "I kylen nu" is read while the model works, not after it. A read that is not
  // waited for (the model failed, the job stopped) is let go; its errors are handled where it is awaited.
  const placeRead = timeLeft() >= minReadMs ? readPlace(location, site?.id) : null;
  placeRead?.catch(() => {});

  const matching: Matching = { items: [], matched: [], names: {} };
  const streaming = report ? streamReports(report, reportEveryMs) : null;
  const service = await getAiServiceForUser();
  const modelStarted = performance.now();
  let analyzed: Result<AnalyzeImageResult>;
  try {
    analyzed = await service.analyzeImage({ image, place: location }, signal, {
      deadline: deadline === undefined ? undefined : deadline - postModelMarginMs,
      // Kylfoto C: the items read so far are matched against the catalog in a batch of their own, and reported.
      onItems: streaming
        ? (read) => {
            if (signal.aborted) return;
            streaming.offer(async () => {
              if (signal.aborted || timeLeft() < minReadMs + postModelMarginMs) return null;
              const kept = read.slice(0, maxPantrySuggestions);
              const matched = await matchMore(matching, kept, signal);
              if (!matched.ok) return null;
              let current: PantryItem[] | null = null;
              try {
                current = placeRead ? await placeRead : null;
              } catch {
                return null;
              }
              if (signal.aborted) return null;
              return buildReading({ site, location, items: kept, matching, current, invalid: 0, trimmed: 0, repeated: 0, final: false });
            });
          }
        : undefined,
    });
  } finally {
    // Nothing is reported after the model has answered or the job has stopped.
    await streaming?.close();
  }
  const postStarted = performance.now();
  timings.modelMs = Math.round(postStarted - modelStarted);
  if (!analyzed.ok) return analyzed;
  if (signal.aborted) return stopped();

  const { invalid, repeated } = analyzed.data;
  const items = analyzed.data.items.slice(0, maxPantrySuggestions);
  const trimmed = analyzed.data.items.length - items.length;
  if (trimmed > 0) console.info("analyze_items_trimmed", { dropped: trimmed });
  if (repeated > 0) console.info("analyze_items_repeated", { count: repeated });
  // No item: nothing to match, but the place is still compared (everything there is "Syns inte längre").
  // Items matched while the model wrote are not matched again (matchMore).
  if (items.length > 0 && timeLeft() < minReadMs) return outOfTime();
  const matches = await matchMore(matching, items, signal);
  if (!matches.ok) return matches.result;
  if (signal.aborted) return stopped();

  // "I kylen nu" is extra: near the deadline the suggestions come without it, and the read is not waited for.
  let current: PantryItem[] | null = null;
  if (placeRead && timeLeft() >= minReadMs) current = await placeRead;
  else console.info("analyze_place_skipped", { reason: "deadline" });

  const reading = buildReading({ site, location, items, matching, current, invalid, trimmed, repeated, final: true });
  timings.postMs = Math.round(performance.now() - postStarted);
  return ok(reading);
}

/** Kylfoto C: the least time between two reports of a reading in progress. */
export const reportIntervalMs = 1_000;

/** The items matched against the catalog so far, in the order of the model's items, and the names of the ingredients found. */
type Matching = { items: PhotoItem[]; matched: IngredientMatch[]; names: Record<string, string> };

type MatchResult = { ok: true } | { ok: false; result: Result<never> };

/**
 * Kylfoto C: matches the items of `items` that have not been matched yet
 * (the ones before them are the same as last time, so their matches are
 * kept) with one matchIngredients call for the new ones, and fetches the
 * names of the ingredients that are new. A batch per call, so what the model
 * has written is matched while it writes the rest. `matching` ends up
 * describing `items`. `catalog_unavailable` as a failed match (`ok: false`).
 */
async function matchMore(matching: Matching, items: readonly PhotoItem[], signal: AbortSignal): Promise<MatchResult> {
  let same = 0;
  while (
    same < items.length &&
    same < matching.items.length &&
    matching.items[same].label === items[same].label &&
    matching.items[same].hint.name === items[same].hint.name
  ) {
    same++;
  }
  const rest = items.slice(same);
  let added: IngredientMatch[] = [];
  if (rest.length > 0) {
    const matches = await fromCatalog(() => matchIngredients(rest.map((item) => ({ text: item.label, hint: item.hint }))));
    if (!matches.ok) return { ok: false, result: matches };
    added = matches.data;
  }
  // The request went away while the catalog was asked: no names are read for it.
  if (signal.aborted) return { ok: false, result: stopped() };
  const matched = [...matching.matched.slice(0, same), ...added];
  const ids = [
    ...new Set(
      matched.flatMap((match: IngredientMatch) =>
        match.kind === "match" && !(match.ingredientId in matching.names) ? [match.ingredientId] : [],
      ),
    ),
  ];
  let names = matching.names;
  if (ids.length > 0) {
    const found = await fromCatalog(() => getIngredientNames(ids));
    if (!found.ok) return { ok: false, result: found };
    names = { ...names, ...found.data };
  }
  matching.items = [...items];
  matching.matched = matched;
  matching.names = names;
  return { ok: true };
}

type BuildInput = {
  site: PhotoSite | null;
  location: Location;
  items: readonly PhotoItem[];
  matching: Matching;
  current: PantryItem[] | null;
  invalid: number;
  trimmed: number;
  repeated: number;
  /** The end of the reading: counts are logged. A reading in progress (Kylfoto C) logs nothing. */
  final: boolean;
};

/** The stored reading of the items: suggestions, the reading's labels and the points; counts logged only for the final one. */
function buildReading({ site, location, items, matching, current, invalid, trimmed, repeated, final }: BuildInput): StoredReading {
  const { matched, names } = matching;
  const ids = [...new Set(matched.flatMap((match: IngredientMatch) => (match.kind === "match" ? [match.ingredientId] : [])))];
  const built = toPantrySuggestions(items, matched, { location, names, current });
  if (final) logDropped({ ...built.dropped, invalid });
  // The schema the client checks, per suggestion: one that would not pass is left out, never the whole answer.
  const suggestions = built.suggestions.filter(
    (suggestion: PantrySuggestion) => pantrySuggestionSchema.safeParse(suggestion).success,
  );
  const outputInvalid = built.suggestions.length - suggestions.length;
  if (outputInvalid > 0 && final) console.error("analyze_output_invalid", { count: outputInvalid });
  const { unmatched, unnamed, unusable } = built.dropped;
  const dropped = invalid + unmatched + unnamed + unusable + outputInvalid;
  return {
    site,
    location,
    suggestions: suggestions.map(withoutComparison),
    dropped,
    seen: ids,
    // Items that could not be read or were cut make the comparison incomplete, and so does a repetition loop (Story 6.5).
    // A reading in progress is incomplete: the model has more to say.
    incomplete: !final || dropped > 0 || trimmed > 0 || repeated >= minLoopRepeats,
    ...readingOf(items, final),
    points: pointsOf(items, final),
    ...(final ? {} : { streaming: true as const }),
  };
}

/**
 * Kylfoto C: hands out the reports of a reading in progress, at most one
 * every `everyMs`, one at a time and always with the newest reading. `offer`
 * gets a function that builds the reading (or `null` when there is nothing
 * to report now); only the newest offer is built. `close` waits for a report
 * under way and drops what has not started, so nothing is reported after the
 * model has answered. A failed report never fails the job.
 */
function streamReports(report: (partial: StoredReading) => Promise<void>, everyMs: number) {
  let latest: (() => Promise<StoredReading | null>) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  let lastAt = 0;
  let closed = false;

  const send = () => {
    timer = null;
    const build = latest;
    latest = null;
    if (!build || closed) return;
    lastAt = Date.now();
    running = running.then(async () => {
      try {
        const reading = await build();
        if (reading && !closed) await report(reading);
      } catch {
        // A report that failed is the next one's to make up for.
      }
    });
  };

  return {
    offer(build: () => Promise<StoredReading | null>) {
      if (closed) return;
      latest = build;
      if (timer === null) timer = setTimeout(send, Math.max(0, lastAt + everyMs - Date.now()));
    },
    async close() {
      closed = true;
      latest = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      await running;
    },
  };
}

/**
 * Kylfoto B: the points of the kept items, which come with the reading, by
 * their number in it (item n is reading[n − 1]), as a numbers step gave them
 * before; items without a point are left out. Checked with the client's
 * schema: points that would not pass are `failed` (logged as
 * analyze_points_invalid), never the whole answer, and the cards then have no
 * numbers.
 */
function pointsOf(items: readonly { point: { x: number; y: number } | null }[], log = true): PhotoPoints {
  const positions = items.flatMap((item, index) => (item.point ? [{ n: index + 1, ...item.point }] : []));
  if (positions.length < items.length && log) console.info("analyze_points_missing", { count: items.length - positions.length });
  const points = locateResultSchema.safeParse({ positions });
  if (points.success) return points.data;
  if (log) console.error("analyze_points_invalid");
  return "failed";
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
 * (itemNumbers) is its items' place in this list, and the number of its
 * point (pointsOf). Checked with the client's schema: one that
 * would not pass is left out (logged as analyze_reading_invalid), never the
 * whole answer, and the cards then have no numbers.
 */
function readingOf(items: readonly { label: string }[], log = true): { reading?: string[] } {
  const reading = readingSchema.safeParse(items.map((item) => readingLabel(item.label)));
  if (reading.success) return { reading: reading.data };
  if (log) console.error("analyze_reading_invalid");
  return {};
}

/** Counts only, never the items or their names. */
function logDropped(counts: { unmatched: number; unnamed: number; unusable: number; invalid: number }) {
  if (Object.values(counts).some((count) => count > 0)) console.info("analyze_items_dropped", counts);
}
