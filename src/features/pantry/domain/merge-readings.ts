import { roundSum } from "./pantry-item";
import { maxSuggestionAmount, maxSuggestionLabels, type AnalyzeResult, type PantrySuggestion } from "./pantry-suggestion";
import type { PhotoJobResult } from "./photo-job";
import { readingPlaceholder, type PhotoPoint } from "./photo-numbers";
import { sameStock, stockByIngredient, withoutComparison, type MissingItem, type PlaceInventory } from "./place-inventory";

// Kylfoto, flera foton: one reading of a place from several photos (the
// shelves and the door). Each photo is read as its own AI job, and its result
// compared with the place as usual; here the results become one review list:
// - the item numbers run on over the photos: photo 2's item 1 is the number
//   after photo 1's last, so each row and marker keeps one number, and
//   `photoOf` says which photo a number is on;
// - the same catalog ingredient, or the same name for a new one, in the same
//   unit is one row, with the amounts summed (one ingredient in two units is
//   two rows, as from one photo), its labels, item numbers and "osäker";
// - an existing ingredient's "Nytt"/"Ändrat"/"oförändrat" is decided again
//   from the summed amounts against what the place has (`current`), and
//   what it replaces is what every photo's own comparison left to replace;
// - "Syns inte längre" is only what no photo shows: the items missing from
//   every photo's comparison.
// Pure, so it is tested without a model or a database.

/** One photo of a reading: its job's result. */
export type ReadingPart = Pick<PhotoJobResult, "site" | "location" | "suggestions" | "dropped" | "inventory" | "reading" | "points">;

/** The item numbers of a photo in the merged reading, first to last (both included; `last` < `first` when it has none). */
export type PhotoRange = { first: number; last: number };

export type MergedReading = {
  /** The one review list, as one photo's result. */
  result: AnalyzeResult;
  /** The points by merged item number. */
  points: ReadonlyMap<number, PhotoPoint>;
  /** Per photo, in order, its item numbers. */
  ranges: PhotoRange[];
};

/** A name as two rows are told apart by: trimmed, one space, lower case. */
const nameKey = (name: string) => name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/** The index of the photo whose item numbers hold `n`, or -1. */
export function photoOf(n: number, ranges: readonly PhotoRange[]): number {
  return ranges.findIndex((range) => n >= range.first && n <= range.last);
}

/** The rows that two photos' comparisons both left to replace (each photo replaces the place's rows in units it lacks). */
function intersect(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b);
  return a.filter((id) => other.has(id));
}

/** Merges `next` into `row`: the amounts summed (the same unit), labels, item numbers and "osäker" together. */
function addTo(row: PantrySuggestion, next: PantrySuggestion): PantrySuggestion {
  const labels = [...new Set([...(row.labels ?? []), ...(next.labels ?? [])])].slice(0, maxSuggestionLabels);
  const itemNumbers = [...(row.itemNumbers ?? []), ...(next.itemNumbers ?? [])];
  const amount = row.amount === null || next.amount === null ? null : Math.min(roundSum(row.amount + next.amount), maxSuggestionAmount);
  const merged: PantrySuggestion = {
    ...row,
    amount,
    unit: amount === null ? null : row.unit,
    current: row.current ?? next.current,
    ...(labels.length > 0 ? { labels } : {}),
    ...(itemNumbers.length > 0 ? { itemNumbers } : {}),
  };
  if (row.uncertain || next.uncertain) merged.uncertain = true;
  return merged;
}

/**
 * The results of the photos of one reading, in the order they were taken,
 * as one review list (see the top of this file). One photo is returned as
 * it is, with its points and range.
 */
export function mergeReadings(parts: readonly ReadingPart[]): MergedReading {
  const points = new Map<number, PhotoPoint>();
  const ranges: PhotoRange[] = [];
  const reading: string[] = [];
  /** Rows by key (ingredient or name, and unit), in the order they first came. */
  const rows = new Map<string, PantrySuggestion>();
  /** Per ingredient id, what the photos that have it left to replace. */
  const replaces = new Map<string, string[]>();
  const nameToKey = new Map<string, string>();
  let missing: MissingItem[] | null = null;
  const kinds = new Set<PlaceInventory["kind"]>();
  let incomplete = false;
  let changed = false;
  let dropped = 0;

  parts.forEach((part, index) => {
    const offset = reading.length;
    const count = part.reading?.length ?? 0;
    ranges.push({ first: offset + 1, last: offset + count });
    reading.push(...(part.reading ?? []));
    if (part.points && typeof part.points !== "string") {
      for (const point of part.points.positions) {
        // As pointsByNumber: the first point per number, none beyond the reading or for a placeholder item.
        const label = part.reading?.[point.n - 1];
        if (label === undefined || label === readingPlaceholder || points.has(point.n + offset)) continue;
        points.set(point.n + offset, { ...point, n: point.n + offset });
      }
    }
    dropped += part.dropped;
    kinds.add(part.inventory.kind);
    if (part.inventory.kind === "compared") {
      incomplete ||= part.inventory.incomplete;
      const seenHere = new Set(part.inventory.missing.map((item) => item.ingredientId));
      // An item is missing only when no photo shows it.
      missing = missing === null ? [...part.inventory.missing] : missing.filter((item) => seenHere.has(item.ingredientId));
    } else if (part.inventory.kind === "unread" && part.inventory.changed) {
      changed = true;
    }

    const ofIngredient = new Map<string, string[]>();
    for (const suggestion of part.suggestions) {
      const own: PantrySuggestion = {
        ...suggestion,
        // Ids are unique within one photo's result; the photos after the first get their own.
        id: index === 0 ? suggestion.id : `${suggestion.id}.${index + 1}`,
        ...(suggestion.itemNumbers ? { itemNumbers: suggestion.itemNumbers.map((n) => n + offset) } : {}),
      };
      const name = nameKey(suggestion.name);
      const ingredientKey =
        suggestion.ingredient.kind === "existing"
          ? `id:${suggestion.ingredient.ingredientId}`
          : (nameToKey.get(name) ?? `name:${name}`);
      if (!nameToKey.has(name)) nameToKey.set(name, ingredientKey);
      const key = `${ingredientKey}|${suggestion.location}|${suggestion.unit ?? ""}`;
      const before = rows.get(key);
      rows.set(key, before ? addTo(before, own) : own);
      if (suggestion.ingredient.kind === "existing") {
        const id = suggestion.ingredient.ingredientId;
        ofIngredient.set(id, [...(ofIngredient.get(id) ?? []), ...suggestion.replaces]);
      }
    }
    for (const [id, ids] of ofIngredient) {
      const before = replaces.get(id);
      replaces.set(id, before === undefined ? [...new Set(ids)] : intersect(before, ids));
    }
  });

  const [first] = parts;
  if (parts.length === 1) return { result: withoutPoints(first), points, ranges };
  const merged = [...rows.values()];
  let inventory: PlaceInventory;
  let suggestions: PantrySuggestion[];
  if (kinds.has("unread")) {
    inventory = changed ? { kind: "unread", changed: true } : { kind: "unread" };
    suggestions = merged.map(withoutComparison);
  } else if (kinds.has("compared")) {
    inventory = { kind: "compared", missing: missing ?? [], incomplete };
    suggestions = recompare(merged, first.location, replaces);
  } else {
    inventory = { kind: "empty" };
    suggestions = merged.map(withoutComparison);
  }
  return {
    result: { site: first.site, location: first.location, suggestions, dropped, inventory, reading },
    points,
    ranges,
  };
}

/** One photo's result without its points: the review's result. */
function withoutPoints({ site, location, suggestions, dropped, inventory, reading }: ReadingPart): AnalyzeResult {
  return { site, location, suggestions, dropped, inventory, ...(reading === undefined ? {} : { reading }) };
}

/**
 * The merged rows of a compared place, compared again as compareWithPlace
 * does, from what each row knows: an existing ingredient the place has
 * (`current`) is "oförändrat" when the summed amounts are what the place has
 * and no row of it is unsure, else "Ändrat", replacing what every photo left
 * to replace; any other row is "Nytt".
 */
function recompare(rows: readonly PantrySuggestion[], location: string, replaces: ReadonlyMap<string, string[]>): PantrySuggestion[] {
  const byIngredient = new Map<string, PantrySuggestion[]>();
  for (const row of rows) {
    if (row.location !== location || row.ingredient.kind !== "existing" || row.current === null) continue;
    const id = row.ingredient.ingredientId;
    byIngredient.set(id, [...(byIngredient.get(id) ?? []), row]);
  }
  const decided = new Map<string, { change: "changed" | "unchanged"; replaces: string[] }>();
  for (const [ingredientId, own] of byIngredient) {
    const place = own[0].current!;
    const unlimited = own.some((row) => row.amount === null || row.unit === null);
    const photo = stockByIngredient(
      own.map(({ amount, unit }) => (unlimited ? { ingredientId, amount: null, unit: null } : { ingredientId, amount, unit })),
    ).get(ingredientId)!;
    const same = sameStock(photo, place);
    const change = same && !own.some((row) => row.uncertain) ? "unchanged" : "changed";
    decided.set(ingredientId, { change, replaces: change === "changed" && !same ? (replaces.get(ingredientId) ?? []) : [] });
  }
  return rows.map((row): PantrySuggestion => {
    const own = row.ingredient.kind === "existing" && row.location === location ? decided.get(row.ingredient.ingredientId) : undefined;
    if (!own) return { ...withoutComparison(row), change: "new" };
    return { ...row, ...own };
  });
}
